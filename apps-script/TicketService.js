/**
 * e-MMS : Job Ticket Lifecycle, Duplicate Check, Assignments & Attachments
 * ---------------------------------------------------------------------------
 */

/** สร้าง Map ข้อมูลอ้างอิงเพื่อประกบ (enrich) กับใบงาน */
function buildLookupMaps_() {
  var bldMap = {};
  readTable_('Master_Buildings').rows.forEach(function (r) {
    bldMap[String(r.bld_id)] = String(r.bld_name || '');
  });

  var locMap = {};
  readTable_('Master_Locations').rows.forEach(function (r) {
    locMap[String(r.loc_id)] = String(r.loc_name || '');
  });

  var catMap = {};
  readTable_('Master_Categories').rows.forEach(function (r) {
    catMap[String(r.cat_id)] = {
      main_category: String(r.main_category || ''),
      sub_category: String(r.sub_category || '')
    };
  });

  var statusMap = {};
  readTable_('Master_Statuses').rows.forEach(function (r) {
    statusMap[String(r.status_code)] = {
      label_th: String(r.status_label_th || r.status_code),
      color: String(r.status_color || '#9E9E9E'),
      is_final: r.is_final === true || String(r.is_final).toUpperCase() === 'TRUE',
      notify_requester: r.notify_requester === true || String(r.notify_requester).toUpperCase() === 'TRUE'
    };
  });

  var userMap = {};
  readTable_('Master_Users').rows.forEach(function (u) {
    userMap[String(u.user_id)] = {
      user_id: String(u.user_id),
      user_name: String(u.user_name || ''),
      user_phone: String(u.user_phone || ''),
      line_user_id: String(u.line_user_id || '')
    };
  });

  var attByJtr = {};
  readTable_('Trans_Attachments').rows.forEach(function (a) {
    var jtrId = String(a.jtr_id);
    if (!attByJtr[jtrId]) attByJtr[jtrId] = { BEFORE: [], AFTER: [] };
    var bucket = String(a.att_type).toUpperCase() === 'AFTER' ? 'AFTER' : 'BEFORE';
    attByJtr[jtrId][bucket].push({
      att_id: String(a.att_id),
      seq: Number(a.seq) || 1,
      drive_file_id: String(a.drive_file_id || ''),
      file_url: String(a.file_url || ''),
      uploaded_by: String(a.uploaded_by || ''),
      uploaded_at: toIso_(a.uploaded_at)
    });
  });

  var asgByJtr = {};
  readTable_('Trans_Assignments').rows.forEach(function (asg) {
    var jtrId = String(asg.jtr_id);
    if (!asgByJtr[jtrId]) asgByJtr[jtrId] = [];
    var u = userMap[String(asg.tech_id)] || { user_name: String(asg.tech_id) };
    asgByJtr[jtrId].push({
      asg_id: String(asg.asg_id),
      tech_id: String(asg.tech_id),
      tech_name: u.user_name,
      is_first_accepter: asg.is_first_accepter === true || String(asg.is_first_accepter).toUpperCase() === 'TRUE'
    });
  });

  var logsByJtr = {};
  readTable_('Trans_StatusLogs').rows.forEach(function (lg) {
    var jtrId = String(lg.jtr_id);
    if (!logsByJtr[jtrId]) logsByJtr[jtrId] = [];
    var u = userMap[String(lg.changed_by)] || { user_name: String(lg.changed_by || '') };
    var st = statusMap[String(lg.to_status)] || { label_th: String(lg.to_status) };
    logsByJtr[jtrId].push({
      log_id: String(lg.log_id),
      from_status: String(lg.from_status || ''),
      to_status: String(lg.to_status || ''),
      to_status_label: st.label_th,
      changed_by: String(lg.changed_by || ''),
      changed_by_name: u.user_name,
      changed_via: String(lg.changed_via || ''),
      note: String(lg.note || ''),
      changed_at: toIso_(lg.changed_at),
      changed_at_th: formatThaiDateTime_(lg.changed_at)
    });
  });

  return {
    bldMap: bldMap,
    locMap: locMap,
    catMap: catMap,
    statusMap: statusMap,
    userMap: userMap,
    attByJtr: attByJtr,
    asgByJtr: asgByJtr,
    logsByJtr: logsByJtr
  };
}

