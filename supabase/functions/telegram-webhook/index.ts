/**
 * e-MMS : Supabase Edge Function — telegram-webhook
 * ---------------------------------------------------------------------------
 * รับ Webhook จาก Telegram Bot API (ความเร็วตอบสนอง < 300ms):
 *  - กดปุ่ม Inline "ACCEPT|JTR-..." -> เรียก rpc_accept_ticket ใน PostgreSQL
 *    (Trigger ของฐานข้อมูลจะไปอัปเดตการ์ด Telegram และส่ง LINE Push ให้อัตโนมัติ)
 *  - คำสั่ง /link <username> ผูกบัญชี Telegram กับชื่อผู้ใช้ช่าง
 *  - คำสั่ง /pending หรือ /summary ดูสรุปงานค้างทันที
 *  - คำสั่ง /chatid ดู Chat ID ของกลุ่ม
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, escapeHtml } from "../_shared/emms-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const update = await req.json().catch(() => ({}));

    // 1. กรณีกดปุ่ม Inline Button (Callback Query: ACCEPT|JTR-...)
    if (update.callback_query) {
      const cq = update.callback_query;
      const [action, jtrId] = String(cq.data || "").split("|");

      if (action === "ACCEPT" && jtrId) {
        const techUser = await resolveTechnicianFromTelegram(supabase, cq.from);
        if (!techUser) {
          await answerCallback(
            cq.id,
            "⚠️ บัญชี Telegram ของคุณยังไม่ผูกกับระบบช่าง\nกรุณาพิมพ์ /link ตามด้วยชื่อผู้ใช้ของคุณในกลุ่มนี้ 1 ครั้ง (เช่น /link surachat)",
            true
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const { data: res, error } = await supabase.rpc("rpc_accept_ticket", {
          p_jtr_id: jtrId.trim(),
          p_tech_user_id: techUser.user_id,
          p_via: "TELEGRAM",
        });

        if (error) {
          await answerCallback(cq.id, `❌ เกิดข้อผิดพลาด: ${error.message}`, true);
        } else if (res?.alreadyAccepted) {
          await answerCallback(cq.id, `ℹ️ ใบงาน ${jtrId} ถูกรับงานไปแล้ว`, true);
        } else {
          await answerCallback(cq.id, `✅ รับงาน ${jtrId} สำเร็จ! (${techUser.user_name})`, false);
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 2. กรณีพิมพ์คำสั่งในกลุ่มหรือแชทบอท
    if (update.message?.text) {
      const msg = update.message;
      const text = String(msg.text || "").trim();
      const chatId = String(msg.chat?.id || "");

      if (/^\/chatid\b/i.test(text)) {
        await sendTelegramText(
          chatId,
          `🆔 <b>Telegram Chat ID ของห้องนี้คือ:</b> <code>${escapeHtml(chatId)}</code>\n` +
            `👤 <b>Telegram User ID ของคุณคือ:</b> <code>${escapeHtml(msg.from?.id || "")}</code>`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const linkMatch = text.match(/^\/link(?:@\S+)?\s+(\S+)/i);
      if (linkMatch && msg.from?.id) {
        const target = linkMatch[1].trim().toLowerCase();
        const tgId = String(msg.from.id);
        const { data: users } = await supabase.from("Master_Users").select("*");
        const matched = (users || []).find(
          (u) =>
            String(u.user_username || "").trim().toLowerCase() === target ||
            String(u.user_id || "").trim().toLowerCase() === target ||
            String(u.user_name || "").trim() === linkMatch[1].trim()
        );

        if (!matched) {
          await sendTelegramText(chatId, `❌ ไม่พบผู้ใช้ <code>${escapeHtml(linkMatch[1])}</code> ในตาราง Master_Users`);
        } else {
          await supabase
            .from("Master_Users")
            .update({ telegram_user_id: tgId, updated_at: new Date().toISOString() })
            .eq("user_id", matched.user_id);

          await supabase.from("Sys_AuditLogs").insert({
            actor_user_id: matched.user_id,
            action: "LINK_TELEGRAM",
            target_user_id: matched.user_id,
            detail: `tgId=${tgId}`,
          });

          await sendTelegramText(
            chatId,
            `✅ ผูกบัญชี Telegram สำเร็จ!\n👷 <b>${escapeHtml(matched.user_name)}</b> (${escapeHtml(
              matched.user_id
            )}) สามารถกดปุ่ม "รับงาน" ในกลุ่มได้ทันที`
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      if (/^\/(pending|summary)\b/i.test(text)) {
        // เรียก Edge Function notify-event ให้ส่งสรุปงานค้างไปยังห้องแชทนี้ทันที
        await fetch(`${SUPABASE_URL}/functions/v1/notify-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ event: "DAILY_SUMMARY", chat_id: chatId }),
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

async function resolveTechnicianFromTelegram(supabase: any, tgFrom: any) {
  if (!tgFrom?.id) return null;
  const tgId = String(tgFrom.id).trim();
  const firstName = String(tgFrom.first_name || "").trim();

  const { data: users } = await supabase.from("Master_Users").select("*").eq("is_active", true);
  if (!users) return null;

  // 1. ค้นหาจาก telegram_user_id ที่ผูกไว้แล้ว
  const byId = users.find((u: any) => String(u.telegram_user_id || "").trim() === tgId);
  if (byId) return byId;

  // 2. หากยังไม่ผูก แต่ชื่อ Telegram ตรงกับชื่อช่าง ให้ผูกอัตโนมัติ
  if (firstName) {
    const byName = users.find(
      (u: any) =>
        (u.user_role === "technician" || u.user_role === "admin") &&
        !u.telegram_user_id &&
        String(u.user_name || "").includes(firstName)
    );
    if (byName) {
      await supabase
        .from("Master_Users")
        .update({ telegram_user_id: tgId, updated_at: new Date().toISOString() })
        .eq("user_id", byName.user_id);
      return byName;
    }
  }
  return null;
}

async function sendTelegramText(chatId: string, htmlText: string) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
    }),
  });
}

async function answerCallback(callbackQueryId: string, text: string, showAlert: boolean) {
  if (!TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    }),
  });
}
