/**
 * e-MMS : Shared Helpers for Supabase Edge Functions (Deno)
 * ---------------------------------------------------------------------------
 * ประกอบด้วย:
 *  - ฟังก์ชันดึงข้อมูลใบงานพร้อม Enrich (อาคาร, ชั้น, หมวดงาน, รูป, ช่าง)
 *  - ฟอร์แมตการ์ด Telegram (HTML + Inline Keyboard)
 *  - ฟอร์แมตการ์ด LINE Flex Message (สำหรับ Reply ฟรี และ Push ตามโควต้า)
 *  - บันทึก Sys_NotificationLogs และตรวจสอบโควต้า LINE Push 300 ข้อความ/เดือน
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function escapeHtml(s: unknown): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** แปลงวันที่เป็นรูปแบบไทย dd/MM/yyyy(พ.ศ.) HH:mm (Asia/Bangkok) */
export function formatThaiDateTime(isoOrDate: unknown): string {
  if (!isoOrDate) return "-";
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(String(isoOrDate));
  if (isNaN(d.getTime())) return String(isoOrDate);

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const yearBE = Number(map.year) + 543;
  return `${map.day}/${map.month}/${yearBE} ${map.hour}:${map.minute}`;
}

export async function getConfigMap(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("Sys_Config").select("config_key, config_value");
  const cfg: Record<string, string> = {};
  for (const r of data || []) {
    cfg[String(r.config_key).trim()] = String(r.config_value ?? "").trim();
  }
  return cfg;
}

