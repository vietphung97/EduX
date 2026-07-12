-- =====================================================================
-- Multiplayer: ghi điểm ATOMIC ở server, thay cho cách cũ read-modify-write
-- từ client trên dòng KV chung edux_kv_store (key = 'edux_room_XXXXXX').
--
-- Lý do đổi (bug thực tế: "trả lời đúng nhưng không ghi nhận điểm"):
--   State cả phòng (mọi player) nằm chung 1 dòng JSONB. submitAnswer cũ đọc
--   toàn bộ `players`, sửa nhánh của mình, rồi updateRoomState ghi đè NGUYÊN
--   object `players` bằng snapshot đã đọc. Khi 2 người trả lời gần nhau (hoặc
--   keep-alive updatePlayerActivity 10s chạy xen vào), request sau đọc state
--   TRƯỚC khi request trước kịp ghi → ghi đè, xóa mất điểm vừa cộng
--   (lost update / last-write-wins).
--
-- Cách sửa: RPC khóa dòng bằng `for update`, chỉ sửa đúng nhánh
--   players->player_id bằng jsonb_set (không đụng điểm người khác), và có
--   guard idempotency theo currentQuestionIndex (chống cộng trùng khi realtime
--   /poll gửi lặp hoặc user double-tap).
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
--   (Phải chạy tay giống lucky_spin.sql — không tự động migrate.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nộp đáp án 1 câu, cộng điểm atomic cho đúng 1 player.
--    Trả về JSONB state mới của phòng (để client dùng nếu cần).
-- ---------------------------------------------------------------------
create or replace function edux_submit_answer(
  p_key            text,     -- 'edux_room_XXXXXX'
  p_player_id      text,
  p_question_index integer,  -- index câu vừa trả lời (0-based)
  p_is_correct     boolean,
  p_xp_per_q       integer   -- XP/câu theo độ khó (client truyền, khớp XP_PER_QUESTION)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value       jsonb;
  v_player      jsonb;
  v_cur_index   integer;
  v_correct     integer;
  v_streak      integer;
  v_max_streak  integer;
  v_new_index   integer;
  v_total_q     integer;
  v_now_ms      bigint := (extract(epoch from now()) * 1000)::bigint;
  v_all_finished boolean;
begin
  -- Khóa dòng phòng → mọi lượt nộp tuần tự hóa, hết lost update.
  select value into v_value
  from edux_kv_store
  where key = p_key
  for update;

  if v_value is null then
    return null; -- phòng không tồn tại / đã bị xóa
  end if;

  v_player := v_value -> 'players' -> p_player_id;
  if v_player is null then
    return v_value; -- player không có trong phòng, không làm gì
  end if;

  -- Chỉ chấp nhận nộp cho câu hiện tại của player. Nếu currentQuestionIndex
  -- đã > p_question_index nghĩa là câu này TÍNH RỒI (request lặp) → bỏ qua.
  v_cur_index := coalesce((v_player ->> 'currentQuestionIndex')::integer, 0);
  if v_cur_index > p_question_index then
    return v_value; -- idempotent: không cộng trùng
  end if;

  v_correct    := coalesce((v_player ->> 'correctCount')::integer, 0);
  v_streak     := coalesce((v_player ->> 'streak')::integer, 0);
  v_max_streak := coalesce((v_player ->> 'maxStreak')::integer, 0);

  if p_is_correct then
    v_correct := v_correct + 1;
    v_streak  := v_streak + 1;
    if v_streak > v_max_streak then
      v_max_streak := v_streak;
    end if;
  else
    v_streak := 0;
  end if;

  v_new_index := p_question_index + 1;

  -- Cập nhật nhánh player: score = correct*xp + maxStreak*5 (khớp client cũ).
  v_player := v_player || jsonb_build_object(
    'correctCount',         v_correct,
    'streak',               v_streak,
    'maxStreak',            v_max_streak,
    'currentQuestionIndex', v_new_index,
    'score',                v_correct * p_xp_per_q + v_max_streak * 5,
    'lastActivity',         v_now_ms
  );

  -- Nếu đã hết câu → đánh dấu finishedAt.
  v_total_q := coalesce(jsonb_array_length(v_value -> 'questions'), 0);
  if v_new_index >= v_total_q and v_total_q > 0 then
    v_player := v_player || jsonb_build_object('finishedAt', v_now_ms);
  end if;

  -- Ghi lại CHỈ nhánh của player này.
  v_value := jsonb_set(v_value, array['players', p_player_id], v_player, true);

  -- Mọi người đã xong → chuyển phòng sang completed.
  select bool_and(p.value ? 'finishedAt')
  into v_all_finished
  from jsonb_each(v_value -> 'players') as p;

  if coalesce(v_all_finished, false) then
    v_value := v_value || jsonb_build_object(
      'gamePhase', 'completed',
      'endedAt',   v_now_ms
    );
  end if;

  v_value := jsonb_set(v_value, array['lastUpdate'], to_jsonb(v_now_ms), true);

  update edux_kv_store
  set value = v_value, updated_at = now()
  where key = p_key;

  return v_value;
end;
$$;

grant execute on function edux_submit_answer(text, text, integer, boolean, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Keep-alive: chỉ cập nhật lastActivity của đúng 1 player.
--    Tách riêng để ping 10s KHÔNG còn ghi đè nguyên object players như cũ.
-- ---------------------------------------------------------------------
create or replace function edux_touch_activity(
  p_key       text,
  p_player_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  update edux_kv_store
  set value = jsonb_set(
        value,
        array['players', p_player_id, 'lastActivity'],
        to_jsonb(v_now_ms),
        false  -- chỉ set nếu player đã tồn tại; không tạo nhánh rác
      ),
      updated_at = now()
  where key = p_key
    and value -> 'players' ? p_player_id;
end;
$$;

grant execute on function edux_touch_activity(text, text)
  to anon, authenticated;
