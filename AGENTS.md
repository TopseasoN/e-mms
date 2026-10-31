# AGENTS.md — กฎสำหรับ AI agent ในโปรเจกต์ e-MMS

1. **ก่อนลงมือทำงานใด ๆ ให้อ่าน [README.md](README.md) ให้จบก่อนเสมอ** — มีสถานะปัจจุบัน, IDs/URLs จริง, มติการออกแบบ 20 ข้อ, วิธี deploy และ gotchas
2. ห้ามเปลี่ยนมติการออกแบบ (README หัวข้อ 6) โดยไม่ถามเจ้าของก่อน
3. Backend: แก้ใน `apps-script/` → `node --check` → `clasp push --force` → `clasp deploy -i AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk` (ห้ามสร้าง deployment ใหม่)
4. Schema: แก้ `DB_SCHEMA` ใน `apps-script/SetupDatabase.js` เท่านั้น แล้วรัน `node tools/export_schema.js`
5. ห้าม commit โฟลเดอร์ `Databases/` และห้ามใส่ token/secret ในโค้ดหรือในชีต
6. **ทำงานเสร็จทุกครั้ง ให้อัปเดต README.md** หัวข้อ 5 (สถานะปัจจุบัน), 12 (Changelog), 13 (งานที่เหลือ) และเลข Deployment version ในหัวข้อ 3
7. สื่อสารกับเจ้าของเป็นภาษาไทย
