/**
 * e-MMS : Database & Utility Layer (Google Sheets + Drive + LockService)
 * ---------------------------------------------------------------------------
 */

var _REQ_CACHE = {
  ss: null,
  sheets: {},
  config: null
};

/** ดึง Spreadsheet ปัจจุบัน (Cache ต่อ 1 request) */
function getSs_() {
  if (!_REQ_CACHE.ss) {
    _REQ_CACHE.ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  return _REQ_CACHE.ss;
}

/** ดึง Sheet ตามชื่อ */
function getSheet_(name) {
  if (!_REQ_CACHE.sheets[name]) {
    var sheet = getSs_().getSheetByName(name);
    if (!sheet) throw new Error('ไม่พบชีต: ' + name + ' (กรุณารัน setupDatabase() ก่อน)');
    _REQ_CACHE.sheets[name] = sheet;
  }
  return _REQ_CACHE.sheets[name];
}

/** อ่านข้อมูลทั้งตารางเป็น Array ของ Object ตามชื่อคอลัมน์แถวที่ 1 */
function readTable_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headers: [], rows: [] };

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var rowArr = values[r];
    // ข้ามแถวที่คีย์หลัก (คอลัมน์ A) ว่างเปล่า
    if (rowArr[0] === '' || rowArr[0] === null || typeof rowArr[0] === 'undefined') continue;
    var obj = { _rowIndex: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowArr[c];
    }
    rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

/** ค้นหาแถวแรกที่ตรงเงื่อนไข */
function findRowByCol_(sheetName, colName, targetVal) {
  var table = readTable_(sheetName);
  var needle = String(targetVal == null ? '' : targetVal).trim();
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][colName] == null ? '' : table.rows[i][colName]).trim() === needle) {
      return table.rows[i];
    }
  }
  return null;
}

/** เพิ่ม 1 แถวต่อท้ายตารางจาก Object */
function appendRowObj_(sheetName, obj) {
  var sheet = getSheet_(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var nextRow = sheet.getLastRow() + 1;

  var rowValues = headers.map(function (h) {
    return typeof obj[h] !== 'undefined' ? obj[h] : '';
  });

  sheet.getRange(nextRow, 1, 1, headers.length).setValues([rowValues]);
  return nextRow;
}

/** อัปเดตแถวตามคีย์หลัก (คอลัมน์ A) ด้วย patchObj */
function updateRowById_(sheetName, idValue, patchObj) {
  var sheet = getSheet_(sheetName);
  var table = readTable_(sheetName);
  if (!table.headers.length) return false;
  var pkCol = table.headers[0];
  var target = null;

  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][pkCol]).trim() === String(idValue).trim()) {
      target = table.rows[i];
      break;
    }
  }
  if (!target) return false;

  var updatedArr = table.headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(patchObj, h) ? patchObj[h] : target[h];
  });
  sheet.getRange(target._rowIndex, 1, 1, table.headers.length).setValues([updatedArr]);
  return true;
}

/** ลบแถวทั้งหมดที่คอลัมน์ colName ตรงกับ targetVal (ใช้ตอนเขียนทับ Trans_Assignments ของใบงาน) */
function deleteRowsByCol_(sheetName, colName, targetVal) {
  var sheet = getSheet_(sheetName);
  var table = readTable_(sheetName);
  var needle = String(targetVal).trim();
  // ลบจากแถวล่างขึ้นบนเพื่อไม่ให้เลขแถวเลื่อน
  for (var i = table.rows.length - 1; i >= 0; i--) {
    if (String(table.rows[i][colName]).trim() === needle) {
      sheet.deleteRow(table.rows[i]._rowIndex);
    }
  }
}

/** ดึงค่าจาก Sys_Config ทั้งหมดเป็น Object */
function getConfigMap_() {
  if (!_REQ_CACHE.config) {
    var table = readTable_('Sys_Config');
    var map = {};
    table.rows.forEach(function (r) {
      map[String(r.config_key).trim()] = r.config_value !== null && typeof r.config_value !== 'undefined'
        ? String(r.config_value).trim()
        : '';
    });
    _REQ_CACHE.config = map;
  }
  return _REQ_CACHE.config;
}