/** แปลง 1 แถวของ Trans_JobTickets ให้มีชื่ออาคาร/หมวด/รูป/ช่างครบ */
function enrichTicketRow_(row, lookups) {
  var lk = lookups || buildLookupMaps_();
  var jtrId = String(row.jtr_id);
  var catRep = lk.catMap[String(row.cat_id_reported)] || { main_category: '', sub_category: '' };
  var catAct = lk.catMap[String(row.cat_id_actual || row.cat_id_reported)] || catRep;
  var stInfo = lk.statusMap[String(row.status)] || {
    label_th: String(row.status),
    color: '#9E9E9E',
    is_final: false,
    notify_requester: false
  };
  var atts = lk.attByJtr[jtrId] || { BEFORE: [], AFTER: [] };
  atts.BEFORE.sort(function (a, b) { return a.seq - b.seq; });
  atts.AFTER.sort(function (a, b) { return a.seq - b.seq; });

  var assignments = lk.asgByJtr[jtrId] || [];
  var firstAccepterUser = lk.userMap[String(row.first_accepted_by)] || null;
  var finishedByUser = lk.userMap[String(row.finished_by)] || null;
  var requesterUser = lk.userMap[String(row.requester_id)] || null;

  return {
    jtr_id: jtrId,
    created_at: toIso_(row.created_at),
    created_at_th: formatThaiDateTime_(row.created_at),
    requester_id: String(row.requester_id || ''),
    requester_name: String(row.requester_name || ''),
    requester_phone: String(row.requester_phone || ''),
    requester_dept: String(row.requester_dept || ''),
    requester_division: String(row.requester_division || ''),
    requester_line_id: requesterUser ? requesterUser.line_user_id : '',
    bld_id: String(row.bld_id || ''),
    bld_name: lk.bldMap[String(row.bld_id)] || String(row.bld_id || ''),
    loc_id: String(row.loc_id || ''),
    loc_name: lk.locMap[String(row.loc_id)] || String(row.loc_id || ''),
    room: String(row.room || ''),
    cat_id_reported: String(row.cat_id_reported || ''),
    main_category_reported: catRep.main_category,
    sub_category_reported: catRep.sub_category,
    cat_id_actual: String(row.cat_id_actual || row.cat_id_reported || ''),
    main_category: catAct.main_category,
    sub_category: catAct.sub_category,
    description: String(row.description || ''),
    status: String(row.status || 'PENDING'),
    status_label_th: stInfo.label_th,
    status_color: stInfo.color,
    is_final: stInfo.is_final,
    notify_requester: stInfo.notify_requester,
    first_accepted_by: String(row.first_accepted_by || ''),
    first_accepted_by_name: firstAccepterUser ? firstAccepterUser.user_name : '',
    first_accepted_at: toIso_(row.first_accepted_at),
    first_accepted_at_th: formatThaiDateTime_(row.first_accepted_at),
    started_at: toIso_(row.started_at),
    started_at_th: formatThaiDateTime_(row.started_at),
    on_hold_reason: String(row.on_hold_reason || ''),
    finished_at: toIso_(row.finished_at),
    finished_at_th: formatThaiDateTime_(row.finished_at),
    finished_by: String(row.finished_by || ''),
    finished_by_name: finishedByUser ? finishedByUser.user_name : '',
    cause_solution: String(row.cause_solution || ''),
    materials_used: String(row.materials_used || ''),
    tech_note: String(row.tech_note || ''),
    cancelled_at: toIso_(row.cancelled_at),
    cancel_reason: String(row.cancel_reason || ''),
    tg_message_id: String(row.tg_message_id || ''),
    updated_at: toIso_(row.updated_at),
    images_before: atts.BEFORE,
    images_after: atts.AFTER,
    assignments: assignments,
    assigned_names: assignments.map(function (a) { return a.tech_name; }).join(', '),
    status_logs: lk.logsByJtr[jtrId] || []
  };
}

