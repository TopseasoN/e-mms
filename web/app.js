/**
 * e-MMS : Frontend Application Logic (LINE LIFF + Direct Supabase + GAS Fallback)
 * ---------------------------------------------------------------------------
 * รองรับการเชื่อมต่อ 2 โหมดอัตโนมัติ:
 *   1. Direct Supabase Mode (Sub-second Latency < 1s):
 *      เมื่อตั้งค่า SUPABASE_URL + SUPABASE_ANON_KEY หน้าเว็บจะอ่าน/เขียนผ่าน PostgREST
 *      และอัปโหลดไฟล์ Binary ตรงเข้า Supabase Storage ทันที
 *   2. GAS Fallback Mode:
 *      หากยังไม่ได้ระบุค่า Supabase ระบบจะสลับไปเรียก Google Apps Script Web App เดิมอัตโนมัติ
 */

var STATE = {
  apiUrl: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseBucket: 'ticket-attachments',
  supabaseClient: null,
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
/*  API CLIENT (Direct Supabase Sub-Second Mode + GAS Fallback)               */
/* ========================================================================== */

function formatThaiDateClient_(isoOrDate) {
  if (!isoOrDate) return '-';
  var d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return String(isoOrDate);
  var fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  var parts = {};
  fmt.formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
  var yearBE = Number(parts.year) + 543;
  return parts.day + '/' + parts.month + '/' + yearBE + ' ' + parts.hour + ':' + parts.minute;
}

function dataUrlToBlob_(dataUrl) {
  var arr = String(dataUrl).split(',');
  var mimeMatch = arr[0].match(/:(.*?);/);
  var mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  var bstr = atob(arr[1] || '');
  var n = bstr.length;
  var u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function uploadImageToSupabaseStorage_(dataUrl, jtrId, attType, seq) {
  var sb = STATE.supabaseClient;
  var now = new Date();
  var yearBE = now.getFullYear() + 543;
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var folder = yearBE + '-' + mm;
  var storagePath = folder + '/' + jtrId + '_' + attType + '_' + seq + '_' + Date.now() + '.jpg';
  var blob = dataUrlToBlob_(dataUrl);

  var upRes = await sb.storage
    .from(STATE.supabaseBucket)
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });

  if (upRes.error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + upRes.error.message);

  var pub = sb.storage.from(STATE.supabaseBucket).getPublicUrl(storagePath);
  return {
    storagePath: storagePath,
    fileUrl: pub.data.publicUrl
  };
}