export function buildLiffUrl(cfg: Record<string, string>, jtrId?: string): string {
  const rawLiff = cfg.LIFF_ID || "";
  const match = rawLiff.match(/liff\.line\.me\/([0-9]+-[a-zA-Z0-9_-]+)/i);
  const liffId = match ? match[1] : rawLiff.split(/[?#/]/)[0].trim();
  const webUrl = cfg.WEB_BASE_URL || "https://topseason.github.io/e-mms/web/";

  if (liffId) {
    return `https://liff.line.me/${liffId}${jtrId ? `?jtr=${encodeURIComponent(jtrId)}` : ""}`;
  }
  return `${webUrl}${jtrId ? `?jtr=${encodeURIComponent(jtrId)}` : ""}`;
}

/** ดึงข้อมูลใบงาน 1 รายการพร้อมประกบชื่ออาคาร/ชั้น/หมวด/รูป/ช่างครบ */
export async function getEnrichedTicketById(supabase: SupabaseClient, jtrId: string) {
  const { data: row } = await supabase
    .from("Trans_JobTickets")
    .select("*")
    .eq("jtr_id", jtrId)
    .single();

  if (!row) return null;

  const [
    { data: bld },
    { data: loc },
    { data: cats },
    { data: st },
    { data: users },
    { data: atts },
    { data: asgs },
  ] = await Promise.all([
    supabase.from("Master_Buildings").select("bld_id, bld_name").eq("bld_id", row.bld_id).maybeSingle(),
    supabase.from("Master_Locations").select("loc_id, loc_name").eq("loc_id", row.loc_id).maybeSingle(),
    supabase.from("Master_Categories").select("cat_id, main_category, sub_category"),
    supabase.from("Master_Statuses").select("*").eq("status_code", row.status).maybeSingle(),
    supabase.from("Master_Users").select("user_id, user_name, user_phone, line_user_id"),
    supabase.from("Trans_Attachments").select("*").eq("jtr_id", jtrId).order("seq", { ascending: true }),
    supabase.from("Trans_Assignments").select("*").eq("jtr_id", jtrId),
  ]);

  const catMap: Record<string, { main_category: string; sub_category: string }> = {};
  for (const c of cats || []) {
    catMap[c.cat_id] = { main_category: c.main_category, sub_category: c.sub_category };
  }

  const userMap: Record<string, { user_name: string; line_user_id: string }> = {};
  for (const u of users || []) {
    userMap[u.user_id] = { user_name: u.user_name, line_user_id: u.line_user_id || "" };
  }

  const catRep = catMap[row.cat_id_reported] || { main_category: "", sub_category: "" };
  const catAct = catMap[row.cat_id_actual || row.cat_id_reported] || catRep;

  const imagesBefore = (atts || []).filter((a) => a.att_type === "BEFORE");
  const imagesAfter = (atts || []).filter((a) => a.att_type === "AFTER");

  const assignments = (asgs || []).map((a) => ({
    asg_id: a.asg_id,
    tech_id: a.tech_id,
    tech_name: userMap[a.tech_id]?.user_name || a.tech_id,
    is_first_accepter: Boolean(a.is_first_accepter),
  }));

  return {
    ...row,
    created_at_th: formatThaiDateTime(row.created_at),
    first_accepted_at_th: formatThaiDateTime(row.first_accepted_at),
    finished_at_th: formatThaiDateTime(row.finished_at),
    bld_name: bld?.bld_name || row.bld_id,
    loc_name: loc?.loc_name || row.loc_id,
    main_category: catAct.main_category,
    sub_category: catAct.sub_category,
    status_label_th: st?.status_label_th || row.status,
    status_color: st?.status_color || "#2196F3",
    is_final: Boolean(st?.is_final),
    notify_requester: Boolean(st?.notify_requester),
    requester_line_id: userMap[row.requester_id]?.line_user_id || "",
    first_accepted_by_name: row.first_accepted_by ? (userMap[row.first_accepted_by]?.user_name || "") : "",
    images_before: imagesBefore,
    images_after: imagesAfter,
    assignments,
    assigned_names: assignments.map((a) => a.tech_name).join(", "),
  };
}

/** สร้างข้อความ HTML สำหรับการ์ดในกลุ่ม Telegram */
export function formatTelegramTicketHtml(t: Record<string, any>): string {
  const statusIconMap: Record<string, string> = {
    PENDING: "🆕",
    ACCEPTED: "🛠",
    IN_PROGRESS: "⚙️",
    ON_HOLD: "⏳",
    COMPLETED: "✅",
    CANNOT_REPAIR: "❌",
    CANCELLED: "🚫",
  };
  const icon = statusIconMap[t.status] || "📌";
  const lines = [
    `${icon} <b>[${escapeHtml(t.jtr_id)}] ${escapeHtml(t.status_label_th)}</b>`,
    "━━━━━━━━━━━━━━━━━━",
    `📍 <b>สถานที่:</b> ${escapeHtml(t.bld_name)} › ${escapeHtml(t.loc_name)}${
      t.room ? ` (ห้อง <b>${escapeHtml(t.room)}</b>)` : ""
    }`,
    `🏷 <b>หมวดงาน:</b> ${escapeHtml(t.main_category)} › ${escapeHtml(t.sub_category)}`,
    `📝 <b>อาการ/ปัญหา:</b> ${escapeHtml(t.description)}`,
    `👤 <b>ผู้แจ้ง:</b> ${escapeHtml(t.requester_name)}${
      t.requester_division ? ` (${escapeHtml(t.requester_division)})` : ""
    }${t.requester_phone ? ` • โทร: <a href="tel:${escapeHtml(t.requester_phone)}">${escapeHtml(t.requester_phone)}</a>` : ""}`,
    `🕒 <b>แจ้งเมื่อ:</b> ${escapeHtml(t.created_at_th)}`,
  ];

  if (t.first_accepted_by_name) {
    lines.push(`🙋‍♂️ <b>รับงานโดย:</b> ${escapeHtml(t.first_accepted_by_name)} (${escapeHtml(t.first_accepted_at_th)})`);
  }
  if (t.assigned_names) {
    lines.push(`👷 <b>ทีมช่างผู้ร่วมงาน:</b> ${escapeHtml(t.assigned_names)}`);
  }
  if (t.status === "ON_HOLD" && t.on_hold_reason) {
    lines.push(`⏳ <b>เหตุผลที่รอ:</b> ${escapeHtml(t.on_hold_reason)}`);
  }
  if (t.status === "COMPLETED") {
    if (t.cause_solution) lines.push(`🔧 <b>การแก้ไข:</b> ${escapeHtml(t.cause_solution)}`);
    if (t.materials_used) lines.push(`📦 <b>วัสดุที่ใช้:</b> ${escapeHtml(t.materials_used)}`);
    lines.push(`🏁 <b>เสร็จเมื่อ:</b> ${escapeHtml(t.finished_at_th)}`);
  }
  if (t.status === "CANNOT_REPAIR" && (t.tech_note || t.cause_solution)) {
    lines.push(`⚠️ <b>เหตุผลที่ซ่อมไม่ได้:</b> ${escapeHtml(t.tech_note || t.cause_solution)}`);
  }
  if (t.status === "CANCELLED" && t.cancel_reason) {
    lines.push(`🚫 <b>เหตุผลที่ยกเลิก:</b> ${escapeHtml(t.cancel_reason)}`);
  }
  if (t.images_before?.length > 0) {
    const links = t.images_before
      .map((img: any, i: number) => `<a href="${escapeHtml(img.file_url)}">รูปแจ้ง #${i + 1}</a>`)
      .join(" | ");
    lines.push(`🖼 <b>รูปก่อนซ่อม:</b> ${links}`);
  }
  if (t.images_after?.length > 0) {
    const links = t.images_after
      .map((img: any, i: number) => `<a href="${escapeHtml(img.file_url)}">รูปหลังซ่อม #${i + 1}</a>`)
      .join(" | ");
    lines.push(`📸 <b>รูปหลังซ่อม:</b> ${links}`);
  }

  return lines.join("\n");
}

export function buildTelegramKeyboard(t: Record<string, any>, cfg: Record<string, string>) {
  const rows: any[] = [];
  if (t.status === "PENDING") {
    rows.push([{ text: `🛠 กดรับงานนี้ (${t.jtr_id})`, callback_data: `ACCEPT|${t.jtr_id}` }]);
  }
  const liffUrl = buildLiffUrl(cfg, t.jtr_id);
  if (liffUrl && /^https:\/\//.test(liffUrl)) {
    rows.push([{ text: "🔍 เปิดดู / อัปเดตงานใน LINE", url: liffUrl }]);
  }
  return { inline_keyboard: rows };
}

/** สร้าง LINE Flex Message Bubble */
export function buildTicketFlexMessage(ticket: Record<string, any>, titlePrefix: string, cfg: Record<string, string>) {
  let heroImgUrl = "";
  if ((ticket.status === "COMPLETED" || ticket.status === "CANNOT_REPAIR") && ticket.images_after?.length) {
    heroImgUrl = ticket.images_after[0].file_url;
  } else if (ticket.images_before?.length) {
    heroImgUrl = ticket.images_before[0].file_url;
  }

  const locText = `${ticket.bld_name} • ${ticket.loc_name}${ticket.room ? ` (ห้อง ${ticket.room})` : ""}`;
  const catText = `${ticket.main_category}${ticket.sub_category ? ` › ${ticket.sub_category}` : ""}`;

  const kvRow = (label: string, value: string) => ({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#64748B", size: "xs", flex: 3 },
      { type: "text", text: value || "-", wrap: true, color: "#0F172A", size: "xs", flex: 7 },
    ],
  });

  const rows = [
    kvRow("สถานที่", locText),
    kvRow("หมวดงาน", catText),
    kvRow("อาการ/ปัญหา", ticket.description || "-"),
    kvRow("วันที่แจ้ง", ticket.created_at_th || "-"),
  ];

  if (ticket.first_accepted_by_name || ticket.assigned_names) {
    rows.push(kvRow("ช่างผู้รับผิดชอบ", ticket.assigned_names || ticket.first_accepted_by_name));
  }
  if (ticket.status === "ON_HOLD" && ticket.on_hold_reason) {
    rows.push(kvRow("เหตุผลที่รอ", ticket.on_hold_reason));
  }
  if (ticket.status === "COMPLETED") {
    if (ticket.cause_solution) rows.push(kvRow("การแก้ไข", ticket.cause_solution));
    if (ticket.materials_used) rows.push(kvRow("วัสดุที่ใช้", ticket.materials_used));
    if (ticket.finished_at_th && ticket.finished_at_th !== "-") rows.push(kvRow("เสร็จเมื่อ", ticket.finished_at_th));
  }
  if (ticket.status === "CANNOT_REPAIR" && (ticket.tech_note || ticket.cause_solution)) {
    rows.push(kvRow("เหตุผล", ticket.tech_note || ticket.cause_solution));
  }

  const bubble: Record<string, any> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: ticket.status_color || "#1565C0",
      paddingAll: "12px",
      contents: [{ type: "text", text: titlePrefix, color: "#FFFFFF", weight: "bold", size: "sm" }],
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            { type: "text", text: ticket.jtr_id, weight: "bold", size: "md", color: "#1E293B", flex: 1 },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: ticket.status_color || "#2196F3",
              cornerRadius: "12px",
              paddingAll: "4px",
              paddingStart: "10px",
              paddingEnd: "10px",
              contents: [
                {
                  type: "text",
                  text: ticket.status_label_th || ticket.status,
                  color: "#FFFFFF",
                  size: "xs",
                  weight: "bold",
                  align: "center",
                },
              ],
            },
          ],
        },
        { type: "separator", margin: "md" },
        { type: "box", layout: "vertical", margin: "md", spacing: "sm", contents: rows },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: "#1565C0",
          action: { type: "uri", label: "ดูรายละเอียดในระบบ e-MMS", uri: buildLiffUrl(cfg, ticket.jtr_id) },
        },
      ],
    },
  };

  if (heroImgUrl && /^https:\/\//.test(heroImgUrl)) {
    bubble.hero = {
      type: "image",
      url: heroImgUrl,
      size: "full",
      aspectRatio: "16:10",
      aspectMode: "cover",
    };
  }

  return {
    type: "flex",
    altText: `${titlePrefix} [${ticket.jtr_id}] สถานะ: ${ticket.status_label_th || ticket.status}`,
    contents: bubble,
  };
}

export async function logNotification(
  supabase: SupabaseClient,
  jtrId: string,
  channel: "LINE_REPLY" | "LINE_PUSH" | "TELEGRAM",
  event: string,
  target: string,
  result: "SENT" | "FAILED",
  errorMessage = ""
) {
  await supabase.from("Sys_NotificationLogs").insert({
    jtr_id: jtrId || "",
    channel,
    event,
    target,
    result,
    error_message: errorMessage,
    sent_at: new Date().toISOString(),
  });
}
