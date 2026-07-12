-- =====================================================================
-- ADMIN RESET CHƯƠNG TRÌNH — bypass RLS để xoá toàn bộ dữ liệu chương trình
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run
--
-- Lý do cần file này:
--   Bảng edux_profiles có RLS policy "Users can update own profile"
--   USING (auth.uid() = id) — chỉ owner tự sửa hồ sơ mình. Khi admin
--   gọi UPDATE từ anon key, RLS chặn TẤT CẢ row mà không trả error
--   (Supabase silent: error=null, data=[]) → trang admin tưởng OK nhưng
--   XP/khung/rank vẫn còn nguyên trên BXH.
--   Bảng edux_game_history KHÔNG có DELETE policy → mặc định block.
--
-- File này tạo 1 RPC function với SECURITY DEFINER (chạy với quyền owner
-- = bypass RLS), trang admin sẽ gọi qua supabase.rpc(...) thay vì
-- update/delete trực tiếp.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- PHẦN A0 — Bảng meta để client tự dọn localStorage khi server reset
-- (Không có nó: máy của admin/user vẫn upsert XP cũ từ localStorage lên
-- server → reset bị "đảo ngược" ngay khi user load app.)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists edux_program_meta (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);
alter table edux_program_meta enable row level security;
drop policy if exists "program_meta_read_all" on edux_program_meta;
create policy "program_meta_read_all" on edux_program_meta
  for select to anon, authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────
-- PHẦN A — Tạo RPC để trang admin gọi (chạy 1 lần là xong)
-- ─────────────────────────────────────────────────────────────────────
create or replace function edux_admin_reset_program()
returns jsonb
language plpgsql
security definer            -- chạy với quyền owner (postgres) → bypass RLS
set search_path = public    -- bắt buộc khi dùng security definer
as $$
declare
  v_profiles_count integer;
  v_games_count    integer;
  v_spins_count    integer;
begin
  -- Đếm trước để báo cáo
  select count(*) into v_profiles_count from edux_profiles;
  select count(*) into v_games_count    from edux_game_history;

  -- Bảng spin có thể chưa tồn tại nếu chưa chạy lucky_spin.sql
  begin
    select count(*) into v_spins_count from edux_spin_history;
  exception when undefined_table then
    v_spins_count := 0;
  end;

  -- Xoá lịch sử trận đấu
  delete from edux_game_history;

  -- Xoá lịch sử vòng quay (kèm quà tặng) — bỏ qua nếu bảng chưa có
  begin
    delete from edux_spin_history;
  exception when undefined_table then
    null;
  end;

  -- Reset hồ sơ — GIỮ id/name/avatar/grade, đặt mọi tiến trình về 0
  -- Lưu ý: cột `unlocked_frames` trên prod là TEXT[] (mảng Postgres),
  -- không phải jsonb như doc/supabase-schema.sql. Phải dùng '{}'::text[].
  update edux_profiles set
    xp               = 0,
    weekly_xp        = 0,
    level            = 'Tập sự',
    total_games      = 0,
    best_streak      = 0,
    topic_stats      = '{}'::jsonb,
    grade_xp         = '{}'::jsonb,
    unlocked_frames  = '{}'::text[],
    equipped_frame   = null;

  -- Bump watermark: mọi client load app sẽ thấy giá trị này khác với
  -- arena_x_program_reset_seen của họ → tự wipe localStorage + reload.
  insert into edux_program_meta (key, value, updated_at)
  values ('last_reset_at', extract(epoch from now())::bigint::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object(
    'ok',                    true,
    'profiles_reset',        v_profiles_count,
    'game_history_deleted',  v_games_count,
    'spin_history_deleted',  v_spins_count,
    'reset_at',              now()
  );
end;
$$;

-- Cho phép cả anon lẫn authenticated gọi (vẫn an toàn vì trang admin
-- đã chặn 2 lớp: VITE_SPIN_ADMIN_IDS + password). Nếu muốn siết chặt,
-- thay 'anon' bằng role riêng và cấp role đó cho admin.
grant execute on function edux_admin_reset_program() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- PHẦN B — Chạy NGAY 1 LẦN để dọn data đang còn sót do RLS block trước đó
-- (UNCOMMENT nếu cần. Có thể chạy lại bất cứ lúc nào.)
-- ─────────────────────────────────────────────────────────────────────
-- select edux_admin_reset_program();
