/**
 * Player session management for multiplayer rooms
 * Handles persistent player ID and active room tracking
 */

// Storage keys
const STORAGE_KEYS = {
  PLAYER_ID: 'edux_player_id',
  ACTIVE_ROOM: 'edux_active_room',
  PLAYER_NAME: 'edux_player_name',
} as const;

const ROOM_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============ PLAYER ID MANAGEMENT ============

/**
 * Generate a player ID (format: player_timestamp_random)
 */
export function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create persistent player ID
 * Keeps existing ID unchanged (no migration)
 */
export function getPlayerId(): string {
  try {
    let playerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);

    if (!playerId) {
      playerId = generatePlayerId();
      localStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
      console.log('Created new player ID:', playerId);
    }

    return playerId;
  } catch (error) {
    console.error('Error getting player ID:', error);
    return generatePlayerId();
  }
}

/**
 * Set player ID (useful for migration from user session)
 */
export function setPlayerId(playerId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
  } catch (error) {
    console.error('Error setting player ID:', error);
  }
}

// ============ ACTIVE ROOM SESSION ============

interface ActiveRoomSession {
  roomCode: string;
  joinedAt: number;
  isHost: boolean;
  gamePhase?: 'waiting' | 'countdown' | 'playing' | 'completed';
}

/**
 * Get active room session if exists and not expired
 */
export function getActiveRoom(): ActiveRoomSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROOM);
    if (!stored) return null;

    const session: ActiveRoomSession = JSON.parse(stored);

    // Check if expired
    if (Date.now() - session.joinedAt > ROOM_SESSION_EXPIRY_MS) {
      clearActiveRoom();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error getting active room:', error);
    return null;
  }
}

/**
 * Set active room session
 */
export function setActiveRoom(roomCode: string, isHost: boolean, gamePhase?: 'waiting' | 'countdown' | 'playing' | 'completed'): void {
  try {
    const session: ActiveRoomSession = {
      roomCode: roomCode.toUpperCase(),
      joinedAt: Date.now(),
      isHost,
      gamePhase: gamePhase || 'waiting'
    };
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROOM, JSON.stringify(session));
  } catch (error) {
    console.error('Error setting active room:', error);
  }
}

/**
 * Update game phase in active room session
 */
export function updateActiveRoomPhase(gamePhase: 'waiting' | 'countdown' | 'playing' | 'completed'): void {
  try {
    const session = getActiveRoom();
    if (session) {
      session.gamePhase = gamePhase;
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ROOM, JSON.stringify(session));
    }
  } catch (error) {
    console.error('Error updating active room phase:', error);
  }
}

/**
 * Clear active room session
 */
export function clearActiveRoom(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ROOM);
  } catch (error) {
    console.error('Error clearing active room:', error);
  }
}

// ============ PLAYER NAME ============

/**
 * Get saved player name
 */
export function getSavedPlayerName(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.PLAYER_NAME);
  } catch (error) {
    console.error('Error getting player name:', error);
    return null;
  }
}

/**
 * Save player name for future sessions
 */
export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, name);
  } catch (error) {
    console.error('Error saving player name:', error);
  }
}

// ============ SESSION RECOVERY ============

/**
 * Check if player can rejoin an active room
 */
export async function checkRejoinableRoom(): Promise<{
  canRejoin: boolean;
  roomCode?: string;
  isHost?: boolean;
  gamePhase?: 'waiting' | 'countdown' | 'playing' | 'completed';
  roomState?: any;
}> {
  const activeRoom = getActiveRoom();

  if (!activeRoom) {
    return { canRejoin: false };
  }

  // Import dynamically to avoid circular dependency
  const { getRoomState } = await import('./multiplayerSync');

  try {
    const roomState = await getRoomState(activeRoom.roomCode);

    if (!roomState) {
      clearActiveRoom();
      return { canRejoin: false };
    }

    // If game is completed, clear and don't rejoin
    if (roomState.gamePhase === 'completed') {
      clearActiveRoom();
      return { canRejoin: false };
    }

    const playerId = getPlayerId();

    // Check if player is still in the room
    if (roomState.players[playerId]) {
      return {
        canRejoin: true,
        roomCode: activeRoom.roomCode,
        isHost: activeRoom.isHost,
        gamePhase: roomState.gamePhase,
        roomState
      };
    } else {
      // Player was kicked or left
      clearActiveRoom();
      return { canRejoin: false };
    }
  } catch (error) {
    console.error('Error checking rejoinable room:', error);
    return { canRejoin: false };
  }
}

// ============ CLEANUP ============

/**
 * Clear all player session data
 */
export function clearPlayerSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_ROOM);
    localStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
  } catch (error) {
    console.error('Error clearing player session:', error);
  }
}

// ============ PLAYER AVATAR ============

/** Bộ avatar mặc định — nhân vật 3D cắt từ ảnh thiết kế (public/avatars/a1..aN.png) */
export const LOCAL_AVATAR_COUNT = 83;

export function getLocalAvatarUrl(index: number): string {
  const n = ((index % LOCAL_AVATAR_COUNT) + LOCAL_AVATAR_COUNT) % LOCAL_AVATAR_COUNT;
  const base = (import.meta as any).env?.BASE_URL || '/';
  // Đường dẫn TƯƠNG ĐỐI (không kèm origin) — tránh lỗi khi đổi domain/port
  return `${base}avatars/a${n + 1}.png`;
}

/** Avatar là URL ảnh? (http(s) hoặc đường dẫn tương đối bắt đầu bằng '/') */
export function isAvatarImage(v?: string): boolean {
  return !!v && (v.startsWith('http') || v.startsWith('/'));
}

/**
 * Chuẩn hóa avatar cũ đã lưu kèm origin (http://localhost:5555/...)
 * → đường dẫn tương đối, tránh lỗi origin khi đổi domain.
 * Chỉ strip origin cho avatar nội bộ (/avatars/); URL ngoài giữ nguyên.
 */
export function normalizeAvatarUrl(v: string): string {
  const m = v.match(/^https?:\/\/[^/]+(\/.+)$/);
  if (m && m[1].includes('/avatars/')) return m[1];
  return v;
}

/**
 * Generate avatar URL — chọn ổn định theo seed trong bộ avatar mặc định
 */
export function generateAvatarUrl(seed?: string): string {
  const s = seed || getPlayerId();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return getLocalAvatarUrl(Math.abs(h));
}

/**
 * Get player avatar from user profile or generate one
 */
export function getPlayerAvatar(userAvatar?: string): string {
  if (userAvatar && isAvatarImage(userAvatar)) {
    return normalizeAvatarUrl(userAvatar);
  }
  return generateAvatarUrl();
}
