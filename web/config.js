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
  // Base Project URL (ตัด /rest/v1 ออกเพื่อให้ Supabase SDK ใช้งานได้ทั้ง Database และ Storage)
  SUPABASE_URL: 'https://nzmdyjhbogbichusgqjh.supabase.co',
  // Public Anon Key จากหน้า Supabase Dashboard -> Project Settings -> API
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWR5amhib2diaWNodXNncWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjE2ODMsImV4cCI6MjEwOTAzNzY4M30.kur4tbOJ1bRdFQpfMM04I76429BDy3wVDkll__ilNwI',
  // ชื่อ Bucket สำหรับเก็บรูปภาพก่อนซ่อม/หลังซ่อมบน Supabase Storage
  SUPABASE_BUCKET: 'ticket-attachments',

  // --- 2. Google Apps Script Web App URL (Fallback / Reporting Sync) ---
  API_URL: 'https://script.google.com/macros/s/AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk/exec',

  // LIFF ID จาก LINE Developers Console
  LIFF_ID: '2012286335-4EtoE0Pf',

  // เปิดโหมดทดสอบบนเบราว์เซอร์คอมพิวเตอร์กรณีไม่ได้เปิดในแอป LINE
  ALLOW_BROWSER_DEV_MODE: true
};
