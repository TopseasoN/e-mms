/**
 * e-MMS : Main Entrypoint & API Router (doGet / doPost)
 * ---------------------------------------------------------------------------
 * รองรับ 3 ช่องทางใน URL เดียวกัน:
 *   1. LINE Messaging API Webhook (ตรวจจับจาก body.events)
 *   2. Telegram Bot Webhook (ตรวจจับจาก body.update_id)
 *   3. LIFF Web App API (ตรวจจับจาก body.action)
 */

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * GET Endpoint — ใช้ตรวจสอบสถานะระบบ (Health Check)
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : 'health';
    if (action === 'publicConfig') {
      return jsonResponse_({ ok: true, data: getPublicConfig_() });
    }
    if (action === 'syncFromSupabase') {
      return jsonResponse_(syncAllFromSupabase());
    }
    return jsonResponse_({
      ok: true,
      service: 'e-MMS API & Webhook',
      version: '1.1.0',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * POST Endpoint — Router หลักของระบบ
 */
function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseErr) {
      return jsonResponse_({ ok: false, error: 'Invalid JSON body' });
    }

    // 1. ตรวจจับ LINE Messaging API Webhook
    if (body && Array.isArray(body.events)) {
      var lineResult = handleLineWebhook_(body);
      return jsonResponse_(lineResult);
    }

    // 2. ตรวจจับ Telegram Bot Webhook
    if (body && typeof body.update_id !== 'undefined') {
      var tgResult = handleTelegramWebhook_(body);
      return jsonResponse_(tgResult);
    }

    // 3. LIFF Frontend API Request
    var action = body && body.action ? String(body.action).trim() : '';
    if (!action) {
      return jsonResponse_({ ok: true, message: 'e-MMS Webhook Ready' });
    }

    var data = routeApiAction_(action, body);
    return jsonResponse_({ ok: true, data: data });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    Logger.log('doPost error: ' + msg);
    return jsonResponse_({
      ok: false,
      error: msg,
      code: msg === 'UNAUTHORIZED_UNBOUND' ? 'UNAUTHORIZED_UNBOUND' : 'ERROR'
    });
  }
}

/**
 * แยกเส้นทางคำสั่ง API จากหน้าเว็บ LIFF ตามสิทธิ์ผู้ใช้
 */
function routeApiAction_(action, payload) {
  switch (action) {
    // --- Public / Auth ---
    case 'getSession':
      return apiGetSession_(payload);

    case 'bindLine':
      return apiBindLineAccount_(payload);

    // --- ผู้ใช้งานทั่วไป (ทุก Role ที่ผูกบัญชีแล้ว) ---
    case 'updateProfile': {
      var u0 = requireAuthenticatedUser_(payload);
      return apiUpdateMyProfile_(u0, payload);
    }

    case 'checkDuplicate': {
      var u1 = requireAuthenticatedUser_(payload);
      return apiCheckDuplicate_(u1, payload);
    }

    case 'createTicket': {
      var u2 = requireAuthenticatedUser_(payload);
      return apiCreateTicket_(u2, payload);
    }

    case 'listMyTickets': {
      var u3 = requireAuthenticatedUser_(payload);
      return apiListMyTickets_(u3);
    }

    case 'getTicket': {
      var u4 = requireAuthenticatedUser_(payload);
      var t = getEnrichedTicketById_(payload.jtr_id);
      if (!t) throw new Error('ไม่พบใบงานที่ระบุ');
      if (u4.user_role === 'user' && t.requester_id !== u4.user_id) {
        throw new Error('คุณไม่มีสิทธิ์ดูใบงานของผู้อื่น');
      }
      return { ticket: t };
    }

    case 'cancelTicket': {
      var u5 = requireAuthenticatedUser_(payload);
      return apiCancelTicket_(u5, payload);
    }

    // --- ทีมช่าง และ Admin ---
    case 'listQueueTickets': {
      var tech1 = requireAuthenticatedUser_(payload, ['technician', 'admin']);
      return apiListQueueTickets_(tech1, payload);
    }

    case 'acceptTicket': {
      var tech2 = requireAuthenticatedUser_(payload, ['technician', 'admin']);
      return acceptTicketCore_(tech2, String(payload.jtr_id || '').trim(), 'LIFF');
    }

    case 'updateTicketStatus': {
      var tech3 = requireAuthenticatedUser_(payload, ['technician', 'admin']);
      return apiUpdateTicketStatus_(tech3, payload);
    }

    // --- เฉพาะ Admin ---
    case 'adminListUsers': {
      var adm1 = requireAuthenticatedUser_(payload, ['admin']);
      return apiAdminListUsers_(adm1);
    }

    case 'adminSaveUser': {
      var adm2 = requireAuthenticatedUser_(payload, ['admin']);
      return apiAdminSaveUser_(adm2, payload);
    }

    case 'adminResetLine': {
      var adm3 = requireAuthenticatedUser_(payload, ['admin']);
      return apiAdminResetLine_(adm3, payload);
    }

    case 'adminDashboard': {
      var adm4 = requireAuthenticatedUser_(payload, ['admin']);
      return apiAdminGetDashboard_(adm4, payload);
    }

    case 'adminSendPendingSummary': {
      requireAuthenticatedUser_(payload, ['admin']);
      sendDailyPendingSummary(null, true);
      return { sent: true };
    }

    case 'adminSyncSupabaseToSheets': {
      requireAuthenticatedUser_(payload, ['admin']);
      return syncAllFromSupabase();
    }

    default:
      throw new Error('ไม่รู้จักคำสั่ง API: ' + action);
  }
}

var DEFAULT_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk/exec';

/**
 * ฟังก์ชันตั้งค่าระบบเริ่มต้นครบวงจร (รันจากเมนูใน Apps Script ได้เลย):
 *  1. สร้าง/อัปเดตฐานข้อมูล 15 ชีต
 *  2. ตั้ง Time Trigger สรุปงานค้างทุกเช้า 08:00 น.
 *  3. ผูก Telegram Webhook เข้ากับ Web App URL อัตโนมัติ
 *  4. หากตั้งค่า SUPABASE_URL ไว้ จะเปิด Auto-Sync ทุก 1 ชม. ให้ทันที
 */
function initializeSystemAll() {
  var dbLog = setupDatabase();
  try {
    setupDailyTrigger();
    dbLog.push('✓ ตั้งเวลาสรุปงานค้างทุกเช้า (sendDailyPendingSummary) เรียบร้อย');
  } catch (e1) {
    dbLog.push('⚠️ setupDailyTrigger: ' + e1);
  }
  try {
    var tgRes = setupTelegramWebhook(DEFAULT_WEBAPP_URL);
    dbLog.push('✓ ผูก Telegram Webhook: ' + JSON.stringify(tgRes));
  } catch (e2) {
    dbLog.push('⚠️ setupTelegramWebhook: ' + e2);
  }
  try {
    var sbCreds = getSupabaseCredentials_();
    if (sbCreds.url && sbCreds.key) {
      setupSupabaseHourlySyncTrigger();
      syncAllFromSupabase();
      dbLog.push('✓ ตั้งเวลา Auto-Sync จาก Supabase ทุก 1 ชม. และซิงค์ข้อมูลครั้งแรกเรียบร้อย');
    }
  } catch (e3) {
    dbLog.push('⚠️ setupSupabaseHourlySyncTrigger: ' + e3);
  }
  Logger.log(dbLog.join('\n'));
  return dbLog;
}
