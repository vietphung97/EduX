-- Danh sách id học sinh đã tham gia và có XP > 0 trong Tuần 1
-- Tuần 1: 2026-07-01 00:00 (VN) -> 2026-07-06 00:00 (VN)
select user_id as id, weekly_xp as xp
from edux_weekly_xp_totals(
  '2026-07-01T00:00:00+07:00'::timestamptz,
  '2026-07-06T00:00:00+07:00'::timestamptz
)
where weekly_xp > 0
  and user_id not like 'temp_%'
order by weekly_xp desc;
