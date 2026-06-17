import { createClient } from '@supabase/supabase-js';
import { Question, Difficulty, UserProfile, GameHistory, GameResult } from '../types';
import { PROGRAM_START_DATE, getCurrentProgramWeek } from '../constants';

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
  // weekly_xp_week chỉ lưu local (localStorage), không sync lên Supabase
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

/**
 * Thống kê tổng từ TOÀN BỘ lịch sử đấu của user trên server.
 * Nguồn sự thật để: (1) đối chiếu/sửa profile.xp (counter có thể drift),
 * (2) hiển thị tổng kết full ở trang Lịch sử (danh sách chỉ giữ 50 trận gần nhất).
 */
export interface UserHistoryStats {
  totalGames: number;
  totalXp: number;
  totalCorrect: number;
  totalQuestions: number;
  bestStreak: number;
  totalTimeSpent: number;
  spinXp: number; // XP thưởng từ vòng quay may mắn
  gameIds: Set<string>;
}

/**
 * Đếm số trận MULTIPLAYER (thách đấu) đạt điểm > minScore trong tuần chương trình hiện tại.
 * Dùng để cộng lượt quay may mắn: 1 trận thắng > 150đ = +1 lượt quay (LuckySpin).
 * Trả về 0 nếu ngoài chương trình hoặc query lỗi.
 */
