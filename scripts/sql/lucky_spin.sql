-- =====================================================================
-- VÒNG QUAY MAY MẮN: lịch sử quay + cấu hình giải thưởng
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run
-- =====================================================================

-- 1) Lịch sử quay — mỗi lượt quay 1 dòng.
--    Trúng thẻ điện thoại: HS điền form → update các cột phone/carrier/...
--    Quota thẻ = đếm số dòng theo prize_id.
create table if not exists edux_spin_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_name text,
  prize_id text not null,
  prize_label text,
  xp_bonus integer default 0,
  week integer,
  -- Thông tin nhận thưởng (chỉ có khi trúng thẻ điện thoại)
  phone text,
  carrier text,            -- Viettel / Vinaphone / Mobifone
  student_name text,
  class_name text,
  school text,
  claimed boolean default false,  -- đã điền form nhận thưởng chưa
  created_at timestamptz default now()
);

create index if not exists idx_edux_spin_history_user  on edux_spin_history (user_id);
create index if not exists idx_edux_spin_history_prize on edux_spin_history (prize_id);

-- 2) Cấu hình giải — admin chỉnh tỉ lệ/quota qua trang quản lý, không cần sửa code
create table if not exists edux_spin_config (
  prize_id text primary key,
  weight numeric not null default 0,   -- tỉ lệ % mỗi lượt quay
  quota integer,                       -- giới hạn tổng số người trúng (null = không giới hạn)
  enabled boolean default true
);

-- Seed cấu hình mặc định (chạy lại không ghi đè chỉnh sửa của admin)
insert into edux_spin_config (prize_id, weight, quota, enabled) values
  ('card10',  3,    20,   true),  -- Thẻ điện thoại 10.000đ
  ('card20',  1.5,  10,   true),  -- Thẻ điện thoại 20.000đ
  ('card50',  0.35, 2,    true),  -- Thẻ điện thoại 50.000đ
  ('card100', 0.15, 1,    true),  -- Thẻ điện thoại 100.000đ
  ('extra',   10,   null, true),  -- Bạn có thêm 1 lượt quay!
  ('xp50',    35,   null, true),  -- +50 XP
  ('xp100',   25,   null, true),  -- +100 XP
  ('miss1',   12.5, null, true),  -- Hẹn gặp bạn lần sau!
  ('miss2',   12.5, null, true)   -- Oops, chúc bạn may mắn lần sau!
on conflict (prize_id) do nothing;

-- 3) RLS + policy mở cho anon (đồng bộ cách hoạt động với các bảng khác của app)
alter table edux_spin_history enable row level security;
alter table edux_spin_config  enable row level security;

drop policy if exists "spin_history_all" on edux_spin_history;
create policy "spin_history_all" on edux_spin_history
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "spin_config_all" on edux_spin_config;
create policy "spin_config_all" on edux_spin_config
  for all to anon, authenticated using (true) with check (true);
