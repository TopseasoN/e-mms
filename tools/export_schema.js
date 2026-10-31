#!/usr/bin/env node
/**
 * สร้าง CSV (1 ไฟล์ต่อ 1 ชีต) + docs/DATABASE.md จาก DB_SCHEMA ใน apps-script/SetupDatabase.js
 * ใช้: node tools/export_schema.js
 */
const fs = require('fs');
const path = require('path');
const { DB_SCHEMA, buildSeeds_ } = require('../apps-script/SetupDatabase.js');

const ROOT = path.join(__dirname, '..');
const CSV_DIR = path.join(ROOT, 'Databases', 'e-MMS_v1');
const DOC_FILE = path.join(ROOT, 'docs', 'DATABASE.md');

fs.mkdirSync(CSV_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DOC_FILE), { recursive: true });

const csvCell = (v) => {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const seeds = buildSeeds_();

// ---------- CSV ----------
for (const t of DB_SCHEMA) {
  const rows = [t.columns.map((c) => c.key), ...(seeds[t.name] || [])];
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(CSV_DIR, `e-MMS_v1 - ${t.name}.csv`), csv, 'utf8');
}

// ---------- Markdown ----------
const groups = { master: 'Master (ข้อมูลหลัก — admin แก้ใน Google Sheets ได้)', transaction: 'Transaction (ระบบเขียนอัตโนมัติ)', system: 'System (ตั้งค่า/บันทึกระบบ)' };
const erType = (c) => ({ id: 'string', fk: 'string', text: 'string', longtext: 'string', url: 'string', int: 'int', number: 'float', bool: 'boolean', enum: 'string', datetime: 'datetime' }[c.type]);

let md = `# e-MMS — Database Schema (Google Sheets)\n\n`;
md += `> ไฟล์นี้สร้างอัตโนมัติจาก \`apps-script/SetupDatabase.js\` ด้วย \`node tools/export_schema.js\` — อย่าแก้ด้วยมือ\n\n`;
md += `ทั้งหมด **${DB_SCHEMA.length} ชีต** · คีย์หลักอยู่คอลัมน์ A เสมอ · FK อ้างอิงด้วยรหัส (ไม่ใช่ชื่อ) · ห้ามลบแถว master ให้ใช้ \`is_active = FALSE\`\n\n`;

md += `## ER Diagram\n\n\`\`\`mermaid\nerDiagram\n`;
const rels = [];
for (const t of DB_SCHEMA) {
  if (!['master', 'transaction'].includes(t.group)) continue;
  md += `  ${t.name} {\n`;
  for (const c of t.columns) md += `    ${erType(c)} ${c.key}${c.type === 'id' ? ' PK' : c.type === 'fk' ? ' FK' : ''}\n`;
  md += `  }\n`;
  for (const c of t.columns) if (c.type === 'fk') rels.push(`  ${c.ref} ||--o{ ${t.name} : "${c.key}"`);
}
md += rels.join('\n') + '\n```\n\n';

const colLetter = (i) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));

for (const [g, title] of Object.entries(groups)) {
  md += `## ${title}\n\n`;
  for (const t of DB_SCHEMA.filter((x) => x.group === g)) {
    const n = (seeds[t.name] || []).length;
    md += `### ${t.name}\n\n${t.description}${n ? ` · seed ${n} แถว` : ''}\n\n| คอลัมน์ | ชื่อฟิลด์ | ชนิด | คำอธิบาย |\n|---|---|---|---|\n`;
    t.columns.forEach((c, i) => {
      const type = c.type === 'fk' ? `FK → ${c.ref}` : c.type === 'enum' ? `enum` : c.type;
      const desc = c.desc + (c.values ? `<br>ค่า: \`${c.values.join('` `')}\`` : '');
      md += `| ${colLetter(i)} | \`${c.key}\` | ${type} | ${desc} |\n`;
    });
    md += '\n';
  }
}

fs.writeFileSync(DOC_FILE, md, 'utf8');
console.log(`✓ ${DB_SCHEMA.length} CSV → ${path.relative(ROOT, CSV_DIR)}`);
console.log(`✓ ${path.relative(ROOT, DOC_FILE)}`);
