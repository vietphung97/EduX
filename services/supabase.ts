import { createClient } from '@supabase/supabase-js';
import { Question, Difficulty, UserProfile, GameHistory, GameResult } from '../types';

// Supabase client initialization
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ USER PROFILE ============

// Helper to convert camelCase to snake_case for Supabase
function toSnakeCase(profile: Partial<UserProfile>): Record<string, any> {
  const result: Record<string, any> = {};
  if (profile.id !== undefined) result.id = profile.id;
  if (profile.name !== undefined) result.name = profile.name;
  if (profile.avatar !== undefined) result.avatar = profile.avatar;
  if (profile.grade !== undefined) result.grade = profile.grade;
  if (profile.xp !== undefined) result.xp = profile.xp;
  if (profile.level !== undefined) result.level = profile.level;
  if (profile.totalGames !== undefined) result.total_games = profile.totalGames;
  if (profile.bestStreak !== undefined) result.best_streak = profile.bestStreak;
  if (profile.weeklyXp !== undefined) result.weekly_xp = profile.weeklyXp;
  if (profile.topicStats !== undefined) result.topic_stats = profile.topicStats;
  if (profile.gradeXp !== undefined) result.grade_xp = profile.gradeXp;
  if (profile.unlockedFrames !== undefined) result.unlocked_frames = profile.unlockedFrames;
  if (profile.equippedFrame !== undefined) result.equipped_frame = profile.equippedFrame;
  return result;
}

// Helper to convert snake_case to camelCase from Supabase
function toCamelCase(data: Record<string, any>): UserProfile {
  return {
    id: data.id,
    name: data.name,
    avatar: data.avatar,
    grade: data.grade,
    xp: data.xp,
    level: data.level,
    totalGames: data.total_games || 0,
    bestStreak: data.best_streak || 0,
    weeklyXp: data.weekly_xp || 0,
    topicStats: data.topic_stats || {},
    gradeXp: data.grade_xp || {},
    unlockedFrames: data.unlocked_frames || [],
    equippedFrame: data.equipped_frame || undefined,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - user doesn't exist yet
      return null;
    }
    console.error('Error fetching user profile:', error);
    return null;
  }
  return data ? toCamelCase(data) : null;
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<boolean> {
  const snakeCaseUpdates = toSnakeCase(updates);

  const { error } = await supabase
    .from('edux_profiles')
    .update(snakeCaseUpdates)
    .eq('id', userId);

  if (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
  return true;
}

export async function createUserProfile(profile: UserProfile): Promise<boolean> {
  const snakeCaseProfile = toSnakeCase(profile);

  const { error } = await supabase
    .from('edux_profiles')
    .insert(snakeCaseProfile);

  if (error) {
    console.error('Error creating user profile:', error);
    return false;
  }
  return true;
}

// Upsert profile - create if not exists, update if exists
export async function upsertUserProfile(profile: UserProfile): Promise<boolean> {
  const snakeCaseProfile = toSnakeCase(profile);

  const { error } = await supabase
    .from('edux_profiles')
    .upsert(snakeCaseProfile, { onConflict: 'id' });

  if (error) {
    console.error('Error upserting user profile:', error);
    return false;
  }
  return true;
}

// ============ GAME HISTORY ============

// Helper to convert game history to snake_case for Supabase
function gameToSnakeCase(game: GameHistory, userId: string): Record<string, any> {
  return {
    id: game.id,
    user_id: userId,
    played_at: game.playedAt,
    grade: game.grade,
    topics: game.topics,
    difficulty: game.difficulty,
    correct_count: game.correctCount,
    total_questions: game.totalQuestions,
    xp_earned: game.xpEarned,
    max_streak: game.maxStreak,
    time_spent: game.timeSpent,
    score: game.score,
    mode: game.mode || 'solo',
    room_code: game.roomCode || null
  };
}

// Helper to convert game history from snake_case
function gameToCamelCase(data: Record<string, any>): GameHistory {
  return {
    id: data.id,
    playedAt: data.played_at,
    grade: data.grade,
    topics: data.topics || [],
    difficulty: data.difficulty,
    correctCount: data.correct_count || 0,
    totalQuestions: data.total_questions || 0,
    xpEarned: data.xp_earned || 0,
    maxStreak: data.max_streak || 0,
    timeSpent: data.time_spent || 0,
    score: data.score || 0,
    mode: data.mode || 'solo',
    roomCode: data.room_code
  };
}

export async function saveGameHistory(userId: string, game: GameHistory): Promise<boolean> {
  const snakeCaseGame = gameToSnakeCase(game, userId);

  const { error } = await supabase
    .from('edux_game_history')
    .insert(snakeCaseGame);

  if (error) {
    console.error('Error saving game history:', error);
    return false;
  }
  return true;
}

export async function getGameHistory(userId: string, limit: number = 20): Promise<GameHistory[]> {
  const { data, error } = await supabase
    .from('edux_game_history')
    .select('*')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching game history:', error);
    return [];
  }
  return (data || []).map(gameToCamelCase);
}

