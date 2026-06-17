/**
 * AvatarDisplay.tsx
 * Hiển thị avatar + frame ảnh overlay.
 * Frame chỉ hiện khi đã unlock đủ 3 mốc VÀ tuần đã đến.
 */

import React from 'react';
import { getFrameById, isFrameUsable } from '../utils/frameLogic';
import { isAvatarImage, normalizeAvatarUrl } from '../utils/playerSession';

interface AvatarDisplayProps {
  avatar: string;
  name: string;
  equippedFrame?: string;
  unlockedFrames?: string[];
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// avatar ~78% container để phủ kín lỗ frame (các frame có lỗ ~58-69%, vùng dư bị frame mask)
const SIZE_MAP = {
  sm: { container: 40, avatar: 31 },
  md: { container: 52, avatar: 40 },
  lg: { container: 84, avatar: 65 },
  xl: { container: 172, avatar: 134 },
};

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  avatar,
  name,
  equippedFrame,
  unlockedFrames = [],
  size = 'md',
  className = '',
}) => {
  const sz = SIZE_MAP[size];
  const frame = equippedFrame ? getFrameById(equippedFrame) : null;
  const canUse = frame ? isFrameUsable(frame.id, unlockedFrames) : false;
  const showFrame = !!frame && canUse;

  const baseUrl = (import.meta as any).env?.BASE_URL || '/';

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: sz.container, height: sz.container }}
    >
      {/* Avatar image — centered */}
      <div
        className="absolute rounded-full overflow-hidden bg-slate-800 flex items-center justify-center"
        style={{
          width: sz.avatar,
          height: sz.avatar,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {isAvatarImage(avatar) ? (
          <img src={normalizeAvatarUrl(avatar)} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-lg">{avatar || '🎮'}</span>
        )}
      </div>

      {/* Frame overlay — chỉ hiện khi unlock + tuần đã đến */}
      {showFrame && frame && (
        <img
          src={`${baseUrl}${frame.frameImage}`}
          alt={frame.name}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        />
      )}

      {/* Không có frame → không vẽ viền đè lên avatar nữa */}
    </div>
  );
};

export default AvatarDisplay;
