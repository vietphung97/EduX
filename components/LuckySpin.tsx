/**
 * LuckySpin.tsx
 * Vòng quay may mắn — cơ chế mở lượt (Quy định ESEA 2026, mục 5):
 *   • 1 lượt FREE mỗi tuần chương trình (FREE_SPINS_PER_WEEK)
 *   • +1 lượt cho mỗi trận MULTIPLAYER (thách đấu) đạt điểm > 150 trong tuần
 *   • +1 lượt khi mở đủ 3 mốc XP (300/800/1300) của tuần đó — "frame bonus"
 *
 * Giải thưởng (9 ô):
 * - 4 thẻ điện thoại 10k/20k/50k/100k — có QUOTA tổng (20/10/2/1 HS), đếm trên
 *   Supabase (edux_spin_history); hết quota hoặc lỗi mạng → không thể trúng thẻ.
 * - +50XP / +100XP — cộng thẳng vào XP profile.
 * - Thêm 1 lượt quay — lượt này không bị trừ.
 * - 2 ô "hẹn gặp lần sau".
 * Tỉ lệ & quota đọc từ edux_spin_config (admin chỉnh qua trang quản lý),
 * fallback giá trị mặc định trong code nếu chưa có bảng.
 * Trúng thẻ → popup form nhận thưởng (SĐT + nhà mạng) lưu vào edux_spin_history.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { UserProfile } from '../types';
import { getCurrentProgramWeek, WEEKLY_FRAMES } from '../constants';
import { isFrameUsable } from '../utils/frameLogic';
import {
  spinWheelServer,
  getSpinsLeft,
  updateSpinContact,
  getMultiplayerWinsThisWeek,
} from '../services/supabase';

// ─── Prize config ─────────────────────────────────────────────────────────────
export interface SpinPrize {
  id: string;
  label: string;        // tên đầy đủ (danh sách + popup)
  wheelLabel: string;   // chữ ngắn trên vòng quay
  emoji: string;
  color: string;
  textColor: string;
  xpBonus: number;
  type: 'card' | 'xp' | 'extra' | 'miss';
  cardValue?: number;   // mệnh giá thẻ (đ)
  weight: number;       // % mỗi lượt (default — server config ghi đè)
  quota: number | null; // giới hạn tổng số người trúng (default — server config ghi đè)
}

export const SPIN_PRIZES: SpinPrize[] = [
  { id: 'card10',  label: 'Thẻ điện thoại 10.000đ',  wheelLabel: 'Thẻ 10K',  emoji: '📱', color: '#10b981', textColor: '#fff', xpBonus: 0,   type: 'card',  cardValue: 10000,  weight: 3,    quota: 20 },
  { id: 'xp50',    label: '+50 XP',                   wheelLabel: '+50 XP',   emoji: '✨', color: '#8b5cf6', textColor: '#fff', xpBonus: 50,  type: 'xp',    weight: 35,   quota: null },
  { id: 'miss1',   label: 'Hẹn gặp bạn lần sau!',     wheelLabel: 'Hẹn lần sau', emoji: '👋', color: '#475569', textColor: '#fff', xpBonus: 0, type: 'miss', weight: 12.5, quota: null },
  { id: 'card20',  label: 'Thẻ điện thoại 20.000đ',  wheelLabel: 'Thẻ 20K',  emoji: '📱', color: '#059669', textColor: '#fff', xpBonus: 0,   type: 'card',  cardValue: 20000,  weight: 1.5,  quota: 10 },
  { id: 'xp100',   label: '+100 XP',                  wheelLabel: '+100 XP',  emoji: '⚡', color: '#f59e0b', textColor: '#000', xpBonus: 100, type: 'xp',    weight: 25,   quota: null },
  { id: 'extra',   label: 'Bạn có thêm 1 lượt quay!', wheelLabel: '+1 Lượt',  emoji: '🎟️', color: '#3b82f6', textColor: '#fff', xpBonus: 0,  type: 'extra', weight: 10,   quota: null },
  { id: 'card50',  label: 'Thẻ điện thoại 50.000đ',  wheelLabel: 'Thẻ 50K',  emoji: '💳', color: '#0d9488', textColor: '#fff', xpBonus: 0,   type: 'card',  cardValue: 50000,  weight: 0.35, quota: 2 },
  { id: 'miss2',   label: 'Oops, chúc bạn may mắn lần sau!', wheelLabel: 'Oops!', emoji: '🎲', color: '#64748b', textColor: '#fff', xpBonus: 0, type: 'miss', weight: 12.5, quota: null },
  { id: 'card100', label: 'Thẻ điện thoại 100.000đ', wheelLabel: 'Thẻ 100K', emoji: '💎', color: '#ef4444', textColor: '#fff', xpBonus: 0,   type: 'card',  cardValue: 100000, weight: 0.15, quota: 1 },
];

const SEGMENT_COUNT = SPIN_PRIZES.length; // 9
const FULL_ANGLE = (2 * Math.PI) / SEGMENT_COUNT;
const CARRIERS = ['Viettel', 'Vinaphone', 'Mobifone'];

// ─── Canvas drawing — style "Game show cổ điển": vành vàng + bóng đèn nhấp nháy,
//     ô màu rực xen kẽ trắng, tâm là icon quà 🎁 ──────────────────────────────
const GOLD = '#d4af37';
const GOLD_RIM = '#b8860b';
const GOLD_DARK = '#8a6508';
const BULB_COUNT = 18;
const RIM_W = 14;
/** Màu ô theo vị trí: màu đậm xen kẽ trắng kiểu game show (9 ô) */
const SEG_COLORS = ['#dc2626', '#f8fafc', '#2563eb', '#f8fafc', '#16a34a', '#f8fafc', '#9333ea', '#f8fafc', '#ea580c'];

function drawWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  bulbPhase: number
) {
  ctx.clearRect(0, 0, cx * 2, cy * 2);

  // Vành vàng ngoài
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = GOLD_RIM;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  const rIn = radius - RIM_W;

  SPIN_PRIZES.forEach((prize, i) => {
    const startAngle = rotation + i * FULL_ANGLE;
    const endAngle = startAngle + FULL_ANGLE;
    const segColor = SEG_COLORS[i % SEG_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rIn, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = segColor;
    ctx.fill();
    ctx.strokeStyle = GOLD_RIM;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + FULL_ANGLE / 2);
    ctx.textAlign = 'right';
    // Ô trắng dùng chữ tối, ô màu dùng chữ trắng
    ctx.fillStyle = segColor === '#f8fafc' ? '#1e293b' : '#ffffff';
    // Chỉ vẽ CHỮ, không kèm emoji — một số emoji (🎟️ có variation selector)
    // làm Safari iOS không render cả chuỗi fillText → mất chữ trên vòng quay.
    // Co font tự động để chữ không tràn vào tâm (bị icon giữa che mất).
    const text = prize.wheelLabel;
    const maxTextWidth = rIn * 0.94 - radius * 0.24; // chừa vùng tâm
    let fontSize = Math.max(13, radius * 0.09);
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (ctx.measureText(text).width > maxTextWidth && fontSize > 10) {
      fontSize -= 0.5;
      ctx.font = `bold ${fontSize}px sans-serif`;
    }
    ctx.fillText(text, rIn * 0.94, 4);
    ctx.restore();
  });

  // Bóng đèn nhấp nháy trên vành
  for (let i = 0; i < BULB_COUNT; i++) {
    const a = (i / BULB_COUNT) * 2 * Math.PI;
    const bx = cx + Math.cos(a) * (radius - RIM_W / 2);
    const by = cy + Math.sin(a) * (radius - RIM_W / 2);
    const on = (i + bulbPhase) % 2 === 0;
    ctx.beginPath();
    ctx.arc(bx, by, 3.6, 0, 2 * Math.PI);
    if (on) {
      ctx.shadowColor = '#fde68a';
      ctx.shadowBlur = 7;
      ctx.fillStyle = '#fff7cc';
    } else {
      ctx.fillStyle = GOLD_DARK;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Tâm: nền đỏ đậm + vành vàng + icon quà (không dùng chữ X)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.165, 0, 2 * Math.PI);
  ctx.fillStyle = '#7f1d1d';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  ctx.font = `${radius * 0.17}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎁', cx, cy + 1);
}

// ─── Props ────────────────────────────────────────────────────────────────────
/** Kết quả 1 lượt quay do SERVER trả về (đã cộng XP atomic + ghi history). */
export interface SpinServerResult {
  prizeId: string;
  prizeLabel: string;
  xpBonus: number;
  spinId: string | null;
  newXp: number;
  newWeeklyXp: number;
  spinsLeft: number;
  outOfSpins: boolean;
}

interface LuckySpinProps {
  user: UserProfile;
  /** Gọi sau khi quay xong. res chứa newXp/newWeeklyXp do server tính atomic —
   *  App.tsx dùng để đồng bộ XP state, KHÔNG tự cộng ở client. */
  onSpinResult: (prize: SpinPrize, res: SpinServerResult) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
const LuckySpin: React.FC<LuckySpinProps> = ({ user, onSpinResult }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const rotationRef = useRef(0);
  const [displayRotation, setDisplayRotation] = useState(0);

  const [isSpinning, setIsSpinning] = useState(false);
  const [prize, setPrize] = useState<SpinPrize | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Tỉ lệ % + quota hiển thị trong "Danh sách phần thưởng" vẫn dùng default
  // trong code (SPIN_PRIZES) — trọng số/quota THẬT SỰ dùng khi quay được
  // RPC edux_spin_wheel đọc trực tiếp từ edux_spin_config ở server.

  // ── Form nhận thưởng thẻ điện thoại ────────────────────────────────────────
  const [cardWin, setCardWin] = useState<{ prize: SpinPrize; recordId: string | null } | null>(null);
  const [formPhone, setFormPhone] = useState('');
  const [formCarrier, setFormCarrier] = useState('');
  const [formName, setFormName] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formSchool, setFormSchool] = useState('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formDone, setFormDone] = useState(false);

  // ── Tính số lượt quay còn lại ──────────────────────────────────────────────
  // Quy định ESEA 2026 (mục 5):
  //   1 lượt free / tuần
  //   + 1 lượt cho mỗi trận multiplayer >150đ trong tuần
  //   + 1 lượt khi hoàn thành đủ 3 mốc XP của TUẦN HIỆN TẠI (frame bonus)
  const currentWeek = getCurrentProgramWeek();
  const FREE_SPINS_PER_WEEK = 1;
  const MULTIPLAYER_WIN_THRESHOLD = 150;

  // ── Quota lượt quay: LẤY TỪ SERVER (nguồn duy nhất) ─────────────────────────
  // Trước đây spinsLeft tính từ user.spinsUsed (localStorage) → mỗi lần reload
  // spinsUsed reset về 0 nên quota lại đầy, cho quay vượt hạn mức (thực tế 1 HS
  // quay 89 lượt dù chỉ được 7). Nay allowed/used/left đều do RPC
  // edux_spin_quota_left tính từ edux_game_history + edux_spin_history trên
  // server; client chỉ hiển thị. Chốt chặn thật nằm trong RPC edux_spin_wheel.
  const [quota, setQuota] = useState<{ allowed: number; used: number; left: number }>({ allowed: 1, used: 0, left: 1 });
  // matchEarnedSpins/frameBonusSpin chỉ để HIỂN THỊ chi tiết cách cộng lượt.
  const [matchEarnedSpins, setMatchEarnedSpins] = useState<number>(0);
  const refreshQuota = useCallback(async () => {
    if (!user.id) return;
    const [q, mp] = await Promise.all([
      getSpinsLeft(user.id, currentWeek),
      getMultiplayerWinsThisWeek(user.id, MULTIPLAYER_WIN_THRESHOLD),
    ]);
    if (q) setQuota(q);
    setMatchEarnedSpins(mp);
  }, [user.id, currentWeek]);
  useEffect(() => { refreshQuota(); }, [refreshQuota]);

  const frameBonusSpin = React.useMemo<number>(() => {
    if (!currentWeek) return 0;
    const weekFrame = WEEKLY_FRAMES.find(f => f.week === currentWeek);
    if (!weekFrame) return 0;
    return isFrameUsable(weekFrame.id, user.unlockedFrames || []) ? 1 : 0;
  }, [currentWeek, user.unlockedFrames]);

  const totalSpins = quota.allowed;
  const spinsUsedThisWeek = quota.used;
  const spinsLeft = quota.left;

  // ── Draw loop ───────────────────────────────────────────────────────────────
  // Nhịp nhấp nháy bóng đèn trên vành (đổi pha mỗi 400ms)
  const [bulbPhase, setBulbPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setBulbPhase(p => (p + 1) % 2), 400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Render 2x rồi scale: chữ nét trên màn retina (điện thoại)
    const DPR = 2;
    if (canvas.width !== 300 * DPR) {
      canvas.width = 300 * DPR;
      canvas.height = 300 * DPR;
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const size = 300;
    const cx = size / 2;
    const r = cx * 0.88;

    drawWheel(ctx, cx, cx, r, displayRotation, bulbPhase);
  }, [displayRotation, bulbPhase]);

  // Random giải + kiểm tra quota giờ chạy ATOMIC ở server (RPC edux_spin_wheel,
  // xem spin() bên dưới) — client không tự pick nữa để tránh race condition.

  // ── Spin logic ──────────────────────────────────────────────────────────────
  const spin = useCallback(async () => {
    if (isSpinning || spinsLeft <= 0) return;

    setPrize(null);
    setShowResult(false);
    setIsSpinning(true);

    // Random giải + kiểm tra quota + insert ATOMIC ở server (RPC edux_spin_wheel),
    // TRƯỚC khi quay animation. Tránh race condition: nếu tự pick ở client dựa
    // trên quota đọc trước đó, nhiều lượt quay đồng thời có thể cùng đọc thấy
    // quota còn trống rồi cùng ghi, khiến tổng vượt quota thật trong DB (thấy
    // thực tế: card20 quota=10 nhưng có 14 người trúng, 2026-07-02).
    const res = await spinWheelServer({ userId: user.id, userName: user.name, week: currentWeek });
    if (!res) {
      setIsSpinning(false);
      return;
    }
    // Server từ chối vì hết lượt (quota enforce server-side) — không quay, đồng bộ
    // lại quota để UI khóa nút và báo cho user.
    if (res.outOfSpins) {
      setIsSpinning(false);
      setQuota(q => ({ ...q, used: q.allowed, left: 0 }));
      refreshQuota();
      return;
    }
    const recordId = res.spinId;
    let winIndex = SPIN_PRIZES.findIndex(p => p.id === res.prizeId);
    if (winIndex < 0) winIndex = SPIN_PRIZES.findIndex(p => p.type === 'miss');
    const winPrize = SPIN_PRIZES[winIndex];

    const sliceCenter = winIndex * FULL_ANGLE + FULL_ANGLE / 2;
    const targetAngle = -Math.PI / 2 - sliceCenter;

    const extraSpins = (5 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const finalRotation = rotationRef.current + extraSpins + (targetAngle - ((rotationRef.current + extraSpins) % (2 * Math.PI)));

    const duration = 4000 + Math.random() * 1000;
    const startTime = performance.now();
    const startRot = rotationRef.current;

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    const finishSpin = async () => {
      setIsSpinning(false);

      if (winPrize.type === 'card') {
        // Mở form nhận thưởng
        setFormPhone('');
        setFormCarrier('');
        setFormName(user.name || '');
        setFormClass(user.grade ? `Lớp ${user.grade}` : '');
        setFormSchool('');
        setFormError('');
        setFormDone(false);
        setCardWin({ prize: winPrize, recordId });
      } else {
        setPrize(winPrize);
        setShowResult(true);
      }

      // Cập nhật quota từ SERVER (res.spinsLeft) — không tự tính ở client nữa.
      setQuota(q => ({ ...q, used: Math.max(0, q.allowed - res.spinsLeft), left: res.spinsLeft }));
      onSpinResult(winPrize, res);
    };

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
        finishSpin();
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [isSpinning, spinsLeft, onSpinResult, user, currentWeek, refreshQuota]);

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Submit form nhận thưởng ─────────────────────────────────────────────────
  const submitCardForm = async () => {
    if (formSubmitting) return;
    const phone = formPhone.trim();
    if (!/^0\d{9}$/.test(phone)) {
      setFormError('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)');
      return;
    }
    if (!formCarrier) {
      setFormError('Vui lòng chọn nhà mạng');
      return;
    }
    if (!formName.trim()) {
      setFormError('Vui lòng điền họ và tên');
      return;
    }
    if (!formClass.trim()) {
      setFormError('Vui lòng điền lớp');
      return;
    }
    if (!formSchool.trim()) {
      setFormError('Vui lòng điền trường');
      return;
    }
    setFormError('');
    setFormSubmitting(true);

    let ok = false;
    if (cardWin?.recordId) {
      ok = await updateSpinContact(cardWin.recordId, {
        phone,
        carrier: formCarrier,
        studentName: formName.trim(),
        className: formClass.trim(),
        school: formSchool.trim(),
      });
    }
    setFormSubmitting(false);

    if (ok) {
      setFormDone(true);
    } else {
      setFormError('Không gửi được thông tin. Vui lòng thử lại!');
    }
  };

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
            1 lượt FREE/tuần · +1 lượt mỗi trận thách đấu &gt;150đ
          </p>
        </div>
        <div className={`flex flex-col items-center px-4 py-2 rounded-2xl border font-black ${
          spinsLeft > 0
            ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
            : 'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          <span className="text-2xl leading-none">{spinsLeft}</span>
          <span className="text-[10px] uppercase tracking-widest">lượt còn</span>
        </div>
      </div>

      {/* Info pills */}
      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
        <span className="px-3 py-1.5 bg-slate-800 rounded-full text-slate-400">
          🎁 {FREE_SPINS_PER_WEEK} lượt free
        </span>
        <span className="px-3 py-1.5 bg-slate-800 rounded-full text-slate-400">
          ⚔️ {matchEarnedSpins} từ thách đấu &gt;150đ
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
            width={600}
            height={600}
            className="rounded-full"
            style={{
              width: '100%',
              maxWidth: 300,
              height: 'auto',
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

      {/* Result overlay (giải thường) */}
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
            {prize.type === 'xp' && (
              <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-widest">
                Đã cộng vào XP của bạn!
              </p>
            )}
            {prize.type === 'extra' && (
              <p className="text-xs text-slate-400 mt-1 font-bold uppercase tracking-widest">
                Lượt quay này không bị trừ — quay tiếp nào!
              </p>
            )}
            {prize.type === 'miss' && (
              <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-widest">
                Chúc bạn may mắn lần sau!
              </p>
            )}
            <button
              onClick={() => setShowResult(false)}
              className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all border border-slate-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Popup trúng thẻ điện thoại + form nhận thưởng */}
      {cardWin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border-2 border-yellow-500/50 rounded-[28px] p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-yellow-500/20">
            {!formDone ? (
              <>
                <div className="text-center mb-5">
                  <p className="text-5xl mb-3">🎉</p>
                  <h4 className="text-lg sm:text-xl font-black text-yellow-400 uppercase leading-snug">
                    Chúc mừng bạn đã trúng thưởng thẻ điện thoại trị giá{' '}
                    <span className="text-2xl text-white">{(cardWin.prize.cardValue || 0).toLocaleString('vi-VN')}đ</span>
                  </h4>
                  <p className="text-xs text-slate-400 font-bold mt-2">
                    Để nhận quà, vui lòng điền thông tin:
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Họ và tên <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="mt-1 w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-yellow-500"
                      placeholder="Họ và tên của bạn"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Lớp <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={formClass}
                        onChange={e => setFormClass(e.target.value)}
                        className="mt-1 w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-yellow-500"
                        placeholder="VD: 6A1"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Trường <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={formSchool}
                        onChange={e => setFormSchool(e.target.value)}
                        className="mt-1 w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-yellow-500"
                        placeholder="Tên trường"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      SĐT nhận thưởng <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      maxLength={10}
                      inputMode="numeric"
                      className="mt-1 w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-yellow-500"
                      placeholder="0xxxxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                      Nhà mạng <span className="text-red-400">*</span>
                    </label>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      {CARRIERS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormCarrier(c)}
                          className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all border ${
                            formCarrier === c
                              ? 'bg-yellow-500 text-black border-yellow-400'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formError && (
                    <p className="text-xs font-bold text-red-400 text-center">{formError}</p>
                  )}

                  <button
                    onClick={submitCardForm}
                    disabled={formSubmitting}
                    className="w-full py-3.5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-slate-500 text-black font-black rounded-2xl text-sm uppercase tracking-widest transition-all"
                  >
                    {formSubmitting ? 'Đang gửi...' : '🎁 NHẬN THƯỞNG'}
                  </button>

                  <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    Phần thưởng của bạn sẽ được Eduso gửi về SĐT trên vào{' '}
                    <span className="text-slate-300 font-bold">Thứ 2 tuần sau</span>, vui lòng kiểm tra tin nhé!
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-5xl mb-3">✅</p>
                <h4 className="text-lg font-black text-green-400 uppercase">Đã ghi nhận thông tin!</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Thẻ {(cardWin.prize.cardValue || 0).toLocaleString('vi-VN')}đ sẽ được Eduso gửi về số{' '}
                  <span className="text-white font-bold">{formPhone}</span> ({formCarrier}) vào Thứ 2 tuần sau.
                </p>
                <button
                  onClick={() => setCardWin(null)}
                  className="mt-5 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all border border-slate-700"
                >
                  Đóng
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prize table */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors list-none flex items-center gap-2">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          Danh sách phần thưởng
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
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
