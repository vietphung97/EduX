import React, { useMemo, useState, useRef } from 'react';
import { GameHistory, Difficulty, UserProfile } from '../types';
import { XP_PER_QUESTION } from '../utils/gameLogic';
import AvatarDisplay from './AvatarDisplay';

interface HistoryPageProps {
  history: GameHistory[];
  user: UserProfile;
  allUsers: UserProfile[];
  onBack: () => void;
  onRecalculate?: (fixedHistory: GameHistory[], xpDiff: number) => void;
  onRecalculateAll?: () => Promise<{ total: number; fixed: number }>;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ history, user, allUsers, onBack, onRecalculate, onRecalculateAll }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRecalcResult, setShowRecalcResult] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressAllTimer = useRef<number | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Lookup map: player name → frame data (from current leaderboard + current user)
  const frameByName = useMemo(() => {
    const map: Record<string, { equippedFrame?: string; unlockedFrames?: string[] }> = {};
    for (const u of allUsers) {
      map[u.name] = { equippedFrame: u.equippedFrame, unlockedFrames: u.unlockedFrames };
    }
    // Current user always overrides
    map[user.name] = { equippedFrame: user.equippedFrame, unlockedFrames: user.unlockedFrames };
    return map;
  }, [allUsers, user]);

  const handleRecalculate = () => {
    if (!onRecalculate) return;
    let fixedCount = 0;
    let totalXpDiff = 0;

    const fixedHistory = history.map(game => {
      const safeCorrect = Math.round(game.correctCount);
      const xpPerQ = XP_PER_QUESTION[game.difficulty] || 10;
      const correctXp = safeCorrect * xpPerQ;
      const streakBonus = game.maxStreak * 5;
      const recalcXp = correctXp + streakBonus;

      const oldRankBonus = Math.max(0, Math.round(game.xpEarned) - recalcXp);
      const newXpEarned = recalcXp + oldRankBonus;

      if (game.correctCount !== safeCorrect || game.xpEarned !== newXpEarned) {
        fixedCount++;
        totalXpDiff += newXpEarned - game.xpEarned;
        return { ...game, correctCount: safeCorrect, xpEarned: newXpEarned, score: safeCorrect * xpPerQ + game.maxStreak * 5 };
      }
      return game;
    });

    onRecalculate(fixedHistory, totalXpDiff);
    setShowRecalcResult(`Sửa ${fixedCount} ván · XP ${Math.round(totalXpDiff) >= 0 ? '+' : ''}${Math.round(totalXpDiff)} (tài khoản này)`);
    setTimeout(() => setShowRecalcResult(null), 5000);
  };

  const handleRecalculateAll = async () => {
    if (!onRecalculateAll || isRecalculating) return;
    setIsRecalculating(true);
    setShowRecalcResult('Đang tính lại XP cho tất cả tài khoản...');
    try {
      const result = await onRecalculateAll();
      setShowRecalcResult(`Hoàn tất! ${result.fixed}/${result.total} tài khoản được sửa`);
    } catch (e) {
      setShowRecalcResult('Lỗi khi tính lại. Kiểm tra console.');
      console.error(e);
    }
    setIsRecalculating(false);
    setTimeout(() => setShowRecalcResult(null), 5000);
  };

  // Bấm giữ 3s = fix local, 5s = fix ALL
  const onLongPressStart = () => {
    longPressTimer.current = window.setTimeout(handleRecalculate, 3000);
    longPressAllTimer.current = window.setTimeout(handleRecalculateAll, 5000);
  };
  const onLongPressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (longPressAllTimer.current) { clearTimeout(longPressAllTimer.current); longPressAllTimer.current = null; }
  };

  // Tính tổng kết
  const summary = useMemo(() => {
    if (history.length === 0) {
      return {
        totalGames: 0,
        totalXp: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        avgAccuracy: 0,
        bestStreak: 0,
        totalTimeSpent: 0
      };
    }

    const totalGames = history.length;
    const totalXp = Math.round(history.reduce((sum, g) => {
      const xpPerQ = XP_PER_QUESTION[g.difficulty] || 10;
      const base = Math.round(g.correctCount) * xpPerQ + g.maxStreak * 5;
      const rBonus = g.mode === 'multiplayer'
        ? (g.myRank === 1 ? 100 : 0)
        : Math.max(0, Math.round(g.xpEarned) - base);
      return sum + base + rBonus;
    }, 0));
    const totalCorrect = history.reduce((sum, g) => sum + Math.round(g.correctCount), 0);
    const totalQuestions = history.reduce((sum, g) => sum + g.totalQuestions, 0);
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const bestStreak = Math.max(...history.map(g => g.maxStreak));
    const totalTimeSpent = history.reduce((sum, g) => sum + g.timeSpent, 0);

    return { totalGames, totalXp, totalCorrect, totalQuestions, avgAccuracy, bestStreak, totalTimeSpent };
  }, [history]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDifficultyColor = (diff: Difficulty) => {
    switch (diff) {
      case Difficulty.EASY: return 'text-green-500 bg-green-500/10 border-green-500/20';
      case Difficulty.MEDIUM: return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case Difficulty.HARD: return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case Difficulty.EXPERT: return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8 animate-in fade-in duration-500 pb-20 px-4">
      {/* Header */}
      <div className="flex justify-between items-center gap-4">
        <div
          className="min-w-0 select-none"
          onMouseDown={onRecalculate ? onLongPressStart : undefined}
          onMouseUp={onLongPressEnd}
          onMouseLeave={onLongPressEnd}
          onTouchStart={onRecalculate ? onLongPressStart : undefined}
          onTouchEnd={onLongPressEnd}
        >
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">LỊCH SỬ ĐẤU</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1 sm:mt-2">
            Tổng kết {summary.totalGames} trận đấu
          </p>
        </div>
        {showRecalcResult && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600/90 text-white px-6 py-3 rounded-xl font-black text-sm shadow-xl animate-in fade-in duration-300 whitespace-nowrap">
            {showRecalcResult}
          </div>
        )}
        <button
          onClick={onBack}
          className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700 flex-shrink-0"
        >
          QUAY LẠI
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-6 rounded-xl sm:rounded-[24px] text-center">
          <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 sm:mb-2">TỔNG XP</p>
          <p className="text-xl sm:text-3xl font-black text-yellow-500">{summary.totalXp.toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-6 rounded-xl sm:rounded-[24px] text-center">
          <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 sm:mb-2">ĐỘ CHÍNH XÁC</p>
          <p className="text-xl sm:text-3xl font-black text-green-500">{summary.avgAccuracy}%</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-6 rounded-xl sm:rounded-[24px] text-center">
          <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 sm:mb-2">STREAK CAO NHẤT</p>
          <p className="text-xl sm:text-3xl font-black text-orange-500">{summary.bestStreak}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-6 rounded-xl sm:rounded-[24px] text-center">
          <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 sm:mb-2">TỔNG THỜI GIAN</p>
          <p className="text-xl sm:text-3xl font-black text-blue-500">{Math.floor(summary.totalTimeSpent / 60)}p</p>
        </div>
      </div>

      {/* History List */}
      {history.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-2xl sm:rounded-[32px] text-center">
          <p className="text-slate-500 font-bold text-sm sm:text-lg">Chưa có lịch sử trận đấu nào</p>
          <p className="text-slate-600 text-xs sm:text-sm mt-2">Hãy bắt đầu trận đấu đầu tiên!</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-[32px] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-800">
            <h3 className="text-sm sm:text-lg font-black uppercase tracking-widest text-slate-400">Chi tiết các trận</h3>
          </div>
          <div className="divide-y divide-slate-800">
            {history.map((game, idx) => {
              const isExpanded = expandedId === game.id;
              const safeCorrectCount = Math.round(game.correctCount);
              const xpPerQ = XP_PER_QUESTION[game.difficulty] || 10;
              const correctXp = safeCorrectCount * xpPerQ;
              const streakBonus = game.maxStreak * 5;
              const recalculatedXp = correctXp + streakBonus;
              // Rank bonus: multiplayer hạng 1 = +100, còn lại = 0; solo = tính từ chênh lệch xpEarned
              const rankBonus = game.mode === 'multiplayer'
                ? (game.myRank === 1 ? 100 : 0)
                : Math.max(0, Math.round(game.xpEarned) - recalculatedXp);
              const safeXpEarned = recalculatedXp + rankBonus;

              return (
              <div key={game.id} className="hover:bg-slate-800/30 transition-colors">
                <div
                  className="p-3 sm:p-6 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : game.id)}
                >
                  {/* Mobile Layout */}
                  <div className="flex items-start gap-3 sm:hidden">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-500 text-xs flex-shrink-0">
                      #{idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-white text-sm">{'Lớp'} {game.grade}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${getDifficultyColor(game.difficulty)}`}>
                            {game.difficulty === 'Trung bình' ? 'TB' : game.difficulty.split(' ')[0]}
                          </span>
                          {game.mode === 'multiplayer' ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border border-blue-500/30 text-blue-400 bg-blue-500/10">
                              {'⚔️'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase border border-slate-600/30 text-slate-400 bg-slate-600/10">
                              Solo
                            </span>
                          )}
                          {game.myRank && game.totalPlayers && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${
                              game.myRank === 1 ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                              'border-slate-600/30 text-slate-400 bg-slate-600/10'
                            }`}>
                              {game.myRank}/{game.totalPlayers}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{safeCorrectCount}/{game.totalQuestions}</span>
                          <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 mb-2">{formatDate(game.playedAt)}</p>

                      <div className="flex items-center gap-4 text-center">
                        <div>
                          <p className="text-sm font-black text-yellow-500">+{safeXpEarned}</p>
                          <p className="text-[8px] font-black uppercase text-slate-600">XP</p>
                        </div>
                        <div>
                          <p className="text-sm font-black text-orange-500">{game.maxStreak}</p>
                          <p className="text-[8px] font-black uppercase text-slate-600">STREAK</p>
                        </div>
                        <div>
                          <p className="text-sm font-black text-blue-500">{formatTime(game.timeSpent)}</p>
                          <p className="text-[8px] font-black uppercase text-slate-600">THỜI GIAN</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-500 text-sm flex-shrink-0">
                      #{idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-black text-white text-sm">Lớp {game.grade}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${getDifficultyColor(game.difficulty)}`}>
                          {game.difficulty === 'Trung bình' ? 'TB' : game.difficulty.split(' ')[0]}
                        </span>
                        {game.mode === 'multiplayer' ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-blue-500/30 text-blue-400 bg-blue-500/10">
                            Thách đấu
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-slate-600/30 text-slate-400 bg-slate-600/10">
                            Solo
                          </span>
                        )}
                        {game.myRank && game.totalPlayers && (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                            game.myRank === 1 ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' :
                            'border-slate-600/30 text-slate-400 bg-slate-600/10'
                          }`}>
                            {game.myRank}/{game.totalPlayers}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{formatDate(game.playedAt)} · {game.topics.join(', ')}</p>
                    </div>

                    <div className="flex items-center gap-5 text-center flex-shrink-0">
                      <div>
                        <p className="text-base font-black text-white">{safeCorrectCount}/{game.totalQuestions}</p>
                        <p className="text-[8px] font-black uppercase text-slate-600">Đúng</p>
                      </div>
                      <div>
                        <p className="text-base font-black text-yellow-500">+{safeXpEarned}</p>
                        <p className="text-[8px] font-black uppercase text-slate-600">XP</p>
                      </div>
                      <div>
                        <p className="text-base font-black text-orange-500">{game.maxStreak}</p>
                        <p className="text-[8px] font-black uppercase text-slate-600">Streak</p>
                      </div>
                      <div>
                        <p className="text-base font-black text-blue-500">{formatTime(game.timeSpent)}</p>
                        <p className="text-[8px] font-black uppercase text-slate-600">Thời gian</p>
                      </div>
                      <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded XP Breakdown */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 sm:p-5 ml-11 sm:ml-16">
                      <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">Chi tiết XP</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-slate-400">Câu đúng × XP/câu</span>
                          <span className="text-xs sm:text-sm font-black text-white">{safeCorrectCount} × {xpPerQ} = <span className="text-yellow-500">+{correctXp}</span></span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-slate-400">Streak cao nhất × 5XP</span>
                          <span className="text-xs sm:text-sm font-black text-white">{game.maxStreak} × 5 = <span className="text-orange-400">+{streakBonus}</span></span>
                        </div>
                        {rankBonus > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs sm:text-sm text-slate-400">Thưởng thứ hạng</span>
                            <span className="text-xs sm:text-sm font-black text-green-500">+{rankBonus}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-800 pt-2 mt-2 flex justify-between items-center">
                          <span className="text-xs sm:text-sm font-black text-slate-300 uppercase">Tổng XP</span>
                          <span className="text-lg sm:text-xl font-black text-yellow-500">+{safeXpEarned}</span>
                        </div>
                      </div>
                    </div>

                    {/* Opponents section for multiplayer */}
                    {game.mode === 'multiplayer' && game.opponents && game.opponents.length > 0 && (
                      <div className="bg-slate-950/60 border border-slate-800/50 rounded-xl p-4 sm:p-5 ml-11 sm:ml-16 mt-3">
                        <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">
                          Bảng xếp hạng ({game.totalPlayers} người chơi)
                        </p>
                        <div className="space-y-2">
                          {game.opponents
                            .sort((a, b) => a.rank - b.rank)
                            .map((opp, i) => (
                              <div key={i} className={`flex items-center gap-3 p-2 rounded-lg ${
                                opp.rank === game.myRank ? 'bg-red-500/10 border border-red-500/20' : ''
                              }`}>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                                  opp.rank === 1 ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/40' :
                                  opp.rank === 2 ? 'bg-slate-400/20 text-slate-300 ring-1 ring-slate-400/40' :
                                  opp.rank === 3 ? 'bg-amber-600/20 text-amber-500 ring-1 ring-amber-600/40' :
                                  'bg-slate-800 text-slate-500'
                                }`}>
                                  {opp.rank}
                                </span>
                                <div className="flex-shrink-0">
                                  <AvatarDisplay avatar={opp.avatar} name={opp.name} equippedFrame={frameByName[opp.name]?.equippedFrame} unlockedFrames={frameByName[opp.name]?.unlockedFrames} size="md" />
                                </div>
                                <span className="flex-1 text-xs sm:text-sm font-bold text-white truncate">
                                  {opp.name}
                                  {opp.rank === game.myRank && (
                                    <span className="text-red-400 ml-1 text-[10px]">(bạn)</span>
                                  )}
                                </span>
                                <span className="text-xs font-bold text-green-400">{opp.correctCount}/{game.totalQuestions}</span>
                                <span className="text-xs font-black text-yellow-500 w-16 text-right">{opp.score} XP</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
