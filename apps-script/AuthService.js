/**
 * e-MMS : Authentication & Account Binding Service
 * ---------------------------------------------------------------------------
 * รองรับ:
 *  - ตรวจสอบตัวตนจาก LINE LIFF (idToken หรือ lineUserId)
 *  - Auto-login หากเคยผูก line_user_id แล้ว
 *  - ผูกบัญชีครั้งแรกด้วย username / password (รหัสนักศึกษา / วดป.เกิด พ.ศ.)
 *  - ป้องกันการเดารหัสผ่านซ้ำ (Brute-force lock ตาม LOGIN_MAX_FAILS / LOGIN_LOCK_MINUTES)
 */

/**
 * ตรวจสอบ LINE Identity จาก payload ที่ส่งมาจากหน้าเว็บ LIFF
 * คืนค่า { lineUserId, displayName }
 */
function verifyLineIdentity_(payload) {
  var idToken = payload && payload.idToken ? String(payload.idToken).trim() : '';
  var fallbackLineUserId = payload && payload.lineUserId ? String(payload.lineUserId).trim() : '';
  var fallbackDisplayName = payload && payload.lineDisplayName ? String(payload.lineDisplayName).trim() : '';
  var channelId = getSecret_('LINE_LOGIN_CHANNEL_ID');

  // หากมี idToken และตั้งค่า LINE_LOGIN_CHANNEL_ID ไว้ ให้ตรวจสอบกับ LINE OAuth2 API โดยตรง
  if (idToken && channelId) {
    try {
      var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'post',
        payload: {
          id_token: idToken,
          client_id: channelId
        },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var data = JSON.parse(res.getContentText());
        if (data && data.sub) {
          return {
            lineUserId: String(data.sub),
            displayName: String(data.name || fallbackDisplayName || '')
          };
        }
      } else {
        Logger.log('LINE idToken verify non-200: ' + res.getContentText());
      }
    } catch (err) {
      Logger.log('LINE idToken verify error: ' + err);
    }
  }

  if (fallbackLineUserId && /^U[0-9a-fA-F]{32}$/.test(fallbackLineUserId)) {
    return {
      lineUserId: fallbackLineUserId,
      displayName: fallbackDisplayName
    };
  }

  throw new Error('ไม่สามารถยืนยันตัวตนจาก LINE ได้ กรุณาเปิดใช้งานผ่านแอป LINE');
}

/** แปลงแถว Master_Users เป็น Object สำหรับส่งให้ Frontend (ไม่ส่งรหัสผ่านกลับไป) */
function sanitizeUserObj_(userRow) {
  var depts = readTable_('Master_Departments').rows;
  var deptName = '';
  var divisionName = '';
  for (var i = 0; i < depts.length; i++) {
    if (String(depts[i].dept_id) === String(userRow.dept_id)) {
      deptName = String(depts[i].dept_name || '');
      divisionName = String(depts[i].division_name || '');
      break;
    }
  }
  return {
    user_id: String(userRow.user_id),
    user_username: String(userRow.user_username || ''),
    user_name: String(userRow.user_name || ''),
    user_phone: String(userRow.user_phone || ''),
    dept_id: String(userRow.dept_id || ''),
    dept_name: deptName,
    division_name: divisionName,
    user_role: String(userRow.user_role || 'user'),
    line_user_id: String(userRow.line_user_id || ''),
    line_display_name: String(userRow.line_display_name || ''),
    telegram_user_id: String(userRow.telegram_user_id || '')
  };
}

/** ค้นหาผู้ใช้ที่ Active จาก line_user_id */
function findActiveUserByLineId_(lineUserId) {
  if (!lineUserId) return null;
  var users = readTable_('Master_Users').rows;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var isActive = u.is_active !== false && String(u.is_active).toUpperCase() !== 'FALSE';
    if (isActive && String(u.line_user_id).trim() === String(lineUserId).trim()) {
      return u;
    }
  }
  return null;
}

/** ตรวจสอบผู้ใช้จาก Request ของหน้า LIFF (โยน Error หากยังไม่ผูกบัญชี) */
function requireAuthenticatedUser_(payload, allowedRoles) {
  var identity = verifyLineIdentity_(payload);
  var userRow = findActiveUserByLineId_(identity.lineUserId);
  if (!userRow) {
    throw new Error('UNAUTHORIZED_UNBOUND');
  }
  if (allowedRoles && allowedRoles.length > 0) {
    var role = String(userRow.user_role || 'user');
    if (allowedRoles.indexOf(role) === -1) {
      throw new Error('ไม่มีสิทธิ์เข้าถึงส่วนนี้ (ต้องการสิทธิ์: ' + allowedRoles.join('/') + ')');
    }
  }
  return sanitizeUserObj_(userRow);
}

/**
 * API: ตรวจสอบ Session ปัจจุบันเมื่อเปิดหน้า LIFF
 * - หากผูก LINE แล้ว -> Auto-login ส่งข้อมูลผู้ใช้ + Master Data กลับทันที
 * - หากยังไม่ผูก -> ส่ง bound: false เพื่อให้หน้าเว็บแสดงฟอร์ม Login
 */