function getEnrichedTicketById_(jtrId) {
  var row = findRowByCol_('Trans_JobTickets', 'jtr_id', jtrId);
  if (!row) return null;
  return enrichTicketRow_(row);
}

/**
 * API: ตรวจสอบงานซ้ำใน อาคาร + ชั้น/บริเวณ (+ ห้อง) เดียวกันที่ยังเปิดอยู่
 * (ไม่เปิดเผยชื่อผู้แจ้งเดิม ตามข้อตกลง Q20)
 */
function apiCheckDuplicate_(user, payload) {
  if (String(getConfig_('DUPLICATE_CHECK_ENABLED', 'TRUE')).toUpperCase() !== 'TRUE') {
    return { duplicates: [] };
  }
  var bldId = String(payload.bld_id || '').trim();
  var locId = String(payload.loc_id || '').trim();
  var roomInput = String(payload.room || '').trim().toLowerCase();

  if (!bldId || !locId) return { duplicates: [] };

  var lk = buildLookupMaps_();
  var openStatuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'];
  var rows = readTable_('Trans_JobTickets').rows;
  var matches = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (openStatuses.indexOf(String(r.status)) === -1) continue;
    if (String(r.bld_id) !== bldId || String(r.loc_id) !== locId) continue;

    var rRoom = String(r.room || '').trim().toLowerCase();
    // ถ้าระบุห้อง ให้จับคู่ห้องเดียวกัน หรือถ้าไม่ได้ระบุห้อง ให้แสดงงานในชั้นนั้น
    if (roomInput && rRoom && rRoom !== roomInput) continue;

    var cat = lk.catMap[String(r.cat_id_actual || r.cat_id_reported)] || { main_category: '', sub_category: '' };
    var st = lk.statusMap[String(r.status)] || { label_th: String(r.status), color: '#9E9E9E' };

    matches.push({
      jtr_id: String(r.jtr_id),
      room: String(r.room || ''),
      main_category: cat.main_category,
      sub_category: cat.sub_category,
      description: String(r.description || ''),
      status: String(r.status),
      status_label_th: st.label_th,
      status_color: st.color,
      created_at_th: formatThaiDateTime_(r.created_at)
    });
  }

  return { duplicates: matches.slice(0, 5) };
}

/**
 * API: สร้างใบงานแจ้งซ่อมใหม่
 */
