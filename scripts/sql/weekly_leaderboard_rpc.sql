-- =====================================================================
-- Tối ưu BXH tuần: aggregate XP server-side thay vì kéo raw rows về client
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file này → Run
-- Client (services/supabase.ts) tự động dùng RPC này nếu tồn tại,
-- chưa chạy SQL thì client fallback về cách cũ (vẫn đúng, chỉ chậm hơn).
-- =====================================================================

-- 1) Index theo played_at để lọc theo tuần nhanh (quan trọng nhất)
create index if not exists idx_edux_game_history_played_at
  on edux_game_history (played_at);

-- 2) Function tính tổng XP theo user trong khoảng thời gian
--    Mỗi user active 1 dòng (đã GROUP BY + sort sẵn) — payload nhỏ
--    (1000 người chơi ≈ 30KB) và đủ dữ liệu để tính hạng chính xác
create or replace function edux_weekly_xp_totals(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (user_id text, weekly_xp bigint)
language sql
stable
as $$
  select
    h.user_id,
    sum(round(h.xp_earned))::bigint as weekly_xp
  from edux_game_history h
  where h.played_at >= p_start
    and h.played_at <  p_end
  group by h.user_id
  order by weekly_xp desc;
$$;

-- 3) Cho phép anon/authenticated gọi function (Supabase mặc định thường đã có,
--    thêm cho chắc)
grant execute on function edux_weekly_xp_totals(timestamptz, timestamptz)
  to anon, authenticated;