function apiGetSession_(payload) {
  var identity = verifyLineIdentity_(payload);
  var userRow = findActiveUserByLineId_(identity.lineUserId);

  if (!userRow) {
    return {
      bound: false,
      lineUserId: identity.lineUserId,
      lineDisplayName: identity.displayName,
      config: getPublicConfig_()
    };
  }

  return {
    bound: true,
    user: sanitizeUserObj_(userRow),
    master: getMasterBootstrap_(),
    config: getPublicConfig_()
  };
}

/** ตรวจสอบว่า LINE ID นี้พยายาม Login ผิดเกินกำหนดในช่วงเวลาหรือไม่ */
function checkLoginRateLimit_(lineUserId) {
  var maxFails = parseInt(getConfig_('LOGIN_MAX_FAILS', '5'), 10) || 5;
  var lockMins = parseInt(getConfig_('LOGIN_LOCK_MINUTES', '15'), 10) || 15;
  var cutoff = new Date(new Date().getTime() - lockMins * 60 * 1000);

  var audits = readTable_('Sys_AuditLogs').rows;
  var failCount = 0;
  for (var i = audits.length - 1; i >= 0; i--) {
    var a = audits[i];
    var dt = (a.created_at instanceof Date) ? a.created_at : new Date(a.created_at);
    if (isNaN(dt.getTime()) || dt < cutoff) break;
    if (String(a.detail || '').indexOf(lineUserId) !== -1) {
      if (a.action === 'LOGIN_SUCCESS') break;
      if (a.action === 'LOGIN_FAIL') failCount++;
    }
  }
  if (failCount >= maxFails) {
    throw new Error('คุณกรอกรหัสผ่านผิดเกิน ' + maxFails + ' ครั้ง กรุณารอ ' + lockMins + ' นาทีแล้วลองใหม่อีกครั้ง');
  }
}

/**
 * API: ผูกบัญชี LINE ครั้งแรกด้วย Username / Password
 */
function apiBindLineAccount_(payload) {
  var identity = verifyLineIdentity_(payload);
  var username = String(payload.username || '').trim();
  var password = String(payload.password || '').trim();

  if (!username || !password) {
    throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน');
  }

  checkLoginRateLimit_(identity.lineUserId);

  // เช็คว่า LINE นี้ผูกกับบัญชีอื่นอยู่แล้วหรือไม่
  var existingByLine = findActiveUserByLineId_(identity.lineUserId);
  if (existingByLine) {
    return {
      bound: true,
      user: sanitizeUserObj_(existingByLine),
      master: getMasterBootstrap_(),
      config: getPublicConfig_()
    };
  }

  var users = readTable_('Master_Users').rows;
  var matchedUser = null;

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var uName = String(u.user_username || '').trim();
    if (uName && uName.toLowerCase() === username.toLowerCase()) {
      matchedUser = u;
      break;
    }
  }

  if (!matchedUser || String(matchedUser.user_password || '').trim() !== password) {
    logAudit_('', 'LOGIN_FAIL', matchedUser ? String(matchedUser.user_id) : '', 'username=' + username + ' line=' + identity.lineUserId);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  var isActive = matchedUser.is_active !== false && String(matchedUser.is_active).toUpperCase() !== 'FALSE';
  if (!isActive) {
    throw new Error('บัญชีผู้ใช้นี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }

  var existingLineId = String(matchedUser.line_user_id || '').trim();
  if (existingLineId && existingLineId !== identity.lineUserId) {
    throw new Error('บัญชีผู้ใช้นี้ถูกผูกกับ LINE เครื่องอื่นแล้ว หากต้องการเปลี่ยนเครื่อง กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ต');
  }

  var now = new Date();
  var patch = {
    line_user_id: identity.lineUserId,
    line_display_name: identity.displayName || matchedUser.line_display_name || '',
    line_linked_at: now,
    updated_at: now
  };
  if (payload.phone && String(payload.phone).trim()) {
    patch.user_phone = String(payload.phone).trim();
  }

  updateRowById_('Master_Users', matchedUser.user_id, patch);

  logAudit_(matchedUser.user_id, 'LOGIN_SUCCESS', matchedUser.user_id, 'line=' + identity.lineUserId);
  logAudit_(matchedUser.user_id, 'LINK_LINE', matchedUser.user_id, 'displayName=' + (identity.displayName || ''));

  var updatedUserRow = findRowByCol_('Master_Users', 'user_id', matchedUser.user_id);
  return {
    bound: true,
    user: sanitizeUserObj_(updatedUserRow),
    master: getMasterBootstrap_(),
    config: getPublicConfig_()
  };
}

/**
 * API: อัปเดตเบอร์โทรศัพท์หรือ Telegram User ID ของตนเอง
 */
function apiUpdateMyProfile_(user, payload) {
  var patch = { updated_at: new Date() };
  if (typeof payload.user_phone !== 'undefined') {
    patch.user_phone = String(payload.user_phone || '').trim();
  }
  if (typeof payload.telegram_user_id !== 'undefined' && (user.user_role === 'technician' || user.user_role === 'admin')) {
    patch.telegram_user_id = String(payload.telegram_user_id || '').trim();
    logAudit_(user.user_id, 'LINK_TELEGRAM', user.user_id, 'telegram_user_id=' + patch.telegram_user_id);
  }
  updateRowById_('Master_Users', user.user_id, patch);
  var refreshed = findRowByCol_('Master_Users', 'user_id', user.user_id);
  return sanitizeUserObj_(refreshed);
}
