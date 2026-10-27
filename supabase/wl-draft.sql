-- =====================================================================
--  WL Draft: ตารางสำหรับระบบร่างหนังสือราชการ
--  รันครั้งเดียวใน Supabase โครงการเดียวกับ WL Admin (SQL Editor → วางทั้งไฟล์ → Run)
--  ใช้ฟังก์ชันสิทธิ์เดิมของ WL Admin: public.is_staff(), public.is_admin()
--  ไม่แก้ไขตารางเดิมใดๆ · รันซ้ำได้ ไม่ทำให้ข้อมูลซ้ำ
-- =====================================================================

-- 1) ตั้งค่าหัวหนังสือ (มีแถวเดียว)
create table if not exists public.wd_settings (
  id           int primary key default 1 check (id = 1),
  school_name  text not null default '',
  memo_dept    text not null default '',   -- ส่วนราชการ (บันทึกข้อความ)
  ext_address  text not null default '',   -- ที่อยู่มุมขวา (หนังสือภายนอก) แยกบรรทัดด้วยการขึ้นบรรทัดใหม่
  doc_code     text not null default '',   -- รหัสหนังสือ เช่น ศธ ๐๔๑๕๙.๐๕๒๖
  director_to  text not null default '',   -- คำขึ้นต้น "เรียน" ของบันทึกข้อความ
  footer       text not null default '',   -- ท้ายหนังสือภายนอก (ส่วนราชการเจ้าของเรื่อง/โทร)
  updated_at   timestamptz not null default now()
);

