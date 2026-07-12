-- =====================================================================
-- RPC TỔNG HỢP SỐ LIỆU — CHỐNG LỖI CAP 1000 DÒNG CỦA POSTGREST
-- =====================================================================
-- Bối cảnh: PostgREST (client Supabase) mặc định chỉ trả tối đa 1000 dòng
-- mỗi query. Trước đây nhiều hàm thống kê ở services/supabase.ts kéo TOÀN BỘ
-- dòng về client rồi mới SUM/COUNT/GROUP BY bằng JS → khi dữ liệu vượt 1000
-- dòng, kết quả bị cắt cụt ÂM THẦM (báo cáo tuần hiển thị đúng "1.0k" là dấu
-- hiệu điển hình của việc bị chặn ở đúng 1000).
--
-- Cách sửa triệt để: đẩy phần tổng hợp xuống Postgres. SUM/COUNT/GROUP BY chạy
-- trên toàn bảng, KHÔNG bị giới hạn 1000 dòng, và nhanh hơn nhiều so với
-- truyền hàng chục nghìn dòng qua mạng.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file → Run.
-- An toàn chạy lại nhiều lần (create or replace).
-- =====================================================================


-- =====================================================================
-- 1) edux_platform_stats — thay getPlatformStats()
--    Toàn bộ số liệu dashboard "Thống kê hệ thống" trong 1 round-trip.
-- =====================================================================
create or replace function edux_platform_stats(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with games as (
    select user_id, grade, correct_count, total_questions, xp_earned,
           coalesce(mode, 'solo') as mode
    from edux_game_history
    where played_at >= p_from and played_at <= p_to
  )
  select jsonb_build_object(
    -- Tổng tài khoản (mọi thời điểm) và người chơi mới trong kỳ
    'totalPlayers', (select count(*) from edux_profiles),
    'newPlayers',   (select count(*) from edux_profiles
                       where created_at >= p_from and created_at <= p_to),
    -- Người chơi active = số user_id phân biệt có chơi trong kỳ
    'activePlayers', (select count(distinct user_id) from games),
    'totalSoloPlays',        (select count(*) from games where mode = 'solo'),
    'totalMultiplayerPlays', (select count(*) from games where mode = 'multiplayer'),
    'totalXpAwarded',        (select coalesce(sum(xp_earned), 0) from games),
    'avgAccuracy', (
      select case when coalesce(sum(total_questions), 0) > 0
        then round(sum(correct_count)::numeric / sum(total_questions) * 100)::int
        else 0 end
      from games
    ),
    -- { "6": 123, "7": 45, ... } — số lượt chơi theo khối lớp
    'playsByGrade', coalesce(
      (select jsonb_object_agg(grade::text, cnt)
         from (select grade, count(*) as cnt from games group by grade) g),
      '{}'::jsonb
    )
  );
$$;

grant execute on function edux_platform_stats(timestamptz, timestamptz) to anon, authenticated;


-- =====================================================================
-- 2) edux_user_history_stats — thay getUserHistoryStats()
--    Tổng hợp toàn bộ lịch sử đấu của 1 user + danh sách game_ids để client
--    lọc ra trận chỉ có ở local (chưa sync lên server). game_ids nhẹ (chỉ id).
-- =====================================================================
create or replace function edux_user_history_stats(p_user_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totalGames',     (select count(*) from edux_game_history where user_id = p_user_id),
    'totalXp',        (select coalesce(sum(round(xp_earned)), 0) from edux_game_history where user_id = p_user_id),
    'totalCorrect',   (select coalesce(sum(round(correct_count)), 0) from edux_game_history where user_id = p_user_id),
    'totalQuestions', (select coalesce(sum(total_questions), 0) from edux_game_history where user_id = p_user_id),
    'bestStreak',     (select coalesce(max(max_streak), 0) from edux_game_history where user_id = p_user_id),
    'totalTimeSpent', (select coalesce(sum(time_spent), 0) from edux_game_history where user_id = p_user_id),
    -- XP thưởng từ vòng quay (bảng có thể chưa tồn tại — to_regclass tránh lỗi)
    'spinXp', case when to_regclass('public.edux_spin_history') is null then 0
      else coalesce((select sum(round(xp_bonus)) from edux_spin_history where user_id = p_user_id), 0) end,
    'gameIds', coalesce(
      (select jsonb_agg(id) from edux_game_history where user_id = p_user_id),
      '[]'::jsonb
    )
  );
