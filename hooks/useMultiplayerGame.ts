/**
 * useMultiplayerGame - Hook for multiplayer game logic
 * Handles realtime sync, answers submission, and game state
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MultiplayerGameState,
  PlayerInfo,
  Question,
  GamePhase,
  MultiplayerResult,
  Difficulty
} from '../types';
import {
  subscribeToRoom,
  submitAnswer,
  startGame,
  endGame,
  getRoomState,
  calculateRankings,
  updatePlayerActivity,
  transitionToPlaying
} from '../utils/multiplayerSync';
import { getPlayerId, clearActiveRoom } from '../utils/playerSession';
import { playSound, XP_PER_QUESTION } from '../utils/gameLogic';

interface UseMultiplayerGameProps {
  roomCode: string;
  questions: Question[];
  isHost: boolean;
  onGameEnd?: (results: MultiplayerResult[]) => void;
}

interface UseMultiplayerGameReturn {
  // State
  gameState: MultiplayerGameState | null;
  currentQuestion: Question | null;
  currentQuestionIndex: number;
  selectedAnswer: string | null;
  timeLeft: number;
  gamePhase: GamePhase;
  countdown: number;

  // Player data
  myPlayer: PlayerInfo | null;
  players: PlayerInfo[];
  rankings: Array<{ rank: number; player: PlayerInfo; timeSpent: number }>;

  // Actions
  handleAnswer: (answer: string) => void;
  handleSkipToNext: () => void;
  handleStartGame: () => Promise<boolean>;
  handleEndGame: () => Promise<void>;

  // Status
  isLoading: boolean;
  error: string | null;
  isMyTurn: boolean;
  hasFinished: boolean;
  isTransitioning: boolean;
  feedbackCountdown: number;
}

export function useMultiplayerGame({
  roomCode,
  questions,
  isHost,
  onGameEnd
}: UseMultiplayerGameProps): UseMultiplayerGameReturn {
  const playerId = getPlayerId();

  // Game state
  const [gameState, setGameState] = useState<MultiplayerGameState | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [countdown, setCountdown] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transition state: 'none' | 'showing_answer' | 'loading' | 'ready'
  const [transitionState, setTransitionState] = useState<'none' | 'showing_answer' | 'loading' | 'ready'>('none');

  // Feedback countdown (seconds remaining before auto-advance)
  const [feedbackCountdown, setFeedbackCountdown] = useState(0);

  // Track the displayed question index (controls what the UI shows)
  const [displayedQuestionIndex, setDisplayedQuestionIndex] = useState(0);

  // Refs for cleanup
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const lastProcessedUpdateRef = useRef<number>(0);
  const activityIntervalRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameEndCalledRef = useRef(false);

  // Refs for values needed in subscription callback
  const transitionStateRef = useRef(transitionState);
  const displayedQuestionIndexRef = useRef(displayedQuestionIndex);

  // Keep refs in sync
  useEffect(() => {
    transitionStateRef.current = transitionState;
  }, [transitionState]);

  useEffect(() => {
    displayedQuestionIndexRef.current = displayedQuestionIndex;
  }, [displayedQuestionIndex]);

  // Subscribe to room updates
  useEffect(() => {
    if (!roomCode) return;

    subscriptionRef.current = subscribeToRoom(roomCode, (state, source) => {
      if (!state) {
        setError('Phòng đã bị đóng');
        clearActiveRoom();
        return;
      }

      // Skip stale updates
      if (state.lastUpdate <= lastProcessedUpdateRef.current) {
        return;
      }
      lastProcessedUpdateRef.current = state.lastUpdate;

      setGameState(state);

      // Sync local state with server (only when not in transition)
      const myPlayer = state.players[playerId];
      if (myPlayer && transitionStateRef.current === 'none') {
        // Only sync if server is ahead (reconnection scenario)
        if (myPlayer.currentQuestionIndex > displayedQuestionIndexRef.current) {
          setDisplayedQuestionIndex(myPlayer.currentQuestionIndex);
        }
      }

      // Handle phase changes
      if (state.gamePhase === 'playing' && state.startedAt) {
        const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        const remaining = Math.max(0, state.roomSettings.timeLimit - elapsed);
        setTimeLeft(remaining);
      }

      // Handle game completion (only once)
      if (state.gamePhase === 'completed' && onGameEnd && !gameEndCalledRef.current) {
        gameEndCalledRef.current = true;
        const rankings = calculateRankings(state);
        const totalPlayers = rankings.length;
        const results: MultiplayerResult[] = rankings.map(r => {
          // Quy định 3.2: Thách đấu (1:1 hoặc nhóm) — rank 1 được +100 XP.
          // Yêu cầu totalPlayers >= 2 để loại trường hợp một mình (không phải thách đấu thật).
          const rankBonus = r.rank === 1 && totalPlayers >= 2 ? 100 : 0;
          const baseXp = calculateXp(r.player.correctCount, r.player.maxStreak, state.roomSettings.difficulty);
          return {
            rank: r.rank,
            playerId: r.player.id,
            playerName: r.player.name,
            playerAvatar: r.player.avatar,
            playerEquippedFrame: r.player.equippedFrame,
            playerUnlockedFrames: r.player.unlockedFrames,
            score: r.player.score + rankBonus,
            correctCount: r.player.correctCount,
            totalQuestions: state.questions.length,
            maxStreak: r.player.maxStreak,
            timeSpent: r.timeSpent,
            xpEarned: baseXp + rankBonus
          };
        });
        onGameEnd(results);
      }
    });

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, [roomCode, playerId, onGameEnd]);

  // Countdown timer (before game starts)
  useEffect(() => {
    if (gameState?.gamePhase !== 'countdown') return;

    console.log('[useMultiplayerGame] Starting countdown, isHost:', isHost);
    setCountdown(3);

    // Flag to track if we've already triggered transition
    let transitionTriggered = false;

    countdownRef.current = window.setInterval(() => {
      setCountdown(prev => {
        console.log('[useMultiplayerGame] Countdown:', prev);
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);

          // Only host triggers transition to prevent race conditions
          if (!transitionTriggered && isHost) {
            transitionTriggered = true;
            console.log('[useMultiplayerGame] Host triggering transition to playing');
            transitionToPlaying(roomCode).then(result => {
              console.log('[useMultiplayerGame] Transition result:', result);
            }).catch(err => {
              console.error('[useMultiplayerGame] Transition error:', err);
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [gameState?.gamePhase, roomCode]);

  // Game timer - sync from server startedAt to survive reload
  useEffect(() => {
    if (gameState?.gamePhase !== 'playing' || !gameState?.startedAt) return;

    const timeLimit = gameState.roomSettings.timeLimit || 300;
    const startedAt = gameState.startedAt;

    // Calculate correct remaining time from server timestamp
    const calcRemaining = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      return Math.max(0, timeLimit - elapsed);
    };

    // Set initial value from server
    setTimeLeft(calcRemaining());

    timerRef.current = window.setInterval(() => {
      const remaining = calcRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (isHost) {
          endGame(roomCode);
        }
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.gamePhase, gameState?.startedAt, isHost, roomCode]);

  // Keep-alive activity updates
  useEffect(() => {
    if (gameState?.gamePhase !== 'playing') return;

    activityIntervalRef.current = window.setInterval(() => {
      updatePlayerActivity(roomCode, playerId);
    }, 10000); // Update every 10 seconds

    return () => {
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
    };
  }, [gameState?.gamePhase, roomCode, playerId]);

  // Handle answer submission
  const handleAnswer = useCallback(async (answer: string) => {
    // Block if already answered or in transition
    if (!gameState || selectedAnswer || gameState.gamePhase !== 'playing' || transitionState !== 'none') return;

    const currentQ = gameState.questions[displayedQuestionIndex];
    if (!currentQ) return;

    setSelectedAnswer(answer);
    setTransitionState('showing_answer');
    const isCorrect = answer === currentQ.correctAnswer;
    playSound(isCorrect);

    // Calculate score using XP per question based on difficulty
    const xpPerQ = XP_PER_QUESTION[gameState.roomSettings.difficulty] || 10;
    const scoreEarned = isCorrect ? xpPerQ : 0;

    // Submit to server
    await submitAnswer(roomCode, playerId, displayedQuestionIndex, isCorrect, scoreEarned);

    // Store the next index to move to
    const nextIndex = displayedQuestionIndex + 1;
    const hasMoreQuestions = nextIndex < gameState.questions.length;

    // Show answer feedback with countdown
    const FEEDBACK_DURATION = 4; // seconds
    setFeedbackCountdown(FEEDBACK_DURATION);

    // Countdown interval
    const countdownInterval = setInterval(() => {
      setFeedbackCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    feedbackCountdownIntervalRef.current = countdownInterval;

    // Auto-advance after countdown
    const timer = setTimeout(() => {
      if (hasMoreQuestions) {
        console.log('[handleAnswer] Step 1: Show loading, hide question. Current:', displayedQuestionIndex);
        setTransitionState('loading');
      } else {
        console.log('[handleAnswer] Last question completed');
        setSelectedAnswer(null);
        setTransitionState('none');
      }
      setFeedbackCountdown(0);
    }, FEEDBACK_DURATION * 1000);
    feedbackTimerRef.current = timer;
  }, [gameState, selectedAnswer, displayedQuestionIndex, roomCode, playerId, transitionState]);

  // Skip to next question immediately
  const handleSkipToNext = useCallback(() => {
    if (transitionState !== 'showing_answer' || !gameState) return;

    // Clear pending timers
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (feedbackCountdownIntervalRef.current) clearInterval(feedbackCountdownIntervalRef.current);
    setFeedbackCountdown(0);

    const nextIndex = displayedQuestionIndex + 1;
    const hasMoreQuestions = nextIndex < gameState.questions.length;

    if (hasMoreQuestions) {
      setTransitionState('loading');
    } else {
      setSelectedAnswer(null);
      setTransitionState('none');
    }
  }, [transitionState, gameState, displayedQuestionIndex]);

  // Effect to handle question transition when loading state is active
  useEffect(() => {
    if (transitionState !== 'loading' || !gameState) return;

    console.log('[Transition Effect] Loading state active, preparing next question...');

    // First, clear the answer while showing loading
    setSelectedAnswer(null);

    const nextIndex = displayedQuestionIndex + 1;

    // After a brief delay, update displayed question and show it
    const timer = setTimeout(() => {
      console.log('[Transition Effect] Step 2: Update displayed question to:', nextIndex);
      setDisplayedQuestionIndex(nextIndex);
      setTransitionState('ready');
    }, 150);

    return () => clearTimeout(timer);
  }, [transitionState, gameState, displayedQuestionIndex]);

  // Effect to complete transition after question is ready
  useEffect(() => {
    if (transitionState !== 'ready') return;

    console.log('[Transition Effect] Step 3: Question ready, completing transition');

    // Small delay to ensure React has rendered the new question
    const timer = setTimeout(() => {
      setTransitionState('none');
    }, 50);

    return () => clearTimeout(timer);
  }, [transitionState]);

  // Start game (host only)
  const handleStartGame = useCallback(async (): Promise<boolean> => {
    if (!isHost || !questions.length) return false;

    setIsLoading(true);
    const success = await startGame(roomCode, playerId, questions);
    setIsLoading(false);

    if (!success) {
      setError('Không thể bắt đầu trận đấu');
    }

    return success;
  }, [isHost, questions, roomCode, playerId]);

  // End game
  const handleEndGame = useCallback(async () => {
    await endGame(roomCode);
  }, [roomCode]);

  // Derived values
  const myPlayer = gameState?.players[playerId] || null;
  const players: PlayerInfo[] = gameState ? Object.values(gameState.players) as PlayerInfo[] : [];
  // Use displayedQuestionIndex for the question shown to user
  const currentQuestion = gameState?.questions[displayedQuestionIndex] || null;
  const hasFinished = myPlayer?.finishedAt !== undefined;
  const rankings = gameState ? calculateRankings(gameState) : [];

  // isTransitioning = true when loading screen should be shown
  const isTransitioning = transitionState === 'loading';

  return {
    gameState,
    currentQuestion,
    currentQuestionIndex: displayedQuestionIndex, // Return displayed index to UI
    selectedAnswer,
    timeLeft,
    gamePhase: gameState?.gamePhase || 'waiting',
    countdown,
    myPlayer,
    players,
    rankings,
    handleAnswer,
    handleSkipToNext,
    handleStartGame,
    handleEndGame,
    isLoading,
    error,
    isMyTurn: true, // In this mode, all players answer simultaneously
    hasFinished,
    isTransitioning,
    feedbackCountdown
  };
}

// Helper function to calculate XP
function calculateXp(correctCount: number, maxStreak: number, difficulty: Difficulty): number {
  const xpPerQ = XP_PER_QUESTION[difficulty] || 10;
  return correctCount * xpPerQ + maxStreak * 5;
}

export default useMultiplayerGame;
