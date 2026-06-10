/**
 * MultiplayerGame - Real-time multiplayer game component
 */

import React, { useEffect, useState } from 'react';
import {
  MultiplayerGameState,
  MultiplayerResult,
  Question,
  UserProfile,
  PlayerInfo
} from '../types';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { DIFFICULTY_MULTIPLIERS, XP_PER_QUESTION } from '../utils/gameLogic';
import { getPlayerId } from '../utils/playerSession';
import QuestionCard from './QuestionCard';
import AvatarDisplay from './AvatarDisplay';

// Icon constants to avoid JSX literal unicode escape issues
const ICON = {
  check: '✓', timer: '⏱', fire: '\u{1F525}', crown: '\u{1F451}', trophy: '\u{1F3C6}',
  silver: '\u{1F948}', bronze: '\u{1F949}', gamepad: '\u{1F3AE}', sparkle: '\u{2728}',
  done: '\u{2705}'
};

/** SVG Icon components — no emoji, consistent rendering */
const IconTarget: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconStar: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
const IconFlame: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 23c-3.866 0-7-3.134-7-7 0-2.812 1.882-5.258 3.168-6.612A1 1 0 019.8 9.6c.268.4.563.913.82 1.508C11.4 8.4 12 6.6 12 4a1 1 0 011.64-.768C16.028 5.15 19 8.75 19 16c0 3.866-3.134 7-7 7z"/>
  </svg>
);
const IconClock: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconCheck: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/** Fancy rank badge — circular with gradient + glow */
const RankBadge: React.FC<{ rank: number; size?: 'sm' | 'md' | 'lg' }> = ({ rank, size = 'md' }) => {
  const sz = size === 'lg' ? 'w-11 h-11 text-base' : size === 'md' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-[11px]';
  const config = rank === 1
    ? { bg: 'bg-gradient-to-b from-yellow-400 to-yellow-600', text: 'text-yellow-950', ring: 'ring-yellow-400/50', shadow: 'shadow-yellow-500/40' }
    : rank === 2
    ? { bg: 'bg-gradient-to-b from-slate-300 to-slate-500', text: 'text-slate-900', ring: 'ring-slate-300/50', shadow: 'shadow-slate-400/30' }
    : rank === 3
    ? { bg: 'bg-gradient-to-b from-amber-500 to-amber-800', text: 'text-amber-100', ring: 'ring-amber-500/40', shadow: 'shadow-amber-600/30' }
    : { bg: 'bg-slate-700', text: 'text-slate-400', ring: 'ring-slate-600/30', shadow: '' };
  return (
    <div className={`${sz} rounded-full ${config.bg} ${config.text} ring-2 ${config.ring} shadow-lg ${config.shadow} flex items-center justify-center font-black flex-shrink-0`}>
      {rank}
    </div>
  );
};

interface MultiplayerGameProps {
  user: UserProfile;
  roomCode: string;
  initialState: MultiplayerGameState;
  questions: Question[];
  isHost: boolean;
  onGameEnd: (results: MultiplayerResult[], myResult: MultiplayerResult) => void;
  onLeave: () => void;
}

