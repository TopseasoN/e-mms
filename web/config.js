/**
 * e-MMS : Frontend Configuration (Supabase Sub-Second Mode + GAS Fallback)
 * ---------------------------------------------------------------------------
 * โหมดการทำงาน:
 *   1. โหมดความเร็วสูง (Primary — แนะนำ): กรอก SUPABASE_URL และ SUPABASE_ANON_KEY
 *      หน้าเว็บ LIFF จะเชื่อมต่อกับ Supabase (PostgREST + Storage) โดยตรง (< 1 วินาที)
 *   2. โหมดสำรอง (Fallback): หากยังไม่ได้กรอก SUPABASE_URL ระบบจะใช้ API_URL (Apps Script) อัตโนมัติ
 */
window.EMMS_CONFIG = {
  // --- 1. Supabase Configuration (Primary Data Store & Storage) ---
  // ตัวอย่าง: 'https://abcdefghijklm.supabase.co'
  SUPABASE_URL: '',
  // Public Anon Key จากหน้า Supabase Dashboard -> Project Settings -> API
  SUPABASE_ANON_KEY: '',
  // ชื่อ Bucket สำหรับเก็บรูปภาพก่อนซ่อม/หลังซ่อมบน Supabase Storage
  SUPABASE_BUCKET: 'ticket-attachments',

  // --- 2. Google Apps Script Web App URL (Fallback / Reporting Sync) ---
  API_URL: 'https://script.google.com/macros/s/AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk/exec',

  // หากเว้นว่างไว้ ระบบจะดึง LIFF_ID จากตาราง Sys_Config มาให้อัตโนมัติ
  LIFF_ID: '',

  // เปิดโหมดทดสอบบนเบราว์เซอร์คอมพิวเตอร์กรณีไม่ได้เปิดในแอป LINE
  ALLOW_BROWSER_DEV_MODE: true
};
