/**
 * RoadmapPage.tsx
 * Trang lộ trình 8 tuần chương trình hè Đấu trường X Summer 2026.
 * Design theo mockup: hero + cách tham gia + 8 tuần + lưu ý.
 */

import React from 'react';
import { UserProfile } from '../types';
import { PROGRAM_START_DATE, getCurrentProgramWeek } from '../constants';

interface RoadmapPageProps {
  user: UserProfile;
  onBack: () => void;
  onGoRewards: () => void;
}

const WEEK_THEMES = [
  {
    week: 1, en: 'Start Passport', vi: 'Hộ chiếu Khởi hành',
    emoji: '🗺️', bg: 'linear-gradient(160deg, #064e3b 0%, #065f46 50%, #047857 100%)',
    accent: '#10b981', icon: '🧭',
  },
  {
    week: 2, en: 'Forest Code', vi: 'Mật Lệnh Rừng Xanh',
    emoji: '🌲', bg: 'linear-gradient(160deg, #14532d 0%, #166534 50%, #15803d 100%)',
    accent: '#22c55e', icon: '🐉',
  },
  {
    week: 3, en: 'City Adventure', vi: 'Thành Phố Phiêu Lưu',
    emoji: '🏙️', bg: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
    accent: '#818cf8', icon: '⚡',
  },
  {
    week: 4, en: 'Deep Ocean', vi: 'Vực Sâu Đại Dương',
    emoji: '🌊', bg: 'linear-gradient(160deg, #0c4a6e 0%, #075985 50%, #0369a1 100%)',
    accent: '#38bdf8', icon: '🐋',
  },
  {
    week: 5, en: 'Mountain Peak', vi: 'Chinh phục Đỉnh Núi',
    emoji: '⛰️', bg: 'linear-gradient(160deg, #1c1917 0%, #292524 50%, #44403c 100%)',
    accent: '#a8a29e', icon: '🦅',
  },
  {
    week: 6, en: 'Desert Crossing', vi: 'Băng qua Sa Mạc',
    emoji: '🏜️', bg: 'linear-gradient(160deg, #7c2d12 0%, #9a3412 50%, #c2410c 100%)',
    accent: '#fb923c', icon: '☀️',
  },
  {
    week: 7, en: 'Sky Island', vi: 'Bay trên Mây',
    emoji: '🏝️', bg: 'linear-gradient(160deg, #0c4a6e 0%, #1e40af 50%, #7c3aed 100%)',
    accent: '#a78bfa', icon: '🪂',
  },
  {
    week: 8, en: 'Space Mission', vi: 'Du hành Vũ trụ',
    emoji: '🚀', bg: 'linear-gradient(160deg, #0f0f1a 0%, #1a0533 50%, #2e1065 100%)',
    accent: '#e879f9', icon: '🛸',
  },
];

