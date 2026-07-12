/**
 * Multiplayer synchronization via Supabase Realtime + KV Store
 * Adapted from flipcard.eduso.vn pattern
 */

import { supabase } from '../services/supabase';
import { MultiplayerGameState, PlayerInfo, Question, Difficulty } from '../types';
import { XP_PER_QUESTION } from './gameLogic';

// Constants
const ROOM_PREFIX = 'edux_room_';
const ROOM_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const POLL_INTERVAL_MS = 1000; // 1 second polling during countdown/playing
const POLL_INTERVAL_LOBBY_MS = 2500; // slower polling in waiting lobby (giảm egress)
const INACTIVITY_TIMEOUT_MS = 60 * 1000; // 60 seconds

// ============ ROOM CODE GENERATION ============

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like O/0, I/1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ KV STORE OPERATIONS ============

async function getFromKV(key: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('edux_kv_store')
      .select('value, updated_at')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('KV get error:', error);
      return null;
    }

    // Check expiration
    const updatedAt = new Date(data.updated_at).getTime();
    if (Date.now() - updatedAt > ROOM_EXPIRATION_MS) {
      await deleteFromKV(key);
      return null;
    }

    return data.value;
  } catch (err) {
    console.error('KV get error:', err);
    return null;
  }
}

async function setToKV(key: string, value: any): Promise<boolean> {
  try {
    console.log('[setToKV] Saving key:', key);
    const { error } = await supabase
      .from('edux_kv_store')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    if (error) {
      console.error('[setToKV] Error:', error);
      return false;
    }
    console.log('[setToKV] Success for key:', key);
    return true;
  } catch (err) {
    console.error('[setToKV] Exception:', err);
    return false;
  }
}

async function deleteFromKV(key: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('edux_kv_store')
      .delete()
      .eq('key', key);

    if (error) {
      console.error('KV delete error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('KV delete error:', err);
    return false;
  }
}

// ============ ROOM MANAGEMENT ============

export async function createRoom(
  hostId: string,
  hostName: string,
  hostAvatar: string,
  settings: {
    grade: number;
    topics: string[];
    difficulty: Difficulty;
    maxPlayers?: number;
    timeLimit?: number;
  },
  frameInfo?: { equippedFrame?: string; unlockedFrames?: string[] }
): Promise<string | null> {
  const roomCode = generateRoomCode();
  const key = ROOM_PREFIX + roomCode;

  const hostPlayer: PlayerInfo = {
    id: hostId,
    name: hostName,
    avatar: hostAvatar,
    equippedFrame: frameInfo?.equippedFrame,
    unlockedFrames: frameInfo?.unlockedFrames,
    isHost: true,
    isReady: true,
    score: 0,
    correctCount: 0,
    currentQuestionIndex: 0,
    streak: 0,
    maxStreak: 0,
    lastActivity: Date.now()
  };

  const gameState: MultiplayerGameState = {
    roomCode,
    hostId,
    players: { [hostId]: hostPlayer },
    gamePhase: 'waiting',
    questions: [],
    roomSettings: {
      grade: settings.grade,
      topics: settings.topics,
      difficulty: settings.difficulty,
      maxPlayers: settings.maxPlayers || 4,
      timeLimit: settings.timeLimit || 300
    },
    lastUpdate: Date.now()
  };

  const success = await setToKV(key, gameState);
  if (success) {
    console.log('Room created:', roomCode);
    return roomCode;
  }
  return null;
}

// ============ LIGHT STATE (tiết kiệm egress) ============
// getRoomState được poll mỗi 1s bởi mọi client trong phòng. Trước đây nó tải
// toàn bộ value JSON gồm cả mảng questions (~5-15KB) mỗi lần poll → ngốn egress.
// Giờ: select từng field trừ questions; questions bất biến sau khi trận bắt đầu
// nên chỉ tải 1 lần rồi cache theo (roomCode + startedAt).

const LIGHT_SELECT =
  'updated_at, roomCode:value->roomCode, hostId:value->hostId, players:value->players, ' +
  'gamePhase:value->gamePhase, roomSettings:value->roomSettings, startedAt:value->startedAt, ' +
  'endedAt:value->endedAt, lastUpdate:value->lastUpdate, shuffleSeed:value->shuffleSeed';

const questionsCache = new Map<string, { cacheKey: string; questions: Question[] }>();

async function getRoomQuestions(
  roomCode: string,
  key: string,
  gamePhase: string,
  startedAt: number | null
): Promise<Question[]> {
  // Chưa bắt đầu → chưa có câu hỏi; xoá cache để rematch không dính đề cũ
  if (gamePhase === 'waiting') {
    questionsCache.delete(roomCode);
    return [];
  }

  const cacheKey = `${roomCode}:${startedAt ?? 0}`;
  const cached = questionsCache.get(roomCode);
  if (cached && cached.cacheKey === cacheKey) return cached.questions;

  const { data, error } = await supabase
    .from('edux_kv_store')
    .select('questions:value->questions')
    .eq('key', key)
    .single();

  if (error || !data) return cached?.questions ?? [];

  const questions = ((data as any).questions as Question[]) || [];
  if (questions.length > 0) {
    questionsCache.set(roomCode, { cacheKey, questions });
  }
  return questions;
}

export async function getRoomState(roomCode: string): Promise<MultiplayerGameState | null> {
  const key = ROOM_PREFIX + roomCode.toUpperCase();
  try {
    const { data, error } = await supabase
      .from('edux_kv_store')
      .select(LIGHT_SELECT)
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('KV get error:', error);
      return null;
    }

    const row = data as any;

    // Check expiration (giống getFromKV)
    const updatedAt = new Date(row.updated_at).getTime();
    if (Date.now() - updatedAt > ROOM_EXPIRATION_MS) {
      await deleteFromKV(key);
      return null;
    }

    const questions = await getRoomQuestions(roomCode, key, row.gamePhase, row.startedAt ?? null);

    return {
      roomCode: row.roomCode,
      hostId: row.hostId,
      players: row.players || {},
      gamePhase: row.gamePhase,
      questions,
      roomSettings: row.roomSettings,
      startedAt: row.startedAt ?? undefined,
      endedAt: row.endedAt ?? undefined,
      lastUpdate: row.lastUpdate,
      shuffleSeed: row.shuffleSeed ?? undefined
    };
  } catch (err) {
    console.error('KV get error:', err);
    return null;
  }
}

