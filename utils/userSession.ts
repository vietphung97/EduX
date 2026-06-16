/**
 * User session management with Eduso integration + temp user support
 * Adapted from flipcard.eduso.vn pattern
 */

// Storage keys
const STORAGE_KEYS = {
  TEMP_USER_ID: 'edux_temp_user_id',
  USER_DATA: 'edux_user_data',
  RECENT_USERS: 'edux_recent_users',
  GAME_HISTORY: 'edux_game_history',
  USER_PROFILE: 'arena_x_user', // Keep existing key for compatibility
} as const;

// ============================================
// INTERFACES
// ============================================

export interface EdusoUserData {
  userId: string;
  name?: string;
  email: string;
  phone?: string;
}

export interface StoredUserData {
  userID: string;
  isTempUser: boolean;
  email?: string;
  phone?: string;
  playerName?: string;
  lastUsed?: number;
}

export interface AccountDataStats {
  hasData: boolean;
  gamesPlayed: number;
  totalXp: number;
}

// ============================================
// TEMP USER MANAGEMENT
// ============================================

/**
 * Generate a temporary user ID (format: temp_timestamp_random)
 * Schema changed to TEXT type - this format now works with Supabase
 */
export function generateTempUserID(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get or create temp user ID
 */
export function getTempUserID(): string {
  try {
    let tempUserId = localStorage.getItem(STORAGE_KEYS.TEMP_USER_ID);

    if (!tempUserId) {
      tempUserId = generateTempUserID();
      localStorage.setItem(STORAGE_KEYS.TEMP_USER_ID, tempUserId);
      console.log('Created new temp user ID:', tempUserId);
    }

    return tempUserId;
  } catch (error) {
    console.error('Error getting temp user ID:', error);
    return generateTempUserID();
  }
}

// ============================================
// USER DATA MANAGEMENT
// ============================================

/**
 * Save user data (real or temp)
 */
export function saveUserData(userData: StoredUserData): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));

    // If real user, clear temp user ID
    if (!userData.isTempUser) {
      localStorage.removeItem(STORAGE_KEYS.TEMP_USER_ID);
    }
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

/**
 * Get stored user data
 */
export function getUserData(): StoredUserData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

/**
 * Clear user data (logout)
 */
export function clearUserData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    localStorage.removeItem(STORAGE_KEYS.TEMP_USER_ID);
  } catch (error) {
    console.error('Error clearing user data:', error);
  }
}

/**
 * Get current user ID (real or temp)
 */
export function getCurrentUserID(): string {
  const userData = getUserData();

  if (userData && userData.userID) {
    return userData.userID;
  }

  return getTempUserID();
}

// ============================================
// EDUSO API INTEGRATION
// ============================================

/**
 * Base URL của API Eduso. Cấu hình qua env `VITE_EDUSO_API_BASE`.
 *  - Local dev:  https://test.eduso.vn   (đặt trong .env.local)
 *  - Production: https://eduso.vn        (đặt trong .env.production)
 * Fallback https://eduso.vn nếu chưa cấu hình.
 */
const EDUSO_BASE: string = (
  ((import.meta as any).env?.VITE_EDUSO_API_BASE as string) || 'https://eduso.vn'
).replace(/\/+$/, '');

/** Trang đăng nhập Eduso tương ứng với base hiện tại (cho link "Đăng nhập"). */
export const EDUSO_LOGIN_URL = `${EDUSO_BASE}/login?returnUrl=${encodeURIComponent(EDUSO_BASE + '/edux/')}`;

/**
 * Check for logged-in Eduso user via API
 * Returns user data if logged in, null otherwise
 */
export async function checkEdusoUser(timeoutMs: number = 2000): Promise<EdusoUserData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${EDUSO_BASE}/currentuser`, {
      signal: controller.signal,
      credentials: 'include', // Send cookies for authentication
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data: EdusoUserData = await response.json();
      if (data && data.userId) {
        console.log('Got real user from Eduso API:', data.userId);
        return data;
      }
    }

    return null;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('Eduso API timeout after', timeoutMs, 'ms');
    } else {
      console.error('Error checking Eduso user:', error);
    }
    return null;
  }
}

/**
 * Lấy profile đầy đủ của user Eduso bao gồm lớp (className) và trường (school).
 * Endpoint: eduso.vn/currentuserwithclass — chỉ trả thông tin lớp/trường nếu user
 * đã đăng nhập và là học sinh có gán lớp.
 *
 * Tự normalize các tên field thường gặp (className/class_name/class.name/grade,
 * school/schoolName/school.name) để dùng cho giấy chứng nhận.
 */
export async function checkEdusoUserWithClass(
  timeoutMs: number = 4000
): Promise<EdusoUserData | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${EDUSO_BASE}/currentuserwithclass`, {
      signal: controller.signal,
      credentials: 'include',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('currentuserwithclass status', response.status);
      return null;
    }

    const raw: any = await response.json();
    if (!raw || !raw.userId) return null;

    // Normalize: backend Eduso có thể đặt tên field khác nhau, chuẩn hoá về
    // EdusoUserData để CertificatePage dùng được trực tiếp.
    const className: string | undefined =
      raw.className ??
      raw.class_name ??
      raw.classname ??
      raw.class?.name ??
      raw.class?.title ??
      (typeof raw.class === 'string' ? raw.class : undefined) ??
      raw.grade;

    const school: string | undefined =
      raw.school ??
      raw.schoolName ??
      raw.school_name ??
      raw.school?.name ??
      raw.school?.title ??
      (typeof raw.school === 'string' ? raw.school : undefined) ??
      raw.organization ??
      raw.org;

    const out: EdusoUserData = {
      userId: raw.userId,
      name: raw.name,
      email: raw.email,
      phone: raw.phone,
      className: className ? String(className) : undefined,
      school: school ? String(school) : undefined,
    };

    console.log('Eduso /currentuserwithclass →', out);
    return out;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('currentuserwithclass timeout', timeoutMs, 'ms');
    } else {
      console.error('Error checking currentuserwithclass:', error);
    }
    return null;
  }
}

