-- ============================================================================
-- e-MMS : e-MaintenanceManagementSystem (Supabase PostgreSQL Schema + Seed)
-- ============================================================================
-- โครงสร้างตารางทั้ง 15 ตาราง ตรงกับ DB_SCHEMA ใน apps-script/SetupDatabase.js 100%
-- เพื่อให้ Frontend (LINE LIFF) และระบบ Sync รายงาน (Google Sheets) ทำงานร่วมกันได้ไร้รอยต่อ
--
-- ข้อมูลอ้างอิงปริมาณรูปภาพจากระบบเดิม (1 ธ.ค. 2567 – 29 ต.ค. 2569):
--   851 ภาพ ใช้พื้นที่รวม 89.9 MB (~100 MB) เฉลี่ย ~105.6 KB/ภาพ (~45 MB/ปี)
--   โควต้าฟรี Supabase Storage 1 GB รองรับได้ ~9,500 ภาพ (ใช้งานได้ ~20 ปี)
-- ============================================================================

-- 1. เปิดใช้งาน Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================================
-- 2. MASTER TABLES (7 ตาราง)
-- ============================================================================

-- 2.1 Master_Departments (สังกัด -> ส่วนงาน)
CREATE TABLE IF NOT EXISTS public."Master_Departments" (
    dept_id TEXT PRIMARY KEY,
    dept_name TEXT NOT NULL,
    division_name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2.2 Master_Buildings (อาคาร/พื้นที่)
CREATE TABLE IF NOT EXISTS public."Master_Buildings" (
    bld_id TEXT PRIMARY KEY,
    bld_name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2.3 Master_Locations (ชั้น/บริเวณ ภายในอาคาร)
CREATE TABLE IF NOT EXISTS public."Master_Locations" (
    loc_id TEXT PRIMARY KEY,
    bld_id TEXT NOT NULL REFERENCES public."Master_Buildings"(bld_id) ON UPDATE CASCADE,
    loc_name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2.4 Master_Rooms (ห้อง สำหรับ Autocomplete)
CREATE TABLE IF NOT EXISTS public."Master_Rooms" (
    room_id TEXT PRIMARY KEY,
    loc_id TEXT NOT NULL REFERENCES public."Master_Locations"(loc_id) ON UPDATE CASCADE,
    room_name TEXT NOT NULL,
    note TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2.5 Master_Categories (หมวดหลัก -> หมวดย่อย)
CREATE TABLE IF NOT EXISTS public."Master_Categories" (
    cat_id TEXT PRIMARY KEY,
    main_category TEXT NOT NULL,
    sub_category TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2.6 Master_Statuses (สถานะงานทั้ง 7 + สี + ตั้งค่าแจ้งเตือน LINE Push)
CREATE TABLE IF NOT EXISTS public."Master_Statuses" (
    status_code TEXT PRIMARY KEY,
    status_label_th TEXT NOT NULL,
    status_color TEXT NOT NULL DEFAULT '#9E9E9E',
    sort_order INT NOT NULL DEFAULT 0,
    is_final BOOLEAN NOT NULL DEFAULT FALSE,
    notify_requester BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2.7 Master_Users (ผู้ใช้ทุกบทบาท: user / technician / admin)
CREATE TABLE IF NOT EXISTS public."Master_Users" (
    user_id TEXT PRIMARY KEY,
    user_username TEXT DEFAULT '',
    user_password TEXT DEFAULT '',
    user_name TEXT NOT NULL,
    user_phone TEXT DEFAULT '',
    dept_id TEXT REFERENCES public."Master_Departments"(dept_id) ON UPDATE CASCADE,
    user_role TEXT NOT NULL DEFAULT 'user' CHECK (user_role IN ('user', 'technician', 'admin')),
    line_user_id TEXT DEFAULT '',
    line_display_name TEXT DEFAULT '',
    line_linked_at TIMESTAMPTZ,
    telegram_user_id TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    note TEXT DEFAULT ''
);

-- ============================================================================
-- 3. SYSTEM TABLES (4 ตาราง)
-- ============================================================================

-- 3.1 Sys_Config
CREATE TABLE IF NOT EXISTS public."Sys_Config" (
    config_key TEXT PRIMARY KEY,
    config_value TEXT DEFAULT '',
    description TEXT DEFAULT ''
);

-- 3.2 Sys_Counters (ตัวนับเลขรันนิ่งแบบ Atomic ใน PostgreSQL)
CREATE TABLE IF NOT EXISTS public."Sys_Counters" (
    counter_key TEXT PRIMARY KEY,
    last_value INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Sys_NotificationLogs
CREATE TABLE IF NOT EXISTS public."Sys_NotificationLogs" (
    notif_id TEXT PRIMARY KEY,
    jtr_id TEXT DEFAULT '',
    channel TEXT NOT NULL CHECK (channel IN ('LINE_REPLY', 'LINE_PUSH', 'TELEGRAM')),
    event TEXT DEFAULT '',
    target TEXT DEFAULT '',
    result TEXT NOT NULL CHECK (result IN ('SENT', 'FAILED')),
    error_message TEXT DEFAULT '',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 Sys_AuditLogs
CREATE TABLE IF NOT EXISTS public."Sys_AuditLogs" (
    audit_id TEXT PRIMARY KEY,
    actor_user_id TEXT DEFAULT '',
    action TEXT NOT NULL,
    target_user_id TEXT DEFAULT '',
    detail TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. TRANSACTION TABLES (4 ตาราง)
-- ============================================================================

-- 4.1 Trans_JobTickets (ตารางใบงานแจ้งซ่อมหลัก)
CREATE TABLE IF NOT EXISTS public."Trans_JobTickets" (
    jtr_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    requester_id TEXT NOT NULL REFERENCES public."Master_Users"(user_id),
    requester_name TEXT NOT NULL,
    requester_phone TEXT DEFAULT '',
    requester_dept TEXT DEFAULT '',
    requester_division TEXT DEFAULT '',
    bld_id TEXT NOT NULL REFERENCES public."Master_Buildings"(bld_id),
    loc_id TEXT NOT NULL REFERENCES public."Master_Locations"(loc_id),
    room TEXT DEFAULT '',
    cat_id_reported TEXT NOT NULL REFERENCES public."Master_Categories"(cat_id),
    cat_id_actual TEXT REFERENCES public."Master_Categories"(cat_id),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' REFERENCES public."Master_Statuses"(status_code),
    first_accepted_by TEXT DEFAULT '',
    first_accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    on_hold_reason TEXT DEFAULT '',
    finished_at TIMESTAMPTZ,
    finished_by TEXT DEFAULT '',
    cause_solution TEXT DEFAULT '',
    materials_used TEXT DEFAULT '',
    tech_note TEXT DEFAULT '',
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT DEFAULT '',
    tg_message_id TEXT DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.2 Trans_Assignments (ช่างผู้ร่วมปฏิบัติงาน: 1 แถว = ช่าง 1 คน ต่อ 1 งาน)
CREATE TABLE IF NOT EXISTS public."Trans_Assignments" (
    asg_id TEXT PRIMARY KEY,
    jtr_id TEXT NOT NULL REFERENCES public."Trans_JobTickets"(jtr_id) ON DELETE CASCADE,
    tech_id TEXT NOT NULL REFERENCES public."Master_Users"(user_id),
    is_first_accepter BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_by TEXT DEFAULT '',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.3 Trans_Attachments (รูปภาพก่อนซ่อม BEFORE / หลังซ่อม AFTER บน Supabase Storage)
CREATE TABLE IF NOT EXISTS public."Trans_Attachments" (
    att_id TEXT PRIMARY KEY,
    jtr_id TEXT NOT NULL REFERENCES public."Trans_JobTickets"(jtr_id) ON DELETE CASCADE,
    att_type TEXT NOT NULL CHECK (att_type IN ('BEFORE', 'AFTER')),
    seq INT NOT NULL DEFAULT 1,
    drive_file_id TEXT DEFAULT '',              -- เก็บ storage_path ใน Supabase Storage หรือ Drive ID
    file_url TEXT NOT NULL,
    uploaded_by TEXT DEFAULT '',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.4 Trans_StatusLogs (ประวัติการเปลี่ยนสถานะทุกครั้ง)
CREATE TABLE IF NOT EXISTS public."Trans_StatusLogs" (
    log_id TEXT PRIMARY KEY,
    jtr_id TEXT NOT NULL REFERENCES public."Trans_JobTickets"(jtr_id) ON DELETE CASCADE,
    from_status TEXT DEFAULT '',
    to_status TEXT NOT NULL,
    changed_by TEXT DEFAULT '',
    changed_via TEXT NOT NULL DEFAULT 'LIFF' CHECK (changed_via IN ('LIFF', 'TELEGRAM', 'ADMIN', 'SYSTEM')),
    note TEXT DEFAULT '',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. INDEXES สำหรับการค้นหาความเร็วสูง (< 10ms)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_line_id ON public."Master_Users"(line_user_id) WHERE line_user_id <> '';
CREATE INDEX IF NOT EXISTS idx_users_tg_id ON public."Master_Users"(telegram_user_id) WHERE telegram_user_id <> '';
CREATE INDEX IF NOT EXISTS idx_users_username ON public."Master_Users"(lower(user_username)) WHERE user_username <> '';
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON public."Trans_JobTickets"(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public."Trans_JobTickets"(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_dup_check ON public."Trans_JobTickets"(bld_id, loc_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON public."Trans_JobTickets"(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_jtr ON public."Trans_Assignments"(jtr_id);
CREATE INDEX IF NOT EXISTS idx_attachments_jtr ON public."Trans_Attachments"(jtr_id);
CREATE INDEX IF NOT EXISTS idx_statuslogs_jtr ON public."Trans_StatusLogs"(jtr_id, changed_at ASC);
CREATE INDEX IF NOT EXISTS idx_notiflogs_month ON public."Sys_NotificationLogs"(channel, result, sent_at DESC);

-- ============================================================================
-- 6. ATOMIC ID GENERATORS & TRIGGERS (JTR-YYMM-NNN และรหัสตารางย่อย)
-- ============================================================================

-- ฟังก์ชันกลางสำหรับออกรหัส Running Number แบบ Atomic (Concurrency-Safe 100%)
CREATE OR REPLACE FUNCTION public.next_counter_id(p_counter_key TEXT, p_pad_len INT, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next INT;
BEGIN
    INSERT INTO public."Sys_Counters" (counter_key, last_value, updated_at)
    VALUES (p_counter_key, 1, now())
    ON CONFLICT (counter_key) DO UPDATE
    SET last_value = public."Sys_Counters".last_value + 1,
        updated_at = now()
    RETURNING last_value INTO v_next;

    RETURN p_prefix || LPAD(v_next::TEXT, p_pad_len, '0');
END;
$$;

-- ฟังก์ชันออกรหัสใบงาน JTR-YYMM-NNN ตามปี พ.ศ. 2 หลัก (Asia/Bangkok)
CREATE OR REPLACE FUNCTION public.next_jtr_ticket_id(p_ref_time TIMESTAMPTZ DEFAULT now())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bkk_time TIMESTAMP;
    v_yy_be INT;
    v_mm TEXT;
    v_key TEXT;
BEGIN
    v_bkk_time := p_ref_time AT TIME ZONE 'Asia/Bangkok';
    v_yy_be := (EXTRACT(YEAR FROM v_bkk_time)::INT + 543) % 100;
    v_mm := TO_CHAR(v_bkk_time, 'MM');
    v_key := 'JTR-' || LPAD(v_yy_be::TEXT, 2, '0') || v_mm;

    RETURN public.next_counter_id(v_key, 3, v_key || '-');
END;
$$;

-- Trigger สร้างรหัส JTR-YYMM-NNN อัตโนมัติก่อน INSERT ลง Trans_JobTickets
CREATE OR REPLACE FUNCTION public.trg_fn_before_insert_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.jtr_id IS NULL OR NEW.jtr_id = '' THEN
        NEW.jtr_id := public.next_jtr_ticket_id(COALESCE(NEW.created_at, now()));
    END IF;
    IF NEW.cat_id_actual IS NULL OR NEW.cat_id_actual = '' THEN
        NEW.cat_id_actual := NEW.cat_id_reported;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_insert_ticket ON public."Trans_JobTickets";
CREATE TRIGGER trg_before_insert_ticket
BEFORE INSERT ON public."Trans_JobTickets"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_before_insert_ticket();

-- Trigger สร้างรหัสอัตโนมัติให้ตารางย่อยแยกตามตาราง (ASG, ATT, LOG, NTF, AUD, USER)
DROP FUNCTION IF EXISTS public.trg_fn_auto_sub_id() CASCADE;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_asg_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.asg_id IS NULL OR NEW.asg_id = '' THEN
        NEW.asg_id := public.next_counter_id('ASG', 6, 'ASG');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_att_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.att_id IS NULL OR NEW.att_id = '' THEN
        NEW.att_id := public.next_counter_id('ATT', 6, 'ATT');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_log_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.log_id IS NULL OR NEW.log_id = '' THEN
        NEW.log_id := public.next_counter_id('LOG', 6, 'LOG');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_ntf_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.notif_id IS NULL OR NEW.notif_id = '' THEN
        NEW.notif_id := public.next_counter_id('NTF', 6, 'NTF');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_aud_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.audit_id IS NULL OR NEW.audit_id = '' THEN
        NEW.audit_id := public.next_counter_id('AUD', 6, 'AUD');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_auto_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.user_id IS NULL OR NEW.user_id = '' THEN
        NEW.user_id := public.next_counter_id('USER', 4, 'USER');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_asg_id ON public."Trans_Assignments";
CREATE TRIGGER trg_auto_asg_id BEFORE INSERT ON public."Trans_Assignments"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_asg_id();

DROP TRIGGER IF EXISTS trg_auto_att_id ON public."Trans_Attachments";
CREATE TRIGGER trg_auto_att_id BEFORE INSERT ON public."Trans_Attachments"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_att_id();

DROP TRIGGER IF EXISTS trg_auto_log_id ON public."Trans_StatusLogs";
CREATE TRIGGER trg_auto_log_id BEFORE INSERT ON public."Trans_StatusLogs"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_log_id();

DROP TRIGGER IF EXISTS trg_auto_ntf_id ON public."Sys_NotificationLogs";
CREATE TRIGGER trg_auto_ntf_id BEFORE INSERT ON public."Sys_NotificationLogs"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_ntf_id();

DROP TRIGGER IF EXISTS trg_auto_aud_id ON public."Sys_AuditLogs";
CREATE TRIGGER trg_auto_aud_id BEFORE INSERT ON public."Sys_AuditLogs"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_aud_id();

DROP TRIGGER IF EXISTS trg_auto_user_id ON public."Master_Users";
CREATE TRIGGER trg_auto_user_id BEFORE INSERT ON public."Master_Users"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_auto_user_id();

-- ============================================================================
-- 7. DECOUPLED NOTIFICATION TRIGGER (pg_net -> Edge Function notify-event)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_notify_ticket_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_edge_url TEXT;
    v_anon_key TEXT;
    v_event TEXT;
BEGIN
    -- อ่าน URL ของ Edge Function จาก Sys_Config (ถ้าตั้งค่าไว้)
    SELECT config_value INTO v_edge_url
    FROM public."Sys_Config"
    WHERE config_key = 'SUPABASE_EDGE_NOTIFY_URL';

    SELECT config_value INTO v_anon_key
    FROM public."Sys_Config"
    WHERE config_key = 'SUPABASE_ANON_KEY';

    IF v_edge_url IS NULL OR v_edge_url = '' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_event := 'TICKET_CREATED';
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_event := 'STATUS_CHANGED';
    ELSE
        RETURN NEW;
    END IF;

    -- ยิง HTTP POST แบบ Asynchronous (ไม่บล็อกการตอบกลับหน้าเว็บ LIFF)
    PERFORM net.http_post(
        url := v_edge_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(v_anon_key, '')
        ),
        body := jsonb_build_object(
            'event', v_event,
            'jtr_id', NEW.jtr_id,
            'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE '' END,
            'new_status', NEW.status
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- ป้องกันไม่ให้ปัญหาเรื่อง Network ขัดจังหวะการบันทึกใบงานหลัก
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_ticket_notify ON public."Trans_JobTickets";
CREATE TRIGGER trg_after_ticket_notify
AFTER INSERT OR UPDATE OF status ON public."Trans_JobTickets"
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notify_ticket_event();

-- ============================================================================
-- 8. ATOMIC RPC FUNCTIONS สำหรับเรียกจาก Frontend / Edge Function
-- ============================================================================

-- 8.1 RPC: ผูกบัญชี LINE ครั้งแรกด้วย Username / Password
CREATE OR REPLACE FUNCTION public.rpc_bind_line_account(
    p_username TEXT,
    p_password TEXT,
    p_line_user_id TEXT,
    p_line_display_name TEXT DEFAULT '',
    p_phone TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user public."Master_Users"%ROWTYPE;
BEGIN
    IF COALESCE(trim(p_username), '') = '' OR COALESCE(trim(p_password), '') = '' THEN
        RAISE EXCEPTION 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน';
    END IF;

    SELECT * INTO v_user
    FROM public."Master_Users"
    WHERE lower(trim(user_username)) = lower(trim(p_username))
    LIMIT 1;

    IF NOT FOUND OR trim(v_user.user_password) <> trim(p_password) THEN
        INSERT INTO public."Sys_AuditLogs" (actor_user_id, action, target_user_id, detail)
        VALUES ('', 'LOGIN_FAIL', COALESCE(v_user.user_id, ''), 'username=' || p_username || ' line=' || p_line_user_id);
        RAISE EXCEPTION 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    END IF;

    IF NOT v_user.is_active THEN
        RAISE EXCEPTION 'บัญชีผู้ใช้นี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    END IF;

    IF COALESCE(trim(v_user.line_user_id), '') <> '' AND trim(v_user.line_user_id) <> trim(p_line_user_id) THEN
        RAISE EXCEPTION 'บัญชีผู้ใช้นี้ถูกผูกกับ LINE เครื่องอื่นแล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ต';
    END IF;

    UPDATE public."Master_Users"
    SET line_user_id = trim(p_line_user_id),
        line_display_name = COALESCE(NULLIF(trim(p_line_display_name), ''), line_display_name),
        line_linked_at = now(),
        user_phone = COALESCE(NULLIF(trim(p_phone), ''), user_phone),
        updated_at = now()
    WHERE user_id = v_user.user_id
    RETURNING * INTO v_user;

    INSERT INTO public."Sys_AuditLogs" (actor_user_id, action, target_user_id, detail)
    VALUES (v_user.user_id, 'LINK_LINE', v_user.user_id, 'line=' || p_line_user_id);

    RETURN jsonb_build_object(
        'user_id', v_user.user_id,
        'user_username', v_user.user_username,
        'user_name', v_user.user_name,
        'user_phone', v_user.user_phone,
        'dept_id', v_user.dept_id,
        'user_role', v_user.user_role,
        'line_user_id', v_user.line_user_id,
        'line_display_name', v_user.line_display_name,
        'telegram_user_id', v_user.telegram_user_id
    );
END;
$$;

-- 8.2 RPC: กดรับงานแบบ Atomic (ป้องกันช่าง 2 คนกดชนกัน)
CREATE OR REPLACE FUNCTION public.rpc_accept_ticket(
    p_jtr_id TEXT,
    p_tech_user_id TEXT,
    p_via TEXT DEFAULT 'LIFF'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public."Trans_JobTickets"%ROWTYPE;
    v_tech public."Master_Users"%ROWTYPE;
BEGIN
    SELECT * INTO v_tech FROM public."Master_Users" WHERE user_id = p_tech_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบข้อมูลช่างในระบบ';
    END IF;

    -- ล็อกแถวใบงานเพื่อป้องกัน Race Condition
    SELECT * INTO v_ticket
    FROM public."Trans_JobTickets"
    WHERE jtr_id = p_jtr_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบใบงาน %', p_jtr_id;
    END IF;

    IF v_ticket.status <> 'PENDING' THEN
        RETURN jsonb_build_object(
            'alreadyAccepted', true,
            'jtr_id', v_ticket.jtr_id,
            'status', v_ticket.status,
            'first_accepted_by', v_ticket.first_accepted_by
        );
    END IF;

    UPDATE public."Trans_JobTickets"
    SET status = 'ACCEPTED',
        first_accepted_by = v_tech.user_id,
        first_accepted_at = now(),
        updated_at = now()
    WHERE jtr_id = p_jtr_id
    RETURNING * INTO v_ticket;

    INSERT INTO public."Trans_Assignments" (jtr_id, tech_id, is_first_accepter, recorded_by, recorded_at)
    VALUES (p_jtr_id, v_tech.user_id, true, v_tech.user_id, now());

    INSERT INTO public."Trans_StatusLogs" (jtr_id, from_status, to_status, changed_by, changed_via, note, changed_at)
    VALUES (p_jtr_id, 'PENDING', 'ACCEPTED', v_tech.user_id, p_via, 'รับงานโดย ' || v_tech.user_name, now());

    RETURN jsonb_build_object(
        'alreadyAccepted', false,
        'jtr_id', v_ticket.jtr_id,
        'status', v_ticket.status,
        'first_accepted_by', v_ticket.first_accepted_by,
        'first_accepted_by_name', v_tech.user_name
    );
END;
$$;

-- ============================================================================
-- 9. SUPABASE STORAGE BUCKET (ticket-attachments)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ticket-attachments',
    'ticket-attachments',
    true,
    5242880, -- จำกัดขนาดสูงสุด 5MB ต่อไฟล์ (ภาพที่ย่อจากเว็บจริงมีขนาดเพียง ~100KB)
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880;

DROP POLICY IF EXISTS "Public read ticket attachments" ON storage.objects;
CREATE POLICY "Public read ticket attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-attachments');

DROP POLICY IF EXISTS "Allow upload ticket attachments" ON storage.objects;
CREATE POLICY "Allow upload ticket attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-attachments');

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public."Master_Departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Buildings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Master_Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Trans_JobTickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Trans_Assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Trans_Attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Trans_StatusLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sys_Config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sys_Counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sys_NotificationLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sys_AuditLogs" ENABLE ROW LEVEL SECURITY;

-- นโยบายอ่าน/เขียนสำหรับ Client (ควบคุมสิทธิ์ผ่าน Application Layer + RPC + Edge Functions)

-- 10.1 Master Data & Sys_Config: เปิดให้อ่านได้ทุกคน (Public Read)
DROP POLICY IF EXISTS "Allow public read" ON public."Master_Departments";
CREATE POLICY "Allow public read" ON public."Master_Departments" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Master_Buildings";
CREATE POLICY "Allow public read" ON public."Master_Buildings" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Master_Locations";
CREATE POLICY "Allow public read" ON public."Master_Locations" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Master_Rooms";
CREATE POLICY "Allow public read" ON public."Master_Rooms" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Master_Categories";
CREATE POLICY "Allow public read" ON public."Master_Categories" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Master_Statuses";
CREATE POLICY "Allow public read" ON public."Master_Statuses" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read" ON public."Sys_Config";
CREATE POLICY "Allow public read" ON public."Sys_Config" FOR SELECT USING (true);

-- 10.2 User, Transaction & System Logs: อนุญาตให้ Client เข้าถึงได้
DROP POLICY IF EXISTS "Allow client all" ON public."Master_Users";
CREATE POLICY "Allow client all" ON public."Master_Users" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Trans_JobTickets";
CREATE POLICY "Allow client all" ON public."Trans_JobTickets" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Trans_Assignments";
CREATE POLICY "Allow client all" ON public."Trans_Assignments" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Trans_Attachments";
CREATE POLICY "Allow client all" ON public."Trans_Attachments" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Trans_StatusLogs";
CREATE POLICY "Allow client all" ON public."Trans_StatusLogs" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Sys_Counters";
CREATE POLICY "Allow client all" ON public."Sys_Counters" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Sys_NotificationLogs";
CREATE POLICY "Allow client all" ON public."Sys_NotificationLogs" FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow client all" ON public."Sys_AuditLogs";
CREATE POLICY "Allow client all" ON public."Sys_AuditLogs" FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. SEED DATA (ข้อมูลตั้งต้นครบทั้งระบบ)
-- ============================================================================

-- 11.1 Master_Departments (10 แถว)
INSERT INTO public."Master_Departments" (dept_id, dept_name, division_name, sort_order, is_active) VALUES
('DEP01', 'สถาบันพัฒนาการชลประทาน', 'ส่วนบริหารทั่วไป', 1, true),
('DEP02', 'สถาบันพัฒนาการชลประทาน', 'ส่วนถ่ายทอดเทคโนโลยีและนวัตกรรมชลประทาน', 2, true),
('DEP03', 'สถาบันพัฒนาการชลประทาน', 'ส่วนจัดการด้านกายภาพและทดสอบมาตรฐานด้านชลประทานและน้ำ', 3, true),
('DEP04', 'สถาบันพัฒนาการชลประทาน', 'ส่วนวิจัยเทคโนโลยีและนวัตกรรมการชลประทาน', 4, true),
('DEP05', 'สถาบันพัฒนาการชลประทาน', 'ส่วนสื่อสารองค์กรและเทคโนโลยีสารสนเทศ', 5, true),
('DEP06', 'วิทยาลัยการชลประทาน', 'อาจารย์ประจำ', 6, true),
('DEP07', 'วิทยาลัยการชลประทาน', 'อาจารย์ประจำหอพัก', 7, true),
('DEP08', 'วิทยาลัยการชลประทาน', 'เจ้าหน้าที่', 8, true),
('DEP09', 'วิทยาลัยการชลประทาน', 'นิสิต / นักศึกษา', 9, true),
('DEP10', 'เจ้าหน้าที่', 'แม่บ้าน / คนสวน / รปภ.', 10, true)
ON CONFLICT (dept_id) DO NOTHING;

-- 11.2 Master_Buildings (17 แถว)
INSERT INTO public."Master_Buildings" (bld_id, bld_name, sort_order, is_active) VALUES
('BLD01', 'อาคารอำนวยการ', 1, true),
('BLD02', 'อาคารหอประชุม ชูชาติ กำภู', 2, true),
('BLD03', 'อาคารหอประวัติ', 3, true),
('BLD04', 'อาคารอรุณอินทรปาลิต', 4, true),
('BLD05', 'อาคารศูนย์ฝึกอบรม (NEWMASIP)', 5, true),
('BLD06', 'อาคารเรียน 1', 6, true),
('BLD07', 'อาคารเรียน 2', 7, true),
('BLD08', 'หอพัก 1 (หญิง)', 8, true),
('BLD09', 'หอพัก 2 (ชาย)', 9, true),
('BLD10', 'หอพัก 3 (ชาย)', 10, true),
('BLD11', 'หอพัก 5 (ชาย)', 11, true),
('BLD12', 'โรงอาหารสถาบันพัฒนาการชลประทาน', 12, true),
('BLD13', 'อาคารโรงอาหาร 400 ที่นั่งบริเวณหอประชุม', 13, true),
('BLD14', 'อาคาร 80 ปีวิทยาลัยการชลประทาน', 14, true),
('BLD15', 'บ้านพักรับรอง waterman home', 15, true),
('BLD16', 'สถานีการสาธิตเทคโนโลยีสำหรับการบริหารจัดการน้ำ', 16, true),
('BLD17', 'อื่น ๆ', 17, true)
ON CONFLICT (bld_id) DO NOTHING;

-- 11.3 Master_Locations (45 แถว)
INSERT INTO public."Master_Locations" (loc_id, bld_id, loc_name, sort_order, is_active) VALUES
('LOC001', 'BLD01', 'ชั้น 1', 1, true),
('LOC002', 'BLD01', 'ชั้น 2', 2, true),
('LOC003', 'BLD01', 'บริเวณรอบอาคาร', 3, true),
('LOC004', 'BLD02', 'ชั้น 1', 1, true),
('LOC005', 'BLD02', 'ชั้น 2', 2, true),
('LOC006', 'BLD02', 'บริเวณรอบอาคาร', 3, true),
('LOC007', 'BLD03', 'ชั้น 1', 1, true),
('LOC008', 'BLD03', 'ชั้น 2 ลานอเนกประสงค์', 2, true),
('LOC009', 'BLD04', 'ชั้น 1', 1, true),
('LOC010', 'BLD04', 'ชั้น 2', 2, true),
('LOC011', 'BLD04', 'ชั้น 3', 3, true),
('LOC012', 'BLD04', 'ชั้น 4', 4, true),
('LOC013', 'BLD05', 'ภายในอาคาร', 1, true),
('LOC014', 'BLD05', 'บริเวณรอบอาคาร', 2, true),
('LOC015', 'BLD06', 'ชั้น 1', 1, true),
('LOC016', 'BLD06', 'ชั้น 2', 2, true),
('LOC017', 'BLD06', 'บริเวณรอบอาคาร', 3, true),
('LOC018', 'BLD07', 'ชั้น 1', 1, true),
('LOC019', 'BLD07', 'ชั้น 2', 2, true),
('LOC020', 'BLD07', 'บริเวณรอบอาคาร', 3, true),
('LOC021', 'BLD08', 'ชั้น 1', 1, true),
('LOC022', 'BLD08', 'ชั้น 2', 2, true),
('LOC023', 'BLD08', 'บริเวณรอบอาคาร', 3, true),
('LOC024', 'BLD09', 'ชั้น 1', 1, true),
('LOC025', 'BLD09', 'ชั้น 2', 2, true),
('LOC026', 'BLD09', 'บริเวณรอบอาคาร', 3, true),
('LOC027', 'BLD10', 'ชั้น 1', 1, true),
('LOC028', 'BLD10', 'ชั้น 2', 2, true),
('LOC029', 'BLD10', 'บริเวณรอบอาคาร', 3, true),
('LOC030', 'BLD11', 'ชั้น 1', 1, true),
('LOC031', 'BLD11', 'ชั้น 2', 2, true),
('LOC032', 'BLD11', 'ชั้น 3', 3, true),
('LOC033', 'BLD11', 'ชั้น 4', 4, true),
('LOC034', 'BLD11', 'บริเวณรอบอาคาร', 5, true),
('LOC035', 'BLD12', 'ภายในอาคาร', 1, true),
('LOC036', 'BLD12', 'บริเวณรอบอาคาร', 2, true),
('LOC037', 'BLD13', 'ภายในอาคาร', 1, true),
('LOC038', 'BLD13', 'บริเวณรอบอาคาร', 2, true),
('LOC039', 'BLD14', 'ภายในอาคาร', 1, true),
('LOC040', 'BLD14', 'บริเวณรอบอาคาร', 2, true),
('LOC041', 'BLD15', 'ภายในอาคาร', 1, true),
('LOC042', 'BLD15', 'บริเวณรอบอาคาร', 2, true),
('LOC043', 'BLD16', 'ภายในอาคาร', 1, true),
('LOC044', 'BLD16', 'บริเวณรอบอาคาร', 2, true),
('LOC045', 'BLD17', 'โปรดระบุในรายละเอียดการแจ้งซ่อม', 1, true)
ON CONFLICT (loc_id) DO NOTHING;

-- 11.4 Master_Rooms (2 แถว)
INSERT INTO public."Master_Rooms" (room_id, loc_id, room_name, note, is_active) VALUES
('ROOM0001', 'LOC001', 'A16', 'ส่วนสื่อสารองค์กรและเทคโนโลยีสารสนเทศ', true),
('ROOM0002', 'LOC001', 'A17', '', true)
ON CONFLICT (room_id) DO NOTHING;

-- 11.5 Master_Categories (24 แถว)
INSERT INTO public."Master_Categories" (cat_id, main_category, sub_category, sort_order, is_active) VALUES
('CAT001', 'ไฟฟ้า', 'หลอดไฟ / แสงสว่าง', 1, true),
('CAT002', 'ไฟฟ้า', 'ปลั๊กไฟ / สวิตช์ไฟ / เบรกเกอร์', 2, true),
('CAT003', 'ไฟฟ้า', 'อื่นๆ (ระบบไฟฟ้า)', 3, true),
('CAT004', 'ประปา', 'ชักโครก / โถปัสสาวะ', 4, true),
('CAT005', 'ประปา', 'ก๊อกน้ำ / ฝักบัว / สายชำระ', 5, true),
('CAT006', 'ประปา', 'อ่างล้างหน้า / ซิงค์ล้างจาน / ท่อน้ำทิ้งตัน', 6, true),
('CAT007', 'ประปา', 'ปั๊มน้ำ / ระบบน้ำส่วนกลาง / ท่อน้ำ', 7, true),
('CAT008', 'ประปา', 'อื่นๆ (ระบบประปา)', 8, true),
('CAT009', 'เครื่องปรับอากาศ (แอร์)', 'น้ำหยด', 9, true),
('CAT010', 'เครื่องปรับอากาศ (แอร์)', 'ไม่ทำความเย็น', 10, true),
('CAT011', 'เครื่องปรับอากาศ (แอร์)', 'เปิดไม่ติด / ไม่ทำงาน', 11, true),
('CAT012', 'เครื่องปรับอากาศ (แอร์)', 'อื่นๆ (เครื่องปรับอากาศ)', 12, true),
('CAT013', 'เครื่องใช้ไฟฟ้า', 'พัดลม / ตู้เย็น / ทีวี', 13, true),
('CAT014', 'เครื่องใช้ไฟฟ้า', 'โปรเจคเตอร์', 14, true),
('CAT015', 'เครื่องใช้ไฟฟ้า', 'ชุดเครื่องเสียง', 15, true),
('CAT016', 'เครื่องใช้ไฟฟ้า', 'ตู้ทำน้ำเย็น / เครื่องกรองน้ำ', 16, true),
('CAT017', 'เครื่องใช้ไฟฟ้า', 'อื่นๆ (เครื่องใช้ไฟฟ้า)', 17, true),
('CAT018', 'อาคารและเฟอร์นิเจอร์', 'ประตู / หน้าต่าง / ลูกบิด', 18, true),
('CAT019', 'อาคารและเฟอร์นิเจอร์', 'หลังคา / เพดาน / ผนัง', 19, true),
('CAT020', 'อาคารและเฟอร์นิเจอร์', 'โต๊ะ / ตู้ / เตียง / เก้าอี้', 20, true),
('CAT021', 'อาคารและเฟอร์นิเจอร์', 'อื่นๆ (อาคารและเฟอร์นิเจอร์)', 21, true),
('CAT022', 'อินเทอร์เน็ต', 'อินเทอร์เน็ต', 22, true),
('CAT023', 'งานติดตั้ง', 'งานติดตั้ง', 23, true),
('CAT024', 'อื่น ๆ', 'อื่น ๆ (โปรดระบุในรายละเอียด)', 24, true)
ON CONFLICT (cat_id) DO NOTHING;

-- 11.6 Master_Statuses (7 แถว)
INSERT INTO public."Master_Statuses" (status_code, status_label_th, status_color, sort_order, is_final, notify_requester) VALUES
('PENDING',       'รอตรวจสอบ',          '#9E9E9E', 1, false, false),
('ACCEPTED',      'รับงานแล้ว',          '#2196F3', 2, false, true),
('IN_PROGRESS',   'กำลังดำเนินการ',      '#FF9800', 3, false, false),
('ON_HOLD',       'รออะไหล่ / รอจัดซื้อ', '#9C27B0', 4, false, true),
('COMPLETED',     'ดำเนินการเสร็จสิ้น',   '#4CAF50', 5, true,  true),
('CANNOT_REPAIR', 'ไม่สามารถซ่อมแซมได้', '#F44336', 6, true,  true),
('CANCELLED',     'ยกเลิกโดยผู้แจ้ง',     '#607D8B', 7, true,  false)
ON CONFLICT (status_code) DO NOTHING;

-- 11.7 Master_Users (Admin + ช่าง 5 คน)
INSERT INTO public."Master_Users" (user_id, user_username, user_password, user_name, user_phone, dept_id, user_role, is_active, note) VALUES
('USER0001', 'thanawat.b', '19032540', 'นายธนาวัฒน์ บุตรศรี', '', 'DEP01', 'admin', true, ''),
('USER0002', 'surachat',   '11111111', 'สุรชาติ',            '', 'DEP03', 'technician', true, 'ช่าง — แก้รหัสผ่านได้ในหน้า Admin'),
('USER0003', 'thittipong', '11111111', 'ทิตติพงค์',          '', 'DEP03', 'technician', true, 'ช่าง — แก้รหัสผ่านได้ในหน้า Admin'),
('USER0004', 'pichai',     '11111111', 'พิชัย',              '', 'DEP03', 'technician', true, 'ช่าง — แก้รหัสผ่านได้ในหน้า Admin'),
('USER0005', 'noppon',     '11111111', 'นพพล',               '', 'DEP03', 'technician', true, 'ช่าง — แก้รหัสผ่านได้ในหน้า Admin'),
('USER0006', 'peerachai',  '11111111', 'พีระชัย',            '', 'DEP03', 'technician', true, 'ช่าง — แก้รหัสผ่านได้ในหน้า Admin')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public."Sys_Counters" (counter_key, last_value, updated_at)
VALUES ('USER', 6, now())
ON CONFLICT (counter_key) DO NOTHING;

-- 11.8 Sys_Config (21 แถว + ค่าตั้งต้นสำหรับ Supabase)
INSERT INTO public."Sys_Config" (config_key, config_value, description) VALUES
('SYSTEM_NAME', 'e-MMS ระบบบริหารจัดการงานซ่อมบำรุงออนไลน์', 'ชื่อระบบที่แสดงใน UI/ข้อความแจ้งเตือน'),
('ORG_NAME', 'สถาบันพัฒนาการชลประทาน', 'ชื่อหน่วยงาน'),
('TIMEZONE', 'Asia/Bangkok', 'เขตเวลา'),
('LIFF_ID', '', 'LIFF ID จาก LINE Developers Console'),
('WEB_BASE_URL', 'https://topseason.github.io/e-mms/web/', 'URL หน้าเว็บบน GitHub Pages'),
('TELEGRAM_CHAT_ID', '', 'Chat ID ของกลุ่ม Telegram ทีมช่าง (ตัวเลขติดลบ)'),
('DRIVE_ROOT_FOLDER_ID', '1VSmtUyahQ3XTytpap1IROfKO_jTTP-ez', 'โฟลเดอร์ Google Drive สำรอง'),
('MAX_IMAGES_BEFORE', '3', 'จำนวนรูปสูงสุดที่ผู้แจ้งแนบได้ (ขั้นต่ำ 1)'),
('MAX_IMAGES_AFTER', '3', 'จำนวนรูปหลังซ่อมสูงสุด (ขั้นต่ำ 1 ตอนปิดงาน)'),
('IMAGE_MAX_WIDTH', '1280', 'ย่อรูปฝั่งมือถือก่อนอัปโหลด (px)'),
('IMAGE_JPEG_QUALITY', '0.7', 'คุณภาพ JPEG หลังย่อ (0-1)'),
('LINE_PUSH_MONTHLY_LIMIT', '300', 'โควต้า Push ฟรีของ LINE OA ต่อเดือน'),
('LINE_PUSH_WARN_AT', '250', 'แจ้งเตือน Admin ใน Telegram เมื่อใช้ Push ถึงจำนวนนี้'),
('DAILY_SUMMARY_ENABLED', 'TRUE', 'ส่งสรุปงานค้างใน Telegram ทุกเช้า'),
('DAILY_SUMMARY_HOUR', '8', 'ชั่วโมงที่ส่งสรุป (0-23)'),
('DAILY_SUMMARY_WEEKDAYS', 'MON,TUE,WED,THU,FRI', 'วันที่ส่งสรุป'),
('DUPLICATE_CHECK_ENABLED', 'TRUE', 'เตือนผู้แจ้งเมื่อมีงานเปิดอยู่ในอาคาร/ชั้น/ห้องเดียวกัน'),
('FISCAL_YEAR_START_MONTH', '10', 'เดือนเริ่มปีงบประมาณ (ต.ค.)'),
('JTR_ID_PREFIX', 'JTR', 'คำนำหน้ารหัสงาน -> JTR-YYMM-NNN (YY = ปี พ.ศ. 2 หลัก)'),
('LOGIN_MAX_FAILS', '5', 'จำนวนครั้งที่ login ผิดได้ก่อนถูกล็อกชั่วคราว'),
('LOGIN_LOCK_MINUTES', '15', 'ระยะเวลาล็อก (นาที)'),
('SUPABASE_EDGE_NOTIFY_URL', '', 'URL ของ Edge Function notify-event สำหรับ pg_net webhook')
ON CONFLICT (config_key) DO NOTHING;
