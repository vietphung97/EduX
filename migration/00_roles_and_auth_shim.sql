-- ============================================================
-- 00_roles_and_auth_shim.sql
-- Chạy 1 lần trên Postgres local/server TRƯỚC khi restore dump.
--   psql -U postgres -d edux -f 00_roles_and_auth_shim.sql
-- Tạo các role giống Supabase + shim schema auth (auth.uid()...)
-- để các RLS policy và RPC trong dump hoạt động nguyên vẹn.
-- ============================================================

-- 1) Roles giống Supabase
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  -- Role mà PostgREST dùng để đăng nhập, sau đó "đội mũ" anon/authenticated
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'DOI_MAT_KHAU_NAY';
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO authenticator;

-- 2) Shim schema auth — thay thế Supabase Auth
--    auth.uid() đọc claim 'sub' từ JWT mà PostgREST set vào
--    request.jwt.claims (giống hệt hành vi trên Supabase cloud;
--    với anon key thì trả NULL — đúng như hiện tại).
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt()->>'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt()->>'role', 'anon')
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- 3) Quyền mặc định trên schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
