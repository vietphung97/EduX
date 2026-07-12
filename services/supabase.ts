import { createClient } from '@supabase/supabase-js';
import { Question, Difficulty, UserProfile, GameHistory, GameResult } from '../types';
import { PROGRAM_START_DATE, getCurrentProgramWeek, getProgramWeekRangeMs } from '../constants';
import { getLevelFromXp } from '../utils/gameLogic';

// Supabase client initialization
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============ USER PROFILE ============

// Các trường ĐIỂM TÍCH LŨY — chỉ được CỘNG qua RPC atomic ở server
// (edux_record_game / edux_spin_wheel), KHÔNG BAO GIỜ được client ghi đè giá
// trị tuyệt đối. Quy tắc (Viet 2026-07-03): "client không được ghi đè lên
// server, điểm chỉ được cộng chứ không được set". Danh sách này bị loại khỏi
// mọi update/upsert đi qua client (toSnakeCase), chỉ giữ khi TẠO MỚI profile
// (createUserProfile — luôn khởi tạo = 0, không phải ghi đè tiến độ có sẵn).
const CUMULATIVE_FIELDS: (keyof UserProfile)[] = [
  'xp', 'weeklyXp', 'gradeXp', 'totalGames', 'bestStreak', 'topicStats', 'level',
];

// Helper to convert camelCase to snake_case for Supabase.
// includeCumulative=false (mặc định): BỎ mọi trường điểm tích lũy → client chỉ
// ghi được field định danh/cosmetic (name, avatar, grade, unlocked/equipped frame).
function toSnakeCase(profile: Partial<UserProfile>, includeCumulative = false): Record<string, any> {
  const result: Record<string, any> = {};
  if (profile.id !== undefined) result.id = profile.id;
  if (profile.name !== undefined) result.name = profile.name;
  if (profile.avatar !== undefined) result.avatar = profile.avatar;
  if (profile.grade !== undefined) result.grade = profile.grade;
  if (profile.unlockedFrames !== undefined) result.unlocked_frames = profile.unlockedFrames;
  if (profile.equippedFrame !== undefined) result.equipped_frame = profile.equippedFrame;
  // weekly_xp_week chỉ lưu local (localStorage), không sync lên Supabase
  if (includeCumulative) {
    if (profile.xp !== undefined) result.xp = profile.xp;
    if (profile.level !== undefined) result.level = profile.level;
    if (profile.totalGames !== undefined) result.total_games = profile.totalGames;
    if (profile.bestStreak !== undefined) result.best_streak = profile.bestStreak;
    if (profile.weeklyXp !== undefined) result.weekly_xp = profile.weeklyXp;
    if (profile.topicStats !== undefined) result.topic_stats = profile.topicStats;
    if (profile.gradeXp !== undefined) result.grade_xp = profile.gradeXp;
  }
  return result;
}