// Tính toán và cập nhật gradeXp từ toàn bộ lịch sử game
export async function recalculateGradeXpFromHistory(userId: string): Promise<Record<number, number> | null> {
  // Lấy toàn bộ lịch sử game (không giới hạn)
  const { data, error } = await supabase
    .from('edux_game_history')
    .select('grade, xp_earned')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching game history for gradeXp calculation:', error);
    return null;
  }

  // Tính tổng XP theo từng grade
  const gradeXp: Record<number, number> = {};
  for (const game of data || []) {
    const grade = game.grade;
    const xp = game.xp_earned || 0;
    gradeXp[grade] = (gradeXp[grade] || 0) + xp;
  }

  // Cập nhật vào profile
  const { error: updateError } = await supabase
    .from('edux_profiles')
    .update({ grade_xp: gradeXp })
    .eq('id', userId);

  if (updateError) {
    console.error('Error updating gradeXp:', updateError);
    return null;
  }

  return gradeXp;
}

// Chạy một lần để cập nhật gradeXp cho TẤT CẢ users từ history
export async function migrateAllUsersGradeXp(): Promise<{ success: number; failed: number }> {
  // Lấy tất cả user IDs từ profiles
  const { data: profiles, error } = await supabase
    .from('edux_profiles')
    .select('id');

  if (error) {
    console.error('Error fetching profiles:', error);
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const profile of profiles || []) {
    const result = await recalculateGradeXpFromHistory(profile.id);
    if (result !== null) {
      success++;
      console.log(`✓ Updated gradeXp for user ${profile.id}:`, result);
    } else {
      failed++;
      console.log(`✗ Failed to update user ${profile.id}`);
    }
  }

  console.log(`\n=== Migration complete: ${success} success, ${failed} failed ===`);
  return { success, failed };
}

// ============ LEADERBOARD ============

export async function getLeaderboard(limit: number = 10): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .order('xp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
  return (data || []).map(toCamelCase);
}

export async function getWeeklyLeaderboard(limit: number = 10): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .order('weekly_xp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching weekly leaderboard:', error);
    return [];
  }
  return (data || []).map(toCamelCase);
}

export async function getLeaderboardByGrade(grade: number, limit: number = 10): Promise<UserProfile[]> {
  // Fetch all profiles that have played this grade (have gradeXp for this grade)
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .limit(200); // Fetch more to filter client-side

  if (error) {
    console.error('Error fetching leaderboard by grade:', error);
    return [];
  }

  // Filter and sort by gradeXp for the specific grade
  const profiles = (data || []).map(toCamelCase);
  const filtered = profiles
    .filter(p => p.gradeXp && p.gradeXp[grade] && p.gradeXp[grade] > 0)
    .sort((a, b) => (b.gradeXp?.[grade] || 0) - (a.gradeXp?.[grade] || 0))
    .slice(0, limit);

  return filtered;
}

// Get user's actual rank in the leaderboard
export async function getUserRank(userId: string, gradeFilter?: number): Promise<number> {
  if (gradeFilter) {
    // For grade filter, we need to fetch all profiles and count
    const { data, error } = await supabase
      .from('edux_profiles')
      .select('id, grade_xp');

    if (error || !data) {
      console.error('Error fetching user rank:', error);
      return -1;
    }

    // Sort by gradeXp and find user's position
    const sorted = data
      .filter(p => p.grade_xp && p.grade_xp[gradeFilter] > 0)
      .sort((a, b) => (b.grade_xp?.[gradeFilter] || 0) - (a.grade_xp?.[gradeFilter] || 0));

    const rank = sorted.findIndex(p => p.id === userId);
    return rank >= 0 ? rank + 1 : -1;
  } else {
    // For global XP rank, count users with higher XP
    const { data: userData, error: userError } = await supabase
      .from('edux_profiles')
      .select('xp')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user XP:', userError);
      return -1;
    }

    const { count, error } = await supabase
      .from('edux_profiles')
      .select('id', { count: 'exact', head: true })
      .gt('xp', userData.xp);

    if (error) {
      console.error('Error fetching user rank:', error);
      return -1;
    }

    return (count || 0) + 1;
  }
}

