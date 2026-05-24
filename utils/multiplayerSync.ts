/**
 * Multiplayer synchronization via Supabase Realtime + KV Store
 * Adapted from flipcard.eduso.vn pattern
 */

import { supabase } from '../services/supabase';
import { MultiplayerGameState, PlayerInfo, Question, Difficulty } from '../types';

// Constants
const ROOM_PREFIX = 'edux_room_';
const ROOM_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const POLL_INTERVAL_MS = 1000; // 1 second fallback polling for faster sync
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
  }
): Promise<string | null> {
  const roomCode = generateRoomCode();
  const key = ROOM_PREFIX + roomCode;

  const hostPlayer: PlayerInfo = {
    id: hostId,
    name: hostName,
    avatar: hostAvatar,
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

export async function getRoomState(roomCode: string): Promise<MultiplayerGameState | null> {
  const key = ROOM_PREFIX + roomCode.toUpperCase();
  return await getFromKV(key);
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
  playerAvatar: string
): Promise<{ success: boolean; error?: string }> {
  const state = await getRoomState(roomCode);

  if (!state) {
    return { success: false, error: 'Phòng không tồn tại hoặc đã hết hạn' };
  }

  if (state.gamePhase !== 'waiting') {
    return { success: false, error: 'Trận đấu đã bắt đầu' };
  }

  const playerCount = Object.keys(state.players).length;
  if (playerCount >= state.roomSettings.maxPlayers) {
    return { success: false, error: 'Phòng đã đầy' };
  }

  // Check if player already in room
  if (state.players[playerId]) {
    // Update last activity
    state.players[playerId].lastActivity = Date.now();
    await updateRoomState(roomCode, { players: state.players });
    return { success: true };
  }

  const newPlayer: PlayerInfo = {
    id: playerId,
    name: playerName,
    avatar: playerAvatar,
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

  // If host leaves, delete room
  if (state.hostId === playerId) {
    return await deleteRoom(roomCode);
  }

  // Remove player
  delete state.players[playerId];
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
  const state = await getRoomState(roomCode);
  if (!state || !state.players[playerId]) return false;

  const player = state.players[playerId];

  // Update player stats
  player.currentQuestionIndex = questionIndex + 1;
  player.lastActivity = Date.now();

  if (isCorrect) {
    player.score += scoreEarned;
    player.correctCount++;
    player.streak++;
    if (player.streak > player.maxStreak) {
      player.maxStreak = player.streak;
    }
  } else {
    player.streak = 0;
  }

  // Check if player finished all questions
  if (player.currentQuestionIndex >= state.questions.length) {
    player.finishedAt = Date.now();
  }

  // Check if all players finished
  const allFinished = Object.values(state.players).every(p => p.finishedAt);
  const updates: Partial<MultiplayerGameState> = { players: state.players };

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
  const key = ROOM_PREFIX + roomCode.toUpperCase();
  let isSubscribed = true;
  let pollInterval: number | undefined;
  let lastPhase: string | null = null;

  // Setup Supabase Realtime subscription
  const channel = supabase
    .channel(`room:${roomCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'edux_kv_store',
        filter: `key=eq.${key}`
      },
      async (payload) => {
        if (!isSubscribed) return;

        if (payload.eventType === 'DELETE') {
          callback(null, 'realtime');
          return;
        }

        const state = (payload.new as any)?.value as MultiplayerGameState;
        if (state) {
          callback(state, 'realtime');
        }
      }
    )
    .subscribe();

  // Fallback polling
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
      console.log('[subscribeToRoom] Game completed, stopping polling');
      return;
    }

    if (isSubscribed) {
      pollInterval = window.setTimeout(startPolling, POLL_INTERVAL_MS);
    }
  };

  // Start initial poll immediately
  console.log('[subscribeToRoom] Starting subscription for room:', roomCode);
  startPolling();

  return {
    unsubscribe: () => {
      isSubscribed = false;
      if (pollInterval) {
        clearTimeout(pollInterval);
      }
      supabase.removeChannel(channel);
    }
  };
}

// ============ PLAYER ACTIVITY ============

export async function updatePlayerActivity(
  roomCode: string,
  playerId: string
): Promise<void> {
  const state = await getRoomState(roomCode);
  if (!state || !state.players[playerId]) return;

  state.players[playerId].lastActivity = Date.now();
  await updateRoomState(roomCode, { players: state.players });
}

export function getInactivePlayers(state: MultiplayerGameState): string[] {
  const now = Date.now();
  return Object.values(state.players)
    .filter(p => now - p.lastActivity > INACTIVITY_TIMEOUT_MS)
    .map(p => p.id);
}

// ============ RANKING ============

export function calculateRankings(state: MultiplayerGameState): Array<{
  rank: number;
  player: PlayerInfo;
  timeSpent: number;
}> {
  const players = Object.values(state.players);

  // Sort by: score (desc), then by finish time (asc)
  const sorted = players.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    const aTime = a.finishedAt || Infinity;
    const bTime = b.finishedAt || Infinity;
    return aTime - bTime;
  });

  const startTime = state.startedAt || Date.now();

  return sorted.map((player, index) => ({
    rank: index + 1,
    player,
    timeSpent: (player.finishedAt || state.endedAt || Date.now()) - startTime
  }));
}