async function enrichTicketsClient_(rows) {
  if (!rows || !rows.length) return [];
  var sb = STATE.supabaseClient;
  var jtrIds = rows.map(function (r) { return r.jtr_id; });

  var results = await Promise.all([
    sb.from('Trans_Attachments').select('*').in('jtr_id', jtrIds).order('seq', { ascending: true }),
    sb.from('Trans_Assignments').select('*').in('jtr_id', jtrIds),
    sb.from('Master_Users').select('user_id, user_name, line_user_id')
  ]);

  var atts = results[0].data || [];
  var asgs = results[1].data || [];
  var users = results[2].data || [];

  var userMap = {};
  users.forEach(function (u) { userMap[u.user_id] = u; });

  var bldMap = {};
  (STATE.master.buildings || []).forEach(function (b) { bldMap[b.bld_id] = b.bld_name; });

  var locMap = {};
  (STATE.master.locations || []).forEach(function (l) { locMap[l.loc_id] = l.loc_name; });

  var catMap = {};
  (STATE.master.categories || []).forEach(function (c) { catMap[c.cat_id] = c; });

  var stMap = {};
  (STATE.master.statuses || []).forEach(function (s) { stMap[s.status_code] = s; });

  var attByJtr = {};
  atts.forEach(function (a) {
    if (!attByJtr[a.jtr_id]) attByJtr[a.jtr_id] = { BEFORE: [], AFTER: [] };
    var bucket = a.att_type === 'AFTER' ? 'AFTER' : 'BEFORE';
    attByJtr[a.jtr_id][bucket].push(a);
  });

  var asgByJtr = {};
  asgs.forEach(function (asg) {
    if (!asgByJtr[asg.jtr_id]) asgByJtr[asg.jtr_id] = [];
    var u = userMap[asg.tech_id];
    asgByJtr[asg.jtr_id].push({
      asg_id: asg.asg_id,
      tech_id: asg.tech_id,
      tech_name: u ? u.user_name : asg.tech_id,
      is_first_accepter: Boolean(asg.is_first_accepter)
    });
  });

  return rows.map(function (r) {
    var catAct = catMap[r.cat_id_actual || r.cat_id_reported] || { main_category: '', sub_category: '' };
    var st = stMap[r.status] || { status_label_th: r.status, status_color: '#9E9E9E', is_final: false };
    var myAtts = attByJtr[r.jtr_id] || { BEFORE: [], AFTER: [] };
    var myAsgs = asgByJtr[r.jtr_id] || [];
    var firstTech = r.first_accepted_by ? userMap[r.first_accepted_by] : null;

    return Object.assign({}, r, {
      created_at_th: formatThaiDateClient_(r.created_at),
      first_accepted_at_th: formatThaiDateClient_(r.first_accepted_at),
      finished_at_th: formatThaiDateClient_(r.finished_at),
      bld_name: bldMap[r.bld_id] || r.bld_id,
      loc_name: locMap[r.loc_id] || r.loc_id,
      main_category: catAct.main_category,
      sub_category: catAct.sub_category,
      status_label_th: st.status_label_th,
      status_color: st.status_color,
      is_final: Boolean(st.is_final),
      first_accepted_by_name: firstTech ? firstTech.user_name : '',
      images_before: myAtts.BEFORE,
      images_after: myAtts.AFTER,
      assignments: myAsgs,
      assigned_names: myAsgs.map(function (a) { return a.tech_name; }).join(', ')
    });
  });
}

