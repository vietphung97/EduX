
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { GameResult } from '../types';
import { AdvisorAnalysis } from '../services/gemini';

interface ResultAnalyticsProps {
  result: GameResult;
  analysis: AdvisorAnalysis | null;
  onClose: () => void;
  onPlayAgain?: () => void;
  onChooseTopic?: () => void;
}

const TIP_ICONS: Record<string, string> = {
  'topic': '📖',
  'question-type': '🎯',
  'time': '⏱️',
  'streak': '🔥',
  'difficulty': '⚡',
};

const ResultAnalytics: React.FC<ResultAnalyticsProps> = ({ result, analysis, onClose, onPlayAgain, onChooseTopic }) => {
  const pieData = [
    { name: 'Đúng', value: result.correctCount, color: '#10b981' },
    { name: 'Sai', value: result.totalQuestions - result.correctCount, color: '#ef4444' }
  ];

  const catData = Object.entries(result.categoryBreakdown).map(([name, stats]: [string, { correct: number; total: number }]) => ({
    name,
    Tỉlệ: Math.round((stats.correct / stats.total) * 100)
  }));

  const { xpBreakdown } = result;
  const avgTimePerQ = Math.round(result.timeSpent / result.totalQuestions);
  const accuracy = Math.round((result.correctCount / result.totalQuestions) * 100);

  const advice = analysis?.advice || "Cố vấn X đang tổng hợp dữ liệu trận đấu và các trận trước đó để đưa ra lời khuyên lầy lội nhất cho bạn...";
  const strengths = analysis?.strengths ?? [];
  const weaknesses = analysis?.weaknesses ?? [];
  const tips = analysis?.tips ?? [];

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-700 max-w-6xl mx-auto px-2 sm:px-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-xl sm:text-3xl font-black italic text-white uppercase tracking-tighter">KẾT QUẢ TRẬN ĐẤU</h2>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="px-4 sm:px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-black rounded-lg transition-all text-[10px] sm:text-xs uppercase tracking-widest shadow-lg shadow-green-600/20"
            >
              CHƠI LẠI
            </button>
          )}
          {onChooseTopic && (
            <button
              onClick={onChooseTopic}
              className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-lg transition-all text-[10px] sm:text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20"
            >
              CHỌN CHỦ ĐỀ
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-lg transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700"
          >
            TRỞ VỀ
          </button>
        </div>
      </div>

      {/* Top Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {/* Widget 1: XP Summary with Breakdown */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-8 rounded-2xl sm:rounded-[32px] flex flex-col min-h-[200px] sm:min-h-[300px] shadow-xl">
          <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-3 sm:mb-4 text-center">TỔNG XP NHẬN ĐƯỢC</p>

          <div className="flex-1 flex flex-col justify-center space-y-2 sm:space-y-3">
             <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">Câu đúng × XP/câu</span>
                <span className="text-xs sm:text-sm font-black text-white">+{xpBreakdown.correctXp}</span>
             </div>
             <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">Streak cao nhất × 5XP</span>
                <span className="text-xs sm:text-sm font-black text-orange-400">+{xpBreakdown.streakBonus}</span>
             </div>
             {xpBreakdown.rankBonus > 0 && (
               <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-400">Thưởng xếp hạng #1</span>
                  <span className="text-xs sm:text-sm font-black text-green-500">+{xpBreakdown.rankBonus}</span>
               </div>
             )}
          </div>

          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t-2 border-slate-800 flex flex-col items-center">
            <p className="text-3xl sm:text-5xl font-black text-yellow-500 tracking-tighter">+{xpBreakdown.totalXp}</p>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full mt-3 sm:mt-4">
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">CHÍNH XÁC</p>
                <p className="text-xs sm:text-sm font-black text-white">{accuracy}%</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">STREAK</p>
                <p className="text-xs sm:text-sm font-black text-white">{result.maxStreak}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">TG/CÂU</p>
                <p className="text-xs sm:text-sm font-black text-white">{avgTimePerQ}s</p>
              </div>
            </div>
          </div>
        </div>

        {/* Widget 2: Donut Chart */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-8 rounded-2xl sm:rounded-[32px] flex flex-col items-center min-h-[200px] sm:min-h-[300px] shadow-xl">
          <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-3 sm:mb-4">TỶ LỆ ĐÚNG/SAI</p>
          <div className="w-full h-full relative min-h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value" stroke="none">
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-slate-800/50 flex items-center justify-center">
                <span className="text-lg sm:text-xl font-black text-white">{result.correctCount}/{result.totalQuestions}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Widget 3: Category Stats */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-8 rounded-2xl sm:rounded-[32px] flex flex-col min-h-[180px] sm:min-h-[300px] shadow-xl">
          <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-3 sm:mb-4">THỐNG KÊ THEO CHỦ ĐỀ</p>
          <div className="flex-1 w-full min-h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData} layout="vertical" margin={{ left: -20, right: 10 }}>
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
                <Bar dataKey="Tỉlệ" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Advice Full Width Row */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-10 rounded-2xl sm:rounded-[40px] shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <div className="bg-red-600 p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg shadow-red-600/20">
            <span className="text-xl sm:text-2xl">🤖</span>
          </div>
          <h3 className="text-lg sm:text-2xl font-black uppercase tracking-tighter text-white">CỐ VẤN X</h3>
        </div>

        <div className="bg-slate-950/40 border border-slate-800/50 p-3 sm:p-8 rounded-xl sm:rounded-[30px] relative">
          <div className="absolute -top-3 sm:-top-4 left-3 sm:left-8 bg-slate-900 px-2 sm:px-4 py-0.5 sm:py-1 rounded-full border border-slate-800">
            <span className="text-[8px] sm:text-[10px] font-black text-red-500 uppercase tracking-widest">PHÂN TÍCH CHI TIẾT</span>
          </div>
          <p className="text-slate-200 leading-relaxed italic text-sm sm:text-lg relative z-10 whitespace-pre-line mt-1 sm:mt-0">
            {advice}
          </p>
        </div>

        {/* Dynamic Strengths / Weaknesses */}
        <div className="mt-4 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 p-3 sm:p-6 bg-red-600/5 border border-red-600/10 rounded-xl sm:rounded-2xl">
            <p className="text-[9px] sm:text-[10px] font-black uppercase text-red-500 mb-2 sm:mb-3">ĐIỂM MẠNH</p>
            {strengths.length > 0 ? (
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs sm:text-sm font-bold text-slate-300">
                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs sm:text-sm font-bold text-slate-500 italic">Hãy tiếp tục cố gắng để xây dựng điểm mạnh!</p>
            )}
          </div>
          <div className="flex-1 p-3 sm:p-6 bg-blue-600/5 border border-blue-600/10 rounded-xl sm:rounded-2xl">
            <p className="text-[9px] sm:text-[10px] font-black uppercase text-blue-500 mb-2 sm:mb-3">ĐIỂM YẾU</p>
            {weaknesses.length > 0 ? (
              <ul className="space-y-1.5">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs sm:text-sm font-bold text-slate-300">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">→</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs sm:text-sm font-bold text-slate-500 italic">Không tìm thấy điểm yếu rõ ràng — tiếp tục duy trì nhé!</p>
            )}
          </div>
        </div>
      </div>

      {/* Tips Section */}
      {tips.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-10 rounded-2xl sm:rounded-[40px] shadow-2xl">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
            <div className="bg-yellow-500 p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg shadow-yellow-500/20">
              <span className="text-xl sm:text-2xl">💡</span>
            </div>
            <div>
              <h3 className="text-base sm:text-2xl font-black uppercase tracking-tighter text-white">MẸO GỢI Ý CÁ NHÂN</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Dựa trên kết quả thực tế của bạn</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {tips.map((tip, i) => (
              <div
                key={i}
                className="p-3 sm:p-5 bg-slate-950/50 border border-slate-800/60 rounded-xl sm:rounded-2xl hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base sm:text-lg">{TIP_ICONS[tip.type] || '💡'}</span>
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-yellow-500">{tip.label}</p>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">{tip.content}</p>
              </div>
            ))}
          </div>

          {/* Quick stat bar */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-800 grid grid-cols-3 gap-2 sm:gap-4">
            <div className="text-center p-2 sm:p-4 bg-slate-950/40 rounded-xl">
              <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 mb-1">TỔNG THỜI GIAN</p>
              <p className="text-sm sm:text-xl font-black text-white">{result.timeSpent}s</p>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-950/40 rounded-xl">
              <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 mb-1">TB/CÂU</p>
              <p className={`text-sm sm:text-xl font-black ${avgTimePerQ > 25 ? 'text-red-400' : avgTimePerQ < 10 ? 'text-green-400' : 'text-white'}`}>{avgTimePerQ}s</p>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-950/40 rounded-xl">
              <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500 mb-1">STREAK TỐT NHẤT</p>
              <p className={`text-sm sm:text-xl font-black ${result.maxStreak >= 5 ? 'text-yellow-400' : 'text-white'}`}>{result.maxStreak} 🔥</p>
            </div>
          </div>
        </div>
      )}

      {/* Study Review Section */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-10 rounded-2xl sm:rounded-[40px] shadow-2xl">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <div className="bg-blue-600 p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg shadow-blue-600/20">
            <span className="text-xl sm:text-2xl">📚</span>
          </div>
          <h3 className="text-base sm:text-2xl font-black uppercase tracking-tighter text-white">STUDY REVIEW</h3>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {result.sessionDetails.questions.map((q, idx) => {
            const userAns = result.sessionDetails.answers.find(a => a.questionId === q.id);
            const isCorrect = userAns?.isCorrect || false;

            return (
              <div key={q.id} className={`p-3 sm:p-6 rounded-xl sm:rounded-[24px] border-2 transition-all ${isCorrect ? 'bg-green-600/5 border-green-600/20' : 'bg-red-600/5 border-red-600/20'}`}>
                <div className="flex items-start gap-2 sm:gap-4">
                  <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 text-xs sm:text-base ${isCorrect ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 space-y-2 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-4">
                      <p className="text-sm sm:text-lg font-bold text-slate-100">{q.question}</p>
                      <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-slate-800 text-[8px] sm:text-[10px] font-black uppercase text-slate-500 tracking-widest whitespace-nowrap">
                        {q.category}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2">
                      {q.options.map((opt) => {
                        const isSelected = userAns?.selectedOption === opt;
                        const isCorrectOption = q.correctAnswer === opt;

                        let bgColor = 'bg-slate-800/50 border-slate-700';
                        let textColor = 'text-slate-400';

                        if (isCorrectOption) {
                          bgColor = 'bg-green-600/20 border-green-600/50';
                          textColor = 'text-green-400 font-bold';
                        } else if (isSelected && !isCorrect) {
                          bgColor = 'bg-red-600/20 border-red-600/50';
                          textColor = 'text-red-400 font-bold';
                        }

                        return (
                          <div key={opt} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-xs sm:text-sm ${bgColor} ${textColor} flex items-center justify-between`}>
                            <span>{opt}</span>
                            {isSelected && (
                              <span className="text-[8px] sm:text-[10px] uppercase font-black ml-1">{isCorrect ? '✓' : '✗'}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-slate-950/80 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-800/50 shadow-inner">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                        <span className="text-blue-500 text-sm sm:text-base">💡</span>
                        <p className="text-[8px] sm:text-[10px] font-black uppercase text-blue-500 tracking-widest">KIẾN THỨC CỐT LÕI</p>
                      </div>
                      <p className="text-slate-200 text-xs sm:text-sm leading-relaxed font-medium">
                        {q.seriousExplanation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ResultAnalytics;
