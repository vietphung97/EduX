/**
 * AvatarDisplay.tsx
 * Hiển thị avatar + frame đang trang bị.
 * Dùng trong Header, ProfilePage, Leaderboard.
 */

import React from 'react';
import { getFrameById, getFrameUnlockCount } from '../utils/frameLogic';

interface AvatarDisplayProps {
  avatar: string;
  name: string;
  equippedFrame?: string;
  unlockedFrames?: string[];
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: { outer: 'w-9 h-9', img: 'w-full h-full', ring: 'p-0.5' },
  md: { outer: 'w-12 h-12', img: 'w-full h-full', ring: 'p-0.5' },
  lg: { outer: 'w-20 h-20', img: 'w-full h-full', ring: 'p-1' },
  xl: { outer: 'w-32 h-32', img: 'w-full h-full', ring: 'p-1.5' },
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
  const unlockCount = frame ? getFrameUnlockCount(frame.id, unlockedFrames) : 0;
  const isComplete = unlockCount === 3;
  const hasFrame = !!frame && unlockCount > 0;

  const borderWidth = hasFrame ? (unlockCount >= 2 ? '3px' : '2px') : '2px';
  const borderColor = hasFrame ? frame!.color : '#334155'; // slate-700

  const containerStyle: React.CSSProperties = {
    borderWidth,
    borderStyle: 'solid',
    borderColor,
    borderRadius: '50%',
    boxShadow: isComplete
      ? `0 0 10px ${frame!.glowColor}, 0 0 24px ${frame!.glowColor}`
      : undefined,
    padding: hasFrame ? (sz.ring.split('p-')[1] === '0.5' ? '2px' : sz.ring.split('p-')[1] === '1' ? '4px' : '6px') : '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  };

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={containerStyle}>
      <div className={`${sz.outer} rounded-full overflow-hidden bg-slate-800 flex-shrink-0`}>
        {avatar && avatar.startsWith('http') ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-lg">{avatar || '🎮'}</span>
        )}
      </div>
      {/* Frame week badge — chỉ hiện nếu có frame */}
      {hasFrame && frame && (
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full text-[9px] leading-none flex items-center justify-center"
          style={{
            width: size === 'xl' ? '24px' : size === 'lg' ? '20px' : '16px',
            height: size === 'xl' ? '24px' : size === 'lg' ? '20px' : '16px',
            background: frame.color,
            boxShadow: `0 0 6px ${frame.glowColor}`,
          }}
        >
          {isComplete ? frame.emoji : '🔒'}
        </div>
      )}
    </div>
  );
};

export default AvatarDisplay;
