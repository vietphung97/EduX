/**
 * RewardsPage.tsx
 * Hiển thị toàn bộ avatar frames theo tuần chương trình hè.
 * Học sinh có thể xem items đã/chưa unlock, trang bị frame, và quay Lucky Spin.
 */

import React, { useState } from 'react';
import { UserProfile } from '../types';
import { WEEKLY_FRAMES, getCurrentProgramWeek } from '../constants';
import { getFrameUnlockCount, getCompletedFrames, getNextMilestone } from '../utils/frameLogic';
import AvatarDisplay from './AvatarDisplay';
import LuckySpin, { SpinPrize } from './LuckySpin';

interface RewardsPageProps {
  user: UserProfile;
  onEquipFrame: (frameId: string | undefined) => void;
  onSpinResult?: (prize: SpinPrize, newSpinsUsed: number) => void;
  onBack: () => void;
}

const RewardsPage: React.FC<RewardsPageProps> = ({ user, onEquipFrame, onSpinResult, onBack }) => {
  const unlockedFrames = user.unlockedFrames || [];
  const equippedFrame = user.equippedFrame;
  const currentWeek = getCurrentProgramWeek();
  const completedFrames = new Set(getCompletedFrames(unlockedFrames));
  const nextMilestone = getNextMilestone(user.weeklyXp, unlockedFrames, currentWeek);

  const totalUnlockedItems = unlockedFrames.length;
  const totalItems = WEEKLY_FRAMES.length * 3;

  const [activeTab, setActiveTab] = useState<'frames' | 'spin'>('frames');

  const spinsUsedThisWeek =
    (user.lastSpinWeek ?? 0) === (currentWeek ?? 0) ? (user.spinsUsed ?? 0) : 0;
  const spinsLeft = Math.max(0, completedFrames.size - spinsUsedThisWeek);

  const handleSpinResult = (prize: SpinPrize, newSpinsUsed: number) => {
    onSpinResult?.(prize, newSpinsUsed);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-20 px-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">🏅 KHO PHẦN THƯỞNG</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {totalUnlockedItems}/{totalItems} items · {completedFrames.size}/8 frames
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700"
        >
          QUAY LẠI
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1.5">
        <button
          onClick={() => setActiveTab('frames')}
          className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
            activeTab === 'frames' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          🖼️ KHUNG AVATAR
        </button>
        <button
          onClick={() => setActiveTab('spin')}
          className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all relative ${
            activeTab === 'spin' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          🎰 VÒNG QUAY
          {spinsLeft > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] font-black flex items-center justify-center animate-bounce">
              {spinsLeft}
            </span>
          )}
        </button>
      </div>

      {/* SPIN TAB */}
      {activeTab === 'spin' && (
        <LuckySpin user={user} onSpinResult={handleSpinResult} />
      )}

      {/* FRAMES TAB */}
      {activeTab === 'frames' && (
        <>
          {/* Equipped frame preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-4 sm:p-8 flex items-center gap-4 sm:gap-8">
            <AvatarDisplay
              avatar={user.avatar}
              name={user.name}
              equippedFrame={equippedFrame}
              unlockedFrames={unlockedFrames}
              size="xl"
            />
            <div className="flex-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Frame đang trang bị</p>
              {equippedFrame ? (
                <>
                  {(() => {
                    const f = WEEKLY_FRAMES.find(f => f.id === equippedFrame);
                    if (!f) return null;
                    const cnt = getFrameUnlockCount(f.id, unlockedFrames);
                    return (
                      <>
                        <p className="text-2xl font-black text-white">{f.emoji} {f.name}</p>
                        <p className="text-sm text-slate-400 mt-1">Tuần {f.week} · {cnt}/3 items đã mở</p>
                        {cnt === 3 && (
                          <p className="text-xs font-black text-yellow-400 mt-2 animate-pulse">✨ FRAME ĐẦY ĐỦ — HIỆU ỨNG KÍCH HOẠT</p>
                        )}
                      </>
                    );
                  })()}
                  <button
                    onClick={() => onEquipFrame(undefined)}
                    className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-400 font-bold rounded-xl text-xs transition-all border border-slate-700"
                  >
                    Tháo frame
                  </button>
                </>
              ) : (
                <p className="text-slate-500 font-bold">Không có — hãy chọn frame bên dưới</p>
              )}
            </div>

            {currentWeek && (
              <div className="hidden md:block min-w-[180px]">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                  XP Tuần {currentWeek} hiện tại
                </p>
                <p className="text-3xl font-black text-white">{user.weeklyXp.toLocaleString()}</p>
                {nextMilestone ? (
                  <>
                    <p className="text-xs text-slate-400 mt-1">
                      Cần {nextMilestone.xpRequired.toLocaleString()} XP để nhận {nextMilestone.itemEmoji}
                    </p>
                    <div className="h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, (user.weeklyXp / nextMilestone.xpRequired) * 100)}%`,
                          background: WEEKLY_FRAMES.find(f => f.week === currentWeek)?.color || '#ef4444',
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1">
                      Còn {Math.max(0, nextMilestone.xpRequired - user.weeklyXp).toLocaleString()} XP
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-green-400 mt-1 font-bold">✅ Đã nhận hết phần thưởng tuần này!</p>
                )}
              </div>
            )}
          </div>

          {/* Frame Grid — 8 weeks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {WEEKLY_FRAMES.map(frame => {
              const unlockCount = getFrameUnlockCount(frame.id, unlockedFrames);
              const isComplete = unlockCount === 3;
              const isEquipped = equippedFrame === frame.id;
              const isCurrentWeek = currentWeek === frame.week;
              const isPastWeek = currentWeek !== null && frame.week < currentWeek;
              const isFuture = currentWeek === null || frame.week > currentWeek;
              const canEquip = unlockCount > 0;

              return (
                <div
                  key={frame.id}
                  className={`relative bg-slate-900 border-2 rounded-[28px] p-6 transition-all ${
                    isEquipped ? 'border-opacity-100 shadow-lg' : isComplete ? 'border-slate-700 hover:border-opacity-60' : 'border-slate-800 opacity-90'
                  }`}
                  style={{
                    borderColor: isEquipped || isComplete ? frame.color : undefined,
                    boxShadow: isEquipped ? `0 0 20px ${frame.glowColor}` : undefined,
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                        style={{ background: `${frame.color}22`, border: `2px solid ${frame.color}44` }}
                      >
                        {frame.emoji}
                      </div>
                      <div>
                        <p className="font-black text-white text-sm uppercase tracking-tight">{frame.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: frame.color }}>
                          Tuần {frame.week}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isCurrentWeek && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 animate-pulse">
                          Tuần này
                        </span>
                      )}
                      {isPastWeek && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full">
                          Đã qua
                        </span>
                      )}
                      {isFuture && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-slate-900 text-slate-600 px-2 py-0.5 rounded-full">
                          Sắp tới
                        </span>
                      )}
                      <span className="text-xs font-black" style={{ color: frame.color }}>
                        {unlockCount}/3 items
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {frame.items.map(item => {
                      const isUnlocked = unlockedFrames.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-3 rounded-xl ${isUnlocked ? 'bg-slate-800' : 'bg-slate-950/50'}`}
                        >
                          <span className={`text-lg ${isUnlocked ? '' : 'grayscale opacity-40'}`}>{item.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold truncate ${isUnlocked ? 'text-white' : 'text-slate-600'}`}>
                              {item.name}
                            </p>
                            <p className={`text-[10px] font-bold ${isUnlocked ? 'text-slate-400' : 'text-slate-700'}`}>
                              {item.xpRequired.toLocaleString()} XP tuần
                            </p>
                          </div>
                          {isUnlocked ? (
                            <span className="text-green-400 text-sm">✓</span>
                          ) : (
                            <span className="text-slate-700 text-sm">🔒</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(unlockCount / 3) * 100}%`,
                        background: frame.color,
                        boxShadow: isComplete ? `0 0 6px ${frame.glowColor}` : undefined,
                      }}
                    />
                  </div>

                  {canEquip ? (
                    <button
                      onClick={() => onEquipFrame(isEquipped ? undefined : frame.id)}
                      className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                      style={{
                        background: isEquipped ? `${frame.color}33` : `${frame.color}22`,
                        color: frame.color,
                        border: `1.5px solid ${frame.color}66`,
                      }}
                    >
                      {isEquipped ? '✓ ĐANG TRANG BỊ' : isComplete ? '✨ TRANG BỊ FRAME ĐẦY ĐỦ' : 'TRANG BỊ'}
                    </button>
                  ) : (
                    <div className="w-full py-2.5 rounded-xl text-center text-[11px] font-black uppercase tracking-widest text-slate-700 bg-slate-950 border border-slate-900">
                      {isFuture ? '⏳ CHƯA MỞ KHÓA' : '🔒 CHƯA ĐẠT MILESTONE'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-slate-600 pb-4">
            Đạt 800 / 1.500 / 2.500 XP mỗi tuần để mở khóa 3 items của tuần đó
          </p>
        </>
      )}
    </div>
  );
};

export default RewardsPage;
