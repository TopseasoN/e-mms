/**
 * e-MMS : Frontend Application Logic (LINE LIFF + GAS API)
 * ---------------------------------------------------------------------------
 */

var STATE = {
  apiUrl: '',
  liffId: '',
  idToken: '',
  lineUserId: '',
  lineDisplayName: '',
  user: null,
  master: {
    departments: [],
    buildings: [],
    locations: [],
    rooms: [],
    categories: [],
    statuses: [],
    technicians: []
  },
  config: {},
  beforeImages: [],
  afterImages: [],
  myTickets: [],
  queueTickets: [],
  queueFilter: 'ACTIVE',
  dashboardData: null,
  adminUsers: [],
  chartCategory: null,
  chartBuilding: null,
  dupTimer: null
};

/* ========================================================================== */
/*  UI HELPERS                                                                */
/* ========================================================================== */

function showLoading(text) {
  var el = document.getElementById('loadingOverlay');
  var txt = document.getElementById('loadingText');
  if (txt) txt.textContent = text || 'กำลังประมวลผล...';
  if (el) el.classList.remove('hidden');
}

function hideLoading() {
  var el = document.getElementById('loadingOverlay');
  if (el) el.classList.add('hidden');
}

function showToast(message, type) {
  var box = document.getElementById('toastBox');
  var inner = document.getElementById('toastInner');
  if (!box || !inner) return;

  var styles = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    warn: 'bg-amber-500 text-white',
    info: 'bg-slate-800 text-white'
  };
  inner.className = 'rounded-xl px-4 py-3 shadow-lg text-xs sm:text-sm font-medium flex items-center justify-between ' +
    (styles[type] || styles.info);
  inner.textContent = message;
  box.classList.remove('hidden');

  clearTimeout(box._timer);
  box._timer = setTimeout(function () {
    box.classList.add('hidden');
  }, 4000);
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ========================================================================== */
/*  API CLIENT (ใช้ text/plain เพื่อไม่ให้ติด CORS Preflight ของ Apps Script) */
/* ========================================================================== */

async function callApi(action, payload, silent) {
  if (!STATE.apiUrl) {
    document.getElementById('setupApiBanner').classList.remove('hidden');
    throw new Error('กรุณาตั้งค่า API_URL ก่อนใช้งาน');
  }

  var bodyObj = Object.assign({}, payload || {}, {
    action: action,
    idToken: STATE.idToken || '',
    lineUserId: STATE.lineUserId || '',
    lineDisplayName: STATE.lineDisplayName || ''
  });

  var res = await fetch(STATE.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(bodyObj)
  });

  var json = await res.json();
  if (!json.ok) {
    if (json.code === 'UNAUTHORIZED_UNBOUND') {
      showLoginView();
    }
    if (!silent) showToast(json.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    throw new Error(json.error || 'API Error');
  }
  return json.data;
}

/* ========================================================================== */
/*  INITIALIZATION & LIFF AUTH                                                */
/* ========================================================================== */

window.addEventListener('DOMContentLoaded', function () {
  initApp();
});

async function initApp() {
  var cfg = window.EMMS_CONFIG || {};
  var urlParams = new URLSearchParams(window.location.search);

  STATE.apiUrl = urlParams.get('api') || localStorage.getItem('EMMS_API_URL') || cfg.API_URL || '';
  STATE.liffId = urlParams.get('liffId') || localStorage.getItem('EMMS_LIFF_ID') || cfg.LIFF_ID || '';

  if (!STATE.apiUrl) {
    hideLoading();
    document.getElementById('setupApiBanner').classList.remove('hidden');
    return;
  }

  try {
    showLoading('กำลังตรวจสอบสิทธิ์ผ่าน LINE...');
    // หากไม่ได้ระบุ LIFF_ID ใน config.js ให้ดึงจากชีต Sys_Config ผ่าน API อัตโนมัติ
    if (!STATE.liffId && STATE.apiUrl && !urlParams.get('dev')) {
      try {
        var pubRes = await fetch(STATE.apiUrl + '?action=publicConfig');
        var pubJson = await pubRes.json();
        if (pubJson && pubJson.ok && pubJson.data && pubJson.data.LIFF_ID) {
          STATE.liffId = String(pubJson.data.LIFF_ID).trim();
        }
      } catch (cfgErr) {
        console.warn('Auto-fetch publicConfig warning:', cfgErr);
      }
    }
    await initLiffOrDevIdentity();
    var session = await callApi('getSession', {}, true);

    if (!session.bound) {
      showLoginView();
    } else {
      onSessionReady(session);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'ไม่สามารถเชื่อมต่อระบบได้', 'error');
  } finally {
    hideLoading();
  }
}

async function initLiffOrDevIdentity() {
  var isDevParam = new URLSearchParams(window.location.search).get('dev') === '1';
  if (STATE.liffId && window.liff && !isDevParam) {
    try {
      await liff.init({ liffId: STATE.liffId });
      if (!liff.isLoggedIn()) {
        // หากเปิดในแอป LINE หรือตั้งค่า LINE Login เรียบร้อย ให้ Redirect ไปหน้า LINE Login
        if (liff.isInClient() || !(window.EMMS_CONFIG && window.EMMS_CONFIG.ALLOW_BROWSER_DEV_MODE)) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
      } else {
        STATE.idToken = liff.getIDToken() || '';
        try {
          var profile = await liff.getProfile();
          STATE.lineUserId = profile.userId || '';
          STATE.lineDisplayName = profile.displayName || '';
        } catch (pErr) {
          var decoded = liff.getDecodedIDToken();
          if (decoded && decoded.sub) {
            STATE.lineUserId = decoded.sub;
            STATE.lineDisplayName = decoded.name || '';
          }
        }
        if (STATE.lineUserId) return;
      }
    } catch (liffErr) {
      console.warn('LIFF init fallback to dev mode:', liffErr);
    }
  }

  // โหมดทดสอบบนเบราว์เซอร์ (กรณีเปิดนอกแอป LINE หรือใส่ ?dev=1)
  var savedLineId = localStorage.getItem('EMMS_SIM_LINE_ID') || 'U11111111111111111111111111111111';
  localStorage.setItem('EMMS_SIM_LINE_ID', savedLineId);
  STATE.lineUserId = savedLineId;
  STATE.lineDisplayName = 'Browser Dev User';
}