function apiCreateTicket_(user, payload) {
  var bldId = String(payload.bld_id || '').trim();
  var locId = String(payload.loc_id || '').trim();
  var room = String(payload.room || '').trim();
  var catId = String(payload.cat_id_reported || '').trim();
  var description = String(payload.description || '').trim();
  var phone = String(payload.requester_phone || user.user_phone || '').trim();
  var images = Array.isArray(payload.images) ? payload.images : [];

  if (!bldId || !locId) throw new Error('กรุณาเลือกอาคารและชั้น/บริเวณ');
  if (!catId) throw new Error('กรุณาเลือกหมวดหมู่งานซ่อม');
  if (!description) throw new Error('กรุณาระบุรายละเอียดอาการเสีย/ปัญหา');
  if (images.length < 1) throw new Error('กรุณาแนบรูปภาพประกอบอย่างน้อย 1 รูป');

  var maxBefore = parseInt(getConfig_('MAX_IMAGES_BEFORE', '3'), 10) || 3;
  if (images.length > maxBefore) {
    images = images.slice(0, maxBefore);
  }

  // อัปเดตเบอร์โทรในโปรไฟล์ผู้ใช้ด้วยหากมีการกรอกหรือแก้ไข
  if (phone && phone !== user.user_phone) {
    updateRowById_('Master_Users', user.user_id, {
      user_phone: phone,
      updated_at: new Date()
    });
  }

  var now = new Date();
  var jtrId = nextTicketId_(now);

  // อัปโหลดรูป BEFORE 1-3 รูปลง Google Drive
  for (var i = 0; i < images.length; i++) {
    var seq = i + 1;
    var fileName = jtrId + '_BEFORE_' + seq + '.jpg';
    var uploaded = uploadBase64ToDrive_(images[i], fileName, now);
    var attId = nextId_('ATT', 6, 'ATT');
    appendRowObj_('Trans_Attachments', {
      att_id: attId,
      jtr_id: jtrId,
      att_type: 'BEFORE',
      seq: seq,
      drive_file_id: uploaded.fileId,
      file_url: uploaded.fileUrl,
      uploaded_by: user.user_id,
      uploaded_at: now
    });
  }

  // บันทึกใบงานลง Trans_JobTickets
  appendRowObj_('Trans_JobTickets', {
    jtr_id: jtrId,
    created_at: now,
    requester_id: user.user_id,
    requester_name: user.user_name,
    requester_phone: phone,
    requester_dept: user.dept_name,
    requester_division: user.division_name,
    bld_id: bldId,
    loc_id: locId,
    room: room,
    cat_id_reported: catId,
    cat_id_actual: catId,
    description: description,
    status: 'PENDING',
    first_accepted_by: '',
    first_accepted_at: '',
    started_at: '',
    on_hold_reason: '',
    finished_at: '',
    finished_by: '',
    cause_solution: '',
    materials_used: '',
    tech_note: '',
    cancelled_at: '',
    cancel_reason: '',
    tg_message_id: '',
    updated_at: now
  });

  // บันทึก Status Log แรก
  appendRowObj_('Trans_StatusLogs', {
    log_id: nextId_('LOG', 6, 'LOG'),
    jtr_id: jtrId,
    from_status: '',
    to_status: 'PENDING',
    changed_by: user.user_id,
    changed_via: 'LIFF',
    note: 'สร้างใบงานแจ้งซ่อมใหม่',
    changed_at: now
  });

  var enriched = getEnrichedTicketById_(jtrId);

  // แจ้งเตือนเข้ากลุ่ม Telegram ของทีมช่าง พร้อมปุ่มกด "รับงาน"
  try {
    var tgMsgId = sendTelegramNewTicket_(enriched);
    if (tgMsgId) {
      updateRowById_('Trans_JobTickets', jtrId, { tg_message_id: String(tgMsgId) });
      enriched.tg_message_id = String(tgMsgId);
    }
  } catch (tgErr) {
    Logger.log('sendTelegramNewTicket_ error: ' + tgErr);
  }

  return {
    ticket: enriched
  };
}

/**
 * API: รายการงานแจ้งซ่อมของฉัน (ผู้แจ้งเห็นเฉพาะงานตัวเอง)
 */
function apiListMyTickets_(user) {
  var lk = buildLookupMaps_();
  var rows = readTable_('Trans_JobTickets').rows;
  var myTickets = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].requester_id) === String(user.user_id)) {
      myTickets.push(enrichTicketRow_(rows[i], lk));
    }
  }
  return { tickets: myTickets };
}

/**
 * API: ผู้แจ้งกดยกเลิกใบงาน (อนุญาตเฉพาะตอนสถานะเป็น PENDING เท่านั้น)
 */
