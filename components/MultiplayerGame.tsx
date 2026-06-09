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
import { DIFFICULTY_MULTIPLIERS } from '../utils/gameLogic';
import { getPlayerId } from '../utils/playerSession';
import QuestionCard from './QuestionCard';
import AvatarDisplay from './AvatarDisplay';

// Icon constants to avoid JSX literal unicode escape issues
const ICON = { check: '✓', timer: '⏱', fire: '🔥', crown: '👑', trophy: '🏆' };

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
        results={finalResults.length > 0 ? finalResults : rankings.map(r => ({
          rank: r.rank,
          playerId: r.player.id,
          playerName: r.player.name,
          playerAvatar: r.player.avatar,
          score: r.player.score,
          correctCount: r.player.correctCount,
          totalQuestions: gameState?.questions.length || questions.length,
          maxStreak: r.player.maxStreak,
          timeSpent: r.timeSpent,
          xpEarned: 0
        }))}
        myPlayerId={playerId}
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
      <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-[30px] border border-slate-800 backdrop-blur-md">
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
                <div className="text-5xl mb-3">{'✅'}</div>
                <h3 className="text-2xl font-black mb-1">Ho{'à'}n th{'à'}nh!</h3>
                <p className="text-slate-400 text-sm">{'Đ'}ang ch{'ờ'} ng{'ườ'}i ch{'ơ'}i kh{'á'}c ho{'à'}n th{'à'}nh...</p>
                <div className="mt-5 flex justify-center gap-6">
                  <div className="text-center">
                    <p className="text-3xl font-black text-green-500">{myPlayer?.correctCount || 0}<span className="text-lg text-slate-500">/{gameState?.questions.length || questions.length}</span></p>
                    <p className="text-xs text-slate-500 font-bold">{'Đú'}ng</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-black text-blue-500">{(myPlayer?.score || 0).toLocaleString()}</p>
                    <p className="text-xs text-slate-500 font-bold">XP</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-black text-yellow-500">{myPlayer?.maxStreak || 0}</p>
                    <p className="text-xs text-slate-500 font-bold">Chu{'ỗ'}i max</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-black text-purple-400">
                      {myPlayer?.finishedAt && gameState?.startedAt
                        ? `${Math.floor((myPlayer.finishedAt - gameState.startedAt) / 1000)}s`
                        : '--'}
                    </p>
                    <p className="text-xs text-slate-500 font-bold">Th{'ờ'}i gian</p>
                  </div>
                </div>
              </div>

              {/* Temporary leaderboard */}
              <div className="bg-slate-900 border border-slate-800 rounded-[30px] overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
                  <h4 className="font-black text-sm">{ICON.trophy} B{'Ả'}NG X{'Ế'}P H{'Ạ'}NG T{'Ạ'}M TH{'Ọ'}I</h4>
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

                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 px-4 py-4 ${isMe ? 'bg-blue-600/10' : ''}`}
                      >
                        {/* Rank badge */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${
                          index === 0 ? 'bg-yellow-500 text-black' :
                          index === 1 ? 'bg-slate-400 text-black' :
                          index === 2 ? 'bg-amber-700 text-white' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {item.rank}
                        </div>

                        {/* Avatar */}
                        <AvatarDisplay avatar={p.avatar} name={p.name} size="md" />

                        {/* Player info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm truncate">{p.name}</span>
                            {isMe && <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">B{'ạ'}n</span>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            <span>{ICON.check} {p.correctCount}/{totalQ}</span>
                            <span>{ICON.fire} {p.maxStreak}</span>
                            {timeSpent !== null && <span>{ICON.timer} {timeSpent}s</span>}
                          </div>
                        </div>

                        {/* Score + Status */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-black">{p.score}</p>
                          <p className={`text-[10px] font-bold ${isPlayerFinished ? 'text-green-500' : 'text-yellow-500'}`}>
                            {isPlayerFinished ? `Hoàn thành` : `${p.currentQuestionIndex}/${totalQ}`}
                          </p>
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

        {/* Live Leaderboard */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-[20px] overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50">
              <h4 className="font-black text-sm text-center">{ICON.trophy} B{'Ả'}NG X{'Ế'}P H{'Ạ'}NG</h4>
            </div>
            <div className="divide-y divide-slate-800/50">
              {rankings.slice(0, 6).map((item, index) => (
                <div
                  key={item.player.id}
                  className={`flex items-center gap-2 px-3 py-2.5 ${
                    item.player.id === playerId ? 'bg-blue-600/10' : ''
                  }`}
                >
                  <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-full flex-shrink-0 ${
                    index === 0 ? 'bg-yellow-500 text-black' :
                    index === 1 ? 'bg-gray-400 text-black' :
                    index === 2 ? 'bg-orange-600 text-white' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {index + 1}
                  </span>
                  <AvatarDisplay avatar={item.player.avatar} name={item.player.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">
                      {item.player.name}
                      {item.player.id === playerId && ` (Bạn)`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-sm">{item.player.score.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-500">
                      {item.player.currentQuestionIndex}/{gameState?.questions.length || 0}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// Results Component
interface MultiplayerResultsProps {
  results: MultiplayerResult[];
  myPlayerId: string;
  onLeave: () => void;
}

const MultiplayerResults: React.FC<MultiplayerResultsProps> = ({
  results,
  myPlayerId,
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
              {myResult?.rank === 2 ? '🥈' : myResult?.rank === 3 ? '🥉' : '🎮'}
            </div>
            <h1 className="text-4xl font-black mb-2">{`KẾT THÚC!`}</h1>
            <p className="text-slate-400">
              {`Hạng`} {myResult?.rank || '-'} / {results.length} {`người chơi`}
            </p>
          </>
        )}
      </div>

      {/* My Stats */}
      {myResult && (
        <div className="bg-slate-900 border border-blue-600/30 p-6 rounded-[30px]">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-3xl font-black text-green-500">{myResult.correctCount}</p>
              <p className="text-xs text-slate-500 font-bold mt-1">{`Trả lời đúng`}</p>
            </div>
            <div>
              <p className="text-3xl font-black text-blue-500">{myResult.score}</p>
              <p className="text-xs text-slate-500 font-bold mt-1">{`Tổng XP`}</p>
            </div>
            <div>
              <p className="text-3xl font-black text-yellow-500">{myResult.maxStreak}</p>
              <p className="text-xs text-slate-500 font-bold mt-1">{`Chuỗi max`}</p>
            </div>
            <div>
              <p className="text-3xl font-black text-purple-500">
                {Math.floor(myResult.timeSpent / 1000)}s
              </p>
              <p className="text-xs text-slate-500 font-bold mt-1">{`Thời gian`}</p>
            </div>
          </div>
        </div>
      )}

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
                  {/* Avatar with rank badge */}
                  <div className="relative flex-shrink-0">
                    <AvatarDisplay avatar={result.playerAvatar || ''} name={result.playerName} size="md" />
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-slate-900 ${
                      index === 0 ? 'bg-yellow-500 text-black' :
                      index === 1 ? 'bg-gray-400 text-black' :
                      index === 2 ? 'bg-orange-600 text-white' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {index === 0 ? ICON.crown : index + 1}
                    </div>
                  </div>

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
                      <span>{ICON.check} {result.correctCount}/{result.totalQuestions}</span>
                      <span>{ICON.fire} {result.maxStreak}</span>
                      <span>{ICON.timer} {Math.floor(result.timeSpent / 1000)}s</span>
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
