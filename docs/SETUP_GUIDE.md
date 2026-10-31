# คู่มือการติดตั้งและตั้งค่าฐานข้อมูล e-MMS (Step-by-Step Setup Guide)

คู่มือนี้อธิบายขั้นตอนการสร้างฐานข้อมูล Google Sheets ทั้ง **15 ชีต** ด้วยสคริปต์อัตโนมัติ [`apps-script/SetupDatabase.js`](file:///Users/mek/e-MMS_%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B8%9A%E0%B8%B3%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B8%AD%E0%B8%AD%E0%B8%99%E0%B9%84%E0%B8%A5%E0%B8%99%E0%B9%8C/apps-script/SetupDatabase.js) รวมถึงการเตรียม Google Drive, LINE OA/LIFF และ Telegram Bot

---

## ขั้นตอนที่ 1: สร้างฐานข้อมูล Google Sheets (15 ชีตอัตโนมัติ)

1. เปิด [Google Sheets](https://sheets.new) สร้างไฟล์ใหม่ แล้วตั้งชื่อไฟล์ว่า  
   `e-MMS_Databases`
2. ที่เมนูด้านบนของ Google Sheets กด **Extensions (ส่วนขยาย)** → **Apps Script**
3. ในหน้าต่าง Apps Script ที่เปิดขึ้นมา:
   - ลบโค้ดเดิม `function myFunction() {}` ในไฟล์ `Code.gs` ออกทั้งหมด (หรือสร้างไฟล์ใหม่ชื่อ `SetupDatabase.gs`)
   - เปิดไฟล์ [`apps-script/SetupDatabase.js`](file:///Users/mek/e-MMS_%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B8%9A%E0%B8%B3%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B8%AD%E0%B8%AD%E0%B8%99%E0%B9%84%E0%B8%A5%E0%B8%99%E0%B9%8C/apps-script/SetupDatabase.js) ในโปรเจกต์นี้ คัดลอกโค้ดทั้งหมดไปวาง
   - กด **Save (ไอคอนแผ่นดิสก์ หรือ `Cmd + S`)**
4. ที่แถบด้านบน ตรงช่องเลือกฟังก์ชัน (ข้างปุ่ม **Run**) ให้เลือกฟังก์ชันชื่อ **`setupDatabase`**
5. กดปุ่ม **Run (เรียกใช้)**
6. ระบบจะขอสิทธิ์เข้าถึงครั้งแรก (Authorization Required):
   - กด **Review permissions (ตรวจสอบสิทธิ์)**
   - เลือกบัญชี Google ของคุณ
   - กด **Advanced (ขั้นสูง)** → กด **Go to Untitled project (unsafe)** → กด **Allow (อนุญาต)**
7. รอประมาณ 10–20 วินาที จนขึ้น `Execution completed` ใน Execution Log
8. กลับไปดูที่ไฟล์ Google Sheets ของคุณ จะพบว่า:
   - สร้างครบทั้ง **15 ชีต** เรียงตามลำดับพร้อมแถบสีแยกตามหมวด (น้ำเงิน/เขียว/ส้ม = Master, แดง = Transaction, เทา = System)
   - ตั้งค่า Format ข้อความ (`@`) เรียบร้อยแล้ว (พิมพ์รหัสผ่านหรือเบอร์โทรที่ขึ้นต้นด้วย `0` เช่น `0812345678` หรือวันเกิด `05042545` เลข `0` จะไม่หาย)
   - มี Checkbox และ Dropdown ให้พร้อมใช้งาน และเติมข้อมูลตั้งต้น (อาคาร, ชั้น, หมวดงาน, สังกัด, สถานะ, ผู้ใช้เริ่มต้น) ครบถ้วน

> [!TIP]
> ฟังก์ชัน `setupDatabase()` สามารถกดรันซ้ำได้ปลอดภัย (Idempotent) หากชีตไหนมีข้อมูลอยู่แล้ว ระบบจะ**ไม่ลบข้อมูลเดิม**

---

## ขั้นตอนที่ 2: กรอกข้อมูลผู้ใช้และทีมช่างในชีต `Master_Users`

1. เปิดแท็บชีต **`Master_Users`**
2. แถวที่ 2 (`USER0001` — นายธนาวัฒน์ บุตรศรี) ถูกตั้งเป็น `admin` ไว้ให้แล้ว
3. แถวที่ 3–7 (`USER0002` ถึง `USER0006` — ช่างสุรชาติ, ทิตติพงค์, พิชัย, นพพล, พีระชัย):
   - กรอกคอลัมน์ **`user_username`** และ **`user_password`** (เช่น วันเดือนปีเกิด พ.ศ. 8 หลัก `ddmmyyyy`) ให้ช่างแต่ละคน
   - กรอกชื่อ-นามสกุลเต็มในคอลัมน์ **`user_name`** และเบอร์โทรใน **`user_phone`**
4. สำหรับการนำเข้าข้อมูล **นักศึกษา / เจ้าหน้าที่** จำนวนมาก:
   - สามารถคัดลอกข้อมูลจากไฟล์ทะเบียน (รหัสนักศึกษา → `user_username`, วันเดือนปีเกิด พ.ศ. `ddmmyyyy` → `user_password`, ชื่อ-สกุล → `user_name`) มาวางต่อท้ายได้เลย
   - คอลัมน์ `dept_id` เลือกจาก Dropdown (เช่น `DEP09` = วิทยาลัยการชลประทาน / นิสิต-นักศึกษา)
   - คอลัมน์ `user_role` เลือก `user` และติ๊กถูกที่ `is_active`

---

## ขั้นตอนที่ 3: สร้างโฟลเดอร์เก็บรูปใน Google Drive

1. เปิด [Google Drive](https://drive.google.com) แล้วสร้างโฟลเดอร์ใหม่ เช่น `e-MMS_Photos`
2. ดับเบิลคลิกเข้าไปในโฟลเดอร์นั้น แล้วดูที่ URL บนเบราว์เซอร์:
   - ตัวอย่าง: `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456`
   - คัดลอกเฉพาะรหัสหลัง `/folders/` คือ `1AbCdEfGhIjKlMnOpQrStUvWxYz123456`
3. นำไปวางในชีต **`Sys_Config`** ที่แถว `DRIVE_ROOT_FOLDER_ID` (คอลัมน์ `config_value`)

---

## ขั้นตอนที่ 4: เตรียม Telegram Bot สำหรับกลุ่มทีมช่าง (ฟรี 100%)

1. เปิดแอป Telegram ค้นหา **`@BotFather`** (มีเครื่องหมายถูกสีฟ้า)
2. พิมพ์คำสั่ง `/newbot` → ตั้งชื่อบอท (เช่น `e-MMS แจ้งซ่อมบำรุง`) → ตั้ง username บอทที่ลงท้ายด้วย `bot` (เช่น `emms_rid_bot`)
3. คัดลอก **HTTP API Token** ที่ได้เก็บไว้ (เช่น `7123456789:AAH...`)
4. สร้างกลุ่ม Telegram สำหรับทีมช่าง แล้วดึงบอทเข้ากลุ่ม และตั้งให้บอทเป็น **Admin** ของกลุ่ม
5. วิธีดู **Chat ID** ของกลุ่ม:
   - พิมพ์ข้อความอะไรก็ได้ในกลุ่ม 1 ข้อความ
   - เปิดเบราว์เซอร์เข้า URL: `https://api.telegram.org/bot<ใส่_TOKEN_ของคุณ>/getUpdates`
   - มองหา `"chat":{"id":-100xxxxxxxxxx` (ตัวเลขติดลบ)
   - นำเลขติดลบนั้นไปใส่ในชีต **`Sys_Config`** ที่แถว `TELEGRAM_CHAT_ID`

---

## ขั้นตอนที่ 5: เตรียม LINE Official Account (LINE OA) และ LIFF (แบบละเอียดทีละคลิก)

การทำระบบผ่าน LINE จะต้องใช้ 2 ส่วนคู่กันภายใต้ **Provider เดียวกัน** คือ:
1. **Messaging API Channel** — ใช้ส่งข้อความ/การ์ดแจ้งสถานะซ่อมเข้าแชทผู้แจ้ง
2. **LINE Login Channel (LIFF)** — ใช้เปิดหน้าเว็บแจ้งซ่อม/อัปเดตงานในแอป LINE และตรวจสอบตัวตนผู้ใช้

---

### 5.1 สร้างบัญชี LINE Official Account (LINE OA) และเปิดใช้ Messaging API

1. เข้าไปที่เว็บไซต์ [LINE Business ID (LINE Official Account Manager)](https://manager.line.biz/) แล้ว Login ด้วยบัญชี LINE ของคุณ
2. หากยังไม่มีบัญชี LINE OA สำหรับงานซ่อมบำรุง:
   - กดปุ่ม **สร้างบัญชี (Create New Account)**
   - กรอกชื่อบัญชี เช่น `e-MMS แจ้งซ่อมบำรุง`, เลือกหมวดหมู่ธุรกิจ (เช่น การศึกษา / องค์กรราชการ) แล้วกดยืนยันจนเสร็จ
3. เมื่อเข้ามาในหน้าจัดการ LINE OA แล้ว ให้กดปุ่ม **ตั้งค่า (Settings)** (ไอคอนรูปเฟืองมุมขวาบน)
4. ที่เมนูด้านซ้าย เลือก **Messaging API** → กดปุ่มสีเขียว **ใช้ Messaging API (Enable Messaging API)**
5. ระบบจะให้เลือกหรือสร้าง **Provider (ผู้ให้บริการ)**:
   - หากยังไม่เคยมี ให้กด **สร้างโพรไวเดอร์ใหม่ (Create New Provider)** แล้วตั้งชื่อเป็นภาษาอังกฤษ เช่น `RID-eMMS` (จำชื่อ Provider นี้ไว้ เพราะขั้นต่อไปต้องเลือก Provider เดียวกันนี้!)
   - กดยอมรับเงื่อนไข / นโยบายความเป็นส่วนตัว (เว้นว่างได้) → กด **ตกลง (OK)**
6. ยังอยู่ในหน้าตั้งค่าของ LINE OA Manager:
   - ไปที่เมนูซ้าย **การตอบกลับ (Response settings)**:
     - **โหมดการตอบกลับ (Response mode):** เลือกเป็น **บอท (Bot)**
     - **ข้อความทักทายเพื่อนใหม่ (Greeting message):** เปิดหรือปิดตามต้องการ
     - **ข้อความตอบกลับอัตโนมัติ (Auto-response):** เลือก **ปิด (Disabled)** (เพื่อไม่ให้บอทตอบข้อความซ้ำเวลาระบบส่งใบแจ้งซ่อม)
     - **Webhook:** *(หากยังเปิดไม่ได้เพราะติดต้องใส่ Webhook URL ก่อน ให้สร้าง Webhook URL จาก Apps Script ตามข้อ 5.1.1 ด้านล่างนี้ก่อน แล้วค่อยกลับมาเปิด)*

#### 5.1.1 วิธีสร้าง Webhook URL จาก Google Apps Script เพื่อนำมาใส่ใน LINE

LINE จะบังคับให้มี **Webhook URL** ก่อนถึงจะกดเปิดสวิตช์ Webhook ได้ ให้ทำตามนี้:

1. เปิดหน้าต่าง **Apps Script** ของไฟล์ Google Sheets `e-MMS_Databases`
2. ที่ท้ายสุดของไฟล์โค้ด (หรือในไฟล์ `Code.gs`) ให้วางฟังก์ชันรับ Webhook เบื้องต้น 2 ฟังก์ชันนี้ลงไป แล้วกด **Save (`Cmd + S`)**:
   ```javascript
   function doGet(e) {
     return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'e-MMS' }))
       .setMimeType(ContentService.MimeType.JSON);
   }

   function doPost(e) {
     return ContentService.createTextOutput(JSON.stringify({ ok: true }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. มองไปที่มุมขวาบนของหน้าจอ Apps Script กดปุ่มสีน้ำเงิน **Deploy (การทำให้ใช้งานได้)** → เลือก **New deployment (การทำให้ใช้งานได้รายการใหม่)**
4. ที่หน้าต่างเด้งขึ้นมา:
   - คลิกไอคอน **รูปเฟือง ⚙️** ข้างคำว่า `Select type (เลือกประเภท)` → เลือก **`Web app (เว็บแอป)`**
   - ช่อง **Description (คำอธิบาย):** พิมพ์ `e-MMS Webhook`
   - ช่อง **Execute as (ดำเนินการในฐานะ):** เลือก **`Me (ฉัน)`**
   - ช่อง **Who has access (ผู้ที่มีสิทธิ์เข้าถึง):** เลือก **`Anyone (ทุกคน)`** *(สำคัญมาก! ต้องเลือก Anyone เท่านั้นเพื่อให้เซิร์ฟเวอร์ของ LINE และ Telegram ส่งข้อมูลเข้ามาได้)*
   - กดปุ่ม **Deploy (การทำให้ใช้งานได้)**
5. คัดลอกลิงก์ในช่อง **Web app URL** (จะมีหน้าตาแบบ `https://script.google.com/macros/s/AKfycb.../exec`)
6. นำลิงก์ที่ได้ไปใส่ใน LINE:
   - ใส่ในช่อง **Webhook URL** (ใส่ได้ทั้งในหน้า LINE OA Manager → Messaging API หรือในหน้า LINE Developers Console → แท็บ Messaging API → Webhook settings)
   - กด **Save / Update** (และถ้าอยู่ใน LINE Developers Console สามารถกดปุ่ม **Verify** จะขึ้น `Success`)
   - จากนั้นกดเปิดสวิตช์ **Use webhook / Webhook: เปิด (Enabled)** ได้เลย!

---

### 5.2 ดึงค่า `LINE_CHANNEL_ACCESS_TOKEN` จาก Messaging API

1. เปิดแท็บใหม่ไปที่ [LINE Developers Console](https://developers.line.biz/console/) แล้ว Login ด้วยบัญชี LINE เดียวกัน
2. คลิกเลือก **Provider** ที่คุณสร้างไว้ในข้อ 5.1 (เช่น `RID-eMMS`)
3. คุณจะเห็นกล่อง Channel ชนิด **Messaging API** (ชื่อเดียวกับ LINE OA ของคุณ) → **คลิกเข้าไปในกล่องนั้น**
4. คลิกที่แท็บ **Messaging API** ด้านบน
5. เลื่อนลงไปล่างสุดที่หัวข้อ **Channel access token**:
   - กดปุ่ม **Issue (ออกโทเค็น)** ที่อยู่ข้างคำว่า `Channel access token (long-lived)`
   - จะได้ข้อความยาว ๆ เช่น `eyJhbGciOiJIUzI1...`
   - กด **Copy (คัดลอก)** เก็บไว้ → ค่านี้คือ **`LINE_CHANNEL_ACCESS_TOKEN`**

---

### 5.3 สร้าง LINE Login Channel และผูกกับ LINE OA

> [!IMPORTANT]
> ต้องสร้าง LINE Login Channel อยู่ใน **Provider เดียวกัน** กับ Messaging API Channel เท่านั้น เพื่อให้ `line_user_id` ที่ได้จากหน้า LIFF ตรงกับ `line_user_id` ที่ใช้ส่งข้อความแจ้งเตือน

1. ใน [LINE Developers Console](https://developers.line.biz/console/) ให้คลิกที่ชื่อ **Provider** ของคุณ (เช่น `RID-eMMS`) ที่เมนูด้านซ้ายเพื่อกลับมาหน้ารวม Channels
2. คลิกที่กล่อง **Create a new channel** → เลือก **LINE Login**
3. กรอกข้อมูลตามนี้:
   - **Region:** `Thailand`
   - **Company or owner's country or region:** `Thailand`
   - **Channel name:** `e-MMS LIFF` (หรือชื่อที่ต้องการ)
   - **Channel description:** `ระบบแจ้งซ่อมบำรุงออนไลน์ e-MMS`
   - **App types:** ติ๊กถูกที่ **`Web app`**
   - **Email address:** อีเมลของคุณ
   - ติ๊กยอมรับเงื่อนไขด้านล่าง แล้วกด **Create**
4. เมื่อสร้างเสร็จแล้ว ให้ดูในแท็บ **Basic settings** ของ LINE Login Channel นี้:
   - เลื่อนหาหัวข้อ **Channel ID** (ตัวเลข 10 หลัก เช่น `2006123456`) → กด **Copy** เก็บไว้ → ค่านี้คือ **`LINE_LOGIN_CHANNEL_ID`**
   - เลื่อนลงมาที่หัวข้อ **Linked LINE Official Account** → กด **Edit** → เลือกบัญชี LINE OA ของคุณจาก Dropdown → กด **Update**
   - เลื่อนลงมาที่หัวข้อ **Add friend option** (ตัวเลือกเสริม แนะนำให้เปิด) → ช่วยให้ผู้ใช้ที่เปิด LIFF ครั้งแรกถูกบังคับให้เป็นเพื่อนกับ LINE OA ก่อน เพื่อให้รับแจ้งเตือนได้
5. ด้านบนสุดของหน้า ข้างชื่อ Channel จะมีป้ายสีเทาเขียนว่า **`Developing`** → คลิกที่ป้ายนั้นแล้วเปลี่ยนเป็น **`Published`** (เพื่อให้คนอื่นในองค์กรเข้าใช้งานได้)

---

### 5.4 สร้าง LIFF App และดึงค่า `LIFF_ID`

1. ยังอยู่ใน **LINE Login Channel** เดิม ให้คลิกที่แท็บ **LIFF** ด้านบน
2. กดปุ่ม **Add** เพื่อสร้าง LIFF App ใหม่ แล้วตั้งค่าดังนี้:
   - **LIFF app name:** `e-MMS`
   - **Size:** เลือก **`Full`** (แสดงผลเต็มจอในแอป LINE)
   - **Endpoint URL:**
     - หากยังไม่ได้สร้าง GitHub Pages ให้ใส่ URL ชั่วคราวก่อนได้ เช่น `https://example.com` (ค่อยกลับมาแก้เป็น URL ของ GitHub Pages จริงในเฟส 3)
   - **Scopes (สำคัญมาก):** ติ๊กถูกทั้ง 3 ตัวนี้:
     - [x] `profile`
     - [x] `openid`
     - [x] `chat_message.write` *(ตัวนี้ทำให้เว็บส่งข้อความเข้าแชทเพื่อรับ `replyToken` ฟรี ไม่เสียโควต้า Push)*
   - **Bot link feature:** เลือก **`On (Aggressive)`** (บังคับให้ผู้แจ้งแอดเพื่อน LINE OA ตอนเปิดใช้งานครั้งแรก)
   - กดปุ่ม **Add** ด้านล่างสุด
3. เมื่อสร้างเสร็จ คุณจะเห็นรายการ LIFF App ในตาราง:
   - คัดลอกค่าในคอลัมน์ **LIFF ID** (รูปแบบเช่น `2006123456-AbCdEfGh`)
   - นำไปวางใน Google Sheets ชีต **`Sys_Config`** แถวที่ชื่อ `LIFF_ID` (วางในคอลัมน์ B `config_value`)

---

## ขั้นตอนที่ 6: เก็บรหัสลับ (Tokens) ใน Script Properties ของ Apps Script (ทีละคลิก)

เพื่อความปลอดภัยสูงสุด เราจะ**ไม่**วาง Token ลับลงในตาราง Google Sheets แต่จะเก็บไว้ในตู้นิรภัยของ Apps Script ที่เรียกว่า **Script Properties**:

1. เปิดไฟล์ Google Sheets `e-MMS_Databases` ของคุณ → ไปที่เมนู **Extensions (ส่วนขยาย)** → **Apps Script**
2. ดูที่แถบเมนูแนวตั้งด้านซ้ายสุดของหน้าจอ Apps Script:
   - คลิกที่ไอคอน **รูปเฟือง ⚙️ (Project Settings / การตั้งค่าโปรเจกต์)** (อยู่แถวล่างสุดของเมนูซ้าย)
3. เลื่อนหน้าจอลงมาด้านล่างสุดที่หัวข้อ **Script Properties (คุณสมบัติของสคริปต์)**
4. คลิกปุ่ม **Add script property (เพิ่มคุณสมบัติของสคริปต์)**
5. กรอกค่าที่ 1:
   - ช่อง **Property:** พิมพ์ `LINE_CHANNEL_ACCESS_TOKEN`
   - ช่อง **Value:** วาง Token ยาว ๆ ที่ได้จาก **ข้อ 5.2**
6. คลิกปุ่ม **Add script property** อีกครั้ง เพื่อกรอกค่าที่ 2:
   - ช่อง **Property:** พิมพ์ `LINE_LOGIN_CHANNEL_ID`
   - ช่อง **Value:** วางตัวเลข 10 หลักที่ได้จาก **ข้อ 5.3**
7. คลิกปุ่ม **Add script property** อีกครั้ง เพื่อกรอกค่าที่ 3:
   - ช่อง **Property:** พิมพ์ `TELEGRAM_BOT_TOKEN`
   - ช่อง **Value:** วาง Token ของบอท Telegram ที่ได้จาก `@BotFather` ใน **ขั้นตอนที่ 4** (เช่น `7123456789:AAH...`)
8. **สำคัญมาก:** เมื่อกรอกครบทั้ง 3 แถวแล้ว ให้กดปุ่มสีน้ำเงิน **Save script properties (บันทึกคุณสมบัติของสคริปต์)** ด้านล่าง!

### ตารางตรวจสอบความครบถ้วนก่อนเริ่มเฟส 2

| สถานที่เก็บ | ชื่อคีย์ (ต้องสะกดตรงตัวพิมพ์ใหญ่ทั้งหมด) | ตัวอย่างค่า | ได้มาจากขั้นตอนไหน |
|---|---|---|---|
| **Script Properties** | `LINE_CHANNEL_ACCESS_TOKEN` | `eyJhbGciOiJIUzI1NiJ9...` | ข้อ 5.2 (Messaging API) |
| **Script Properties** | `LINE_LOGIN_CHANNEL_ID` | `2006123456` | ข้อ 5.3 (LINE Login → Basic settings) |
| **Script Properties** | `TELEGRAM_BOT_TOKEN` | `7123456789:AAHxyz...` | ขั้นตอนที่ 4 (`@BotFather`) |
| **ชีต `Sys_Config`** | `LIFF_ID` | `2006123456-AbCdEfGh` | ข้อ 5.4 (LINE Login → แท็บ LIFF) |
| **ชีต `Sys_Config`** | `TELEGRAM_CHAT_ID` | `-1001234567890` | ขั้นตอนที่ 4 (กลุ่ม Telegram ช่าง) |
| **ชีต `Sys_Config`** | `DRIVE_ROOT_FOLDER_ID` | `1AbCdEfGhIjKlMnOpQrStUvWxYz` | ขั้นตอนที่ 3 (โฟลเดอร์ Google Drive) |

---

## ขั้นตอนที่ 7: วิธีสร้างและผูก Rich Menu (เมนูด้านล่างแชท LINE OA) แบบละเอียดทีละคลิก

Rich Menu คือปุ่มกดเมนูขนาดใหญ่ด้านล่างห้องแชท LINE OA เมื่อผู้ใช้กดปุ่มแล้วจะเปิดหน้าเว็บ LIFF ขึ้นมาในแอป LINE ทันที

### 7.1 เตรียมลิงก์ LIFF ของคุณ

ไปที่ **LINE Developers Console** → **LINE Login Channel** → แท็บ **LIFF** แล้วดูที่คอลัมน์ **LIFF URL** (หรือนำ `LIFF ID` มาต่อท้าย `https://liff.line.me/`):

- **ลิงก์หลัก (เปิดระบบ e-MMS / แจ้งซ่อมใหม่):**
  `https://liff.line.me/<ใส่_LIFF_ID_ของคุณ>`
- **ลิงก์เปิดหน้า "งานของฉัน" โดยตรง (กรณีทำ Rich Menu แบบ 2 หรือ 3 ปุ่ม):**
  `https://liff.line.me/<ใส่_LIFF_ID_ของคุณ>?tab=myTickets`
- **ลิงก์เปิดหน้า "คิวงานช่าง" โดยตรง (กรณีมีปุ่มสำหรับทีมช่าง):**
  `https://liff.line.me/<ใส่_LIFF_ID_ของคุณ>?tab=techQueue`

---

### 7.2 ขั้นตอนสร้าง Rich Menu ใน LINE Official Account Manager

1. เข้าไปที่เว็บ **LINE Official Account Manager**: https://manager.line.biz/ แล้วคลิกเลือกบัญชี LINE OA ของคุณ
2. ดูที่เมนูด้านซ้าย (ภายใต้หมวด *จัดการแชท / Chat room*) คลิกที่คำว่า **`ริชเมนู (Rich menus)`**
3. กดปุ่มสีเขียว **`สร้างใหม่ (Create new)`** มุมขวาบน
4. ตั้งค่าส่วนที่ 1 **ตั้งค่าการแสดงผล (Menu settings)**:
   - **ชื่อ (Title):** พิมพ์ `เมนูหลัก e-MMS` *(ชื่อนี้ไว้ดูหลังบ้าน ผู้ใช้จะไม่เห็น)*
   - **ช่วงเวลาที่แสดง (Display period):** เลือกวันเริ่มต้นเป็นวันนี้ เวลาปัจจุบัน และวันสิ้นสุดเลือกไปไกล ๆ (เช่น อีก 3–5 ปีข้างหน้า)
   - **ข้อความบนแถบเมนู (Menu bar text):** เลือก `เมนูแจ้งซ่อม` หรือกำหนดเอง เช่น `🛠️ เมนูแจ้งซ่อมบำรุง (แตะที่นี่)`
   - **การแสดงเมนูเริ่มต้น (Default display):** เลือก **`แสดง (Display)`** *(เพื่อให้เมนูเด้งขึ้นมาทันทีที่ผู้ใช้เปิดห้องแชท)*
5. ตั้งค่าส่วนที่ 2 **ตั้งค่าคอนเทนต์ (Content settings)**:
   - **เทมเพลต (Template):** กดปุ่ม **เลือกเทมเพลต (Select template)**
     - แนะนำให้เลือกเทมเพลตขนาด **เล็ก (Compact)** แบบ **1 ช่องเต็ม (`A`)** หรือแบบ **2 ช่องซ้าย-ขวา (`A` | `B`)**
   - **รูปพื้นหลัง (Background image):**
     - หากยังไม่ได้ทำรูปกราฟิกเอง สามารถกดปุ่ม **`สร้างรูปภาพ (Create image)`** ที่มีมาให้ในหน้าเว็บ LINE OA Manager ได้เลย! (เลือกสีพื้นหลัง ใส่ไอคอน 🛠️ และพิมพ์ข้อความ `"แจ้งซ่อมบำรุงออนไลน์"` ในช่อง A และ `"ติดตามสถานะงานซ่อม"` ในช่อง B แล้วกดบันทึก)
     - หรืออัปโหลดรูปที่ออกแบบเอง (ขนาดตามที่เทมเพลตระบุ เช่น `2500 x 843 px` หรือ `1200 x 405 px`)
   - **แอคชัน (Actions):**
     - **ช่อง A (ปุ่มแจ้งซ่อม):**
       - ประเภท (Type): เลือก **`ลิงก์ (Link)`**
       - วางลิงก์: `https://liff.line.me/<ใส่_LIFF_ID_ของคุณ>`
       - ป้ายแอคชัน (Action label): พิมพ์ `แจ้งซ่อมบำรุงออนไลน์`
     - **ช่อง B (ปุ่มติดตามงาน — ถ้าเลือกเทมเพลต 2 ช่อง):**
       - ประเภท (Type): เลือก **`ลิงก์ (Link)`**
       - วางลิงก์: `https://liff.line.me/<ใส่_LIFF_ID_ของคุณ>?tab=myTickets`
       - ป้ายแอคชัน (Action label): พิมพ์ `ติดตามสถานะงานซ่อม`
6. กดปุ่มสีเขียว **`บันทึก (Save)`** ด้านล่างสุด — เมนูจะขึ้นแสดงในห้องแชท LINE OA ของทุกคนทันที!

---

## ขั้นตอนที่ 8: วิธีตั้งค่า Supabase (Sub-Second Latency Architecture)

เพื่อลดเวลาตอบสนองหน้าเว็บ LIFF จาก 5–10 วินาที ให้เหลือ **< 1 วินาที (Sub-second)** และให้ Google Sheets ทำหน้าที่เป็น Read-Only Consumer ตลอด 24/7 ให้ทำตามขั้นตอนนี้:

### 8.1 สร้างโปรเจกต์ Supabase และรัน SQL Schema + Seed
1. เข้าไปที่ [Supabase Dashboard](https://supabase.com/dashboard) → กด **New Project**
   - **Name:** `e-mms`
   - **Region:** เลือก **`Southeast Asia (Singapore)`** (`ap-southeast-1`) เพื่อความเร็วสูงสุดในประเทศไทย
2. เมื่อโปรเจกต์สร้างเสร็จแล้ว ไปที่เมนูซ้าย **SQL Editor** → กด **New query**
3. คัดลอกโค้ดทั้งหมดจากไฟล์ [`supabase/migrations/20261101000000_init_emms_schema.sql`](file:///Users/mek/e-MMS_%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B8%9A%E0%B8%B3%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B8%AD%E0%B8%AD%E0%B8%99%E0%B9%84%E0%B8%A5%E0%B8%99%E0%B9%8C/supabase/migrations/20261101000000_init_emms_schema.sql) ไปวางแล้วกด **Run**
   - สคริปต์จะสร้างครบทั้ง **15 ตาราง**, **Storage Bucket (`ticket-attachments`)**, **Atomic Ticket ID Trigger (`JTR-YYMM-NNN`)**, **RPC Functions**, และ **ข้อมูลตั้งต้น (Seed Data)** ให้ทันที
4. ไปที่เมนู **Table Editor** → เลือกตาราง **`Sys_Config`** แล้วกรอกค่า:
   - `LIFF_ID`: ใส่ LIFF ID ของคุณ
   - `TELEGRAM_CHAT_ID`: ใส่ Chat ID กลุ่มช่าง (ตัวเลขติดลบ)
   - `SUPABASE_EDGE_NOTIFY_URL`: `https://<PROJECT-REF>.supabase.co/functions/v1/notify-event`

### 8.2 Deploy Supabase Edge Functions (Decoupled Telegram & LINE Notifications)
```zsh
# ติดตั้งและ Login Supabase CLI
npx supabase login
npx supabase link --project-ref <PROJECT-REF>

# ตั้งค่า Secrets สำหรับส่งแจ้งเตือน Telegram และ LINE
npx supabase secrets set TELEGRAM_BOT_TOKEN="<TOKEN>" LINE_CHANNEL_ACCESS_TOKEN="<TOKEN>"

# Deploy ทั้ง 3 Edge Functions
npx supabase functions deploy notify-event --no-verify-jwt
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy line-webhook --no-verify-jwt
```

### 8.3 เชื่อมต่อหน้าเว็บ LIFF (`web/config.js`) และ Google Sheets Sync
1. ไปที่ Supabase Dashboard → **Project Settings** → **API** คัดลอก **Project URL** และ **`anon` `public` key**
2. นำไปใส่ในไฟล์ [`web/config.js`](file:///Users/mek/e-MMS_%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%8B%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B8%9A%E0%B8%B3%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B8%AD%E0%B8%AD%E0%B8%99%E0%B9%84%E0%B8%A5%E0%B8%99%E0%B9%8C/web/config.js) (`SUPABASE_URL` และ `SUPABASE_ANON_KEY`)
3. สำหรับ **Google Sheets (Read-Only Consumer Sync)**:
   - เปิด Apps Script → **Project Settings** → **Script Properties** เพิ่ม:
     - `SUPABASE_URL` = `https://<PROJECT-REF>.supabase.co`
     - `SUPABASE_KEY` = `<service_role_key หรือ anon_key>`
   - เปิดไฟล์ Google Sheets ขึ้นมาใหม่ จะพบเมนู **`⚡ e-MMS (Supabase Sync)`** ด้านบน สามารถกด **`🔄 รีเฟรชข้อมูลล่าสุดจาก Supabase ทันที`** หรือกด **`⏰ เปิด Auto-Sync ทุก 1 ชั่วโมง (Keep-Alive)`** ได้ทันที!
