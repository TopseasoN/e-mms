/**
 * e-MMS : LINE Messaging API Service (Free Reply Webhook + Quota-Managed Push Flex)
 * ---------------------------------------------------------------------------
 */

/** สร้างลิงก์เปิดหน้า LIFF ไปยังใบงานที่ระบุ */
function buildLiffUrl_(jtrId) {
  var liffId = extractLiffId_(getConfig_('LIFF_ID', ''));
  var webUrl = getConfig_('WEB_BASE_URL', 'https://topseason.github.io/e-mms/web/');
  if (liffId) {
    return 'https://liff.line.me/' + liffId + (jtrId ? ('?jtr=' + encodeURIComponent(jtrId)) : '');
  }
  if (webUrl) {
    return webUrl + (jtrId ? ('?jtr=' + encodeURIComponent(jtrId)) : '');
  }
  return 'https://line.me';
}

/** สร้าง Flex Bubble สำหรับใบงานแจ้งซ่อม (ใช้ได้ทั้ง Reply รับเรื่องฟรี และ Push แจ้งอัปเดตสถานะ) */
function buildTicketFlexMessage_(ticket, titlePrefix) {
  var heroImgUrl = '';
  if ((ticket.status === 'COMPLETED' || ticket.status === 'CANNOT_REPAIR') && ticket.images_after && ticket.images_after.length) {
    heroImgUrl = ticket.images_after[0].file_url;
  } else if (ticket.images_before && ticket.images_before.length) {
    heroImgUrl = ticket.images_before[0].file_url;
  }

  var locText = ticket.bld_name + ' • ' + ticket.loc_name + (ticket.room ? (' (ห้อง ' + ticket.room + ')') : '');
  var catText = ticket.main_category + (ticket.sub_category ? (' › ' + ticket.sub_category) : '');

  var bodyContents = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: ticket.jtr_id,
          weight: 'bold',
          size: 'md',
          color: '#1E293B',
          flex: 1
        },
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: ticket.status_color || '#2196F3',
          cornerRadius: '12px',
          paddingAll: '4px',
          paddingStart: '10px',
          paddingEnd: '10px',
          contents: [
            {
              type: 'text',
              text: ticket.status_label_th || ticket.status,
              color: '#FFFFFF',
              size: 'xs',
              weight: 'bold',
              align: 'center'
            }
          ]
        }
      ],
      alignItems: 'center'
    },
    {
      type: 'separator',
      margin: 'md'
    },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [
        flexKeyValueRow_('สถานที่', locText),
        flexKeyValueRow_('หมวดงาน', catText),
        flexKeyValueRow_('อาการ/ปัญหา', ticket.description || '-'),
        flexKeyValueRow_('วันที่แจ้ง', ticket.created_at_th || '-')
      ]
    }
  ];

  if (ticket.first_accepted_by_name || ticket.assigned_names) {
    bodyContents[2].contents.push(
      flexKeyValueRow_('ช่างผู้รับผิดชอบ', ticket.assigned_names || ticket.first_accepted_by_name)
    );
  }
  if (ticket.status === 'ON_HOLD' && ticket.on_hold_reason) {
    bodyContents[2].contents.push(
      flexKeyValueRow_('เหตุผลที่รอ', ticket.on_hold_reason)
    );
  }
  if (ticket.status === 'COMPLETED') {
    if (ticket.cause_solution) {
      bodyContents[2].contents.push(flexKeyValueRow_('การแก้ไข', ticket.cause_solution));
    }
    if (ticket.materials_used) {
      bodyContents[2].contents.push(flexKeyValueRow_('วัสดุที่ใช้', ticket.materials_used));
    }
    if (ticket.finished_at_th && ticket.finished_at_th !== '-') {
      bodyContents[2].contents.push(flexKeyValueRow_('เสร็จเมื่อ', ticket.finished_at_th));
    }
  }
  if (ticket.status === 'CANNOT_REPAIR' && (ticket.tech_note || ticket.cause_solution)) {
    bodyContents[2].contents.push(
      flexKeyValueRow_('เหตุผล', ticket.tech_note || ticket.cause_solution)
    );
  }

  var bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: ticket.status_color || '#1565C0',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: titlePrefix || 'แจ้งอัปเดตสถานะงานซ่อม',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'sm'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: '#1565C0',
          action: {
            type: 'uri',
            label: 'ดูรายละเอียดในระบบ e-MMS',
            uri: buildLiffUrl_(ticket.jtr_id)
          }
        }
      ]
    }
  };

  if (heroImgUrl && /^https:\/\//.test(heroImgUrl)) {
    bubble.hero = {
      type: 'image',
      url: heroImgUrl,
      size: 'full',
      aspectRatio: '16:10',
      aspectMode: 'cover'
    };
  }

  return {
    type: 'flex',
    altText: (titlePrefix || 'e-MMS') + ' [' + ticket.jtr_id + '] สถานะ: ' + (ticket.status_label_th || ticket.status),
    contents: bubble
  };
}