function getConfig_(key, defaultValue) {
  var map = getConfigMap_();
  var val = map[key];
  return (val !== undefined && val !== '') ? val : (defaultValue !== undefined ? defaultValue : '');
}

function extractLiffId_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var m = s.match(/liff\.line\.me\/([0-9]+-[a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  return s.split(/[?#/]/)[0];
}

function getPublicConfig_() {
  return {
    SYSTEM_NAME: getConfig_('SYSTEM_NAME', 'e-MMS ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์'),
    ORG_NAME: getConfig_('ORG_NAME', 'สถาบันพัฒนาการชลประทาน'),
    LIFF_ID: extractLiffId_(getConfig_('LIFF_ID', '')),
    MAX_IMAGES_BEFORE: parseInt(getConfig_('MAX_IMAGES_BEFORE', '3'), 10) || 3,
    MAX_IMAGES_AFTER: parseInt(getConfig_('MAX_IMAGES_AFTER', '3'), 10) || 3,
    IMAGE_MAX_WIDTH: parseInt(getConfig_('IMAGE_MAX_WIDTH', '1280'), 10) || 1280,
    IMAGE_JPEG_QUALITY: parseFloat(getConfig_('IMAGE_JPEG_QUALITY', '0.7')) || 0.7,
    DUPLICATE_CHECK_ENABLED: String(getConfig_('DUPLICATE_CHECK_ENABLED', 'TRUE')).toUpperCase() === 'TRUE'
  };
}

/** ดึง Secret จาก Script Properties */
function getSecret_(key) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  return val ? String(val).trim() : '';
}

/**
 * ออกเลขรันนิ่งภายใต้ LockService ป้องกันเลขซ้ำเมื่อมีผู้ใช้กดพร้อมกัน
 * @param {string} counterKey เช่น 'JTR-6910', 'ASG', 'ATT', 'LOG', 'NTF', 'AUD', 'USER'
 * @param {number} padLen จำนวนหลัก เช่น 3 -> 001
 * @param {string} prefix คำนำหน้า เช่น 'JTR-6910-' หรือ 'ASG'
 */
function nextId_(counterKey, padLen, prefix) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_('Sys_Counters');
    var table = readTable_('Sys_Counters');
    var found = null;
    for (var i = 0; i < table.rows.length; i++) {
      if (String(table.rows[i].counter_key).trim() === counterKey) {
        found = table.rows[i];
        break;
      }
    }
    var nextVal = 1;
    var now = new Date();
    if (found) {
      nextVal = (parseInt(found.last_value, 10) || 0) + 1;
      sheet.getRange(found._rowIndex, 2, 1, 2).setValues([[nextVal, now]]);
    } else {
      appendRowObj_('Sys_Counters', {
        counter_key: counterKey,
        last_value: nextVal,
        updated_at: now
      });
    }
    return prefix + pad_(nextVal, padLen);
  } finally {
    lock.releaseLock();
  }
}

/** ออกรหัสใบงาน JTR-YYMM-NNN ตามปี พ.ศ. 2 หลัก */
function nextTicketId_(dateObj) {
  var d = dateObj || new Date();
  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
  var yearCE = parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10);
  var monthStr = Utilities.formatDate(d, tz, 'MM');
  var yyBE = String((yearCE + 543) % 100);
  if (yyBE.length < 2) yyBE = '0' + yyBE;

  var jtrPrefix = getConfig_('JTR_ID_PREFIX', 'JTR');
  var key = jtrPrefix + '-' + yyBE + monthStr;
  return nextId_(key, 3, key + '-');
}

/** แปลง Date เป็นข้อความภาษาไทย เช่น 30/10/2569 14:05 */
function formatThaiDateTime_(d) {
  if (!d) return '-';
  var dateObj = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return String(d);
  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
  var dd = Utilities.formatDate(dateObj, tz, 'dd');
  var mm = Utilities.formatDate(dateObj, tz, 'MM');
  var yyyyBE = parseInt(Utilities.formatDate(dateObj, tz, 'yyyy'), 10) + 543;
  var hhmm = Utilities.formatDate(dateObj, tz, 'HH:mm');
  return dd + '/' + mm + '/' + yyyyBE + ' ' + hhmm;
}

