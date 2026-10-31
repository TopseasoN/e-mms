/**
 * e-MMS : Telegram Bot Service (Group Notifications, Inline Button Callback & 08:00 Daily Summary)
 * ---------------------------------------------------------------------------
 */

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** สร้างข้อความ HTML สำหรับการ์ดใบงานในกลุ่ม Telegram */
function formatTelegramTicketHtml_(t) {
  var statusIconMap = {
    PENDING: '🆕',
    ACCEPTED: '🛠',
    IN_PROGRESS: '⚙️',
    ON_HOLD: '⏳',
    COMPLETED: '✅',
    CANNOT_REPAIR: '❌',
    CANCELLED: '🚫'
  };
  var icon = statusIconMap[t.status] || '📌';
  var lines = [
    icon + ' <b>[' + escapeHtml_(t.jtr_id) + '] ' + escapeHtml_(t.status_label_th) + '</b>',
    '━━━━━━━━━━━━━━━━━━',
    '📍 <b>สถานที่:</b> ' + escapeHtml_(t.bld_name) + ' › ' + escapeHtml_(t.loc_name) +
      (t.room ? (' (ห้อง <b>' + escapeHtml_(t.room) + '</b>)') : ''),
    '🏷 <b>หมวดงาน:</b> ' + escapeHtml_(t.main_category) + ' › ' + escapeHtml_(t.sub_category),
    '📝 <b>อาการ/ปัญหา:</b> ' + escapeHtml_(t.description),
    '👤 <b>ผู้แจ้ง:</b> ' + escapeHtml_(t.requester_name) +
      (t.requester_division ? (' (' + escapeHtml_(t.requester_division) + ')') : '') +
      (t.requester_phone ? (' • โทร: <a href="tel:' + escapeHtml_(t.requester_phone) + '">' + escapeHtml_(t.requester_phone) + '</a>') : ''),
    '🕒 <b>แจ้งเมื่อ:</b> ' + escapeHtml_(t.created_at_th)
  ];

  if (t.first_accepted_by_name) {
    lines.push('🙋‍♂️ <b>รับงานโดย:</b> ' + escapeHtml_(t.first_accepted_by_name) + ' (' + escapeHtml_(t.first_accepted_at_th) + ')');
  }
  if (t.assigned_names) {
    lines.push('👷 <b>ทีมช่างผู้ร่วมงาน:</b> ' + escapeHtml_(t.assigned_names));
  }
  if (t.status === 'ON_HOLD' && t.on_hold_reason) {
    lines.push('⏳ <b>เหตุผลที่รอ:</b> ' + escapeHtml_(t.on_hold_reason));
  }
  if (t.status === 'COMPLETED') {
    if (t.cause_solution) lines.push('🔧 <b>การแก้ไข:</b> ' + escapeHtml_(t.cause_solution));
    if (t.materials_used) lines.push('📦 <b>วัสดุที่ใช้:</b> ' + escapeHtml_(t.materials_used));
    lines.push('🏁 <b>เสร็จเมื่อ:</b> ' + escapeHtml_(t.finished_at_th));
  }
  if (t.status === 'CANNOT_REPAIR' && (t.tech_note || t.cause_solution)) {
    lines.push('⚠️ <b>เหตุผลที่ซ่อมไม่ได้:</b> ' + escapeHtml_(t.tech_note || t.cause_solution));
  }
  if (t.status === 'CANCELLED' && t.cancel_reason) {
    lines.push('🚫 <b>เหตุผลที่ยกเลิก:</b> ' + escapeHtml_(t.cancel_reason));
  }
  if (t.images_before && t.images_before.length > 0) {
    var imgLinks = t.images_before.map(function (img, idx) {
      return '<a href="' + escapeHtml_(img.file_url) + '">รูปแจ้ง #' + (idx + 1) + '</a>';
    }).join(' | ');
    lines.push('🖼 <b>รูปก่อนซ่อม:</b> ' + imgLinks);
  }
  if (t.images_after && t.images_after.length > 0) {
    var afterLinks = t.images_after.map(function (img, idx) {
      return '<a href="' + escapeHtml_(img.file_url) + '">รูปหลังซ่อม #' + (idx + 1) + '</a>';
    }).join(' | ');
    lines.push('📸 <b>รูปหลังซ่อม:</b> ' + afterLinks);
  }

  return lines.join('\n');
}

/** สร้าง Inline Keyboard สำหรับโพสต์ใน Telegram */
function buildTelegramKeyboard_(t) {
  var rows = [];
  if (t.status === 'PENDING') {
    rows.push([
      {
        text: '🛠 กดรับงานนี้ (' + t.jtr_id + ')',
        callback_data: 'ACCEPT|' + t.jtr_id
      }
    ]);
  }
  var liffUrl = buildLiffUrl_(t.jtr_id);
  if (liffUrl && /^https:\/\//.test(liffUrl)) {
    rows.push([
      {
        text: '🔍 เปิดดู / อัปเดตงานใน LINE',
        url: liffUrl
      }
    ]);
  }
  return { inline_keyboard: rows };
}

