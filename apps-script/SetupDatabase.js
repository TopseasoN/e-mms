/**
 * e-MMS : e-MaintenanceManagementSystem — ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์
 * ---------------------------------------------------------------------------
 * Database schema (Google Sheets) + one-click setup.
 *
 * วิธีใช้ (Google Apps Script):
 *   1. สร้าง Google Sheets ใหม่ → Extensions → Apps Script
 *   2. วางไฟล์นี้ แล้วรันฟังก์ชัน setupDatabase()
 *   3. สคริปต์จะสร้างชีตทั้งหมด + หัวตาราง + dropdown/checkbox + ข้อมูลตั้งต้น (seed)
 *      - รันซ้ำได้ (idempotent): ชีตที่มีอยู่แล้วจะไม่ถูกลบข้อมูล, seed จะใส่เฉพาะชีตที่ยังว่าง
 *
 * ไฟล์นี้เป็น "แหล่งความจริงเดียว" ของโครงสร้างฐานข้อมูล
 *   - tools/export_schema.js อ่าน DB_SCHEMA จากไฟล์นี้เพื่อสร้าง CSV และ docs/DATABASE.md
 *
 * Secrets (ห้ามเก็บในชีต) → เก็บใน Project Settings → Script Properties:
 *   LINE_CHANNEL_ACCESS_TOKEN, LINE_LOGIN_CHANNEL_ID, TELEGRAM_BOT_TOKEN,
 *   LINE_WEBHOOK_KEY, TELEGRAM_WEBHOOK_KEY
 */

/* ========================================================================== */
/*  ENUMS                                                                     */
/* ========================================================================== */

var ENUMS = {
  ROLES: ['user', 'technician', 'admin'],
  STATUSES: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANNOT_REPAIR', 'CANCELLED'],
  ATTACHMENT_TYPES: ['BEFORE', 'AFTER'],
  CHANGED_VIA: ['LIFF', 'TELEGRAM', 'ADMIN', 'SYSTEM'],
  NOTIFY_CHANNELS: ['LINE_REPLY', 'LINE_PUSH', 'TELEGRAM'],
  NOTIFY_RESULTS: ['SENT', 'FAILED'],
  AUDIT_ACTIONS: [
    'LOGIN_SUCCESS', 'LOGIN_FAIL', 'LINK_LINE', 'UNLINK_LINE',
    'LINK_TELEGRAM', 'USER_CREATE', 'USER_UPDATE', 'USER_DISABLE'
  ]
};

/* ========================================================================== */
/*  SEED DATA                                                                 */
/* ========================================================================== */

/** สังกัด → ส่วนงาน (จาก e-MMS_Databases - Master_Departments.csv) */
var SEED_DEPARTMENTS = [
  ['สถาบันพัฒนาการชลประทาน', 'ส่วนบริหารทั่วไป'],
  ['สถาบันพัฒนาการชลประทาน', 'ส่วนถ่ายทอดเทคโนโลยีและนวัตกรรมชลประทาน'],
  ['สถาบันพัฒนาการชลประทาน', 'ส่วนจัดการด้านกายภาพและทดสอบมาตรฐานด้านชลประทานและน้ำ'],
  ['สถาบันพัฒนาการชลประทาน', 'ส่วนวิจัยเทคโนโลยีและนวัตกรรมการชลประทาน'],
  ['สถาบันพัฒนาการชลประทาน', 'ส่วนสื่อสารองค์กรและเทคโนโลยีสารสนเทศ'],
  ['วิทยาลัยการชลประทาน', 'อาจารย์ประจำ'],
  ['วิทยาลัยการชลประทาน', 'อาจารย์ประจำหอพัก'],
  ['วิทยาลัยการชลประทาน', 'เจ้าหน้าที่'],
  ['วิทยาลัยการชลประทาน', 'นิสิต / นักศึกษา'],
  ['เจ้าหน้าที่', 'แม่บ้าน / คนสวน / รปภ.']
];