async function callSupabaseDirect_(action, payload) {
  var sb = STATE.supabaseClient;
  payload = payload || {};

  if (action === 'getSession') {
    var boot = await Promise.all([
      sb.from('Master_Users').select('*').eq('line_user_id', STATE.lineUserId).eq('is_active', true).maybeSingle(),
      sb.from('Master_Departments').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('Master_Buildings').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('Master_Locations').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('Master_Rooms').select('*').eq('is_active', true),
      sb.from('Master_Categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      sb.from('Master_Statuses').select('*').order('sort_order', { ascending: true }),
      sb.from('Master_Users').select('user_id, user_name, user_role').eq('is_active', true).in('user_role', ['technician', 'admin']),
      sb.from('Sys_Config').select('config_key, config_value')
    ]);

    var userRow = boot[0].data;
    var depts = boot[1].data || [];
    var cfgMap = {};
    (boot[8].data || []).forEach(function (c) { cfgMap[c.config_key] = c.config_value; });

    if (!userRow) {
      return {
        bound: false,
        lineUserId: STATE.lineUserId,
        lineDisplayName: STATE.lineDisplayName,
        config: cfgMap
      };
    }

    var deptObj = depts.find(function (d) { return d.dept_id === userRow.dept_id; }) || { dept_name: '', division_name: '' };
    var sanitizedUser = {
      user_id: userRow.user_id,
      user_username: userRow.user_username || '',
      user_name: userRow.user_name || '',
      user_phone: userRow.user_phone || '',
      dept_id: userRow.dept_id || '',
      dept_name: deptObj.dept_name,
      division_name: deptObj.division_name,
      user_role: userRow.user_role || 'user',
      line_user_id: userRow.line_user_id || '',
      line_display_name: userRow.line_display_name || '',
      telegram_user_id: userRow.telegram_user_id || ''
    };

    return {
      bound: true,
      user: sanitizedUser,
      master: {
        departments: depts,
        buildings: boot[2].data || [],
        locations: boot[3].data || [],
        rooms: boot[4].data || [],
        categories: boot[5].data || [],
        statuses: boot[6].data || [],
        technicians: boot[7].data || []
      },
      config: cfgMap
    };
  }

  if (action === 'bindLine') {
    var bindRes = await sb.rpc('rpc_bind_line_account', {
      p_username: payload.username || '',
      p_password: payload.password || '',
      p_line_user_id: STATE.lineUserId,
      p_line_display_name: STATE.lineDisplayName || '',
      p_phone: payload.phone || ''
    });
    if (bindRes.error) throw new Error(bindRes.error.message);
    return await callSupabaseDirect_('getSession', {});
  }

  if (!STATE.user) throw new Error('UNAUTHORIZED_UNBOUND');

  if (action === 'checkDuplicate') {
    var openStatuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
    var qRes = await sb
      .from('Trans_JobTickets')
      .select('jtr_id, room, cat_id_reported, cat_id_actual, description, status, created_at')
      .eq('bld_id', payload.bld_id)
      .eq('loc_id', payload.loc_id)
      .in('status', openStatuses)
      .order('created_at', { ascending: false })
      .limit(10);

    var roomFilter = String(payload.room || '').trim().toLowerCase();
    var matches = (qRes.data || []).filter(function (r) {
      var rRoom = String(r.room || '').trim().toLowerCase();
      if (roomFilter && rRoom && rRoom !== roomFilter) return false;
      return true;
    }).slice(0, 5);

    var enrichedDups = await enrichTicketsClient_(matches);
    return { duplicates: enrichedDups };
  }

  if (action === 'createTicket') {
    var phone = String(payload.requester_phone || STATE.user.user_phone || '').trim();
    if (phone && phone !== STATE.user.user_phone) {
      await sb.from('Master_Users').update({ user_phone: phone, updated_at: new Date().toISOString() }).eq('user_id', STATE.user.user_id);
      STATE.user.user_phone = phone;
    }

    // 1. บันทึกใบงานลง Trans_JobTickets (Trigger ใน Postgres ออกรหัส JTR-YYMM-NNN อัตโนมัติ < 5ms)
    var insRes = await sb.from('Trans_JobTickets').insert({
      requester_id: STATE.user.user_id,
      requester_name: STATE.user.user_name,
      requester_phone: phone,
      requester_dept: STATE.user.dept_name || '',
      requester_division: STATE.user.division_name || '',
      bld_id: payload.bld_id,
      loc_id: payload.loc_id,
      room: payload.room || '',
      cat_id_reported: payload.cat_id_reported,
      cat_id_actual: payload.cat_id_reported,
      description: payload.description,
      status: 'PENDING'
    }).select('*').single();

    if (insRes.error) throw new Error(insRes.error.message);
    var createdTicket = insRes.data;
    var jtrId = createdTicket.jtr_id;

    // 2. อัปโหลดรูปภาพ BEFORE 1-3 รูปแบบ Parallel เข้า Supabase Storage
    var imgs = (payload.images || []).slice(0, 3);
    var uploadedList = await Promise.all(imgs.map(function (dataUrl, idx) {
      return uploadImageToSupabaseStorage_(dataUrl, jtrId, 'BEFORE', idx + 1);
    }));

    var attRows = uploadedList.map(function (up, idx) {
      return {
        jtr_id: jtrId,
        att_type: 'BEFORE',
        seq: idx + 1,
        drive_file_id: up.storagePath,
        file_url: up.fileUrl,
        uploaded_by: STATE.user.user_id
      };
    });

    await Promise.all([
      sb.from('Trans_Attachments').insert(attRows),
      sb.from('Trans_StatusLogs').insert({
        jtr_id: jtrId,
        from_status: '',
        to_status: 'PENDING',
        changed_by: STATE.user.user_id,
        changed_via: 'LIFF',
        note: 'สร้างใบงานแจ้งซ่อมใหม่'
      })
    ]);

    return { ticket: createdTicket };
  }

  if (action === 'listMyTickets') {
    var myRes = await sb
      .from('Trans_JobTickets')
      .select('*')
      .eq('requester_id', STATE.user.user_id)
      .order('created_at', { ascending: false });
    if (myRes.error) throw new Error(myRes.error.message);
    return { tickets: await enrichTicketsClient_(myRes.data || []) };
  }

  if (action === 'cancelTicket') {
    var nowIso = new Date().toISOString();
    var cRes = await sb
      .from('Trans_JobTickets')
      .update({
        status: 'CANCELLED',
        cancelled_at: nowIso,
        cancel_reason: payload.cancel_reason || 'ผู้แจ้งยกเลิกรายการ',
        updated_at: nowIso
      })
      .eq('jtr_id', payload.jtr_id)
      .eq('status', 'PENDING')
      .select('*')
      .maybeSingle();

    if (cRes.error || !cRes.data) {
      throw new Error('ไม่สามารถยกเลิกได้ เนื่องจากทีมช่างรับงานไปแล้ว');
    }
    await sb.from('Trans_StatusLogs').insert({
      jtr_id: payload.jtr_id,
      from_status: 'PENDING',
      to_status: 'CANCELLED',
      changed_by: STATE.user.user_id,
      changed_via: 'LIFF',
      note: payload.cancel_reason || 'ผู้แจ้งยกเลิกรายการ'
    });
    return { ticket: cRes.data };
  }

  if (action === 'listQueueTickets') {
    var q = sb.from('Trans_JobTickets').select('*').order('created_at', { ascending: false });
    var stFilter = payload.status || 'ACTIVE';
    if (stFilter === 'ACTIVE') {
      q = q.in('status', ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD']);
    } else if (stFilter !== 'ALL') {
      q = q.eq('status', stFilter);
    }
    var qData = await q;
    if (qData.error) throw new Error(qData.error.message);
    return {
      tickets: await enrichTicketsClient_(qData.data || []),
      technicians: STATE.master.technicians
    };
  }

  if (action === 'acceptTicket') {
    var accRes = await sb.rpc('rpc_accept_ticket', {
      p_jtr_id: payload.jtr_id,
      p_tech_user_id: STATE.user.user_id,
      p_via: 'LIFF'
    });
    if (accRes.error) throw new Error(accRes.error.message);
    return {
      alreadyAccepted: Boolean(accRes.data && accRes.data.alreadyAccepted),
      ticket: accRes.data
    };
  }

  if (action === 'updateTicketStatus') {
    var jtrId2 = payload.jtr_id;
    var nextSt = payload.to_status;
    var nowIso2 = new Date().toISOString();

    var curRes = await sb.from('Trans_JobTickets').select('*').eq('jtr_id', jtrId2).single();
    if (curRes.error || !curRes.data) throw new Error('ไม่พบใบงาน ' + jtrId2);
    var cur = curRes.data;

    var patch = { status: nextSt, updated_at: nowIso2 };
    if (!cur.first_accepted_by) {
      patch.first_accepted_by = STATE.user.user_id;
      patch.first_accepted_at = nowIso2;
    }

    if (nextSt === 'IN_PROGRESS' && !cur.started_at) {
      patch.started_at = nowIso2;
    } else if (nextSt === 'ON_HOLD') {
      patch.on_hold_reason = payload.on_hold_reason || '';
    } else if (nextSt === 'COMPLETED' || nextSt === 'CANNOT_REPAIR') {
      if (!cur.started_at) patch.started_at = nowIso2;
      patch.cat_id_actual = payload.cat_id_actual || cur.cat_id_reported;
      patch.cause_solution = payload.cause_solution || '';
      patch.materials_used = payload.materials_used || '';
      patch.tech_note = payload.tech_note || '';
      patch.finished_at = nowIso2;
      patch.finished_by = STATE.user.user_id;

      var afterImgs = (payload.images || []).slice(0, 3);
      if (afterImgs.length > 0) {
        var uploadedAfter = await Promise.all(afterImgs.map(function (dUrl, idx) {
          return uploadImageToSupabaseStorage_(dUrl, jtrId2, 'AFTER', idx + 1);
        }));
        var afterRows = uploadedAfter.map(function (up, idx) {
          return {
            jtr_id: jtrId2,
            att_type: 'AFTER',
            seq: idx + 1,
            drive_file_id: up.storagePath,
            file_url: up.fileUrl,
            uploaded_by: STATE.user.user_id
          };
        });
        await sb.from('Trans_Attachments').insert(afterRows);
      }

      var collabIds = Array.isArray(payload.collaborator_tech_ids) && payload.collaborator_tech_ids.length
        ? payload.collaborator_tech_ids
        : [STATE.user.user_id];
      var firstAccepterId = patch.first_accepted_by || cur.first_accepted_by || STATE.user.user_id;

      await sb.from('Trans_Assignments').delete().eq('jtr_id', jtrId2);
      var uniqueIds = Array.from(new Set(collabIds));
      var asgRows = uniqueIds.map(function (tid) {
        return {
          jtr_id: jtrId2,
          tech_id: tid,
          is_first_accepter: (tid === firstAccepterId),
          recorded_by: STATE.user.user_id
        };
      });
      await sb.from('Trans_Assignments').insert(asgRows);
    }

    await sb.from('Trans_JobTickets').update(patch).eq('jtr_id', jtrId2);
    await sb.from('Trans_StatusLogs').insert({
      jtr_id: jtrId2,
      from_status: cur.status,
      to_status: nextSt,
      changed_by: STATE.user.user_id,
      changed_via: 'LIFF',
      note: payload.cause_solution || payload.on_hold_reason || nextSt
    });

    return { ticket: Object.assign({}, cur, patch) };
  }

  if (action === 'adminListUsers') {
    var uRes = await sb.from('Master_Users').select('*').order('user_id', { ascending: true });
    if (uRes.error) throw new Error(uRes.error.message);
    var deptMap2 = {};
    (STATE.master.departments || []).forEach(function (d) { deptMap2[d.dept_id] = d; });
    var usersList = (uRes.data || []).map(function (u) {
      var dp = deptMap2[u.dept_id] || { dept_name: '', division_name: '' };
      return Object.assign({}, u, {
        dept_name: dp.dept_name,
        division_name: dp.division_name
      });
    });
    return { users: usersList };
  }

  if (action === 'adminSaveUser') {
    var uPayload = {
      user_username: payload.user_username || '',
      user_password: payload.user_password || '',
      user_name: payload.user_name,
      user_phone: payload.user_phone || '',
      dept_id: payload.dept_id || 'DEP01',
      user_role: payload.user_role || 'user',
      telegram_user_id: payload.telegram_user_id || '',
      is_active: Boolean(payload.is_active),
      updated_at: new Date().toISOString()
    };
    if (payload.user_id) {
      var upU = await sb.from('Master_Users').update(uPayload).eq('user_id', payload.user_id);
      if (upU.error) throw new Error(upU.error.message);
    } else {
      var insU = await sb.from('Master_Users').insert(uPayload);
      if (insU.error) throw new Error(insU.error.message);
    }
    return await callSupabaseDirect_('adminListUsers', {});
  }

  if (action === 'adminResetLine') {
    var rst = await sb.from('Master_Users').update({
      line_user_id: '',
      line_display_name: '',
      line_linked_at: null,
      updated_at: new Date().toISOString()
    }).eq('user_id', payload.user_id);
    if (rst.error) throw new Error(rst.error.message);
    return await callSupabaseDirect_('adminListUsers', {});
  }

  if (action === 'adminDashboard') {
    var allTRes = await sb.from('Trans_JobTickets').select('*').order('created_at', { ascending: false });
    var allTickets = await enrichTicketsClient_(allTRes.data || []);

    var getFy = function (iso) {
      var d = new Date(iso || Date.now());
      var yBE = d.getFullYear() + 543;
      return (d.getMonth() + 1) >= 10 ? (yBE + 1) : yBE;
    };
    var currentFy = getFy(new Date());
    var reqFy = payload.fiscal_year ? String(payload.fiscal_year) : String(currentFy);
    var fySet = {};
    fySet[String(currentFy)] = true;

    var filtered = allTickets.filter(function (t) {
      var fy = getFy(t.created_at);
      fySet[String(fy)] = true;
      return reqFy === 'ALL' || String(fy) === reqFy;
    });

    var statusCounts = { PENDING: 0, ACCEPTED: 0, IN_PROGRESS: 0, ON_HOLD: 0, COMPLETED: 0, CANNOT_REPAIR: 0, CANCELLED: 0 };
    var byCategory = {};
    var byBuilding = {};
    var respMins = [];
    var repHours = [];
    var techStatsMap = {};

    (STATE.master.technicians || []).forEach(function (tc) {
      techStatsMap[tc.user_id] = {
        tech_id: tc.user_id,
        tech_name: tc.user_name,
        total_participated: 0,
        completed_jobs: 0,
        in_progress_jobs: 0,
        first_accepted_count: 0,
        repair_hours_sum: 0,
        repair_hours_count: 0
      };
    });

    filtered.forEach(function (t) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      var cKey = t.main_category || 'ไม่ระบุ';
      byCategory[cKey] = (byCategory[cKey] || 0) + 1;
      var bKey = t.bld_name || 'ไม่ระบุ';
      byBuilding[bKey] = (byBuilding[bKey] || 0) + 1;

      var cMs = new Date(t.created_at).getTime();
      var aMs = t.first_accepted_at ? new Date(t.first_accepted_at).getTime() : NaN;
      var fMs = t.finished_at ? new Date(t.finished_at).getTime() : NaN;
      var jobHrs = NaN;
      if (!isNaN(cMs) && !isNaN(aMs) && aMs >= cMs) respMins.push((aMs - cMs) / 60000);
      if (!isNaN(aMs) && !isNaN(fMs) && fMs >= aMs) {
        jobHrs = (fMs - aMs) / 3600000;
        repHours.push(jobHrs);
      }

      (t.assignments || []).forEach(function (asg) {
        if (!techStatsMap[asg.tech_id]) {
          techStatsMap[asg.tech_id] = {
            tech_id: asg.tech_id,
            tech_name: asg.tech_name,
            total_participated: 0,
            completed_jobs: 0,
            in_progress_jobs: 0,
            first_accepted_count: 0,
            repair_hours_sum: 0,
            repair_hours_count: 0
          };
        }
        var st = techStatsMap[asg.tech_id];
        st.total_participated++;
        if (asg.is_first_accepter) st.first_accepted_count++;
        if (t.status === 'COMPLETED') {
          st.completed_jobs++;
          if (!isNaN(jobHrs)) {
            st.repair_hours_sum += jobHrs;
            st.repair_hours_count++;
          }
        } else if (['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'].indexOf(t.status) !== -1) {
          st.in_progress_jobs++;
        }
      });
    });

    var startMonthIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    var pushCountRes = await sb
      .from('Sys_NotificationLogs')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'LINE_PUSH')
      .eq('result', 'SENT')
      .gte('sent_at', startMonthIso);

    return {
      fiscal_year: reqFy,
      available_fiscal_years: Object.keys(fySet).sort().reverse(),
      kpi: {
        total: filtered.length,
        pending_open: statusCounts.PENDING + statusCounts.ACCEPTED + statusCounts.IN_PROGRESS + statusCounts.ON_HOLD,
        completed: statusCounts.COMPLETED,
        avg_response_mins: respMins.length ? Math.round((respMins.reduce(function (a, b) { return a + b; }, 0) / respMins.length) * 10) / 10 : 0,
        avg_repair_hours: repHours.length ? Math.round((repHours.reduce(function (a, b) { return a + b; }, 0) / repHours.length) * 10) / 10 : 0,
        line_push_used: pushCountRes.count || 0,
        line_push_limit: 300
      },
      by_category: byCategory,
      by_building: byBuilding,
      tech_stats: Object.keys(techStatsMap).map(function (k) {
        var it = techStatsMap[k];
        return Object.assign({}, it, {
          avg_repair_hours: it.repair_hours_count ? Math.round((it.repair_hours_sum / it.repair_hours_count) * 10) / 10 : 0
        });
      }),
      tickets: filtered
    };
  }

  if (action === 'adminSendPendingSummary') {
    var notifyUrl = STATE.supabaseUrl + '/functions/v1/notify-event';
    await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + STATE.supabaseAnonKey
      },
      body: JSON.stringify({ event: 'DAILY_SUMMARY' })
    });
    return { sent: true };
  }

  throw new Error('Unsupported action: ' + action);
}

