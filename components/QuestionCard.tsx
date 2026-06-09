
import React, { useEffect, useState } from 'react';
import { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  currentIndex: number;
  total: number;
  perQuestionTimer?: number;
  onTimeUp?: () => void;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  selectedAnswer,
  onSelect,
  currentIndex,
  total,
  perQuestionTimer,
  onTimeUp,
}) => {
  const [qTimeLeft, setQTimeLeft] = useState(perQuestionTimer ?? 0);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);

  const isMultiAnswer = Array.isArray(question.correctAnswers) && question.correctAnswers.length > 1;
  const requiredCount = isMultiAnswer ? question.correctAnswers!.length : 1;

  useEffect(() => {
    if (perQuestionTimer) setQTimeLeft(perQuestionTimer);
    setMultiSelected([]);
  }, [currentIndex, perQuestionTimer]);

  useEffect(() => {
    if (!perQuestionTimer || selectedAnswer !== null) return;
    if (qTimeLeft <= 0) { onTimeUp?.(); return; }
    const t = setTimeout(() => setQTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [qTimeLeft, perQuestionTimer, selectedAnswer]);

  const timerPct = perQuestionTimer ? (qTimeLeft / perQuestionTimer) * 100 : 100;
  const timerColor = timerPct > 50 ? '#10b981' : timerPct > 25 ? '#f59e0b' : '#ef4444';

  const handleOptionClick = (option: string) => {
    if (selectedAnswer !== null) return;
    if (!isMultiAnswer) { onSelect(option); return; }
    setMultiSelected(prev => {
      if (prev.includes(option)) return prev.filter(o => o !== option);
      if (prev.length < requiredCount) return [...prev, option];
      return [...prev.slice(1), option];
    });
  };

  const handleConfirmMulti = () => {
    if (multiSelected.length !== requiredCount) return;
    onSelect(multiSelected.sort().join('|||'));
  };

  type OptionState = 'default' | 'selected-pending' | 'correct' | 'wrong' | 'reveal-correct';

  const getOptionState = (option: string): OptionState => {
    if (isMultiAnswer) {
      if (selectedAnswer !== null) {
        const chosen = selectedAnswer.split('|||');
        const isCorrectOption = question.correctAnswers!.includes(option);
        const wasChosen = chosen.includes(option);
        if (wasChosen && isCorrectOption) return 'correct';
        if (wasChosen && !isCorrectOption) return 'wrong';
        if (!wasChosen && isCorrectOption) return 'reveal-correct';
        return 'default';
      }
      if (multiSelected.includes(option)) return 'selected-pending';
      return 'default';
    }
    if (selectedAnswer === option) return option === question.correctAnswer ? 'correct' : 'wrong';
    if (selectedAnswer !== null && option === question.correctAnswer) return 'reveal-correct';
    return 'default';
  };

  const optionClass = (state: OptionState) => {
    const base = 'p-3 sm:p-5 rounded-xl sm:rounded-2xl text-left font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98]';
    const cursor = selectedAnswer !== null && !isMultiAnswer ? 'cursor-default opacity-90' : 'cursor-pointer';
    switch (state) {
      case 'correct': return `${base} ${cursor} bg-green-600 text-white shadow-lg shadow-green-900/40`;
      case 'wrong': return `${base} ${cursor} bg-red-600 text-white shadow-lg shadow-red-900/40`;
      case 'reveal-correct': return `${base} ${cursor} bg-green-600/30 text-green-400 border border-green-600`;
      case 'selected-pending': return `${base} ${cursor} bg-blue-600/40 text-white border-2 border-blue-500`;
      default: return `${base} ${cursor} bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600`;
    }
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-3 sm:mb-6 hidden sm:flex justify-between items-end">
        <div>
          <span className="px-2 py-1 rounded bg-slate-800 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 inline-block">
            {question.category} {"•"} {question.difficulty}
          </span>
          <h2 className="text-xl sm:text-2xl font-bold">{"Câu hỏi"} {currentIndex + 1} / {total}</h2>
        </div>
        <div className="text-red-500 font-mono text-lg sm:text-xl font-bold">
          {currentIndex + 1} / {total}
        </div>
      </div>

      <div className="sm:hidden flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-bold text-slate-500 uppercase">{question.category}</span>
        <div className="flex items-center gap-2">
          {perQuestionTimer && (
            <span className="font-mono text-sm font-black" style={{ color: timerColor }}>{qTimeLeft}s</span>
          )}
          <span className="text-red-500 font-mono text-sm font-bold">{currentIndex + 1}/{total}</span>
        </div>
      </div>

      {perQuestionTimer && (
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${timerPct}%`, background: timerColor }} />
        </div>
      )}

      <div className="bg-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl border border-slate-700">
        {question.imageUrl && (
          <div className="mb-4 sm:mb-6 flex justify-center">
            <div className="rounded-xl sm:rounded-2xl overflow-hidden border-2 sm:border-4 border-slate-700 bg-white max-w-[200px] sm:max-w-sm md:max-w-md">
              <img src={question.imageUrl} alt="Question context" className="w-full h-auto object-contain" referrerPolicy="no-referrer" />
            </div>
          </div>
        )}

        {question.instruction && (
          <p className="text-sm sm:text-base font-semibold text-yellow-400 text-center mb-1 sm:mb-2">
            {question.instruction}
          </p>
        )}

        {isMultiAnswer && (
          <div className="flex justify-center mb-2">
            <span className="px-3 py-1 bg-blue-600/20 border border-blue-600/40 text-blue-400 text-xs font-black rounded-full uppercase tracking-wider">
              {"Chọn"} {requiredCount} {"đáp án đúng"}
            </span>
          </div>
        )}

        {/* Ẩn question text nếu trùng với instruction */}
        {!(question.instruction && question.question === question.instruction) && (
          <p className="text-base sm:text-xl md:text-2xl font-semibold mb-4 sm:mb-8 text-center leading-relaxed">
            {!question.instruction && question.type === 'error-finding' && (
              <span className="text-yellow-400">{"Tìm lỗi sai: "}</span>
            )}
            {!question.instruction && question.type === 'image-quiz' && !question.imageUrl && (
              <span className="text-yellow-400">{"Nhìn hình chọn từ: "}</span>
            )}
            {question.question}
          </p>
        )}

        <div className={`grid gap-2 sm:gap-4 ${question.options.length <= 2 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {question.options.filter(opt => opt && opt.trim() !== '').map((option, idx) => {
            const state = getOptionState(option);
            return (
              <button
                key={idx}
                onClick={() => handleOptionClick(option)}
                disabled={selectedAnswer !== null && !isMultiAnswer}
                className={optionClass(state)}
              >
                <div className="flex items-center gap-2 sm:gap-4">
                  <span className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm flex-shrink-0 ${state === 'selected-pending' ? 'bg-blue-600' : 'bg-slate-900/30'}`}>
                    {state === 'selected-pending' ? "✓" : String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm sm:text-base">{option}</span>
                </div>
              </button>
            );
          })}
        </div>

        {isMultiAnswer && selectedAnswer === null && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              {"Đã chọn: "}{multiSelected.length}/{requiredCount}
            </span>
            <button
              onClick={handleConfirmMulti}
              disabled={multiSelected.length !== requiredCount}
              className={`px-6 py-2 rounded-xl font-black text-sm uppercase tracking-wider transition-all ${multiSelected.length === requiredCount ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
            >
              {"XÁC NHẬN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;
