import React, { useMemo } from 'react';
import { GameHistory, Difficulty } from '../types';

interface HistoryPageProps {
  history: GameHistory[];
  onBack: () => void;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ history, onBack }) => {
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
    const totalXp = history.reduce((sum, g) => sum + g.xpEarned, 0);
    const totalCorrect = history.reduce((sum, g) => sum + g.correctCount, 0);
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
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">LỊCH SỬ ĐẤU</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1 sm:mt-2">
            Tổng kết {summary.totalGames} trận đấu
          </p>
        </div>
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
            {history.map((game, idx) => (
              <div key={game.id} className="p-3 sm:p-6 hover:bg-slate-800/30 transition-colors">
                {/* Mobile Layout */}
                <div className="flex items-start gap-3 sm:hidden">
                  {/* Rank */}
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-500 text-xs flex-shrink-0">
                    #{idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row: Grade + Difficulty + Score */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">Lớp {game.grade}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${getDifficultyColor(game.difficulty)}`}>
                          {game.difficulty.split(' ')[0]}
                        </span>
                      </div>
                      <span className="font-black text-white text-sm">{game.correctCount}/{game.totalQuestions}</span>
                    </div>

                    {/* Date */}
                    <p className="text-[10px] text-slate-500 mb-2">{formatDate(game.playedAt)}</p>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-center">
                      <div>
                        <p className="text-sm font-black text-yellow-500">+{game.xpEarned}</p>
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
                <div className="hidden sm:flex items-center gap-6">
                  {/* Rank */}
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-slate-500">
                    #{idx + 1}
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-black text-white">Lớp {game.grade}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${getDifficultyColor(game.difficulty)}`}>
                        {game.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span>{formatDate(game.playedAt)}</span>
                      <span className="text-slate-700">•</span>
                      <span className="truncate">{game.topics.join(', ')}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-center">
                    <div>
                      <p className="text-lg font-black text-white">{game.correctCount}/{game.totalQuestions}</p>
                      <p className="text-[9px] font-black uppercase text-slate-600">ĐÚNG</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-yellow-500">+{game.xpEarned}</p>
                      <p className="text-[9px] font-black uppercase text-slate-600">XP</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-orange-500">{game.maxStreak}</p>
                      <p className="text-[9px] font-black uppercase text-slate-600">STREAK</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-blue-500">{formatTime(game.timeSpent)}</p>
                      <p className="text-[9px] font-black uppercase text-slate-600">THỜI GIAN</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