$$;

grant execute on function edux_user_history_stats(text) to anon, authenticated;


-- =====================================================================
-- 3) edux_recalc_all_xp — thay recalculateAllUsersXp()
--    Tính lại XP cho TẤT CẢ user từ game history, ngay trên server:
--      - Công thức: correctXp = correct * xpPerQ(difficulty)
--                   + streakBonus (max_streak*5) + rankBonus cũ (giữ nguyên)
--      - Cap chặt solo 7 trận / TUẦN LỊCH (Mon-Sun VN) — trận thứ 8+ = 0 XP.
--      - weekly_xp = XP các trận + spin trong [weekStart, weekEnd).
--      - Ghi lại (fix) từng dòng game có xp_earned/correct_count sai.
--    Chuyển cả vòng lặp per-user xuống DB → tránh cả 2 rủi ro cap 1000:
--    (>1000 profiles bị bỏ sót, và >1000 games/user bị cắt).
-- =====================================================================
create or replace function edux_recalc_all_xp(
  p_program_start_ms bigint,
  p_current_week     integer  -- null nếu ngoài chương trình → weekly_xp = 0
)
returns table (total integer, fixed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  ms_per_day     bigint := 24 * 60 * 60 * 1000;
  ms_per_week    bigint := 7 * ms_per_day;
  -- 1970-01-05T00:00:00+07:00 (một Thứ Hai cố định) tính bằng ms epoch UTC.
  -- Trùng epochMonVnMs ở services/supabase.ts để cap solo theo tuần lịch VN.
  epoch_mon_vn_ms bigint := (extract(epoch from timestamptz '1970-01-05 00:00:00+07') * 1000)::bigint;
  -- Tuần chương trình LUÔN bắt đầu vào Thứ Hai (giống getCurrentProgramWeek ở
  -- constants.ts) — KHÔNG dùng p_program_start_ms + (week-1)*7ngày vì Tuần 1
  -- ngắn (01/07/2026 là Thứ Tư → Tuần 1 chỉ 5 ngày: Wed→Sun).
  -- week1_end_ms = Thứ Hai 00:00 VN ngay sau p_program_start_ms.
  program_start_dow integer := extract(dow from (to_timestamp(p_program_start_ms / 1000.0) at time zone 'Asia/Ho_Chi_Minh'))::integer; -- Sun=0..Sat=6
  days_until_next_monday integer := case when program_start_dow = 1 then 7
                                         else coalesce(nullif((8 - program_start_dow) % 7, 0), 7) end;
  week1_end_ms   bigint := p_program_start_ms + days_until_next_monday * ms_per_day;
  week_start_ms  bigint := case when p_current_week is null then 0
                    when p_current_week <= 1 then p_program_start_ms
                    else week1_end_ms + (p_current_week - 2) * ms_per_week end;
  week_end_ms    bigint := case when p_current_week is null then 0
                    when p_current_week <= 1 then week1_end_ms
                    else week1_end_ms + (p_current_week - 2) * ms_per_week + ms_per_week end;
  v_spin_exists  boolean := to_regclass('public.edux_spin_history') is not null;
  r_profile      record;
  r_game         record;
  v_xp_per_q     integer;
  v_safe_correct integer;
  v_correct_xp   integer;
  v_streak_bonus integer;
  v_rank_bonus   integer;
  v_raw_xp       integer;
  v_effective_xp integer;
  v_played_ms    bigint;
  v_week_key     bigint;
  v_total_recalc integer;
  v_weekly_recalc integer;
  v_solo_count   jsonb;      -- { "<weekKey>": count } đếm solo đã tính XP theo tuần
  v_wk           text;
  v_cur          integer;
  v_game_fixed   boolean;   -- có ít nhất 1 game bị fix trong profile này
  v_real_total_games integer;
  v_grade_xp_recalc jsonb;
  v_spin_bonus_total integer;
  v_level_recalc text;
begin
  total := 0;
  fixed := 0;

  for r_profile in select id, xp, weekly_xp, total_games, grade, grade_xp, level from edux_profiles loop
    total := total + 1;
    v_total_recalc := 0;
    v_weekly_recalc := 0;
    v_solo_count := '{}'::jsonb;
    v_game_fixed := false;
    -- total_games PHẢI khớp số dòng thật trong edux_game_history — không tự
    -- suy ra được từ vòng lặp cộng dồn XP bên dưới (đếm riêng ở đây), vì
    -- edux_record_game có thể đã cộng total_games+1 dù insert bị "on conflict
    -- do nothing" bỏ qua (bug cũ, đã fix ở edux_record_game_rpc.sql) → một số
    -- profile có total_games > số game thật, cần reconcile lại từ nguồn thật.
    v_real_total_games := (select count(*) from edux_game_history where user_id = r_profile.id);

    -- grade_xp tính lại thuần từ game history (mỗi trận cộng vào đúng grade
    -- lúc chơi trận đó — khớp edux_recalc_grade_xp), sau đó cộng thêm thưởng
    -- vòng quay vào grade hiện tại của user (xem edux_spin_wheel).
    select coalesce(jsonb_object_agg(grade::text, total_xp), '{}'::jsonb) into v_grade_xp_recalc
    from (
      select grade, sum(coalesce(xp_earned, 0)) as total_xp
      from edux_game_history where user_id = r_profile.id group by grade
    ) g;

    -- Duyệt game theo thứ tự thời gian để cap solo 7 trận/tuần đúng thứ tự.
    for r_game in
      select id, difficulty, correct_count, total_questions, xp_earned,
             max_streak, played_at, coalesce(mode, 'solo') as mode
      from edux_game_history
      where user_id = r_profile.id
      order by played_at asc
    loop
      v_xp_per_q := case r_game.difficulty
        when 'Dễ' then 10 when 'Trung bình' then 12
        when 'Khó' then 15 when 'Chuyên gia' then 20 else 10 end;
      v_safe_correct := round(coalesce(r_game.correct_count, 0));
      v_correct_xp   := v_safe_correct * v_xp_per_q;
      v_streak_bonus := coalesce(r_game.max_streak, 0) * 5;
      -- rankBonus cũ = phần dư của xp_earned so với correct+streak (giữ nguyên bonus hạng cũ)
      v_rank_bonus   := greatest(0, round(coalesce(r_game.xp_earned, 0)) - v_correct_xp - v_streak_bonus);
      v_raw_xp       := v_correct_xp + v_streak_bonus + v_rank_bonus;
      v_effective_xp := v_raw_xp;

      if r_game.mode = 'solo' and r_game.played_at is not null then
        v_played_ms := (extract(epoch from r_game.played_at) * 1000)::bigint;
        v_week_key  := floor((v_played_ms - epoch_mon_vn_ms) / ms_per_week);
        v_wk        := v_week_key::text;
        v_cur       := coalesce((v_solo_count ->> v_wk)::int, 0);
        if v_cur >= 7 then
          v_effective_xp := 0;  -- vượt cap → trận luyện tập, không tính XP
        else
          v_solo_count := jsonb_set(v_solo_count, array[v_wk], to_jsonb(v_cur + 1), true);
        end if;
      end if;

      v_total_recalc := v_total_recalc + v_effective_xp;

      if p_current_week is not null and r_game.played_at is not null then
        v_played_ms := (extract(epoch from r_game.played_at) * 1000)::bigint;
        if v_played_ms >= week_start_ms and v_played_ms < week_end_ms then
          v_weekly_recalc := v_weekly_recalc + v_effective_xp;
        end if;
      end if;

      -- Fix dòng game nếu correct_count/xp_earned trong DB lệch giá trị đã cap
      if r_game.correct_count <> v_safe_correct
         or round(coalesce(r_game.xp_earned, 0)) <> v_effective_xp then
        -- fixed đếm theo profile (bên dưới), không đếm theo từng game
        update edux_game_history
        set correct_count = v_safe_correct, xp_earned = v_effective_xp
        where id = r_game.id;
        v_game_fixed := true;
      end if;
    end loop;

    -- Cộng XP thưởng vòng quay vào tổng + weekly + grade_xp[khối hiện tại]
    -- (đúng định nghĩa weekly = game + spin; grade_xp phải khớp xp tổng để
    -- BXH theo khối và BXH toàn bộ nhất quán — xem edux_spin_wheel).
    v_spin_bonus_total := 0;
    if v_spin_exists then
      v_spin_bonus_total := coalesce(
        (select sum(round(xp_bonus)) from edux_spin_history
          where user_id = r_profile.id and coalesce(xp_bonus, 0) > 0), 0);
      v_total_recalc := v_total_recalc + v_spin_bonus_total;
      if v_spin_bonus_total > 0 then
        v_grade_xp_recalc := jsonb_set(
          v_grade_xp_recalc, array[r_profile.grade::text],
          to_jsonb(coalesce((v_grade_xp_recalc ->> r_profile.grade::text)::int, 0) + v_spin_bonus_total),
          true
        );
      end if;
      if p_current_week is not null then
        v_weekly_recalc := v_weekly_recalc + coalesce(
          (select sum(round(xp_bonus)) from edux_spin_history
            where user_id = r_profile.id and coalesce(xp_bonus, 0) > 0
              and (extract(epoch from created_at) * 1000)::bigint >= week_start_ms
              and (extract(epoch from created_at) * 1000)::bigint <  week_end_ms), 0);
      end if;
    end if;

    -- level PHẢI khớp xp thật — cột level KHÔNG tự cập nhật khi xp tăng qua
    -- edux_record_game/edux_spin_wheel (2 RPC đó không đụng cột level), nên
    -- level chỉ đúng lúc tạo profile (xp=0) rồi "đóng băng" mãi mãi. Bug thực
    -- tế 2026-07-06: user xp=5307 nhưng level='Tinh Anh' (đáng lẽ 'Bậc thầy').
    -- Thang bậc khớp LEVEL_CONFIG ở constants.ts.
    v_level_recalc := case
      when v_total_recalc <= 500 then 'Tập sự'
      when v_total_recalc <= 2000 then 'Chiến binh'
      when v_total_recalc <= 10000 then 'Bậc thầy'
      when v_total_recalc <= 30000 then 'Tinh Anh'
      else 'Huyền thoại'
    end;

    if round(r_profile.xp) <> v_total_recalc
       or round(r_profile.weekly_xp) <> v_weekly_recalc
       or r_profile.total_games <> v_real_total_games
       or coalesce(r_profile.grade_xp, '{}'::jsonb) <> v_grade_xp_recalc
       or r_profile.level is distinct from v_level_recalc then
      update edux_profiles
      set xp = v_total_recalc, weekly_xp = v_weekly_recalc, total_games = v_real_total_games,
          grade_xp = v_grade_xp_recalc, level = v_level_recalc
      where id = r_profile.id;
    end if;

    -- Đếm "fixed" theo profile: lệch XP/weekly/total_games/grade_xp/level HOẶC có game bị fix (giống JS gốc)
    if round(r_profile.xp) <> v_total_recalc
       or round(r_profile.weekly_xp) <> v_weekly_recalc
       or r_profile.total_games <> v_real_total_games
       or coalesce(r_profile.grade_xp, '{}'::jsonb) <> v_grade_xp_recalc
       or r_profile.level is distinct from v_level_recalc
       or v_game_fixed then
      fixed := fixed + 1;
    end if;
  end loop;

  return next;
end;
$$;

grant execute on function edux_recalc_all_xp(bigint, integer) to anon, authenticated;


-- =====================================================================
-- 4) edux_recalc_grade_xp — ĐÃ GỠ BỎ (2026-07-06).
--    Lý do: hàm này chỉ tính lại grade_xp mà KHÔNG tính lại xp, nên có thể
--    chạy tách rời khỏi edux_recalc_all_xp (là hàm tính lại CẢ xp lẫn
--    grade_xp cùng lúc) → 2 field lệch nhau độc lập. Bug thực tế phát hiện
--    2026-07-06: 1 user có grade_xp['6']=7033 trong khi xp thật (khớp đúng
--    tổng edux_game_history) chỉ là 1860 — do trước đó ai đó/console đã gọi
--    riêng hàm này (qua migrateAllUsersGradeXp()/window.migrateGradeXp ở
--    App.tsx, đã xoá) mà không chạy kèm recalc xp.
--    Từ nay CHỈ dùng edux_recalc_all_xp (mục 3 ở trên) — luôn ghi xp +
--    weekly_xp + total_games + grade_xp ATOMIC trong cùng 1 update, không
--    thể lệch nhau nữa.
-- =====================================================================
drop function if exists edux_recalc_grade_xp(text);