function saveDevConfig() {
  var apiVal = document.getElementById('cfgApiUrlInput').value.trim();
  var simLine = document.getElementById('cfgSimLineIdInput').value.trim();
  if (!apiVal) {
    showToast('กรุณากรอก Web App URL', 'warn');
    return;
  }
  localStorage.setItem('EMMS_API_URL', apiVal);
  if (simLine) {
    if (!/^U[0-9a-fA-F]{32}$/.test(simLine)) {
      showToast('LINE User ID ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร a-f/0-9 จำนวน 32 ตัว', 'warn');
      return;
    }
    localStorage.setItem('EMMS_SIM_LINE_ID', simLine);
  }
  document.getElementById('setupApiBanner').classList.add('hidden');
  initApp();
}

function showLoginView() {
  hideAllViews();
  document.getElementById('viewLogin').classList.remove('hidden');
  document.getElementById('bottomNav').classList.add('hidden');
}

async function handleBindLogin(ev) {
  ev.preventDefault();
  var username = document.getElementById('loginUsername').value.trim();
  var password = document.getElementById('loginPassword').value.trim();
  var phone = document.getElementById('loginPhone').value.trim();

  try {
    showLoading('กำลังตรวจสอบชื่อผู้ใช้และผูกบัญชี LINE...');
    var session = await callApi('bindLine', {
      username: username,
      password: password,
      phone: phone
    });
    showToast('ผูกบัญชีสำเร็จ! ยินดีต้อนรับ ' + session.user.user_name, 'success');
    onSessionReady(session);
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function onSessionReady(session) {
  STATE.user = session.user;
  STATE.master = session.master || STATE.master;
  STATE.config = session.config || {};

  if (STATE.config.SYSTEM_NAME) {
    document.getElementById('headerTitle').textContent = STATE.config.SYSTEM_NAME;
  }
  if (STATE.config.ORG_NAME) {
    document.getElementById('headerSubtitle').textContent = STATE.config.ORG_NAME;
  }

  // แสดง Badge ผู้ใช้มุมขวาบน
  var badge = document.getElementById('userBadge');
  badge.classList.remove('hidden');
  document.getElementById('userNameText').textContent = STATE.user.user_name;
  var roleMap = { user: 'ผู้แจ้งซ่อม', technician: 'ทีมช่าง', admin: 'ผู้ดูแลระบบ' };
  document.getElementById('userRoleBadge').textContent = roleMap[STATE.user.user_role] || STATE.user.user_role;

  // แสดงเมนูด้านล่างตาม Role
  document.getElementById('bottomNav').classList.remove('hidden');
  var isTechOrAdmin = (STATE.user.user_role === 'technician' || STATE.user.user_role === 'admin');
  var isAdmin = (STATE.user.user_role === 'admin');

  var navQueue = document.getElementById('navTabQueue');
  var navDash = document.getElementById('navTabDashboard');
  var navUsers = document.getElementById('navTabUsers');

  navQueue.classList.toggle('hidden', !isTechOrAdmin);
  navQueue.classList.toggle('flex', isTechOrAdmin);
  navDash.classList.toggle('hidden', !isAdmin);
  navDash.classList.toggle('flex', isAdmin);
  navUsers.classList.toggle('hidden', !isAdmin);
  navUsers.classList.toggle('flex', isAdmin);

  populateCreateFormDropdowns();

  // หากเปิดมาจากลิงก์ ?jtr=JTR-... หรือ ?tab=... ให้เปิดไปที่แท็บที่ต้องการทันที
  var searchParams = new URLSearchParams(window.location.search);
  var jtrParam = searchParams.get('jtr');
  var tabParam = searchParams.get('tab');
  if (tabParam && ['create', 'myTickets', 'techQueue', 'adminDashboard', 'adminUsers'].indexOf(tabParam) !== -1) {
    switchTab(tabParam);
  } else if (jtrParam && isTechOrAdmin) {
    switchTab('techQueue');
  } else if (jtrParam) {
    switchTab('myTickets');
  } else if (STATE.user.user_role === 'technician') {
    switchTab('techQueue');
  } else {
    switchTab('create');
  }
}

function hideAllViews() {
  ['viewLogin', 'viewCreate', 'viewMyTickets', 'viewTechQueue', 'viewAdminDashboard', 'viewAdminUsers'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function switchTab(tabName) {
  hideAllViews();
  document.querySelectorAll('.nav-tab-btn').forEach(function (btn) {
    var active = btn.getAttribute('data-tab') === tabName;
    btn.classList.toggle('text-brand-600', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('text-slate-500', !active);
  });

  if (tabName === 'create') {
    document.getElementById('viewCreate').classList.remove('hidden');
  } else if (tabName === 'myTickets') {
    document.getElementById('viewMyTickets').classList.remove('hidden');
    loadMyTickets();
  } else if (tabName === 'techQueue') {
    document.getElementById('viewTechQueue').classList.remove('hidden');
    loadQueueTickets();
  } else if (tabName === 'adminDashboard') {
    document.getElementById('viewAdminDashboard').classList.remove('hidden');
    loadAdminDashboard();
  } else if (tabName === 'adminUsers') {
    document.getElementById('viewAdminUsers').classList.remove('hidden');
    loadAdminUsers();
  }
}

/* ========================================================================== */
/*  IMAGE COMPRESSION (HTML5 Canvas ย่อรูปฝั่งมือถือก่อนอัปโหลด)               */
/* ========================================================================== */

function compressImageFile(file) {
  var maxW = Number(STATE.config.IMAGE_MAX_WIDTH) || 1280;
  var quality = Number(STATE.config.IMAGE_JPEG_QUALITY) || 0.7;

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ========================================================================== */
/*  TAB 1: CREATE TICKET + DUPLICATE CHECK                                    */
/* ========================================================================== */

function populateCreateFormDropdowns() {
  var bldSelect = document.getElementById('fBuilding');
  bldSelect.innerHTML = '<option value="">-- เลือกอาคาร / พื้นที่ --</option>';
  STATE.master.buildings.forEach(function (b) {
    bldSelect.innerHTML += '<option value="' + esc(b.bld_id) + '">' + esc(b.bld_name) + '</option>';
  });

  var mainCatSelect = document.getElementById('fMainCategory');
  mainCatSelect.innerHTML = '<option value="">-- เลือกหมวดหลัก --</option>';
  var seenMain = {};
  STATE.master.categories.forEach(function (c) {
    if (!seenMain[c.main_category]) {
      seenMain[c.main_category] = true;
      mainCatSelect.innerHTML += '<option value="' + esc(c.main_category) + '">' + esc(c.main_category) + '</option>';
    }
  });

  document.getElementById('fPhone').value = STATE.user.user_phone || '';
  renderBeforeImagesPreview();
}

function onBuildingChange() {
  var bldId = document.getElementById('fBuilding').value;
  var locSelect = document.getElementById('fLocation');
  locSelect.innerHTML = '<option value="">-- เลือกชั้น / บริเวณ --</option>';

  STATE.master.locations
    .filter(function (l) { return l.bld_id === bldId; })
    .forEach(function (l) {
      locSelect.innerHTML += '<option value="' + esc(l.loc_id) + '">' + esc(l.loc_name) + '</option>';
    });

  document.getElementById('duplicateWarningBox').classList.add('hidden');
}

function onLocationOrRoomChange() {
  var locId = document.getElementById('fLocation').value;
  var datalist = document.getElementById('roomSuggestions');
  datalist.innerHTML = '';

  STATE.master.rooms
    .filter(function (r) { return r.loc_id === locId; })
    .forEach(function (r) {
      datalist.innerHTML += '<option value="' + esc(r.room_name) + '">' + esc(r.note || '') + '</option>';
    });

  // Debounce ตรวจสอบงานซ้ำ
  clearTimeout(STATE.dupTimer);
  STATE.dupTimer = setTimeout(checkDuplicateNow, 450);
}

async function checkDuplicateNow() {
  var bldId = document.getElementById('fBuilding').value;
  var locId = document.getElementById('fLocation').value;
  var room = document.getElementById('fRoom').value.trim();
  var box = document.getElementById('duplicateWarningBox');
  var listEl = document.getElementById('duplicateList');

  if (!bldId || !locId) {
    box.classList.add('hidden');
    return;
  }

  try {
    var res = await callApi('checkDuplicate', { bld_id: bldId, loc_id: locId, room: room }, true);
    var dups = res.duplicates || [];
    if (dups.length === 0) {
      box.classList.add('hidden');
      return;
    }
    listEl.innerHTML = dups.map(function (d) {
      return '<li class="bg-white/80 rounded-lg px-2.5 py-1.5 border border-amber-200">' +
        '<span class="font-semibold">[' + esc(d.jtr_id) + ']</span> ' +
        (d.room ? ('ห้อง ' + esc(d.room) + ' • ') : '') +
        esc(d.sub_category) + ' — "' + esc(d.description) + '" ' +
        '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] text-white" style="background:' + esc(d.status_color) + '">' +
        esc(d.status_label_th) + '</span></li>';
    }).join('');
    box.classList.remove('hidden');
  } catch (e) {
    console.warn('checkDuplicate error:', e);
  }
}

function onMainCategoryChange() {
  var mainCat = document.getElementById('fMainCategory').value;
  var subSelect = document.getElementById('fSubCategory');
  subSelect.innerHTML = '<option value="">-- เลือกหมวดย่อย --</option>';

  STATE.master.categories
    .filter(function (c) { return c.main_category === mainCat; })
    .forEach(function (c) {
      subSelect.innerHTML += '<option value="' + esc(c.cat_id) + '">' + esc(c.sub_category) + '</option>';
    });
}

async function handleBeforeImagesSelected(ev) {
  var files = Array.from(ev.target.files || []);
  var maxImgs = Number(STATE.config.MAX_IMAGES_BEFORE) || 3;
  if (!files.length) return;

  showLoading('กำลังย่อขนาดรูปภาพ...');
  try {
    for (var i = 0; i < files.length; i++) {
      if (STATE.beforeImages.length >= maxImgs) break;
      var compressed = await compressImageFile(files[i]);
      STATE.beforeImages.push(compressed);
    }
    renderBeforeImagesPreview();
  } catch (err) {
    showToast('ไม่สามารถอ่านไฟล์รูปภาพได้', 'error');
  } finally {
    ev.target.value = '';
    hideLoading();
  }
}

function renderBeforeImagesPreview() {
  var container = document.getElementById('beforeImagesPreview');
  container.innerHTML = STATE.beforeImages.map(function (dataUrl, idx) {
    return '<div class="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">' +
      '<img src="' + dataUrl + '" class="w-full h-full object-cover" />' +
      '<button type="button" onclick="removeBeforeImage(' + idx + ')" ' +
      'class="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold shadow">✕</button>' +
      '</div>';
  }).join('');
}

function removeBeforeImage(idx) {
  STATE.beforeImages.splice(idx, 1);
  renderBeforeImagesPreview();
}

async function handleCreateTicket(ev) {
  ev.preventDefault();
  if (STATE.beforeImages.length < 1) {
    showToast('กรุณาแนบรูปภาพประกอบอย่างน้อย 1 รูป', 'warn');
    return;
  }

  var payload = {
    bld_id: document.getElementById('fBuilding').value,
    loc_id: document.getElementById('fLocation').value,
    room: document.getElementById('fRoom').value.trim(),
    cat_id_reported: document.getElementById('fSubCategory').value,
    description: document.getElementById('fDescription').value.trim(),
    requester_phone: document.getElementById('fPhone').value.trim(),
    images: STATE.beforeImages
  };

  try {
    showLoading('กำลังบันทึกใบแจ้งซ่อมและอัปโหลดรูปภาพ...');
    var res = await callApi('createTicket', payload);
    var created = res.ticket;

    // ส่งข้อความเข้าแชท LINE OA เพื่อให้ Webhook ตอบกลับด้วย Flex Message ฟรี (ไม่เสียโควต้า Push)
    if (window.liff && liff.isInClient()) {
      try {
        await liff.sendMessages([
          {
            type: 'text',
            text: 'แจ้งซ่อม #' + created.jtr_id
          }
        ]);
      } catch (msgErr) {
        console.warn('liff.sendMessages warning:', msgErr);
      }
    }

    // รีเซ็ตฟอร์ม
    document.getElementById('createTicketForm').reset();
    document.getElementById('fPhone').value = STATE.user.user_phone || '';
    document.getElementById('duplicateWarningBox').classList.add('hidden');
    STATE.beforeImages = [];
    renderBeforeImagesPreview();

    showToast('ส่งใบแจ้งซ่อม ' + created.jtr_id + ' เรียบร้อยแล้ว!', 'success');
    switchTab('myTickets');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

/* ========================================================================== */
/*  TAB 2: MY TICKETS                                                         */
/* ========================================================================== */

async function loadMyTickets() {
  var container = document.getElementById('myTicketsContainer');
  try {
    showLoading('กำลังโหลดรายการแจ้งซ่อมของคุณ...');
    var res = await callApi('listMyTickets', {});
    STATE.myTickets = res.tickets || [];

    if (STATE.myTickets.length === 0) {
      container.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">' +
        '<div class="text-3xl mb-2">📭</div><p class="text-sm">ยังไม่มีประวัติการแจ้งซ่อมของคุณ</p></div>';
      return;
    }

    container.innerHTML = STATE.myTickets.map(function (t) {
      return renderTicketCardHtml(t, false);
    }).join('');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

async function promptCancelTicket(jtrId) {
  var reason = window.prompt('ระบุเหตุผลที่ต้องการยกเลิกใบงาน ' + jtrId + ':', 'แจ้งซ้ำ / แก้ไขได้เองแล้ว');
  if (reason === null) return;
  try {
    showLoading('กำลังยกเลิกใบงาน...');
    await callApi('cancelTicket', { jtr_id: jtrId, cancel_reason: reason });
    showToast('ยกเลิกใบงาน ' + jtrId + ' เรียบร้อยแล้ว', 'success');
    loadMyTickets();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function renderTicketCardHtml(t, isTechView) {
  var imgsBefore = (t.images_before || []).map(function (img) {
    return '<a href="' + esc(img.file_url) + '" target="_blank" class="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0">' +
      '<img src="' + esc(img.file_url) + '" class="w-full h-full object-cover" loading="lazy" /></a>';
  }).join('');

  var imgsAfter = (t.images_after || []).map(function (img) {
    return '<a href="' + esc(img.file_url) + '" target="_blank" class="block w-16 h-16 rounded-lg overflow-hidden border-2 border-emerald-400 shrink-0">' +
      '<img src="' + esc(img.file_url) + '" class="w-full h-full object-cover" loading="lazy" /></a>';
  }).join('');

  var actionButtons = '';
  if (!isTechView && t.status === 'PENDING') {
    actionButtons = '<div class="pt-3 mt-3 border-t border-slate-100 flex justify-end">' +
      '<button onclick="promptCancelTicket(\'' + esc(t.jtr_id) + '\')" ' +
      'class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl">🚫 ยกเลิกใบงาน</button></div>';
  }

  if (isTechView && !t.is_final) {
    var acceptBtn = t.status === 'PENDING'
      ? '<button onclick="handleQuickAccept(\'' + esc(t.jtr_id) + '\')" ' +
        'class="flex-1 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold py-2 px-3 rounded-xl">🛠️ กดรับงาน</button>'
      : '';
    actionButtons = '<div class="pt-3 mt-3 border-t border-slate-100 flex gap-2">' +
      acceptBtn +
      '<button onclick="openTechModal(\'' + esc(t.jtr_id) + '\')" ' +
      'class="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold py-2 px-3 rounded-xl">📝 อัปเดตสถานะ / ปิดงาน</button>' +
      '</div>';
  }

  return '<div class="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200">' +
    '<div class="flex items-center justify-between gap-2 mb-2">' +
      '<span class="font-display text-sm font-bold text-slate-800">' + esc(t.jtr_id) + '</span>' +
      '<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style="background:' + esc(t.status_color) + '">' +
        esc(t.status_label_th) +
      '</span>' +
    '</div>' +
    '<div class="text-xs space-y-1 text-slate-600">' +
      '<div>📍 <b class="text-slate-800">' + esc(t.bld_name) + '</b> › ' + esc(t.loc_name) +
        (t.room ? (' <span class="text-brand-700 font-semibold">(ห้อง ' + esc(t.room) + ')</span>') : '') + '</div>' +
      '<div>🏷️ ' + esc(t.main_category) + ' › <b>' + esc(t.sub_category) + '</b></div>' +
      '<div class="bg-slate-50 rounded-xl p-2.5 text-slate-800 mt-1">💬 ' + esc(t.description) + '</div>' +
      (isTechView
        ? ('<div>👤 ผู้แจ้ง: <b>' + esc(t.requester_name) + '</b> (' + esc(t.requester_division) + ')' +
           (t.requester_phone ? (' • โทร <a href="tel:' + esc(t.requester_phone) + '" class="text-brand-600 underline">' + esc(t.requester_phone) + '</a>') : '') + '</div>')
        : '') +
      '<div class="text-[11px] text-slate-400">🕒 แจ้งเมื่อ: ' + esc(t.created_at_th) + '</div>' +
      (t.assigned_names ? ('<div class="text-emerald-700 font-medium">👷 ช่างผู้ดำเนินการ: ' + esc(t.assigned_names) + '</div>') : '') +
      (t.status === 'ON_HOLD' && t.on_hold_reason ? ('<div class="text-purple-700 font-medium">⏳ รออะไหล่: ' + esc(t.on_hold_reason) + '</div>') : '') +
      (t.cause_solution ? ('<div class="text-emerald-800 bg-emerald-50 rounded-lg p-2">🔧 <b>ผลการซ่อม:</b> ' + esc(t.cause_solution) +
        (t.materials_used ? ('<br>📦 <b>วัสดุที่ใช้:</b> ' + esc(t.materials_used)) : '') + '</div>') : '') +
    '</div>' +
    (imgsBefore ? ('<div class="mt-2.5"><div class="text-[10px] text-slate-400 mb-1">รูปก่อนซ่อม:</div><div class="flex gap-2 overflow-x-auto">' + imgsBefore + '</div></div>') : '') +
    (imgsAfter ? ('<div class="mt-2"><div class="text-[10px] text-emerald-600 font-semibold mb-1">รูปหลังซ่อม:</div><div class="flex gap-2 overflow-x-auto">' + imgsAfter + '</div></div>') : '') +
    actionButtons +
  '</div>';
}

/* ========================================================================== */
/*  TAB 3: TECHNICIAN QUEUE & STATUS UPDATE MODAL                             */
/* ========================================================================== */

function setQueueFilter(filter) {
  STATE.queueFilter = filter;
  document.querySelectorAll('.q-filter-btn').forEach(function (btn) {
    var active = btn.getAttribute('data-filter') === filter;
    btn.className = 'q-filter-btn px-3 py-1.5 rounded-xl font-semibold shrink-0 ' +
      (active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700');
  });
  loadQueueTickets();
}

async function loadQueueTickets() {
  var container = document.getElementById('queueTicketsContainer');
  try {
    showLoading('กำลังโหลดคิวงานซ่อม...');
    var res = await callApi('listQueueTickets', { status: STATE.queueFilter });
    STATE.queueTickets = res.tickets || [];
    if (res.technicians) STATE.master.technicians = res.technicians;

    if (STATE.queueTickets.length === 0) {
      container.innerHTML = '<div class="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">' +
        '<div class="text-3xl mb-2">🎉</div><p class="text-sm">ไม่มีใบงานในหมวดสถานะนี้</p></div>';
      return;
    }

    container.innerHTML = STATE.queueTickets.map(function (t) {
      return renderTicketCardHtml(t, true);
    }).join('');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

async function handleQuickAccept(jtrId) {
  try {
    showLoading('กำลังบันทึกการรับงาน ' + jtrId + '...');
    var res = await callApi('acceptTicket', { jtr_id: jtrId });
    if (res.alreadyAccepted) {
      showToast('ใบงานนี้ถูกรับไปแล้วโดย ' + (res.ticket.first_accepted_by_name || 'ช่างท่านอื่น'), 'warn');
    } else {
      showToast('รับงาน ' + jtrId + ' เรียบร้อยแล้ว!', 'success');
    }
    loadQueueTickets();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function openTechModal(jtrId) {
  var ticket = STATE.queueTickets.find(function (t) { return t.jtr_id === jtrId; });
  if (!ticket) return;

  document.getElementById('mJtrId').value = ticket.jtr_id;
  document.getElementById('modalTicketTitle').textContent = 'อัปเดตงาน ' + ticket.jtr_id;
  document.getElementById('modalTicketSub').textContent = ticket.bld_name + ' › ' + ticket.loc_name + ' — ' + ticket.sub_category;

  document.getElementById('mNextStatus').value = ticket.status === 'IN_PROGRESS' ? 'COMPLETED' : 'IN_PROGRESS';
  document.getElementById('mHoldReason').value = ticket.on_hold_reason || '';
  document.getElementById('mCauseSolution').value = ticket.cause_solution || '';
  document.getElementById('mMaterialsUsed').value = ticket.materials_used || '';

  // Populate หมวดงานจริง
  var catSel = document.getElementById('mActualCategory');
  catSel.innerHTML = STATE.master.categories.map(function (c) {
    var selected = (c.cat_id === (ticket.cat_id_actual || ticket.cat_id_reported)) ? ' selected' : '';
    return '<option value="' + esc(c.cat_id) + '"' + selected + '>' + esc(c.main_category + ' › ' + c.sub_category) + '</option>';
  }).join('');

  // Populate Checkbox รายชื่อช่างผู้ร่วมงาน (ติ๊กช่างที่รับงานคนแรกและตัวเองไว้ให้เป็นค่าเริ่มต้น)
  var existingIds = (ticket.assignments || []).map(function (a) { return a.tech_id; });
  if (existingIds.indexOf(STATE.user.user_id) === -1) existingIds.push(STATE.user.user_id);
  if (ticket.first_accepted_by && existingIds.indexOf(ticket.first_accepted_by) === -1) {
    existingIds.push(ticket.first_accepted_by);
  }

  var cbContainer = document.getElementById('mCollaboratorsCheckboxes');
  cbContainer.innerHTML = STATE.master.technicians.map(function (tech) {
    var checked = existingIds.indexOf(tech.user_id) !== -1 ? ' checked' : '';
    return '<label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">' +
      '<input type="checkbox" name="techCollab" value="' + esc(tech.user_id) + '"' + checked + ' class="w-4 h-4 rounded text-brand-600" />' +
      '<span>' + esc(tech.user_name) + '</span>' +
    '</label>';
  }).join('');

  STATE.afterImages = [];
  renderAfterImagesPreview();
  onModalStatusChange();

  var modal = document.getElementById('techActionModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeTechModal() {
  var modal = document.getElementById('techActionModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function onModalStatusChange() {
  var st = document.getElementById('mNextStatus').value;
  var holdSec = document.getElementById('mHoldSection');
  var closeSec = document.getElementById('mCloseJobSection');
  var causeLabel = document.getElementById('mCauseLabel');

  holdSec.classList.toggle('hidden', st !== 'ON_HOLD');
  var isClosing = (st === 'COMPLETED' || st === 'CANNOT_REPAIR');
  closeSec.classList.toggle('hidden', !isClosing);

  if (st === 'CANNOT_REPAIR') {
    causeLabel.innerHTML = 'เหตุผลที่ไม่สามารถซ่อมแซมได้ <span class="text-red-500">*</span>';
  } else {
    causeLabel.innerHTML = 'สาเหตุ / วิธีแก้ไข <span class="text-red-500">*</span>';
  }
}

async function handleAfterImagesSelected(ev) {
  var files = Array.from(ev.target.files || []);
  var maxAfter = Number(STATE.config.MAX_IMAGES_AFTER) || 3;
  if (!files.length) return;

  showLoading('กำลังย่อขนาดรูปหลังซ่อม...');
  try {
    for (var i = 0; i < files.length; i++) {
      if (STATE.afterImages.length >= maxAfter) break;
      var compressed = await compressImageFile(files[i]);
      STATE.afterImages.push(compressed);
    }
    renderAfterImagesPreview();
  } catch (e) {
    showToast('อ่านไฟล์รูปไม่สำเร็จ', 'error');
  } finally {
    ev.target.value = '';
    hideLoading();
  }
}

function renderAfterImagesPreview() {
  var container = document.getElementById('afterImagesPreview');
  container.innerHTML = STATE.afterImages.map(function (dataUrl, idx) {
    return '<div class="relative aspect-square rounded-xl overflow-hidden border border-emerald-300 bg-slate-100">' +
      '<img src="' + dataUrl + '" class="w-full h-full object-cover" />' +
      '<button type="button" onclick="removeAfterImage(' + idx + ')" ' +
      'class="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold">✕</button>' +
      '</div>';
  }).join('');
}

function removeAfterImage(idx) {
  STATE.afterImages.splice(idx, 1);
  renderAfterImagesPreview();
}

async function submitTechStatusUpdate(ev) {
  ev.preventDefault();
  var jtrId = document.getElementById('mJtrId').value;
  var nextStatus = document.getElementById('mNextStatus').value;

  var checkedTechs = Array.from(document.querySelectorAll('input[name="techCollab"]:checked')).map(function (el) {
    return el.value;
  });

  if ((nextStatus === 'COMPLETED' || nextStatus === 'CANNOT_REPAIR') && STATE.afterImages.length < 1) {
    showToast('กรุณาแนบรูปถ่ายหลังซ่อม/หน้างานอย่างน้อย 1 รูป', 'warn');
    return;
  }

  var causeText = document.getElementById('mCauseSolution').value.trim();
  var payload = {
    jtr_id: jtrId,
    to_status: nextStatus,
    on_hold_reason: document.getElementById('mHoldReason').value.trim(),
    cat_id_actual: document.getElementById('mActualCategory').value,
    cause_solution: causeText,
    tech_note: nextStatus === 'CANNOT_REPAIR' ? causeText : '',
    materials_used: document.getElementById('mMaterialsUsed').value.trim(),
    collaborator_tech_ids: checkedTechs,
    images: STATE.afterImages
  };

  try {
    showLoading('กำลังบันทึกสถานะและส่งแจ้งเตือน...');
    await callApi('updateTicketStatus', payload);
    closeTechModal();
    showToast('อัปเดตใบงาน ' + jtrId + ' เรียบร้อยแล้ว!', 'success');
    loadQueueTickets();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

/* ========================================================================== */
/*  TAB 4: ADMIN DASHBOARD & FISCAL YEAR STATS                                */
/* ========================================================================== */

async function loadAdminDashboard() {
  var fySelect = document.getElementById('dashFiscalYearSelect');
  var selectedFy = fySelect.value || '';

  try {
    showLoading('กำลังคำนวณสถิติตามปีงบประมาณ...');
    var data = await callApi('adminDashboard', { fiscal_year: selectedFy });
    STATE.dashboardData = data;

    // Populate Fiscal Year dropdown
    fySelect.innerHTML = (data.available_fiscal_years || []).map(function (fy) {
      var sel = (String(fy) === String(data.fiscal_year)) ? ' selected' : '';
      return '<option value="' + esc(fy) + '"' + sel + '>ปีงบประมาณ ' + esc(fy) + '</option>';
    }).join('') + '<option value="ALL"' + (data.fiscal_year === 'ALL' ? ' selected' : '') + '>ทุกปีงบประมาณรวมกัน</option>';

    // KPI Cards
    document.getElementById('kpiTotal').textContent = data.kpi.total;
    document.getElementById('kpiCompleted').textContent = data.kpi.completed;
    document.getElementById('kpiPendingOpen').textContent = data.kpi.pending_open;
    document.getElementById('kpiAvgResponse').textContent = data.kpi.avg_response_mins + ' นาที';
    document.getElementById('kpiAvgRepair').textContent = data.kpi.avg_repair_hours + ' ชม.';
    document.getElementById('kpiLineQuota').textContent = data.kpi.line_push_used + ' / ' + data.kpi.line_push_limit;

    // ตารางสถิติช่างรายบุคคล
    var tbody = document.getElementById('techStatsTableBody');
    tbody.innerHTML = (data.tech_stats || []).map(function (ts) {
      return '<tr class="hover:bg-slate-50">' +
        '<td class="py-2 px-2.5 font-semibold text-slate-800">' + esc(ts.tech_name) + '</td>' +
        '<td class="py-2 px-2.5 text-center font-bold text-brand-600">' + ts.total_participated + '</td>' +
        '<td class="py-2 px-2.5 text-center font-semibold text-emerald-600">' + ts.completed_jobs + '</td>' +
        '<td class="py-2 px-2.5 text-center text-amber-600">' + ts.in_progress_jobs + '</td>' +
        '<td class="py-2 px-2.5 text-center text-slate-600">' + ts.first_accepted_count + '</td>' +
        '<td class="py-2 px-2.5 text-right text-slate-600">' + ts.avg_repair_hours + ' ชม.</td>' +
      '</tr>';
    }).join('');

    renderDashboardCharts(data);
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function renderDashboardCharts(data) {
  var catLabels = Object.keys(data.by_category || {});
  var catValues = catLabels.map(function (k) { return data.by_category[k]; });

  if (STATE.chartCategory) STATE.chartCategory.destroy();
  var ctxCat = document.getElementById('chartByCategory').getContext('2d');
  STATE.chartCategory = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catValues,
        backgroundColor: ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#dc2626', '#ca8a04', '#64748b']
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
    }
  });

  var bldEntries = Object.keys(data.by_building || {}).map(function (k) {
    return { name: k, count: data.by_building[k] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8);

  if (STATE.chartBuilding) STATE.chartBuilding.destroy();
  var ctxBld = document.getElementById('chartByBuilding').getContext('2d');
  STATE.chartBuilding = new Chart(ctxBld, {
    type: 'bar',
    data: {
      labels: bldEntries.map(function (x) { return x.name; }),
      datasets: [{
        label: 'จำนวนใบงาน',
        data: bldEntries.map(function (x) { return x.count; }),
        backgroundColor: '#2563eb',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function exportDashboardCsv() {
  if (!STATE.dashboardData || !STATE.dashboardData.tickets) {
    showToast('ยังไม่มีข้อมูลสำหรับส่งออก', 'warn');
    return;
  }
  var headers = [
    'รหัสใบงาน', 'วันที่แจ้ง', 'ผู้แจ้ง', 'สังกัด', 'ส่วนงาน', 'เบอร์โทร',
    'อาคาร', 'ชั้น/บริเวณ', 'ห้อง', 'หมวดหลัก', 'หมวดย่อย', 'อาการเสีย',
    'สถานะ', 'ผู้รับงานคนแรก', 'เวลารับงาน', 'ทีมช่างผู้ร่วมซ่อม',
    'สาเหตุ/วิธีแก้ไข', 'วัสดุที่ใช้', 'เวลาเสร็จสิ้น'
  ];

  var csvCell = function (v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
  };

  var rows = STATE.dashboardData.tickets.map(function (t) {
    return [
      t.jtr_id, t.created_at_th, t.requester_name, t.requester_dept, t.requester_division, t.requester_phone,
      t.bld_name, t.loc_name, t.room, t.main_category, t.sub_category, t.description,
      t.status_label_th, t.first_accepted_by_name, t.first_accepted_at_th, t.assigned_names,
      t.cause_solution || t.tech_note, t.materials_used, t.finished_at_th
    ].map(csvCell).join(',');
  });

  var csvContent = '\uFEFF' + headers.join(',') + '\r\n' + rows.join('\r\n');
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'e-MMS_Report_FY' + (STATE.dashboardData.fiscal_year || 'ALL') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function triggerTelegramSummaryNow() {
  try {
    showLoading('กำลังส่งสรุปงานค้างเข้ากลุ่ม Telegram...');
    await callApi('adminSendPendingSummary', {});
    showToast('ส่งสรุปงานค้างเข้ากลุ่ม Telegram เรียบร้อยแล้ว!', 'success');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

/* ========================================================================== */
/*  TAB 5: ADMIN USER MANAGEMENT                                              */
/* ========================================================================== */

async function loadAdminUsers() {
  try {
    showLoading('กำลังโหลดรายชื่อผู้ใช้งาน...');
    var res = await callApi('adminListUsers', {});
    STATE.adminUsers = res.users || [];
    renderAdminUsersList();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function renderAdminUsersList() {
  var q = (document.getElementById('userSearchInput').value || '').trim().toLowerCase();
  var container = document.getElementById('adminUsersContainer');

  var filtered = STATE.adminUsers.filter(function (u) {
    if (!q) return true;
    return (u.user_name.toLowerCase().indexOf(q) !== -1) ||
           (u.user_username.toLowerCase().indexOf(q) !== -1) ||
           (u.division_name.toLowerCase().indexOf(q) !== -1) ||
           (u.user_id.toLowerCase().indexOf(q) !== -1);
  });

  container.innerHTML = filtered.map(function (u) {
    var roleColors = {
      admin: 'bg-purple-100 text-purple-800',
      technician: 'bg-amber-100 text-amber-800',
      user: 'bg-slate-100 text-slate-700'
    };
    var lineBadge = u.line_user_id
      ? '<span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">✅ ผูก LINE แล้ว (' + esc(u.line_display_name || 'LINE') + ')</span>'
      : '<span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">ยังไม่ผูก LINE</span>';

    var resetBtn = u.line_user_id
      ? '<button onclick="handleResetUserLine(\'' + esc(u.user_id) + '\', \'' + esc(u.user_name) + '\')" ' +
        'class="text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg">🔓 รีเซ็ต LINE</button>'
      : '';

    return '<div class="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs flex items-center justify-between gap-2">' +
      '<div class="min-w-0">' +
        '<div class="flex items-center gap-1.5 flex-wrap">' +
          '<span class="font-semibold text-sm text-slate-800">' + esc(u.user_name) + '</span>' +
          '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + (roleColors[u.user_role] || roleColors.user) + '">' + esc(u.user_role) + '</span>' +
          (!u.is_active ? '<span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ปิดใช้งาน</span>' : '') +
        '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">' +
          'Username: <b>' + esc(u.user_username || '-') + '</b> • ' + esc(u.division_name || u.dept_name) +
        '</div>' +
        '<div class="mt-1 flex items-center gap-1.5 flex-wrap">' + lineBadge +
          (u.telegram_user_id ? ('<span class="text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">TG: ' + esc(u.telegram_user_id) + '</span>') : '') +
        '</div>' +
      '</div>' +
      '<div class="flex flex-col sm:flex-row gap-1.5 shrink-0">' +
        resetBtn +
        '<button onclick="openUserModal(\'' + esc(u.user_id) + '\')" class="text-[11px] font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg">แก้ไข</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openUserModal(userId) {
  var deptSel = document.getElementById('uEditDept');
  deptSel.innerHTML = STATE.master.departments.map(function (d) {
    return '<option value="' + esc(d.dept_id) + '">' + esc(d.dept_name + ' — ' + d.division_name) + '</option>';
  }).join('');

  var u = userId ? STATE.adminUsers.find(function (x) { return x.user_id === userId; }) : null;
  document.getElementById('userModalTitle').textContent = u ? ('แก้ไขผู้ใช้ ' + u.user_id) : 'เพิ่มผู้ใช้ใหม่';
  document.getElementById('uEditId').value = u ? u.user_id : '';
  document.getElementById('uEditName').value = u ? u.user_name : '';
  document.getElementById('uEditUsername').value = u ? u.user_username : '';
  document.getElementById('uEditPassword').value = u ? u.user_password : '';
  document.getElementById('uEditPhone').value = u ? u.user_phone : '';
  document.getElementById('uEditRole').value = u ? u.user_role : 'user';
  document.getElementById('uEditDept').value = u ? u.dept_id : (STATE.master.departments[0] ? STATE.master.departments[0].dept_id : 'DEP01');
  document.getElementById('uEditTelegramId').value = u ? u.telegram_user_id : '';
  document.getElementById('uEditActive').checked = u ? u.is_active : true;

  var modal = document.getElementById('userEditModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeUserModal() {
  var modal = document.getElementById('userEditModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function submitAdminUserForm(ev) {
  ev.preventDefault();
  var payload = {
    user_id: document.getElementById('uEditId').value,
    user_name: document.getElementById('uEditName').value.trim(),
    user_username: document.getElementById('uEditUsername').value.trim(),
    user_password: document.getElementById('uEditPassword').value.trim(),
    user_phone: document.getElementById('uEditPhone').value.trim(),
    user_role: document.getElementById('uEditRole').value,
    dept_id: document.getElementById('uEditDept').value,
    telegram_user_id: document.getElementById('uEditTelegramId').value.trim(),
    is_active: document.getElementById('uEditActive').checked
  };

  try {
    showLoading('กำลังบันทึกข้อมูลผู้ใช้...');
    var res = await callApi('adminSaveUser', payload);
    STATE.adminUsers = res.users || [];
    renderAdminUsersList();
    closeUserModal();
    showToast('บันทึกข้อมูลผู้ใช้เรียบร้อยแล้ว', 'success');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

async function handleResetUserLine(userId, userName) {
  if (!window.confirm('ยืนยันการรีเซ็ตการผูกบัญชี LINE ของ "' + userName + '" หรือไม่?\n(ผู้ใช้จะสามารถล็อกอินผูกกับ LINE เครื่องใหม่ได้ทันที)')) {
    return;
  }
  try {
    showLoading('กำลังรีเซ็ตการผูก LINE...');
    var res = await callApi('adminResetLine', { user_id: userId });
    STATE.adminUsers = res.users || [];
    renderAdminUsersList();
    showToast('รีเซ็ตการผูก LINE ของ ' + userName + ' เรียบร้อยแล้ว', 'success');
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}
