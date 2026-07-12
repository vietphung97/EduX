/**
 * Quy định Chương trình hè EduX:
 *   3.1. Đấu hạng (Solo) — mỗi tuần chỉ tính XP cho tối đa 7 lượt đầu tiên.
 *        Các lượt sau vẫn chơi được nhưng KHÔNG cộng XP tuần.
 *   3.2. Thách đấu (Multiplayer)
 *        - Khung giờ mở: 14h00–21h00 các ngày Thứ 3, Thứ 5, Thứ 7 (giờ VN).
 *        - Mỗi buổi (1 ngày mở thách đấu) tối đa 5 trận.
 *        - Thách đấu nhóm (>=3 người): rank 1 được cộng thêm +100 XP.
 *
 * Tất cả tính theo Asia/Ho_Chi_Minh để tránh lệch tuần/giờ khi user ở
 * timezone khác. KHÔNG dùng Date.getDay/Hours trực tiếp.
 */

import type { GameHistory } from '../types';

export const SOLO_WEEKLY_MATCH_CAP = 7;
export const THACH_DAU_DAILY_MATCH_CAP = 5;
export const THACH_DAU_HOUR_START = 14; // bao gồm 14:00
export const THACH_DAU_HOUR_END = 21;   // không bao gồm 21:00
// JS Date.getUTCDay() sau khi shift sang VN: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
export const THACH_DAU_OPEN_DAYS: ReadonlyArray<number> = [2, 4, 6];

const VN_OFFSET_MIN = 7 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Lấy components giờ VN từ một Date bất kỳ (tránh phụ thuộc timezone máy client).
 * Trả: { day (Sun=0..Sat=6), hour (0-23), dateKey (YYYY-MM-DD VN) }.
 */
export function getVnParts(at: Date = new Date()): { day: number; hour: number; minute: number; dateKey: string } {
  // Shift UTC ms sang VN bằng cách cộng offset VN.
  const shifted = new Date(at.getTime() + VN_OFFSET_MIN * 60_000);
  const day = shifted.getUTCDay();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return { day, hour, minute, dateKey: `${y}-${m}-${d}` };
}

export type ThachDauStatus =
  | { open: true }
  | { open: false; reason: 'wrong_day' | 'wrong_hour'; nextOpenIso?: string };

/** Đang trong khung giờ Thách đấu (T3/T5/T7 14h–21h VN)? */
export function getThachDauStatus(at: Date = new Date()): ThachDauStatus {
  const { day, hour } = getVnParts(at);
  const dayOk = THACH_DAU_OPEN_DAYS.includes(day);
  const hourOk = hour >= THACH_DAU_HOUR_START && hour < THACH_DAU_HOUR_END;
  if (dayOk && hourOk) return { open: true };
  return { open: false, reason: dayOk ? 'wrong_hour' : 'wrong_day' };
}

export function isThachDauOpen(at: Date = new Date()): boolean {
  return getThachDauStatus(at).open;
}

/** Format khung giờ cho UI. */
export const THACH_DAU_WINDOW_LABEL = '14h00 – 21h00 các ngày Thứ 3, Thứ 5, Thứ 7';

/* ============ ĐẾM TRẬN THEO QUY ĐỊNH ============ */

/** Lấy [start, end) tuần chương trình hiện tại theo VN. Trả null nếu ngoài range. */
export function getProgramWeekRange(programStart: Date, at: Date = new Date()): { startMs: number; endMs: number; week: number } | null {
  const msPerWeek = 7 * MS_PER_DAY;
  const diff = at.getTime() - programStart.getTime();
  if (diff < 0) return null;
  const week = Math.floor(diff / msPerWeek) + 1;
  if (week < 1 || week > 8) return null;
  const startMs = programStart.getTime() + (week - 1) * msPerWeek;
  return { startMs, endMs: startMs + msPerWeek, week };
}

/**
 * Lấy [start, end) của TUẦN LỊCH (Mon 00:00 → Sun 23:59:59 theo VN).
 * Không phụ thuộc chương trình → cap solo 7/tuần hoạt động cả trước/trong/sau chương trình.
 * (Decision Viet 2026-06-17 + 2026-06-19: siết cap mọi lúc theo tuần lịch.)
 */
export function getCalendarWeekRangeVn(at: Date = new Date()): { startMs: number; endMs: number } {
  const parts = getVnParts(at);
  // VN getUTCDay: 0=Sun..6=Sat. Days since Monday (Mon=0): (day+6) % 7.
  const daysSinceMon = (parts.day + 6) % 7;
  // Lấy Date của Mon 00:00 VN
  // = (current time shifted to VN) - daysSinceMon*MS_PER_DAY - hours/mins/sec component
  // Cách tính: shifted = at + VN_OFFSET_MIN. Mon00 shifted = floor(shifted to day) - daysSinceMon*MS_PER_DAY.
  const shifted = at.getTime() + VN_OFFSET_MIN * 60_000;
  const shiftedDayStart = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY;
  const monShifted = shiftedDayStart - daysSinceMon * MS_PER_DAY;
  // Convert back to real epoch ms (UTC)
  const startMs = monShifted - VN_OFFSET_MIN * 60_000;
  return { startMs, endMs: startMs + 7 * MS_PER_DAY };
}

/** Đếm số trận SOLO trong tuần lịch hiện tại (Mon-Sun VN), bất kể trong/ngoài chương trình. */
export function countSoloThisWeek(history: GameHistory[], _programStart?: Date, at: Date = new Date()): number {
  // _programStart param giữ để tương thích call site cũ, không còn dùng.
  const range = getCalendarWeekRangeVn(at);
  let n = 0;
  for (const g of history) {
    if (!g || !g.playedAt) continue;
    if (g.mode && g.mode !== 'solo') continue; // mặc định undefined coi như solo
    const t = new Date(g.playedAt).getTime();
    if (t >= range.startMs && t < range.endMs) n++;
  }
  return n;
}

/**
 * Đếm số trận Thách đấu (multiplayer) đã chơi trong "buổi hôm nay":
 * cùng dateKey VN và rơi vào khung 14–21h VN.
 */
export function countThachDauTodayInWindow(history: GameHistory[], at: Date = new Date()): number {
  const today = getVnParts(at).dateKey;
  let n = 0;
  for (const g of history) {
    if (!g || !g.playedAt) continue;
    if (g.mode !== 'multiplayer') continue;
    const parts = getVnParts(new Date(g.playedAt));
    if (parts.dateKey !== today) continue;
    if (parts.hour < THACH_DAU_HOUR_START || parts.hour >= THACH_DAU_HOUR_END) continue;
    n++;
  }
  return n;
}

/** Tổng kết quota cho UI hiển thị. */
export interface QuotaInfo {
  used: number;
  cap: number;
  remaining: number;
  exhausted: boolean;
}
export function soloWeeklyQuota(history: GameHistory[], programStart: Date, at: Date = new Date()): QuotaInfo {
  const used = countSoloThisWeek(history, programStart, at);
  const remaining = Math.max(0, SOLO_WEEKLY_MATCH_CAP - used);
  return { used, cap: SOLO_WEEKLY_MATCH_CAP, remaining, exhausted: used >= SOLO_WEEKLY_MATCH_CAP };
}
export function thachDauDailyQuota(history: GameHistory[], at: Date = new Date()): QuotaInfo {
  const used = countThachDauTodayInWindow(history, at);
  const remaining = Math.max(0, THACH_DAU_DAILY_MATCH_CAP - used);
  return { used, cap: THACH_DAU_DAILY_MATCH_CAP, remaining, exhausted: used >= THACH_DAU_DAILY_MATCH_CAP };
}
