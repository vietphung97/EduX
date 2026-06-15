import React, { useState, useEffect, useMemo } from 'react';
import { getPlatformStats, PlatformStats } from '../services/supabase';

type FilterPeriod = 'week' | 'month1' | 'month2';

interface StatsPageProps {
  onBack: () => void;
}

const PERIOD_LABELS: Record<FilterPeriod, string> = {
  week: 'Tuần này',
  month1: 'Tháng này',
  month2: 'Tháng trước',
};

const StatsPage: React.FC<StatsPageProps> = ({ onBack }) => {
  const [period, setPeriod] = useState<FilterPeriod>('month1');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: now.toISOString() };
    }
    if (period === 'month1') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: now.toISOString() };
    }
    // month2 = previous month
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const data = await getPlatformStats(dateRange.from, dateRange.to);
      if (!cancelled) {
        setStats(data);
        setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  const formatNumber = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const soloPlays = stats?.totalSoloPlays ?? 0;
  const multiPlays = stats?.totalMultiplayerPlays ?? 0;
  const totalPlays = soloPlays + multiPlays;
  const soloRatio = totalPlays > 0 ? Math.round((soloPlays / totalPlays) * 100) : 0;
  const multiRatio = totalPlays > 0 ? 100 - soloRatio : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20 px-4">
      {/* Header */}
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">THỐNG KÊ HỆ THỐNG</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1">
            Tổng quan hoạt động đấu trường X
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700 flex-shrink-0"
        >
          QUAY LẠI
        </button>
      </div>

      {/* Period Filter */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as FilterPeriod[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all ${
              period === p
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
          <span className="ml-4 text-slate-400 font-bold">Đang tải...</span>
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">NGƯỜI CHƠI</p>
              <div className="flex items-baseline justify-center gap-1">
                <p className="text-2xl sm:text-3xl font-black text-cyan-400">{formatNumber(stats?.activePlayers ?? 0)}</p>
                <p className="text-base sm:text-lg font-black text-slate-600">/</p>
                <p className="text-base sm:text-lg font-black text-slate-400">{formatNumber(stats?.totalPlayers ?? 0)}</p>
              </div>
              <p className="text-[10px] text-slate-600 mt-1 uppercase font-bold">active / tổng tài khoản</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">NGƯỜI CHƠI MỚI</p>
              <p className="text-2xl sm:text-3xl font-black text-green-500">{formatNumber(stats?.newPlayers ?? 0)}</p>
              <p className="text-[10px] text-slate-600 mt-1 uppercase font-bold">{PERIOD_LABELS[period].toLowerCase()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">TỔNG LƯỢT CHƠI</p>
              <p className="text-2xl sm:text-3xl font-black text-yellow-500">{formatNumber(totalPlays)}</p>
              <p className="text-[10px] text-slate-600 mt-1 uppercase font-bold">{PERIOD_LABELS[period].toLowerCase()}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">TỔNG XP PHÁT</p>
              <p className="text-2xl sm:text-3xl font-black text-purple-500">{formatNumber(stats?.totalXpAwarded ?? 0)}</p>
              <p className="text-[10px] text-slate-600 mt-1 uppercase font-bold">{PERIOD_LABELS[period].toLowerCase()}</p>
            </div>
          </div>

          {/* Play Modes Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-[32px] overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-800">
              <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-slate-300">Lượt chơi theo chế độ</h3>
            </div>
            <div className="p-4 sm:p-6 space-y-5">
              {/* Solo */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <span className="font-black text-sm text-slate-200">Đấu hạng (Tự chơi)</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-white text-sm">{formatNumber(soloPlays)}</span>
                    <span className="text-slate-500 text-xs ml-2">({soloRatio}%)</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-700"
                    style={{ width: `${soloRatio}%` }}
                  />
                </div>
              </div>

              {/* Multiplayer */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👥</span>
                    <span className="font-black text-sm text-slate-200">Thách đấu (Nhiều người)</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-white text-sm">{formatNumber(multiPlays)}</span>
                    <span className="text-slate-500 text-xs ml-2">({multiRatio}%)</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${multiRatio}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Grade Distribution */}
          {stats && Object.keys(stats.playsByGrade).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-[32px] overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-800">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-slate-300">Lượt chơi theo khối lớp</h3>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.entries(stats.playsByGrade as Record<string, number>)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([grade, count]) => {
                      const maxCount = Math.max(...Object.values(stats.playsByGrade as Record<string, number>));
                      const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                      return (
                        <div key={grade} className="text-center space-y-2">
                          <div className="h-16 bg-slate-800 rounded-xl relative overflow-hidden flex items-end">
                            <div
                              className="w-full bg-gradient-to-t from-red-600 to-red-500/60 rounded-xl transition-all duration-700"
                              style={{ height: `${Math.max(pct, 4)}%` }}
                            />
                          </div>
                          <p className="text-xs font-black text-slate-300">Lớp {grade}</p>
                          <p className="text-[10px] font-bold text-slate-500">{formatNumber(count)} lượt</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Accuracy */}
          <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-2">
            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Độ chính xác trung bình</p>
            <p className="text-3xl font-black text-green-400">{stats?.avgAccuracy ?? 0}%</p>
            <p className="text-xs text-slate-600 font-bold">Trên toàn bộ câu trả lời trong kỳ</p>
          </div>
        </>
      )}
    </div>
  );
};

export default StatsPage;