/** ส่งข้อความทั่วไปเข้ากลุ่ม Telegram */
function sendTelegramText_(htmlText, replyMarkup, chatIdOverride, jtrId, eventName) {
  var botToken = getSecret_('TELEGRAM_BOT_TOKEN');
  var chatId = chatIdOverride || getConfig_('TELEGRAM_CHAT_ID', '');
  if (!botToken || !chatId) return null;

  var payload = {
    chat_id: String(chatId),
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };
  if (replyMarkup && replyMarkup.inline_keyboard && replyMarkup.inline_keyboard.length > 0) {
    payload.reply_markup = replyMarkup;
  }

  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var bodyText = res.getContentText();
  var ok = code >= 200 && code < 300;
  logNotification_(
    jtrId || '',
    'TELEGRAM',
    eventName || 'TELEGRAM_SEND',
    String(chatId),
    ok ? 'SENT' : 'FAILED',
    ok ? '' : ('HTTP ' + code + ': ' + bodyText)
  );

  if (ok) {
    var parsed = JSON.parse(bodyText);
    return parsed && parsed.result ? parsed.result.message_id : null;
  }
  return null;
}

/** ส่งการ์ดแจ้งงานซ่อมใหม่เข้ากลุ่ม Telegram และคืนค่า message_id */
function sendTelegramNewTicket_(ticketEnriched) {
  var html = formatTelegramTicketHtml_(ticketEnriched);
  var kb = buildTelegramKeyboard_(ticketEnriched);
  return sendTelegramText_(html, kb, null, ticketEnriched.jtr_id, 'TICKET_CREATED_TG');
}

/** แก้ไขข้อความการ์ดใบงานเดิมใน Telegram เมื่อสถานะเปลี่ยน */
function updateTelegramTicketCard_(ticketEnriched) {
  var botToken = getSecret_('TELEGRAM_BOT_TOKEN');
  var chatId = getConfig_('TELEGRAM_CHAT_ID', '');
  var msgId = ticketEnriched.tg_message_id;
  if (!botToken || !chatId || !msgId) return false;

  var html = formatTelegramTicketHtml_(ticketEnriched);
  var kb = buildTelegramKeyboard_(ticketEnriched);

  var payload = {
    chat_id: String(chatId),
    message_id: Number(msgId),
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: kb
  };

  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/editMessageText', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
}

/** ตอบกลับ Callback Query ตอนช่างกดปุ่ม Inline */
function answerTelegramCallback_(callbackQueryId, text, showAlert) {
  var botToken = getSecret_('TELEGRAM_BOT_TOKEN');
  if (!botToken || !callbackQueryId) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/answerCallbackQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: !!showAlert
    }),
    muteHttpExceptions: true
  });
}

/** ค้นหาช่างจาก Telegram User ID หรือจับคู่ชื่ออัตโนมัติในครั้งแรก */
function resolveTechnicianFromTelegram_(tgUserObj) {
  if (!tgUserObj || !tgUserObj.id) return null;
  var tgId = String(tgUserObj.id).trim();
  var firstName = String(tgUserObj.first_name || '').trim();
  var users = readTable_('Master_Users').rows;

  // 1. ค้นหาจาก telegram_user_id ที่ผูกไว้แล้ว
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var isActive = u.is_active !== false && String(u.is_active).toUpperCase() !== 'FALSE';
    if (isActive && String(u.telegram_user_id).trim() === tgId) {
      return sanitizeUserObj_(u);
    }
  }

  // 2. หากยังไม่เคยผูก แต่ชื่อใน Telegram ตรงกับชื่อช่างใน Master_Users ให้ผูกอัตโนมัติ
  if (firstName) {
    for (var j = 0; j < users.length; j++) {
      var u2 = users[j];
      var active2 = u2.is_active !== false && String(u2.is_active).toUpperCase() !== 'FALSE';
      var isTechOrAdmin = (u2.user_role === 'technician' || u2.user_role === 'admin');
      var uName = String(u2.user_name || '').trim();
      if (active2 && isTechOrAdmin && !u2.telegram_user_id && uName && uName.indexOf(firstName) !== -1) {
        updateRowById_('Master_Users', u2.user_id, {
          telegram_user_id: tgId,
          updated_at: new Date()
        });
        logAudit_(u2.user_id, 'LINK_TELEGRAM', u2.user_id, 'auto-linked tgId=' + tgId);
        u2.telegram_user_id = tgId;
        return sanitizeUserObj_(u2);
      }
    }
  }
  return null;
}