export async function getMultiplayerWinsThisWeek(
  userId: string,
  minScore: number = 150
): Promise<number> {
  const range = getCurrentWeekRangeIso();
  if (!range) return 0;
  const { count, error } = await supabase
    .from('edux_game_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('mode', 'multiplayer')
    .gt('score', minScore)
    .gte('played_at', range.startIso)
    .lt('played_at', range.endIso);
  if (error) {
    console.error('Error counting multiplayer wins this week:', error);
    return 0;
  }
  return count || 0;
}

export async function getUserHistoryStats(userId: string): Promise<UserHistoryStats | null> {
  const { data, error } = await supabase
    .from('edux_game_history')
    .select('id, xp_earned, correct_count, total_questions, max_streak, time_spent')
    .eq('user_id', userId)
    .limit(10000);

  if (error) {
    console.error('Error fetching user history stats:', error);
    return null;
  }

  const stats: UserHistoryStats = {
    totalGames: 0, totalXp: 0, totalCorrect: 0,
    totalQuestions: 0, bestStreak: 0, totalTimeSpent: 0,
    spinXp: 0,
    gameIds: new Set<string>(),
  };
  for (const g of data || []) {
    stats.totalGames++;
    stats.totalXp += Math.round(g.xp_earned || 0);
    stats.totalCorrect += Math.round(g.correct_count || 0);
    stats.totalQuestions += g.total_questions || 0;
    stats.bestStreak = Math.max(stats.bestStreak, g.max_streak || 0);
    stats.totalTimeSpent += g.time_spent || 0;
    stats.gameIds.add(g.id);
  }

  // XP từ vòng quay may mắn (bảng có thể chưa tạo — lỗi thì coi như 0)
  try {
    const { data: spins, error: spinErr } = await supabase
      .from('edux_spin_history')
      .select('xp_bonus')
      .eq('user_id', userId);
    if (!spinErr) {
      stats.spinXp = (spins || []).reduce((s, r) => s + Math.round(r.xp_bonus || 0), 0);
    }
  } catch { /* bảng chưa tồn tại — bỏ qua */ }

  return stats;
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

// ============ RECALCULATE ALL USERS XP ============

/**
 * Tính lại XP cho TẤT CẢ users từ game history trên Supabase.
 * Fix: correctCount float, xpEarned float, weeklyXp tích lũy sai.
 */
export async function recalculateAllUsersXp(programStartMs: number, currentWeek: number | null): Promise<{ total: number; fixed: number }> {
  const XP_MAP: Record<string, number> = {
    'Dễ': 10, 'Trung bình': 12, 'Khó': 15, 'Chuyên gia': 20
  };
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  // Lấy tất cả profiles
  const { data: profiles, error: pErr } = await supabase
    .from('edux_profiles')
    .select('id, xp, weekly_xp');
  if (pErr || !profiles) return { total: 0, fixed: 0 };

  let fixed = 0;

  // Biên tuần hiện tại (cùng range với BXH tuần) — dùng để cộng XP spin in-range
  const weekStart = currentWeek ? programStartMs + (currentWeek - 1) * msPerWeek : 0;
  const weekEnd = weekStart + msPerWeek;

  for (const profile of profiles) {
    // Lấy toàn bộ game history của user (cần `mode` + sort theo `played_at` để cap solo 7 trận/tuần)
    const { data: games, error: gErr } = await supabase
      .from('edux_game_history')
      .select('id, difficulty, correct_count, total_questions, xp_earned, max_streak, played_at, mode')
      .eq('user_id', profile.id)
      .order('played_at', { ascending: true });
    if (gErr || !games) continue;

    let totalXpRecalc = 0;
    let weeklyXpRecalc = 0;
    let soloThisWeekCount = 0; // đếm để cap 7 trận solo/tuần (quy định 3.1)
    const gameFixes: { id: string; correct_count: number; xp_earned: number }[] = [];

    for (const g of games) {
      const xpPerQ = XP_MAP[g.difficulty] || 10;
      const safeCorrect = Math.round(g.correct_count || 0);
      const correctXp = safeCorrect * xpPerQ;
      const streakBonus = (g.max_streak || 0) * 5;
      const oldRankBonus = Math.max(0, Math.round(g.xp_earned || 0) - correctXp - streakBonus);
      const newXp = correctXp + streakBonus + oldRankBonus;

      totalXpRecalc += newXp;

      // Tính weeklyXp cho tuần hiện tại — solo chỉ tính 7 trận đầu, multiplayer tính tất cả
      if (currentWeek && g.played_at) {
        const t = new Date(g.played_at).getTime();
        if (t >= weekStart && t < weekEnd) {
          const mode = g.mode || 'solo';
          if (mode === 'solo') {
            if (soloThisWeekCount < 7) {
              weeklyXpRecalc += newXp;
              soloThisWeekCount++;
            }
          } else {
            weeklyXpRecalc += newXp;
          }
        }
      }

      // Nếu game data sai → cần fix
      if (g.correct_count !== safeCorrect || Math.round(g.xp_earned) !== newXp) {
        gameFixes.push({ id: g.id, correct_count: safeCorrect, xp_earned: newXp });
      }
    }

    // Cộng XP thưởng vòng quay vào tổng XP + weeklyXp (đúng định nghĩa weekly XP = game + spin trong tuần)
    try {
      const { data: spins } = await supabase
        .from('edux_spin_history')
        .select('xp_bonus, created_at')
        .eq('user_id', profile.id);
      if (Array.isArray(spins)) {
        for (const s of spins) {
          const bonus = Math.round(s.xp_bonus || 0);
          if (bonus <= 0) continue;
          totalXpRecalc += bonus;
          if (currentWeek && s.created_at) {
            const t = new Date(s.created_at).getTime();
            if (t >= weekStart && t < weekEnd) weeklyXpRecalc += bonus;
          }
        }
      }
    } catch { /* bảng spin có thể chưa tạo — bỏ qua, weekly = chỉ trận đấu */ }

    const needsProfileFix = Math.round(profile.xp) !== totalXpRecalc ||
                            Math.round(profile.weekly_xp) !== weeklyXpRecalc ||
                            gameFixes.length > 0;

    if (needsProfileFix) {
      fixed++;
      // Update profile
      await supabase
        .from('edux_profiles')
        .update({
          xp: totalXpRecalc,
          weekly_xp: weeklyXpRecalc,
        })
        .eq('id', profile.id);

      // Update từng game bị sai
      for (const fix of gameFixes) {
        await supabase
          .from('edux_game_history')
          .update({ correct_count: fix.correct_count, xp_earned: fix.xp_earned })
          .eq('id', fix.id);
      }
    }
  }

  return { total: profiles.length, fixed };
}

// ============ LEADERBOARD ============

export async function getLeaderboard(limit: number = 10): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, equipped_frame, unlocked_frames, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .order('xp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
  return (data || []).map(toCamelCase);
}

/**
 * Khoảng thời gian (ISO) của tuần chương trình hiện tại.
 * Trả về null nếu ngoài chương trình.
 */
export function getCurrentWeekRangeIso(): { startIso: string; endIso: string } | null {
  const week = getCurrentProgramWeek();
  if (!week) return null;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const start = PROGRAM_START_DATE.getTime() + (week - 1) * msPerWeek;
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + msPerWeek).toISOString(),
  };
}

