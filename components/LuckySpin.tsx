/**
 * LuckySpin.tsx
 * Vòng quay may mắn — mỗi frame hoàn chỉnh (3/3 items) = 1 lượt quay / tuần.
 * Prizes sẽ được cập nhật sau; hiện tại chỉ render FE với placeholder prizes.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { getCurrentProgramWeek } from '../constants';
import { getCompletedFrames } from '../utils/frameLogic';

// ─── Prize config (placeholder — sẽ cập nhật sau) ────────────────────────────
export interface SpinPrize {
  id: string;
  label: string;
  emoji: string;
  color: string;       // hex, dùng cho canvas
  textColor: string;
  xpBonus: number;     // 0 = no XP (sẽ implement sau)
}

export const SPIN_PRIZES: SpinPrize[] = [
  { id: 'xp100',   label: '+100 XP',        emoji: '⚡', color: '#f59e0b', textColor: '#000', xpBonus: 100 },
  { id: 'xp200',   label: '+200 XP',        emoji: '🔥', color: '#ef4444', textColor: '#fff', xpBonus: 200 },
  { id: 'xp50',    label: '+50 XP',         emoji: '✨', color: '#8b5cf6', textColor: '#fff', xpBonus: 50  },
  { id: 'xp300',   label: '+300 XP',        emoji: '💎', color: '#3b82f6', textColor: '#fff', xpBonus: 300 },
  { id: 'xp500',   label: '+500 XP',        emoji: '👑', color: '#10b981', textColor: '#fff', xpBonus: 500 },
  { id: 'miss',    label: 'Hên lần sau!',   emoji: '🎲', color: '#475569', textColor: '#fff', xpBonus: 0   },
  { id: 'xp150',   label: '+150 XP',        emoji: '🌟', color: '#ec4899', textColor: '#fff', xpBonus: 150 },
  { id: 'xp80',    label: '+80 XP',         emoji: '🎯', color: '#0ea5e9', textColor: '#fff', xpBonus: 80  },
];

const SEGMENT_COUNT = SPIN_PRIZES.length; // 8
const FULL_ANGLE = (2 * Math.PI) / SEGMENT_COUNT;

// ─── Canvas drawing ───────────────────────────────────────────────────────────
function drawWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotation: number
) {
  ctx.clearRect(0, 0, cx * 2, cy * 2);

  SPIN_PRIZES.forEach((prize, i) => {
    const startAngle = rotation + i * FULL_ANGLE;
    const endAngle = startAngle + FULL_ANGLE;

    // Slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = prize.color;
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + FULL_ANGLE / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = prize.textColor;
    ctx.font = `bold ${Math.max(10, radius * 0.1)}px sans-serif`;
    ctx.fillText(prize.emoji + ' ' + prize.label, radius * 0.92, 4);
    ctx.restore();
  });

  // Center cap
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.12, 0, 2 * Math.PI);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center X logo
  ctx.fillStyle = '#ef4444';
  ctx.font = `bold ${radius * 0.1}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', cx, cy);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface LuckySpinProps {
  user: UserProfile;
  /** Gọi sau khi quay xong để cập nhật state ngoài (spinsUsed + xpBonus) */
  onSpinResult: (prize: SpinPrize, newSpinsUsed: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
const LuckySpin: React.FC<LuckySpinProps> = ({ user, onSpinResult }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // rotation state (radians)
  const rotationRef = useRef(0);
  const [displayRotation, setDisplayRotation] = useState(0);

  const [isSpinning, setIsSpinning] = useState(false);
  const [prize, setPrize] = useState<SpinPrize | null>(null);
  const [showResult, setShowResult] = useState(false);

  // ── Tính số lượt quay còn lại ──────────────────────────────────────────────
  const currentWeek = getCurrentProgramWeek();
  const completedFrames = getCompletedFrames(user.unlockedFrames || []);
  const totalSpins = completedFrames.length; // 1 lượt / frame hoàn chỉnh

  // Reset spinsUsed nếu sang tuần mới
  const spinsUsedThisWeek =
    (user.lastSpinWeek ?? 0) === (currentWeek ?? 0)
      ? (user.spinsUsed ?? 0)
      : 0;

  const spinsLeft = Math.max(0, totalSpins - spinsUsedThisWeek);

  // ── Draw loop ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const r = cx * 0.88;

    drawWheel(ctx, cx, cx, r, displayRotation);
  }, [displayRotation]);

  // ── Spin logic ──────────────────────────────────────────────────────────────
  const spin = useCallback(() => {
    if (isSpinning || spinsLeft <= 0) return;

    setPrize(null);
    setShowResult(false);
    setIsSpinning(true);

    // Chọn prize ngẫu nhiên
    const winIndex = Math.floor(Math.random() * SEGMENT_COUNT);
    const winPrize = SPIN_PRIZES[winIndex];

    // Góc dừng: kim ở trên (−π/2), slice winIndex phải nằm ở đó
    // Trung tâm của slice winIndex ở góc: winIndex * FULL_ANGLE + FULL_ANGLE/2
    // Ta cần: rotation + sliceCenter = −π/2  ⟹  rotation = −π/2 − sliceCenter
    const sliceCenter = winIndex * FULL_ANGLE + FULL_ANGLE / 2;
    const targetAngle = -Math.PI / 2 - sliceCenter;

    // Thêm ≥5 vòng ngẫu nhiên
    const extraSpins = (5 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const finalRotation = rotationRef.current + extraSpins + (targetAngle - ((rotationRef.current + extraSpins) % (2 * Math.PI)));

    const duration = 4000 + Math.random() * 1000; // 4-5s
    const startTime = performance.now();
    const startRot = rotationRef.current;

    function easeOut(t: number) {
      // cubic ease-out
      return 1 - Math.pow(1 - t, 3);
    }

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easedT = easeOut(t);
      const currentRot = startRot + (finalRotation - startRot) * easedT;

      rotationRef.current = currentRot;
      setDisplayRotation(currentRot);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        rotationRef.current = finalRotation;
        setDisplayRotation(finalRotation);
        setIsSpinning(false);
        setPrize(winPrize);
        setShowResult(true);

        const newSpinsUsed = spinsUsedThisWeek + 1;
        onSpinResult(winPrize, newSpinsUsed);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [isSpinning, spinsLeft, spinsUsedThisWeek, onSpinResult]);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
            🎰 VÒNG QUAY MAY MẮN
          </h3>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">
            Mỗi khung hoàn chỉnh = 1 lượt quay / tuần
          </p>
        </div>
        {/* Lượt quay badge */}
        <div className={`flex flex-col items-center px-4 py-2 rounded-2xl border font-black ${
          spinsLeft > 0
            ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          <span className="text-2xl leading-none">{spinsLeft}</span>
          <span className="text-[9px] uppercase tracking-widest">lượt còn</span>
        </div>
      </div>

      {/* Info pills */}
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
        <span className="px-3 py-1.5 bg-slate-800 rounded-full text-slate-400">
          ✅ {completedFrames.length} khung hoàn chỉnh
        </span>
        <span className="px-3 py-1.5 bg-slate-800 rounded-full text-slate-400">
          🔄 Đã dùng: {spinsUsedThisWeek}/{totalSpins}
        </span>
        {currentWeek && (
          <span className="px-3 py-1.5 bg-slate-800 rounded-full text-slate-400">
            📅 Tuần {currentWeek}/8
          </span>
        )}
      </div>

      {/* Wheel + pointer */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          {/* Pointer (kim chỉ) ở trên */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 pointer-events-none">
            <div
              className="w-0 h-0"
              style={{
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '22px solid #ef4444',
                filter: 'drop-shadow(0 2px 4px rgba(239,68,68,0.6))',
              }}
            />
          </div>

          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            className="rounded-full"
            style={{
              boxShadow: isSpinning
                ? '0 0 40px rgba(239,68,68,0.4), 0 0 80px rgba(239,68,68,0.2)'
                : '0 0 20px rgba(0,0,0,0.4)',
              transition: 'box-shadow 0.3s',
            }}
          />
        </div>

        {/* Spin button */}
        <button
          onClick={spin}
          disabled={isSpinning || spinsLeft <= 0}
          className={`w-full max-w-xs py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-200 ${
            isSpinning
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : spinsLeft > 0
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 hover:scale-105 active:scale-95'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
          }`}
        >
          {isSpinning ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Đang quay...
            </span>
          ) : spinsLeft > 0 ? (
            '🎰 QUAY NGAY'
          ) : (
            '🔒 HẾT LƯỢT TUẦN NÀY'
          )}
        </button>

        {spinsLeft <= 0 && totalSpins === 0 && (
          <p className="text-center text-xs text-slate-500 max-w-xs">
            Hoàn thành đủ 3 items của một khung avatar để nhận lượt quay!
          </p>
        )}
        {spinsLeft <= 0 && totalSpins > 0 && (
          <p className="text-center text-xs text-slate-500 max-w-xs">
            Đã dùng hết lượt tuần này. Quay lại tuần sau nhé!
          </p>
        )}
      </div>

      {/* Result overlay */}
      {showResult && prize && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-400">
          <div
            className="rounded-2xl p-5 text-center border"
            style={{
              background: `${prize.color}18`,
              borderColor: `${prize.color}50`,
            }}
          >
            <p className="text-4xl mb-2">{prize.emoji}</p>
            <p
              className="text-2xl font-black uppercase tracking-tight"
              style={{ color: prize.color }}
            >
              {prize.label}
            </p>
            {prize.xpBonus > 0 ? (
              <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-widest">
                Phần thưởng sẽ được cộng vào XP của bạn
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-widest">
                Chúc bạn may mắn lần sau!
              </p>
            )}
            <button
              onClick={() => setShowResult(false)}
              className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all border border-slate-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Prize table */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors list-none flex items-center gap-2">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          Danh sách phần thưởng
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SPIN_PRIZES.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-slate-800/50"
              style={{ borderColor: `${p.color}40` }}
            >
              <span className="text-lg">{p.emoji}</span>
              <span className="text-xs font-bold text-slate-300">{p.label}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export default LuckySpin;