function flexKeyValueRow_(label, value) {
  return {
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: String(label),
        color: '#64748B',
        size: 'xs',
        flex: 3
      },
      {
        type: 'text',
        text: String(value || '-'),
        wrap: true,
        color: '#0F172A',
        size: 'xs',
        flex: 7
      }
    ]
  };
}

/**
 * ตอบกลับข้อความผ่าน LINE Reply API (ฟรี 100% ไม่เสียโควต้า Push 300 ข้อความ/เดือน)
 */
function replyLineMessages_(replyToken, messages, jtrId, eventName, targetLineId) {
  var token = getSecret_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token || !replyToken) return false;

  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  });

  var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  logNotification_(
    jtrId || '',
    'LINE_REPLY',
    eventName || 'TICKET_RECEIPT_REPLY',
    targetLineId || '',
    ok ? 'SENT' : 'FAILED',
    ok ? '' : ('HTTP ' + res.getResponseCode() + ': ' + res.getContentText())
  );
  return ok;
}

/**
 * ส่ง LINE Push Message แจ้งเตือนผู้แจ้งเฉพาะจุดสำคัญ (ACCEPTED, ON_HOLD, COMPLETED, CANNOT_REPAIR)
 * พร้อมตรวจสอบโควต้ารายเดือน (300 ข้อความ/เดือน)
 */
function sendLineStatusPush_(ticketEnriched, eventName) {
  var token = getSecret_('LINE_CHANNEL_ACCESS_TOKEN');
  var toLineId = String(ticketEnriched.requester_line_id || '').trim();
  if (!token || !toLineId) return false;

  var limit = parseInt(getConfig_('LINE_PUSH_MONTHLY_LIMIT', '300'), 10) || 300;
  var warnAt = parseInt(getConfig_('LINE_PUSH_WARN_AT', '250'), 10) || 250;
  var usedCount = getMonthlyLinePushCount_();

  if (usedCount >= limit) {
    logNotification_(
      ticketEnriched.jtr_id,
      'LINE_PUSH',
      eventName,
      toLineId,
      'FAILED',
      'QUOTA_LIMIT_REACHED (' + usedCount + '/' + limit + ')'
    );
    return false;
  }

  var titleMap = {
    ACCEPTED: '🛠 ทีมช่างรับเรื่องแจ้งซ่อมแล้ว',
    ON_HOLD: '⏳ งานซ่อมอยู่ระหว่างรออะไหล่/จัดซื้อ',
    COMPLETED: '✅ ดำเนินการซ่อมเสร็จสิ้นแล้ว',
    CANNOT_REPAIR: '⚠️ ไม่สามารถซ่อมแซมได้'
  };
  var title = titleMap[ticketEnriched.status] || ('อัปเดตสถานะ: ' + ticketEnriched.status_label_th);
  var flexMsg = buildTicketFlexMessage_(ticketEnriched, title);

  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      to: toLineId,
      messages: [flexMsg]
    }),
    muteHttpExceptions: true
  });

  var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  logNotification_(
    ticketEnriched.jtr_id,
    'LINE_PUSH',
    eventName,
    toLineId,
    ok ? 'SENT' : 'FAILED',
    ok ? '' : ('HTTP ' + res.getResponseCode() + ': ' + res.getContentText())
  );

  // หากเพิ่งแตะระดับเตือน (เช่น 250 ข้อความ) ให้ส่งแจ้งเตือน Admin ในกลุ่ม Telegram
  if (ok && (usedCount + 1) === warnAt) {
    try {
      sendTelegramText_(
        '⚠️ <b>แจ้งเตือนโควต้า LINE OA Push</b>\n' +
        'ขณะนี้ใช้โควต้า LINE Push เดือนนี้ไปแล้ว <b>' + (usedCount + 1) + ' / ' + limit + '</b> ข้อความ'
      );
    } catch (e) {
      Logger.log('Quota warning telegram error: ' + e);
    }
  }

  return ok;
}

/**
 * จัดการ Webhook ที่ส่งมาจาก LINE Messaging API
 * รองรับ:
 *  - เมื่อหน้า LIFF ส่งข้อความ "แจ้งซ่อม #JTR-6910-001" -> ตอบกลับใบรับแจ้งซ่อมเป็น Flex Message ฟรี!
 */
function handleLineWebhook_(body) {
  var events = (body && Array.isArray(body.events)) ? body.events : [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.type === 'message' && ev.message && ev.message.type === 'text' && ev.replyToken) {
      var text = String(ev.message.text || '').trim();
      var senderLineId = (ev.source && ev.source.userId) ? String(ev.source.userId) : '';

      // ตรวจจับรหัสใบงาน เช่น "แจ้งซ่อม #JTR-6910-001" หรือ "JTR-6910-001"
      var match = text.match(/(JTR-\d{4}-\d{3,})/i);
      if (match) {
        var jtrId = match[1].toUpperCase();
        var ticket = getEnrichedTicketById_(jtrId);
        if (ticket) {
          var flex = buildTicketFlexMessage_(ticket, '📋 รับเรื่องแจ้งซ่อมเรียบร้อยแล้ว');
          replyLineMessages_(ev.replyToken, [flex], jtrId, 'TICKET_CREATED_REPLY', senderLineId);
        }
      }
    }
  }
  return { ok: true };
}