/**
 * Tổng XP theo user từ game history trong tuần hiện tại.
 * Fix bug BXH tuần: cột weekly_xp trong edux_profiles KHÔNG tự reset khi sang tuần
 * (chỉ reset client-side khi user mở app), nên user không chơi tuần này vẫn giữ
 * weekly_xp tuần cũ và chiếm top. Tính trực tiếp từ played_at mới chính xác.
 */
let weeklyTotalsCache: { totals: Map<string, number>; fetchedAt: number } | null = null;
const WEEKLY_TOTALS_CACHE_MS = 30 * 1000; // tránh query trùng khi rank + top5 gọi cùng lúc

async function getWeeklyXpTotals(): Promise<Map<string, number> | null> {
  const range = getCurrentWeekRangeIso();
  if (!range) return null;

  if (weeklyTotalsCache && Date.now() - weeklyTotalsCache.fetchedAt < WEEKLY_TOTALS_CACHE_MS) {
    return weeklyTotalsCache.totals;
  }

  const totals = new Map<string, number>();

  // ---------- (A) XP từ trận đấu trong tuần ----------
  // Ưu tiên RPC: Postgres GROUP BY + chỉ trả top 200 dòng (nhẹ, nhanh).
  // SQL tạo function: scripts/sql/weekly_leaderboard_rpc.sql
  const { data: rpcData, error: rpcError } = await supabase.rpc('edux_weekly_xp_totals', {
    p_start: range.startIso,
    p_end: range.endIso,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    for (const row of rpcData) {
      if (row.user_id) totals.set(row.user_id, Number(row.weekly_xp) || 0);
    }
  } else {
    // Fallback: RPC chưa được tạo trên Supabase → kéo raw rows về cộng client-side
    console.warn('edux_weekly_xp_totals RPC unavailable, falling back to raw query:', rpcError?.message);

    const { data, error } = await supabase
      .from('edux_game_history')
      .select('user_id, xp_earned, mode, played_at')
      .gte('played_at', range.startIso)
      .lt('played_at', range.endIso)
      .order('played_at', { ascending: true })
      .limit(10000);

    if (error) {
      console.error('Error fetching weekly game history:', error);
      return null;
    }

    // Quy định 3.1: solo chỉ tính 7 trận đầu tiên/tuần/user.
    const soloCount = new Map<string, number>();
    for (const g of data || []) {
      if (!g.user_id) continue;
      const mode = g.mode || 'solo';
      if (mode === 'solo') {
        const used = soloCount.get(g.user_id) || 0;
        if (used >= 7) continue;
        soloCount.set(g.user_id, used + 1);
      }
      totals.set(g.user_id, (totals.get(g.user_id) || 0) + Math.round(g.xp_earned || 0));
    }
  }

  // ---------- (B) XP thưởng từ vòng quay trong tuần ----------
  // Cộng vào BXH tuần. Nếu user chỉ có spin XP (không có trận đấu) vẫn lên hạng tuần.
  // Bảng edux_spin_history có thể chưa tồn tại trên project chưa chạy lucky_spin.sql → bỏ qua.
  try {
    const { data: spinRows, error: spinErr } = await supabase
      .from('edux_spin_history')
      .select('user_id, xp_bonus')
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .limit(10000);
    if (!spinErr && Array.isArray(spinRows)) {
      for (const r of spinRows) {
        if (!r.user_id) continue;
        const bonus = Math.round(r.xp_bonus || 0);
        if (bonus <= 0) continue;
        totals.set(r.user_id, (totals.get(r.user_id) || 0) + bonus);
      }
    } else if (spinErr) {
      console.warn('Spin XP not included in weekly totals:', spinErr.message);
    }
  } catch (e) {
    console.warn('Spin history table unavailable — weekly XP excludes spin:', e);
  }

  weeklyTotalsCache = { totals, fetchedAt: Date.now() };
  return totals;
}

export async function getWeeklyLeaderboard(limit: number = 10): Promise<UserProfile[]> {
  // Tính từ game history tuần này (chính xác), thay vì cột weekly_xp (không tự reset)
  const totals = await getWeeklyXpTotals();

  if (totals === null) {
    // Ngoài chương trình hoặc lỗi query → BXH tuần trống
    return [];
  }

  const top = [...totals.entries()]
    .filter(([, xp]) => xp > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  if (top.length === 0) return [];

  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, equipped_frame, unlocked_frames, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .in('id', top.map(([id]) => id));

  if (error) {
    console.error('Error fetching weekly leaderboard profiles:', error);
    return [];
  }

  const byId = new Map((data || []).map(p => [p.id, toCamelCase(p)]));
  return top
    .filter(([id]) => byId.has(id))
    .map(([id, weeklyXp]) => ({ ...byId.get(id)!, weeklyXp }));
}

export async function getLeaderboardByGrade(grade: number, limit: number = 10): Promise<UserProfile[]> {
  // Fetch profiles ordered by total xp (server-side, index `idx_edux_profiles_xp`),
  // then filter/sort by gradeXp client-side.
  // BUG fix: trước đây `.limit(200)` không có `.order()` → Postgres trả 200 rows
  // theo physical order (thường là cũ nhất), bỏ sót user mới có gradeXp cao →
  // BXH theo khối hiện thiếu hàng (vd user rank thật 19 lại xuất hiện ở vị trí 4
  // vì 15 user nằm giữa không được fetch về). gradeXp luôn ≤ xp nên user top
  // theo gradeXp gần như chắc chắn nằm trong top theo xp; thêm cushion limit 1000.
  const { data, error } = await supabase
    .from('edux_profiles')
    .select('id, name, avatar, equipped_frame, unlocked_frames, grade, xp, level, total_games, best_streak, weekly_xp, topic_stats, grade_xp')
    .order('xp', { ascending: false })
    .limit(1000);

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
    // For grade filter, we need to fetch all profiles and count.
    // Align fetch limit + ordering với getLeaderboardByGrade để 2 hàm thấy cùng tập dữ liệu
    // (trước đây getUserRank dùng default limit 1000, getLeaderboardByGrade chỉ 200 → lệch rank).
    const { data, error } = await supabase
      .from('edux_profiles')
      .select('id, grade_xp')
      .order('xp', { ascending: false })
      .limit(1000);

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

// Get user's weekly rank
// Tính từ game history tuần này (cùng nguồn với getWeeklyLeaderboard) để rank khớp BXH
export async function getWeeklyUserRank(userId: string): Promise<number> {
  const totals = await getWeeklyXpTotals();
  if (totals === null) return -1;

  const myXp = totals.get(userId) || 0;
  if (myXp <= 0) return -1; // Chưa chơi tuần này → chưa có hạng

  let higher = 0;
  totals.forEach((xp, id) => {
    if (id !== userId && xp > myXp) higher++;
  });
  return higher + 1;
}

// Get user's XP tuần này theo đúng range tuần đang xét (cùng nguồn với BXH tuần).
// Trả về 0 nếu chưa chơi trận nào trong tuần — KHÔNG dùng cột weekly_xp của profile
// vì cột này không tự reset khi sang tuần mới (sẽ giữ XP của tuần trước).
export async function getWeeklyUserXp(userId: string): Promise<number> {
  const totals = await getWeeklyXpTotals();
  if (totals === null) return 0;
  return totals.get(userId) || 0;
}

// ============ LUCKY SPIN ============

export interface SpinConfigRow {
  prizeId: string;
  weight: number;
  quota: number | null;
  enabled: boolean;
}

export interface SpinHistoryRow {
  id: string;
  userId: string;
  userName: string | null;
  prizeId: string;
  prizeLabel: string | null;
  xpBonus: number;
  week: number | null;
  phone: string | null;
  carrier: string | null;
  studentName: string | null;
  className: string | null;
  school: string | null;
  claimed: boolean;
  createdAt: string;
}

/** Cấu hình giải từ server (admin chỉnh qua trang quản lý). Lỗi/chưa có bảng → null (dùng default trong code). */
export async function getSpinConfig(): Promise<SpinConfigRow[] | null> {
  const { data, error } = await supabase.from('edux_spin_config').select('*');
  if (error || !data) return null;
  return data.map(r => ({
    prizeId: r.prize_id,
    weight: Number(r.weight) || 0,
    quota: r.quota === null || r.quota === undefined ? null : Number(r.quota),
    enabled: r.enabled !== false,
  }));
}

export async function updateSpinConfig(rows: SpinConfigRow[]): Promise<boolean> {
  const { error } = await supabase.from('edux_spin_config').upsert(
    rows.map(r => ({ prize_id: r.prizeId, weight: r.weight, quota: r.quota, enabled: r.enabled }))
  );
  if (error) console.error('Error updating spin config:', error);
  return !error;
}

/** Số người đã trúng theo từng giải (đếm quota). Lỗi → null (KHÔNG cho ra thẻ lượt đó để an toàn quota). */
export async function getSpinWinCounts(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.from('edux_spin_history').select('prize_id');
  if (error || !data) return null;
  const counts: Record<string, number> = {};
  for (const r of data) counts[r.prize_id] = (counts[r.prize_id] || 0) + 1;
  return counts;
}

/** Ghi lượt quay; trả về id dòng (để update thông tin nhận thưởng nếu trúng thẻ). */
export async function saveSpinResult(record: {
  userId: string; userName: string; prizeId: string; prizeLabel: string; xpBonus: number; week: number | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('edux_spin_history')
    .insert({
      user_id: record.userId,
      user_name: record.userName,
      prize_id: record.prizeId,
      prize_label: record.prizeLabel,
      xp_bonus: record.xpBonus,
      week: record.week,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Error saving spin result:', error);
    return null;
  }
  return data?.id ?? null;
}

/** HS điền form nhận thưởng thẻ điện thoại. */
export async function updateSpinContact(id: string, info: {
  phone: string; carrier: string; studentName: string; className: string; school: string;
}): Promise<boolean> {
  const { error } = await supabase
    .from('edux_spin_history')
    .update({
      phone: info.phone,
      carrier: info.carrier,
      student_name: info.studentName,
      class_name: info.className,
      school: info.school,
      claimed: true,
    })
    .eq('id', id);
  if (error) console.error('Error updating spin contact:', error);
  return !error;
}

/** Danh sách lượt quay cho trang quản lý. onlyCards = chỉ các giải thẻ điện thoại. */
export async function getSpinHistoryAdmin(onlyCards: boolean, limit: number = 500): Promise<SpinHistoryRow[]> {
  let query = supabase
    .from('edux_spin_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (onlyCards) query = query.like('prize_id', 'card%');
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    prizeId: r.prize_id,
    prizeLabel: r.prize_label,
    xpBonus: r.xp_bonus || 0,
    week: r.week,
    phone: r.phone,
    carrier: r.carrier,
    studentName: r.student_name,
    className: r.class_name,
    school: r.school,
    claimed: !!r.claimed,
    createdAt: r.created_at,
  }));
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
