-- =====================================================================
-- ĐẢM BẢO SỐ THẺ KHÔNG BAO GIỜ VƯỢT QUOTA — lớp chặn CỨNG ở tầng DB.
--
-- Bối cảnh: quota thẻ trước đây chỉ được kiểm tra TRONG RPC edux_spin_wheel.
-- Nếu có bất kỳ đường ghi nào khác vào edux_spin_history (client insert trực
-- tiếp, RPC cũ, sửa tay, import...) thì quota bị bypass — thực tế card20 đã
-- phát 16/10 (lỗi lịch sử). Để tương lai TUYỆT ĐỐI không vượt, thêm 1 trigger
-- BEFORE INSERT tự kiểm tra quota NGAY TẠI TẦNG BẢNG: mọi insert vượt quota
-- đều bị chặn (RAISE EXCEPTION), bất kể đến từ đường nào.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- =====================================================================

create or replace function edux_enforce_card_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota integer;
  v_won   integer;
begin
  -- Chỉ áp cho giải có quota (thẻ điện thoại card*). Giải XP/miss/extra
  -- (quota = null trong edux_spin_config) bỏ qua.
  select quota into v_quota
  from edux_spin_config
  where prize_id = NEW.prize_id;

  if v_quota is null then
    return NEW;  -- không giới hạn → cho qua
  end if;

  -- Khoá theo prize_id để 2 insert đồng thời cùng giải không cùng lọt.
  -- (Cùng khoá dùng trong edux_spin_wheel là advisory toàn cục; ở đây khoá
  --  riêng theo prize_id để trigger độc lập, không phụ thuộc RPC nào gọi nó.)
  perform pg_advisory_xact_lock(hashtext('edux_card_quota_' || NEW.prize_id));

  -- Đếm số thẻ CÙNG prize_id đã phát trong CÙNG kỳ (week). NULL-safe.
  select count(*) into v_won
  from edux_spin_history
  where prize_id = NEW.prize_id
    and week is not distinct from NEW.week;

  if v_won >= v_quota then
    raise exception 'CARD_QUOTA_EXCEEDED: % đã phát đủ %/% suất (tuần %)',
      NEW.prize_id, v_won, v_quota, NEW.week
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_edux_enforce_card_quota on edux_spin_history;
create trigger trg_edux_enforce_card_quota
  before insert on edux_spin_history
  for each row
  execute function edux_enforce_card_quota();

-- Lưu ý: edux_spin_wheel VẪN nên tự loại giải hết quota khỏi vòng random
-- (để user không "trúng" rồi bị trigger chặn → mất lượt oan). Trigger này là
-- lớp phòng thủ CUỐI, chỉ kích hoạt nếu có đường ghi lọt qua kiểm tra của RPC.
-- Khi trigger chặn, RPC edux_spin_wheel sẽ nhận exception và rollback cả lượt
-- quay đó (không ghi history, không cộng XP) — client hiển thị lỗi/thử lại.
