import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, UserLevel, EdusoUserData, StoredUserData } from '../types';
import { generateAvatarUrl } from '../utils/playerSession';
import {
  checkEdusoUser,
  getUserData,
  saveUserData,
  addRecentUser,
  getRecentUsers,
  migrateTempUserData,
  createGuestUser,
  switchUser,
  checkAccountData,
} from '../utils/userSession';

interface LoginScreenProps {
  onLoginComplete: (user: UserProfile, edusoData?: EdusoUserData) => void;
  existingUser: UserProfile | null;
}

/**
 * Đọc profile đã lưu trực tiếp từ localStorage.
 * Fix bug mất avatar/khung/quà sau reload: prop `existingUser` bị capture stale (null)
 * trong closure initAuth vì App load profile bất đồng bộ sau khi LoginScreen mount.
 */
function getSavedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem('arena_x_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginComplete, existingUser }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [nicknameInput, setNicknameInput] = useState('');
  const [recentUsers, setRecentUsers] = useState<StoredUserData[]>([]);
  const [showUserSelection, setShowUserSelection] = useState(true);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [tempUserData, setTempUserData] = useState<StoredUserData | null>(null);
  const [realUserData, setRealUserData] = useState<EdusoUserData | null>(null);
  const hasCheckedAPI = useRef(false);

  useEffect(() => {
    if (hasCheckedAPI.current) return;
    hasCheckedAPI.current = true;

    const initAuth = async () => {
      // Load recent users
      const recent = getRecentUsers();
      setRecentUsers(recent);

      // Check for existing stored user data
      const storedUserData = getUserData();

      // Check Eduso API for logged-in user
      const edusoUser = await checkEdusoUser(2000);

      if (edusoUser) {
        // Real Eduso user found
        if (storedUserData && storedUserData.isTempUser) {
          // Was using temp account, ask about migration
          const stats = checkAccountData(storedUserData.userID);
          if (stats.hasData) {
            setTempUserData(storedUserData);
            setRealUserData(edusoUser);
            setShowMigrationDialog(true);
            setIsLoading(false);
            return;
          }
        }

        // Auto-login with Eduso user
        handleEdusoLogin(edusoUser);
        return;
      }

      // No Eduso user, check for existing user
      // Đọc từ localStorage thay vì prop để tránh closure stale (prop có thể là null
      // vì App load profile bất đồng bộ sau khi LoginScreen mount)
      const savedProfile = existingUser || getSavedProfile();
      if (savedProfile) {
        // Already have a user, skip login
        onLoginComplete(savedProfile);
        return;
      }

      // Show login screen
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const handleEdusoLogin = (edusoData: EdusoUserData) => {
    const userName = edusoData.name || edusoData.email || edusoData.phone || 'User';

    // Save to stored user data
    const storedData: StoredUserData = {
      userID: edusoData.userId,
      isTempUser: false,
      email: edusoData.email,
      phone: edusoData.phone,
      playerName: userName,
      lastUsed: Date.now(),
    };
    saveUserData(storedData);
    addRecentUser(storedData);

    // Create or update user profile
    // Dùng localStorage làm fallback vì prop existingUser có thể stale = null
    // (App load profile bất đồng bộ sau khi LoginScreen mount) — nếu không sẽ
    // tạo profile mới tinh, mất avatar/unlockedFrames/equippedFrame
    const baseUser = existingUser || getSavedProfile();
    const userProfile: UserProfile = baseUser ? {
      ...baseUser,
      id: edusoData.userId,
      name: userName,
    } : {
      id: edusoData.userId,
      name: userName,
      avatar: generateAvatarUrl(userName),
      grade: 6,
      xp: 0,
      level: UserLevel.APPRENTICE,
      totalGames: 0,
      bestStreak: 0,
      weeklyXp: 0,
      topicStats: {},
    };

    onLoginComplete(userProfile, edusoData);
  };

  const handleMigrate = () => {
    if (!tempUserData || !realUserData) return;

    // Migrate data from temp to real user
    migrateTempUserData(tempUserData.userID, realUserData.userId);

    // Continue with Eduso login
    setShowMigrationDialog(false);
    handleEdusoLogin(realUserData);
  };

  const handleSkipMigration = () => {
    if (!realUserData) return;

    setShowMigrationDialog(false);
    handleEdusoLogin(realUserData);
  };

  const handleContinueWithUser = (user: StoredUserData) => {
    switchUser(user);

    const userName = user.playerName || user.email || 'User';
    // Chỉ tái sử dụng profile đã lưu nếu đúng cùng user (tránh mang nhầm
    // avatar/khung/XP của tài khoản khác khi switch user)
    const saved = getSavedProfile();
    const baseUser = existingUser || (saved && saved.id === user.userID ? saved : null);
    const userProfile: UserProfile = baseUser ? {
      ...baseUser,
      id: user.userID,
      name: userName,
    } : {
      id: user.userID,
      name: userName,
      avatar: generateAvatarUrl(userName),
      grade: 6,
      xp: 0,
      level: UserLevel.APPRENTICE,
      totalGames: 0,
      bestStreak: 0,
      weeklyXp: 0,
      topicStats: {},
    };

    if (user.isTempUser) {
      onLoginComplete(userProfile);
    } else {
      const edusoData: EdusoUserData = {
        userId: user.userID,
        email: user.email || '',
        phone: user.phone,
        name: user.playerName,
      };
      onLoginComplete(userProfile, edusoData);
    }
  };

  const handleCreateNewUser = () => {
    setShowUserSelection(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim()) return;

    // Create new guest user
    const newUser = createGuestUser(nicknameInput.trim());

    const userProfile: UserProfile = {
      id: newUser.userID,
      name: nicknameInput.trim(),
      avatar: generateAvatarUrl(nicknameInput),
      grade: 6,
      xp: 0,
      level: UserLevel.APPRENTICE,
      totalGames: 0,
      bestStreak: 0,
      weeklyXp: 0,
      topicStats: {},
    };

    onLoginComplete(userProfile);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 font-medium">Đang kiểm tra đăng nhập...</p>
        </div>
      </div>
    );
  }

  // Migration dialog
  if (showMigrationDialog && tempUserData && realUserData) {
    const stats = checkAccountData(tempUserData.userID);
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-900/50 p-8 rounded-[40px] border border-slate-800 backdrop-blur-xl shadow-2xl space-y-6">
          <div className="text-center space-y-4">
            <div className="bg-green-600 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl">
              ✓
            </div>
            <h2 className="text-2xl font-black">Chào mừng trở lại!</h2>
            <p className="text-slate-400">
              Phát hiện tài khoản Eduso: <span className="text-white font-bold">{realUserData.name || realUserData.email}</span>
            </p>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
            <p className="text-sm text-slate-300 mb-2">
              Tài khoản khách <span className="text-yellow-500 font-bold">{tempUserData.playerName}</span> có:
            </p>
            <div className="flex gap-4 text-center">
              <div className="flex-1 bg-slate-900 p-3 rounded-xl">
                <p className="text-2xl font-black text-white">{stats.gamesPlayed}</p>
                <p className="text-xs text-slate-500 uppercase">Trận đấu</p>
              </div>
              <div className="flex-1 bg-slate-900 p-3 rounded-xl">
                <p className="text-2xl font-black text-red-500">{stats.totalXp}</p>
                <p className="text-xs text-slate-500 uppercase">XP</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleMigrate}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl transition-all"
            >
              Chuyển dữ liệu sang Eduso
            </button>
            <button
              onClick={handleSkipMigration}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-2xl transition-all"
            >
              Bỏ qua, dùng tài khoản Eduso mới
            </button>
          </div>

          <p className="text-center text-xs text-slate-500">
            Dữ liệu tài khoản khách sẽ được gộp vào tài khoản Eduso
          </p>
        </div>
      </div>
    );
  }

  // User selection / New user form
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-md space-y-8 bg-slate-900/50 p-10 rounded-[40px] border border-slate-800 backdrop-blur-xl shadow-2xl">
        <div className="text-center space-y-4">
          <div className="bg-red-600 w-20 h-20 rounded-2xl mx-auto flex items-center justify-center text-4xl font-black shadow-lg shadow-red-600/30">
            X
          </div>
          <h1 className="text-4xl font-black tracking-tighter">ĐẤU TRƯỜNG X</h1>
          <p className="text-slate-400 font-medium">
            {showUserSelection && recentUsers.length > 0
              ? 'Chọn tài khoản để tiếp tục'
              : 'Nhập nickname để bắt đầu hành trình!'}
          </p>
        </div>

        {showUserSelection && recentUsers.length > 0 ? (
          <div className="space-y-4">
            {/* Recent users list */}
            <div className="space-y-2">
              {recentUsers.map((user) => (
                <button
                  key={user.userID}
                  onClick={() => handleContinueWithUser(user)}
                  className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl hover:border-red-600 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl">
                    {user.isTempUser ? '👤' : '✓'}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-white group-hover:text-red-500 transition-colors">
                      {user.playerName || user.email || 'User'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.isTempUser ? (
                        <span className="px-2 py-0.5 bg-yellow-600/20 text-yellow-500 rounded">Khách</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-600/20 text-green-500 rounded">Eduso</span>
                      )}
                    </p>
                  </div>
                  <span className="text-slate-600 group-hover:text-red-500 transition-colors">→</span>
                </button>
              ))}
            </div>

            {/* Create new user button */}
            <button
              onClick={handleCreateNewUser}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="text-xl">+</span>
              TẠO TÀI KHOẢN MỚI
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Nickname của bạn..."
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              autoFocus
              className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-center text-xl font-bold focus:border-red-600 focus:outline-none transition-all"
            />
            <div className="flex gap-3">
              {recentUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowUserSelection(true)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all"
                >
                  QUAY LẠI
                </button>
              )}
              <button
                type="submit"
                disabled={!nicknameInput.trim()}
                className="flex-[2] bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/20 active:scale-95 transition-all"
              >
                VÀO ĐẤU TRƯỜNG
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-slate-600">
          Đăng nhập bằng tài khoản Eduso tại{' '}
          <a href="https://eduso.vn/login?returnUrl=https://eduso.vn/edux/" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">
            eduso.vn
          </a>
          {' '}để lưu kết quả vĩnh viễn
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
