/**
 * e-MMS : Supabase -> Google Sheets Data Integration (Read-Only Consumer Sync)
 * ---------------------------------------------------------------------------
 * หน้าที่:
 *  1. ดึงข้อมูลจาก Supabase REST API (PostgREST) มาเขียนทับลง Google Sheets (Full Replace)
 *     เพื่อให้เจ้าหน้าที่และผู้บริหารดูรายงานสรุป/วิเคราะห์ผลได้ตลอด 24/7
 *  2. มีปุ่มเมนู "🔄 รีเฟรชข้อมูลล่าสุดจาก Supabase" บนแถบเมนู Google Sheets
 *  3. ตั้งเวลา Time-driven Trigger ทุก 1 ชั่วโมง (ช่วย Keep-Alive ป้องกัน Supabase Free Tier
 *     เข้าสู่โหมด Pause หลังไม่มีการใช้งาน 7 วันไปในตัว)
 *
 * การตั้งค่าใน Project Settings -> Script Properties (ห้ามใส่ Key ลับในโค้ดหรือชีต):
 *  - SUPABASE_URL : เช่น https://xxxxxxxxxxxx.supabase.co
 *  - SUPABASE_KEY : Service Role Key หรือ Anon Key ของโปรเจกต์ Supabase
 */

/**
 * สร้างเมนูบนแถบเครื่องมือของ Google Sheets อัตโนมัติเมื่อเปิดไฟล์
 */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('⚡ e-MMS (Supabase Sync)')
      .addItem('🔄 รีเฟรชข้อมูลล่าสุดจาก Supabase ทันที', 'syncAllFromSupabase')
      .addSeparator()
      .addItem('⏰ เปิด Auto-Sync ทุก 1 ชั่วโมง (Keep-Alive)', 'setupSupabaseHourlySyncTrigger')
      .addItem('🛑 ปิด Auto-Sync รายชั่วโมง', 'removeSupabaseSyncTriggers')
      .addSeparator()
      .addItem('🛠 สร้าง/ตรวจสอบโครงสร้าง 15 ชีต (setupDatabase)', 'setupDatabase')
      .addToUi();
  } catch (e) {
    Logger.log('onOpen menu warning: ' + e);
  }
}

/**
 * อ่านค่าการเชื่อมต่อ Supabase จาก Script Properties
 */
function getSupabaseCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').trim().replace(/\/+$/, '');
  var key = String(props.getProperty('SUPABASE_KEY') || props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  if (!url) {
    try {
      url = String(getConfig_('SUPABASE_URL', '')).trim().replace(/\/+$/, '');
    } catch (e) {
      // ignore
    }
  }
  return { url: url, key: key };
}

/**
 * ฟังก์ชันหลัก: ดึงข้อมูลจาก Supabase REST API มาอัปเดตลง Google Sheets (Full Replace)
 * สามารถกดรันจากเมนูบนชีต หรือรันอัตโนมัติผ่าน Time-driven Trigger ทุก 1 ชั่วโมง
 */
function syncAllFromSupabase() {
  var startMs = new Date().getTime();
  var creds = getSupabaseCredentials_();

  if (!creds.url || !creds.key) {
    var msg = 'ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_KEY ใน Project Settings -> Script Properties';
    Logger.log(msg);
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(msg, '⚠️ ยังไม่ได้ตั้งค่า Supabase', 8);
    } catch (e) {
      // ถ้ารันจาก Time Trigger จะไม่มี UI
    }
    return { ok: false, error: msg };
  }

  var ss = getSs_();
  // ตารางที่ต้องการ Sync จาก Supabase ลง Google Sheets เพื่อออกรายงาน
  var targetTables = [
    { name: 'Trans_JobTickets', order: 'created_at.desc' },
    { name: 'Trans_Assignments', order: 'recorded_at.desc' },
    { name: 'Trans_Attachments', order: 'uploaded_at.desc' },
    { name: 'Trans_StatusLogs', order: 'changed_at.desc' },
    { name: 'Master_Users', order: 'user_id.asc' },
    { name: 'Master_Departments', order: 'sort_order.asc' },
    { name: 'Master_Buildings', order: 'sort_order.asc' },
    { name: 'Master_Locations', order: 'sort_order.asc' },
    { name: 'Master_Rooms', order: 'room_id.asc' },
    { name: 'Master_Categories', order: 'sort_order.asc' },
    { name: 'Master_Statuses', order: 'sort_order.asc' },
    { name: 'Sys_NotificationLogs', order: 'sent_at.desc' },
    { name: 'Sys_AuditLogs', order: 'created_at.desc' }
  ];

  var summary = [];
  for (var i = 0; i < targetTables.length; i++) {
    var item = targetTables[i];
    try {
      var count = syncSingleTableFromSupabase_(ss, creds, item.name, item.order);
      summary.push(item.name + ': ' + count + ' แถว');
    } catch (tblErr) {
      Logger.log('Sync table error [' + item.name + ']: ' + tblErr);
      summary.push(item.name + ': ERROR (' + tblErr.message + ')');
    }
  }

  var elapsedSec = ((new Date().getTime() - startMs) / 1000).toFixed(2);
  var doneMsg = 'ซิงค์ข้อมูลจาก Supabase เสร็จสิ้นใน ' + elapsedSec + ' วินาที';
  Logger.log(doneMsg + ' -> ' + summary.join(', '));

  try {
    ss.toast(doneMsg, '✅ e-MMS Sync สำเร็จ', 5);
  } catch (e) {
    // รันผ่าน Time Trigger ไม่มี UI toast
  }

  return {
    ok: true,
    elapsed_sec: Number(elapsedSec),
    summary: summary
  };
}

