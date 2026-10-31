/**
 * e-MMS : Admin User Management & Fiscal Year Dashboard Statistics
 * ---------------------------------------------------------------------------
 */

/** คำนวณปีงบประมาณ พ.ศ. จากวันที่ (1 ต.ค. ขึ้นปีงบประมาณใหม่) */
function getFiscalYearBE_(d) {
  var dateObj = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return 0;
  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');
  var yearCE = parseInt(Utilities.formatDate(dateObj, tz, 'yyyy'), 10);
  var month = parseInt(Utilities.formatDate(dateObj, tz, 'MM'), 10);
  var startMonth = parseInt(getConfig_('FISCAL_YEAR_START_MONTH', '10'), 10) || 10;
  var yearBE = yearCE + 543;
  return month >= startMonth ? (yearBE + 1) : yearBE;
}

/**
 * API: รายชื่อผู้ใช้ทั้งหมดสำหรับหน้า Admin
 */
function apiAdminListUsers_(adminUser) {
  var deptMap = {};
  readTable_('Master_Departments').rows.forEach(function (d) {
    deptMap[String(d.dept_id)] = {
      dept_name: String(d.dept_name || ''),
      division_name: String(d.division_name || '')
    };
  });

  var rows = readTable_('Master_Users').rows.map(function (u) {
    var dp = deptMap[String(u.dept_id)] || { dept_name: '', division_name: '' };
    return {
      user_id: String(u.user_id),
      user_username: String(u.user_username || ''),
      user_password: String(u.user_password || ''),
      user_name: String(u.user_name || ''),
      user_phone: String(u.user_phone || ''),
      dept_id: String(u.dept_id || ''),
      dept_name: dp.dept_name,
      division_name: dp.division_name,
      user_role: String(u.user_role || 'user'),
      line_user_id: String(u.line_user_id || ''),
      line_display_name: String(u.line_display_name || ''),
      line_linked_at_th: formatThaiDateTime_(u.line_linked_at),
      telegram_user_id: String(u.telegram_user_id || ''),
      is_active: u.is_active !== false && String(u.is_active).toUpperCase() !== 'FALSE',
      note: String(u.note || '')
    };
  });

  return { users: rows };
}

/**
 * API: เพิ่มหรือแก้ไขข้อมูลผู้ใช้ 1 คน
 */