-- 2) บุคลากร (ผู้ลงนาม/ผู้เสนอ)
create table if not exists public.wd_people (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  rank        text not null default '',    -- ตำแหน่งตามคำสั่ง เช่น ครู คศ.2
  sign_title  text not null default '',    -- ตำแหน่งที่พิมพ์ใต้ชื่อผู้ลงนาม
  duty        text not null default '',    -- หน้าที่หลัก เช่น หัวหน้าฝ่ายบริหารวิชาการ
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 3) เอกสารที่ร่าง
create table if not exists public.wd_documents (
  id          uuid primary key default gen_random_uuid(),
  doc_type    text not null check (doc_type in ('memo','external','order','announce')),
  doc_no      text not null default '',
  doc_date    date,
  subject     text not null default '',
  data        jsonb not null default '{}'::jsonb,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists wd_documents_created_idx on public.wd_documents (created_at desc);

-- สิทธิ์: ครูที่อนุมัติแล้วอ่านได้ · แก้ตั้งค่า/บุคลากรได้เฉพาะแอดมิน
-- เอกสาร: ครูสร้างได้ แก้/ลบได้เฉพาะของตัวเอง แอดมินแก้/ลบได้ทั้งหมด
alter table public.wd_settings  enable row level security;
alter table public.wd_people    enable row level security;
alter table public.wd_documents enable row level security;

drop policy if exists wd_settings_read  on public.wd_settings;
drop policy if exists wd_settings_write on public.wd_settings;
create policy wd_settings_read  on public.wd_settings for select using (public.is_staff());
create policy wd_settings_write on public.wd_settings for all    using (public.is_admin()) with check (public.is_admin());

drop policy if exists wd_people_read  on public.wd_people;
drop policy if exists wd_people_write on public.wd_people;
create policy wd_people_read  on public.wd_people for select using (public.is_staff());
create policy wd_people_write on public.wd_people for all    using (public.is_admin()) with check (public.is_admin());

drop policy if exists wd_docs_read   on public.wd_documents;
drop policy if exists wd_docs_insert on public.wd_documents;
drop policy if exists wd_docs_update on public.wd_documents;
drop policy if exists wd_docs_delete on public.wd_documents;
create policy wd_docs_read   on public.wd_documents for select using (public.is_staff());
create policy wd_docs_insert on public.wd_documents for insert with check (public.is_staff() and created_by = auth.uid());
create policy wd_docs_update on public.wd_documents for update
  using (public.is_admin() or created_by = auth.uid()) with check (public.is_admin() or created_by = auth.uid());
create policy wd_docs_delete on public.wd_documents for delete using (public.is_admin() or created_by = auth.uid());

-- ข้อมูลตั้งต้น
insert into public.wd_settings (id, school_name, memo_dept, ext_address, doc_code, director_to, footer) values (1,
  'โรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)',
  'โรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ) อำเภอศรีสำโรง จังหวัดสุโขทัย',
  E'โรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)\nตำบลวังลึก อำเภอศรีสำโรง\nจังหวัดสุโขทัย ๖๔๑๒๐',
  'ศธ ๐๔๑๕๙.๐๕๒๖',
  'ผู้อำนวยการโรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)',
  E'โรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)\nโทร. ๐๘๓-๓๗๒๔๕๖๙'
) on conflict (id) do nothing;

insert into public.wd_people (full_name, rank, sign_title, duty, sort)
select * from (values
  ('นายอัครวีร กระแสร์', 'ผู้อำนวยการโรงเรียน', 'ผู้อำนวยการโรงเรียนบ้านวังลึก(ยุวนาฏชนูทิศ)', 'ผู้อำนวยการ', 1),
  ('นางเจษฎ์สุดา ขำพงศ์', 'ครู คศ.3', 'ครู วิทยฐานะครูชำนาญการพิเศษ', 'หัวหน้าฝ่ายบริหารวิชาการ', 2),
  ('นางสาวปิยะพร สสิพรรณ์', 'ครู คศ.1', 'ครู', 'หัวหน้าฝ่ายบริหารงบประมาณ', 3),
  ('นางสาวสุรรัตน์ บุญประสิทธิ์', 'ครู คศ.3', 'ครู วิทยฐานะครูชำนาญการพิเศษ', 'หัวหน้าฝ่ายบริหารงานบุคคล', 4),
  ('นางสาวพราภรณ์ รอดนุช', 'ครู คศ.1', 'ครู', 'หัวหน้าฝ่ายบริหารทั่วไป', 5),
  ('นางสาวพลอยไพลิน วรรณจิตร์', 'ครู คศ.2', 'ครู วิทยฐานะครูชำนาญการ', 'รองหัวหน้าฝ่ายบริหารวิชาการ', 6),
  ('นายสุทธวีร์ ราชา', 'ครู คศ.2', 'ครู วิทยฐานะครูชำนาญการ', '', 7),
  ('นางสาววีวรรณ ปุ้มตะมะ', 'ครู คศ.1', 'ครู', '', 8),
  ('นางสาวภัคพิชา บุญดา', 'ครู คศ.2', 'ครู วิทยฐานะครูชำนาญการ', '', 9),
  ('นางสาวอุษา ภูวิใจ', 'ครู คศ.1', 'ครู', 'รองหัวหน้าฝ่ายบริหารงบประมาณ', 10),
  ('นายวรากร ตรงต่อกิจ', 'ครู คศ.2', 'ครู วิทยฐานะครูชำนาญการ', '', 11),
  ('นายพศิน อยู่คอน', 'ครู คศ.3', 'ครู วิทยฐานะครูชำนาญการพิเศษ', '', 12),
  ('นายวิวัฒน์ พานทอง', 'ครูอัตราจ้าง', 'ครูอัตราจ้าง', 'รองหัวหน้าฝ่ายบริหารทั่วไป', 13),
  ('นางสาวปัทมา จันทร์เอี่ยม', 'ครูอัตราจ้าง', 'ครูอัตราจ้าง', '', 14),
  ('นายวีระยุทธ์ นาคมี', 'ครูอัตราจ้าง', 'ครูอัตราจ้าง', '', 15),
  ('นางอุสา หิรัญหลวง', 'พี่เลี้ยงเด็กพิการ', 'พี่เลี้ยงเด็กพิการ', '', 16),
  ('นายจอย อ่ำเคลือบ', 'ลูกจ้างประจำ', 'ลูกจ้างประจำ', '', 17),
  ('นางสาวพรชนันท์ ดีสังข์', 'เจ้าหน้าที่ธุรการ', 'เจ้าหน้าที่ธุรการ', 'งานธุรการและสารบรรณ', 18)
) as v(full_name, rank, sign_title, duty, sort)
where not exists (select 1 from public.wd_people);