/**
 * ดึงข้อมูล 1 ตารางจาก Supabase PostgREST API แล้วเขียนทับลงชีตด้วย Single Batch Write
 */
function syncSingleTableFromSupabase_(ss, creds, tableName, orderByClause) {
  var schemaDef = null;
  for (var i = 0; i < DB_SCHEMA.length; i++) {
    if (DB_SCHEMA[i].name === tableName) {
      schemaDef = DB_SCHEMA[i];
      break;
    }
  }
  if (!schemaDef) throw new Error('ไม่พบนิยามตาราง ' + tableName + ' ใน DB_SCHEMA');

  var sheet = ss.getSheetByName(tableName);
  if (!sheet) {
    sheet = ss.insertSheet(tableName);
    writeHeader_(sheet, schemaDef);
    applyFormats_(sheet, schemaDef);
  }

  var query = '?select=*';
  if (orderByClause) query += '&order=' + encodeURIComponent(orderByClause);
  var endpoint = creds.url + '/rest/v1/' + encodeURIComponent(tableName) + query;

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: creds.key,
      Authorization: 'Bearer ' + creds.key,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ': ' + res.getContentText());
  }

  var data = JSON.parse(res.getContentText());
  if (!Array.isArray(data)) return 0;

  var cols = schemaDef.columns;
  var matrix = [];

  for (var r = 0; r < data.length; r++) {
    var record = data[r];
    var rowArr = [];
    for (var c = 0; c < cols.length; c++) {
      var colDef = cols[c];
      var val = record[colDef.key];
      if (val === null || typeof val === 'undefined') {
        rowArr.push('');
      } else if (colDef.type === 'datetime' && val) {
        var dt = new Date(val);
        rowArr.push(isNaN(dt.getTime()) ? String(val) : dt);
      } else {
        rowArr.push(val);
      }
    }
    matrix.push(rowArr);
  }

  // ล้างข้อมูลเดิมตั้งแต่แถวที่ 2 ลงไป (คงแถวที่ 1 Header และ Format คอลัมน์ไว้)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, cols.length).clearContent();
  }

  // เขียนข้อมูลใหม่ทั้งหมดในคำสั่งเดียว (Single Batch Write เร็ว < 0.5 วินาที)
  if (matrix.length > 0) {
    if (sheet.getMaxRows() < matrix.length + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), (matrix.length + 1) - sheet.getMaxRows());
    }
    sheet.getRange(2, 1, matrix.length, cols.length).setValues(matrix);
  }

  return matrix.length;
}

/**
 * ตั้งเวลา Time-driven Trigger ให้ดึงข้อมูลจาก Supabase ทุก 1 ชั่วโมง
 * (ทำหน้าที่ทั้งอัปเดตรายงาน 24/7 และ Keep-Alive ป้องกัน Supabase Free Tier หยุดทำงานหลัง 7 วัน)
 */
function setupSupabaseHourlySyncTrigger() {
  removeSupabaseSyncTriggers();

  ScriptApp.newTrigger('syncAllFromSupabase')
    .timeBased()
    .everyHours(1)
    .create();

  var msg = 'ตั้งเวลา Auto-Sync ข้อมูลจาก Supabase ทุก 1 ชั่วโมงเรียบร้อยแล้ว (ป้องกัน Supabase Pause อัตโนมัติ)';
  Logger.log(msg);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, '⏰ เปิด Auto-Sync สำเร็จ', 5);
  } catch (e) {
    // ignore
  }
}

/**
 * ยกเลิก Time-driven Trigger ของ syncAllFromSupabase
 */
function removeSupabaseSyncTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncAllFromSupabase') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('ลบ Trigger syncAllFromSupabase เรียบร้อยแล้ว');
}