function apiAdminSaveUser_(adminUser, payload) {
  var userId = String(payload.user_id || '').trim();
  var username = String(payload.user_username || '').trim();
  var password = String(payload.user_password || '').trim();
  var name = String(payload.user_name || '').trim();
  var phone = String(payload.user_phone || '').trim();
  var deptId = String(payload.dept_id || 'DEP01').trim();
  var role = String(payload.user_role || 'user').trim();
  var tgId = String(payload.telegram_user_id || '').trim();
  var isActive = payload.is_active !== false && String(payload.is_active).toUpperCase() !== 'FALSE';
  var note = String(payload.note || '').trim();

  if (!name) throw new Error('กรุณาระบุชื่อ-นามสกุล');
  if (['user', 'technician', 'admin'].indexOf(role) === -1) role = 'user';

  // ตรวจสอบ username ซ้ำ
  if (username) {
    var allUsers = readTable_('Master_Users').rows;
    for (var i = 0; i < allUsers.length; i++) {
      var u = allUsers[i];
      if (String(u.user_id) !== userId &&
          String(u.user_username || '').trim().toLowerCase() === username.toLowerCase()) {
        throw new Error('ชื่อผู้ใช้ (Username) "' + username + '" มีอยู่ในระบบแล้ว');
      }
    }
  }

  var now = new Date();
  if (userId) {
    var existing = findRowByCol_('Master_Users', 'user_id', userId);
    if (!existing) throw new Error('ไม่พบผู้ใช้รหัส ' + userId);

    updateRowById_('Master_Users', userId, {
      user_username: username,
      user_password: password,
      user_name: name,
      user_phone: phone,
      dept_id: deptId,
      user_role: role,
      telegram_user_id: tgId,
      is_active: isActive,
      updated_at: now,
      note: note
    });
    logAudit_(adminUser.user_id, isActive ? 'USER_UPDATE' : 'USER_DISABLE', userId, 'username=' + username + ' role=' + role);
  } else {
    // หาเลขรัน USER ถัดไป
    var maxNum = 0;
    readTable_('Master_Users').rows.forEach(function (r) {
      var m = String(r.user_id).match(/^USER(\d+)$/);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    userId = 'USER' + pad_(maxNum + 1, 4);

    appendRowObj_('Master_Users', {
      user_id: userId,
      user_username: username,
      user_password: password,
      user_name: name,
      user_phone: phone,
      dept_id: deptId,
      user_role: role,
      line_user_id: '',
      line_display_name: '',
      line_linked_at: '',
      telegram_user_id: tgId,
      is_active: isActive,
      created_at: now,
      updated_at: now,
      note: note
    });
    logAudit_(adminUser.user_id, 'USER_CREATE', userId, 'username=' + username + ' role=' + role);
  }

  return apiAdminListUsers_(adminUser);
}

/**
 * API: รีเซ็ตการผูกบัญชี LINE ของผู้ใช้ (กรณีเปลี่ยนเครื่อง/เปลี่ยนบัญชี LINE)
 */
function apiAdminResetLine_(adminUser, payload) {
  var targetUserId = String(payload.user_id || '').trim();
  if (!targetUserId) throw new Error('กรุณาระบุรหัสผู้ใช้');

  var existing = findRowByCol_('Master_Users', 'user_id', targetUserId);
  if (!existing) throw new Error('ไม่พบผู้ใช้ ' + targetUserId);

  updateRowById_('Master_Users', targetUserId, {
    line_user_id: '',
    line_display_name: '',
    line_linked_at: '',
    updated_at: new Date()
  });

  logAudit_(adminUser.user_id, 'UNLINK_LINE', targetUserId, 'Reset by admin ' + adminUser.user_name);
  return apiAdminListUsers_(adminUser);
}

/**
 * API: ดึงข้อมูลสถิติ Dashboard ตามปีงบประมาณ (1 ต.ค. – 30 ก.ย.) และสถิติรายช่าง
 */
function apiAdminGetDashboard_(adminUser, payload) {
  var lk = buildLookupMaps_();
  var allRows = readTable_('Trans_JobTickets').rows;
  var currentFy = getFiscalYearBE_(new Date());
  var requestedFy = payload && payload.fiscal_year ? String(payload.fiscal_year).trim() : String(currentFy);

  var fiscalYearsMap = {};
  fiscalYearsMap[String(currentFy)] = true;

  var filteredTickets = [];
  for (var i = 0; i < allRows.length; i++) {
    var r = allRows[i];
    var fy = getFiscalYearBE_(r.created_at);
    if (fy) fiscalYearsMap[String(fy)] = true;

    if (requestedFy !== 'ALL' && String(fy) !== requestedFy) continue;
    filteredTickets.push(enrichTicketRow_(r, lk));
  }

  var statusCounts = {
    PENDING: 0,
    ACCEPTED: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
    CANNOT_REPAIR: 0,
    CANCELLED: 0
  };

  var byCategory = {};
  var byBuilding = {};
  var byMonth = {};
  var responseDiffsMins = [];
  var repairDiffsHours = [];

  // แผนที่เก็บสถิติรายช่าง
  var techStatsMap = {};
  readTable_('Master_Users').rows.forEach(function (u) {
    if (u.user_role === 'technician' || u.user_role === 'admin') {
      techStatsMap[String(u.user_id)] = {
        tech_id: String(u.user_id),
        tech_name: String(u.user_name || u.user_id),
        user_role: String(u.user_role),
        total_participated: 0,
        completed_jobs: 0,
        in_progress_jobs: 0,
        first_accepted_count: 0,
        repair_hours_sum: 0,
        repair_hours_count: 0
      };
    }
  });

  var tz = getConfig_('TIMEZONE', 'Asia/Bangkok');

  filteredTickets.forEach(function (t) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

    var catKey = t.main_category || 'ไม่ระบุ';
    byCategory[catKey] = (byCategory[catKey] || 0) + 1;

    var bldKey = t.bld_name || 'ไม่ระบุ';
    byBuilding[bldKey] = (byBuilding[bldKey] || 0) + 1;

    if (t.created_at) {
      var dt = new Date(t.created_at);
      if (!isNaN(dt.getTime())) {
        var ym = (parseInt(Utilities.formatDate(dt, tz, 'yyyy'), 10) + 543) + '-' + Utilities.formatDate(dt, tz, 'MM');
        byMonth[ym] = (byMonth[ym] || 0) + 1;
      }
    }

    // คำนวณเวลาตอบสนอง (Response Time: created_at -> first_accepted_at)
    var createdMs = t.created_at ? new Date(t.created_at).getTime() : NaN;
    var acceptedMs = t.first_accepted_at ? new Date(t.first_accepted_at).getTime() : NaN;
    var finishedMs = t.finished_at ? new Date(t.finished_at).getTime() : NaN;

    var jobRepairHours = NaN;
    if (!isNaN(createdMs) && !isNaN(acceptedMs) && acceptedMs >= createdMs) {
      responseDiffsMins.push((acceptedMs - createdMs) / (1000 * 60));
    }
    if (!isNaN(acceptedMs) && !isNaN(finishedMs) && finishedMs >= acceptedMs) {
      jobRepairHours = (finishedMs - acceptedMs) / (1000 * 60 * 60);
      repairDiffsHours.push(jobRepairHours);
    } else if (!isNaN(createdMs) && !isNaN(finishedMs) && finishedMs >= createdMs) {
      jobRepairHours = (finishedMs - createdMs) / (1000 * 60 * 60);
      repairDiffsHours.push(jobRepairHours);
    }

    // นับสถิติรายช่างจาก assignments ของใบงานนี้
    (t.assignments || []).forEach(function (asg) {
      if (!techStatsMap[asg.tech_id]) {
        techStatsMap[asg.tech_id] = {
          tech_id: asg.tech_id,
          tech_name: asg.tech_name || asg.tech_id,
          user_role: 'technician',
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
        if (!isNaN(jobRepairHours)) {
          st.repair_hours_sum += jobRepairHours;
          st.repair_hours_count++;
        }
      } else if (['ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'].indexOf(t.status) !== -1) {
        st.in_progress_jobs++;
      }
    });
  });

  var avgResponseMins = responseDiffsMins.length
    ? Math.round((responseDiffsMins.reduce(function (a, b) { return a + b; }, 0) / responseDiffsMins.length) * 10) / 10
    : 0;
  var avgRepairHours = repairDiffsHours.length
    ? Math.round((repairDiffsHours.reduce(function (a, b) { return a + b; }, 0) / repairDiffsHours.length) * 10) / 10
    : 0;

  var techStatsList = Object.keys(techStatsMap).map(function (k) {
    var item = techStatsMap[k];
    return {
      tech_id: item.tech_id,
      tech_name: item.tech_name,
      user_role: item.user_role,
      total_participated: item.total_participated,
      completed_jobs: item.completed_jobs,
      in_progress_jobs: item.in_progress_jobs,
      first_accepted_count: item.first_accepted_count,
      avg_repair_hours: item.repair_hours_count
        ? Math.round((item.repair_hours_sum / item.repair_hours_count) * 10) / 10
        : 0
    };
  }).sort(function (a, b) {
    return (b.completed_jobs - a.completed_jobs) || (b.total_participated - a.total_participated);
  });

  var pushLimit = parseInt(getConfig_('LINE_PUSH_MONTHLY_LIMIT', '300'), 10) || 300;
  var pushUsed = getMonthlyLinePushCount_();

  return {
    fiscal_year: requestedFy,
    available_fiscal_years: Object.keys(fiscalYearsMap).sort().reverse(),
    kpi: {
      total: filteredTickets.length,
      pending_open: statusCounts.PENDING + statusCounts.ACCEPTED + statusCounts.IN_PROGRESS + statusCounts.ON_HOLD,
      completed: statusCounts.COMPLETED,
      cannot_repair: statusCounts.CANNOT_REPAIR,
      cancelled: statusCounts.CANCELLED,
      avg_response_mins: avgResponseMins,
      avg_repair_hours: avgRepairHours,
      line_push_used: pushUsed,
      line_push_limit: pushLimit
    },
    status_counts: statusCounts,
    by_category: byCategory,
    by_building: byBuilding,
    by_month: byMonth,
    tech_stats: techStatsList,
    tickets: filteredTickets
  };
}
