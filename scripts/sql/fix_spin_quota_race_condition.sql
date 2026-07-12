-- =====================================================================
-- FIX: vòng quay may mắn cho ra thẻ vượt quota (thấy thực tế 2026-07-02:
-- card20 quota=10 nhưng có 14 người trúng).
--
-- NGUYÊN NHÂN: pickPrize() (LuckySpin.tsx) làm "đọc rồi ghi" tách rời:
--   1. Client gọi getSpinWinCounts(week) → đọc số người đã trúng mỗi giải
--   2. Client random 1 giải trong số giải còn quota (theo counts vừa đọc)
--   3. Client gọi RPC edux_award_spin() để ghi record + cộng XP
-- Bước 1 và 3 KHÔNG nằm trong cùng transaction. Khi nhiều học sinh quay
-- gần như đồng thời (khung giờ cao điểm tối), tất cả cùng đọc counts ở
-- bước 1 với giá trị CŨ (vd 9/10) trước khi bất kỳ ai kịp ghi ở bước 3,
-- nên nhiều request cùng "lọt" qua điều kiện (count < quota) và cùng
-- insert → tổng vượt quota thật sự trong DB.
--
-- FIX: chuyển toàn bộ "random giải + kiểm tra quota + insert" vào MỘT
-- RPC Postgres atomic. Dùng pg_advisory_xact_lock để serialize hoá các
-- lượt quay của CÙNG một prize_id (giải thẻ) — request thứ 2 phải đợi
-- request thứ 1 commit xong rồi mới được đếm quota, nên không thể có 2
-- request cùng đọc thấy quota còn trống rồi cùng ghi vượt.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- =====================================================================

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
  new_weekly_xp integer
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
  -- Nhãn giải cố định (đồng bộ với SPIN_PRIZES trong LuckySpin.tsx) —
  -- chỉ dùng để ghi prize_label, không ảnh hưởng logic random/quota.
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
begin
  -- Khoá advisory theo phạm vi transaction: mọi lượt quay (bất kể prize
  -- nào) của TOÀN hệ thống bị serialize hoá tại đây. Với tần suất quay
  -- thực tế của 1 chương trình vài trăm HS, khoá toàn cục là đủ rẻ và
  -- đơn giản hơn nhiều so với khoá riêng theo từng prize_id.
  perform pg_advisory_xact_lock(hashtext('edux_spin_wheel'));

  -- Tính trọng số hiệu lực cho từng giải: bỏ giải tắt (enabled=false),
  -- bỏ giải thẻ đã hết quota trong TUẦN NÀY. Đếm quota ngay trong cùng
  -- transaction đã giữ khoá ở trên, nên không còn race condition.
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
    -- Toàn bộ giải hết quota/tắt — fallback "hẹn gặp lần sau"
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
    update edux_profiles
    set xp = xp + v_bonus, weekly_xp = weekly_xp + v_bonus
    where id = p_user_id
    returning xp, weekly_xp into v_new_xp, v_new_weekly_xp;
  else
    select xp, weekly_xp into v_new_xp, v_new_weekly_xp
    from edux_profiles where id = p_user_id;
  end if;

  prize_id := v_chosen;
  prize_label := v_chosen_label;
  xp_bonus := v_chosen_xp;
  spin_id := v_spin_id;
  new_xp := v_new_xp;
  new_weekly_xp := v_new_weekly_xp;
  return next;
end;
$$;

grant execute on function edux_spin_wheel(text, text, integer) to anon, authenticated;

-- Lưu ý sau khi deploy RPC này:
--   - LuckySpin.tsx cần đổi: KHÔNG tự pickPrize() ở client nữa (bỏ đọc
--     getSpinWinCounts() để chọn giải — chỉ dùng để hiển thị UI nếu cần).
--     Gọi edux_spin_wheel(user_id, user_name, week) và dùng prize_id trả
--     về để chạy animation quay tới đúng ô đó.
--   - "extra" (thêm lượt) và giải type 'card' vẫn xử lý ở client như cũ
--     sau khi có kết quả (mở form nhận thưởng / cộng thêm lượt quay).