// ============ QUESTIONS (Optional - if you want to store questions in Supabase) ============

export async function fetchQuestionsFromSupabase(
  grade: number,
  topics: string[],
  difficulty: Difficulty,
  count: number = 15
): Promise<Question[]> {
  let query = supabase
    .from('edux_questions')
    .select('*')
    .eq('grade', grade)
    .eq('difficulty', difficulty)
    .eq('is_active', true);

  // Filter by topics if provided
  if (topics.length > 0) {
    query = query.in('category', topics);
  }

  const { data, error } = await query.limit(count * 2); // Fetch more to allow random selection

  if (error) {
    console.error('Error fetching questions:', error);
    return [];
  }

  // Shuffle and return requested count
  const shuffled = (data || []).sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============ AUTH HELPERS ============

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });
  return { data, error };
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google'
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Listen to auth state changes
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

// ============ PLATFORM STATS ============

export interface PlatformStats {
  totalPlayers: number;
  newPlayers: number;
  activePlayers: number;
  totalSoloPlays: number;
  totalMultiplayerPlays: number;
  totalXpAwarded: number;
  avgAccuracy: number;
  playsByGrade: Record<number, number>;
}

export async function getPlatformStats(from: string, to: string): Promise<PlatformStats> {
  const empty: PlatformStats = {
    totalPlayers: 0, newPlayers: 0, activePlayers: 0,
    totalSoloPlays: 0, totalMultiplayerPlays: 0,
    totalXpAwarded: 0, avgAccuracy: 0, playsByGrade: {}
  };

  try {
    // Total registered players (all time)
    const { count: totalPlayers } = await supabase
      .from('edux_profiles')
      .select('id', { count: 'exact', head: true });

    // New players registered in period
    const { count: newPlayers } = await supabase
      .from('edux_profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', from)
      .lte('created_at', to);

    // Game history in period
    const { data: periodGames, error: gamesError } = await supabase
      .from('edux_game_history')
      .select('user_id, grade, correct_count, total_questions, xp_earned, mode')
      .gte('played_at', from)
      .lte('played_at', to);

    if (gamesError) {
      console.error('Error fetching period games:', gamesError);
      return { ...empty, totalPlayers: totalPlayers ?? 0, newPlayers: newPlayers ?? 0 };
    }

    const games = periodGames || [];

    const activePlayers = new Set(games.map(g => g.user_id)).size;
    const totalSoloPlays = games.filter(g => !g.mode || g.mode === 'solo').length;
    const totalMultiplayerPlays = games.filter(g => g.mode === 'multiplayer').length;
    const totalXpAwarded = games.reduce((s, g) => s + (g.xp_earned || 0), 0);

    const totalCorrect = games.reduce((s, g) => s + (g.correct_count || 0), 0);
    const totalQuestions = games.reduce((s, g) => s + (g.total_questions || 0), 0);
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const playsByGrade: Record<number, number> = {};
    for (const g of games) {
      playsByGrade[g.grade] = (playsByGrade[g.grade] || 0) + 1;
    }

    return {
      totalPlayers: totalPlayers ?? 0,
      newPlayers: newPlayers ?? 0,
      activePlayers,
      totalSoloPlays,
      totalMultiplayerPlays,
      totalXpAwarded,
      avgAccuracy,
      playsByGrade
    };
  } catch (err) {
    console.error('Error fetching platform stats:', err);
    return empty;
  }
}

// ============ REALTIME SUBSCRIPTIONS ============

export function subscribeToLeaderboard(callback: (payload: any) => void) {
  return supabase
    .channel('leaderboard_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'edux_profiles' },
      callback
    )
    .subscribe();
}