/** แปลง Date เป็น ISO string สำหรับส่งกลับ JSON */
function toIso_(d) {
  if (!d) return '';
  var dateObj = (d instanceof Date) ? d : new Date(d);
  return isNaN(dateObj.getTime()) ? String(d) : dateObj.toISOString();
}

/** บันทึก Audit Log */
function logAudit_(actorUserId, action, targetUserId, detail) {
  try {
    var auditId = nextId_('AUD', 6, 'AUD');
    appendRowObj_('Sys_AuditLogs', {
      audit_id: auditId,
      actor_user_id: actorUserId || '',
      action: action,
      target_user_id: targetUserId || '',
      detail: detail || '',
      created_at: new Date()
    });
  } catch (err) {
    Logger.log('logAudit_ error: ' + err);
  }
}

/** บันทึก Notification Log */
function logNotification_(jtrId, channel, event, target, result, errorMessage) {
  try {
    var notifId = nextId_('NTF', 6, 'NTF');
    appendRowObj_('Sys_NotificationLogs', {
      notif_id: notifId,
      jtr_id: jtrId || '',
      channel: channel,
      event: event || '',
      target: target || '',
      result: result,
      error_message: errorMessage || '',
      sent_at: new Date()
    });
  } catch (err) {
    Logger.log('logNotification_ error: ' + err);
  }
}

/** นับจำนวน LINE_PUSH ที่ส่งสำเร็จในเดือนปัจจุบัน (ไว้คุมโควต้า 300 ข้อความ/เดือน) */
function getMonthlyLinePushCount_(refDate) {
  var now = refDate || new Date();
  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
  var targetYm = Utilities.formatDate(now, tz, 'yyyy-MM');
  var logs = readTable_('Sys_NotificationLogs').rows;
  var count = 0;

  for (var i = 0; i < logs.length; i++) {
    var r = logs[i];
    if (r.channel === 'LINE_PUSH' && r.result === 'SENT' && r.sent_at) {
      var d = (r.sent_at instanceof Date) ? r.sent_at : new Date(r.sent_at);
      if (!isNaN(d.getTime()) && Utilities.formatDate(d, tz, 'yyyy-MM') === targetYm) {
        count++;
      }
    }
  }
  return count;
}

/**
 * สกัดเฉพาะรหัส Google Drive Folder/File ID ที่สะอาด
 * รองรับทั้งกรณีที่ผู้ใช้ใส่ลิงก์เต็ม https://drive.google.com/drive/folders/1VSmt...?lfhs=2
 * หรือใส่เฉพาะ ID ที่มี ?lfhs=2 ติดมา
 */
function extractDriveId_(rawInput) {
  var s = String(rawInput || '').trim();
  if (!s) return '';
  // ถอดจาก /folders/<ID> หรือ /d/<ID>
  var folderMatch = s.match(/\/(?:folders|d)\/([a-zA-Z0-9_-]{15,})/);
  if (folderMatch) return folderMatch[1];
  // ถอดจาก ?id=<ID>
  var idParamMatch = s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idParamMatch) return idParamMatch[1];
  // ตัด ?... หรือ /... ท้ายรหัสออก
  return s.split(/[?#/\s]/)[0];
}

/**
 * อัปโหลดรูปภาพ Base64 ลง Google Drive แยกโฟลเดอร์ตามปี พ.ศ.-เดือน (เช่น 2569-10)
 * คืนค่า { fileId, fileUrl } ที่แสดงใน LINE Flex Message และหน้าเว็บได้ทันที
 */
function uploadBase64ToDrive_(base64Input, fileName, dateObj) {
  var rawFolderCfg = getConfig_('DRIVE_ROOT_FOLDER_ID', '1VSmtUyahQ3XTytpap1IROfKO_jTTP-ez');
  var rootFolderId = extractDriveId_(rawFolderCfg) || '1VSmtUyahQ3XTytpap1IROfKO_jTTP-ez';
  var rootFolder = rootFolderId
    ? DriveApp.getFolderById(rootFolderId)
    : DriveApp.getRootFolder();

  var d = dateObj || new Date();
  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
  var yearBE = parseInt(Utilities.formatDate(d, tz, 'yyyy'), 10) + 543;
  var monthStr = Utilities.formatDate(d, tz, 'MM');
  var subFolderName = yearBE + '-' + monthStr;

  var subFolders = rootFolder.getFoldersByName(subFolderName);
  var targetFolder = subFolders.hasNext() ? subFolders.next() : rootFolder.createFolder(subFolderName);

  var mimeType = 'image/jpeg';
  var base64Data = String(base64Input || '');
  var match = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  }

  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = targetFolder.createFile(blob);

  // เปิดสิทธิ์ให้ทุกคนที่มีลิงก์ดูรูปได้ เพื่อให้ LINE Flex Message ดึงรูปไปแสดงได้
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('setSharing warning: ' + e);
  }

  var fileId = file.getId();
  var fileUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200';
  return {
    fileId: fileId,
    fileUrl: fileUrl
  };
}

