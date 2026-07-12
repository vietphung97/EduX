-- =====================================================================
-- KIỂM TRA: học sinh trúng nhiều hơn 1 thẻ điện thoại trong cùng 1 tuần
-- Mục đích: xác minh xem đây là do có nhiều lượt quay hợp lệ (thắng nhiều
-- trận multiplayer >150đ) hay có dấu hiệu bất thường (spam quay / gian lận).
-- =====================================================================

-- 1) Danh sách user trúng >1 thẻ trong cùng tuần, kèm chi tiết từng lần trúng
select
  h.user_id,
  h.user_name,
  h.week,
  count(*) as so_lan_trung_the,
  array_agg(h.prize_id order by h.created_at) as cac_giai,
  array_agg(h.created_at order by h.created_at) as thoi_diem_trung
from edux_spin_history h
where h.prize_id like 'card%'
group by h.user_id, h.user_name, h.week
having count(*) > 1
order by h.week, so_lan_trung_the desc;

-- 2) Với mỗi user/tuần bị trùng ở trên, đối chiếu TỔNG số lượt quay đã dùng
--    trong tuần đó (mọi giải, không chỉ thẻ) — để xem họ có đủ lượt quay
--    hợp lệ hay không.
select
  h.user_id,
  h.user_name,
  h.week,
  count(*) as tong_luot_quay_trong_tuan,
  sum(case when h.prize_id like 'card%' then 1 else 0 end) as so_lan_trung_the,
  array_agg(h.prize_id order by h.created_at) as thu_tu_giai
from edux_spin_history h
where (h.user_id, h.week) in (
  select user_id, week
  from edux_spin_history
  where prize_id like 'card%'
  group by user_id, week
  having count(*) > 1
)
group by h.user_id, h.user_name, h.week
order by h.week, tong_luot_quay_trong_tuan desc;

-- 3) Đối chiếu với số trận multiplayer thắng >150đ trong tuần của các user này
--    (nguồn cộng lượt quay) — nếu số trận thắng đủ giải thích số lượt quay
--    thì đây là hành vi hợp lệ theo thiết kế, không phải bug.
--    Lưu ý: cần biết khoảng thời gian (start/end) của từng "week" chương
--    trình để lọc played_at chính xác — thay YYYY-MM-DD cho đúng lịch tuần.
select
  g.user_id,
  count(*) filter (where g.mode = 'multiplayer' and g.score > 150) as tran_thang_multiplayer_150,
  min(g.played_at) as tu,
  max(g.played_at) as den
from edux_game_history g
where g.user_id in (
  select user_id
  from edux_spin_history
  where prize_id like 'card%'
  group by user_id, week
  having count(*) > 1
)
group by g.user_id;

-- 4) Kiểm tra dấu hiệu bất thường: nhiều lượt quay trúng thẻ cách nhau
--    RẤT GẦN về thời gian (vài giây) — có thể là spam request / gọi API
--    trực tiếp thay vì quay tay trên UI.
select
  h.user_id,
  h.user_name,
  h.prize_id,
  h.created_at,
  h.created_at - lag(h.created_at) over (partition by h.user_id order by h.created_at) as khoang_cach_voi_lan_truoc
from edux_spin_history h
where h.prize_id like 'card%'
order by h.user_id, h.created_at;

-- =====================================================================
-- 5) QUOTA THỰC TẾ THEO TỪNG GIẢI THẺ, TRONG TUẦN HIỆN TẠI
--    So sánh với số hiển thị trên trang Admin (mục "Cấu hình giải thưởng")
--    và quota cấu hình trong edux_spin_config, để xác minh có bị VƯỢT quota
--    thật hay không (do race condition: nhiều request đọc count cùng lúc
--    trước khi kịp ghi, nên cùng "lọt" qua điều kiện < quota).
--    ⚠ Thay số tuần (n.week) cho đúng tuần chương trình đang chạy nếu cần lọc riêng.
select
  h.prize_id,
  h.week,
  count(*) as so_luong_thuc_te_trong_db,
  c.quota as quota_cau_hinh,
  (count(*) > c.quota) as co_vuot_quota
from edux_spin_history h
left join edux_spin_config c on c.prize_id = h.prize_id
where h.prize_id like 'card%'
group by h.prize_id, h.week, c.quota
order by h.week, h.prize_id;

