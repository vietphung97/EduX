
import { Difficulty, UserLevel, WeeklyFrame } from './types';

// ============ AVATAR FRAME SYSTEM ============

// Ngày khai giảng chương trình hè (Tuần 1 bắt đầu)
export const PROGRAM_START_DATE = new Date('2026-05-19'); // Tuần 1: 19/05 - 25/05/2026

// XP tuần để mở từng item trong frame
export const FRAME_XP_MILESTONES = [800, 1500, 2500] as const;

export const WEEKLY_FRAMES: WeeklyFrame[] = [
  {
    id: 'week_1', week: 1, name: 'KHỞI ĐẦU', emoji: '🌱',
    color: '#10b981', glowColor: 'rgba(16,185,129,0.5)',
    items: [
      { id: 'w1_a', name: 'Huy hiệu Khởi Đầu', emoji: '🌱', xpRequired: 800 },
      { id: 'w1_b', name: 'Viền Xanh Lá', emoji: '🍀', xpRequired: 1500 },
      { id: 'w1_c', name: 'Ánh Sáng Mới', emoji: '✨', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_2', week: 2, name: 'LỬA ĐẤU', emoji: '🔥',
    color: '#f97316', glowColor: 'rgba(249,115,22,0.5)',
    items: [
      { id: 'w2_a', name: 'Ngọn Lửa', emoji: '🔥', xpRequired: 800 },
      { id: 'w2_b', name: 'Viền Cam Rực', emoji: '🌋', xpRequired: 1500 },
      { id: 'w2_c', name: 'Bùng Cháy', emoji: '💥', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_3', week: 3, name: 'SẤM SÉT', emoji: '⚡',
    color: '#eab308', glowColor: 'rgba(234,179,8,0.5)',
    items: [
      { id: 'w3_a', name: 'Tia Sét', emoji: '⚡', xpRequired: 800 },
      { id: 'w3_b', name: 'Viền Vàng Sét', emoji: '🌩️', xpRequired: 1500 },
      { id: 'w3_c', name: 'Siêu Tốc', emoji: '🚀', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_4', week: 4, name: 'THÉP GANG', emoji: '🛡️',
    color: '#94a3b8', glowColor: 'rgba(148,163,184,0.5)',
    items: [
      { id: 'w4_a', name: 'Khiên Thép', emoji: '🛡️', xpRequired: 800 },
      { id: 'w4_b', name: 'Viền Bạc', emoji: '⚙️', xpRequired: 1500 },
      { id: 'w4_c', name: 'Bất Khuất', emoji: '💪', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_5', week: 5, name: 'ĐẠI DƯƠNG', emoji: '🌊',
    color: '#3b82f6', glowColor: 'rgba(59,130,246,0.5)',
    items: [
      { id: 'w5_a', name: 'Sóng Biển', emoji: '🌊', xpRequired: 800 },
      { id: 'w5_b', name: 'Viền Xanh Dương', emoji: '🔵', xpRequired: 1500 },
      { id: 'w5_c', name: 'Vô Hạn', emoji: '🌌', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_6', week: 6, name: 'THIÊN HƯƠNG', emoji: '🌸',
    color: '#ec4899', glowColor: 'rgba(236,72,153,0.5)',
    items: [
      { id: 'w6_a', name: 'Hoa Anh Đào', emoji: '🌸', xpRequired: 800 },
      { id: 'w6_b', name: 'Viền Hồng', emoji: '🎀', xpRequired: 1500 },
      { id: 'w6_c', name: 'Tinh Tế', emoji: '💮', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_7', week: 7, name: 'HUYỀN THOẠI', emoji: '👑',
    color: '#f59e0b', glowColor: 'rgba(245,158,11,0.6)',
    items: [
      { id: 'w7_a', name: 'Vương Miện', emoji: '👑', xpRequired: 800 },
      { id: 'w7_b', name: 'Viền Vàng', emoji: '⭐', xpRequired: 1500 },
      { id: 'w7_c', name: 'Chói Lọi', emoji: '🌟', xpRequired: 2500 },
    ],
  },
  {
    id: 'week_8', week: 8, name: 'VÔ ĐỊCH', emoji: '💎',
    color: '#a855f7', glowColor: 'rgba(168,85,247,0.6)',
    items: [
      { id: 'w8_a', name: 'Kim Cương', emoji: '💎', xpRequired: 800 },
      { id: 'w8_b', name: 'Viền Tím Huyền', emoji: '🔮', xpRequired: 1500 },
      { id: 'w8_c', name: 'Vô Địch Thiên Hạ', emoji: '🏆', xpRequired: 2500 },
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
