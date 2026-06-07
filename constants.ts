
import { Difficulty, UserLevel, WeeklyFrame } from './types';

// ============ AVATAR FRAME SYSTEM ============

// Ngày khai giảng chương trình hè (Tuần 1 bắt đầu)
export const PROGRAM_START_DATE = new Date('2026-05-19'); // Tuần 1: 19/05 - 25/05/2026

// XP tuần để mở từng item trong frame
export const FRAME_XP_MILESTONES = [800, 1500, 2500] as const;

export const WEEKLY_FRAMES: WeeklyFrame[] = [
  {
    id: 'week_1', week: 1, name: 'START PASSPORT', emoji: '🧭',
    color: '#10b981', glowColor: 'rgba(16,185,129,0.5)',
    items: [
      { id: 'w1_a', name: 'Huy hiệu Hộ Chiếu', emoji: '🗺️', xpRequired: 800 },
      { id: 'w1_b', name: 'Viền Khởi Hành', emoji: '🧭', xpRequired: 1500 },
      { id: 'w1_c', name: 'Dấu Ấn Phiêu Lưu', emoji: '✨', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_2', week: 2, name: 'FOREST CODE', emoji: '🐉',
    color: '#22c55e', glowColor: 'rgba(34,197,94,0.5)',
    items: [
      { id: 'w2_a', name: 'Rồng Rừng Xanh', emoji: '🐉', xpRequired: 800 },
      { id: 'w2_b', name: 'Viền Mật Lệnh', emoji: '🌲', xpRequired: 1500 },
      { id: 'w2_c', name: 'Bí Ẩn Rừng Sâu', emoji: '🌿', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_3', week: 3, name: 'CITY ADVENTURE', emoji: '⚡',
    color: '#818cf8', glowColor: 'rgba(129,140,248,0.5)',
    items: [
      { id: 'w3_a', name: 'Tia Chớp Đô Thị', emoji: '⚡', xpRequired: 800 },
      { id: 'w3_b', name: 'Viền Thành Phố', emoji: '🏙️', xpRequired: 1500 },
      { id: 'w3_c', name: 'Phiêu Lưu Ký', emoji: '🗼', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_4', week: 4, name: 'DEEP OCEAN', emoji: '🐋',
    color: '#38bdf8', glowColor: 'rgba(56,189,248,0.5)',
    items: [
      { id: 'w4_a', name: 'Cá Voi Đại Dương', emoji: '🐋', xpRequired: 800 },
      { id: 'w4_b', name: 'Viền Vực Sâu', emoji: '🌊', xpRequired: 1500 },
      { id: 'w4_c', name: 'Bí Ẩn Đáy Biển', emoji: '🐙', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_5', week: 5, name: 'MOUNTAIN PEAK', emoji: '🦅',
    color: '#a8a29e', glowColor: 'rgba(168,162,158,0.5)',
    items: [
      { id: 'w5_a', name: 'Đại Bàng Đỉnh Núi', emoji: '🦅', xpRequired: 800 },
      { id: 'w5_b', name: 'Viền Chinh Phục', emoji: '⛰️', xpRequired: 1500 },
      { id: 'w5_c', name: 'Đỉnh Cao Tuyệt Vời', emoji: '🏔️', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_6', week: 6, name: 'DESERT CROSSING', emoji: '☀️',
    color: '#fb923c', glowColor: 'rgba(251,146,60,0.5)',
    items: [
      { id: 'w6_a', name: 'Mặt Trời Sa Mạc', emoji: '☀️', xpRequired: 800 },
      { id: 'w6_b', name: 'Viền Băng Qua', emoji: '🏜️', xpRequired: 1500 },
      { id: 'w6_c', name: 'Chiến Binh Sa Mạc', emoji: '🐪', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_7', week: 7, name: 'SKY ISLAND', emoji: '🪂',
    color: '#a78bfa', glowColor: 'rgba(167,139,250,0.6)',
    items: [
      { id: 'w7_a', name: 'Dù Trời Mây', emoji: '🪂', xpRequired: 800 },
      { id: 'w7_b', name: 'Viền Đảo Trên Mây', emoji: '🏝️', xpRequired: 1500 },
      { id: 'w7_c', name: 'Bay Tự Do', emoji: '🌤️', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_8', week: 8, name: 'SPACE MISSION', emoji: '🛸',
    color: '#e879f9', glowColor: 'rgba(232,121,249,0.6)',
    items: [
      { id: 'w8_a', name: 'Tàu Vũ Trụ', emoji: '🛸', xpRequired: 800 },
      { id: 'w8_b', name: 'Viền Thiên Hà', emoji: '🚀', xpRequired: 1500 },
      { id: 'w8_c', name: 'Du Hành Giữa Sao', emoji: '🌌', xpRequired: 2500 },
    ],
  },
];

/**
 * Tính tuần hiện tại của chương trình (1-8).
 * Trả về null nếu chưa bắt đầu hoặc đã kết thúc.
 */
export function getCurrentProgramWeek(): number | null {
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = now.getTime() - PROGRAM_START_DATE.getTime();
  if (diff < 0) return null; // Chưa bắt đầu
  const week = Math.floor(diff / msPerWeek) + 1;
  return week >= 1 && week <= 8 ? week : null;
}

export const LEVEL_CONFIG = [
  { level: UserLevel.APPRENTICE, minXp: 0, maxXp: 500, emoji: '🥚' },
  { level: UserLevel.WARRIOR, minXp: 501, maxXp: 2000, emoji: '⚔️' },
  { level: UserLevel.MASTER, minXp: 2001, maxXp: 10000, emoji: '👑' },
  { level: UserLevel.ELITE, minXp: 10001, maxXp: 30000, emoji: '🌏' },
  { level: UserLevel.LEGEND, minXp: 30001, maxXp: Infinity, emoji: '💎' },
];

// Fallback topics - sử dụng khi không fetch được từ Google Sheets
export const DEFAULT_TOPICS_BY_GRADE: Record<number, string[]> = {
  3: ["My Friends", "My Body", "My House", "Our Toys"],
  4: ["My Birthday", "My Favourite Food", "Jobs", "Animals"],
  5: ["What's Your Address?", "My Town", "The Weather", "Seasons and Weather"],
  6: ["My New School", "My Home", "My Friends", "Natural Wonders"],
  7: ["Hobbies", "Healthy Living", "Music and Arts"],
  8: ["Leisure Time", "Life in the Countryside", "Lifestyles"],
  9: ["Local Community", "City Life", "Teen Stress"],
  10: ["Family Life", "Environment", "Gender Equality"],
  11: ["Generation Gap", "Cities of the Future", "Global Warming"],
  12: ["Life Stories", "Green Living", "Cultural Identity"],
};

// Nếu VITE_ENABLED_GRADES được set (vd: "9" hoặc "9,10"), chỉ hiển thị các khối đó.
// Để trống hoặc không set = hiển thị tất cả.
const _envGrades = (import.meta as any).env?.VITE_ENABLED_GRADES as string | undefined;
export const DEFAULT_GRADES: number[] = _envGrades
  ? _envGrades.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