/** อาคาร → ชั้น/บริเวณ (จาก Old_ระบบแจ้งซ่อมออนไลน์ - Data_สถานที่.csv) */
var SEED_BUILDINGS = [
  ['อาคารอำนวยการ', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['อาคารหอประชุม ชูชาติ กำภู', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['อาคารหอประวัติ', ['ชั้น 1', 'ชั้น 2 ลานอเนกประสงค์']],
  ['อาคารอรุณอินทรปาลิต', ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น 4']],
  ['อาคารศูนย์ฝึกอบรม (NEWMASIP)', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['อาคารเรียน 1', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['อาคารเรียน 2', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['หอพัก 1 (หญิง)', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['หอพัก 2 (ชาย)', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['หอพัก 3 (ชาย)', ['ชั้น 1', 'ชั้น 2', 'บริเวณรอบอาคาร']],
  ['หอพัก 5 (ชาย)', ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น 4', 'บริเวณรอบอาคาร']],
  ['โรงอาหารสถาบันพัฒนาการชลประทาน', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['อาคารโรงอาหาร 400 ที่นั่งบริเวณหอประชุม', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['อาคาร 80 ปีวิทยาลัยการชลประทาน', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['บ้านพักรับรอง waterman home', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['สถานีการสาธิตเทคโนโลยีสำหรับการบริหารจัดการน้ำ', ['ภายในอาคาร', 'บริเวณรอบอาคาร']],
  ['อื่น ๆ', ['โปรดระบุในรายละเอียดการแจ้งซ่อม']]
];

/** ห้อง (ตัวช่วย autocomplete เท่านั้น — ผู้แจ้งพิมพ์ห้องเองได้เสมอ) */
var SEED_ROOMS = [
  // [ชื่ออาคาร, ชั้น/บริเวณ, ห้อง, หมายเหตุ]
  ['อาคารอำนวยการ', 'ชั้น 1', 'A16', 'ส่วนสื่อสารองค์กรและเทคโนโลยีสารสนเทศ'],
  ['อาคารอำนวยการ', 'ชั้น 1', 'A17', '']
];

/** หมวดหลัก → หมวดย่อย (จาก e-MMS_Databases - Master_Categorys.csv + เพิ่ม "อื่นๆ" ให้ทุกหมวด) */
var SEED_CATEGORIES = [
  ['ไฟฟ้า', ['หลอดไฟ / แสงสว่าง', 'ปลั๊กไฟ / สวิตช์ไฟ / เบรกเกอร์', 'อื่นๆ (ระบบไฟฟ้า)']],
  ['ประปา', ['ชักโครก / โถปัสสาวะ', 'ก๊อกน้ำ / ฝักบัว / สายชำระ', 'อ่างล้างหน้า / ซิงค์ล้างจาน / ท่อน้ำทิ้งตัน',
            'ปั๊มน้ำ / ระบบน้ำส่วนกลาง / ท่อน้ำ', 'อื่นๆ (ระบบประปา)']],
  ['เครื่องปรับอากาศ (แอร์)', ['น้ำหยด', 'ไม่ทำความเย็น', 'เปิดไม่ติด / ไม่ทำงาน', 'อื่นๆ (เครื่องปรับอากาศ)']],
  ['เครื่องใช้ไฟฟ้า', ['พัดลม / ตู้เย็น / ทีวี', 'โปรเจคเตอร์', 'ชุดเครื่องเสียง', 'ตู้ทำน้ำเย็น / เครื่องกรองน้ำ',
                      'อื่นๆ (เครื่องใช้ไฟฟ้า)']],
  ['อาคารและเฟอร์นิเจอร์', ['ประตู / หน้าต่าง / ลูกบิด', 'หลังคา / เพดาน / ผนัง', 'โต๊ะ / ตู้ / เตียง / เก้าอี้',
                           'อื่นๆ (อาคารและเฟอร์นิเจอร์)']],
  ['อินเทอร์เน็ต', ['อินเทอร์เน็ต']],
  ['งานติดตั้ง', ['งานติดตั้ง']],
  ['อื่น ๆ', ['อื่น ๆ (โปรดระบุในรายละเอียด)']]
];

/** สถานะงาน + การตั้งค่าแจ้งเตือนผู้แจ้ง (LINE Push) */
var SEED_STATUSES = [
  // code, label_th, color, sort, is_final, notify_requester
  ['PENDING',       'รอตรวจสอบ',            '#9E9E9E', 1, false, false],
  ['ACCEPTED',      'รับงานแล้ว',            '#2196F3', 2, false, true],
  ['IN_PROGRESS',   'กำลังดำเนินการ',        '#FF9800', 3, false, false],
  ['ON_HOLD',       'รออะไหล่ / รอจัดซื้อ',   '#9C27B0', 4, false, true],
  ['COMPLETED',     'ดำเนินการเสร็จสิ้น',     '#4CAF50', 5, true,  true],
  ['CANNOT_REPAIR', 'ไม่สามารถซ่อมแซมได้',   '#F44336', 6, true,  true],
  ['CANCELLED',     'ยกเลิกโดยผู้แจ้ง',       '#607D8B', 7, true,  false]
];

/** ผู้ใช้ตั้งต้น: user จากไฟล์เดิม + ทีมช่าง 5 คนจากข้อมูลระบบเก่า (กรอก username/password ภายหลัง) */
var SEED_USERS = [
  // username, password, name, phone, dept_index(1-based ใน SEED_DEPARTMENTS), role, note
  ['thanawat.b', '19032540', 'นายธนาวัฒน์ บุตรศรี', '', 1, 'admin', ''],
  ['', '', 'สุรชาติ', '', 3, 'technician', 'ช่าง — กรอก username/password/ชื่อเต็ม'],
  ['', '', 'ทิตติพงค์', '', 3, 'technician', 'ช่าง — กรอก username/password/ชื่อเต็ม'],
  ['', '', 'พิชัย', '', 3, 'technician', 'ช่าง — กรอก username/password/ชื่อเต็ม'],
  ['', '', 'นพพล', '', 3, 'technician', 'ช่าง — กรอก username/password/ชื่อเต็ม'],
  ['', '', 'พีระชัย', '', 3, 'technician', 'ช่าง — กรอก username/password/ชื่อเต็ม']
];

/** ค่าตั้งค่าระบบ (ไม่ใช่ความลับ) */
var SEED_CONFIG = [
  ['SYSTEM_NAME', 'e-MMS ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์', 'ชื่อระบบที่แสดงใน UI/ข้อความแจ้งเตือน'],
  ['ORG_NAME', 'สถาบันพัฒนาการชลประทาน', 'ชื่อหน่วยงาน'],
  ['TIMEZONE', 'Asia/Bangkok', 'เขตเวลา'],
  ['LIFF_ID', '', 'LIFF ID จาก LINE Developers Console'],
  ['WEB_BASE_URL', 'https://topseason.github.io/e-mms/web/', 'URL หน้าเว็บบน GitHub Pages'],
  ['TELEGRAM_CHAT_ID', '', 'Chat ID ของกลุ่ม Telegram ทีมช่าง (ตัวเลขติดลบ)'],
  ['DRIVE_ROOT_FOLDER_ID', '1VSmtUyahQ3XTytpap1IROfKO_jTTP-ez', 'โฟลเดอร์ Google Drive หลักสำหรับเก็บรูป (แยกย่อยปี/เดือนอัตโนมัติ)'],
  ['MAX_IMAGES_BEFORE', '3', 'จำนวนรูปสูงสุดที่ผู้แจ้งแนบได้ (ขั้นต่ำ 1)'],
  ['MAX_IMAGES_AFTER', '3', 'จำนวนรูปหลังซ่อมสูงสุด (ขั้นต่ำ 1 ตอนปิดงาน)'],
  ['IMAGE_MAX_WIDTH', '1280', 'ย่อรูปฝั่งมือถือก่อนอัปโหลด (px)'],
  ['IMAGE_JPEG_QUALITY', '0.7', 'คุณภาพ JPEG หลังย่อ (0-1)'],
  ['LINE_PUSH_MONTHLY_LIMIT', '300', 'โควต้า Push ฟรีของ LINE OA ต่อเดือน'],
  ['LINE_PUSH_WARN_AT', '250', 'แจ้งเตือน Admin ใน Telegram เมื่อใช้ Push ถึงจำนวนนี้'],
  ['DAILY_SUMMARY_ENABLED', 'TRUE', 'ส่งสรุปงานค้างใน Telegram ทุกเช้า'],
  ['DAILY_SUMMARY_HOUR', '8', 'ชั่วโมงที่ส่งสรุป (0-23)'],
  ['DAILY_SUMMARY_WEEKDAYS', 'MON,TUE,WED,THU,FRI', 'วันที่ส่งสรุป'],
  ['DUPLICATE_CHECK_ENABLED', 'TRUE', 'เตือนผู้แจ้งเมื่อมีงานเปิดอยู่ในอาคาร/ชั้น/ห้องเดียวกัน'],
  ['FISCAL_YEAR_START_MONTH', '10', 'เดือนเริ่มปีงบประมาณ (ต.ค.)'],
  ['JTR_ID_PREFIX', 'JTR', 'คำนำหน้ารหัสงาน → JTR-YYMM-NNN (YY = ปี พ.ศ. 2 หลัก)'],
  ['LOGIN_MAX_FAILS', '5', 'จำนวนครั้งที่ login ผิดได้ก่อนถูกล็อกชั่วคราว'],
  ['LOGIN_LOCK_MINUTES', '15', 'ระยะเวลาล็อก (นาที)']
];

/* ---------- seed builders (pure JS: ใช้ได้ทั้ง Apps Script และ Node) ---------- */

function pad_(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

function buildSeeds_() {
  var seeds = {};

  seeds.Master_Departments = SEED_DEPARTMENTS.map(function (d, i) {
    return ['DEP' + pad_(i + 1, 2), d[0], d[1], i + 1, true];
  });

  var bldRows = [], locRows = [], locIndex = {}, locSeq = 0;
  SEED_BUILDINGS.forEach(function (b, i) {
    var bldId = 'BLD' + pad_(i + 1, 2);
    bldRows.push([bldId, b[0], i + 1, true]);
    b[1].forEach(function (loc, j) {
      locSeq++;
      var locId = 'LOC' + pad_(locSeq, 3);
      locRows.push([locId, bldId, loc, j + 1, true]);
      locIndex[b[0] + '|' + loc] = locId;
    });
  });
  seeds.Master_Buildings = bldRows;
  seeds.Master_Locations = locRows;

  seeds.Master_Rooms = SEED_ROOMS.map(function (r, i) {
    return ['ROOM' + pad_(i + 1, 4), locIndex[r[0] + '|' + r[1]], r[2], r[3], true];
  });

  var catRows = [], catSeq = 0;
  SEED_CATEGORIES.forEach(function (c) {
    c[1].forEach(function (sub) {
      catSeq++;
      catRows.push(['CAT' + pad_(catSeq, 3), c[0], sub, catSeq, true]);
    });
  });
  seeds.Master_Categories = catRows;

  seeds.Master_Statuses = SEED_STATUSES.map(function (s) { return s.slice(); });

  seeds.Master_Users = SEED_USERS.map(function (u, i) {
    return [
      'USER' + pad_(i + 1, 4), u[0], u[1], u[2], u[3],
      'DEP' + pad_(u[4], 2), u[5],
      '', '', '', '',          // line_user_id, line_display_name, line_linked_at, telegram_user_id
      true, '', '', u[6]       // is_active, created_at, updated_at, note
    ];
  });

  seeds.Sys_Config = SEED_CONFIG.map(function (c) { return c.slice(); });

  return seeds;
}

/* ========================================================================== */
/*  SCHEMA                                                                    */
/*  type: id | fk | text | longtext | int | number | bool | enum | datetime | url */
/* ========================================================================== */

var DB_SCHEMA = [
  /* ------------------------------ MASTER ------------------------------ */
  {
    name: 'Master_Users',
    group: 'master',
    color: '#1565C0',
    description: 'ผู้ใช้ทุกบทบาท (ผู้แจ้ง / ช่าง / admin) — 1 คน : 1 LINE : 1 Telegram',
    columns: [
      { key: 'user_id', type: 'id', desc: 'รหัสผู้ใช้ USER0001' },
      { key: 'user_username', type: 'text', desc: 'ชื่อผู้ใช้สำหรับ login ครั้งแรก (นักศึกษา = รหัสนักศึกษา) ห้ามซ้ำ' },
      { key: 'user_password', type: 'text', desc: 'รหัสผ่าน (วันเดือนปีเกิด ddmmyyyy พ.ศ. แบบเดียวกับ WiFi)' },
      { key: 'user_name', type: 'text', desc: 'ชื่อ-นามสกุล' },
      { key: 'user_phone', type: 'text', desc: 'เบอร์โทรศัพท์ (ดึงไปใส่ฟอร์มแจ้งซ่อมอัตโนมัติ แก้ได้ตอนแจ้ง)' },
      { key: 'dept_id', type: 'fk', ref: 'Master_Departments', desc: 'สังกัด/ส่วนงาน' },
      { key: 'user_role', type: 'enum', values: ENUMS.ROLES, desc: 'user | technician | admin' },
      { key: 'line_user_id', type: 'text', desc: 'LINE User ID (U...) บันทึกอัตโนมัติตอนผูกบัญชีครั้งแรก — ล้างค่าเพื่อให้ผูกใหม่' },
      { key: 'line_display_name', type: 'text', desc: 'ชื่อที่แสดงใน LINE (ตอนผูก)' },
      { key: 'line_linked_at', type: 'datetime', desc: 'วันเวลาที่ผูก LINE' },
      { key: 'telegram_user_id', type: 'text', desc: 'Telegram user ID (เฉพาะช่าง) ใช้ระบุว่าใครกด "รับงาน"' },
      { key: 'is_active', type: 'bool', desc: 'FALSE = ปิดการใช้งาน (เช่น นักศึกษาจบแล้ว)' },
      { key: 'created_at', type: 'datetime', desc: 'วันที่สร้าง' },
      { key: 'updated_at', type: 'datetime', desc: 'วันที่แก้ไขล่าสุด' },
      { key: 'note', type: 'text', desc: 'หมายเหตุ' }
    ]
  },
  {
    name: 'Master_Departments',
    group: 'master',
    color: '#1565C0',
    description: 'สังกัด → ส่วนงาน (1 แถว = 1 ส่วนงาน)',
    columns: [
      { key: 'dept_id', type: 'id', desc: 'รหัส DEP01' },
      { key: 'dept_name', type: 'text', desc: 'สังกัด' },
      { key: 'division_name', type: 'text', desc: 'ส่วนงาน' },
      { key: 'sort_order', type: 'int', desc: 'ลำดับแสดงผล' },
      { key: 'is_active', type: 'bool', desc: 'ใช้งาน' }
    ]
  },
  {
    name: 'Master_Buildings',
    group: 'master',
    color: '#2E7D32',
    description: 'อาคาร/พื้นที่',
    columns: [
      { key: 'bld_id', type: 'id', desc: 'รหัส BLD01' },
      { key: 'bld_name', type: 'text', desc: 'ชื่ออาคาร' },
      { key: 'sort_order', type: 'int', desc: 'ลำดับแสดงผล' },
      { key: 'is_active', type: 'bool', desc: 'ใช้งาน' }
    ]
  },
  {
    name: 'Master_Locations',
    group: 'master',
    color: '#2E7D32',
    description: 'ชั้น/บริเวณ ภายในอาคาร (dropdown ขั้นที่ 2)',
    columns: [
      { key: 'loc_id', type: 'id', desc: 'รหัส LOC001' },
      { key: 'bld_id', type: 'fk', ref: 'Master_Buildings', desc: 'อาคาร' },
      { key: 'loc_name', type: 'text', desc: 'ชั้น/บริเวณ เช่น ชั้น 1, บริเวณรอบอาคาร' },
      { key: 'sort_order', type: 'int', desc: 'ลำดับแสดงผล' },
      { key: 'is_active', type: 'bool', desc: 'ใช้งาน' }
    ]
  },
  {
    name: 'Master_Rooms',
    group: 'master',
    color: '#2E7D32',
    description: 'ห้อง (ไม่บังคับ) — ใช้เป็นตัวเลือก autocomplete ร่วมกับห้องที่เคยแจ้งมาแล้ว',
    columns: [
      { key: 'room_id', type: 'id', desc: 'รหัส ROOM0001' },
      { key: 'loc_id', type: 'fk', ref: 'Master_Locations', desc: 'ชั้น/บริเวณ' },
      { key: 'room_name', type: 'text', desc: 'ชื่อ/เลขห้อง เช่น A16, L413' },
      { key: 'note', type: 'text', desc: 'หมายเหตุ เช่น หน่วยงานที่ใช้ห้อง' },
      { key: 'is_active', type: 'bool', desc: 'ใช้งาน' }
    ]
  },
  {
    name: 'Master_Categories',
    group: 'master',
    color: '#EF6C00',
    description: 'หมวดหลัก → หมวดย่อย ของงานซ่อม (1 แถว = 1 หมวดย่อย)',
    columns: [
      { key: 'cat_id', type: 'id', desc: 'รหัส CAT001' },
      { key: 'main_category', type: 'text', desc: 'หมวดหลัก' },
      { key: 'sub_category', type: 'text', desc: 'หมวดย่อย' },
      { key: 'sort_order', type: 'int', desc: 'ลำดับแสดงผล' },
      { key: 'is_active', type: 'bool', desc: 'ใช้งาน' }
    ]
  },
  {
    name: 'Master_Statuses',
    group: 'master',
    color: '#EF6C00',
    description: 'สถานะงาน + ป้ายภาษาไทย + สี + กำหนดว่าสถานะใดแจ้งผู้แจ้งทาง LINE Push',
    columns: [
      { key: 'status_code', type: 'id', desc: 'รหัสสถานะ (ห้ามแก้)' },
      { key: 'status_label_th', type: 'text', desc: 'ป้ายภาษาไทยที่แสดงผล' },
      { key: 'status_color', type: 'text', desc: 'สี HEX ที่แสดงใน UI/Flex' },
      { key: 'sort_order', type: 'int', desc: 'ลำดับ' },
      { key: 'is_final', type: 'bool', desc: 'TRUE = สถานะสิ้นสุด (แก้ไขต่อไม่ได้)' },
      { key: 'notify_requester', type: 'bool', desc: 'TRUE = ส่ง LINE Push แจ้งผู้แจ้งเมื่อเปลี่ยนเป็นสถานะนี้' }
    ]
  },

  /* ---------------------------- TRANSACTION ---------------------------- */
  {
    name: 'Trans_JobTickets',
    group: 'transaction',
    color: '#C62828',
    description: 'งานแจ้งซ่อม (1 แถว = 1 งาน) — แทน Master_JobTicketRecords เดิม',
    columns: [
      { key: 'jtr_id', type: 'id', desc: 'รหัสงาน JTR-YYMM-NNN เช่น JTR-6910-001 (รันใหม่ทุกเดือน, YY = ปี พ.ศ.)' },
      { key: 'created_at', type: 'datetime', desc: 'วันเวลาที่แจ้ง' },
      { key: 'requester_id', type: 'fk', ref: 'Master_Users', desc: 'ผู้แจ้ง' },
      { key: 'requester_name', type: 'text', desc: 'snapshot ชื่อผู้แจ้ง ณ วันที่แจ้ง' },
      { key: 'requester_phone', type: 'text', desc: 'snapshot เบอร์ติดต่อ (แก้ได้ตอนแจ้ง)' },
      { key: 'requester_dept', type: 'text', desc: 'snapshot สังกัด (ไว้ทำรายงานย้อนหลัง แม้ผู้ใช้ย้ายสังกัด)' },
      { key: 'requester_division', type: 'text', desc: 'snapshot ส่วนงาน' },
      { key: 'bld_id', type: 'fk', ref: 'Master_Buildings', desc: 'อาคาร' },
      { key: 'loc_id', type: 'fk', ref: 'Master_Locations', desc: 'ชั้น/บริเวณ' },
      { key: 'room', type: 'text', desc: 'ห้อง (พิมพ์เอง/autocomplete, ไม่บังคับ)' },
      { key: 'cat_id_reported', type: 'fk', ref: 'Master_Categories', desc: 'หมวดที่ผู้แจ้งเลือก' },
      { key: 'cat_id_actual', type: 'fk', ref: 'Master_Categories', desc: 'หมวดจริงที่ช่างยืนยันตอนปิดงาน (ค่าเริ่ม = cat_id_reported)' },
      { key: 'description', type: 'longtext', desc: 'รายละเอียดการแจ้งซ่อม' },
      { key: 'status', type: 'enum', values: ENUMS.STATUSES, desc: 'สถานะปัจจุบัน (ดู Master_Statuses)' },
      { key: 'first_accepted_by', type: 'fk', ref: 'Master_Users', desc: 'ช่างที่กด "รับงาน" คนแรก' },
      { key: 'first_accepted_at', type: 'datetime', desc: 'เวลารับงาน → Response time = first_accepted_at − created_at' },
      { key: 'started_at', type: 'datetime', desc: 'เวลาเริ่มดำเนินการ (IN_PROGRESS ครั้งแรก)' },
      { key: 'on_hold_reason', type: 'text', desc: 'เหตุผลที่รอ (รออะไหล่/จัดซื้อ) ล่าสุด' },
      { key: 'finished_at', type: 'datetime', desc: 'เวลาปิดงาน (COMPLETED / CANNOT_REPAIR) → Repair time = finished_at − first_accepted_at' },
      { key: 'finished_by', type: 'fk', ref: 'Master_Users', desc: 'ช่างที่กดปิดงาน' },
      { key: 'cause_solution', type: 'longtext', desc: 'สาเหตุ / วิธีแก้ไข' },
      { key: 'materials_used', type: 'longtext', desc: 'วัสดุที่ใช้ (ข้อความ) เช่น หลอด LED 18W x2' },
      { key: 'tech_note', type: 'longtext', desc: 'หมายเหตุช่าง / เหตุผลที่ซ่อมไม่ได้' },
      { key: 'cancelled_at', type: 'datetime', desc: 'เวลาที่ผู้แจ้งยกเลิก (ได้เฉพาะตอน PENDING)' },
      { key: 'cancel_reason', type: 'text', desc: 'เหตุผลการยกเลิก' },
      { key: 'tg_message_id', type: 'text', desc: 'message_id ใน Telegram (ใช้แก้ข้อความ/ปุ่มเมื่อสถานะเปลี่ยน)' },
      { key: 'updated_at', type: 'datetime', desc: 'แก้ไขล่าสุด' }
    ]
  },
  {
    name: 'Trans_Assignments',
    group: 'transaction',
    color: '#C62828',
    description: 'ช่างที่ร่วมปฏิบัติงาน (1 แถว = ช่าง 1 คน ต่อ 1 งาน) — บันทึกตอนปิดงานด้วย checkbox — ใช้ทำสถิติรายบุคคล',
    columns: [
      { key: 'asg_id', type: 'id', desc: 'รหัส ASG000001' },
      { key: 'jtr_id', type: 'fk', ref: 'Trans_JobTickets', desc: 'งาน' },
      { key: 'tech_id', type: 'fk', ref: 'Master_Users', desc: 'ช่างผู้ร่วมงาน' },
      { key: 'is_first_accepter', type: 'bool', desc: 'TRUE = เป็นคนกดรับงานคนแรก' },
      { key: 'recorded_by', type: 'fk', ref: 'Master_Users', desc: 'ผู้บันทึก (ช่างที่ปิดงาน / admin)' },
      { key: 'recorded_at', type: 'datetime', desc: 'เวลาบันทึก' }
    ]
  },
  {
    name: 'Trans_Attachments',
    group: 'transaction',
    color: '#C62828',
    description: 'รูปภาพ (ก่อนซ่อม 1-3 รูปจากผู้แจ้ง / หลังซ่อม 1-3 รูปจากช่าง) เก็บไฟล์ใน Google Drive',
    columns: [
      { key: 'att_id', type: 'id', desc: 'รหัส ATT000001' },
      { key: 'jtr_id', type: 'fk', ref: 'Trans_JobTickets', desc: 'งาน' },
      { key: 'att_type', type: 'enum', values: ENUMS.ATTACHMENT_TYPES, desc: 'BEFORE = รูปแจ้งซ่อม, AFTER = รูปหลังซ่อม' },
      { key: 'seq', type: 'int', desc: 'ลำดับรูป 1-3' },
      { key: 'drive_file_id', type: 'text', desc: 'Google Drive file ID' },
      { key: 'file_url', type: 'url', desc: 'ลิงก์รูป (thumbnail/view)' },
      { key: 'uploaded_by', type: 'fk', ref: 'Master_Users', desc: 'ผู้อัปโหลด' },
      { key: 'uploaded_at', type: 'datetime', desc: 'เวลาอัปโหลด' }
    ]
  },
  {
    name: 'Trans_StatusLogs',
    group: 'transaction',
    color: '#C62828',
    description: 'ประวัติการเปลี่ยนสถานะทุกครั้ง (audit trail + ใช้คำนวณเวลา)',
    columns: [
      { key: 'log_id', type: 'id', desc: 'รหัส LOG000001' },
      { key: 'jtr_id', type: 'fk', ref: 'Trans_JobTickets', desc: 'งาน' },
      { key: 'from_status', type: 'enum', values: ENUMS.STATUSES, desc: 'สถานะเดิม (ว่าง = สร้างงานใหม่)' },
      { key: 'to_status', type: 'enum', values: ENUMS.STATUSES, desc: 'สถานะใหม่' },
      { key: 'changed_by', type: 'fk', ref: 'Master_Users', desc: 'ผู้เปลี่ยน' },
      { key: 'changed_via', type: 'enum', values: ENUMS.CHANGED_VIA, desc: 'LIFF | TELEGRAM | ADMIN | SYSTEM' },
      { key: 'note', type: 'text', desc: 'หมายเหตุประกอบ' },
      { key: 'changed_at', type: 'datetime', desc: 'เวลา' }
    ]
  },

  /* ------------------------------ SYSTEM ------------------------------ */
  {
    name: 'Sys_Config',
    group: 'system',
    color: '#424242',
    description: 'ค่าตั้งค่าระบบ (key/value) — ความลับ เช่น token ให้เก็บใน Script Properties',
    columns: [
      { key: 'config_key', type: 'id', desc: 'ชื่อค่าตั้ง' },
      { key: 'config_value', type: 'text', desc: 'ค่า' },
      { key: 'description', type: 'text', desc: 'คำอธิบาย' }
    ]
  },
  {
    name: 'Sys_Counters',
    group: 'system',
    color: '#424242',
    description: 'ตัวนับเลขรันนิ่ง (ใช้ร่วมกับ LockService ป้องกันรหัสซ้ำ)',
    columns: [
      { key: 'counter_key', type: 'id', desc: 'เช่น JTR-6910, ASG, ATT, LOG, USER' },
      { key: 'last_value', type: 'int', desc: 'เลขล่าสุดที่ใช้ไป' },
      { key: 'updated_at', type: 'datetime', desc: 'แก้ไขล่าสุด' }
    ]
  },
  {
    name: 'Sys_NotificationLogs',
    group: 'system',
    color: '#424242',
    description: 'บันทึกการส่งแจ้งเตือนทุกช่องทาง — นับ LINE_PUSH รายเดือนเพื่อคุมโควต้า 300 ข้อความ',
    columns: [
      { key: 'notif_id', type: 'id', desc: 'รหัส NTF000001' },
      { key: 'jtr_id', type: 'fk', ref: 'Trans_JobTickets', desc: 'งานที่เกี่ยวข้อง (ว่างได้ เช่น สรุปประจำวัน)' },
      { key: 'channel', type: 'enum', values: ENUMS.NOTIFY_CHANNELS, desc: 'LINE_REPLY (ฟรี) | LINE_PUSH (นับโควต้า) | TELEGRAM' },
      { key: 'event', type: 'text', desc: 'เหตุการณ์ เช่น TICKET_CREATED, STATUS_ACCEPTED, DAILY_SUMMARY, QUOTA_WARNING' },
      { key: 'target', type: 'text', desc: 'ผู้รับ (LINE user ID / Telegram chat ID)' },
      { key: 'result', type: 'enum', values: ENUMS.NOTIFY_RESULTS, desc: 'SENT | FAILED' },
      { key: 'error_message', type: 'text', desc: 'ข้อความ error (ถ้ามี)' },
      { key: 'sent_at', type: 'datetime', desc: 'เวลาส่ง' }
    ]
  },
  {
    name: 'Sys_AuditLogs',
    group: 'system',
    color: '#424242',
    description: 'บันทึกเหตุการณ์ด้านบัญชีผู้ใช้ (login, ผูก/ยกเลิก LINE, แก้ไขผู้ใช้)',
    columns: [
      { key: 'audit_id', type: 'id', desc: 'รหัส AUD000001' },
      { key: 'actor_user_id', type: 'text', desc: 'ผู้กระทำ (ว่าง = ไม่ทราบ เช่น login ผิด)' },
      { key: 'action', type: 'enum', values: ENUMS.AUDIT_ACTIONS, desc: 'ประเภทเหตุการณ์' },
      { key: 'target_user_id', type: 'text', desc: 'ผู้ใช้ที่ถูกกระทำ' },
      { key: 'detail', type: 'text', desc: 'รายละเอียด เช่น username ที่พยายาม login, LINE display name' },
      { key: 'created_at', type: 'datetime', desc: 'เวลา' }
    ]
  }
];

/* ========================================================================== */
/*  SETUP (Apps Script only)                                                  */
/* ========================================================================== */

var VALIDATION_ROWS = 2000; // จำนวนแถวที่ใส่ dropdown/checkbox ล่วงหน้า

/** สร้าง/อัปเดตโครงสร้างฐานข้อมูลทั้งหมด (รันซ้ำได้) */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  ss.setSpreadsheetLocale('th_TH');

  var seeds = buildSeeds_();
  var log = [];

  // ผ่านที่ 1: สร้างชีต + หัวตาราง + seed
  DB_SCHEMA.forEach(function (table) {
    var sheet = ss.getSheetByName(table.name);
    var isNew = !sheet;
    if (isNew) sheet = ss.insertSheet(table.name);

    writeHeader_(sheet, table);
    applyFormats_(sheet, table); // ต้องตั้ง format ก่อน seed (กันเลข 0 นำหน้าหาย)

    var seedRows = seeds[table.name];
    var hasData = sheet.getLastRow() > 1;
    if (seedRows && seedRows.length && !hasData) {
      if (table.name === 'Master_Users') {
        var now = new Date();
        seedRows = seedRows.map(function (r) { r[12] = now; r[13] = now; return r; });
      }
      sheet.getRange(2, 1, seedRows.length, table.columns.length).setValues(seedRows);
    }
    log.push((isNew ? '＋ สร้าง ' : '✓ มีอยู่แล้ว ') + table.name +
             (seedRows && !hasData ? ' (seed ' + seedRows.length + ' แถว)' : ''));
  });

  // ผ่านที่ 2: validation (ต้องให้ทุกชีตมีอยู่ก่อนจึงอ้างอิง FK ได้)
  DB_SCHEMA.forEach(function (table) {
    applyValidation_(ss, ss.getSheetByName(table.name), table);
  });

  // ลบชีตว่างเริ่มต้น
  ['Sheet1', 'แผ่นงาน1', 'ชีต1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  // เรียงชีตตามลำดับ schema
  DB_SCHEMA.forEach(function (table, i) {
    ss.setActiveSheet(ss.getSheetByName(table.name));
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(DB_SCHEMA[0].name));

  Logger.log(log.join('\n'));
  return log;
}

function writeHeader_(sheet, table) {
  var keys = table.columns.map(function (c) { return c.key; });
  if (sheet.getMaxColumns() < keys.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), keys.length - sheet.getMaxColumns());
  }
  var header = sheet.getRange(1, 1, 1, keys.length);
  header.setValues([keys])
    .setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground(table.color)
    .setNotes([table.columns.map(function (c) {
      return c.desc + (c.ref ? '\n→ อ้างอิง ' + c.ref : '') + (c.values ? '\nค่า: ' + c.values.join(' | ') : '');
    })]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.setTabColor(table.color);
}

function ensureRows_(sheet) {
  var rows = Math.max(VALIDATION_ROWS, sheet.getLastRow());
  if (sheet.getMaxRows() < rows + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows + 1 - sheet.getMaxRows());
  return rows;
}

/** ผ่านที่ 1: number format / wrap / ความกว้างคอลัมน์ (ทำก่อน seed) */
function applyFormats_(sheet, table) {
  var rows = ensureRows_(sheet);
  table.columns.forEach(function (col, i) {
    var range = sheet.getRange(2, i + 1, rows, 1);
    switch (col.type) {
      case 'datetime': range.setNumberFormat('dd/mm/yyyy hh:mm:ss'); break;
      case 'int':      range.setNumberFormat('0'); break;
      case 'id':
      case 'fk':
      case 'text':     range.setNumberFormat('@'); break; // บังคับเป็นข้อความ (กันรหัสผ่าน/เบอร์โทรที่ขึ้นต้นด้วย 0 หาย)
      case 'longtext': range.setNumberFormat('@').setWrap(true); break;
    }
  });
  sheet.autoResizeColumns(1, table.columns.length);
  table.columns.forEach(function (col, i) {
    var w = sheet.getColumnWidth(i + 1);
    if (w < 90) sheet.setColumnWidth(i + 1, 90);
    if (col.type === 'longtext' && w > 320) sheet.setColumnWidth(i + 1, 320);
  });
}

/** ผ่านที่ 2: checkbox / dropdown (ทำหลังจากทุกชีตถูกสร้างแล้ว เพื่ออ้างอิง FK ได้) */
function applyValidation_(ss, sheet, table) {
  var rows = ensureRows_(sheet);
  table.columns.forEach(function (col, i) {
    var range = sheet.getRange(2, i + 1, rows, 1);
    var rule = null;
    if (col.type === 'bool') {
      rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    } else if (col.type === 'enum') {
      rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(col.values, true).setAllowInvalid(false).build();
    } else if (col.type === 'fk' && table.group === 'master') {
      // dropdown FK เฉพาะตาราง master ที่ admin แก้มือ (ตาราง transaction ระบบเขียนเอง)
      var refSheet = ss.getSheetByName(col.ref);
      if (refSheet) {
        rule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(refSheet.getRange('A2:A'), true)
          .setAllowInvalid(false).build();
      }
    }
    if (rule) range.setDataValidation(rule);
  });
}

/* ========================================================================== */
/*  Node export (ignored by Apps Script)                                      */
/* ========================================================================== */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DB_SCHEMA: DB_SCHEMA, ENUMS: ENUMS, buildSeeds_: buildSeeds_ };
}
