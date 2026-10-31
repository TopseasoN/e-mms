/**
 * e-MMS : Supabase Edge Function — line-webhook
 * ---------------------------------------------------------------------------
 * รับ Webhook จาก LINE Messaging API:
 *  - เมื่อหน้าเว็บ LIFF ส่งข้อความ "แจ้งซ่อม #JTR-6911-001" เข้าแชท LINE OA
 *    ระบบจะใช้ replyToken ตอบกลับด้วย Flex Message ใบรับแจ้งซ่อมฟรี 100%
 *    (ไม่เสียโควต้า LINE Push 300 ข้อความ/เดือน ตามมติที่ 11)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildTicketFlexMessage,
  CORS_HEADERS,
  getConfigMap,
  getEnrichedTicketById,
  logNotification,
} from "../_shared/emms-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const events = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const cfg = await getConfigMap(supabase);

    for (const ev of events) {
      if (ev.type === "message" && ev.message?.type === "text" && ev.replyToken) {
        const text = String(ev.message.text || "").trim();
        const senderLineId = String(ev.source?.userId || "");
        const match = text.match(/(JTR-\d{4}-\d{3,})/i);

        if (match && LINE_CHANNEL_ACCESS_TOKEN) {
          const jtrId = match[1].toUpperCase();
          const ticket = await getEnrichedTicketById(supabase, jtrId);
          if (ticket) {
            const flex = buildTicketFlexMessage(ticket, "📋 รับเรื่องแจ้งซ่อมเรียบร้อยแล้ว", cfg);
            const res = await fetch("https://api.line.me/v2/bot/message/reply", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
              },
              body: JSON.stringify({
                replyToken: ev.replyToken,
                messages: [flex],
              }),
            });

            const resText = await res.text();
            await logNotification(
              supabase,
              jtrId,
              "LINE_REPLY",
              "TICKET_CREATED_REPLY",
              senderLineId,
              res.ok ? "SENT" : "FAILED",
              res.ok ? "" : `HTTP ${res.status}: ${resText}`
            );
          }
        }
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
