/**
 * frameLogic.ts
 * Utility functions cho Avatar Frame System
 */

import { WEEKLY_FRAMES, getCurrentProgramWeek } from '../constants';
import { WeeklyFrame } from '../types';

/**
 * Kiểm tra frame nào đã hoàn chỉnh VÀ có thể sử dụng (đạt 3 mốc + tuần đã đến).
 * Trả về array frame IDs đã complete và usable.
 */
export function getCompletedFrames(unlockedFrames: string[]): string[] {
  return WEEKLY_FRAMES
    .filter(f => isFrameUsable(f.id, unlockedFrames))
    .map(f => f.id);
}

/**
 * Kiểm tra items mới nào cần unlock dựa trên weeklyXp hiện tại.
 * @param weeklyXp - XP tuần hiện tại
 * @param currentUnlocked - Các item IDs đã unlock từ trước
 * @param programWeek - Tuần chương trình (1-8), null nếu ngoài chương trình
 * @returns Array của item IDs mới được unlock
 */
export function checkNewUnlocks(
  weeklyXp: number,
  currentUnlocked: string[],
  programWeek: number | null
): string[] {
  if (!programWeek) return [];

  const frame = WEEKLY_FRAMES.find(f => f.week === programWeek);
  if (!frame) return [];

  const unlocked = new Set(currentUnlocked);
  const newUnlocks: string[] = [];

  for (const item of frame.items) {
    if (!unlocked.has(item.id) && weeklyXp >= item.xpRequired) {
      newUnlocks.push(item.id);
    }
  }

  return newUnlocks;
}

/**
 * Lấy frame definition từ ID.
 */
export function getFrameById(frameId: string): WeeklyFrame | undefined {
  return WEEKLY_FRAMES.find(f => f.id === frameId);
}

/**
 * Lấy số items đã unlock của một frame.
 */
export function getFrameUnlockCount(frameId: string, unlockedFrames: string[]): number {
  const frame = WEEKLY_FRAMES.find(f => f.id === frameId);
  if (!frame) return 0;
  const unlocked = new Set(unlockedFrames);
  return frame.items.filter(item => unlocked.has(item.id)).length;
}

/**
 * Lấy frame của tuần hiện tại.
 */
export function getCurrentWeekFrame(): WeeklyFrame | null {
  const week = getCurrentProgramWeek();
  if (!week) return null;
  return WEEKLY_FRAMES.find(f => f.week === week) || null;
}

/**
 * Tính milestone tiếp theo cần đạt trong tuần hiện tại.
 * @returns { xpRequired, itemName } hoặc null nếu đã unlock hết
 */
export function getNextMilestone(
  weeklyXp: number,
  unlockedFrames: string[],
  programWeek: number | null
): { xpRequired: number; itemName: string; itemEmoji: string } | null {
  if (!programWeek) return null;

  const frame = WEEKLY_FRAMES.find(f => f.week === programWeek);
  if (!frame) return null;

  const unlocked = new Set(unlockedFrames);
  for (const item of frame.items) {
    if (!unlocked.has(item.id)) {
      return {
        xpRequired: item.xpRequired,
        itemName: item.name,
        itemEmoji: item.emoji,
      };
    }
  }
  return null; // Đã unlock hết items của tuần này
}

/**
 * Kiểm tra frame có thể sử dụng không.
 * Điều kiện: đạt đủ 3 mốc XP (cả 3 items unlocked) VÀ tuần đó đã đến/qua.
 */
// ⚠️ TEST: bỏ chặn "tuần chưa đến" để trang bị được khung unlock bằng giữ 10s.
// ĐẶT false TRƯỚC KHI CHẠY THẬT!
const TEST_IGNORE_WEEK_GATE = false;

export function isFrameUsable(frameId: string, unlockedFrames: string[]): boolean {
  const frame = WEEKLY_FRAMES.find(f => f.id === frameId);
  if (!frame) return false;
  const allItemsUnlocked = frame.items.every(item => unlockedFrames.includes(item.id));
  if (TEST_IGNORE_WEEK_GATE) return allItemsUnlocked;
  const currentWeek = getCurrentProgramWeek();
  // Tuần đã đến hoặc đã qua (currentWeek >= frame.week), hoặc chương trình đã kết thúc (currentWeek === null nhưng đã qua)
  const weekReached = currentWeek !== null ? currentWeek >= frame.week : true; // null = chương trình kết thúc → tất cả tuần đều "đã qua"
  return allItemsUnlocked && weekReached;
}

/**
 * CSS classes cho avatar frame dựa trên frame được trang bị và items đã unlock.
 */
export function getFrameStyle(
  equippedFrameId: string | undefined,
  unlockedFrames: string[]
): { borderStyle: string; glowStyle: string; hasGlow: boolean } {
  if (!equippedFrameId) {
    return { borderStyle: 'border-slate-700', glowStyle: '', hasGlow: false };
  }

  const frame = getFrameById(equippedFrameId);
  if (!frame) {
    return { borderStyle: 'border-slate-700', glowStyle: '', hasGlow: false };
  }

  const unlockCount = getFrameUnlockCount(equippedFrameId, unlockedFrames);
  const isComplete = unlockCount === 3;
  const hasThick = unlockCount >= 2;

  return {
    borderStyle: `border-[${frame.color}] ${hasThick ? 'border-4' : 'border-2'}`,
    glowStyle: isComplete ? `0 0 16px ${frame.glowColor}, 0 0 32px ${frame.glowColor}` : '',
    hasGlow: isComplete,
  };
}