export async function updateRoomState(
  roomCode: string,
  updates: Partial<MultiplayerGameState>
): Promise<boolean> {
  const key = ROOM_PREFIX + roomCode.toUpperCase();
  console.log('[updateRoomState] Updating room:', roomCode, 'updates:', Object.keys(updates));

  const currentState = await getFromKV(key);

  if (!currentState) {
    console.error('[updateRoomState] Room not found:', roomCode);
    return false;
  }

  console.log('[updateRoomState] Current phase:', currentState.gamePhase);

  const newState: MultiplayerGameState = {
    ...currentState,
    ...updates,
    lastUpdate: Date.now()
  };

  console.log('[updateRoomState] New phase:', newState.gamePhase);

  const result = await setToKV(key, newState);
  console.log('[updateRoomState] setToKV result:', result);

  return result;
}

export async function deleteRoom(roomCode: string): Promise<boolean> {
  const key = ROOM_PREFIX + roomCode.toUpperCase();
  return await deleteFromKV(key);
}

// ============ PLAYER MANAGEMENT ============

export async function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string,
  playerAvatar: string,
  frameInfo?: { equippedFrame?: string; unlockedFrames?: string[] }
): Promise<{ success: boolean; error?: string }> {
  const state = await getRoomState(roomCode);

  if (!state) {
    return { success: false, error: 'Phòng không tồn tại hoặc đã hết hạn' };
  }

  if (state.gamePhase === 'completed') {
    return { success: false, error: 'Trận đấu đã kết thúc' };
  }

  // Người đã có trong phòng → cho join lại bất kể trận đã bắt đầu hay chưa
  // (fix bug: check "đã bắt đầu" chạy trước nên người chơi cũ không rejoin được).
  // Lobby sẽ tự chuyển vào màn chơi khi thấy gamePhase countdown/playing.
  if (state.players[playerId]) {
    state.players[playerId].lastActivity = Date.now();
    await updateRoomState(roomCode, { players: state.players });
    return { success: true };
  }

  // Người mới thì chỉ vào được khi phòng còn đang chờ
  if (state.gamePhase !== 'waiting') {
    return { success: false, error: 'Trận đấu đã bắt đầu' };
  }

  const playerCount = Object.keys(state.players).length;
  if (playerCount >= state.roomSettings.maxPlayers) {
    return { success: false, error: 'Phòng đã đầy' };
  }

  const newPlayer: PlayerInfo = {
    id: playerId,
    name: playerName,
    avatar: playerAvatar,
    equippedFrame: frameInfo?.equippedFrame,
    unlockedFrames: frameInfo?.unlockedFrames,
    isHost: false,
    isReady: false,
    score: 0,
    correctCount: 0,
    currentQuestionIndex: 0,
    streak: 0,
    maxStreak: 0,
    lastActivity: Date.now()
  };

  state.players[playerId] = newPlayer;
  const success = await updateRoomState(roomCode, { players: state.players });

  if (success) {
    console.log(`Player ${playerName} joined room ${roomCode}`);
    return { success: true };
  }
  return { success: false, error: 'Lỗi tham gia phòng' };
}