function getWeekDateRange(weekNum: number): string {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const start = new Date(PROGRAM_START_DATE.getTime() + (weekNum - 1) * msPerWeek);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

const STEPS = [
  {
    num: '1',
    icon: 'step1.png',
    icon2: null,
    title: 'Tham gia thử thách',
    desc: 'Tham gia Đấu hạng hoặc Thách đấu để kiếm XP.',
  },
  {
    num: '2',
    icon: 'step2.png',
    icon2: 'step2_b.png',
    title: 'Mở khóa Khung Avatar và Quay thưởng',
    desc: 'Tích lũy XP để đạt mốc mở khóa Avatar chủ đề và quay thưởng may mắn hàng tuần.',
  },
  {
    num: '3',
    icon: 'step3.png',
    icon2: null,
    title: 'Nhận giấy chứng nhận',
    desc: 'Hoàn thành hành trình khám phá và nhận ngay giấy chứng nhận.',
  },
];

const NOTES = [
  {
    emoji: '📅',
    title: 'Thời gian chương trình',
    desc: 'Chương trình gồm 8 tuần liên tiếp. Mỗi tuần mới bắt đầu sẽ cộng dồn vào thứ 3 từng tuần.',
    color: '#3b82f6',
  },
  {
    emoji: '🎁',
    title: 'Phần thưởng',
    desc: 'Hoàn thành 3/3 mốc để nhận đủ vật phẩm khung chủ đề và 1 lượt quay may mắn.',
    color: '#a855f7',
  },
  {
    emoji: '📋',
    title: 'Chứng nhận',
    desc: 'Hoàn thành tối thiểu 5/8 tuần chủ đề để nhận giấy chứng nhận hoàn thành chương trình Huyền thoại Tiếng Anh X.',
    color: '#f59e0b',
  },
  {
    emoji: '🏆',
    title: 'Xếp hạng',
    desc: 'XP tuần được tính riêng để xếp hạng, và được reset vào đầu mỗi tuần trong bảng xếp hạng.',
    color: '#ef4444',
  },
];

const BASE = import.meta.env.BASE_URL; // e.g. "/edux/"

const RoadmapPage: React.FC<RoadmapPageProps> = ({ onBack, onGoRewards }) => {
  const currentWeek = getCurrentProgramWeek();

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-6 duration-500">

      {/* ── HERO ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[28px] mb-8 mx-4 mt-2"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}
      >
        {/* Stars bg */}
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />
        {/* Glow blobs */}
        <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(#ef4444, transparent)' }} />
        <div className="absolute -bottom-10 -left-10 w-72 h-72 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(#a855f7, transparent)' }} />

        <div className="relative z-10 p-8 sm:p-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-2">ĐẤU TRƯỜNG X · SUMMER 2026</p>
              <h1 className="text-5xl sm:text-6xl font-black italic tracking-tighter text-white leading-none mb-1">
                LỘ TRÌNH
              </h1>
              <h2 className="text-xl sm:text-2xl font-black italic tracking-tight text-red-500 mb-4">
                TÌM X – TÌM BẢN LĨNH ✦
              </h2>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                8 tuần thử thách – 8 vùng đất kỳ thú.<br/>
                Vượt qua áp lực thời gian, chinh phục bảng xếp hạng và trở thành Huyền thoại Tiếng Anh X.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={onGoRewards}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-red-600/30"
                >
                  🎁 Quà tặng
                </button>
                <button
                  onClick={onBack}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase tracking-widest rounded-xl transition-all border border-slate-700"
                >
                  ← Quay lại
                </button>
              </div>
            </div>
            {/* Hero illustration */}
            <div className="flex-shrink-0 rounded-2xl overflow-hidden opacity-90"
              style={{ width: 200, height: 96, border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <img
                src={`${BASE}roadmap/hero.png`}
                alt="Lộ trình khám phá"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── CÁCH THAM GIA ──────────────────────────────────────────── */}
      <div className="mx-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">CÁCH THAM GIA</h3>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((step, i) => (
            <div key={i} className="relative bg-slate-900/80 border border-slate-800/60 rounded-2xl p-6 flex flex-col items-center text-center">
              {/* Arrow between steps */}
              {i < STEPS.length - 1 && (
                <div className="hidden sm:flex absolute -right-3 top-1/3 z-10 text-slate-500 text-xl font-bold select-none">›</div>
              )}
              {/* Icon area — large, no container box, matches mockup */}
              <div className="flex items-center justify-center gap-1 mb-5" style={{ height: 100 }}>
                <img
                  src={`${BASE}roadmap/${step.icon}`}
                  alt={step.title}
                  style={{ width: step.icon2 ? 80 : 96, height: step.icon2 ? 80 : 96, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
                />
                {step.icon2 && (
                  <img
                    src={`${BASE}roadmap/${step.icon2}`}
                    alt=""
                    style={{ width: 80, height: 80, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}
                  />
                )}
              </div>
              {/* Title — "N. Title" format */}
              <p className="text-white font-black text-sm leading-tight mb-2">
                {step.num}. {step.title}
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── LỘ TRÌNH 8 TUẦN ────────────────────────────────────────── */}
      <div className="mx-4 mb-8">
        <div className="flex items-center gap-2 mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">LỘ TRÌNH 8 TUẦN</h3>
          <span className="text-yellow-400 text-sm">✦</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Timeline dots */}
        <div className="relative mb-6 hidden sm:flex items-center px-4">
          <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-px bg-slate-700" />
          <div className="relative flex-1 flex justify-between">
            {WEEK_THEMES.map(t => {
              const isCurrent = currentWeek === t.week;
              const isPast = currentWeek !== null && t.week < currentWeek;
              return (
                <div key={t.week} className="flex flex-col items-center gap-1">
                  <div className={`w-3 h-3 rounded-full border-2 z-10 transition-all ${
                    isCurrent ? 'bg-green-400 border-green-400 shadow-lg shadow-green-400/50' :
                    isPast ? 'bg-slate-400 border-slate-400' :
                    'bg-slate-800 border-slate-600'
                  }`} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Week cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {WEEK_THEMES.map(t => {
            const isCurrent = currentWeek === t.week;
            const isPast = currentWeek !== null && t.week < currentWeek;
            const isFuture = currentWeek === null || t.week > currentWeek;
            const dateRange = getWeekDateRange(t.week);

            return (
              <div key={t.week}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
                  isCurrent ? 'border-green-400/60 shadow-lg' : 'border-slate-800/60'
                }`}
                style={isCurrent ? { boxShadow: `0 0 20px rgba(74,222,128,0.2)` } : undefined}
              >
                {/* Illustration area — fixed height, show bottom (illustration) portion */}
                <div className="relative h-40 overflow-hidden"
                  style={{ background: t.bg }}
                >
                  <img
                    src={`${BASE}roadmap/week${t.week}.png`}
                    alt={t.vi}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center bottom',
                    }}
                  />
                  {/* Gradient top fade so card info text area blends */}
                  <div className="absolute inset-x-0 top-0 h-6 z-10"
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)' }} />
                  {/* Tuần label */}
                  <div className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full z-20"
                    style={{ background: `${t.accent}50`, color: t.accent, border: `1px solid ${t.accent}70`, backdropFilter: 'blur(4px)' }}
                  >
                    TUẦN {t.week}
                  </div>
                  {/* Current week glow */}
                  {isCurrent && (
                    <div className="absolute inset-0 z-10"
                      style={{ background: 'linear-gradient(to top, rgba(74,222,128,0.2), transparent)' }} />
                  )}
                </div>

                {/* Info area */}
                <div className="p-3 bg-slate-900">
                  <p className="font-black text-white text-xs leading-tight">{t.en}</p>
                  <p className="text-[10px] font-bold mt-0.5 leading-tight" style={{ color: t.accent }}>{t.vi}</p>
                  <p className="text-[9px] text-slate-600 font-bold mt-1">{dateRange}</p>

                  {/* Status badge */}
                  <div className={`mt-2 text-center py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                    isCurrent
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse'
                      : isPast
                      ? 'bg-slate-800 text-slate-500'
                      : 'bg-slate-800/50 text-slate-600'
                  }`}>
                    {isCurrent ? '⚡ ĐANG DIỄN RA' : isPast ? '✓ ĐÃ QUA' : '⏳ SẮP DIỄN RA'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LƯU Ý QUAN TRỌNG ───────────────────────────────────────── */}
      <div className="mx-4 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">LƯU Ý QUAN TRỌNG</h3>
          <span className="text-yellow-400 text-sm">✦</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NOTES.map((note, i) => (
            <div key={i} className="flex gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: `${note.color}18`, border: `1.5px solid ${note.color}30` }}
              >{note.emoji}</div>
              <div>
                <p className="text-xs font-black text-white mb-0.5">{note.title}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">{note.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer tagline ──────────────────────────────────────────── */}
      <div className="mx-4 py-4 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
          ⭐ Hãy sẵn sàng chinh phục 8 vùng đất và trở thành Huyền thoại Tiếng Anh X! ⭐
        </p>
      </div>
    </div>
  );
};

export default RoadmapPage;
