-- =====================================================================
-- FIX: quota SỐ LƯỢT QUAY / user chưa được enforce ở server.
--
-- NGUYÊN NHÂN (thấy thực tế 2026-07-02): 1 học sinh quay được 89 lượt dù
-- hạn mức tuần chỉ là 7 (1 free + 5 trận multiplayer thắng + 1 frame bonus).
-- KHÔNG phải bypass đa-tab (khoảng cách các lượt đều ≥4.5s = đúng thời gian
-- animation quay). Nguyên nhân: hạn mức lượt (spinsLeft) CHỈ tính ở client
-- dựa trên user.spinsUsed — mà spinsUsed CHỈ lưu localStorage (không có cột
-- trên Supabase). Mỗi lần reload trang / qua ngày mới, spinsUsed reset về 0
-- → quota lại đầy → F5 là quay thêm được, không cần cố ý gian lận.
--
-- FIX: enforce quota lượt NGAY TRONG RPC edux_spin_wheel. Server tự tính:
--   allowed = 1 (free)
--           + số trận multiplayer thắng (score > 150) trong TUẦN LỊCH này
--           + frame bonus (1 nếu đã mở đủ 3 item khung của tuần hiện tại)
-- rồi đếm số lượt ĐÃ quay trong tuần từ edux_spin_history (nguồn đáng tin,
-- không phải spinsUsed local). Lượt 'extra' (thêm lượt) KHÔNG tính là đã
-- tiêu 1 lượt → trừ khỏi số đã quay để bù lại đúng như luật client cũ.
-- Nếu đã hết lượt → trả về prize_id='no_spins' và KHÔNG ghi history/không
-- cộng XP.
--
-- Quota GIẢI THƯỞNG (thẻ) vẫn giữ nguyên như bản trước.
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- =====================================================================

-- Bản trước của edux_spin_wheel KHÔNG có cột spins_left trong return table.
-- Postgres không cho "create or replace" đổi kiểu trả về → phải DROP trước.
-- (nếu hàm chưa tồn tại thì "if exists" bỏ qua, không lỗi)
drop function if exists edux_spin_wheel(text, text, integer);