export async function leaveRoom(roomCode: string, playerId: string): Promise<boolean> {
  const state = await getRoomState(roomCode);
  if (!state) return false;

  const wasHost = state.hostId === playerId;

  // Xóa người chơi khỏi phòng trước
  delete state.players[playerId];

  // Nếu là người cuối → xóa phòng luôn
  const remainingIds = Object.keys(state.players);
  if (remainingIds.length === 0) {
    return await deleteRoom(roomCode);
  }

  // Nếu host rời → chuyển quyền cho người vào phòng sớm nhất (insertion
  // order của object keys trong JS — người join đầu tiên sau host).
  if (wasHost) {
    const newHostId = remainingIds[0];
    Object.values(state.players).forEach(p => { p.isHost = false; });
    state.players[newHostId].isHost = true;
    // Host mới mặc định Ready (giống host gốc ở createRoom) để khỏi kẹt
    // ở banner "Đang chờ host bấm sẵn sàng".
    state.players[newHostId].isReady = true;

    console.log(`[leaveRoom] Host ${playerId} left, transferring host to ${newHostId}`);

    return await updateRoomState(roomCode, {
      players: state.players,
      hostId: newHostId
    });
  }

  return await updateRoomState(roomCode, { players: state.players });
}

export async function setPlayerReady(
  roomCode: string,
  playerId: string,
  ready: boolean
): Promise<boolean> {
  const state = await getRoomState(roomCode);
  if (!state || !state.players[playerId]) return false;

  state.players[playerId].isReady = ready;
  state.players[playerId].lastActivity = Date.now();

  return await updateRoomState(roomCode, { players: state.players });
}

export async function kickPlayer(
  roomCode: string,
  hostId: string,
  playerIdToKick: string
): Promise<boolean> {
  const state = await getRoomState(roomCode);
  if (!state) return false;

  // Only host can kick
  if (state.hostId !== hostId) return false;

  // Can't kick self
  if (hostId === playerIdToKick) return false;

  delete state.players[playerIdToKick];
  return await updateRoomState(roomCode, { players: state.players });
}

// ============ GAME CONTROL ============

export async function startGame(
  roomCode: string,
  hostId: string,
  questions: Question[]
): Promise<boolean> {
  const state = await getRoomState(roomCode);
  if (!state) return false;

  // Only host can start
  if (state.hostId !== hostId) return false;

  // Trận đang đếm ngược/đang chơi thì không cho start lại
  // (chống reset phòng khi host reload giữa trận)
  if (state.gamePhase === 'countdown' || state.gamePhase === 'playing') {
    console.log('Game already in progress, ignoring start request');
    return false;
  }

  // Check all players ready
  const allReady = Object.values(state.players).every(p => p.isReady);
  if (!allReady) {
    console.log('Not all players ready');
    return false;
  }

  // Reset player stats
  Object.values(state.players).forEach(p => {
    p.score = 0;
    p.correctCount = 0;
    p.currentQuestionIndex = 0;
    p.streak = 0;
    p.maxStreak = 0;
    p.finishedAt = undefined;
    p.lastActivity = Date.now();
  });

  return await updateRoomState(roomCode, {
    gamePhase: 'countdown',
    questions,
    players: state.players,
    startedAt: Date.now() + 3000, // 3 second countdown
    shuffleSeed: Math.floor(Math.random() * 1000000)
  });
}

