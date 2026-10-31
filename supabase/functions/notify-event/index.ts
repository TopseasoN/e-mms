/**
 * e-MMS : Supabase Edge Function — notify-event
 * ---------------------------------------------------------------------------
 * ทำงานแบบ Decoupled Notification (ไม่บล็อกหน้าบ้าน):
 *   1. TICKET_CREATED : ส่งการ์ดงานแจ้งซ่อมใหม่ + ปุ่มกด "รับงาน" เข้ากลุ่ม Telegram
 *                       และบันทึก tg_message_id กลับลงตาราง Trans_JobTickets
 *   2. STATUS_CHANGED : แก้ไขข้อความการ์ดใน Telegram (editMessageText)
 *                       และส่ง LINE Push Flex Message แจ้งผู้แจ้ง (พร้อมคุมโควต้า 300/เดือน)
 *   3. DAILY_SUMMARY  : สรุปงานค้างประจำเช้า 08:00 น. (เรียกจาก pg_cron หรือปุ่ม Admin)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildLiffUrl,
  buildTelegramKeyboard,
  buildTicketFlexMessage,
  CORS_HEADERS,
  escapeHtml,
  formatTelegramTicketHtml,
  formatThaiDateTime,
  getConfigMap,
  getEnrichedTicketById,
  logNotification,
} from "../_shared/emms-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const event = String(body.event || "").toUpperCase();
    const jtrId = String(body.jtr_id || body.record?.jtr_id || "").trim();
    const cfg = await getConfigMap(supabase);
    const tgChatId = body.chat_id || cfg.TELEGRAM_CHAT_ID || Deno.env.get("TELEGRAM_CHAT_ID") || "";

    // กรณีที่ 1: สรุปงานค้างประจำเช้า (08:00 น. จันทร์-ศุกร์ หรือกดส่งจากหน้า Admin)
    if (event === "DAILY_SUMMARY") {
      const sent = await handleDailyPendingSummary(supabase, cfg, tgChatId);
      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!jtrId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing jtr_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // รอ 900ms เผื่อกรณี Frontend กำลังอัปโหลดรูปและ Insert Trans_Attachments ตามหลังใบงาน
    if (event === "TICKET_CREATED") {
      await new Promise((r) => setTimeout(r, 900));
    }

    const ticket = await getEnrichedTicketById(supabase, jtrId);
    if (!ticket) {
      return new Response(JSON.stringify({ ok: false, error: `Ticket ${jtrId} not found` }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // กรณี Fallback ส่งการ์ดใบรับเรื่องเข้า LINE OA เมื่อ liff.sendMessages ถูกจำกัดสิทธิ์
    if (event === "TICKET_CREATED_LINE_PUSH") {
      const targetLineId = String(body.line_user_id || ticket.requester_line_id || "").trim();
      if (
        LINE_CHANNEL_ACCESS_TOKEN &&
        targetLineId &&
        targetLineId !== "U11111111111111111111111111111111"
      ) {
        const flex = buildTicketFlexMessage(ticket, "📋 รับเรื่องแจ้งซ่อมเรียบร้อยแล้ว", cfg);
        const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: targetLineId,
            messages: [flex],
          }),
        });
        const pushText = await pushRes.text();
        await logNotification(
          supabase,
          jtrId,
          "LINE_PUSH",
          "TICKET_CREATED_PUSH_FALLBACK",
          targetLineId,
          pushRes.ok ? "SENT" : "FAILED",
          pushRes.ok ? "" : `HTTP ${pushRes.status}: ${pushText}`
        );
      }
      return new Response(JSON.stringify({ ok: true, jtr_id: jtrId, event }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // กรณีที่ 2: สร้างใบงานใหม่ -> ส่งการ์ดเข้ากลุ่ม Telegram
    if (event === "TICKET_CREATED") {
      if (TELEGRAM_BOT_TOKEN && tgChatId) {
        const html = formatTelegramTicketHtml(ticket);
        const kb = buildTelegramKeyboard(ticket, cfg);
        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgChatId,
            text: html,
            parse_mode: "HTML",
            disable_web_page_preview: false,
            reply_markup: kb,
          }),
        });
        const tgJson = await tgRes.json();
        await logNotification(
          supabase,
          jtrId,
          "TELEGRAM",
          "TICKET_CREATED_TG",
          tgChatId,
          tgRes.ok ? "SENT" : "FAILED",
          tgRes.ok ? "" : JSON.stringify(tgJson)
        );

        if (tgRes.ok && tgJson.result?.message_id) {
          await supabase
            .from("Trans_JobTickets")
            .update({ tg_message_id: String(tgJson.result.message_id) })
            .eq("jtr_id", jtrId);
        }
      }
    }

    // กรณีที่ 3: สถานะใบงานเปลี่ยน -> แก้ไขการ์ด Telegram + ส่ง LINE Push ตามเงื่อนไข
    if (event === "STATUS_CHANGED") {
      // 3.1 อัปเดตการ์ดเดิมใน Telegram
      if (TELEGRAM_BOT_TOKEN && tgChatId && ticket.tg_message_id) {
        const html = formatTelegramTicketHtml(ticket);
        const kb = buildTelegramKeyboard(ticket, cfg);
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgChatId,
            message_id: Number(ticket.tg_message_id),
            text: html,
            parse_mode: "HTML",
            disable_web_page_preview: false,
            reply_markup: kb,
          }),
        });
      }

      // 3.2 ส่ง LINE Push แจ้งผู้แจ้งหากสถานะนี้เปิด notify_requester = TRUE (และไม่ใช่รหัสจำลอง Browser Dev)
      if (
        ticket.notify_requester &&
        ticket.requester_line_id &&
        ticket.requester_line_id !== "U11111111111111111111111111111111" &&
        LINE_CHANNEL_ACCESS_TOKEN
      ) {
        await sendLinePushWithQuota(supabase, ticket, cfg, tgChatId);
      }
    }

    return new Response(JSON.stringify({ ok: true, jtr_id: jtrId, event }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

async function sendLinePushWithQuota(
  supabase: any,
  ticket: Record<string, any>,
  cfg: Record<string, string>,
  tgChatId: string
) {
  const limit = parseInt(cfg.LINE_PUSH_MONTHLY_LIMIT || "300", 10) || 300;
  const warnAt = parseInt(cfg.LINE_PUSH_WARN_AT || "250", 10) || 250;

  // นับจำนวน LINE_PUSH เดือนปัจจุบัน
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await supabase
    .from("Sys_NotificationLogs")
    .select("*", { count: "exact", head: true })
    .eq("channel", "LINE_PUSH")
    .eq("result", "SENT")
    .gte("sent_at", startOfMonth);

  const usedCount = count || 0;
  if (usedCount >= limit) {
    await logNotification(
      supabase,
      ticket.jtr_id,
      "LINE_PUSH",
      `STATUS_${ticket.status}`,
      ticket.requester_line_id,
      "FAILED",
      `QUOTA_LIMIT_REACHED (${usedCount}/${limit})`
    );
    return;
  }

  const titleMap: Record<string, string> = {
    ACCEPTED: "🛠 ทีมช่างรับเรื่องแจ้งซ่อมแล้ว",
    ON_HOLD: "⏳ งานซ่อมอยู่ระหว่างรออะไหล่/จัดซื้อ",
    COMPLETED: "✅ ดำเนินการซ่อมเสร็จสิ้นแล้ว",
    CANNOT_REPAIR: "⚠️ ไม่สามารถซ่อมแซมได้",
  };
  const title = titleMap[ticket.status] || `อัปเดตสถานะ: ${ticket.status_label_th}`;
  const flexMsg = buildTicketFlexMessage(ticket, title, cfg);

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: ticket.requester_line_id,
      messages: [flexMsg],
    }),
  });

  const lineText = await lineRes.text();
  await logNotification(
    supabase,
    ticket.jtr_id,
    "LINE_PUSH",
    `STATUS_${ticket.status}`,
    ticket.requester_line_id,
    lineRes.ok ? "SENT" : "FAILED",
    lineRes.ok ? "" : `HTTP ${lineRes.status}: ${lineText}`
  );

  // เตือน Admin ใน Telegram เมื่อแตะ warnAt (เช่น 250 ข้อความ)
  if (lineRes.ok && usedCount + 1 === warnAt && TELEGRAM_BOT_TOKEN && tgChatId) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgChatId,
        text: `⚠️ <b>แจ้งเตือนโควต้า LINE OA Push</b>\nขณะนี้ใช้โควต้า LINE Push เดือนนี้ไปแล้ว <b>${
          usedCount + 1
        } / ${limit}</b> ข้อความ`,
        parse_mode: "HTML",
      }),
    });
  }
}

async function handleDailyPendingSummary(supabase: any, cfg: Record<string, string>, tgChatId: string) {
  if (!TELEGRAM_BOT_TOKEN || !tgChatId) return false;

  const openStatuses = ["PENDING", "ACCEPTED", "IN_PROGRESS", "ON_HOLD"];
  const { data: rows } = await supabase
    .from("Trans_JobTickets")
    .select("*")
    .in("status", openStatuses)
    .order("created_at", { ascending: true });

  const nowStr = formatThaiDateTime(new Date());
  if (!rows || rows.length === 0) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgChatId,
        text: `☀️ <b>สรุปงานซ่อมบำรุงประจำเช้า (${escapeHtml(nowStr)})</b>\n🎉 ไม่มีงานค้างในระบบ ขอบคุณทีมช่างทุกท่านครับ!`,
        parse_mode: "HTML",
      }),
    });
    return true;
  }

  const [{ data: blds }, { data: locs }, { data: cats }, { data: sts }] = await Promise.all([
    supabase.from("Master_Buildings").select("bld_id, bld_name"),
    supabase.from("Master_Locations").select("loc_id, loc_name"),
    supabase.from("Master_Categories").select("cat_id, sub_category"),
    supabase.from("Master_Statuses").select("status_code, status_label_th"),
  ]);

  const bldMap: Record<string, string> = {};
  for (const b of blds || []) bldMap[b.bld_id] = b.bld_name;
  const locMap: Record<string, string> = {};
  for (const l of locs || []) locMap[l.loc_id] = l.loc_name;
  const catMap: Record<string, string> = {};
  for (const c of cats || []) catMap[c.cat_id] = c.sub_category;
  const stMap: Record<string, string> = {};
  for (const s of sts || []) stMap[s.status_code] = s.status_label_th;

  const counts: Record<string, number> = { PENDING: 0, ACCEPTED: 0, IN_PROGRESS: 0, ON_HOLD: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  const lines = [
    `☀️ <b>สรุปงานซ่อมค้างประจำวัน (${escapeHtml(nowStr)})</b>`,
    `รวมงานค้างทั้งหมด <b>${rows.length} งาน</b>:`,
    `• 🆕 รอตรวจสอบ: <b>${counts.PENDING}</b> | 🛠 รับงานแล้ว: <b>${counts.ACCEPTED}</b>`,
    `• ⚙️ กำลังทำ: <b>${counts.IN_PROGRESS}</b> | ⏳ รออะไหล่: <b>${counts.ON_HOLD}</b>`,
    "━━━━━━━━━━━━━━━━━━",
  ];

  const maxList = Math.min(rows.length, 15);
  for (let i = 0; i < maxList; i++) {
    const r = rows[i];
    const bName = bldMap[r.bld_id] || r.bld_id;
    const lName = locMap[r.loc_id] || r.loc_id;
    const sLabel = stMap[r.status] || r.status;
    const cSub = catMap[r.cat_id_actual || r.cat_id_reported] || "";
    lines.push(
      `${i + 1}. <b>${escapeHtml(r.jtr_id)}</b> [${escapeHtml(sLabel)}] ${escapeHtml(bName)} (${escapeHtml(lName)}${
        r.room ? ` ${escapeHtml(r.room)}` : ""
      }) — ${escapeHtml(cSub)}`
    );
  }
  if (rows.length > maxList) {
    lines.push(`...และอีก ${rows.length - maxList} งาน`);
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: tgChatId,
      text: lines.join("\n"),
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📋 เปิดคิวงานช่างใน LINE", url: buildLiffUrl(cfg, "") }]],
      },
    }),
  });
  return true;
}