const MultiplayerGame: React.FC<MultiplayerGameProps> = ({
  user,
  roomCode,
  initialState,
  questions,
  isHost,
  onGameEnd,
  onLeave
}) => {
  const playerId = getPlayerId();
  const [showResults, setShowResults] = useState(false);
  const [finalResults, setFinalResults] = useState<MultiplayerResult[]>([]);
  const [floatingStreak, setFloatingStreak] = useState<{ id: number; streak: number } | null>(null);
  const [floatingXp, setFloatingXp] = useState<{ id: number } | null>(null);
  const [streakPopKey, setStreakPopKey] = useState(0);
  const floatingStreakCounter = React.useRef(0);
  const floatingXpCounter = React.useRef(0);
  const prevStreakRef = React.useRef(0);

  const {
    gameState,
    currentQuestion,
    currentQuestionIndex,
    selectedAnswer,
    timeLeft,
    gamePhase,
    countdown,
    myPlayer,
    players,
    rankings,
    handleAnswer,
    handleSkipToNext,
    handleStartGame,
    hasFinished,
    error,
    isTransitioning,
    feedbackCountdown
  } = useMultiplayerGame({
    roomCode,
    questions,
    isHost,
    onGameEnd: (results) => {
      setFinalResults(results);
      setShowResults(true);
      const myResult = results.find(r => r.playerId === playerId);
      if (myResult) {
        onGameEnd(results, myResult);
      }
    }
  });

  // Detect streak changes and trigger animations
  useEffect(() => {
    const streak = myPlayer?.streak || 0;
    if (streak > prevStreakRef.current) {
      floatingStreakCounter.current += 1;
      setFloatingStreak({ id: floatingStreakCounter.current, streak });
      setTimeout(() => setFloatingStreak(null), 1000);
      setStreakPopKey(k => k + 1);
      floatingXpCounter.current += 1;
      setFloatingXp({ id: floatingXpCounter.current });
      setTimeout(() => setFloatingXp(null), 1200);
    }
    prevStreakRef.current = streak;
  }, [myPlayer?.streak]);

  // Auto-start game after countdown
  useEffect(() => {
    if (gamePhase === 'countdown' && countdown === 0 && isHost) {
      // Game will transition automatically
    }
  }, [gamePhase, countdown, isHost]);

  // Start game when component mounts (host initiated)
  useEffect(() => {
    if (isHost && gamePhase === 'waiting' && questions.length > 0) {
      handleStartGame();
    }
  }, [isHost, gamePhase, questions.length, handleStartGame]);

  // Countdown screen - show loading when countdown reaches 0 (waiting for phase transition)
  if (gamePhase === 'countdown') {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50">
        <div className="text-center animate-in zoom-in duration-300">
          <p className="text-slate-400 font-bold uppercase tracking-widest mb-4">
            {countdown > 0 ? 'Trận đấu bắt đầu trong' : 'Đang khởi động trận đấu...'}
          </p>
          {countdown > 0 ? (
            <div className="text-[200px] font-black text-red-600 leading-none animate-pulse">
              {countdown}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
              <p className="text-slate-400 font-bold">{'Đang tải câu hỏi...'}</p>
            </div>
          )}
          <p className="text-slate-500 mt-4">
            {players.length} {`người chơi đã sẵn sàng`}
          </p>
        </div>
      </div>
    );
  }

  // Results screen
  if (showResults || gamePhase === 'completed') {
    return (
      <MultiplayerResults
        results={finalResults.length > 0 ? finalResults : rankings.map(r => {
          const diff = gameState?.roomSettings?.difficulty || 'Trung bình';
          const xpPerQ = XP_PER_QUESTION[diff] || 10;
          const baseXp = r.player.correctCount * xpPerQ + r.player.maxStreak * 5;
          const rankBonus = r.rank === 1 ? 100 : 0;
          return {
            rank: r.rank,
            playerId: r.player.id,
            playerName: r.player.name,
            playerAvatar: r.player.avatar,
            playerEquippedFrame: r.player.equippedFrame,
            playerUnlockedFrames: r.player.unlockedFrames,
            score: r.player.score + rankBonus,
            correctCount: r.player.correctCount,
            totalQuestions: gameState?.questions.length || questions.length,
            maxStreak: r.player.maxStreak,
            timeSpent: r.timeSpent,
            xpEarned: baseXp + rankBonus
          };
        })}
        myPlayerId={playerId}
        user={user}
        onLeave={onLeave}
      />
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="text-6xl mb-4">{'😢'}</div>
        <h2 className="text-2xl font-black text-red-500 mb-2">L{'ỗ'}i</h2>
        <p className="text-slate-400 mb-6">{error}</p>
        <button
          onClick={onLeave}
          className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl"
        >
          Quay l{'ạ'}i
        </button>
      </div>
    );
  }

  // Still loading game state from Firebase
  if (!gameState) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <p className="text-slate-400">{'Đ'}ang k{'ế'}t n{'ố'}i...</p>
      </div>
    );
  }

  // Waiting for game to start (but NOT when player has finished or results are showing)
  if ((gamePhase === 'waiting' || !currentQuestion) && !hasFinished && !showResults) {
    // Extra guard: if we already have finalResults, show results instead of waiting
    if (finalResults.length > 0) {
      return (
        <MultiplayerResults
          results={finalResults}
          myPlayerId={playerId}
          user={user}
          onLeave={onLeave}
        />
      );
    }
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <h2 className="text-2xl font-black mb-2">{'Đ'}ang chu{'ẩ'}n b{'ị'} tr{'ậ'}n {'đ'}{'ấ'}u</h2>
        <p className="text-slate-400">Vui l{'ò'}ng {'đ'}{'ợ'}i...</p>
      </div>
    );
  }

  // Main game view
  return (
    <div className="max-w-4xl mx-auto space-y-6 relative">
      {/* Floating XP + Streak animation (combined) */}
      {floatingXp && (
        <div key={floatingXp.id} className="absolute right-4 top-16 z-50 pointer-events-none float-up flex flex-col items-end gap-0.5">
          <span className="text-2xl font-black text-yellow-400 drop-shadow-lg">+XP</span>
          {floatingStreak && floatingStreak.streak >= 2 && (
            <span className="text-sm font-black text-orange-400 drop-shadow-lg">{ICON.fire} STREAK x{floatingStreak.streak}!</span>
          )}
        </div>
      )}
      {/* Game Header */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-[30px] border border-slate-800 backdrop-blur-md relative z-10">
        {/* Timer & Progress */}
        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-xs font-black uppercase text-slate-500 tracking-tighter">
            <div className="flex items-center gap-2">
              <span>C{'â'}u {currentQuestionIndex + 1}/{gameState?.questions.length || questions.length}</span>
              <span className="px-2 py-0.5 bg-blue-600/10 border border-blue-600/20 rounded text-[9px] text-blue-500 font-black">
                TH{'Á'}CH {'Đ'}{'Ấ'}U
              </span>
            </div>
            <span className={`${timeLeft <= 30 ? 'text-red-500' : ''}`}>
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-1000 ${timeLeft <= 30 ? 'bg-red-600' : 'bg-blue-600'}`}
              style={{ width: `${(timeLeft / (gameState?.roomSettings.timeLimit || 300)) * 100}%` }}
            />
          </div>
        </div>

        {/* My Score */}
        <div className="text-center px-4 border-l border-slate-800">
          <p className="text-[10px] font-black uppercase text-slate-500">XP</p>
          <p className="text-2xl font-black text-white">{(myPlayer?.score || 0).toLocaleString()}</p>
        </div>

        {/* Streak */}
        <div className="text-center px-4 border-l border-slate-800 relative group cursor-help">
          <p className="text-[10px] font-black uppercase text-slate-500">Streak</p>
          <p key={streakPopKey} className={`text-2xl font-black text-yellow-500${streakPopKey > 0 ? ' streak-pop' : ''}`}>
            {myPlayer?.streak || 0}{ICON.fire}
          </p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl p-3 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[60] shadow-xl">
            <p className="text-white font-bold text-xs">Tr{'ả'} l{'ờ'}i {'đ'}{'ú'}ng li{'ê'}n ti{'ế'}p {'đ'}{'ể'} nh{'ậ'}n XP th{'ưởng'}.</p>
            <p className="text-yellow-400 font-black text-xs mt-1">STREAK {myPlayer?.streak || 0} = {myPlayer?.streak || 0}*5XP = {(myPlayer?.streak || 0) * 5}XP</p>
          </div>
        </div>
      </div>

      {/* Live Rankings Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Area */}
        <div className="lg:col-span-3">
          {hasFinished ? (
            <div className="space-y-4">
              {/* My stats summary */}
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] text-center">
                <div className="text-5xl mb-3">{ICON.done}</div>
                <h3 className="text-2xl font-black mb-1">Ho{'à'}n th{'à'}nh!</h3>
                <p className="text-slate-400 text-sm">{'Đ'}ang ch{'ờ'} ng{'ườ'}i ch{'ơ'}i kh{'á'}c ho{'à'}n th{'à'}nh...</p>
                <div className="mt-5 flex justify-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-2xl">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <IconTarget className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-green-400 leading-tight">{myPlayer?.correctCount || 0}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{'Đú'}ng</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-2xl">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <IconStar className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-blue-400 leading-tight">{(myPlayer?.score || 0).toLocaleString()}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{'Đi'}{'ể'}m</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-2xl">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <IconFlame className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-orange-400 leading-tight">{myPlayer?.maxStreak || 0}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Streak</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-2 rounded-2xl">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <IconClock className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-purple-400 leading-tight">
                        {myPlayer?.finishedAt && gameState?.startedAt
                          ? `${Math.floor((myPlayer.finishedAt - gameState.startedAt) / 1000)}s`
                          : '--'}
                      </p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Th{'ờ'}i gian</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Temporary leaderboard */}
              <div className="bg-slate-900 border border-slate-800 rounded-[30px] overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
                  <h4 className="font-black text-sm">{ICON.trophy} B{'Ả'}NG X{'Ế'}P H{'Ạ'}NG T{'Ạ'}M TH{'Ờ'}I</h4>
                  <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {'Đ'}ang ch{'ờ'} k{'ế'}t qu{'ả'}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {rankings.map((item, index) => {
                    const p = item.player;
                    const totalQ = gameState?.questions.length || questions.length;
                    const isMe = p.id === playerId;
                    const isPlayerFinished = p.finishedAt !== undefined;
                    const timeSpent = p.finishedAt && gameState?.startedAt
                      ? Math.floor((p.finishedAt - gameState.startedAt) / 1000)
                      : null;
                    // For current user, prefer local user prop (always fresh) over KV data
                    const pFrame = isMe ? user.equippedFrame : p.equippedFrame;
                    const pFrames = isMe ? user.unlockedFrames : p.unlockedFrames;

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-4 py-5 ${isMe ? 'bg-blue-600/10' : ''}`}
                      >
                        {/* Rank badge */}
                        <RankBadge rank={item.rank} size="lg" />

                        {/* Avatar — bigger with frame */}
                        <AvatarDisplay avatar={p.avatar} name={p.name} equippedFrame={pFrame} unlockedFrames={pFrames} size="lg" />

                        {/* Player info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base truncate">{p.name}</span>
                            {isMe && <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">B{'ạ'}n</span>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span className="inline-flex items-center gap-1"><IconTarget className="w-3.5 h-3.5 text-green-400" /> {p.correctCount}/{totalQ}</span>
                            <span className="inline-flex items-center gap-1"><IconFlame className="w-3.5 h-3.5 text-orange-400" /> {p.maxStreak}</span>
                            {timeSpent !== null && <span className="inline-flex items-center gap-1"><IconClock className="w-3.5 h-3.5 text-purple-400" /> {timeSpent}s</span>}
                          </div>
                        </div>

                        {/* Score + Status with XP breakdown tooltip */}
                        <div className="text-right flex-shrink-0 relative group/score cursor-help">
                          <p className="text-xl font-black">{p.score}</p>
                          <p className={`text-[10px] font-bold ${isPlayerFinished ? 'text-green-500' : 'text-yellow-500'}`}>
                            {isPlayerFinished ? `Hoàn thành` : `Đang chơi...`}
                          </p>
                          {/* XP breakdown tooltip */}
                          {(() => {
                            const pStreakBonus = p.maxStreak * 5;
                            const pCorrectXp = p.score - pStreakBonus;
                            const pXpPerQ = p.correctCount > 0 ? Math.round(pCorrectXp / p.correctCount) : 0;
                            return (
                              <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-800 border border-slate-700 rounded-xl p-3 text-left opacity-0 group-hover/score:opacity-100 transition-opacity pointer-events-none z-[60] shadow-xl">
                                <p className="text-white font-bold text-[10px] mb-2">{'Chi tiết XP'}</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400">{'Câu đúng'}</span>
                                    <span className="text-white font-black">{p.correctCount} {'×'} {pXpPerQ}XP = {pCorrectXp}XP</span>
                                  </div>
                                  <div className="flex justify-between text-[10px]">
                                    <span className="text-slate-400">{'Streak bonus'}</span>
                                    <span className="text-orange-400 font-black">{p.maxStreak} {'×'} 5XP = {pStreakBonus}XP</span>
                                  </div>
                                  <div className="flex justify-between text-[10px] pt-1 border-t border-slate-700">
                                    <span className="text-slate-400 font-bold">{'Tổng'}</span>
                                    <span className="text-yellow-400 font-black">{p.score}XP</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : isTransitioning ? (
            // Loading screen between questions
            <div className="bg-slate-900 border border-slate-800 p-16 rounded-[40px] text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-400 font-bold">{'Đ'}ang chuy{'ể'}n c{'â'}u h{'ỏ'}i...</p>
            </div>
          ) : (
            <>
              <QuestionCard
                key={`question-${currentQuestionIndex}`}
                question={currentQuestion}
                currentIndex={currentQuestionIndex}
                total={gameState?.questions.length || questions.length}
                selectedAnswer={selectedAnswer}
                onSelect={handleAnswer}
              />

              {/* Answer Feedback */}
              {selectedAnswer && (
                <div className={`mt-4 p-6 rounded-[30px] text-center animate-in slide-in-from-bottom-4 ${
                  selectedAnswer === currentQuestion.correctAnswer
                    ? 'bg-green-600/10 border border-green-600/30'
                    : 'bg-red-600/10 border border-red-600/30'
                }`}>
                  <span className={`text-xl font-black ${
                    selectedAnswer === currentQuestion.correctAnswer
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`}>
                    {selectedAnswer === currentQuestion.correctAnswer
                      ? `${ICON.check} Chính xác!`
                      : `✗ Đáp án đúng: ${currentQuestion.correctAnswer}`}
                  </span>
                  {/* Countdown + Skip button */}
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      onClick={handleSkipToNext}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full transition-colors flex items-center gap-2"
                    >
                      {currentQuestionIndex + 1 < (gameState?.questions.length || questions.length)
                        ? `Câu tiếp →`
                        : `Xem kết quả →`}
                      {feedbackCountdown > 0 && (
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-800 rounded-full text-xs">
                          {feedbackCountdown}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Live Leaderboard — only visible during gameplay, hidden when finished (temp leaderboard shown instead) */}
        {!hasFinished && (
          <div className="lg:col-span-1">
            <div className="bg-slate-900 border border-slate-800 rounded-[20px] overflow-hidden sticky top-4">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
                <h4 className="font-black text-sm text-center">{ICON.trophy} B{'Ả'}NG X{'Ế'}P H{'Ạ'}NG</h4>
              </div>
              <div className="divide-y divide-slate-800/50">
                {rankings.slice(0, 6).map((item, index) => {
                  const p = item.player;
                  const isMe = p.id === playerId;
                  const totalQ = gameState?.questions.length || 0;
                  const isPlayerFinished = p.finishedAt !== undefined;
                  const sFrame = isMe ? user.equippedFrame : p.equippedFrame;
                  const sFrames = isMe ? user.unlockedFrames : p.unlockedFrames;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-blue-600/10' : ''}`}
                    >
                      <RankBadge rank={index + 1} size="sm" />
                      <AvatarDisplay avatar={p.avatar} name={p.name} equippedFrame={sFrame} unlockedFrames={sFrames} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm truncate">{p.name}</span>
                          {isMe && <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">{'Bạn'}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                          <span className="inline-flex items-center gap-0.5"><IconTarget className="w-3 h-3 text-green-400" /> {p.correctCount}/{totalQ}</span>
                          <span className="inline-flex items-center gap-0.5"><IconFlame className="w-3 h-3 text-orange-400" /> {p.maxStreak}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-sm">{p.score.toLocaleString()}</p>
                        <p className={`text-[9px] font-bold ${isPlayerFinished ? 'text-green-500' : 'text-yellow-500'}`}>
                          {isPlayerFinished ? 'Hoàn thành' : `${p.currentQuestionIndex}/${totalQ}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// Results Component
interface MultiplayerResultsProps {
  results: MultiplayerResult[];
  myPlayerId: string;
  user: UserProfile;
  onLeave: () => void;
}

const MultiplayerResults: React.FC<MultiplayerResultsProps> = ({
  results,
  myPlayerId,
  user,
  onLeave
}) => {
  const [expandedPlayer, setExpandedPlayer] = React.useState<string | null>(null);
  const myResult = results.find(r => r.playerId === myPlayerId);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Winner Announcement */}
      <div className="text-center py-8">
        {myResult?.rank === 1 ? (
          <>
            <div className="text-8xl mb-4">{ICON.trophy}</div>
            <h1 className="text-5xl font-black text-yellow-500 mb-2">{`CHIẾN THẮNG!`}</h1>
            <p className="text-slate-400 text-xl">{`Bạn là nhà vô địch!`}</p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">
              {myResult?.rank === 2 ? ICON.silver : myResult?.rank === 3 ? ICON.bronze : ICON.gamepad}
            </div>
            <h1 className="text-4xl font-black mb-2">{`KẾT THÚC!`}</h1>
            <p className="text-slate-400">
              {`Hạng`} {myResult?.rank || '-'} / {results.length} {`người chơi`}
            </p>
          </>
        )}
      </div>

      {/* My Stats */}
      {myResult && (() => {
        const streakBonus = myResult.maxStreak * 5;
        const correctXp = myResult.score - streakBonus;
        const xpPerQ = myResult.correctCount > 0 ? Math.round(correctXp / myResult.correctCount) : 0;
        const rankBonus = myResult.rank === 1 ? 50 : 0;
        const avgTime = Math.floor(myResult.timeSpent / 1000 / myResult.totalQuestions);
        const accuracy = myResult.totalQuestions > 0 ? Math.round((myResult.correctCount / myResult.totalQuestions) * 100) : 0;
        return (
          <div className="bg-slate-900 border border-blue-600/30 p-4 sm:p-6 rounded-[30px]">
            {/* Header with formula tooltip */}
            <div className="relative group/xp cursor-help mb-3 sm:mb-4 text-center">
              <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] inline-flex items-center gap-1">
                {'TỔNG XP NHẬN ĐƯỢC'}
                <span className="text-slate-600 group-hover/xp:text-slate-400 transition-colors">{'ⓘ'}</span>
              </p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl p-3 text-left opacity-0 group-hover/xp:opacity-100 transition-opacity pointer-events-none z-[60] shadow-xl">
                <p className="text-white font-bold text-[10px] sm:text-xs leading-relaxed">
                  {'XP nhận được = (Số câu đúng × XP/câu)'}
                  <br/>
                  {'+ (Streak cao nhất × 5XP)'}
                  <br/>
                  {'+ Điểm thưởng xếp hạng'}
                </p>
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400">
                    {'Dễ: '}<span className="text-green-400">{'10XP/câu'}</span>{' · TB: '}<span className="text-yellow-400">{'12XP/câu'}</span>{' · Khó: '}<span className="text-red-400">{'15XP/câu'}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed breakdown */}
            <div className="space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">{'Tổng số câu trả lời đúng'}</span>
                <span className="text-xs sm:text-sm font-black text-white">{myResult.correctCount}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">{'XP mỗi câu đúng'}</span>
                <span className="text-xs sm:text-sm font-black text-white">{xpPerQ}XP</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">{'Streak cao nhất'}</span>
                <span className="text-xs sm:text-sm font-black text-orange-400">{myResult.maxStreak}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b border-slate-800/50">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">{'Điểm thưởng xếp hạng thách đấu'}</span>
                <span className="text-xs sm:text-sm font-black text-green-500">{rankBonus}XP</span>
              </div>
            </div>

            {/* Total + bottom stats */}
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t-2 border-slate-800 flex flex-col items-center">
              <p className="text-3xl sm:text-5xl font-black text-yellow-500 tracking-tighter">+{myResult.xpEarned}</p>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full mt-3 sm:mt-4">
                <div className="text-center">
                  <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">{'CHÍNH XÁC'}</p>
                  <p className="text-xs sm:text-sm font-black text-white">{accuracy}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">{'STREAK'}</p>
                  <p className="text-xs sm:text-sm font-black text-white">{myResult.maxStreak}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] sm:text-[9px] font-black uppercase text-slate-500">{'TG/CÂU'}</p>
                  <p className="text-xs sm:text-sm font-black text-white">{avgTime}s</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full Rankings */}
      <div className="bg-slate-900 border border-slate-800 rounded-[30px] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="font-black text-lg">{`BẢNG XẾP HẠNG CHUNG CUỘC`}</h3>
        </div>
        <div className="divide-y divide-slate-800">
          {results.map((result, index) => {
            const isExpanded = expandedPlayer === result.playerId;
            const accuracy = result.totalQuestions > 0
              ? Math.round((result.correctCount / result.totalQuestions) * 100)
              : 0;
            return (
              <div key={result.playerId}>
                <div
                  className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-800/30 transition-all ${
                    result.playerId === myPlayerId ? 'bg-blue-600/5' : ''
                  }`}
                  onClick={() => setExpandedPlayer(isExpanded ? null : result.playerId)}
                >
                  {/* Rank badge + Avatar */}
                  <RankBadge rank={index + 1} />
                  <AvatarDisplay
                    avatar={result.playerAvatar || ''}
                    name={result.playerName}
                    equippedFrame={result.playerId === myPlayerId ? (user.equippedFrame || result.playerEquippedFrame) : result.playerEquippedFrame}
                    unlockedFrames={result.playerId === myPlayerId ? (user.unlockedFrames || result.playerUnlockedFrames) : result.playerUnlockedFrames}
                    size="md"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base truncate">{result.playerName}</span>
                      {result.playerId === myPlayerId && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-[9px] font-black rounded flex-shrink-0">
                          {`BẠN`}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                      <span className="inline-flex items-center gap-1"><IconTarget className="w-3.5 h-3.5 text-green-400" /> {result.correctCount}/{result.totalQuestions}</span>
                      <span className="inline-flex items-center gap-1"><IconFlame className="w-3.5 h-3.5 text-orange-400" /> {result.maxStreak}</span>
                      <span className="inline-flex items-center gap-1"><IconClock className="w-3.5 h-3.5 text-purple-400" /> {Math.floor(result.timeSpent / 1000)}s</span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-xl font-black">{result.score.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase">XP</p>
                    </div>
                    <span className="text-slate-600 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="bg-slate-950/60 px-6 py-4 border-t border-slate-800/50 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-lg font-black text-green-400">{accuracy}%</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{`Chính xác`}</p>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-lg font-black text-yellow-400">{result.maxStreak}{ICON.fire}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{`Streak cao nhất`}</p>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-lg font-black text-blue-400">+{result.xpEarned}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{`XP nhận được`}</p>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3">
                        <p className="text-lg font-black text-purple-400">{Math.floor(result.timeSpent / 1000)}s</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{`Thời gian`}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onLeave}
          className="flex-1 py-4 bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-700 transition-colors"
        >
          {`VỀ TRANG CHỦ`}
        </button>
      </div>
    </div>
  );
};

export default MultiplayerGame;
