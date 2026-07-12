-- =====================================================================
-- XÁC MINH: RPC edux_spin_wheel đã tồn tại và hoạt động đúng sau khi
-- chạy fix_spin_quota_race_condition.sql + deploy code frontend mới.
-- =====================================================================

-- 1) RPC đã được tạo trên DB chưa?
select routine_name, routine_type, security_type
from information_schema.routines
where routine_name = 'edux_spin_wheel';
-- Kỳ vọng: 1 dòng, security_type = 'DEFINER'.

-- 2) Quyền thực thi đã cấp cho anon/authenticated chưa? (nếu thiếu, client
--    gọi rpc() sẽ lỗi 401/403 dù hàm tồn tại)
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'edux_spin_wheel';
-- Kỳ vọng: có dòng grantee=anon và grantee=authenticated, privilege_type=EXECUTE.

-- 3) Test gọi thử RPC với 1 user_id giả lập KHÔNG tồn tại thật (để không
--    ảnh hưởng dữ liệu thật) — chỉ cần xem hàm chạy không lỗi cú pháp/logic.
--    ⚠ Lưu ý: hàm SẼ insert 1 dòng vào edux_spin_history với user_id giả này
--    nếu chạy thành công — có thể xoá dòng test ngay sau khi xác minh xong.
select * from edux_spin_wheel('__TEST_USER_DO_NOT_USE__', 'Test User', 1);

-- 4) Dọn dẹp dòng test vừa tạo ở bước 3 (chạy sau khi đã xem kết quả).
delete from edux_spin_history where user_id = '__TEST_USER_DO_NOT_USE__';

-- 5) Xác nhận card20 (đã vượt quota 10 → 16 trước đó) hiện đang bị khoá
--    đúng cách: card20 phải bị loại khỏi vòng quay tiếp theo vì
--    won(16) >= quota(10), bất kể "Bật" có tick hay không.
--    Query dưới đây mô phỏng logic won >= quota mà RPC dùng để loại giải.
select
  c.prize_id,
  c.quota,
  c.enabled,
  (select count(*) from edux_spin_history h
    where h.prize_id = c.prize_id and h.week = 1) as won,
  case
    when not c.enabled then 'TẮT (admin)'
    when c.quota is not null and
      (select count(*) from edux_spin_history h
        where h.prize_id = c.prize_id and h.week = 1) >= c.quota
      then 'HẾT QUOTA — sẽ bị loại khỏi vòng quay'
    else 'ĐANG CÓ THỂ TRÚNG'
  end as trang_thai
from edux_spin_config c
where c.prize_id like 'card%'
order by c.prize_id;

-- 6) Kiểm tra tổng số lượt trúng từng giải thẻ SAU khi deploy fix — nếu
--    card20 vẫn dừng ở đúng con số hiện tại (không tăng thêm nữa dù có
--    học sinh tiếp tục quay), xác nhận race condition đã được chặn.
--    Chạy lại query này sau vài giờ / vài lượt quay mới để so sánh.
select prize_id, count(*) as tong_da_trung
from edux_spin_history
where week = 1 and prize_id like 'card%'
group by prize_id
order by prize_id;
