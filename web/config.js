/**
 * e-MMS : Frontend Configuration
 * ---------------------------------------------------------------------------
 * เชื่อมต่อกับ Google Apps Script Web App Deployment (@2) เรียบร้อยแล้ว
 * หากไม่ได้ระบุ LIFF_ID ที่นี่ หน้าเว็บจะดึงค่า LIFF_ID จากชีต Sys_Config อัตโนมัติ
 */
window.EMMS_CONFIG = {
  // URL ของ Google Apps Script Web App (Deployment ID: AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk)
  API_URL: 'https://script.google.com/macros/s/AKfycbxg71MIIDI5RtmBiM-dl1NZLjNFnbc6rWO46OyZ9GdVam39udnPFcd0zqQzezpxNUk/exec',

  // หากเว้นว่างไว้ ระบบจะดึง LIFF_ID จากชีต Sys_Config บน Google Sheets มาให้อัตโนมัติ
  LIFF_ID: '',

  // เปิดโหมดทดสอบบนเบราว์เซอร์คอมพิวเตอร์กรณีไม่ได้เปิดในแอป LINE
  ALLOW_BROWSER_DEV_MODE: true
};
