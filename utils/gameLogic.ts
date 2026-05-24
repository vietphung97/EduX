
import { LEVEL_CONFIG } from '../constants';
import { UserLevel, Difficulty, XpBreakdown } from '../types';

export const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  [Difficulty.EASY]: 1.0,
  [Difficulty.MEDIUM]: 1.2,
  [Difficulty.HARD]: 1.5,
  [Difficulty.EXPERT]: 2.0,
};

// XP cố định mỗi câu đúng theo độ khó (theo spec chương trình hè)
const XP_PER_QUESTION: Record<string, number> = {
  [Difficulty.EASY]: 10,
  [Difficulty.MEDIUM]: 12,
  [Difficulty.HARD]: 15,
  [Difficulty.EXPERT]: 20,
};

/**
 * Formula (đúng theo spec chương trình hè):
 * XP = (Số câu đúng × XP/câu theo độ khó) + (Chuỗi streak cao nhất × 5) + XP thưởng thứ hạng
 * Easy: 10 XP/câu, Medium: 12 XP/câu, Hard: 15 XP/câu
 * Streak bonus là phẳng (không nhân theo độ khó)
 */
export const calculateDetailedXp = (correct: number, maxStreak: number, difficulty: Difficulty, rankBonus: number = 0): XpBreakdown => {
  const xpPerQ = XP_PER_QUESTION[difficulty] || 10;
  const multiplier = DIFFICULTY_MULTIPLIERS[difficulty] || 1.0;
  const baseXp = correct * xpPerQ;       // XP từ câu hỏi (đã theo độ khó)
  const streakBonus = maxStreak * 5;     // Streak bonus (phẳng, không nhân)
  const multipliedXp = baseXp;           // Không nhân thêm vì đã dùng XP/câu đúng
  const totalXp = baseXp + streakBonus + rankBonus;

  return {
    baseXp: baseXp + streakBonus,
    multiplier,
    multipliedXp: totalXp,
    rankBonus,
    totalXp
  };
};

// Keep for backward compatibility if needed elsewhere, but internal calls should use calculateDetailedXp
export const calculateXp = (correct: number, maxStreak: number, rankBonus: number = 0) => {
  const baseXp = (correct * 10) + (maxStreak * 5);
  return baseXp + rankBonus;
};

export const getLevelFromXp = (xp: number) => {
  const config = LEVEL_CONFIG.find(c => xp >= c.minXp && xp <= c.maxXp);
  return config || LEVEL_CONFIG[0];
};

export const playSound = (isCorrect: boolean) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  if (isCorrect) {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else {
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(220, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
  }

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.4);
};

export const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};
