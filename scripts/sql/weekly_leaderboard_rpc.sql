-- =====================================================================
-- Tối ưu BXH tuần: aggregate XP server-side thay vì kéo raw rows về client
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file này → Run
-- Client (services/supabase.ts) tự động dùng RPC này nếu tồn tại,
-- chưa chạy SQL thì client fallback về cách cũ (vẫn đúng, chỉ chậm hơn).
--
-- Quy định 3.1 (Đấu hạng / solo): mỗi tuần chỉ tính XP cho TỐI ĐA 7 lượt
-- đầu tiên (theo thứ tự thời gian). Các lượt sau vẫn lưu vào history để
-- thống kê & cộng vào XP tổng, NHƯNG không cộng vào XP tuần.
-- Quy định 3.2 (Thách đấu / multiplayer): không cap số trận cho XP tuần
-- ở RPC này — số lượt được chơi đã bị giới hạn 5 trận/buổi ở client lobby.
-- =====================================================================

-- 1) Index theo played_at để lọc theo tuần nhanh (quan trọng nhất)
create index if not exists idx_edux_game_history_played_at
  on edux_game_history (played_at);

-- 2) Function tính tổng XP tuần theo quy định:
--    - Trận solo: chỉ tính 7 trận có played_at sớm nhất trong khoảng tuần.
--    - Trận multiplayer: tính tất cả.
create or replace function edux_weekly_xp_totals(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (user_id text, weekly_xp bigint)
language sql
stable
as $$
  with ranked as (
    select
      h.user_id,
      h.xp_earned,
      coalesce(h.mode, 'solo') as mode,
      row_number() over (
        partition by h.user_id, coalesce(h.mode, 'solo')
        order by h.played_at asc
      ) as rn
    from edux_game_history h
    where h.played_at >= p_start
      and h.played_at <  p_end
  )
  select
    r.user_id,
    sum(round(r.xp_earned))::bigint as weekly_xp
  from ranked r
  where
    (r.mode = 'solo' and r.rn <= 7)
    or (r.mode <> 'solo')
  group by r.user_id
  order by weekly_xp desc;
$$;

-- 3) Cho phép anon/authenticated gọi function (Supabase mặc định thường đã có,
--    thêm cho chắc)
grant execute on function edux_weekly_xp_totals(timestamptz, timestamptz)
  to anon, authenticated;
