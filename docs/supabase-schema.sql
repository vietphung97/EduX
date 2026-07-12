-- ============================================
-- SUPABASE DATABASE SCHEMA FOR EDUX
-- Run this in Supabase SQL Editor
-- All tables prefixed with edux_
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ PROFILES TABLE ============
-- Stores user profile information
CREATE TABLE edux_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT 'default-avatar.png',
  grade INTEGER NOT NULL DEFAULT 6 CHECK (grade >= 3 AND grade <= 12),
  xp INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'Tập sự',
  total_games INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  weekly_xp INTEGER NOT NULL DEFAULT 0,
  topic_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE edux_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for edux_profiles
CREATE POLICY "Users can view all profiles" ON edux_profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON edux_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON edux_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============ GAME HISTORY TABLE ============
-- Stores game play history
CREATE TABLE edux_game_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES edux_profiles(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  grade INTEGER NOT NULL,
  topics TEXT[] DEFAULT '{}',
  difficulty TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  time_spent INTEGER NOT NULL DEFAULT 0, -- in seconds
  score INTEGER NOT NULL DEFAULT 0,
  mode TEXT DEFAULT 'solo', -- 'solo' | 'multiplayer'
  room_code TEXT
);

-- Enable RLS
ALTER TABLE edux_game_history ENABLE ROW LEVEL SECURITY;

-- Policies for edux_game_history
CREATE POLICY "Users can view own history" ON edux_game_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read aggregate history" ON edux_game_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own history" ON edux_game_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============ QUESTIONS TABLE (Optional) ============
-- If you want to store questions in Supabase instead of Google Sheets
CREATE TABLE edux_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_answer TEXT NOT NULL,
  fun_explanation TEXT,
  serious_explanation TEXT,
  image_url TEXT,
  category TEXT NOT NULL,
  grade INTEGER NOT NULL CHECK (grade >= 3 AND grade <= 12),
  difficulty TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE edux_questions ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active questions
CREATE POLICY "Anyone can read active questions" ON edux_questions
  FOR SELECT USING (is_active = true);

-- ============ INDEXES FOR PERFORMANCE ============
CREATE INDEX idx_edux_profiles_xp ON edux_profiles(xp DESC);
CREATE INDEX idx_edux_profiles_weekly_xp ON edux_profiles(weekly_xp DESC);
CREATE INDEX idx_edux_game_history_user ON edux_game_history(user_id);
CREATE INDEX idx_edux_game_history_played ON edux_game_history(played_at DESC);
CREATE INDEX idx_edux_questions_grade ON edux_questions(grade);
CREATE INDEX idx_edux_questions_difficulty ON edux_questions(difficulty);
CREATE INDEX idx_edux_questions_category ON edux_questions(category);

-- ============ FUNCTION: Auto-update updated_at ============
CREATE OR REPLACE FUNCTION edux_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for edux_profiles
CREATE TRIGGER edux_update_profiles_updated_at
  BEFORE UPDATE ON edux_profiles
  FOR EACH ROW
  EXECUTE FUNCTION edux_update_updated_at_column();

-- ============ FUNCTION: Auto-create profile on signup ============
CREATE OR REPLACE FUNCTION edux_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.edux_profiles (id, name, grade)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    6
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create profile when user signs up
CREATE TRIGGER edux_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION edux_handle_new_user();

-- ============ FUNCTION: Reset weekly XP (run via cron) ============
CREATE OR REPLACE FUNCTION edux_reset_weekly_xp()
RETURNS void AS $$
BEGIN
  UPDATE edux_profiles SET weekly_xp = 0;
END;
$$ LANGUAGE plpgsql;

-- ============ VIEWS ============
-- Leaderboard view (SECURITY INVOKER: enforces RLS of the querying user, not view creator)
CREATE OR REPLACE VIEW edux_leaderboard
WITH (security_invoker = true) AS
SELECT
  id, name, avatar, grade, xp, level, total_games, best_streak, weekly_xp,
  RANK() OVER (ORDER BY xp DESC) as rank
FROM edux_profiles
ORDER BY xp DESC;

-- Weekly leaderboard view (SECURITY INVOKER)
CREATE OR REPLACE VIEW edux_weekly_leaderboard
WITH (security_invoker = true) AS
SELECT
  id, name, avatar, grade, xp, level, total_games, best_streak, weekly_xp,
  RANK() OVER (ORDER BY weekly_xp DESC) as rank
FROM edux_profiles
WHERE weekly_xp > 0
ORDER BY weekly_xp DESC;