/**
 * จัดการ Webhook ที่ส่งมาจาก Telegram Bot API
 * รองรับ:
 *  - กดปุ่ม Inline "ACCEPT|JTR-..."
 *  - คำสั่ง /link <username> เพื่อผูกบัญชี Telegram กับชื่อผู้ใช้ช่าง
 *  - คำสั่ง /pending หรือ /summary เพื่อดูสรุปงานค้างทันที
 *  - คำสั่ง /chatid เพื่อดู Chat ID ของกลุ่มปัจจุบัน
 */
function handleTelegramWebhook_(update) {
  // 1. กรณีกดปุ่ม Inline Button (Callback Query)
  if (update && update.callback_query) {
    var cq = update.callback_query;
    var data = String(cq.data || '');
    var parts = data.split('|');

    if (parts[0] === 'ACCEPT' && parts[1]) {
      var jtrId = parts[1].trim();
      var techUser = resolveTechnicianFromTelegram_(cq.from);
      if (!techUser) {
        answerTelegramCallback_(
          cq.id,
          '⚠️ บัญชี Telegram ของคุณยังไม่ผูกกับระบบช่าง\nกรุณาพิมพ์ /link ตามด้วยชื่อผู้ใช้ของคุณในกลุ่มนี้ 1 ครั้ง (เช่น /link surachat)',
          true
        );
        return { ok: true };
      }

      var res = acceptTicketCore_(techUser, jtrId, 'TELEGRAM');
      if (res.alreadyAccepted) {
        answerTelegramCallback_(
          cq.id,
          'ℹ️ ใบงาน ' + jtrId + ' ถูกรับงานไปแล้วโดย ' + (res.ticket.first_accepted_by_name || 'ช่างท่านอื่น'),
          true
        );
      } else {
        answerTelegramCallback_(
          cq.id,
          '✅ รับงาน ' + jtrId + ' สำเร็จ! (' + techUser.user_name + ')',
          false
        );
      }
    }
    return { ok: true };
  }

  // 2. กรณีพิมพ์คำสั่งในกลุ่มหรือแชทบอท
  if (update && update.message && update.message.text) {
    var msg = update.message;
    var text = String(msg.text || '').trim();
    var chatId = msg.chat ? String(msg.chat.id) : '';

    if (/^\/chatid\b/i.test(text)) {
      sendTelegramText_(
        '🆔 <b>Telegram Chat ID ของห้องนี้คือ:</b> <code>' + escapeHtml_(chatId) + '</code>\n' +
        '👤 <b>Telegram User ID ของคุณคือ:</b> <code>' + escapeHtml_(msg.from ? msg.from.id : '') + '</code>',
        null,
        chatId,
        '',
        'CMD_CHATID'
      );
      return { ok: true };
    }

    var linkMatch = text.match(/^\/link(?:@\S+)?\s+(\S+)/i);
    if (linkMatch && msg.from && msg.from.id) {
      var targetUsername = linkMatch[1].trim().toLowerCase();
      var tgId = String(msg.from.id);
      var users = readTable_('Master_Users').rows;
      var matched = null;

      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (String(u.user_username || '').trim().toLowerCase() === targetUsername ||
            String(u.user_id || '').trim().toLowerCase() === targetUsername ||
            String(u.user_name || '').trim() === linkMatch[1].trim()) {
          matched = u;
          break;
        }
      }

      if (!matched) {
        sendTelegramText_('❌ ไม่พบผู้ใช้ <code>' + escapeHtml_(linkMatch[1]) + '</code> ในชีต Master_Users', null, chatId);
      } else {
        updateRowById_('Master_Users', matched.user_id, {
          telegram_user_id: tgId,
          updated_at: new Date()
        });
        logAudit_(matched.user_id, 'LINK_TELEGRAM', matched.user_id, 'tgId=' + tgId);
        sendTelegramText_(
          '✅ ผูกบัญชี Telegram สำเร็จ!\n👷 <b>' + escapeHtml_(matched.user_name) + '</b> (' + escapeHtml_(matched.user_id) + ') สามารถกดปุ่ม "รับงาน" ในกลุ่มได้ทันที',
          null,
          chatId
        );
      }
      return { ok: true };
    }

    if (/^\/(pending|summary)\b/i.test(text)) {
      sendDailyPendingSummary(chatId, true);
      return { ok: true };
    }
  }

  return { ok: true };
}

/**
 * ส่งสรุปงานค้างประจำวันเข้ากลุ่ม Telegram (เรียกโดย Time-driven Trigger ทุกเช้า 08:00 น. จันทร์-ศุกร์)
 */