export async function submitAnswer(
  roomCode: string,
  playerId: string,
  questionIndex: number,
  isCorrect: boolean,
  scoreEarned: number
): Promise<boolean> {
  const key = ROOM_PREFIX + roomCode.toUpperCase();

  // Read room lightly just to get XP-per-question for the difficulty.
  const state = await getRoomState(roomCode);
  if (!state || !state.players[playerId]) return false;
  const xpPerQ = XP_PER_QUESTION[state.roomSettings.difficulty] || 10;

  // ATOMIC path: server locks the row and only mutates this player's branch,
  // eliminating the lost-update race when several players answer at once.
  // See scripts/sql/edux_multiplayer_atomic_rpc.sql.
  const { data, error } = await supabase.rpc('edux_submit_answer', {
    p_key: key,
    p_player_id: playerId,
    p_question_index: questionIndex,
    p_is_correct: isCorrect,
    p_xp_per_q: xpPerQ
  });

  if (!error && data !== null) {
    return true;
  }

  // Fallback (RPC not installed yet or transient error): old read-modify-write
  // so a match is never fully blocked. WARNING: still race-prone -- run the SQL.
  console.warn('[submitAnswer] edux_submit_answer RPC failed, falling back:', error?.message);

  const fresh = await getRoomState(roomCode);
  if (!fresh || !fresh.players[playerId]) return false;

  const player = fresh.players[playerId];

  // Idempotency guard (same as RPC): skip if this question was already counted.
  if (player.currentQuestionIndex > questionIndex) return true;

  player.currentQuestionIndex = questionIndex + 1;
  player.lastActivity = Date.now();

  if (isCorrect) {
    player.correctCount++;
    player.streak++;
    if (player.streak > player.maxStreak) {
      player.maxStreak = player.streak;
    }
  } else {
    player.streak = 0;
  }

  player.score = player.correctCount * xpPerQ + player.maxStreak * 5;

  if (player.currentQuestionIndex >= fresh.questions.length) {
    player.finishedAt = Date.now();
  }

  const allFinished = Object.values(fresh.players).every(p => p.finishedAt);
  const updates: Partial<MultiplayerGameState> = { players: fresh.players };

  if (allFinished) {
    updates.gamePhase = 'completed';
    updates.endedAt = Date.now();
  }

  return await updateRoomState(roomCode, updates);
}

export async function endGame(roomCode: string): Promise<boolean> {
  return await updateRoomState(roomCode, {
    gamePhase: 'completed',
    endedAt: Date.now()
  });
}

export async function transitionToPlaying(roomCode: string): Promise<boolean> {
  console.log('[transitionToPlaying] Starting transition for room:', roomCode);

  // Get fresh state
  const state = await getRoomState(roomCode);
  console.log('[transitionToPlaying] Current state phase:', state?.gamePhase, 'lastUpdate:', state?.lastUpdate);

  if (!state) {
    console.error('[transitionToPlaying] Room not found');
    return false;
  }

  // If already playing, return success
  if (state.gamePhase === 'playing') {
    console.log('[transitionToPlaying] Already playing, returning true');
    return true;
  }

  // If completed, don't transition
  if (state.gamePhase === 'completed') {
    console.log('[transitionToPlaying] Game already completed');
    return false;
  }

  // Only transition from countdown or waiting phase
  if (state.gamePhase !== 'countdown' && state.gamePhase !== 'waiting') {
    console.log('[transitionToPlaying] Unexpected phase:', state.gamePhase);
    return false;
  }

  console.log('[transitionToPlaying] Updating to playing phase...');

  const result = await updateRoomState(roomCode, {
    gamePhase: 'playing',
    startedAt: Date.now()
  });

  console.log('[transitionToPlaying] Update result:', result);

  // Verify the update took effect
  if (result) {
    const verifyState = await getRoomState(roomCode);
    console.log('[transitionToPlaying] Verified phase:', verifyState?.gamePhase);
    return verifyState?.gamePhase === 'playing';
  }

  return result;
}

// ============ REALTIME SUBSCRIPTION ============

type StateCallback = (state: MultiplayerGameState | null, source: 'realtime' | 'poll') => void;

export function subscribeToRoom(
  roomCode: string,
  callback: StateCallback
): { unsubscribe: () => void } {
  let isSubscribed = true;
  let pollInterval: number | undefined;
  let lastPhase: string | null = null;

  // NOTE: Realtime subscription removed to cut Supabase Realtime Messages quota
  // (was postgres_changes on edux_kv_store). Polling below is the sole sync path.

  // Polling (primary sync)
  const startPolling = async () => {
    if (!isSubscribed) return;

    const state = await getRoomState(roomCode);

    // Only log when phase changes to reduce noise
    if (state && state.gamePhase !== lastPhase) {
      console.log('[subscribeToRoom] Phase changed:', lastPhase, '->', state.gamePhase);
      lastPhase = state.gamePhase;
    }

    callback(state, 'poll');

    // Stop polling if game is completed (still allow realtime updates)
    if (state?.gamePhase === 'completed') {
    