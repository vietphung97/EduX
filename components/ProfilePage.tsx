
import React, { useState } from 'react';
import { UserProfile, UserLevel } from '../types';
import { LEVEL_CONFIG } from '../constants';
import { getLocalAvatarUrl, LOCAL_AVATAR_COUNT } from '../utils/playerSession';
import AvatarDisplay from './AvatarDisplay';

interface ProfilePageProps {
  user: UserProfile;
  onUpdateAvatar: (newAvatar: string) => void;
  onBack: () => void;
  onPracticeTopic: (topic: string) => void;
  onViewRewards?: () => void;
  onViewCertificate?: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUpdateAvatar, onBack, onPracticeTopic, onViewRewards, onViewCertificate }) => {
  const [isChanging, setIsChanging] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const currentLevelConfig = LEVEL_CONFIG.find(c => user.xp >= c.minXp && user.xp <= c.maxXp) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG[LEVEL_CONFIG.indexOf(currentLevelConfig) + 1];

  const calculateProgress = () => {
    if (!nextLevelConfig) return 100;
    const range = nextLevelConfig.minXp - currentLevelConfig.minXp;
    const currentProgress = user.xp - currentLevelConfig.minXp;
    return Math.min(Math.max((currentProgress / range) * 100, 0), 100);
  };

  const handleSelectAvatar = (index: number) => {
    onUpdateAvatar(getLocalAvatarUrl(index));
    setIsChanging(true);
    setShowAvatarPicker(false);
    setTimeout(() => setIsChanging(false), 500);
  };

  const currentAvatarIndex = (() => {
    const m = (user.avatar || '').match(/avatars\/a(\d+)\.png/);
    return m ? parseInt(m[1], 10) - 1 : -1;
  })();

  // Explicit typing for topic statistics
  const topicStats = (Object.entries(user.topicStats || {}) as [string, { correct: number; total: number }][])
    .sort((a, b) => {
      const bRate = b[1].total === 0 ? 0 : b[1].correct / b[1].total;
      const aRate = a[1].total === 0 ? 0 : a[1].correct / a[1].total;
      return bRate - aRate;
    });

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-20 px-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">TÀI KHOẢN CỦA TÔI</h2>
          {user.id.startsWith('guest_') && (
            <span className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              Guest Mode
            </span>
          )}
        </div>
        <button 
          onClick={onBack}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-xs uppercase tracking-widest"
        >
          QUAY LẠI
        </button>
      </div>

      {/* Hero Stats Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        {/* Profile Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl sm:rounded-[40px] p-5 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-red-600/10 rounded-full blur-3xl" />
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className={`relative group transition-all ${isChanging ? 'scale-90 opacity-50' : 'scale-100'}`}>
              {/* Tooltip */}
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                Đổi ảnh đại diện
              </span>
              <AvatarDisplay
                avatar={user.avatar}
                name={user.name}
                equippedFrame={user.equippedFrame}
                unlockedFrames={user.unlockedFrames}
                size="xl"
              />
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="absolute bottom-1 right-1 bg-red-600 hover:bg-red-700 p-1.5 rounded-full shadow-lg transition-all active:scale-90 z-10"
                title="Đổi ảnh đại diện"
              >
                <span className="text-lg">🖼️</span>
              </button>
            </div>

            <div className="text-center">
              <h3 className="text-3xl font-black text-white">{user.name}</h3>
              <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mt-1">ID: {user.id}</p>
            </div>

            <div className="w-full grid grid-cols-1 gap-4">
              <div className="bg-slate-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cấp độ hiện tại</p>
                <p className="text-2xl font-black text-white flex items-center justify-center gap-2">
                  {currentLevelConfig.emoji} {user.level}
                </p>
                <p className="text-[10px] font-bold text-slate-600 uppercase mt-1">
                  {user.xp.toLocaleString()} / {currentLevelConfig.maxXp === Infinity ? '∞' : currentLevelConfig.maxXp.toLocaleString()} XP
                </p>
              </div>
            </div>

            <div className="w-full space-y-4 pt-4 border-t border-slate-800/50">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Tiến trình Rank</p>
                  <p className="text-sm font-bold text-slate-300">
                    {nextLevelConfig 
                      ? `Còn ${(nextLevelConfig.minXp - user.xp).toLocaleString()} XP để thăng hạng` 
                      : 'Bạn đã là Huyền thoại!'}
                  </p>
                </div>
                <p className="text-xs font-black text-red-500">{Math.round(calculateProgress())}%</p>
              </div>
              <div className="h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-1">
                <div 
                  className="h-full bg-red-600 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(220,38,38,0.5)]" 
                  style={{ width: `${calculateProgress()}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rank System Roadmap */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl sm:rounded-[40px] p-5 sm:p-10 shadow-2xl">
          <div className="flex items-center gap-4 mb-6 sm:mb-10">
            <div className="bg-red-600/20 p-3 rounded-2xl">
              <span className="text-2xl">🏆</span>
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Hệ thống thăng hạng</h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Tích lũy XP để vươn tới đỉnh cao</p>
            </div>
          </div>

          <div className="relative space-y-6">
            {LEVEL_CONFIG.map((rank) => {
              const isAchieved = user.xp >= rank.minXp;
              const isCurrent = user.xp >= rank.minXp && user.xp <= rank.maxXp;
              const isLocked = user.xp < rank.minXp;
              
              return (
                <div 
                  key={rank.level} 
                  className={`relative flex items-center gap-3 sm:gap-6 p-4 sm:p-5 rounded-[24px] border-2 transition-all duration-300 ${
                    isCurrent ? 'bg-red-600/10 border-red-600 shadow-lg shadow-red-900/10 scale-[1.02]' : 
                    isAchieved ? 'bg-slate-800/40 border-slate-700/50 opacity-100' : 
                    'bg-slate-950/50 border-slate-900 opacity-60'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-inner ${
                    isAchieved ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 grayscale'
                  }`}>
                    {rank.emoji}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-lg font-black uppercase tracking-tight ${isCurrent ? 'text-red-500' : 'text-white'}`}>
                        {rank.level}
                      </h4>
                      {isAchieved && !isCurrent && <span className="text-green-500 text-xs">✓</span>}
                      {isCurrent && <span className="bg-red-600 text-[10px] px-2 py-0.5 rounded-full font-black uppercase text-white animate-pulse">Hiện tại</span>}
                    </div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                      {rank.minXp.toLocaleString()}{rank.maxXp === Infinity ? '+' : ` – ${rank.maxXp.toLocaleString()}`} XP
                    </p>
                  </div>

                  {isLocked && (
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Cần thêm</p>
                      <p className="text-sm font-black text-slate-400">{(rank.minXp - user.xp).toLocaleString()} XP</p>
                    </div>
                  )}

                  <div className="hidden md:block">
                    {isAchieved ? (
                      <span className="text-[10px] font-black uppercase text-green-500 tracking-widest bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">Đã đạt</span>
                    ) : (
                      <span className="text-[10px] font-black uppercase text-slate-700 tracking-widest bg-slate-950 px-3 py-1 rounded-full border border-slate-900">Locked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
        {/* Statistics Column */}
        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 p-5 sm:p-10 rounded-3xl sm:rounded-[40px] shadow-2xl">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Thống kê chiến đấu</h4>
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              <div className="bg-slate-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Số trận</p>
                <p className="text-3xl font-black text-white">{user.totalGames}</p>
              </div>
              <div className="bg-slate-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Chuỗi cao nhất</p>
                <p className="text-3xl font-black text-yellow-500">{user.bestStreak}🔥</p>
              </div>
              <div className="bg-slate-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">XP Tuần</p>
                <p className="text-3xl font-black text-green-500">+{user.weeklyXp}</p>
              </div>
              <div className="bg-slate-950/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Frames</p>
                <p className="text-3xl font-black text-purple-400">{(user.unlockedFrames || []).length}🏅</p>
              </div>
            </div>
            {onViewRewards && (
              <button
                onClick={onViewRewards}
                className="w-full mt-4 py-3 bg-gradient-to-r from-purple-900/40 to-amber-900/40 border border-purple-700/30 hover:border-purple-500/60 text-purple-300 font-black rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                🏅 XEM KHO PHẦN THƯỞNG
              </button>
            )}
            {onViewCertificate && (
              <button
                onClick={onViewCertificate}
                className="w-full mt-2 py-3 bg-gradient-to-r from-blue-900/30 to-green-900/30 border border-blue-700/30 hover:border-blue-500/60 text-blue-300 font-black rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                🎓 XEM CHỨNG NHẬN
              </button>
            )}
          </div>
        </div>

        {/* Accuracy Column - Updated based on image request */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl sm:rounded-[40px] p-5 sm:p-10 shadow-2xl flex flex-col min-h-[500px]">
            <div className="flex items-center gap-4 mb-6 sm:mb-10">
              <div className="bg-[#122c23] p-4 rounded-2xl">
                <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center p-1 overflow-hidden">
                   <div className="flex gap-1 h-full items-end">
                      <div className="w-1 bg-green-500 h-1/2"></div>
                      <div className="w-1 bg-white h-full"></div>
                      <div className="w-1 bg-red-500 h-2/3"></div>
                   </div>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Tỷ lệ đúng theo chủ đề</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Toàn bộ lịch sử đấu</p>
              </div>
            </div>

            {topicStats.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 space-y-4">
                <div className="text-6xl opacity-20">📂</div>
                <h4 className="text-lg font-black text-slate-600 uppercase italic">Chưa có dữ liệu</h4>
                <p className="text-slate-500 text-xs max-w-xs mx-auto font-medium">
                  Hãy bắt đầu tham gia các trận Solo để ghi nhận tỉ lệ chính xác theo chủ đề!
                </p>
              </div>
            ) : (
              <div className="space-y-6 sm:space-y-10">
                {topicStats.map(([topic, stats]) => {
                  const percentage = stats.total === 0 ? 0 : Math.round((stats.correct / stats.total) * 100);
                  return (
                    <div key={topic} className="space-y-4 group">
                      <div className="flex justify-between items-center">
                        <p className="text-md font-black text-white uppercase tracking-wider group-hover:text-red-500 transition-colors">{topic}</p>
                        <div className="flex items-center gap-4">
                          <p className={`text-xl font-black italic tracking-tighter ${percentage >= 80 ? 'text-green-500' : percentage >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                            {percentage}%
                          </p>
                          <button 
                            onClick={() => onPracticeTopic(topic)}
                            className="bg-slate-800 hover:bg-red-600 text-white text-[10px] font-black px-3 py-2 rounded-lg uppercase tracking-widest transition-all hover:scale-105"
                          >
                            Luyện tập
                          </button>
                        </div>
                      </div>
                      <div className="h-2.5 bg-[#0a1120] rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-1000 bg-[#ef5350]" 
                          style={{ width: `${percentage}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="mt-auto pt-10 border-t border-slate-800/50 flex items-start gap-4">
              <div className="bg-[#0052cc] p-2 rounded shadow-lg">
                <span className="text-white text-xs">ℹ️</span>
              </div>
              <p className="text-[11px] font-bold uppercase leading-relaxed tracking-wider text-slate-500">
                Rank và Tỷ lệ chủ đề là cơ sở để Cố vấn X đánh giá lộ trình phát triển bản lĩnh tiếng Anh của bạn.
              </p>
            </div>
        </div>
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowAvatarPicker(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-white">Chọn ảnh đại diện</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">{LOCAL_AVATAR_COUNT} ảnh mặc định</p>
              </div>
              <button
                onClick={() => setShowAvatarPicker(false)}
                className="text-slate-400 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
              {Array.from({ length: LOCAL_AVATAR_COUNT }, (_, i) => (
                /* Dùng padding-top 100% thay aspect-square: Safari iOS không tính
                   aspect-ratio trên <button> trong grid → ô cao 0, ảnh đè lên nhau */
                <button
                  key={i}
                  onClick={() => handleSelectAvatar(i)}
                  className={`relative w-full rounded-xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95 ${
                    currentAvatarIndex === i
                      ? 'border-red-500 ring-2 ring-red-500/40'
                      : 'border-slate-700 hover:border-red-500/60'
                  }`}
                  style={{ paddingTop: '100%' }}
                >
                  <img
                    src={getLocalAvatarUrl(i)}
                    alt={`Avatar ${i + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                  {currentAvatarIndex === i && (
                    <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center">
                      <span className="text-white text-lg drop-shadow">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