function sendDailyPendingSummary(chatIdOverride, forceSend) {
  if (!forceSend) {
    var enabled = String(getConfig_('DAILY_SUMMARY_ENABLED', 'TRUE')).toUpperCase() === 'TRUE';
    if (!enabled) return;

    var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
    var dayCode = Utilities.formatDate(new Date(), tz, 'EEE').toUpperCase().slice(0, 3);
    var allowedDays = String(getConfig_('DAILY_SUMMARY_WEEKDAYS', 'MON,TUE,WED,THU,FRI'))
      .toUpperCase()
      .split(',')
      .map(function (s) { return s.trim(); });
    if (allowedDays.indexOf(dayCode) === -1) return;
  }

  var lk = buildLookupMaps_();
  var rows = readTable_('Trans_JobTickets').rows;
  var openStatuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
  var openTickets = [];

  for (var i = 0; i < rows.length; i++) {
    if (openStatuses.indexOf(String(rows[i].status)) !== -1) {
      openTickets.push(enrichTicketRow_(rows[i], lk));
    }
  }

  var nowStr = formatThaiDateTime_(new Date());
  if (openTickets.length === 0) {
    sendTelegramText_(
      '☀️ <b>สรุปงานซ่อมบำรุงประจำเช้า (' + escapeHtml_(nowStr) + ')</b>\n' +
      '🎉 ไม่มีงานค้างในระบบ ขอบคุณทีมช่างทุกท่านครับ!',
      null,
      chatIdOverride,
      '',
      'DAILY_SUMMARY'
    );
    return;
  }

  var counts = { PENDING: 0, ACCEPTED: 0, IN_PROGRESS: 0, ON_HOLD: 0 };
  openTickets.forEach(function (t) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  });

  var lines = [
    '☀️ <b>สรุปงานซ่อมค้างประจำวัน (' + escapeHtml_(nowStr) + ')</b>',
    'รวมงานค้างทั้งหมด <b>' + openTickets.length + ' งาน</b>:',
    '• 🆕 รอตรวจสอบ: <b>' + counts.PENDING + '</b> | 🛠 รับงานแล้ว: <b>' + counts.ACCEPTED + '</b>',
    '• ⚙️ กำลังทำ: <b>' + counts.IN_PROGRESS + '</b> | ⏳ รออะไหล่: <b>' + counts.ON_HOLD + '</b>',
    '━━━━━━━━━━━━━━━━━━'
  ];

  var maxList = Math.min(openTickets.length, 15);
  for (var j = 0; j < maxList; j++) {
    var t = openTickets[j];
    lines.push(
      (j + 1) + '. <b>' + escapeHtml_(t.jtr_id) + '</b> [' + escapeHtml_(t.status_label_th) + '] ' +
      escapeHtml_(t.bld_name) + ' (' + escapeHtml_(t.loc_name) + (t.room ? ' ' + escapeHtml_(t.room) : '') + ') — ' +
      escapeHtml_(t.sub_category)
    );
  }
  if (openTickets.length > maxList) {
    lines.push('...และอีก ' + (openTickets.length - maxList) + ' งาน');
  }

  var kb = {
    inline_keyboard: [
      [{ text: '📋 เปิดคิวงานช่างใน LINE', url: buildLiffUrl_('') }]
    ]
  };
  sendTelegramText_(lines.join('\n'), kb, chatIdOverride, '', 'DAILY_SUMMARY');
}

/**
 * ฟังก์ชันติดตั้ง Time Trigger ส่งสรุปงานค้างทุกเช้า 08:00 น. (รันครั้งเดียวใน Apps Script)
 */
function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyPendingSummary') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var hour = parseInt(getConfig_('DAILY_SUMMARY_HOUR', '8'), 10);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 8;

  ScriptApp.newTrigger('sendDailyPendingSummary')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .inTimezone(getConfig_('TIMEZONE', 'Asia/Bangkok'))
    .create();

  Logger.log('สร้าง Time Trigger เรียก sendDailyPendingSummary เวลา ' + hour + ':00 น. เรียบร้อยแล้ว');
}

/**
 * ฟังก์ชันผูก Webhook ของ Telegram Bot เข้ากับ Web App URL อัตโนมัติ
 * @param {string=} customWebAppUrl หากไม่ระบุจะดึงจาก ScriptApp.getService().getUrl()
 */
function setupTelegramWebhook(customWebAppUrl) {
  var botToken = getSecret_('TELEGRAM_BOT_TOKEN');
  if (!botToken) throw new Error('ไม่พบ TELEGRAM_BOT_TOKEN ใน Script Properties');
  var url = customWebAppUrl || ScriptApp.getService().getUrl();
  if (!url) throw new Error('กรุณาระบุ Web App URL ที่ได้จากการ Deploy');

  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/setWebhook', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: url }),
    muteHttpExceptions: true
  });
  Logger.log('Telegram setWebhook response: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