/** ดึงข้อมูล Master ทั้งหมดที่เปิดใช้งาน (is_active = true) สำหรับส่งให้หน้าเว็บ LIFF */
function getMasterBootstrap_() {
  var depts = readTable_('Master_Departments').rows
    .filter(function (r) { return r.is_active !== false && String(r.is_active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); })
    .map(function (r) {
      return {
        dept_id: String(r.dept_id),
        dept_name: String(r.dept_name),
        division_name: String(r.division_name)
      };
    });

  var buildings = readTable_('Master_Buildings').rows
    .filter(function (r) { return r.is_active !== false && String(r.is_active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); })
    .map(function (r) {
      return {
        bld_id: String(r.bld_id),
        bld_name: String(r.bld_name)
      };
    });

  var locations = readTable_('Master_Locations').rows
    .filter(function (r) { return r.is_active !== false && String(r.is_active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); })
    .map(function (r) {
      return {
        loc_id: String(r.loc_id),
        bld_id: String(r.bld_id),
        loc_name: String(r.loc_name)
      };
    });

  // รวมห้องจาก Master_Rooms + ห้องที่เคยถูกแจ้งใน Trans_JobTickets เพื่อให้ Autocomplete ฉลาดขึ้น
  var roomSet = {};
  var rooms = [];
  readTable_('Master_Rooms').rows.forEach(function (r) {
    if (r.is_active === false || String(r.is_active).toUpperCase() === 'FALSE') return;
    var key = String(r.loc_id) + '|' + String(r.room_name).trim();
    if (!roomSet[key] && r.room_name) {
      roomSet[key] = true;
      rooms.push({ loc_id: String(r.loc_id), room_name: String(r.room_name).trim(), note: String(r.note || '') });
    }
  });
  readTable_('Trans_JobTickets').rows.forEach(function (t) {
    var rm = String(t.room || '').trim();
    if (!rm) return;
    var key = String(t.loc_id) + '|' + rm;
    if (!roomSet[key]) {
      roomSet[key] = true;
      rooms.push({ loc_id: String(t.loc_id), room_name: rm, note: '' });
    }
  });

  var categories = readTable_('Master_Categories').rows
    .filter(function (r) { return r.is_active !== false && String(r.is_active).toUpperCase() !== 'FALSE'; })
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); })
    .map(function (r) {
      return {
        cat_id: String(r.cat_id),
        main_category: String(r.main_category),
        sub_category: String(r.sub_category)
      };
    });

  var statuses = readTable_('Master_Statuses').rows
    .sort(function (a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0); })
    .map(function (r) {
      return {
        status_code: String(r.status_code),
        status_label_th: String(r.status_label_th),
        status_color: String(r.status_color),
        is_final: r.is_final === true || String(r.is_final).toUpperCase() === 'TRUE',
        notify_requester: r.notify_requester === true || String(r.notify_requester).toUpperCase() === 'TRUE'
      };
    });

  var technicians = readTable_('Master_Users').rows
    .filter(function (u) {
      var active = u.is_active !== false && String(u.is_active).toUpperCase() !== 'FALSE';
      return active && (u.user_role === 'technician' || u.user_role === 'admin');
    })
    .map(function (u) {
      return {
        user_id: String(u.user_id),
        user_name: String(u.user_name),
        user_role: String(u.user_role)
      };
    });

  return {
    departments: depts,
    buildings: buildings,
    locations: locations,
    rooms: rooms,
    categories: categories,
    statuses: statuses,
    technicians: technicians
  };
}
