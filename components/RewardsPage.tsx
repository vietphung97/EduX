/**
 * RewardsPage.tsx
 * Trang Quà tặng — theo mockup: 4 sections cuộn liền.
 * ① XP progress bar với milestones
 * ② Bộ sưu tập khung avatar (horizontal scroll)
 * ③ Vòng quay may mắn + giải thưởng
 * ④ Chứng nhận hoàn thành
 */

import React, { useRef } from 'react';
import { UserProfile } from '../types';
import { WEEKLY_FRAMES, getCurrentProgramWeek } from '../constants';
import { getFrameUnlockCount, getCompletedFrames, getNextMilestone, isFrameUsable } from '../utils/frameLogic';
import { isAvatarImage, normalizeAvatarUrl } from '../utils/playerSession';
import AvatarDisplay from './AvatarDisplay';
import LuckySpin, { SpinPrize } from './LuckySpin';

// ⚠️ TEST: giữ 10s vào card khung avatar để unlock cả 3 mốc (chức năng ẩn cho test).
// ĐẶT false TRƯỚC KHI CHẠY THẬT!
const ENABLE_TEST_UNLOCK_HOLD = false;
const TEST_UNLOCK_HOLD_MS = 10000;

interface RewardsPageProps {
  user: UserProfile;
  onEquipFrame: (frameId: string | undefined) => void;
  onSpinResult?: (prize: SpinPrize, newSpinsUsed: number) => void;
  /** TEST: unlock toàn bộ mốc của khung (giữ 10s) */
  onTestUnlockFrame?: (frameId: string) => void;
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

const RewardsPage: React.FC<RewardsPageProps> = ({ user, onEquipFrame, onSpinResult, onTestUnlockFrame, onBack, onNavigate }) => {
  const unlockedFrames = user.unlockedFrames || [];
  const equippedFrame = user.equippedFrame;
  const currentWeek = getCurrentProgramWeek();
  const completedFrames = new Set(getCompletedFrames(unlockedFrames));
  const nextMilestone = getNextMilestone(user.weeklyXp, unlockedFrames, currentWeek);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Long-press 10s vào card khung → unlock (TEST)
  const holdTimerRef = useRef<number | null>(null);
  const startUnlockHold = (frameId: string) => {
    if (!ENABLE_TEST_UNLOCK_HOLD || !onTestUnlockFrame) return;
    holdTimerRef.current = window.setTimeout(() => onTestUnlockFrame(frameId), TEST_UNLOCK_HOLD_MS);
  };
  const cancelUnlockHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  // (spinsLeft hiển thị do LuckySpin tự tính — đồng bộ với cơ chế:
  //  1 lượt free / tuần + bonus multiplayer + bonus hoàn thành khung tuần.)

  const handleSpinResult = (prize: SpinPrize, newSpinsUsed: number) => {
    onSpinResult?.(prize, newSpinsUsed);
  };

  // Current week frame data
  const currentFrame = currentWeek ? WEEKLY_FRAMES.find(f => f.week === currentWeek) : null;
  const weeksCompleted = completedFrames.size;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-20">

      {/* ═══ BANNER ═══ */}
      <div className="relative overflow-hidden rounded-none sm:rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/30 border-b sm:border border-slate-800 px-4 sm:px-10 py-8 sm:py-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-3xl" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-1">
            <h2 className="text-3xl sm:text-4xl font-black italic tracking-tighter uppercase text-white">
              QUÀ TẶNG
            </h2>
            <p className="text-red-500 font-black text-sm uppercase tracking-widest mt-1">
              Kho quà EDUSO English Summer Arena
            </p>
            <p className="text-slate-400 text-xs mt-3 max-w-lg leading-relaxed">
              Tích lũy XP qua Đấu hạng và Thách đấu để mở khóa khung avatar, quay thưởng may mắn và nhận chứng nhận hoàn thành.
            </p>
          </div>
          <div className="flex gap-3 sm:gap-4">
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3 sm:p-4 text-center min-w-[80px]">
              <p className="text-2xl">🖼️</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-tight">Sưu tập<br/>khung avatar</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3 sm:p-4 text-center min-w-[80px]">
              <p className="text-2xl">🎰</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-tight">Quay thưởng<br/>hàng tuần</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3 sm:p-4 text-center min-w-[80px]">
              <p className="text-2xl">📜</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1.5 leading-tight">Chứng nhận<br/>hoàn thành</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 1: XP PROGRESS ═══ */}
      {currentFrame && (
        <div className="px-4 sm:px-0">
          <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Tuần {currentFrame.week} · {currentFrame.name}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-white mt-1">
                  {user.weeklyXp.toLocaleString()} <span className="text-sm text-slate-500">XP</span>
                </p>
              </div>
              <button
                onClick={() => onNavigate?.('home')}
                className="px-4 sm:px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-600/20"
              >
                Tiếp tục săn XP
              </button>
            </div>

            {/* XP milestone bar */}
            <div className="relative mt-6 mb-2">
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (user.weeklyXp / (currentFrame.items[2]?.xpRequired || 2500)) * 100)}%`,
                    background: `linear-gradient(90deg, ${currentFrame.color}, ${currentFrame.color}cc)`,
                    boxShadow: `0 0 12px ${currentFrame.glowColor}`,
                  }}
                />
              </div>

              {/* Milestone markers — 3 mốc XP, mốc cuối hiện ảnh frame */}
              <div className="relative mt-3 flex justify-between" style={{ paddingLeft: '5%', paddingRight: '5%', minHeight: '60px' }}>
                {currentFrame.items.map((item, i) => {
                  const isUnlocked = unlockedFrames.includes(item.id);
                  const maxXp = currentFrame.items[2]?.xpRequired || 2500;
                  const pos = (item.xpRequired / maxXp) * 90 + 5;
                  const isLastMilestone = i === 2;
                  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col items-center"
                      style={{ position: 'absolute', left: `${pos}%`, transform: 'translateX(-50%)' }}
                    >
                      {isLastMilestone ? (
                        <img
                          src={`${baseUrl}${currentFrame.frameImage}`}
                          alt={currentFrame.name}
                          className={`w-10 h-10 sm:w-12 sm:h-12 ${!isUnlocked ? 'grayscale opacity-40' : ''}`}
                        />
                      ) : (
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-black border-2 ${
                          isUnlocked
                            ? 'border-green-500 text-green-400 bg-green-500/10'
                            : 'border-slate-700 text-slate-600 bg-slate-900'
                        }`}>
                          {isUnlocked ? '✓' : `${i + 1}`}
                        </div>
                      )}
                      <p className={`text-[10px] font-black mt-1 ${isUnlocked ? 'text-green-400' : 'text-slate-600'}`}>
                        {item.xpRequired.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {nextMilestone ? (
              <p className="text-xs text-slate-500 text-center mt-8">
                Còn <span className="text-white font-bold">{Math.max(0, nextMilestone.xpRequired - user.weeklyXp).toLocaleString()} XP</span> để {nextMilestone.xpRequired === 2500 ? 'mở khung avatar tuần này' : `đạt mốc ${nextMilestone.xpRequired.toLocaleString()} XP`}
              </p>
            ) : (
              <p className="text-xs text-green-400 font-bold text-center mt-8">✅ Đã mở khung avatar tuần này!</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ SECTION 2: BỘ SƯU TẬP KHUNG AVATAR ═══ */}
      <div className="px-4 sm:px-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">🖼️ Bộ sưu tập khung avatar</h3>
            <p className="text-xs text-slate-500 font-bold mt-0.5">{completedFrames.size}/8 khung đã hoàn thành</p>
          </div>
        </div>

        {/* Horizontal scroll */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'thin' }}
        >
          {WEEKLY_FRAMES.map(frame => {
            const unlockCount = getFrameUnlockCount(frame.id, unlockedFrames);
            const isComplete = unlockCount === 3;
            const isEquipped = equippedFrame === frame.id;
            const isFuture = currentWeek !== null && frame.week > currentWeek;
            const canUse = isFrameUsable(frame.id, unlockedFrames);
            const baseUrl = (import.meta as any).env?.BASE_URL || '/';

            return (
              <div
                key={frame.id}
                className={`flex-shrink-0 w-[200px] sm:w-[220px] bg-slate-900 border-2 rounded-[20px] p-4 snap-start transition-all select-none ${
                  isEquipped ? 'border-opacity-100 shadow-lg' : canUse ? 'border-slate-700' : 'border-slate-800'
                }`}
                style={{
                  borderColor: isEquipped ? frame.color : canUse ? frame.color + '60' : undefined,
                  boxShadow: isEquipped ? `0 0 16px ${frame.glowColor}` : undefined,
                }}
                // TEST: giữ 10s để unlock khung (ENABLE_TEST_UNLOCK_HOLD)
                onMouseDown={() => startUnlockHold(frame.id)}
                onMouseUp={cancelUnlockHold}
                onMouseLeave={cancelUnlockHold}
                onTouchStart={() => startUnlockHold(frame.id)}
                onTouchEnd={cancelUnlockHold}
                onTouchCancel={cancelUnlockHold}
              >
                {/* Frame image preview */}
                <div className="relative w-24 h-24 mx-auto mb-3">
                  <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
                    <div className="w-[72px] h-[72px] rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                      {isAvatarImage(user.avatar) ? (
                        <img src={normalizeAvatarUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{user.avatar || '🎮'}</span>
                      )}
                    </div>
                  </div>
                  <img
                    src={`${baseUrl}${frame.frameImage}`}
                    alt={frame.name}
                    className={`absolute inset-0 w-full h-full pointer-events-none ${!canUse ? 'grayscale opacity-40' : ''}`}
                    style={{ zIndex: 1 }}
                  />
                </div>

                {/* Name + week */}
                <div className="text-center mb-3">
                  <p className="font-black text-white text-xs uppercase tracking-tight">{frame.name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: canUse ? frame.color : '#475569' }}>
                    Tuần {frame.week}
                  </p>
                </div>

                {/* XP Progress — 3 milestones */}
                <div className="flex items-center gap-1 mb-3">
                  {frame.items.map((item, i) => {
                    const reached = unlockedFrames.includes(item.id);
                    return (
                      <div key={item.id} className="flex-1">
                        <div className="h-1.5 rounded-full" style={{ background: reached ? frame.color : '#1e293b' }} />
                        <p className={`text-[10px] text-center mt-0.5 font-bold ${reached ? 'text-slate-400' : 'text-slate-700'}`}>
                          {item.xpRequired}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Status / Equip button */}
                {canUse ? (
                  <button
                    onClick={() => onEquipFrame(isEquipped ? undefined : frame.id)}
                    className="w-full py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                    style={{
                      background: isEquipped ? `${frame.color}33` : `${frame.color}15`,
                      color: frame.color,
                      border: `1.5px solid ${frame.color}55`,
                    }}
                  >
                    {isEquipped ? '✓ Đang dùng' : '✨ Trang bị'}
                  </button>
                ) : (
                  <div className="w-full py-2 rounded-xl text-center text-[10px] font-black uppercase tracking-widest text-slate-700 bg-slate-950 border border-slate-900">
                    {isFuture ? '⏳ Chưa đến tuần' : isComplete ? '⏳ Chưa đến tuần' : `🔒 ${unlockCount}/3 mốc`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 3: VÒNG QUAY MAY MẮN ═══ */}
      <div className="px-4 sm:px-0">
        <LuckySpin user={user} onSpinResult={handleSpinResult} />
      </div>

      {/* ═══ SECTION 4: CHỨNG NHẬN HOÀN THÀNH ═══ */}
      <div className="px-4 sm:px-0">
        <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Certificate preview */}
            <div className="w-full sm:w-[240px] flex-shrink-0 bg-gradient-to-br from-yellow-900/20 to-slate-900 border border-yellow-700/30 rounded-2xl p-6 text-center">
              <p className="text-4xl mb-2">📜</p>
              <p className="text-xs font-black text-yellow-500 uppercase tracking-widest">Chứng nhận</p>
              <p className="text-[10px] text-slate-500 mt-1">EDUSO ENGLISH SUMMER ARENA 2026</p>
              {/* Avatar to, rõ — đặt giữa, tên bên dưới */}
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <AvatarDisplay
                  avatar={user.avatar}
                  name={user.name}
                  equippedFrame={equippedFrame}
                  unlockedFrames={unlockedFrames}
                  size="xl"
                />
                <p className="text-sm font-black text-white truncate max-w-full">{user.name}</p>
              </div>
            </div>

            {/* Info & progress */}
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">📜 Chứng nhận hoàn thành</h3>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Thu thập tối thiểu 2/8 khung avatar để nhận chứng nhận
              </p>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full transition-all duration-700"
                    style={{ width: `${(weeksCompleted / 8) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-black text-white">{weeksCompleted}/8</span>
              </div>
              <p className="text-xs text-slate-400 mb-5">
                Đã thu thập <span className="text-yellow-400 font-bold">{weeksCompleted} khung</span>
                {weeksCompleted >= 2 ? ' — Đủ điều kiện nhận chứng nhận!' : ` — Cần thêm ${2 - weeksCompleted} khung nữa`}
              </p>

              <button
                onClick={() => onNavigate?.('certificate')}
                className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                  weeksCompleted >= 2
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-600/20'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                }`}
                disabled={weeksCompleted < 2}
              >
                {weeksCompleted >= 2 ? '📥 Tải chứng nhận' : '🔒 Chưa đủ điều kiện'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-600 pb-4 px-4">
        ĐƯỢC NGHIÊN CỨU VÀ PHÁT TRIỂN BỞI EDUSO
      </p>
    </div>
  );
};

export default RewardsPage;
