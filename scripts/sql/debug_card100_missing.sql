-- =====================================================================
-- DEBUG: card100 CÓ trong DB (week=1, xác nhận bằng SQL Editor trước đó)
-- nhưng client (anon key) gọi getSpinWinCounts(1) lại KHÔNG thấy nó
-- (console log xác nhận: counts = {card10:20, card20:9, card50:2, ...}
--  — thiếu hẳn key card100, không phải card100:0).
-- Nghi vấn: RLS policy áp dụng khác nhau giữa role chạy trong SQL Editor
-- (thường bypass RLS) và role "anon" mà client thực sự dùng.
-- =====================================================================

-- 1) Liệt kê TOÀN BỘ policy hiện tại trên bảng — xem có policy nào khác
--    ngoài "spin_history_all" đang giới hạn thêm không (vd theo user_id,
--    theo created_at, hoặc policy cũ chưa bị drop đúng cách).
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where tablename = 'edux_spin_history';

-- 2) Mô phỏng CHÍNH XÁC quyền của client: set role thành anon rồi chạy
--    lại đúng query mà getSpinWinCounts(1) chạy.
set role anon;
select prize_id, week, created_at
from edux_spin_history
where week = 1 and prize_id = 'card100';
reset role;

-- 3) Nếu (2) trả về 0 dòng dù SQL Editor (superuser) thấy có — xác nhận
--    RLS chặn anon. Kiểm tra tiếp: có phải do RLS filter kiểu dữ liệu
--    (vd cột week là integer nhưng policy so sánh nhầm kiểu) hay do
--    force RLS / policy USING sai logic.
select relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'edux_spin_history';

-- 4) Kiểm tra GRANT trực tiếp trên bảng cho role anon (RLS chỉ có hiệu lực
--    NẾU role đã có quyền SELECT ở tầng GRANT trước đó — thiếu GRANT thì
--    dù policy đúng vẫn không đọc được gì).
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'edux_spin_history';
