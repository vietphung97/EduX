-- ============================================================
-- 03_post_restore_grants.sql
-- Chạy SAU khi restore dump (dump được export --no-privileges
-- nên phải cấp lại quyền cho các role).
--   psql -U postgres -d edux -f 03_post_restore_grants.sql
-- ============================================================

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Kiểm tra nhanh: liệt kê bảng + số dòng
SELECT relname AS table, n_live_tup AS approx_rows
FROM pg_stat_user_tables
WHERE relname LIKE 'edux_%'
ORDER BY relname;
