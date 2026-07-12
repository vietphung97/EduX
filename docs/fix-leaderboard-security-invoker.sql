-- Fix Supabase security warning: SECURITY DEFINER views
-- Chạy trong Supabase SQL Editor.
-- Sau khi chạy: refresh Security Advisor, 2 cảnh báo sẽ biến mất.

ALTER VIEW public.edux_leaderboard        SET (security_invoker = true);
ALTER VIEW public.edux_weekly_leaderboard SET (security_invoker = true);

-- Verify (optional)
SELECT schemaname, viewname,
       (SELECT reloptions FROM pg_class WHERE relname = viewname) AS options
FROM pg_views
WHERE viewname IN ('edux_leaderboard', 'edux_weekly_leaderboard');
