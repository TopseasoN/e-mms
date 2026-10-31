# AGENTS.md — กฎสำหรับ AI agent ในโปรเจกต์ e-MMS

1. **ก่อนลงมือทำงานใด ๆ ให้อ่าน [PRIVATE_SYSTEM_INFO.md](PRIVATE_SYSTEM_INFO.md) ให้จบก่อนเสมอ** — มีสถานะปัจจุบัน, IDs/URLs จริง, มติการออกแบบ 20 ข้อ, สถาปัตยกรรม Supabase Sub-Second, วิธี deploy และ gotchas (ไฟล์นี้เป็นข้อมูลส่วนตัวเฉพาะในเครื่อง ถูก gitignore ไว้)
2. ห้ามเปลี่ยนมติการออกแบบ (PRIVATE_SYSTEM_INFO.md หัวข้อ 6) โดยไม่ถามเจ้าของก่อน
3. **สถาปัตยกรรมหลัก (Supabase + LIFF + Google Sheets Read-Only Sync)**:
   - **Database & Storage หลัก**: Supabase PostgreSQL + Supabase Storage (`ticket-attachments`) โครงสร้างอยู่ใน `supabase/migrations/20261101000000_init_emms_schema.sql`
   - **Decoupled Notifications**: Supabase Edge Functions ใน `supabase/functions/` (`notify-event`, `telegram-webhook`, `line-webhook`)
   - **Frontend (`web/`)**: เชื่อมต่อ Supabase ตรงผ่าน `@supabase/supabase-js` เพื่อลด Latency เหลือ < 1–2 วินาที (พร้อม Fallback ไปยัง Apps Script อัตโนมัติหากยังไม่ได้ตั้งค่า `SUPABASE_URL`)
   - **Google Sheets Reporting (`apps-script/`)**: ทำหน้าที่เป็น Consumer/Viewer (Read-Only) ดึงข้อมูลจาก Supabase REST API ทุก 1 ชั่วโมงผ่าน `apps-script/SupabaseSync.js`
4. **การแก้ไข Backend Apps Script**: แก้ใน `apps-script/` → `node --check` → `clasp push --force` → `clasp deploy -i AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk` (ห้ามสร้าง deployment ใหม่ ปัจจุบันคือ `@7`)
5. **การแก้ไข Schema**: ต้องรักษาให้ตรงกันทั้งใน `supabase/migrations/` และ `DB_SCHEMA` ใน `apps-script/SetupDatabase.js` (แล้วรัน `node tools/export_schema.js`) เพื่อให้ระบบ Sync ลง Google Sheets ทำงานได้ตรงคอลัมน์ 100%
6. ห้าม commit โฟลเดอร์ `Databases/` และห้ามใส่ token/secret (เช่น `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `LINE_CHANNEL_ACCESS_TOKEN`) ลงในโค้ดหรือในชีตโดยเด็ดขาด
7. **ทำงานเสร็จทุกครั้ง ให้อัปเดต [PRIVATE_SYSTEM_INFO.md](PRIVATE_SYSTEM_INFO.md)** หัวข้อ 5 (สถานะปัจจุบัน), 11 (Changelog), 12 (งานที่เหลือ) และเลข Deployment version ในหัวข้อ 1 เท่านั้น **(ห้ามนำข้อมูลระบบจริงกลับไปใส่ใน README.md เด็ดขาด เพราะ README.md บน GitHub มีไว้เฉพาะหัวข้อที่ 1 โครงการนี้คืออะไร เท่านั้น)**
8. สื่อสารกับเจ้าของเป็นภาษาไทย
