-- =====================================================================
-- Tối ưu BXH tuần: aggregate XP server-side thay vì kéo raw rows về client
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file này → Run
-- Client (services/supabase.ts) tự động dùng RPC này nếu tồn tại,
-- chưa chạy SQL thì client fallback về cách cũ (vẫn đúng, chỉ chậm hơn).
--
-- Quy định 3.1 ESEA 2026 — cap chặt mỗi tuần lịch (Mon-Sun VN):
--   • SOLO chỉ tính 7 trận đầu tiên TRONG MỖI TUẦN LỊCH. Trận thứ 8+ vẫn
--     lưu vào history NHƯNG xp_earned = 0 (client + reconcile đã zero hoá).
--   • Cap hoạt động bất kể trong/ngoài chương trình, theo tuần lịch (Mon-Sun VN).
--   • MULTIPLAYER không cap số trận cho XP — số lượt đã bị giới hạn 5 trận/buổi ở client.
-- Vì client + reconcile đã zero hoá xp_earned cho trận solo 8+, RPC chỉ cần
-- SUM(xp_earned) trong range tuần là đủ. Vẫn giữ thêm cap row_number để
-- "phòng thủ tầng 2" trong trường hợp 1 row chưa kịp reconcile.
-- =====================================================================

-- 1) Index theo played_at để lọc theo tuần nhanh (quan trọng nhất)
create index if not exists idx_edux_game_history_played_at
  on edux_game_history (played_at);

-- 2) Function tính tổng XP tuần theo quy định:
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
