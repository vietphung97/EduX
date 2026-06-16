
import React from 'react';
import { UserProfile } from '../types';
import { getLevelFromXp } from '../utils/gameLogic';
import AvatarDisplay from './AvatarDisplay';

interface HeaderProps {
  user: UserProfile;
  currentView: string;
  onNavigate: (view: 'home' | 'leaderboard' | 'profile' | 'rewards' | 'roadmap') => void;
}

const mobileNavItems = [
  { view: 'home' as const, label: 'Trang chủ', icon: '🏠' },
  { view: 'roadmap' as const, label: 'Lộ trình', icon: '🗺️' },
  { view: 'rewards' as const, label: 'Quà tặng', icon: '🎁' },
  { view: 'leaderboard' as const, label: 'Xếp hạng', icon: '🏆' },
];

const Header: React.FC<HeaderProps> = ({ user, currentView, onNavigate }) => {
  const levelData = getLevelFromXp(user.xp);

  return (
    <>
      {/* Top header */}
      <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => onNavigate('home')}
          >
            <div className="bg-red-600 w-10 h-10 rounded-lg flex items-center justify-center font-black text-2xl shadow-lg shadow-red-600/20 group-hover:scale-105 transition-transform">X</div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight leading-none">Đấu trường X</h1>
              <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">EDUSO SUMMER ENGLISH ARENA</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold uppercase tracking-wider text-slate-400">
            <button onClick={() => onNavigate('home')} className={`hover:text-red-500 transition-colors ${currentView === 'home' ? 'text-red-400 font-black' : ''}`}>Trang chủ</button>
            <button onClick={() => onNavigate('roadmap')} className={`hover:text-red-500 transition-colors ${currentView === 'roadmap' ? 'text-red-400 font-black' : ''}`}>Lộ trình</button>
            <button onClick={() => onNavigate('rewards')} className={`hover:text-red-500 transition-colors ${currentView === 'rewards' ? 'text-red-400 font-black' : ''}`}>Quà tặng</button>
            <button onClick={() => onNavigate('leaderboard')} className={`hover:text-red-500 transition-colors ${currentView === 'leaderboard' ? 'text-red-400 font-black' : ''}`}>Xếp hạng</button>
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
                 {levelData.emoji} {user.xp.toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-t border-slate-800">
        <div className="flex items-center justify-around h-12">
          {mobileNavItems.map(item => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors relative ${
                  isActive ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-red-500 rounded-full" />
                )}
                <span className="text-2xl">{item.icon}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Header;
