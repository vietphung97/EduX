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

const DEFAULT_AVATARS = [
  'adventurer',
  'adventurer-neutral',
  'avataaars',
  'big-ears',
  'big-smile',
  'bottts',
  'croodles',
  'fun-emoji',
  'icons',
  'identicon',
  'lorelei',
  'micah',
  'miniavs',
  'open-peeps',
  'personas',
  'pixel-art'
];

/**
 * Generate avatar URL using DiceBear
 */
export function generateAvatarUrl(seed?: string): string {
  const style = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
  const avatarSeed = seed || getPlayerId();
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${avatarSeed}`;
}

/**
 * Get player avatar from user profile or generate one
 */
export function getPlayerAvatar(userAvatar?: string): string {
  if (userAvatar && userAvatar.startsWith('http')) {
    return userAvatar;
  }
  return generateAvatarUrl();
}
