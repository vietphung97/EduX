/**
 * CertificatePage.tsx
 * Chứng nhận tham gia chương trình Đấu trường X Summer 2026.
 */

import React from 'react';
import { UserProfile } from '../types';
import { LEVEL_CONFIG, WEEKLY_FRAMES } from '../constants';
import { getCompletedFrames } from '../utils/frameLogic';
import AvatarDisplay from './AvatarDisplay';

interface CertificatePageProps {
  user: UserProfile;
  onBack: () => void;
}

const ITEM_MAP: Record<string, { name: string; emoji: string }> = {};
WEEKLY_FRAMES.forEach(frame => {
  frame.items.forEach(item => {
    ITEM_MAP[item.id] = { name: item.name, emoji: item.emoji };
  });
});

function getCertSerial(userId: string): string {
  const raw = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const tail = raw.slice(-8).padStart(8, '0');
  return `DTX-2026-${tail.slice(0, 4)}-${tail.slice(4)}`;
}

const CertificatePage: React.FC<CertificatePageProps> = ({ user, onBack }) => {
  const levelConfig = LEVEL_CONFIG.find(c => c.level === user.level) || LEVEL_CONFIG[0];
  const unlockedFrames = user.unlockedFrames || [];
  const completedWeeks = getCompletedFrames(unlockedFrames);
  const serial = getCertSerial(user.id);

  const today = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 px-4 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">🎓 CHỨNG NHẬN</h2>
          <p className="text-slate-500 text-xs uppercase tracking-widest">Đấu trường X · Summer 2026</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
          >
            🖨️ In / Lưu PDF
          </button>
          <button
            onClick={onBack}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700"
          >
            QUAY LẠI
          </button>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-[32px] p-1"
        style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444, #a855f7, #3b82f6)' }}
      >
        <div className="bg-[#0f172a] rounded-[28px] p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none select-none" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
            backgroundSize: '20px 20px',
          }} />
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl" />

          <div className="relative z-10 text-center space-y-7">
            <div className="flex justify-center">
              <div className="bg-red-600 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-4xl shadow-lg shadow-red-600/30">
                X
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-2">EDUSO · CHỨNG NHẬN THAM GIA</p>
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight">
                ĐẤU TRƯỜNG X<br/>
                <span className="text-red-500">SUMMER 2026</span>
              </h1>
              <p className="text-slate-400 text-sm font-medium mt-3 max-w-xs mx-auto">
                Chứng nhận học sinh đã tham gia chương trình thi đấu Tiếng Anh hè
              </p>
            </div>

            <div className="flex justify-center">
              <AvatarDisplay
                avatar={user.avatar}
                name={user.name}
                equippedFrame={user.equippedFrame}
                unlockedFrames={user.unlockedFrames}
                size="xl"
              />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Tên học sinh</p>
              <p className="text-3xl sm:text-4xl font-black text-white">{user.name}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <p className="text-2xl font-black text-yellow-400">{user.xp.toLocaleString()}</p>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mt-0.5">Tổng XP</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <p className="text-2xl font-black text-green-400">{user.totalGames}</p>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mt-0.5">Trận đấu</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                <p className="text-2xl font-black text-orange-400">{user.bestStreak}🔥</p>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mt-0.5">Streak cao nhất</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-3 bg-slate-800/50 px-6 py-3 rounded-full border border-slate-700/50">
              <span className="text-2xl">{levelConfig.emoji}</span>
              <div className="text-left">
                <p className="font-black text-white text-sm uppercase">{user.level}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cấp độ hiện tại</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                KHUNG TUẦN HOÀN THÀNH ({completedWeeks.length}/8)
              </p>
              <div className="flex justify-center gap-2 flex-wrap">
                {WEEKLY_FRAMES.map(frame => {
                  const done = completedWeeks.includes(frame.id);
                  return (
                    <div
                      key={frame.id}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all ${
                        done
                          ? 'bg-slate-800/60 border-opacity-40'
                          : 'bg-slate-900/40 border-slate-800 opacity-30'
                      }`}
                      style={done ? { borderColor: `${frame.color}60` } : undefined}
                    >
                      <span className="text-xl">{frame.emoji}</span>
                      <span
                        className="text-[10px] font-black uppercase tracking-wider"
                        style={done ? { color: frame.color } : { color: '#475569' }}
                      >
                        T{frame.week}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {unlockedFrames.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  VẬT PHẨM ĐÃ MỜ KHÓA ({unlockedFrames.length} items)
                </p>
                <div className="flex justify-center gap-1.5 flex-wrap max-w-xs mx-auto">
                  {unlockedFrames.map(itemId => {
                    const item = ITEM_MAP[itemId];
                    return (
                      <span key={itemId} className="text-xl" title={item?.name || itemId}>
                        {item?.emoji || '🏅'}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
              <p className="text-slate-600 font-bold">Ngày cấp: {today}</p>
              <p className="text-slate-500 font-mono font-bold text-[10px] tracking-wider">{serial}</p>
              <p className="text-slate-600 font-bold">eduso.vn · Đấu trường X</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-600">
        Nhấn "In / Lưu PDF" để lưu chứng nhận, hoặc chụp màn hình để chia sẻ.
      </p>
    </div>
  );
};

export default CertificatePage;