// Helper to convert snake_case to camelCase from Supabase
// level LUÔN derive từ xp (KHÔNG tin cột level lưu trữ trong DB) — cột đó dễ
// bị lệch vì các RPC cộng điểm (edux_record_game/edux_spin_wheel) không cập
// nhật nó, chỉ đúng lúc tạo profile rồi "đóng băng". Xem getLevelFromXp.
function toCamelCase(data: Record<string, any>): UserProfile {
  return {
    id: data.id,
    name: data.name,
    avatar: data.avatar,
    grade: data.grade,
    xp: data.xp,
    level: getLevelFromXp(data.xp || 0).level,
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

// Tạo profile MỚI. Đây là trường hợp DUY NHẤT được ghi trường điểm tích lũy
// từ client — nhưng chỉ vì user mới luôn khởi tạo điểm = 0 (không phải ghi đè
// tiến độ có sẵn). Nếu profile đã tồn tại, insert sẽ bị chặn bởi PK (không đè).
export async function createUserProfile(profile: UserProfile): Promise<boolean> {
  const snakeCaseProfile = toSnakeCase(profile, /* includeCumulative */ true);

  const { error } = await supabase
    .from('edux_profiles')
    .insert(snakeCaseProfile);

  if (error) {
    console.error('Error creating user profile:', error);
    return false;
  }
  return true;
}

// Upsert profile — CHỈ ghi field định danh/cosmetic (name, avatar, grade,
// unlocked/equipped frame). Điểm tích lũy (xp/weekly_xp/grade_xp/total_games/
// best_streak/topic_stats) KHÔNG BAO GIỜ đi qua đây — chỉ được cộng atomic bởi
// RPC edux_record_game / edux_spin_wheel ở server. Đây là chốt chặn để client
// không thể ghi đè điểm lên server (quy tắc Viet 2026-07-03).
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

export interface RecordGameResult {
  effectiveXp: number;
  capped: boolean;
  newXp: number;
  newWeeklyXp: number;
  newTotalGames: number;
  newBestStreak: number;
}

/**
 * Ghi 1 trận đấu + cộng XP ATOMIC ở server qua RPC edux_record_game
 * (scripts/sql/edux_record_game_rpc.sql). Thay cho cách cũ (client tự tính
 * `newXp = user.xp + delta` rồi upsert giá trị tuyệt đối), vốn gây race
 * condition khi 2 trận kết thúc gần nhau, và không chặn được cap 7 trận
 * solo/tuần khi user mở nhiều tab/thiết bị (cap cũ chỉ đếm từ state client).
 * Trả về effectiveXp/capped để UI biết trận này có bị cap hay không.
 */
export async function recordGame(
  userId: string,
  game: GameHistory,
  rawXp: number,
  topicCorrect: Record<string, number>,
  topicTotal: Record<string, number>
): Promise<RecordGameResult | null> {
  const { data, error } = await supabase.rpc('edux_record_game', {
    p_user_id: userId,
    p_game_id: game.id,
    p_played_at: game.playedAt,
    p_grade: game.grade,
    p_topics: game.topics,
    p_difficulty: game.difficulty,
    p_correct_count: game.correctCount,
    p_total_questions: game.totalQuestions,
    p_raw_xp: Math.round(rawXp),
    p_max_streak: game.maxStreak,
    p_time_spent: game.timeSpent,
    p_score: game.score,
    p_mode: game.mode || 'solo',
    p_room_code: game.roomCode || null,
    p_topic_correct: topicCorrect,
    p_topic_total: topicTotal,
  });

  if (error || !data || !data[0]) {
    console.error('Error recording game via RPC:', error);
    return null;
  }
  const row = data[0];
  return {
    effectiveXp: row.effective_xp,
    capped: row.capped,
    newXp: row.new_xp,
    newWeeklyXp: row.new_weekly_xp,
    newTotalGames: row.new_total_games,
    newBestStreak: row.new_best_streak,
  };
}

/**
 * Quay vòng may mắn HOÀN TOÀN Ở SERVER (RPC edux_spin_wheel — xem
 * scripts/sql/fix_spin_quota_race_condition.sql).
 * Thay cho cách cũ: client tự random giải dựa trên getSpinWinCounts() đọc
 * trước đó rồi mới ghi record — có race window giữa đọc và ghi khiến
 * nhiều lượt quay đồng thời cùng "lọt" qua quota rồi cùng insert, làm
 * tổng số người trúng 1 giải thẻ vượt quota cấu hình (thấy thực tế
 * card20 quota=10 nhưng có 14 người trúng, 2026-07-02).
 * RPC dùng pg_advisory_xact_lock để serialize hoá toàn bộ lượt quay,
 * nên random + kiểm tra quota + insert luôn atomic — không thể vượt quota.
 */
export async function spinWheelServer(record: {
  userId: string; userName: string; week: number | null;
}): Promise<{ prizeId: string; prizeLabel: string; xpBonus: number; spinId: string | null; newXp: number; newWeeklyXp: number; spinsLeft: number; outOfSpins: boolean } | null> {
  const { data, error } = await supabase.rpc('edux_spin_wheel', {
    p_user_id: record.userId,
    p_user_name: record.userName,
    p_week: record.week,
  });
  if (error || !data || !data[0]) {
    console.error('Error spinning wheel via RPC:', error);
    return null;
  }
  const row = data[0];
  // RPC trả prize_id='no_spins' khi user đã hết lượt (quota enforce ở server).
  const outOfSpins = row.prize_id === 'no_spins';
  return {
    prizeId: row.prize_id,
    prizeLabel: row.prize_label,
    xpBonus: row.xp_bonus,
    spinId: row.spin_id ?? null,
    newXp: row.new_xp,
    newWeeklyXp: row.new_weekly_xp,
    spinsLeft: row.spins_left ?? 0,
    outOfSpins,
  };
}

/**
 * Số lượt quay CÒN LẠI của user trong tuần — tính HOÀN TOÀN Ở SERVER
 * (nguồn: edux_game_history cho MP wins + edux_spin_history cho số đã quay).
 * Dùng để hiển thị/khóa nút quay, thay cho user.spinsUsed (local, dễ reset
 * khi reload → từng gây quay vượt quota). RPC edux_spin_quota_left.
 */
export async function getSpinsLeft(userId: string, week: number | null): Promise<{ allowed: number; used: number; left: number } | null> {
  const { data, error } = await supabase.rpc('edux_spin_quota_left', {
    p_user_id: userId,
    p_week: week,
  });
  if (error || !data || !data[0]) {
    console.error('Error fetching spins left via RPC:', error);
    return null;
  }
  return { allowed: data[0].allowed, used: data[0].used, left: data[0].left };
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
  // Ưu tiên RPC: tổng hợp toàn bộ lịch sử trên server (không cap 1000 dòng) +
  // trả mảng game_ids để client lọc trận chỉ-có-ở-local.
  // SQL: scripts/sql/edux_stats_aggregation_rpc.sql
  const { data: rpc, error: rpcError } = await supabase.rpc('edux_user_history_stats', {
    p_user_id: userId,
  });

  if (!rpcError && rpc) {
    const r = rpc as any;
    const ids: string[] = Array.isArray(r.gameIds) ? r.gameIds : [];
    return {
      totalGames: Number(r.totalGames) || 0,
      totalXp: Number(r.totalXp) || 0,
      totalCorrect: Number(r.totalCorrect) || 0,
      totalQuestions: Number(r.totalQuestions) || 0,
      bestStreak: Number(r.bestStreak) || 0,
      totalTimeSpent: Number(r.totalTimeSpent) || 0,
      spinXp: Number(r.spinXp) || 0,
      gameIds: new Set<string>(ids),
    };
  }

  // Fallback: RPC chưa deploy → kéo raw về cộng client-side (nâng limit 50000).
  console.warn('edux_user_history_stats RPC unavailable, falling back to raw query:', rpcError?.message);

  const { data, error } = await supabase
    .from('edux_game_history')
    .select('id, xp_earned, correct_count, total_questions, max_streak, time_spent')
    .eq('user_id', userId)
    .limit(50000);

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
      .eq('user_id', userId)
      .limit(50000);
    if (!spinErr) {
      stats.spinXp = (spins || []).reduce((s, r) => s + Math.round(r.xp_bonus || 0), 0);
    }
  } catch { /* bảng chưa tồn tại — bỏ qua */ }

  return stats;
}

// ============ RECALCULATE ALL USERS XP ============
// (grade_xp KHÔNG còn được tính lại riêng lẻ — recalculateAllUsersXp() dưới
// đây LUÔN tính lại xp + grade_xp CÙNG LÚC từ history, tránh 2 field lệch
// nhau độc lập. Bug thực tế 2026-07-06: 1 user grade_xp['6']=7033 trong khi
// xp thật (khớp game history) chỉ 1860, do trước đây có 1 đường tách biệt
// edux_recalc_grade_xp/migrateAllUsersGradeXp chỉ sửa grade_xp mà không sửa
// xp — đã xoá đường này, chỉ còn recalculateAllUsersXp là nguồn duy nhất.)

/**
 * Tính lại XP cho TẤT CẢ users từ game history trên Supabase.
 * Fix: correctCount float, xpEarned float, weeklyXp tích lũy sai.
 */
export async function recalculateAllUsersXp(programStartMs: number, currentWeek: number | null): Promise<{ total: number; fixed: number }> {
  // Ưu tiên RPC: chuyển toàn bộ vòng lặp per-user + cap solo 7/tuần + fix game
  // xuống Postgres. Tránh cả 2 rủi ro cap 1000 (>1000 profiles bị bỏ sót,
  // >1000 games/user bị cắt) mà bản client-side dưới đây mắc phải.
  // SQL: scripts/sql/edux_stats_aggregation_rpc.sql
  const { data: rpc, error: rpcError } = await supabase.rpc('edux_recalc_all_xp', {
    p_program_start_ms: programStartMs,
    p_current_week: currentWeek,
  });

  if (!rpcError && rpc) {
    // RPC trả table 1 dòng → supabase-js đưa về mảng [{ total, fixed }]
    const row = Array.isArray(rpc) ? rpc[0] : rpc;
    if (row) return { total: Number(row.total) || 0, fixed: Number(row.fixed) || 0 };
  }

  // Fallback: RPC chưa deploy → tính client-side.
  // ⚠ Bản này dính cap 1000 nếu >1000 profiles hoặc >1000 games/user. Nâng
  // limit games lên 50000; cách đúng là deploy RPC ở trên.
  console.warn('edux_recalc_all_xp RPC unavailable, falling back to client-side loop:', rpcError?.message);

  const XP_MAP: Record<string, number> = {
    'Dễ': 10, 'Trung bình': 12, 'Khó': 15, 'Chuyên gia': 20
  };
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  // Lấy tất cả profiles
  const { data: profiles, error: pErr } = await supabase
    .from('edux_profiles')
    .select('id, xp, weekly_xp, total_games, grade, grade_xp, level')
    .limit(50000);
  if (pErr || !profiles) return { total: 0, fixed: 0 };

  let fixed = 0;

  // Biên tuần hiện tại (cùng range với BXH tuần) — dùng để cộng XP spin in-range.
  // KHÔNG dùng programStartMs + (week-1)*7ngày vì Tuần 1 ngắn (5 ngày, Wed→Sun).
  const weekRange = currentWeek ? getProgramWeekRangeMs(currentWeek) : null;
  const weekStart = weekRange ? weekRange.startMs : 0;
  const weekEnd = weekRange ? weekRange.endMs : 0;

  for (const profile of profiles) {
    // Lấy toàn bộ game history của user (cần `mode` + sort theo `played_at` để cap solo 7 trận/tuần)
    const { data: games, error: gErr } = await supabase
      .from('edux_game_history')
      .select('id, difficulty, correct_count, total_questions, xp_earned, max_streak, played_at, mode, grade')
      .eq('user_id', profile.id)
      .order('played_at', { ascending: true })
      .limit(50000);
    if (gErr || !games) continue;

    let totalXpRecalc = 0;
    let weeklyXpRecalc = 0;
    // Track số trận solo đã cộng XP TRONG MỖI TUẦN LỊCH (Mon-Sun VN).
    // Decision Viet 2026-06-19: siết cap 7 solo/tuần MỌI LÚC (kể cả ngoài chương
    // trình) → key theo "calendar week" thay vì "program week".
    // weekKey = floor((t_ms_vn - epochMonVn) / msPerWeek)
    //   epochMonVn = 1970-01-05T00:00:00+07:00 (một Thứ Hai cố định, trước mọi game).
    const epochMonVnMs = Date.UTC(1970, 0, 5, 0, 0, 0) - 7 * 60 * 60 * 1000;
    const soloCountByWeek = new Map<number, number>();
    const gameFixes: { id: string; correct_count: number; xp_earned: number }[] = [];
    // grade_xp tính lại thuần từ game history (mỗi trận cộng vào đúng grade
    // lúc chơi trận đó — khớp edux_recalc_grade_xp).
    const gradeXpRecalc: Record<string, number> = {};

    for (const g of games) {
      const xpPerQ = XP_MAP[g.difficulty] || 10;
      const safeCorrect = Math.round(g.correct_count || 0);
      const correctXp = safeCorrect * xpPerQ;
      const streakBonus = (g.max_streak || 0) * 5;
      const oldRankBonus = Math.max(0, Math.round(g.xp_earned || 0) - correctXp - streakBonus);
      const rawXp = correctXp + streakBonus + oldRankBonus;

      // Áp cap chặt solo 7 trận / tuần lịch
      const mode = g.mode || 'solo';
      let effectiveXp = rawXp;
      if (mode === 'solo' && g.played_at) {
        const t = new Date(g.played_at).getTime();
        const weekKey = Math.floor((t - epochMonVnMs) / msPerWeek);
        const cur = soloCountByWeek.get(weekKey) || 0;
        if (cur >= 7) {
          effectiveXp = 0; // vượt cap → trận luyện tập, không tính XP
        } else {
          soloCountByWeek.set(weekKey, cur + 1);
        }
      }

      totalXpRecalc += effectiveXp;

      const gradeKey = String(g.grade);
      gradeXpRecalc[gradeKey] = (gradeXpRecalc[gradeKey] || 0) + effectiveXp;

      // weeklyXp cho tuần hiện tại — dùng effectiveXp (đã cap)
      if (currentWeek && g.played_at) {
        const t = new Date(g.played_at).getTime();
        if (t >= weekStart && t < weekEnd) {
          weeklyXpRecalc += effectiveXp;
        }
      }

      // Nếu game data sai → cần fix (xp_earned trong DB phải khớp effectiveXp đã cap)
      if (g.correct_count !== safeCorrect || Math.round(g.xp_earned) !== effectiveXp) {
        gameFixes.push({ id: g.id, correct_count: safeCorrect, xp_earned: effectiveXp });
      }
    }

    // Cộng XP thưởng vòng quay vào tổng XP + weeklyXp + grade_xp[khối hiện tại]
    // (đúng định nghĩa weekly XP = game + spin trong tuần; grade_xp phải khớp
    // xp tổng để BXH theo khối và BXH toàn bộ nhất quán — xem edux_spin_wheel).
    try {
      const { data: spins } = await supabase
        .from('edux_spin_history')
        .select('xp_bonus, created_at')
        .eq('user_id', profile.id)
        .limit(50000);
      if (Array.isArray(spins)) {
        for (const s of spins) {
          const bonus = Math.round(s.xp_bonus || 0);
          if (bonus <= 0) continue;
          totalXpRecalc += bonus;
          const gradeKey = String(profile.grade);
          gradeXpRecalc[gradeKey] = (gradeXpRecalc[gradeKey] || 0) + bonus;
          if (currentWeek && s.created_at) {
            const t = new Date(s.created_at).getTime();
            if (t >= weekStart && t < weekEnd) weeklyXpRecalc += bonus;
          }
        }
      }
    } catch { /* bảng spin có thể chưa tạo — bỏ qua, weekly = chỉ trận đấu */ }

    // total_games PHẢI khớp số dòng thật trong edux_game_history — edux_record_game
    // có thể đã cộng total_games+1 dù insert bị "on conflict do nothing" bỏ qua
    // (bug cũ, đã fix ở edux_record_game_rpc.sql), khiến 1 số profile có
    // total_games > số game thật. Reconcile lại từ games.length (nguồn thật).
    const realTotalGames = games.length;
    const gradeXpChanged = JSON.stringify(profile.grade_xp || {}) !== JSON.stringify(gradeXpRecalc);
    // level PHẢI khớp xp thật — cột level KHÔNG tự cập nhật khi xp tăng qua
    // edux_record_game/edux_spin_wheel (không đụng cột level), nên chỉ đúng
    // lúc tạo profile (xp=0) rồi "đóng băng" mãi mãi nếu không recalc.
    const levelRecalc = getLevelFromXp(totalXpRecalc).level;
    const needsProfileFix = Math.round(profile.xp) !== totalXpRecalc ||
                            Math.round(profile.weekly_xp) !== weeklyXpRecalc ||
                            profile.total_games !== realTotalGames ||
                            gradeXpChanged ||
                            profile.level !== levelRecalc ||
                            gameFixes.length > 0;

    if (needsProfileFix) {
      fixed++;
      // Update profile
      await supabase
        .from('edux_profiles')
        .update({
          xp: totalXpRecalc,
          weekly_xp: weeklyXpRecalc,
          total_games: realTotalGames,
          grade_xp: gradeXpRecalc,
          level: levelRecalc,
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
  const { startMs, endMs } = getProgramWeekRangeMs(week);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
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

/**
 * Số người đã trúng theo từng giải (đếm quota), CHỈ tính trong tuần chương trình hiện tại
 * (quota tự khôi phục mỗi tuần — lịch sử tuần trước vẫn được giữ nguyên trong DB, chỉ không tính vào quota tuần này).
 * Lỗi → null (KHÔNG cho ra thẻ lượt đó để an toàn quota).
 *
 * ⚠ TRƯỚC ĐÂY hàm này .select('prize_id') KHÔNG limit rồi tự đếm ở client —
 * PostgREST mặc định trả tối đa 1000 dòng/request (giới hạn max-rows độc lập
 * RLS). Khi tổng số lượt quay trong tuần vượt 1000 dòng, các dòng bị cắt
 * ngoài trang đầu (không đảm bảo thứ tự khi chưa ORDER BY) làm object counts
 * thiếu hẳn một số prize_id — thấy thực tế: card100 (chỉ 1 dòng) biến mất
 * khỏi counts dù có trong DB, khiến Admin hiển thị nhầm quota 0/1.
 * FIX: dùng head:true + count:'exact' cho TỪNG prize_id — server tự đếm,
 * không kéo dữ liệu về client nên không bao giờ bị giới hạn max-rows.
 */
export async function getSpinWinCounts(week: number | null): Promise<Record<string, number> | null> {
  const CARD_PRIZE_IDS = ['card10', 'card20', 'card50', 'card100'];
  try {
    const results = await Promise.all(CARD_PRIZE_IDS.map(async prizeId => {
      let query = supabase
        .from('edux_spin_history')
        .select('id', { count: 'exact', head: true })
        .eq('prize_id', prizeId);
      query = week === null ? query.is('week', null) : query.eq('week', week);
      const { count, error } = await query;
      if (error) throw error;
      return [prizeId, count || 0] as const;
    }));
    return Object.fromEntries(results);
  } catch (e) {
    console.error('Error fetching spin win counts:', e);
    return null;
  }
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
    // Ưu tiên RPC: Postgres SUM/COUNT/GROUP BY trên toàn bảng, KHÔNG dính cap
    // 1000 dòng của PostgREST. SQL: scripts/sql/edux_stats_aggregation_rpc.sql
    const { data: rpc, error: rpcError } = await supabase.rpc('edux_platform_stats', {
      p_from: from,
      p_to: to,
    });

    if (!rpcError && rpc) {
      const r = rpc as any;
      return {
        totalPlayers: Number(r.totalPlayers) || 0,
        newPlayers: Number(r.newPlayers) || 0,
        activePlayers: Number(r.activePlayers) || 0,
        totalSoloPlays: Number(r.totalSoloPlays) || 0,
        totalMultiplayerPlays: Number(r.totalMultiplayerPlays) || 0,
        totalXpAwarded: Number(r.totalXpAwarded) || 0,
        avgAccuracy: Number(r.avgAccuracy) || 0,
        playsByGrade: normalizeGradeMap(r.playsByGrade),
      };
    }

    // Fallback: RPC chưa deploy → kéo raw rows về cộng client-side.
    // ⚠ CẢNH BÁO: nhánh này lại dính cap 1000 dòng khi kỳ báo cáo đông. Nâng
    // limit lên 50000 để giảm rủi ro, nhưng cách đúng là deploy RPC ở trên.
    console.warn('edux_platform_stats RPC unavailable, falling back to raw query:', rpcError?.message);

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
      .lte('played_at', to)
      .limit(50000);

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

/** RPC trả playsByGrade dạng { "6": 12 } (key string) → chuẩn hoá về Record<number, number>. */
function normalizeGradeMap(raw: any): Record<number, number> {
  const out: Record<number, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const g = Number(k);
      if (!Number.isNaN(g)) out[g] = Number(v) || 0;
    }
  }
  return out;
}

// ============ REALTIME SUBSCRIPTIONS ============
// subscribeToLeaderboard đã xoá: subscribe không filter trên toàn bảng edux_profiles
// ngốn Realtime Messages quota, và không có nơi nào gọi hàm này.

// ============ PROGRAM RESET (ADMIN) ============
// Dùng cho trang admin ẩn (/#admin-vongquay) khi chuẩn bị chương trình mới:
// xoá XP, lịch sử thi đấu, lịch sử vòng quay (kèm quà tặng) của TẤT CẢ user.
// Bắt buộc backup CSV trước khi gọi reset (UI ép quy trình này).

export interface ProgramResetSnapshot {
  profiles: any[];
  gameHistory: any[];
  spinHistory: any[];
  fetchedAt: string;
}

/**
 * Lấy snapshot toàn bộ dữ liệu chương trình hiện tại để backup CSV.
 * Trả về null nếu query lỗi (không cho phép reset khi không backup được).
 */
export async function getProgramResetSnapshot(): Promise<ProgramResetSnapshot | null> {
  try {
    const [pRes, gRes, sRes] = await Promise.all([
      supabase.from('edux_profiles').select('*').limit(50000),
      supabase.from('edux_game_history').select('*').order('played_at', { ascending: true }).limit(50000),
      supabase.from('edux_spin_history').select('*').order('created_at', { ascending: true }).limit(50000),
    ]);
    if (pRes.error) { console.error('snapshot profiles error', pRes.error); return null; }
    if (gRes.error) { console.error('snapshot game_history error', gRes.error); return null; }
    // edux_spin_history có thể chưa tồn tại → coi như rỗng
    const spinHistory = sRes.error ? [] : (sRes.data || []);
    return {
      profiles: pRes.data || [],
      gameHistory: gRes.data || [],
      spinHistory,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('getProgramResetSnapshot exception', e);
    return null;
  }
}

/** Thống kê dữ liệu sẽ bị reset — tính client-side từ snapshot, không đụng DB. */
export interface ProgramResetStats {
  fetchedAt: string;
  profiles: {
    total: number;
    withXp: number;            // có xp > 0
    totalXp: number;           // sum xp
    totalWeeklyXp: number;     // sum weekly_xp
    totalGames: number;        // sum total_games
    withUnlockedFrames: number; // có ít nhất 1 khung unlock
    framesUnlockedTotal: number; // tổng số khung unlock (cộng dồn)
    topXp: { id: string; name: string; xp: number }[]; // top 5 để preview
    byGrade: Record<number, number>;
  };
  gameHistory: {
    total: number;
    solo: number;
    multiplayer: number;
    byGrade: Record<number, number>;
    totalXpEarned: number;
    earliest: string | null;
    latest: string | null;
  };
  spinHistory: {
    total: number;
    byPrize: Record<string, number>;    // số lượt theo prize_id
    cardsWon: number;                   // tổng thẻ đã trúng (mọi mệnh giá)
    cardsClaimed: number;               // đã điền form nhận
    cardsUnclaimed: number;             // ⚠ trúng nhưng chưa nhận — sẽ MẤT khi xóa
    unclaimedDetail: { userName: string; prizeLabel: string; createdAt: string }[]; // tối đa 20
    totalXpBonus: number;               // tổng XP từ vòng quay
  };
}

/** Tính stats từ snapshot (không cần round-trip thêm). */
export function computeResetStats(snap: ProgramResetSnapshot): ProgramResetStats {
  // ---- profiles ----
  const profilesByGrade: Record<number, number> = {};
  let totalXp = 0, totalWeeklyXp = 0, totalGames = 0, withXp = 0;
  let withUnlockedFrames = 0, framesUnlockedTotal = 0;
  const topXp = snap.profiles
    .map(p => ({ id: p.id, name: p.name || p.id, xp: Number(p.xp) || 0 }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5);

  for (const p of snap.profiles) {
    const xp = Number(p.xp) || 0;
    totalXp += xp;
    totalWeeklyXp += Number(p.weekly_xp) || 0;
    totalGames += Number(p.total_games) || 0;
    if (xp > 0) withXp++;
    const frames = Array.isArray(p.unlocked_frames) ? p.unlocked_frames : [];
    if (frames.length > 0) {
      withUnlockedFrames++;
      framesUnlockedTotal += frames.length;
    }
    const g = Number(p.grade);
    if (g) profilesByGrade[g] = (profilesByGrade[g] || 0) + 1;
  }

  // ---- game history ----
  const gamesByGrade: Record<number, number> = {};
  let solo = 0, multi = 0, totalXpEarned = 0;
  let earliest: string | null = null, latest: string | null = null;
  for (const g of snap.gameHistory) {
    const mode = g.mode || 'solo';
    if (mode === 'multiplayer') multi++; else solo++;
    totalXpEarned += Number(g.xp_earned) || 0;
    const gr = Number(g.grade);
    if (gr) gamesByGrade[gr] = (gamesByGrade[gr] || 0) + 1;
    if (g.played_at) {
      if (!earliest || g.played_at < earliest) earliest = g.played_at;
      if (!latest || g.played_at > latest) latest = g.played_at;
    }
  }

  // ---- spin history ----
  const byPrize: Record<string, number> = {};
  let cardsWon = 0, cardsClaimed = 0, cardsUnclaimed = 0, totalXpBonus = 0;
  const unclaimedDetail: ProgramResetStats['spinHistory']['unclaimedDetail'] = [];
  for (const s of snap.spinHistory) {
    const pid = s.prize_id || 'unknown';
    byPrize[pid] = (byPrize[pid] || 0) + 1;
    totalXpBonus += Number(s.xp_bonus) || 0;
    if (typeof pid === 'string' && pid.startsWith('card')) {
      cardsWon++;
      if (s.claimed) {
        cardsClaimed++;
      } else {
        cardsUnclaimed++;
        if (unclaimedDetail.length < 20) {
          unclaimedDetail.push({
            userName: s.user_name || s.user_id || '?',
            prizeLabel: s.prize_label || pid,
            createdAt: s.created_at || '',
          });
        }
      }
    }
  }

  return {
    fetchedAt: snap.fetchedAt,
    profiles: {
      total: snap.profiles.length,
      withXp,
      totalXp,
      totalWeeklyXp,
      totalGames,
      withUnlockedFrames,
      framesUnlockedTotal,
      topXp,
      byGrade: profilesByGrade,
    },
    gameHistory: {
      total: snap.gameHistory.length,
      solo,
      multiplayer: multi,
      byGrade: gamesByGrade,
      totalXpEarned,
      earliest,
      latest,
    },
    spinHistory: {
      total: snap.spinHistory.length,
      byPrize,
      cardsWon,
      cardsClaimed,
      cardsUnclaimed,
      unclaimedDetail,
      totalXpBonus,
    },
  };
}

export interface ProgramResetResult {
  ok: boolean;
  profilesReset: number;
  gameHistoryDeleted: number;
  spinHistoryDeleted: number;
  error?: string;
}

/**
 * RESET CHƯƠNG TRÌNH — xoá tiến trình + lịch sử của TẤT CẢ user.
 *
 * BẮT BUỘC gọi qua RPC `edux_admin_reset_program` (SECURITY DEFINER) vì:
 *   - edux_profiles có RLS `USING (auth.uid() = id)` → UPDATE từ anon key
 *     bị block SILENT (Supabase trả error=null, data=[] — không phát hiện
 *     được). Bản trước đó dùng UPDATE trực tiếp → trang admin báo "OK
 *     reset N profile" nhưng thực tế 0 row bị sửa, BXH/XP còn nguyên.
 *   - edux_game_history KHÔNG có DELETE policy → cũng bị block.
 *
 * Cách chạy RPC này: chạy file scripts/sql/admin_reset_program.sql trên
 * Supabase SQL Editor (1 lần là xong). Nếu RPC chưa tồn tại, hàm này
 * trả về error rõ ràng kèm hướng dẫn.
 *
 * - edux_game_history: DELETE toàn bộ.
 * - edux_spin_history: DELETE toàn bộ (reset quota thẻ về mặc định).
 * - edux_profiles: reset xp=0, weekly_xp=0, level=1, total_games=0, best_streak=0,
 *   topic_stats={}, grade_xp={}, unlocked_frames=[], equipped_frame=null.
 *   GIỮ id, name, avatar, grade (tài khoản học sinh không bị xoá).
 */
export async function resetProgramAllUsers(): Promise<ProgramResetResult> {
  const { data, error } = await supabase.rpc('edux_admin_reset_program');

  if (error) {
    // Function chưa tồn tại trên Supabase
    if (/function .* does not exist/i.test(error.message) || error.code === 'PGRST202') {
      return {
        ok: false,
        profilesReset: 0,
        gameHistoryDeleted: 0,
        spinHistoryDeleted: 0,
        error: 'CHƯA TẠO RPC. Vào Supabase SQL Editor → chạy file scripts/sql/admin_reset_program.sql (1 lần), rồi thử lại. (Lý do: RLS chặn UPDATE/DELETE từ anon key silent — phải dùng SECURITY DEFINER.)',
      };
    }
    return {
      ok: false,
      profilesReset: 0,
      gameHistoryDeleted: 0,
      spinHistoryDeleted: 0,
      error: error.message,
    };
  }

  // RPC trả về JSONB { ok, profiles_reset, game_history_deleted, spin_history_deleted, reset_at }
  const r = (data || {}) as Record<string, any>;

  // Đập cache BXH tuần (30s TTL) để mở lại BXH thấy 0 ngay
  weeklyTotalsCache = null;

  return {
    ok: r.ok !== false,
    profilesReset: Number(r.profiles_reset) || 0,
    gameHistoryDeleted: Number(r.game_history_deleted) || 0,
    spinHistoryDeleted: Number(r.spin_history_deleted) || 0,
  };
}
                                                                                                            