function apiCancelTicket_(user, payload) {
  var jtrId = String(payload.jtr_id || '').trim();
  var reason = String(payload.cancel_reason || 'ผู้แจ้งยกเลิกรายการ').trim();
  if (!jtrId) throw new Error('ไม่พบรหัสใบงาน');

  var row = findRowByCol_('Trans_JobTickets', 'jtr_id', jtrId);
  if (!row) throw new Error('ไม่พบใบงาน ' + jtrId);

  if (String(row.requester_id) !== String(user.user_id) && user.user_role !== 'admin') {
    throw new Error('คุณไม่มีสิทธิ์ยกเลิกใบงานนี้');
  }
  if (String(row.status) !== 'PENDING') {
    throw new Error('ไม่สามารถยกเลิกได้ เนื่องจากทีมช่างรับงานหรือดำเนินการไปแล้ว');
  }

  var now = new Date();
  updateRowById_('Trans_JobTickets', jtrId, {
    status: 'CANCELLED',
    cancelled_at: now,
    cancel_reason: reason,
    updated_at: now
  });

  appendRowObj_('Trans_StatusLogs', {
    log_id: nextId_('LOG', 6, 'LOG'),
    jtr_id: jtrId,
    from_status: 'PENDING',
    to_status: 'CANCELLED',
    changed_by: user.user_id,
    changed_via: 'LIFF',
    note: reason,
    changed_at: now
  });

  var enriched = getEnrichedTicketById_(jtrId);
  try {
    updateTelegramTicketCard_(enriched);
  } catch (e) {
    Logger.log('updateTelegramTicketCard_ cancel error: ' + e);
  }

  return { ticket: enriched };
}

/**
 * API: รายการคิวงานซ่อมสำหรับทีมช่างและ Admin
 */
function apiListQueueTickets_(user, payload) {
  var lk = buildLookupMaps_();
  var rows = readTable_('Trans_JobTickets').rows;
  var statusFilter = payload && payload.status ? String(payload.status).trim() : '';
  var result = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'ACTIVE') {
        if (['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'].indexOf(String(r.status)) === -1) continue;
      } else if (String(r.status) !== statusFilter) {
        continue;
      }
    }
    result.push(enrichTicketRow_(r, lk));
  }

  return {
    tickets: result,
    technicians: getMasterBootstrap_().technicians
  };
}

/**
 * กดรับงาน (เรียกได้ทั้งจากปุ่ม Inline ใน Telegram และจากหน้าเว็บ LIFF)
 * ใช้ LockService ป้องกันช่าง 2 คนกดพร้อมกันในเสี้ยววินาที
 */
function acceptTicketCore_(techUser, jtrId, viaChannel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var enriched = null;
  try {
    var row = findRowByCol_('Trans_JobTickets', 'jtr_id', jtrId);
    if (!row) throw new Error('ไม่พบใบงาน ' + jtrId);

    var currentStatus = String(row.status);
    if (currentStatus !== 'PENDING') {
      enriched = getEnrichedTicketById_(jtrId);
      return {
        alreadyAccepted: true,
        ticket: enriched
      };
    }

    var now = new Date();
    updateRowById_('Trans_JobTickets', jtrId, {
      status: 'ACCEPTED',
      first_accepted_by: techUser.user_id,
      first_accepted_at: now,
      updated_at: now
    });

    // บันทึกผู้รับงานคนแรกลง Trans_Assignments
    appendRowObj_('Trans_Assignments', {
      asg_id: nextId_('ASG', 6, 'ASG'),
      jtr_id: jtrId,
      tech_id: techUser.user_id,
      is_first_accepter: true,
      recorded_by: techUser.user_id,
      recorded_at: now
    });

    appendRowObj_('Trans_StatusLogs', {
      log_id: nextId_('LOG', 6, 'LOG'),
      jtr_id: jtrId,
      from_status: 'PENDING',
      to_status: 'ACCEPTED',
      changed_by: techUser.user_id,
      changed_via: viaChannel || 'LIFF',
      note: 'รับงานโดย ' + techUser.user_name,
      changed_at: now
    });

    enriched = getEnrichedTicketById_(jtrId);
  } finally {
    lock.releaseLock();
  }

  // อัปเดตการ์ดใน Telegram + ส่ง LINE Push แจ้งผู้แจ้งว่าช่างรับงานแล้ว
  try {
    updateTelegramTicketCard_(enriched);
  } catch (e) {
    Logger.log('updateTelegramTicketCard_ accept error: ' + e);
  }
  try {
    sendLineStatusPush_(enriched, 'STATUS_ACCEPTED');
  } catch (e2) {
    Logger.log('sendLineStatusPush_ accept error: ' + e2);
  }

  return {
    alreadyAccepted: false,
    ticket: enriched
  };
}

