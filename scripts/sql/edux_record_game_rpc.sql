-- =====================================================================
-- Ghi trận đấu + cộng XP ATOMIC ở server, thay cho cách cũ:
--   client tự tính `newXp = user.xp + delta` rồi upsert giá trị tuyệt đối.
-- Lý do đổi: cách cũ gây 2 lỗi thấy trong thực tế (dữ liệu prod 2026-07-02):
--   1) Race condition: 2 trận kết thúc gần nhau, request sau đọc user.xp
--      từ state cũ (chưa nhận xp của trận trước) rồi ghi đè xuống DB →
--      profile.xp lệch khỏi tổng thật trong edux_game_history.
--   2) Cap 7 trận solo/tuần chỉ được chặn ở client (đếm từ gameHistory
--      local) → mở nhiều tab/thiết bị thì mỗi tab tự đếm riêng, cap bị
--      vượt qua hoàn toàn (ví dụ thực tế: 1 user chơi 19 trận solo/ngày).
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- =====================================================================

-- 1) Cột grade_xp, topic_stats, unlocked_frames, equipped_frame đã có sẵn
--    (được thêm bởi các migration trước, xem services/supabase.ts toSnakeCase).
--    RPC dưới đây giả định các cột này đã tồn tại trên edux_profiles.

create or replace function edux_record_game(
  p_user_id       text,
  p_game_id       text,
  p_played_at     timestamptz,
  p_grade         integer,
  p_topics        text[],
  p_difficulty    text,
  p_correct_count integer,
  p_total_questions integer,
  p_raw_xp        integer,        -- XP client tính cho trận này TRƯỚC khi áp cap
  p_max_streak    integer,
  p_time_spent    integer,
  p_score         integer,
  p_mode          text default 'solo',
  p_room_code     text default null,
  p_topic_correct jsonb default '{}'::jsonb,  -- { "My Friends": 3, ... } số câu đúng theo topic
  p_topic_total   jsonb default '{}'::jsonb   -- { "My Friends": 5, ... } tổng số câu theo topic
)
returns table (
  effective_xp integer,
  capped       boolean,
  new_xp       integer,
  new_weekly_xp integer,
  new_total_games integer,
  new_best_streak integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz;
  v_week_end   timestamptz;
  v_solo_count_before integer := 0;
  v_effective_xp integer;
  v_capped boolean := false;
  v_topic_stats jsonb;
  v_grade_xp jsonb;
  v_key text;
  v_inserted_count integer := 0;
begin
  -- Tuần lịch VN hiện tại (Mon 00:00 -> Mon 00:00 tuần sau), tính theo giờ VN (+07:00)
  -- Cùng công thức với utils/programRules.ts getCalendarWeekRangeVn.
  v_week_start := date_trunc('week', (p_played_at at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh';
  v_week_end   := v_week_start + interval '7 days';

  v_effective_xp := greatest(0, coalesce(p_raw_xp, 0));

  if p_mode = 'solo' or p_mode is null then
    select count(*) into v_solo_count_before
    from edux_game_history h
    where h.user_id = p_user_id
      and coalesce(h.mode, 'solo') = 'solo'
      and h.played_at >= v_week_start
      and h.played_at <  v_week_end;

    if v_solo_count_before >= 7 then
      v_effective_xp := 0;
      v_capped := true;
    end if;
  end if;

  insert into edux_game_history (
    id, user_id, played_at, grade, topics, difficulty,
    correct_count, total_questions, xp_earned, max_streak,
    time_spent, score, mode, room_code
  ) values (
    p_game_id, p_user_id, p_played_at, p_grade, p_topics, p_difficulty,
    p_correct_count, p_total_questions, v_effective_xp, p_max_streak,
    p_time_spent, p_score, coalesce(p_mode, 'solo'), p_room_code
  )
  on conflict (id) do nothing;
  get diagnostics v_inserted_count = row_count;

  -- Trận đã tồn tại (retry/duplicate p_game_id) → KHÔNG cộng thêm xp/total_games/
  -- topic_stats lần nữa. Trả lại trạng thái hiện tại của profile để client vẫn
  -- nhận được số liệu đúng (không lỗi), chỉ là không cộng dồn thêm.
  if v_inserted_count = 0 then
    select xp, weekly_xp, total_games, best_streak
    into new_xp, new_weekly_xp, new_total_games, new_best_streak
    from edux_profiles where id = p_user_id;
    effective_xp := 0;
    capped := v_capped;
    return next;
    return;
  end if;

  -- Cộng dồn topic_stats atomic (JSONB merge thủ công vì Postgres không có "+=" cho jsonb)
  select coalesce(topic_stats, '{}'::jsonb), coalesce(grade_xp, '{}'::jsonb)
  into v_topic_stats, v_grade_xp
  from edux_profiles where id = p_user_id for update;

  for v_key in select jsonb_object_keys(p_topic_total) loop
    v_topic_stats := jsonb_set(
      v_topic_stats, array[v_key],
      jsonb_build_object(
        'correct', coalesce((v_topic_stats #>> array[v_key,'correct'])::int, 0) + coalesce((p_topic_correct ->> v_key)::int, 0),
        'total',   coalesce((v_topic_stats #>> array[v_key,'total'])::int, 0) + coalesce((p_topic_total ->> v_key)::int, 0)
      ),
      true
    );
  end loop;

  v_grade_xp := jsonb_set(
    v_grade_xp, array[p_grade::text],
    to_jsonb(coalesce((v_grade_xp ->> p_grade::text)::int, 0) + v_effective_xp),
    true
  );

  update edux_profiles set
    xp = xp + v_effective_xp,
    weekly_xp = weekly_xp + v_effective_xp,
    total_games = total_games + 1,
    best_streak = greatest(best_streak, coalesce(p_max_streak, 0)),
    grade = p_grade,
    topic_stats = v_topic_stats,
    grade_xp = v_grade_xp
  where id = p_user_id
  returning xp, weekly_xp, total_games, best_streak
  into new_xp, new_weekly_xp, new_total_games, new_best_streak;

  effective_xp := v_effective_xp;
  capped := v_capped;
  return next;
end;
$$;

grant execute on function edux_record_game(
  text, text, timestamptz, integer, text[], text, integer, integer, integer,
  integer, integer, integer, text, text, jsonb, jsonb
) to anon, authenticated;

-- =====================================================================
-- Vòng quay may mắn: ghi edux_spin_history + cộng XP thưởng ATOMIC trong
-- CÙNG 1 transaction. Trước đây client gọi 2 request riêng
-- (saveSpinResult() rồi upsertUserProfile()/awardBonusXp()) — nếu 1 trong 2
-- request lỗi giữa chừng (mất mạng, tab đóng), edux_spin_history và
-- edux_profiles.xp lệch nhau: có lượt quay trong lịch sử nhưng XP không
-- được cộng, hoặc XP được cộng nhưng không có lượt quay để đối chiếu.
-- edux_weekly_xp_totals/getWeeklyXpTotals cộng bonus TỪ edux_spin_history
-- (không phải từ profile.weekly_xp) nên lệch này khiến BXH tuần thiếu XP
-- spin mới trong khi XP cá nhân trên profile đã đúng — không nhất quán.
-- =====================================================================
create or replace function edux_award_spin(
  p_user_id     text,
  p_user_name   text,
  p_prize_id    text,
  p_prize_label text,
  p_xp_bonus    integer,
  p_week        integer
)
returns table (spin_id uuid, new_xp integer, new_weekly_xp integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus integer := greatest(0, coalesce(p_xp_bonus, 0));
  v_spin_id uuid;
begin
  insert into edux_spin_history (user_id, user_name, prize_id, prize_label, xp_bonus, week)
  values (p_user_id, p_user_name, p_prize_id, p_prize_label, v_bonus, p_week)
  returning id into v_spin_id;

  if v_bonus > 0 then
    -- Cộng thưởng vào grade_xp[khối hiện tại] để khớp xp tổng (xem cùng fix
    -- ở edux_spin_wheel trong fix_spin_wheel_quota_luot.sql).
    update edux_profiles
    set xp = xp + v_bonus,
        weekly_xp = weekly_xp + v_bonus,
        grade_xp = jsonb_set(
          coalesce(grade_xp, '{}'::jsonb), array[grade::text],
          to_jsonb(coalesce((grade_xp ->> grade::text)::int, 0) + v_bonus),
          true
        )
    where id = p_user_id
    returning xp, weekly_xp into new_xp, new_weekly_xp;
  else
    select xp, weekly_xp into new_xp, new_weekly_xp
    from edux_profiles where id = p_user_id;
  end if;

  spin_id := v_spin_id;
  return next;
end;
$$;

grant execute on function edux_award_spin(text, text, text, text, integer, integer) to anon, authenticated;
