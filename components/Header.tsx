
import React from 'react';
import { UserProfile } from '../types';
import { getLevelFromXp } from '../utils/gameLogic';
import AvatarDisplay from './AvatarDisplay';

interface HeaderProps {
  user: UserProfile;
  onNavigate: (view: 'home' | 'leaderboard' | 'profile' | 'rewards') => void;
}

const Header: React.FC<HeaderProps> = ({ user, onNavigate }) => {
  const levelData = getLevelFromXp(user.xp);

  return (
    <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => onNavigate('home')}
        >
          <div className="bg-red-600 w-10 h-10 rounded-lg flex items-center justify-center font-black text-2xl shadow-lg shadow-red-600/20 group-hover:scale-105 transition-transform">X</div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight leading-none">Đấu trường X</h1>
            <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Tìm X – Tìm bản lĩnh</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold uppercase tracking-wider text-slate-400">
          <button onClick={() => onNavigate('home')} className="hover:text-red-500 transition-colors">Trang chủ</button>
          <button onClick={() => onNavigate('leaderboard')} className="hover:text-red-500 transition-colors">Xếp hạng</button>
        </nav>

        <div
          className="flex items-center gap-3 bg-slate-800/50 p-1 pr-3 rounded-full cursor-pointer hover:bg-slate-800 transition-colors"
          onClick={() => onNavigate('profile')}
        >
          <AvatarDisplay
            avatar={user.avatar}
            name={user.name}
            equippedFrame={user.equippedFrame}
            unlockedFrames={user.unlockedFrames}
            size="sm"
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold truncate max-w-[80px]">{user.name}</span>
            <span className="text-[10px] text-yellow-500 font-medium flex items-center gap-1">
               {levelData.emoji} {user.xp} XP
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