create or replace function edux_spin_wheel(
  p_user_id   text,
  p_user_name text,
  p_week      integer
)
returns table (
  prize_id      text,
  prize_label   text,
  xp_bonus      integer,
  spin_id       uuid,
  new_xp        integer,
  new_weekly_xp integer,
  spins_left    integer   -- số lượt còn lại SAU lượt này (để client hiển thị); -1 nếu bị từ chối
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_total_weight numeric := 0;
  v_roll numeric;
  v_acc numeric := 0;
  v_chosen text;
  v_chosen_label text;
  v_chosen_xp integer;
  v_bonus integer;
  v_spin_id uuid;
  v_new_xp integer;
  v_new_weekly_xp integer;
  -- Quota lượt
  v_week_start timestamptz;
  v_week_end   timestamptz;
  v_mp_wins integer := 0;
  v_frame_bonus integer := 0;
  v_allowed integer := 0;
  v_used integer := 0;
  v_unlocked text[];          -- cột unlocked_frames trên prod là TEXT[] (mảng PG), không phải jsonb
  v_week_frame_items text[];
  v_labels jsonb := '{
    "card10":  "Thẻ điện thoại 10.000đ",
    "card20":  "Thẻ điện thoại 20.000đ",
    "card50":  "Thẻ điện thoại 50.000đ",
    "card100": "Thẻ điện thoại 100.000đ",
    "xp50":    "+50 XP",
    "xp100":   "+100 XP",
    "extra":   "Bạn có thêm 1 lượt quay!",
    "miss1":   "Hẹn gặp bạn lần sau!",
    "miss2":   "Oops, chúc bạn may mắn lần sau!"
  }'::jsonb;
  v_xp_map jsonb := '{"xp50": 50, "xp100": 100}'::jsonb;
  -- 3 item của mỗi khung tuần (đồng bộ WEEKLY_FRAMES trong constants.ts).
  -- Dùng để tính frame bonus: mở đủ cả 3 item của khung tuần hiện tại → +1 lượt.
  v_frame_map jsonb := '{
    "1": ["w1_a","w1_b","w1_c"], "2": ["w2_a","w2_b","w2_c"],
    "3": ["w3_a","w3_b","w3_c"], "4": ["w4_a","w4_b","w4_c"],
    "5": ["w5_a","w5_b","w5_c"], "6": ["w6_a","w6_b","w6_c"],
    "7": ["w7_a","w7_b","w7_c"], "8": ["w8_a","w8_b","w8_c"]
  }'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('edux_spin_wheel'));

  -- ── (0) KIỂM TRA QUOTA LƯỢT QUAY CỦA USER (server-authoritative) ──────────
  -- Tuần lịch VN hiện tại (Mon 00:00 → Mon 00:00), cùng công thức với
  -- utils/programRules.ts getCalendarWeekRangeVn và edux_record_game.
  v_week_start := date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh';
  v_week_end   := v_week_start + interval '7 days';

  -- +1 lượt cho mỗi trận multiplayer thắng (score > 150) trong tuần lịch
  select count(*) into v_mp_wins
  from edux_game_history h
  where h.user_id = p_user_id
    and h.mode = 'multiplayer'
    and h.score > 150
    and h.played_at >= v_week_start
    and h.played_at <  v_week_end;

  -- Frame bonus: mở đủ 3 item khung của TUẦN CHƯƠNG TRÌNH hiện tại (p_week)
  if p_week is not null and v_frame_map ? p_week::text then
    select coalesce(unlocked_frames, '{}'::text[]) into v_unlocked
    from edux_profiles where id = p_user_id;
    select array(select jsonb_array_elements_text(v_frame_map -> p_week::text)) into v_week_frame_items;
    -- v_unlocked (text[]) chứa ĐỦ 3 item khung tuần? dùng operator mảng @> (contains)
    if v_unlocked is not null
       and (v_unlocked @> v_week_frame_items) then
      v_frame_bonus := 1;
    end if;
  end if;

  v_allowed := 1 + v_mp_wins + v_frame_bonus;  -- 1 free + MP + frame

  -- Số lượt ĐÃ quay trong tuần lịch. Lượt 'extra' (thêm lượt) không tính tiêu
  -- 1 lượt → trừ ra để đúng luật (giống consumed=0 ở client cũ).
  -- h.prize_id (có alias) để tránh nhập nhằng với OUT parameter prize_id.
  select count(*) filter (where h.prize_id <> 'extra') into v_used
  from edux_spin_history h
  where h.user_id = p_user_id
    and h.created_at >= v_week_start
    and h.created_at <  v_week_end;

  if v_used >= v_allowed then
    -- Hết lượt → từ chối, KHÔNG ghi history, KHÔNG cộng XP.
    prize_id := 'no_spins';
    prize_label := 'Đã hết lượt quay tuần này';
    xp_bonus := 0;
    spin_id := null;
    select xp, weekly_xp into new_xp, new_weekly_xp from edux_profiles where id = p_user_id;
    spins_left := 0;
    return next;
    return;
  end if;

  -- ── (1) RANDOM GIẢI + QUOTA GIẢI THƯỞNG (thẻ) — như bản trước ────────────
  create temporary table if not exists tmp_spin_weights (
    prize_id text, weight numeric
  ) on commit drop;
  -- Dọn dữ liệu lượt trước (nếu bảng tạm còn sót trong cùng session). Dùng
  -- TRUNCATE thay cho "delete from ... (không WHERE)" vì lớp bảo vệ Supabase
  -- chặn mọi DELETE không có WHERE (lỗi 21000 "DELETE requires a WHERE clause")
  -- → khiến RPC spin fail. TRUNCATE cũng nhanh hơn với bảng tạm.
  truncate table tmp_spin_weights;

  for v_row in
    select c.prize_id, c.weight, c.quota, c.enabled,
      (select count(*) from edux_spin_history h
        where h.prize_id = c.prize_id
          and (p_week is null and h.week is null or h.week = p_week)) as won
    from edux_spin_config c
  loop
    if v_row.enabled and v_row.weight > 0
       and (v_row.quota is null or v_row.won < v_row.quota) then
      insert into tmp_spin_weights values (v_row.prize_id, v_row.weight);
      v_total_weight := v_total_weight + v_row.weight;
    end if;
  end loop;

  if v_total_weight <= 0 then
    v_chosen := 'miss1';
  else
    v_roll := random() * v_total_weight;
    v_acc := 0;
    for v_row in select * from tmp_spin_weights loop
      v_acc := v_acc + v_row.weight;
      if v_roll < v_acc then
        v_chosen := v_row.prize_id;
        exit;
      end if;
    end loop;
    if v_chosen is null then
      select prize_id into v_chosen from tmp_spin_weights order by weight desc limit 1;
    end if;
  end if;

  v_chosen_label := coalesce(v_labels ->> v_chosen, v_chosen);
  v_chosen_xp := coalesce((v_xp_map ->> v_chosen)::integer, 0);

  insert into edux_spin_history (user_id, user_name, prize_id, prize_label, xp_bonus, week)
  values (p_user_id, p_user_name, v_chosen, v_chosen_label, v_chosen_xp, p_week)
  returning id into v_spin_id;

  v_bonus := greatest(0, v_chosen_xp);
  if v_bonus > 0 then
    -- Cộng thưởng vào grade_xp[khối hiện tại] để khớp với xp tổng — nếu không,
    -- BXH theo khối (dùng grade_xp) và BXH toàn bộ (dùng xp) lệch nhau: user
    -- trúng thưởng lớn có xp tổng cao nhưng grade_xp không phản ánh, khiến
    -- top BXH khối thấp hơn hẳn top BXH toàn bộ dù cùng 1 tập user.
    update edux_profiles
    set xp = xp + v_bonus,
        weekly_xp = weekly_xp + v_bonus,
        grade_xp = jsonb_set(
          coalesce(grade_xp, '{}'::jsonb), array[grade::text],
          to_jsonb(coalesce((grade_xp ->> grade::text)::int, 0) + v_bonus),
          true
        )
    where id = p_user_id
    returning xp, weekly_xp into v_new_xp, v_new_weekly_xp;
  else
    select xp, weekly_xp into v_new_xp, v_new_weekly_xp
    from edux_profiles where id = p_user_id;
  end if;

  -- Lượt còn lại sau lượt này (lượt 'extra' không tính tiêu lượt)
  prize_id := v_chosen;
  prize_label := v_chosen_label;
  xp_bonus := v_chosen_xp;
  spin_id := v_spin_id;
  new_xp := v_new_xp;
  new_weekly_xp := v_new_weekly_xp;
  spins_left := greatest(0, v_allowed - v_used - (case when v_chosen = 'extra' then 0 else 1 end));
  return next;