async function callApi(action, payload, silent) {
  // โหมดที่ 1: Direct Supabase Mode (Sub-second Latency < 1 วินาที)
  if (STATE.supabaseClient) {
    try {
      return await callSupabaseDirect_(action, payload);
    } catch (sbErr) {
      if (sbErr && sbErr.message === 'UNAUTHORIZED_UNBOUND') {
        showLoginView();
      }
      if (!silent) showToast(sbErr.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล', 'error');
      throw sbErr;
    }
  }

  // โหมดที่ 2: Fallback ไปยัง Google Apps Script Web App API
  if (!STATE.apiUrl) {
    document.getElementById('setupApiBanner').classList.remove('hidden');
    throw new Error('กรุณาตั้งค่า SUPABASE_URL หรือ API_URL ก่อนใช้งาน');
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

  STATE.supabaseUrl = (urlParams.get('supabaseUrl') || localStorage.getItem('EMMS_SUPABASE_URL') || cfg.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  STATE.supabaseAnonKey = (urlParams.get('supabaseKey') || localStorage.getItem('EMMS_SUPABASE_ANON_KEY') || cfg.SUPABASE_ANON_KEY || '').trim();
  STATE.supabaseBucket = cfg.SUPABASE_BUCKET || 'ticket-attachments';

  STATE.apiUrl = urlParams.get('api') || localStorage.getItem('EMMS_API_URL') || cfg.API_URL || '';
  STATE.liffId = urlParams.get('liffId') || localStorage.getItem('EMMS_LIFF_ID') || cfg.LIFF_ID || '';

  if (STATE.supabaseUrl && STATE.supabaseAnonKey && window.supabase) {
    STATE.supabaseClient = window.supabase.createClient(STATE.supabaseUrl, STATE.supabaseAnonKey);
  } else {
    STATE.supabaseClient = null;
  }

  if (!STATE.supabaseClient && !STATE.apiUrl) {
    hideLoading();
    document.getElementById('setupApiBanner').classList.remove('hidden');
    return;
  }

  try {
    showLoading('กำลังตรวจสอบสิทธิ์ผ่าน LINE...');
    // หากไม่ได้ระบุ LIFF_ID ใน config.js ให้ดึงจากตาราง Sys_Config อัตโนมัติ
    if (!STATE.liffId && !urlParams.get('dev')) {
      try {
        if (STATE.supabaseClient) {
          var liffCfgRes = await STATE.supabaseClient
            .from('Sys_Config')
            .select('config_value')
            .eq('config_key', 'LIFF_ID')
            .maybeSingle();
          if (liffCfgRes.data && liffCfgRes.data.config_value) {
            STATE.liffId = String(liffCfgRes.data.config_value).trim();
          }
        } else if (STATE.apiUrl) {
          var pubRes = await fetch(STATE.apiUrl + '?action=publicConfig');
          var pubJson = await pubRes.json();
          if (pubJson && pubJson.ok && pubJson.data && pubJson.data.LIFF_ID) {
            STATE.liffId = String(pubJson.data.LIFF_ID).trim();
          }
        }
      } catch (cfgErr) {
        console.warn('Auto-fetch LIFF_ID warning:', cfgErr);
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