/**
 * API: ช่างอัปเดตสถานะงาน (IN_PROGRESS / ON_HOLD / COMPLETED / CANNOT_REPAIR)
 */
function apiUpdateTicketStatus_(user, payload) {
  var jtrId = String(payload.jtr_id || '').trim();
  var nextStatus = String(payload.to_status || '').trim().toUpperCase();
  if (!jtrId) throw new Error('ไม่พบรหัสใบงาน');

  if (nextStatus === 'ACCEPTED') {
    return acceptTicketCore_(user, jtrId, 'LIFF');
  }

  var allowed = ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANNOT_REPAIR'];
  if (allowed.indexOf(nextStatus) === -1) {
    throw new Error('สถานะที่ต้องการเปลี่ยนไม่ถูกต้อง: ' + nextStatus);
  }

  var row = findRowByCol_('Trans_JobTickets', 'jtr_id', jtrId);
  if (!row) throw new Error('ไม่พบใบงาน ' + jtrId);

  var prevStatus = String(row.status);
  if (['COMPLETED', 'CANNOT_REPAIR', 'CANCELLED'].indexOf(prevStatus) !== -1 && user.user_role !== 'admin') {
    throw new Error('ใบงานนี้ถูกปิดไปแล้ว ไม่สามารถแก้ไขสถานะได้');
  }

  var now = new Date();
  var patch = {
    status: nextStatus,
    updated_at: now
  };

  // หากข้ามจาก PENDING มา IN_PROGRESS/ON_HOLD/COMPLETED โดยตรง ให้บันทึก first_accepted ด้วย
  if (!row.first_accepted_by) {
    patch.first_accepted_by = user.user_id;
    patch.first_accepted_at = now;
  }

  var logNote = '';

  if (nextStatus === 'IN_PROGRESS') {
    if (!row.started_at) patch.started_at = now;
    logNote = String(payload.note || 'เริ่มเข้าดำเนินการซ่อม');
  } else if (nextStatus === 'ON_HOLD') {
    var holdReason = String(payload.on_hold_reason || payload.note || '').trim();
    if (!holdReason) throw new Error('กรุณาระบุเหตุผลที่รออะไหล่ / รอจัดซื้อ');
    patch.on_hold_reason = holdReason;
    logNote = 'รออะไหล่/จัดซื้อ: ' + holdReason;
  } else if (nextStatus === 'COMPLETED' || nextStatus === 'CANNOT_REPAIR') {
    var imagesAfter = Array.isArray(payload.images) ? payload.images : [];
    var existingAfter = (buildLookupMaps_().attByJtr[jtrId] || { AFTER: [] }).AFTER;
    if (imagesAfter.length < 1 && existingAfter.length < 1) {
      throw new Error('กรุณาแนบรูปภาพหลังซ่อม/หน้างานอย่างน้อย 1 รูป');
    }

    var causeSolution = String(payload.cause_solution || '').trim();
    var materialsUsed = String(payload.materials_used || '').trim();
    var techNote = String(payload.tech_note || '').trim();
    var catActual = String(payload.cat_id_actual || row.cat_id_actual || row.cat_id_reported).trim();

    if (nextStatus === 'COMPLETED' && !causeSolution) {
      throw new Error('กรุณาระบุสาเหตุ / วิธีแก้ไข');
    }
    if (nextStatus === 'CANNOT_REPAIR' && !techNote && !causeSolution) {
      throw new Error('กรุณาระบุเหตุผลที่ไม่สามารถซ่อมแซมได้');
    }

    // รายชื่อช่างผู้ร่วมงานจาก Checkbox (ต้องมีอย่างน้อย 1 คน)
    var collabIds = Array.isArray(payload.collaborator_tech_ids)
      ? payload.collaborator_tech_ids.map(function (id) { return String(id).trim(); }).filter(Boolean)
      : [];
    if (collabIds.length === 0) {
      collabIds = [user.user_id];
    }
    // รวมผู้กดรับงานคนแรกไว้ด้วยหากยังไม่อยู่ในรายการ
    var firstAccepterId = String(patch.first_accepted_by || row.first_accepted_by || user.user_id);

    // อัปโหลดรูป AFTER 1-3 รูป
    var maxAfter = parseInt(getConfig_('MAX_IMAGES_AFTER', '3'), 10) || 3;
    var sliceAfter = imagesAfter.slice(0, maxAfter);
    for (var i = 0; i < sliceAfter.length; i++) {
      var seq = existingAfter.length + i + 1;
      var fileName = jtrId + '_AFTER_' + seq + '.jpg';
      var uploaded = uploadBase64ToDrive_(sliceAfter[i], fileName, now);
      appendRowObj_('Trans_Attachments', {
        att_id: nextId_('ATT', 6, 'ATT'),
        jtr_id: jtrId,
        att_type: 'AFTER',
        seq: seq,
        drive_file_id: uploaded.fileId,
        file_url: uploaded.fileUrl,
        uploaded_by: user.user_id,
        uploaded_at: now
      });
    }

    // เขียนข้อมูลผู้ร่วมงานลง Trans_Assignments (1 แถวต่อช่าง 1 คน สำหรับทำรายงานสถิติ)
    deleteRowsByCol_('Trans_Assignments', 'jtr_id', jtrId);
    var uniqueTechs = {};
    collabIds.forEach(function (tid) { uniqueTechs[tid] = true; });
    Object.keys(uniqueTechs).forEach(function (tid) {
      appendRowObj_('Trans_Assignments', {
        asg_id: nextId_('ASG', 6, 'ASG'),
        jtr_id: jtrId,
        tech_id: tid,
        is_first_accepter: (tid === firstAccepterId),
        recorded_by: user.user_id,
        recorded_at: now
      });
    });

    if (!row.started_at) patch.started_at = now;
    patch.cat_id_actual = catActual;
    patch.cause_solution = causeSolution;
    patch.materials_used = materialsUsed;
    patch.tech_note = techNote;
    patch.finished_at = now;
    patch.finished_by = user.user_id;

    logNote = nextStatus === 'COMPLETED'
      ? ('ซ่อมเสร็จ: ' + causeSolution + (materialsUsed ? ' (วัสดุ: ' + materialsUsed + ')' : ''))
      : ('ซ่อมไม่ได้: ' + (techNote || causeSolution));
  }

  updateRowById_('Trans_JobTickets', jtrId, patch);

  appendRowObj_('Trans_StatusLogs', {
    log_id: nextId_('LOG', 6, 'LOG'),
    jtr_id: jtrId,
    from_status: prevStatus,
    to_status: nextStatus,
    changed_by: user.user_id,
    changed_via: 'LIFF',
    note: logNote,
    changed_at: now
  });

  var enriched = getEnrichedTicketById_(jtrId);

  // อัปเดตการ์ดใน Telegram
  try {
    updateTelegramTicketCard_(enriched);
  } catch (e) {
    Logger.log('updateTelegramTicketCard_ status error: ' + e);
  }

  // ส่ง LINE Push แจ้งผู้แจ้งหากสถานะนี้กำหนด notify_requester = TRUE (ON_HOLD, COMPLETED, CANNOT_REPAIR)
  if (enriched.notify_requester) {
    try {
      sendLineStatusPush_(enriched, 'STATUS_' + nextStatus);
    } catch (e2) {
      Logger.log('sendLineStatusPush_ status error: ' + e2);
    }
  }

  return { ticket: enriched };
}