-- 6) Với riêng card20 (nghi vấn vượt quota trong ảnh chụp) — liệt kê toàn bộ
--    lượt trúng theo đúng thứ tự thời gian, đánh số thứ tự (row_number) để
--    xem rõ lượt thứ mấy đã vượt ngưỡng 10 (quota cấu hình).
select
  row_number() over (partition by week order by created_at) as thu_tu,
  user_id,
  user_name,
  week,
  created_at
from edux_spin_history
where prize_id = 'card20'
order by week, created_at;

-- =====================================================================
-- 7) "Thẻ 100K đã trúng nhưng Admin báo quota 0/1" — kiểm tra lệch giá trị
--    cột `week` giữa lúc lưu (server tính currentWeek lúc quay) và lúc Admin
--    xem (client tính lại currentWeek ngay tại thời điểm bấm "Tải lại").
--    getCurrentProgramWeek() dùng new Date() ngay lúc gọi — nếu 2 thời điểm
--    rơi vào 2 tuần chương trình khác nhau (hoặc lệch giờ máy), quota sẽ
--    đếm sai vì lọc theo week.
select
  id,
  user_id,
  user_name,
  prize_id,
  week,          -- tuần đã được LƯU lúc quay (đúng theo server-time lúc đó)
  created_at
from edux_spin_history
where prize_id = 'card100'
order by created_at;

-- So sánh: nếu week ở đây KHÁC với tuần chương trình hiện tại (tính theo
-- PROGRAM_START_DATE + số ngày đã trôi qua tính đến "bây giờ"), thì đó
-- chính là nguyên nhân quota hiển thị 0/1 dù đã có người trúng.
-- PROGRAM_START_DATE (constants.ts) = 2026-07-01T00:00:00+07:00 → Tuần 1 = 01/07-07/07/2026 (VN).
-- "Bây giờ" theo múi giờ VN vẫn nằm trong Tuần 1, nên cột week ở trên PHẢI = 1.
-- Nếu ra khác 1 (vd null hoặc 2) → xác nhận có lệch giờ máy / logic tính tuần.
select
  floor(extract(epoch from (now() at time zone 'Asia/Ho_Chi_Minh'
    - timestamp '2026-07-01 00:00:00')) / (7*24*3600)) + 1 as tuan_hien_tai_tinh_theo_sql_vn;

-- 8) Kiểm tra RIÊNG các dòng có week IS NULL (rơi ra ngoài mọi bộ lọc quota
--    theo tuần — getSpinWinCounts(week) sẽ KHÔNG đếm các dòng này vào quota
--    của tuần hiện tại nếu currentWeek khác null, vì query .eq('week', week)
--    không khớp NULL). Đây là nghi phạm hàng đầu cho hiện tượng "đã trúng
--    nhưng quota báo 0". (Đã loại: dòng card100 thực tế có week=1, không null.)
select id, user_id, user_name, prize_id, week, created_at
from edux_spin_history
where prize_id = 'card100' and week is null;

-- =====================================================================
-- 9) MÔ PHỎNG CHÍNH XÁC query mà getSpinWinCounts(1) chạy — để loại trừ
--    khả năng do RLS/policy chặn ẩn (vd nếu chạy bằng vai trò anon thay vì
--    trong SQL Editor là superuser, kết quả có thể khác).
--    Chạy dưới vai trò "anon" giống hệt app — nếu ra 0 dòng ở đây dù (8) và
--    (7) cho thấy có dữ liệu, chắc chắn là do RLS/policy.
set role anon;
select prize_id
from edux_spin_history
where week = 1;
reset role;

-- 10) Đếm số dòng card100 mà chính xác câu lệnh JS tương đương sẽ thấy —
--     group theo prize_id để ra dạng giống hệt object `counts` trong code.
select prize_id, count(*) as dem
from edux_spin_history
where week = 1
group by prize_id
order by prize_id;

-- 11) Kiểm tra có đúng 1 hàng edux_spin_config cho card100, quota có đúng
--     bằng 1 không (không phải bị đổi thành số khác hoặc bị duplicate row
--     prize_id gây join nhân bản ở admin).
select * from edux_spin_config where prize_id = 'card100';
select prize_id, count(*) from edux_spin_config group by prize_id having count(*) > 1;