end;
$$;

grant execute on function edux_spin_wheel(text, text, integer) to anon, authenticated;

-- =====================================================================
-- RPC chỉ-đọc: số lượt quay còn lại của user (để LuckySpin.tsx hiển thị
-- spinsLeft từ SERVER lúc mở trang, thay cho user.spinsUsed local).
-- Cùng công thức quota với edux_spin_wheel ở trên.
-- =====================================================================
create or replace function edux_spin_quota_left(
  p_user_id text,
  p_week    integer
)
returns table (allowed integer, used integer, "left" integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz;
  v_week_end   timestamptz;
  v_mp_wins integer := 0;
  v_frame_bonus integer := 0;
  v_unlocked text[];          -- cột unlocked_frames trên prod là TEXT[] (mảng PG), không phải jsonb
  v_week_frame_items text[];
  v_frame_map jsonb := '{
    "1": ["w1_a","w1_b","w1_c"], "2": ["w2_a","w2_b","w2_c"],
    "3": ["w3_a","w3_b","w3_c"], "4": ["w4_a","w4_b","w4_c"],
    "5": ["w5_a","w5_b","w5_c"], "6": ["w6_a","w6_b","w6_c"],
    "7": ["w7_a","w7_b","w7_c"], "8": ["w8_a","w8_b","w8_c"]
  }'::jsonb;
begin
  v_week_start := date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh';
  v_week_end   := v_week_start + interval '7 days';

  select count(*) into v_mp_wins
  from edux_game_history h
  where h.user_id = p_user_id
    and h.mode = 'multiplayer'
    and h.score > 150
    and h.played_at >= v_week_start
    and h.played_at <  v_week_end;

  if p_week is not null and v_frame_map ? p_week::text then
    select coalesce(unlocked_frames, '{}'::text[]) into v_unlocked
    from edux_profiles where id = p_user_id;
    select array(select jsonb_array_elements_text(v_frame_map -> p_week::text)) into v_week_frame_items;
    if v_unlocked is not null and (v_unlocked @> v_week_frame_items) then
      v_frame_bonus := 1;
    end if;
  end if;

  allowed := 1 + v_mp_wins + v_frame_bonus;

  select count(*) filter (where h.prize_id <> 'extra') into used
  from edux_spin_history h
  where h.user_id = p_user_id
    and h.created_at >= v_week_start
    and h.created_at <  v_week_end;

  "left" := greatest(0, allowed - used);
  return next;
end;
$$;

grant execute on function edux_spin_quota_left(text, integer) to anon, authenticated;