// ============================================
// DATA MIGRATION
// ============================================

/**
 * Migrate data from temp user to real user
 * Called when user logs in with real Eduso account
 */
export function migrateTempUserData(fromTempID: string, toRealID: string): void {
  try {
    console.log(`Migrating data from ${fromTempID} to ${toRealID}`);

    // Migrate game history
    const historyKey = `${STORAGE_KEYS.GAME_HISTORY}_${fromTempID}`;
    const history = localStorage.getItem(historyKey);
    if (history) {
      const newHistoryKey = `${STORAGE_KEYS.GAME_HISTORY}_${toRealID}`;

      // Merge with existing history if any
      const existingHistory = localStorage.getItem(newHistoryKey);
      if (existingHistory) {
        const oldRecords = JSON.parse(history);
        const newRecords = JSON.parse(existingHistory);
        const merged = [...newRecords, ...oldRecords].slice(0, 100);
        localStorage.setItem(newHistoryKey, JSON.stringify(merged));
      } else {
        localStorage.setItem(newHistoryKey, history);
      }

      localStorage.removeItem(historyKey);
      console.log('Migrated game history');
    }

    // Migrate user profile (XP, stats, etc.)
    const oldProfile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (oldProfile) {
      try {
        const profile = JSON.parse(oldProfile);
        // Update the ID to the real user ID
        profile.id = toRealID;
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
        console.log('Migrated user profile');
      } catch (e) {
        console.error('Error migrating profile:', e);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Error migrating temp user data:', error);
  }
}

// ============================================
// RECENT USERS MANAGEMENT
// ============================================

/**
 * Get list of recent users (sorted by last used)
 */
export function getRecentUsers(): StoredUserData[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECENT_USERS);
    if (!stored) return [];

    const users = JSON.parse(stored) as StoredUserData[];
    return users.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  } catch (error) {
    console.error('Error getting recent users:', error);
    return [];
  }
}

/**
 * Add or update recent user
 */
export function addRecentUser(userData: StoredUserData): void {
  try {
    const recentUsers = getRecentUsers();

    userData.lastUsed = Date.now();

    // Remove existing entry with same userID
    const filtered = recentUsers.filter(u => u.userID !== userData.userID);

    // Add to top
    filtered.unshift(userData);

    // Keep only last 5 users
    const limited = filtered.slice(0, 5);

    localStorage.setItem(STORAGE_KEYS.RECENT_USERS, JSON.stringify(limited));
  } catch (error) {
    console.error('Error adding recent user:', error);
  }
}

/**
 * Remove a user from recent users
 */
export function removeRecentUser(userID: string): void {
  try {
    const recentUsers = getRecentUsers();
    const filtered = recentUsers.filter(u => u.userID !== userID);
    localStorage.setItem(STORAGE_KEYS.RECENT_USERS, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing recent user:', error);
  }
}

// ============================================
// ACCOUNT DATA CHECKING
// ============================================

/**
 * Check if an account has any game data
 */
export function checkAccountData(userID: string): AccountDataStats {
  try {
    let gamesPlayed = 0;
    let totalXp = 0;

    // Check game history
    const history = localStorage.getItem('arena_x_history');
    if (history) {
      try {
        const records = JSON.parse(history);
        gamesPlayed = Array.isArray(records) ? records.length : 0;
      } catch (e) {
        console.error('Error parsing game history:', e);
      }
    }

    // Check user profile for XP
    const profile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (profile) {
      try {
        const profileData = JSON.parse(profile);
        totalXp = profileData.xp || 0;
      } catch (e) {
        console.error('Error parsing profile:', e);
      }
    }

    const hasData = gamesPlayed > 0 || totalXp > 0;

    return {
      hasData,
      gamesPlayed,
      totalXp,
    };
  } catch (error) {
    console.error('Error checking account data:', error);
    return {
      hasData: false,
      gamesPlayed: 0,
      totalXp: 0,
    };
  }
}

/**
 * Switch to a different user
 */
export function switchUser(userData: StoredUserData): void {
  saveUserData(userData);
  addRecentUser(userData);
  console.log('Switched to user:', userData.userID);
}

/**
 * Create new guest user
 */
export function createGuestUser(playerName: string): StoredUserData {
  const newUserID = generateTempUserID();
  const userData: StoredUserData = {
    userID: newUserID,
    isTempUser: true,
    playerName,
    lastUsed: Date.now(),
  };

  saveUserData(userData);
  addRecentUser(userData);

  console.log('Created new guest user:', newUserID);
  return userData;
}
