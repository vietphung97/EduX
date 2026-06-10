
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import AvatarDisplay from './components/AvatarDisplay';

const QuestionCard = lazy(() => import('./components/QuestionCard'));
const ResultAnalytics = lazy(() => import('./components/ResultAnalytics'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const HistoryPage = lazy(() => import('./components/HistoryPage'));
const MultiplayerLobby = lazy(() => import('./components/MultiplayerLobby'));
const MultiplayerGame = lazy(() => import('./components/MultiplayerGame'));
const StatsPage = lazy(() => import('./components/StatsPage'));
const RewardsPage = lazy(() => import('./components/RewardsPage'));
const CertificatePage = lazy(() => import('./components/CertificatePage'));
const RoadmapPage = lazy(() => import('./components/RoadmapPage'));
import {
  Difficulty,
  UserLevel,
  UserProfile,
  Question,
  GameResult,
  RoomMember,
  UserAnswer,
  GameHistory,
  EdusoUserData,
  MultiplayerGameState,
  MultiplayerResult
} from './types';
import { DEFAULT_GRADES, DEFAULT_TOPICS_BY_GRADE, LEVEL_CONFIG, WEEKLY_FRAMES, getCurrentProgramWeek } from './constants';
import { TopicsByGrade, fetchQuestionsFromSheet } from './services/sheets';
import { fetchK9Questions, getK9Topics } from './services/k9Questions';
import { fetchK6Questions, getK6Difficulties } from './services/k6Questions';
import { fetchK7Questions, getK7Difficulties } from './services/k7Questions';
import { fetchK8Questions, getK8Difficulties, getK8Topics } from './services/k8Questions';
import {
  getLeaderboard,
  getLeaderboardByGrade,
  getWeeklyLeaderboard,
  getUserProfile,
  upsertUserProfile,
  saveGameHistory as saveGameHistoryToSupabase,
  getGameHistory as getGameHistoryFromSupabase,
  migrateAllUsersGradeXp,
  recalculateAllUsersXp,
  getUserRank,
  getWeeklyUserRank
} from './services/supabase';

// Export migration function to window for one-time console run
(window as any).migrateGradeXp = migrateAllUsersGradeXp;
import { calculateDetailedXp, playSound, getLevelFromXp, generateRoomCode, DIFFICULTY_MULTIPLIERS, XP_PER_QUESTION } from './utils/gameLogic';
import { checkNewUnlocks, isFrameUsable } from './utils/frameLogic';
import { generateQuestions, getExpertAnalysis } from './services/gemini';
import { sendGameResultToEduso, createEndGameParams } from './utils/edusoApi';
import { startGame as startMultiplayerGame } from './utils/multiplayerSync';
import { getPlayerId, clearActiveRoom, checkRejoinableRoom, updateActiveRoomPhase } from './utils/playerSession';

/**
 * Reset weeklyXp khi tuần chương trình thay đổi.
 * Mỗi tuần có bộ milestone riêng — không được dùng XP tuần cũ để unlock tuần mới.
 */
function normalizeWeeklyXp(profile: UserProfile): UserProfile {
  const currentWeek = getCurrentProgramWeek();
  if (currentWeek === null) return profile; // Ngoài chương trình — giữ nguyên
  if (profile.weeklyXpWeek === currentWeek) return profile; // Cùng tuần — OK
  if (profile.weeklyXpWeek != null && profile.weeklyXpWeek !== currentWeek) {
    // Tuần đã đổi → reset weeklyXp
    return { ...profile, weeklyXp: 0, weeklyXpWeek: currentWeek };
  }
  // weeklyXpWeek chưa set (user cũ / load từ Supabase) → giữ weeklyXp, gán tuần
  return { ...profile, weeklyXpWeek: currentWeek };
}

/** ── Leaderboard Components — shield badges + ranked avatar frames ── */

/** Shield-shaped rank badge for top 3, simple circle for 4+ */
const LbRankBadge: React.FC<{ rank: number; size?: 'sm' | 'md' | 'lg' }> = ({ rank, size = 'md' }) => {
  const dim = size === 'lg' ? 56 : size === 'md' ? 44 : 36;
  const cls = size === 'lg' ? 'w-14 h-14' : size === 'md' ? 'w-11 h-11' : 'w-9 h-9';

  if (rank <= 3) {
    const p = rank === 1
      ? { g1: '#FFF8DC', g2: '#FFD700', g3: '#B8860B', g4: '#856316', border: '#A07818', text: '#6B4F00', glow: '0 0 12px rgba(255,215,0,0.5)' }
      : rank === 2
      ? { g1: '#F1F5F9', g2: '#CBD5E1', g3: '#94A3B8', g4: '#64748B', border: '#78889A', text: '#1E293B', glow: '0 0 10px rgba(148,163,184,0.4)' }
      : { g1: '#FEF3C7', g2: '#D97706', g3: '#B45309', g4: '#7C2D12', border: '#92400E', text: '#451A03', glow: '0 0 10px rgba(217,119,6,0.4)' };

    return (
      <div className={`${cls} flex-shrink-0`} style={{ boxShadow: p.glow }}>
        <svg viewBox="0 0 56 62" className="w-full h-full">
          <defs>
            <linearGradient id={`sh${rank}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.g1}/><stop offset="40%" stopColor={p.g2}/><stop offset="100%" stopColor={p.g3}/>
            </linearGradient>
            <linearGradient id={`sh${rank}b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.g2}/><stop offset="100%" stopColor={p.g4}/>
            </linearGradient>
          </defs>
          {/* Shield outer */}
          <path d="M28 2 L52 12 L52 34 Q52 50 28 60 Q4 50 4 34 L4 12 Z" fill={`url(#sh${rank}b)`} stroke={p.border} strokeWidth="1.5"/>
          {/* Shield inner face */}
          <path d="M28 6 L48 14 L48 33 Q48 47 28 56 Q8 47 8 33 L8 14 Z" fill={`url(#sh${rank}f)`}/>
          {/* Top edge shine */}
          <path d="M14 14 Q28 8 42 14" stroke="white" strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round"/>
          {/* Inner border detail */}
          <path d="M28 10 L44 17 L44 32 Q44 44 28 52 Q12 44 12 32 L12 17 Z" fill="none" stroke={p.border} strokeWidth="0.6" opacity="0.4"/>
          {/* Number */}
          <text x="28" y="33" textAnchor="middle" dominantBaseline="central" fill={p.text} fontWeight="900" fontSize="22" fontFamily="system-ui, sans-serif">{rank}</text>
        </svg>
      </div>
    );
  }

  // Rank 4+
  const fs = size === 'lg' ? 18 : size === 'md' ? 14 : 12;
  return (
    <div className={`${cls} rounded-full bg-slate-800 text-slate-400 border-2 border-slate-700 flex items-center justify-center font-black flex-shrink-0`} style={{ fontSize: fs }}>
      {rank}
    </div>
  );
};

/** Avatar wrapper with rank-colored ornate frame for top 3 */
const LbRankedAvatar: React.FC<{
  rank: number; avatar: string; name: string;
  equippedFrame?: string; unlockedFrames?: string[];
  size?: 'md' | 'lg';
}> = ({ rank, avatar, name, equippedFrame, unlockedFrames, size = 'md' }) => {
  const dim = size === 'lg' ? 72 : 56;
  const ring = size === 'lg' ? 4 : 3;

  if (rank <= 3) {
    const ringColor = rank === 1 ? '#FFD700' : rank === 2 ? '#94A3B8' : '#D97706';
    const glowColor = rank === 1 ? 'rgba(255,215,0,0.35)' : rank === 2 ? 'rgba(148,163,184,0.25)' : 'rgba(217,119,6,0.3)';
    return (
      <div className="relative flex-shrink-0" style={{ width: dim + ring * 2, height: dim + ring * 2 }}>
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 16px ${glowColor}, inset 0 0 8px ${glowColor}`, border: `${ring}px solid ${ringColor}`, borderRadius: '50%' }} />
        {/* Avatar inside */}
        <div className="absolute rounded-full overflow-hidden bg-slate-800 flex items-center justify-center" style={{ width: dim, height: dim, top: ring, left: ring }}>
          {avatar && avatar.startsWith('http') ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">{avatar || '?'}</span>
          )}
        </div>
      </div>
    );
  }

  // Rank 4+ — use standard AvatarDisplay
  return <AvatarDisplay avatar={avatar} name={name} equippedFrame={equippedFrame} unlockedFrames={unlockedFrames} size={size === 'lg' ? 'lg' : 'md'} />;
};

const App: React.FC = () => {
  // Navigation & User
  const [view, setView] = useState<'login' | 'home' | 'solo-config' | 'lobby' | 'game' | 'multiplayer-game' | 'results' | 'leaderboard' | 'profile' | 'history' | 'stats' | 'rewards' | 'certificate' | 'roadmap'>('login');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [edusoUser, setEdusoUser] = useState<EdusoUserData | null>(null);
  const gameStartTime = useRef<Date | null>(null);

  const [topicsByGrade, setTopicsByGrade] = useState<TopicsByGrade>(DEFAULT_TOPICS_BY_GRADE);
  const [difficultiesByGrade, setDifficultiesByGrade] = useState<Record<number, Difficulty[]>>({});
  const [grades, setGrades] = useState<number[]>(DEFAULT_GRADES);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);

  // Solo Config - load grade từ localStorage nếu có
  const [selectedGrade, setSelectedGrade] = useState<number>(() => {
    const saved = localStorage.getItem('edux_selected_grade');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    // Nếu grade đã lưu không nằm trong danh sách được bật → dùng grade đầu tiên
    return DEFAULT_GRADES.includes(parsed) ? parsed : DEFAULT_GRADES[0];
  });
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.EASY);

  // Group State
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);

  // Multiplayer State
  const [multiplayerState, setMultiplayerState] = useState<MultiplayerGameState | null>(null);
  const [multiplayerQuestions, setMultiplayerQuestions] = useState<Question[]>([]);

  // Game State
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<UserAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(30); // per-question timer (30s)
  const totalTimeSpent = React.useRef(0); // accumulated seconds across all questions
  const QUESTION_TIME_LIMIT = 30;
  const [gameScore, setGameScore] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFunExplanation, setCurrentFunExplanation] = useState<string | null>(null);

  // Analytics State
  const [gameResults, setGameResults] = useState<GameResult | null>(null);
  const [expertAdvice, setExpertAdvice] = useState<import('./services/gemini').AdvisorAnalysis | null>(null);

  // History State
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);

  // Leaderboard State
  const [leaderboardData, setLeaderboardData] = useState<UserProfile[]>([]);
  const [weeklyLeaderboardData, setWeeklyLeaderboardData] = useState<UserProfile[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardGradeFilter, setLeaderboardGradeFilter] = useState<number | 'all'>('all');
  const [leaderboardTab, setLeaderboardTab] = useState<'alltime' | 'weekly'>('alltime');
  const [myRank, setMyRank] = useState<number>(-1);

  // Weekly rank banner + popup state
  const [myWeeklyRank, setMyWeeklyRank] = useState<number>(-1);
  const [weeklyTop5, setWeeklyTop5] = useState<UserProfile[]>([]);
  const [showRankPopup, setShowRankPopup] = useState(false);

  // Frame unlock popup state
  const [newlyUnlockedItems, setNewlyUnlockedItems] = useState<string[]>([]);
  const [showFrameUnlock, setShowFrameUnlock] = useState(false);

  // Floating XP animation
  const [floatingXp, setFloatingXp] = useState<{ id: number; value: number } | null>(null);
  const floatingXpCounter = React.useRef(0);
  const [floatingStreak, setFloatingStreak] = useState<{ id: number; streak: number } | null>(null);
  const floatingStreakCounter = React.useRef(0);
  const [streakPopKey, setStreakPopKey] = useState(0);
  const autoAdvanceTimer = React.useRef<number | null>(null);
  const autoAdvanceCountdown = React.useRef<number | null>(null);
  const [advanceCountdown, setAdvanceCountdown] = useState<number>(0);
  const explanationRef = React.useRef<HTMLDivElement>(null);
  const nextQuestionRef = React.useRef<() => void>(() => {});

  // Fetch weekly rank khi vào home
  useEffect(() => {
    if (view === 'home' && user) {
      const fetchWeeklyRank = async () => {
        const [rank, top5] = await Promise.all([
          getWeeklyUserRank(user.id),
          getWeeklyLeaderboard(5),
        ]);
        setMyWeeklyRank(rank);
        setWeeklyTop5(top5);
      };
      fetchWeeklyRank();
    }
  }, [view, user]);

  // Fetch leaderboard khi vào view leaderboard hoặc đổi filter/tab
  useEffect(() => {
    if (view === 'leaderboard' && user) {
      const fetchLeaderboard = async () => {
        setIsLoadingLeaderboard(true);
        const data = leaderboardGradeFilter === 'all'
          ? await getLeaderboard(20)
          : await getLeaderboardByGrade(leaderboardGradeFilter, 20);
        setLeaderboardData(data);

        const weeklyData = await getWeeklyLeaderboard(20);
        setWeeklyLeaderboardData(weeklyData);

        // Fetch actual rank for current user
        const gradeFilter = leaderboardGradeFilter === 'all' ? undefined : leaderboardGradeFilter;
        const rank = await getUserRank(user.id, gradeFilter);
        setMyRank(rank);

        setIsLoadingLeaderboard(false);
      };
      fetchLeaderboard();
    }
    // Fetch all users for history frame lookup
    if (view === 'history' && user && leaderboardData.length === 0) {
      getLeaderboard(200).then(data => setLeaderboardData(data));
    }
  }, [view, leaderboardGradeFilter, user]);

  // Lưu game state vào localStorage khi đang chơi
  useEffect(() => {
    if (view === 'game' && currentQuestions.length > 0) {
      const gameState = {
        currentQuestions,
        currentIndex,
        selectedAnswer,
        sessionAnswers,
        timeLeft,
        gameScore,
        currentStreak,
        maxStreak,
        selectedGrade,
        selectedTopics,
        selectedDifficulty,
        currentFunExplanation,
        savedAt: Date.now()
      };
      localStorage.setItem('arena_x_game_state', JSON.stringify(gameState));
    }
  }, [view, currentQuestions, currentIndex, selectedAnswer, sessionAnswers, timeLeft, gameScore, currentStreak, maxStreak]);

  // Load user, history và khôi phục game state khi app khởi động
  useEffect(() => {
    const initializeApp = async () => {
      // Load user từ localStorage trước (offline-first)
      const savedUser = localStorage.getItem('arena_x_user');
      let parsedUser = null;
      if (savedUser) {
        parsedUser = normalizeWeeklyXp(JSON.parse(savedUser));
        setUser(parsedUser);

        // Sync với Supabase - merge data từ server nếu có
        try {
          const serverProfile = await getUserProfile(parsedUser.id);
          if (serverProfile) {
            // Server có data - merge với local (server wins cho XP, games, etc.)
            const mergedUser = normalizeWeeklyXp({
              ...parsedUser,
              xp: Math.max(parsedUser.xp, serverProfile.xp),
              totalGames: Math.max(parsedUser.totalGames, serverProfile.totalGames),
              bestStreak: Math.max(parsedUser.bestStreak, serverProfile.bestStreak),
              weeklyXp: Math.max(parsedUser.weeklyXp, serverProfile.weeklyXp),
              weeklyXpWeek: parsedUser.weeklyXpWeek || serverProfile.weeklyXpWeek,
              level: serverProfile.xp > parsedUser.xp ? serverProfile.level : parsedUser.level,
              topicStats: { ...(serverProfile.topicStats || {}), ...(parsedUser.topicStats || {}) },
              // gradeXp: merge bằng cách lấy max từng grade để không bỏ sót XP từ server
              gradeXp: (() => {
                const local = parsedUser.gradeXp || {};
                const server = serverProfile.gradeXp || {};
                const allGrades = new Set([...Object.keys(local), ...Object.keys(server)].map(Number));
                const merged: Record<number, number> = {};
                allGrades.forEach(g => {
                  merged[g] = Math.max(local[g] || 0, server[g] || 0);
                });
                return merged;
              })(),
            });
            setUser(mergedUser);
            localStorage.setItem('arena_x_user', JSON.stringify(mergedUser));
            console.log('Merged user profile from Supabase');
          }
        } catch (e) {
          console.error('Error syncing with Supabase:', e);
        }
      }

      // Load history từ localStorage trước (offline-first)
      const savedHistory = localStorage.getItem('arena_x_history');
      let localHistory: GameHistory[] = [];
      if (savedHistory) {
        try {
          localHistory = JSON.parse(savedHistory);
          setGameHistory(localHistory);
        } catch (e) {
          console.error('Error loading history:', e);
        }
      }

      // Sync history từ Supabase nếu có user
      if (parsedUser) {
        try {
          const serverHistory = await getGameHistoryFromSupabase(parsedUser.id, 50);
          if (serverHistory.length > 0) {
            // Merge: kết hợp local và server, loại bỏ duplicates theo id
            const existingIds = new Set(localHistory.map(h => h.id));
            const newFromServer = serverHistory.filter(h => !existingIds.has(h.id));
            if (newFromServer.length > 0) {
              const mergedHistory = [...localHistory, ...newFromServer]
                .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
                .slice(0, 50);
              setGameHistory(mergedHistory);
              localStorage.setItem('arena_x_history', JSON.stringify(mergedHistory));
              console.log('Merged history from Supabase:', newFromServer.length, 'new entries');
            }
          }
        } catch (e) {
          console.error('Error syncing history with Supabase:', e);
        }
      }

      // Kiểm tra multiplayer game đang chơi dở (ưu tiên cao hơn solo)
      const rejoinInfo = await checkRejoinableRoom();
      if (rejoinInfo.canRejoin && rejoinInfo.roomState && parsedUser) {
        const { roomCode: activeRoomCode, isHost: wasHost, gamePhase, roomState } = rejoinInfo;

        if (gamePhase === 'playing' || gamePhase === 'countdown') {
          // Đang trong game multiplayer - khôi phục
          console.log('Restoring multiplayer game:', activeRoomCode, gamePhase);
          setRoomCode(activeRoomCode!);
          setIsHost(wasHost!);
          setMultiplayerState(roomState);
          setMultiplayerQuestions(roomState.questions || []);
          setView('multiplayer-game');
          return;
        } else if (gamePhase === 'waiting') {
          // Đang trong lobby - khôi phục về lobby
          console.log('Restoring to lobby:', activeRoomCode);
          setRoomCode(activeRoomCode!);
          setIsHost(wasHost!);
          setView('lobby');
          return;
        }
      }

      // Kiểm tra có solo game đang chơi dở không
      const savedGameState = localStorage.getItem('arena_x_game_state');
      if (savedGameState) {
        try {
          const gameState = JSON.parse(savedGameState);
          if (gameState.currentQuestions && gameState.currentQuestions.length > 0) {
            const totalQ = gameState.currentQuestions.length;

            // Tính thời gian thực đã trôi qua kể từ lần lưu cuối
            const elapsedSec = gameState.savedAt
              ? Math.floor((Date.now() - gameState.savedAt) / 1000)
              : 0;

            // Tính câu hỏi hiện tại và timeLeft còn lại sau khi trừ elapsed time
            let idx = gameState.currentIndex || 0;
            let remainingTime = (gameState.selectedAnswer != null) ? 0 : (gameState.timeLeft || QUESTION_TIME_LIMIT);
            let elapsed = elapsedSec;
            const skippedAnswers: typeof gameState.sessionAnswers = [];

            // Trừ thời gian đã trôi: nếu vượt quá timeLeft của câu hiện tại → skip sang câu tiếp
            // Mỗi câu skip cũng cộng thêm 4s delay (explanation)
            if (gameState.selectedAnswer != null) {
              // Đang hiển thị explanation → trừ 4s delay
              elapsed = Math.max(0, elapsed - 4);
              idx += 1;
              remainingTime = QUESTION_TIME_LIMIT;
            }

            while (elapsed > 0 && idx < totalQ) {
              if (elapsed >= remainingTime) {
                // Câu này hết giờ → đánh dấu timeout
                elapsed -= remainingTime;
                elapsed -= 4; // 4s explanation delay
                const q = gameState.currentQuestions[idx];
                if (q) {
                  skippedAnswers.push({
                    questionId: q.id,
                    selectedOption: '__timeout__',
                    isCorrect: false
                  });
                }
                idx += 1;
                remainingTime = QUESTION_TIME_LIMIT;
              } else {
                remainingTime -= elapsed;
                elapsed = 0;
              }
            }

            // Nếu đã vượt qua tất cả câu hỏi → set state và chuyển thẳng sang results
            if (idx >= totalQ) {
              const allAnswers = [...(gameState.sessionAnswers || []), ...skippedAnswers];
              setCurrentQuestions(gameState.currentQuestions);
              setSessionAnswers(allAnswers);
              setGameScore(gameState.gameScore || 0);
              setMaxStreak(gameState.maxStreak || 0);
              setCurrentStreak(0);
              const restoredGrade = gameState.selectedGrade || 3;
              setSelectedGrade(restoredGrade);
              localStorage.setItem('edux_selected_grade', String(restoredGrade));
              setSelectedTopics(gameState.selectedTopics || []);
              setSelectedDifficulty(gameState.selectedDifficulty || Difficulty.EASY);
              setCurrentIndex(totalQ - 1);
              setSelectedAnswer(null);
              // Đánh dấu cần trigger game over sau khi state đã set xong
              setView('game');
              // Dùng setTimeout để đợi state update, rồi gọi handleGameOver
              setTimeout(() => {
                nextQuestionRef.current();
              }, 100);
              return;
            }

            setCurrentQuestions(gameState.currentQuestions);
            setCurrentIndex(idx);
            setSelectedAnswer(null);
            setCurrentFunExplanation(null);
            setSessionAnswers([...(gameState.sessionAnswers || []), ...skippedAnswers]);
            setTimeLeft(remainingTime);
            setGameScore(gameState.gameScore || 0);
            setCurrentStreak(0); // Reset streak vì đã skip câu
            setMaxStreak(gameState.maxStreak || 0);
            const restoredGrade = gameState.selectedGrade || 3;
            setSelectedGrade(restoredGrade);
            localStorage.setItem('edux_selected_grade', String(restoredGrade));
            setSelectedTopics(gameState.selectedTopics || []);
            setSelectedDifficulty(gameState.selectedDifficulty || Difficulty.EASY);
            setView('game');
            console.log(`Restored game: skipped ${skippedAnswers.length} questions (${elapsedSec}s elapsed), resuming at Q${idx + 1} with ${remainingTime}s`);
            return;
          }
        } catch (e) {
          console.error('Error restoring game state:', e);
          localStorage.removeItem('arena_x_game_state');
        }
      }

      // Nếu không có game đang chơi, kiểm tra user để quyết định view
      if (savedUser) {
        setView('login');
      }
    };

    initializeApp();
  }, []);

  // Load topics + difficulties khi app load
  useEffect(() => {
    const loadTopics = async () => {
      setIsLoadingTopics(true);
      const [k6Diff, k7Diff, k8Diff, k8Topics, k9Topics] = await Promise.all([
        getK6Difficulties(),
        getK7Difficulties(),
        getK8Difficulties(),
        getK8Topics(),
        getK9Topics(),
      ]);
      setTopicsByGrade(prev => ({ ...prev, 8: k8Topics, 9: k9Topics }));
      setDifficultiesByGrade(prev => ({ ...prev, 6: k6Diff, 7: k7Diff, 8: k8Diff }));
      setIsLoadingTopics(false);
    };
    loadTopics();
  }, []);

  // Per-question Timer — resets when question changes, auto-skips on 0
  useEffect(() => {
    if (view !== 'game') return;
    setTimeLeft(QUESTION_TIME_LIMIT); // reset on each new question
  }, [currentIndex, view]);

  // Countdown tick — chỉ giảm timeLeft, không có side effect
  useEffect(() => {
    if (view !== 'game' || selectedAnswer || timeLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [view, timeLeft, selectedAnswer]);

  // Handle timeout — khi timeLeft chạm 0 và chưa có answer
  useEffect(() => {
    if (view !== 'game' || timeLeft !== 0 || selectedAnswer) return;
    const q = currentQuestions[currentIndex];
    if (!q) return;

    totalTimeSpent.current += QUESTION_TIME_LIMIT;
    setSelectedAnswer('__timeout__');
    setSessionAnswers(sa => [...sa, { questionId: q.id, selectedOption: '__timeout__', isCorrect: false }]);
    setCurrentStreak(0);
    setCurrentFunExplanation(q.funExplanation);

    // Auto-advance after 4s — dùng nextQuestionRef để tránh stale closure
    autoAdvanceTimer.current = window.setTimeout(() => {
      nextQuestionRef.current();
    }, 4000);
  }, [view, timeLeft, selectedAnswer, currentIndex]);

  const handleLoginComplete = async (userProfile: UserProfile, edusoData?: EdusoUserData) => {
    // Lưu ngay vào state + localStorage để UI không bị trống
    setUser(userProfile);
    localStorage.setItem('arena_x_user', JSON.stringify(userProfile));
    if (edusoData) {
      setEdusoUser(edusoData);
    }
    setView('home');

    // Sync với Supabase để khôi phục XP trên thiết bị mới / sau khi clear cache
    // Chạy sau khi đã navigate về home để không block UI
    try {
      const serverProfile = await getUserProfile(userProfile.id);
      if (serverProfile && serverProfile.xp > 0) {
        const mergedUser: UserProfile = normalizeWeeklyXp({
          ...userProfile,
          xp: Math.max(userProfile.xp, serverProfile.xp),
          totalGames: Math.max(userProfile.totalGames, serverProfile.totalGames),
          bestStreak: Math.max(userProfile.bestStreak, serverProfile.bestStreak),
          weeklyXp: Math.max(userProfile.weeklyXp, serverProfile.weeklyXp),
          weeklyXpWeek: userProfile.weeklyXpWeek || serverProfile.weeklyXpWeek,
          level: serverProfile.xp > userProfile.xp ? serverProfile.level : userProfile.level,
          topicStats: { ...(serverProfile.topicStats || {}), ...(userProfile.topicStats || {}) },
          gradeXp: { ...(serverProfile.gradeXp || {}), ...(userProfile.gradeXp || {}) },
        });
        // Chỉ cập nhật nếu có sự khác biệt thực sự (tránh re-render thừa)
        if (mergedUser.xp !== userProfile.xp || mergedUser.totalGames !== userProfile.totalGames) {
          setUser(mergedUser);
          localStorage.setItem('arena_x_user', JSON.stringify(mergedUser));
          console.log(`Restored XP from Supabase: ${userProfile.xp} → ${mergedUser.xp}`);
        }
      }
    } catch (e) {
      // Không block login nếu Supabase lỗi
      console.error('Error syncing profile on login:', e);
    }
  };

  const handleUpdateAvatar = (newAvatar: string) => {
    if (!user) return;
    const updatedUser = { ...user, avatar: newAvatar };
    setUser(updatedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
  };

  const handleEquipFrame = (frameId: string | undefined) => {
    if (!user) return;
    // Nếu equip (không phải unequip), kiểm tra frame có thể dùng không
    if (frameId && !isFrameUsable(frameId, user.unlockedFrames || [])) return;
    const updatedUser = { ...user, equippedFrame: frameId };
    setUser(updatedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
    upsertUserProfile(updatedUser).catch(console.error);
  };

  const handleSpinResult = (prize: import('./components/LuckySpin').SpinPrize, newSpinsUsed: number) => {
    if (!user) return;
    const currentWeek = getCurrentProgramWeek();
    // Update local state — BE/XP integration sẽ làm sau
    const updatedUser: UserProfile = {
      ...user,
      spinsUsed: newSpinsUsed,
      lastSpinWeek: currentWeek ?? user.lastSpinWeek,
    };
    setUser(updatedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
  };

  const handlePracticeTopic = (topic: string) => {
    setSelectedTopics([topic]);
    setView('solo-config');
  };

  const startSoloGame = async () => {
    setIsLoading(true);
    const topicsToUse = selectedTopics.length > 0 ? selectedTopics : [topicsByGrade[selectedGrade]?.[0] || 'General English'];

    let questions: Question[] = [];
    const localGrades = [6, 7, 8, 9];

    // K6/K7/K8/K9: dùng bộ câu hỏi local JSON, không cần mạng
    if (selectedGrade === 6) {
      questions = await fetchK6Questions(topicsToUse, selectedDifficulty, 15);
    } else if (selectedGrade === 7) {
      questions = await fetchK7Questions(topicsToUse, selectedDifficulty, 15);
    } else if (selectedGrade === 8) {
      questions = await fetchK8Questions(topicsToUse, selectedDifficulty, 15);
    } else if (selectedGrade === 9) {
      questions = await fetchK9Questions(topicsToUse, selectedDifficulty, 15);
    }

    // Các khối dùng local JSON: không fallback sang Sheet/Gemini
    if (!localGrades.includes(selectedGrade)) {
      // Fallback sang Google Sheet nếu chưa đủ câu
      if (questions.length < 5) {
        const sheetQuestions = await fetchQuestionsFromSheet(selectedGrade, topicsToUse, selectedDifficulty, 15);
        if (sheetQuestions.length > questions.length) questions = sheetQuestions;
      }
      // Fallback cuối cùng sang Gemini AI
      if (questions.length < 5) {
        console.log('Không đủ câu hỏi từ Sheet, sử dụng Gemini AI...');
        questions = await generateQuestions(selectedGrade, topicsToUse, selectedDifficulty);
      }
    }

    if (questions.length > 0) {
      setCurrentQuestions(questions);
      setCurrentIndex(0);
      setTimeLeft(QUESTION_TIME_LIMIT);
      totalTimeSpent.current = 0;
      setGameScore(0);
      setCurrentStreak(0);
      setMaxStreak(0);
      setSelectedAnswer(null);
      setCurrentFunExplanation(null);
      setSessionAnswers([]);
      setExpertAdvice(null); // Reset phân tích cũ
      setGameResults(null);
      gameStartTime.current = new Date(); // Save game start time for Eduso API
      setView('game');
    } else {
      alert("Lỗi tải câu hỏi. Vui lòng thử lại!");
    }
    setIsLoading(false);
  };

  const handleAnswer = (answer: string) => {
    if (selectedAnswer || !currentQuestions[currentIndex]) return;

    setSelectedAnswer(answer);
    const q = currentQuestions[currentIndex];
    // Multi-answer: answer is '|||'-joined sorted selected options
    const isCorrect = q.correctAnswers && q.correctAnswers.length > 1
      ? (() => {
          const chosen = answer.split('|||');
          return chosen.length === q.correctAnswers!.length &&
            chosen.every(a => q.correctAnswers!.includes(a));
        })()
      : answer === q.correctAnswer;
    playSound(isCorrect);

    const userAnswer: UserAnswer = {
      questionId: q.id,
      selectedOption: answer,
      isCorrect
    };
    setSessionAnswers(prev => [...prev, userAnswer]);

    if (isCorrect) {
      // XP/câu theo độ khó
      const xpPerQ = XP_PER_QUESTION[selectedDifficulty] || 10;

      // Streak bonus: cộng ngay vào score
      const nextStreak = currentStreak + 1;
      const streakBonus = nextStreak * 5;
      const prevStreakBonus = currentStreak > 0 ? currentStreak * 5 : 0;
      // Chỉ cộng thêm phần chênh lệch streak bonus (vì maxStreak*5 đã tính trước đó)
      const newMaxStreak = Math.max(maxStreak, nextStreak);
      const oldMaxStreak = maxStreak;
      const streakXpGain = newMaxStreak * 5 - oldMaxStreak * 5;
      const totalGain = xpPerQ + streakXpGain;

      setGameScore(prev => prev + totalGain);
      // Floating XP animation
      floatingXpCounter.current += 1;
      setFloatingXp({ id: floatingXpCounter.current, value: totalGain });
      setTimeout(() => setFloatingXp(null), 1200);

      setCurrentStreak(prev => {
        const next = prev + 1;
        if (next > maxStreak) setMaxStreak(next);
        floatingStreakCounter.current += 1;
        setFloatingStreak({ id: floatingStreakCounter.current, streak: next });
        setTimeout(() => setFloatingStreak(null), 1000);
        setStreakPopKey(k => k + 1);
        return next;
      });
    } else {
      setCurrentStreak(0);
    }
    setCurrentFunExplanation(q.funExplanation);
    // Auto-scroll to explanation & start visible countdown
    setTimeout(() => explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    setAdvanceCountdown(4);
    autoAdvanceCountdown.current = window.setInterval(() => {
      setAdvanceCountdown(prev => {
        if (prev <= 1) {
          if (autoAdvanceCountdown.current) clearInterval(autoAdvanceCountdown.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    autoAdvanceTimer.current = window.setTimeout(() => {
      nextQuestionRef.current();
    }, 4000);
  };

  const nextQuestion = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    if (autoAdvanceCountdown.current) {
      clearInterval(autoAdvanceCountdown.current);
      autoAdvanceCountdown.current = null;
    }
    setAdvanceCountdown(0);
    // Accumulate time spent on this question
    totalTimeSpent.current += QUESTION_TIME_LIMIT - timeLeft;
    if (currentIndex < currentQuestions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setCurrentFunExplanation(null);
    } else {
      handleGameOver();
    }
  };
  nextQuestionRef.current = nextQuestion;

  const handleGameOver = async () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    // Xóa game state khi kết thúc game
    localStorage.removeItem('arena_x_game_state');

    const correctCount = sessionAnswers.filter(a => a.isCorrect).length;
    const xpData = calculateDetailedXp(correctCount, maxStreak, selectedDifficulty);

    // Lưu vào history
    const historyEntry: GameHistory = {
      id: `game-${Date.now()}`,
      playedAt: new Date().toISOString(),
      grade: selectedGrade,
      topics: selectedTopics.length > 0 ? selectedTopics : ['General'],
      difficulty: selectedDifficulty,
      correctCount,
      totalQuestions: currentQuestions.length,
      xpEarned: xpData.totalXp,
      maxStreak,
      timeSpent: totalTimeSpent.current,
      score: gameScore
    };

    const updatedHistory = [historyEntry, ...gameHistory].slice(0, 50); // Giữ tối đa 50 trận
    setGameHistory(updatedHistory);
    localStorage.setItem('arena_x_history', JSON.stringify(updatedHistory));

    // Note: Game history will be saved to Supabase after profile is updated (below)
    
    const catBreak: Record<string, { correct: number; total: number }> = {};
    const typeBreak: Record<string, { correct: number; total: number }> = {};
    const diffBreak: Record<string, { correct: number; total: number }> = {};

    currentQuestions.forEach((q, idx) => {
      const ans = sessionAnswers.find(a => a.questionId === q.id);
      const isCorrect = ans?.isCorrect || false;
      [catBreak, typeBreak, diffBreak].forEach((br, i) => {
        const key = i === 0 ? q.category : i === 1 ? q.type : q.difficulty;
        if (!br[key]) br[key] = { correct: 0, total: 0 };
        br[key].total++;
        if (isCorrect) br[key].correct++;
      });
    });

    const result: GameResult = {
      score: gameScore,
      correctCount,
      totalQuestions: currentQuestions.length,
      timeSpent: totalTimeSpent.current,
      maxStreak,
      xpEarned: xpData.totalXp,
      xpBreakdown: xpData,
      categoryBreakdown: catBreak,
      typeBreakdown: typeBreak,
      difficultyBreakdown: diffBreak,
      sessionDetails: {
        questions: currentQuestions,
        answers: sessionAnswers
      }
    };

    setGameResults(result);
    setExpertAdvice(null); // Reset ngay để không hiện nhận xét lượt cũ
    setView('results');

    if (user) {
      const newXp = user.xp + xpData.totalXp;
      
      const updatedTopicStats = { ...(user.topicStats || {}) };
      Object.entries(catBreak).forEach(([topic, stats]) => {
        if (!updatedTopicStats[topic]) {
          updatedTopicStats[topic] = { correct: 0, total: 0 };
        }
        updatedTopicStats[topic].correct += stats.correct;
        updatedTopicStats[topic].total += stats.total;
      });

      // Cập nhật gradeXp cho khối vừa chơi
      const updatedGradeXp = { ...(user.gradeXp || {}) };
      updatedGradeXp[selectedGrade] = (updatedGradeXp[selectedGrade] || 0) + xpData.totalXp;

      const newWeeklyXp = user.weeklyXp + xpData.totalXp;

      // Check frame unlock milestones
      const programWeek = getCurrentProgramWeek();
      const currentUnlocked = user.unlockedFrames || [];
      const newUnlocks = checkNewUnlocks(newWeeklyXp, currentUnlocked, programWeek);
      const updatedUnlockedFrames = newUnlocks.length > 0
        ? [...currentUnlocked, ...newUnlocks]
        : currentUnlocked;

      const updatedUser: UserProfile = {
        ...user,
        xp: newXp,
        weeklyXp: newWeeklyXp,
        weeklyXpWeek: programWeek || user.weeklyXpWeek,
        level: getLevelFromXp(newXp).level,
        totalGames: user.totalGames + 1,
        bestStreak: Math.max(user.bestStreak, maxStreak),
        topicStats: updatedTopicStats,
        grade: selectedGrade,
        gradeXp: updatedGradeXp,
        unlockedFrames: updatedUnlockedFrames,
      };
      setUser(updatedUser);
      localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));

      // Hiển thị popup unlock frame nếu có items mới
      if (newUnlocks.length > 0) {
        setNewlyUnlockedItems(newUnlocks);
        setShowFrameUnlock(true);
      }

      // Sync user profile to Supabase FIRST, then save game history
      upsertUserProfile(updatedUser)
        .then(() => {
          return saveGameHistoryToSupabase(user.id, { ...historyEntry, mode: 'solo' });
        })
        .catch(err => {
          console.error('Error syncing to Supabase:', err);
        });

      // Send game result to Eduso API (if user is logged in with Eduso)
      if (edusoUser && gameStartTime.current) {
        const endGameParams = createEndGameParams(
          edusoUser.userId,
          user.name,
          gameStartTime.current,
          xpData.totalXp,
          'EDUX_ARENA'
        );
        sendGameResultToEduso(endGameParams).catch(err => {
          console.error('Error sending game result to Eduso:', err);
        });
      }

      const analysis = await getExpertAnalysis(result, selectedGrade);
      setExpertAdvice(analysis);
    }
  };

  // Multiplayer handlers
  const handleStartMultiplayerGame = async (code: string, state: MultiplayerGameState) => {
    setRoomCode(code);
    setMultiplayerState(state);
    setIsHost(state.hostId === getPlayerId());

    // Update session phase to playing/countdown
    updateActiveRoomPhase(state.gamePhase as any);

    // Fetch questions for the game
    const topics = state.roomSettings.topics;
    const grade = state.roomSettings.grade;
    const difficulty = state.roomSettings.difficulty;

    let questions: Question[] = [];
    if (grade === 6) {
      questions = await fetchK6Questions(topics, difficulty, 15);
    } else if (grade === 7) {
      questions = await fetchK7Questions(topics, difficulty, 15);
    } else if (grade === 8) {
      questions = await fetchK8Questions(topics, difficulty, 15);
    } else if (grade === 9) {
      questions = await fetchK9Questions(topics, difficulty, 15);
    } else {
      questions = await fetchQuestionsFromSheet(grade, topics, difficulty, 15);
      if (questions.length < 5) {
        questions = await generateQuestions(grade, topics, difficulty);
      }
    }

    if (questions.length > 0) {
      setMultiplayerQuestions(questions);

      // If host, start the game with questions
      if (state.hostId === getPlayerId()) {
        await startMultiplayerGame(code, getPlayerId(), questions);
      }

      setView('multiplayer-game');
    }
  };

  const handleMultiplayerGameEnd = (results: MultiplayerResult[], myResult: MultiplayerResult) => {
    // Clear active room so refresh doesn't rejoin a finished game
    clearActiveRoom();

    // Save to history
    const historyEntry: GameHistory = {
      id: `mp-${Date.now()}`,
      playedAt: new Date().toISOString(),
      grade: multiplayerState?.roomSettings.grade || selectedGrade,
      topics: multiplayerState?.roomSettings.topics || ['General'],
      difficulty: multiplayerState?.roomSettings.difficulty || Difficulty.MEDIUM,
      correctCount: myResult.correctCount,
      totalQuestions: myResult.totalQuestions,
      xpEarned: myResult.xpEarned,
      maxStreak: myResult.maxStreak,
      timeSpent: Math.floor(myResult.timeSpent / 1000),
      score: myResult.score,
      mode: 'multiplayer',
      roomCode: roomCode,
      myRank: myResult.rank,
      totalPlayers: results.length,
      opponents: results
        .map(r => ({
          name: r.playerName,
          avatar: r.playerAvatar || '',
          score: r.score,
          correctCount: r.correctCount,
          rank: r.rank
        }))
    };

    const updatedHistory = [historyEntry, ...gameHistory].slice(0, 50);
    setGameHistory(updatedHistory);
    localStorage.setItem('arena_x_history', JSON.stringify(updatedHistory));

    // Update user XP and sync to Supabase
    if (user) {
      const newXp = user.xp + myResult.xpEarned;
      const gameGrade = multiplayerState?.roomSettings.grade || selectedGrade;

      // Cập nhật gradeXp cho khối vừa chơi
      const updatedGradeXp = { ...(user.gradeXp || {}) };
      updatedGradeXp[gameGrade] = (updatedGradeXp[gameGrade] || 0) + myResult.xpEarned;

      const newWeeklyXpMp = user.weeklyXp + myResult.xpEarned;
      const programWeekMp = getCurrentProgramWeek();
      const currentUnlockedMp = user.unlockedFrames || [];
      const newUnlocksMp = checkNewUnlocks(newWeeklyXpMp, currentUnlockedMp, programWeekMp);
      const updatedUnlockedFramesMp = newUnlocksMp.length > 0
        ? [...currentUnlockedMp, ...newUnlocksMp]
        : currentUnlockedMp;

      const updatedUser: UserProfile = {
        ...user,
        xp: newXp,
        weeklyXp: newWeeklyXpMp,
        weeklyXpWeek: programWeekMp || user.weeklyXpWeek,
        level: getLevelFromXp(newXp).level,
        totalGames: user.totalGames + 1,
        bestStreak: Math.max(user.bestStreak, myResult.maxStreak),
        grade: gameGrade,
        gradeXp: updatedGradeXp,
        unlockedFrames: updatedUnlockedFramesMp,
      };
      setUser(updatedUser);
      localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));

      if (newUnlocksMp.length > 0) {
        setNewlyUnlockedItems(newUnlocksMp);
        setShowFrameUnlock(true);
      }

      // Sync user profile to Supabase FIRST, then save game history
      // This ensures the foreign key constraint is satisfied (profile must exist before game_history)
      upsertUserProfile(updatedUser)
        .then(() => {
          // Now save game history after profile exists
          return saveGameHistoryToSupabase(user.id, historyEntry);
        })
        .catch(err => {
          console.error('Error syncing multiplayer data to Supabase:', err);
        });
    }
  };

  const handleLeaveMultiplayer = () => {
    clearActiveRoom();
    setRoomCode('');
    setMultiplayerState(null);
    setMultiplayerQuestions([]);
    setView('home');
  };

  // Show login screen if no user or view is login
  if (!user || view === 'login') {
    return (
      <LoginScreen
        onLoginComplete={handleLoginComplete}
        existingUser={user}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white selection:bg-red-500/30">
      <Header user={user} currentView={view} onNavigate={setView} />
      
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 pb-16 md:pb-8">
        <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>}>
        {view === 'home' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
             <div className="text-center space-y-6">
                <div className="inline-block px-4 py-1.5 bg-red-600/10 border border-red-600/50 rounded-full text-red-500 text-xs font-black uppercase tracking-widest">
                  Đấu trường X
                </div>
                <h2 className="text-4xl sm:text-5xl md:text-8xl font-black tracking-tighter italic uppercase text-white leading-none">
                  TÌM X <br/> <span className="text-red-600">TÌM BẢN LĨNH</span>
                </h2>
                <p className="text-slate-400 text-base sm:text-lg md:text-xl font-medium max-w-2xl mx-auto">
                  Vượt qua áp lực thời gian, chinh phục bảng xếp hạng và trở thành Huyền thoại Tiếng Anh X.
                </p>
             </div>

             {/* Weekly Roadmap Progress Bar */}
             {(() => {
               const programWeek = getCurrentProgramWeek();
               if (!programWeek) return null;
               const weekFrame = WEEKLY_FRAMES.find(f => f.week === programWeek);
               if (!weekFrame) return null;
               const unlockedFrames = user.unlockedFrames || [];
               const milestones = weekFrame.items.map(item => ({
                 xp: item.xpRequired,
                 emoji: item.emoji,
                 unlocked: unlockedFrames.includes(item.id),
               }));
               const maxMilestone = milestones[milestones.length - 1].xp;
               const progressPct = Math.min(100, (user.weeklyXp / maxMilestone) * 100);
               return (
                 <div
                   className="bg-slate-900 border border-slate-800 rounded-[28px] p-6 cursor-pointer hover:border-purple-700/40 transition-all"
                   onClick={() => setView('rewards')}
                 >
                   <div className="flex justify-between items-center mb-3">
                     <div className="flex items-center gap-2">
                       <img src={`${(import.meta as any).env?.BASE_URL || '/'}${weekFrame.frameImage}`} alt={weekFrame.name} className="w-8 h-8" />
                       <div>
                         <p className="text-xs font-black uppercase tracking-widest text-white">
                           Tuần {programWeek}: {weekFrame.name}
                         </p>
                         <p className="text-[10px] text-slate-500 font-bold uppercase">XP TUẦN NÀY · {user.weeklyXp.toLocaleString()} / {maxMilestone.toLocaleString()}</p>
                       </div>
                     </div>
                     <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">XEM PHẦN THƯỞNG →</span>
                   </div>
                   <div className="relative h-4 bg-slate-800 rounded-full overflow-visible">
                     {/* Milestone markers */}
                     {milestones.map((m, idx) => {
                       const pct = (m.xp / maxMilestone) * 100;
                       const isLast = idx === milestones.length - 1;
                       return (
                         <div key={idx} className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}>
                           {isLast ? (
                             <img
                               src={`${(import.meta as any).env?.BASE_URL || '/'}${weekFrame.frameImage}`}
                               alt={weekFrame.name}
                               className={`w-7 h-7 ${!m.unlocked ? 'grayscale opacity-50' : ''}`}
                             />
                           ) : (
                             <div
                               className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px]"
                               style={{
                                 background: m.unlocked ? weekFrame.color : '#1e293b',
                                 borderColor: m.unlocked ? weekFrame.color : '#334155',
                                 boxShadow: m.unlocked ? `0 0 8px ${weekFrame.glowColor}` : undefined,
                               }}
                             >
                               {m.unlocked ? '✓' : `${idx + 1}`}
                             </div>
                           )}
                         </div>
                       );
                     })}
                     {/* Progress fill */}
                     <div
                       className="h-full rounded-full transition-all duration-700"
                       style={{
                         width: `${progressPct}%`,
                         background: weekFrame.color,
                         boxShadow: `0 0 8px ${weekFrame.glowColor}`,
                       }}
                     />
                   </div>
                   <div className="flex justify-between mt-4">
                     {milestones.map((m, idx) => (
                       <span key={idx} className="text-[10px] font-bold" style={{ color: m.unlocked ? weekFrame.color : '#475569' }}>
                         {m.xp.toLocaleString()}
                       </span>
                     ))}
                   </div>
                 </div>
               );
             })()}

             {/* ── Top Banner thứ hạng tuần ── */}
             {myWeeklyRank > 0 && (
               <button
                 onClick={() => setShowRankPopup(true)}
                 className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.01] text-left animate-in fade-in duration-500 ${
                   myWeeklyRank === 1 ? 'bg-yellow-500/10 border-yellow-500/40 hover:border-yellow-400' :
                   myWeeklyRank <= 3 ? 'bg-amber-600/10 border-amber-600/40 hover:border-amber-400' :
                   myWeeklyRank <= 10 ? 'bg-blue-600/10 border-blue-600/40 hover:border-blue-400' :
                   'bg-slate-800/60 border-slate-700 hover:border-slate-500'
                 }`}
               >
                 <div className="shrink-0">
                   <LbRankBadge rank={myWeeklyRank} size="lg" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="font-black text-white text-sm">
                     Thứ hạng tuần này:{' '}
                     <span className={myWeeklyRank <= 3 ? 'text-yellow-400' : myWeeklyRank <= 10 ? 'text-blue-400' : 'text-white'}>
                       #{myWeeklyRank}
                     </span>
                   </p>
                   <p className="text-xs text-slate-400 truncate">
                     {myWeeklyRank === 1 ? 'Bạn đang dẫn đầu BXH tuần!' :
                      myWeeklyRank <= 3 ? 'Top 3 tuần — Xuất sắc!' :
                      myWeeklyRank <= 10 ? 'Top 10 — Tiếp tục cố lên!' :
                      `${user.weeklyXp.toLocaleString()} XP tuần này · Bấm để xem BXH`}
                   </p>
                 </div>
                 <span className="text-xs font-black text-slate-500 shrink-0">XEM →</span>
               </button>
             )}

             {/* Desktop: large cards side by side */}
             <div className="hidden md:grid grid-cols-2 gap-8">
                <button
                  onClick={() => setView('solo-config')}
                  className="relative group overflow-hidden bg-slate-900 border border-slate-800 p-10 rounded-[40px] hover:border-red-600 transition-all text-left shadow-2xl"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl group-hover:scale-110 transition-transform">🎯</div>
                  <h3 className="text-3xl font-black mb-2 group-hover:text-red-500 transition-colors uppercase">Đấu hạng</h3>
                  <p className="text-slate-400 mb-8 font-medium italic">Thi đấu cá nhân, vượt qua 15 câu hỏi trong 5 phút để leo rank</p>
                  <div className="flex items-center gap-2 text-red-500 font-bold uppercase tracking-widest text-sm">
                    BẮT ĐẦU NGAY <span className="group-hover:translate-x-2 transition-transform">→</span>
                  </div>
                </button>

                <button
                  onClick={() => setView('lobby')}
                  className="relative group overflow-hidden bg-slate-900 border border-slate-800 p-10 rounded-[40px] hover:border-blue-500 transition-all text-left shadow-2xl"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl group-hover:scale-110 transition-transform">👥</div>
                  <h3 className="text-3xl font-black mb-2 group-hover:text-blue-500 transition-colors uppercase">Thách đấu</h3>
                  <p className="text-slate-400 mb-8 font-medium italic">Thách đấu bạn bè, tích lũy XP, trở thành Huyền thoại</p>
                  <div className="flex items-center gap-2 text-blue-500 font-bold uppercase tracking-widest text-sm">
                    THÁCH ĐẤU NGAY <span className="group-hover:translate-x-2 transition-transform">→</span>
                  </div>
                </button>
             </div>

             {/* Mobile: compact list rows with chevron */}
             <div className="md:hidden flex flex-col gap-3">
                <button
                  onClick={() => setView('solo-config')}
                  className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl hover:border-red-600/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-2xl flex-shrink-0">🎯</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-white uppercase">Đấu hạng</h3>
                    <p className="text-slate-500 text-xs mt-0.5">15 câu hỏi · 5 phút · Leo rank</p>
                  </div>
                  <span className="text-red-500 font-bold text-lg group-hover:translate-x-1 transition-transform flex-shrink-0">›</span>
                </button>

                <button
                  onClick={() => setView('lobby')}
                  className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl hover:border-blue-500/50 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-2xl flex-shrink-0">👥</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-white uppercase">Thách đấu</h3>
                    <p className="text-slate-500 text-xs mt-0.5">Thách đấu bạn bè · Tích lũy XP</p>
                  </div>
                  <span className="text-blue-500 font-bold text-lg group-hover:translate-x-1 transition-transform flex-shrink-0">›</span>
                </button>
             </div>

             {/* Quick Actions */}
             <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => setView('history')}
                  className="px-5 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-600 transition-all flex items-center gap-2"
                >
                  <span className="text-lg">📜</span>
                  <span className="font-bold text-slate-400 text-sm">Lịch sử đấu</span>
                  {gameHistory.length > 0 && (
                    <span className="px-2 py-0.5 bg-red-600/20 text-red-500 text-xs font-black rounded-full">
                      {gameHistory.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView('leaderboard')}
                  className="px-5 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-600 transition-all flex items-center gap-2"
                >
                  <span className="text-lg">🏆</span>
                  <span className="font-bold text-slate-400 text-sm">Bảng xếp hạng</span>
                </button>
                <button
                  onClick={() => setView('rewards')}
                  className="px-5 py-2.5 bg-slate-900 border border-purple-800/40 rounded-2xl hover:border-purple-600 transition-all flex items-center gap-2"
                >
                  <span className="text-lg">🏅</span>
                  <span className="font-bold text-purple-400 text-sm">Phần thưởng</span>
                  {(user.unlockedFrames?.length || 0) > 0 && (
                    <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 text-xs font-black rounded-full">
                      {user.unlockedFrames!.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView('stats')}
                  className="px-5 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-600 transition-all flex items-center gap-2"
                >
                  <span className="text-lg">📊</span>
                  <span className="font-bold text-slate-400 text-sm">Thống kê</span>
                </button>
             </div>
          </div>
        )}

        {view === 'solo-config' && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 p-10 rounded-[40px] space-y-8 shadow-2xl">
            <h2 className="text-3xl font-black">CẤU HÌNH TRẬN ĐẤU</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">Chọn Khối Lớp</label>
                <div className="grid grid-cols-4 gap-2">
                  {grades.map(g => (
                    <button
                      key={g}
                      onClick={() => { setSelectedGrade(g); setSelectedTopics([]); localStorage.setItem('edux_selected_grade', String(g)); }}
                      className={`py-3 rounded-2xl font-bold transition-all ${selectedGrade === g ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      Lớp {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">
                  Chọn Chủ Đề (Global Success)
                  {isLoadingTopics && <span className="ml-2 text-slate-600">đang tải...</span>}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(topicsByGrade[selectedGrade] || []).map(topic => (
                    <button
                      key={topic}
                      onClick={() => setSelectedTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic])}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${selectedTopics.includes(topic) ? 'border-red-600 bg-red-600/10 text-red-500' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'}`}
                    >
                      {topic}
                    </button>
                  ))}
                  {(!topicsByGrade[selectedGrade] || topicsByGrade[selectedGrade].length === 0) && !isLoadingTopics && (
                    <p className="text-slate-500 italic">Không có chủ đề cho lớp này</p>
                  )}
                </div>
              </div>

              {/* Hiện chọn độ khó nếu grade có nhiều hơn 1 mức */}
              {(() => {
                const gradeDiffs = difficultiesByGrade[selectedGrade];
                const availableDiffs = gradeDiffs && gradeDiffs.length > 1
                  ? Object.values(Difficulty).filter(d => d !== Difficulty.EXPERT && gradeDiffs.includes(d))
                  : Object.values(Difficulty).filter(d => d !== Difficulty.EXPERT);
                const shouldShow = !gradeDiffs || gradeDiffs.length !== 1;
                if (!shouldShow) return null;
                return (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="block text-xs font-black uppercase text-slate-500 tracking-widest">Độ khó</label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {availableDiffs.map(d => (
                        <button
                          key={d}
                          onClick={() => setSelectedDifficulty(d)}
                          className={`py-3 rounded-2xl font-bold transition-all flex flex-col items-center justify-center gap-1 ${selectedDifficulty === d ? 'bg-slate-700 border-2 border-red-600 text-white shadow-lg shadow-red-600/10' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                        >
                          <span className="text-xs">{d}</span>
                          <span className={`text-[9px] font-black tracking-widest uppercase ${selectedDifficulty === d ? 'text-red-400' : 'text-slate-500'}`}>{XP_PER_QUESTION[d]}XP/câu</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-6 border-t border-slate-800 flex gap-4">
               <button onClick={() => setView('home')} className="flex-1 py-4 bg-slate-800 text-slate-300 font-black rounded-2xl">QUAY LẠI</button>
               <button 
                onClick={startSoloGame}
                disabled={isLoading}
                className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
               >
                 {isLoading ? (
                   <>
                    <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ĐANG TẠO ĐỀ...
                   </>
                 ) : 'BẮT ĐẦU CHIẾN'}
               </button>
            </div>
          </div>
        )}

        {view === 'game' && (
          <div className="max-w-4xl mx-auto space-y-3 sm:space-y-6 relative">
            {/* Floating XP + Streak — rendered inside score div below */}
            {/* Game info bar - compact on mobile */}
            <div className="flex items-center gap-2 sm:gap-4 bg-slate-900/50 p-3 sm:p-6 rounded-2xl sm:rounded-[30px] border border-slate-800 backdrop-blur-md relative z-10">
              <div className="flex-1 space-y-1 sm:space-y-2 min-w-0">
                <div className="flex justify-between text-[10px] sm:text-xs font-black uppercase text-slate-500 tracking-tighter">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="hidden sm:inline">Tiến độ Đấu Trường</span>
                    <span className="sm:hidden">Tiến độ</span>
                    <span className="px-1.5 sm:px-2 py-0.5 bg-red-600/10 border border-red-600/20 rounded text-[8px] sm:text-[9px] text-red-500 font-black">
                      {XP_PER_QUESTION[selectedDifficulty]}XP/câu
                    </span>
                  </div>
                  <span className={timeLeft <= 5 ? 'text-red-500 animate-pulse' : ''}>{timeLeft}s</span>
                </div>
                <div className="h-2 sm:h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-1000 ${timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-orange-400' : 'bg-red-600'}`}
                    style={{ width: `${(timeLeft / QUESTION_TIME_LIMIT) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-center px-2 sm:px-4 border-l border-slate-800 relative">
                 <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500">XP</p>
                 <p className="text-lg sm:text-2xl font-black text-white relative">
                   {gameScore.toLocaleString()}
                   {/* Floating +XP — starts at score number, floats up */}
                   {floatingXp && (
                     <span
                       key={floatingXp.id}
                       className="absolute left-1/2 -translate-x-1/2 bottom-full z-50 pointer-events-none float-up"
                     >
                       <span className="text-lg sm:text-2xl font-black text-yellow-400 drop-shadow-lg whitespace-nowrap">+{floatingXp.value} XP</span>
                     </span>
                   )}
                 </p>
              </div>
              <div className="text-center px-2 sm:px-4 border-l border-slate-800 relative group cursor-help">
                 <p className="text-[8px] sm:text-[10px] font-black uppercase text-slate-500">Streak</p>
                 <p className="text-lg sm:text-2xl font-black text-yellow-500 relative">
                   {currentStreak}🔥
                   {/* Floating streak — starts at streak number, floats up */}
                   {floatingStreak && floatingStreak.streak >= 2 && floatingXp && (
                     <span
                       key={`streak-${floatingXp.id}`}
                       className="absolute left-1/2 -translate-x-1/2 bottom-full z-50 pointer-events-none float-up"
                     >
                       <span className="text-sm sm:text-base font-black text-orange-400 drop-shadow-lg whitespace-nowrap">🔥 STREAK x{floatingStreak.streak}!</span>
                     </span>
                   )}
                 </p>
                 {/* Streak tooltip */}
                 <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl p-3 text-left opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[60] shadow-xl">
                   <p className="text-white font-bold text-xs">Trả lời đúng liên tiếp để nhận XP thưởng.</p>
                   <p className="text-yellow-400 font-black text-xs mt-1">STREAK {currentStreak} = {currentStreak}*5XP = {currentStreak * 5}XP</p>
                 </div>
              </div>
            </div>

            <QuestionCard
              key={`solo-question-${currentIndex}`}
              question={currentQuestions[currentIndex]}
              currentIndex={currentIndex}
              total={currentQuestions.length}
              selectedAnswer={selectedAnswer}
              onSelect={handleAnswer}
            />

            {selectedAnswer && (
              <div ref={explanationRef} className="bg-slate-900/90 border-2 border-slate-800 p-3 sm:p-10 rounded-2xl sm:rounded-[40px] animate-in slide-in-from-bottom-8 flex flex-col items-center text-center gap-2 sm:gap-6 shadow-2xl backdrop-blur-xl">
                <div className={`text-base sm:text-2xl font-black italic uppercase tracking-tighter ${
                  (() => {
                    if (selectedAnswer === '__timeout__') return false;
                    const q = currentQuestions[currentIndex];
                    if (q.correctAnswers && q.correctAnswers.length > 1) {
                      const chosen = selectedAnswer.split('|||');
                      return chosen.length === q.correctAnswers.length && chosen.every(a => q.correctAnswers!.includes(a));
                    }
                    return selectedAnswer === q.correctAnswer;
                  })() ? 'text-green-500' : 'text-red-500'
                }`}>
                  {selectedAnswer === '__timeout__' ? '⏱ HẾT GIỜ!' : (() => {
                    const q = currentQuestions[currentIndex];
                    const correct = q.correctAnswers && q.correctAnswers.length > 1
                      ? (() => { const c = selectedAnswer.split('|||'); return c.length === q.correctAnswers!.length && c.every(a => q.correctAnswers!.includes(a)); })()
                      : selectedAnswer === q.correctAnswer;
                    return correct ? '✨ TUYỆT VỜI! ✨' : '💔 TIẾC QUÁ...';
                  })()}
                </div>
                {currentFunExplanation && currentFunExplanation.trim() !== '' && (
                <div className="bg-slate-950/50 p-2.5 sm:p-6 rounded-xl sm:rounded-[24px] border border-slate-800/50 w-full max-w-2xl overflow-hidden">
                  <p className="text-slate-200 font-semibold italic text-xs sm:text-lg leading-relaxed break-words">
                    "{currentFunExplanation}"
                  </p>
                </div>
                )}
                <button
                  onClick={nextQuestion}
                  className="px-6 sm:px-14 py-2.5 sm:py-5 bg-red-600/80 text-white font-black rounded-xl sm:rounded-[20px] shadow-2xl shadow-red-600/40 active:scale-95 transition-all uppercase tracking-widest text-xs sm:text-sm opacity-70 hover:opacity-100"
                >
                  {advanceCountdown > 0 ? `QUA NGAY (${advanceCountdown}s) →` : 'NHẤN ĐỂ QUA NGAY →'}
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'results' && gameResults && (
          <div className="space-y-4">
            {/* Rank Banner — Top of results */}
            {myRank > 0 && (
              <div className={`max-w-6xl mx-auto px-2 sm:px-4 animate-in slide-in-from-top-4 duration-500`}>
                <div className={`flex items-center gap-4 p-4 rounded-2xl border ${
                  myRank === 1 ? 'bg-yellow-500/10 border-yellow-500/30' :
                  myRank <= 3 ? 'bg-amber-600/10 border-amber-600/30' :
                  myRank <= 10 ? 'bg-blue-600/10 border-blue-600/30' :
                  'bg-slate-800/50 border-slate-700'
                }`}>
                  <LbRankBadge rank={myRank} size="lg" />
                  <div>
                    <p className="font-black text-white text-sm">
                      Thứ hạng tuần này: <span className={myRank <= 3 ? 'text-yellow-400' : 'text-white'}>#{myRank}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {myRank === 1 ? 'BẠN ĐỨNG ĐẦU BẢNG XẾP HẠNG TUẦN NÀY!' :
                       myRank <= 3 ? 'Top 3 bảng xếp hạng tuần — Xuất sắc!' :
                       myRank <= 10 ? 'Top 10 bảng xếp hạng tuần — Tiếp tục cố lên!' :
                       'Tiếp tục thi đấu để leo hạng!'}
                    </p>
                  </div>
                  <button
                    onClick={() => setView('leaderboard')}
                    className="ml-auto text-xs font-black text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                  >
                    XEM BXH →
                  </button>
                </div>
              </div>
            )}
            <ResultAnalytics
              result={gameResults}
              analysis={expertAdvice}
              onClose={() => setView('home')}
              onPlayAgain={() => startSoloGame()}
              onChooseTopic={() => setView('solo-config')}
            />
          </div>
        )}

        {view === 'profile' && user && (
          <ProfilePage
            user={user}
            onUpdateAvatar={handleUpdateAvatar}
            onBack={() => setView('home')}
            onPracticeTopic={handlePracticeTopic}
            onViewRewards={() => setView('rewards')}
            onViewCertificate={() => setView('certificate')}
          />
        )}

        {view === 'rewards' && user && (
          <RewardsPage
            user={user}
            onEquipFrame={handleEquipFrame}
            onSpinResult={handleSpinResult}
            onBack={() => setView('profile')}
            onNavigate={(v: string) => setView(v as any)}
          />
        )}

        {view === 'history' && (
          <HistoryPage
            history={gameHistory}
            user={user}
            allUsers={leaderboardData}
            onBack={() => setView('home')}
            onRecalculate={(fixedHistory, xpDiff) => {
              setGameHistory(fixedHistory);
              localStorage.setItem('arena_x_history', JSON.stringify(fixedHistory));
              if (user) {
                // Tính lại weeklyXp từ các ván trong tuần hiện tại
                const currentWeek = getCurrentProgramWeek();
                let recalcWeeklyXp = 0;
                if (currentWeek) {
                  const PROGRAM_START = new Date('2026-06-01').getTime();
                  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                  const weekStart = PROGRAM_START + (currentWeek - 1) * msPerWeek;
                  const weekEnd = weekStart + msPerWeek;
                  recalcWeeklyXp = fixedHistory
                    .filter(g => {
                      const t = new Date(g.playedAt).getTime();
                      return t >= weekStart && t < weekEnd;
                    })
                    .reduce((sum, g) => sum + g.xpEarned, 0);
                }
                const updatedUser = {
                  ...user,
                  xp: Math.max(0, Math.round(user.xp + xpDiff)),
                  weeklyXp: recalcWeeklyXp,
                  weeklyXpWeek: currentWeek || user.weeklyXpWeek,
                };
                setUser(updatedUser);
                localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
                upsertUserProfile(updatedUser).catch(console.error);
              }
            }}
            onRecalculateAll={async () => {
              const currentWeek = getCurrentProgramWeek();
              const PROGRAM_START = new Date('2026-06-01').getTime();
              const result = await recalculateAllUsersXp(PROGRAM_START, currentWeek);
              // Reload current user from Supabase after fix
              if (user) {
                const fresh = await getUserProfile(user.id);
                if (fresh) {
                  setUser(fresh);
                  localStorage.setItem('arena_x_user', JSON.stringify(fresh));
                }
                // Also reload history
                const freshHistory = await getGameHistoryFromSupabase(user.id, 50);
                if (freshHistory.length > 0) {
                  setGameHistory(freshHistory);
                  localStorage.setItem('arena_x_history', JSON.stringify(freshHistory));
                }
              }
              return result;
            }}
          />
        )}

        {view === 'lobby' && user && (
          <MultiplayerLobby
            user={user}
            topicsByGrade={topicsByGrade}
            grades={grades}
            onStartGame={handleStartMultiplayerGame}
            onBack={() => setView('home')}
          />
        )}

        {view === 'multiplayer-game' && user && multiplayerState && (
          <MultiplayerGame
            user={user}
            roomCode={roomCode}
            initialState={multiplayerState}
            questions={multiplayerQuestions}
            isHost={isHost}
            onGameEnd={handleMultiplayerGameEnd}
            onLeave={handleLeaveMultiplayer}
          />
        )}

        {view === 'leaderboard' && (
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-500">
             <div className="text-center">
               <h2 className="text-lg sm:text-2xl md:text-4xl font-black italic tracking-tighter">BẢNG VÀNG HỆ THỐNG</h2>
             </div>

             {/* All-time / Weekly tabs */}
             <div className="flex gap-2 justify-center">
               <button
                 onClick={() => setLeaderboardTab('alltime')}
                 className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all ${leaderboardTab === 'alltime' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
               >
                 Toàn thời gian
               </button>
               <button
                 onClick={() => setLeaderboardTab('weekly')}
                 className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all ${leaderboardTab === 'weekly' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
               >
                 ⚡ Tuần này
               </button>
             </div>

             {/* Grade Filter — only for all-time */}
             {leaderboardTab === 'alltime' && (
               <div className="overflow-x-auto pb-2 -mx-2 px-2">
                 <div className="flex gap-1.5 sm:gap-2 justify-start sm:justify-center min-w-max sm:min-w-0 sm:flex-wrap">
                   <button
                     onClick={() => setLeaderboardGradeFilter('all')}
                     className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${leaderboardGradeFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                   >
                     Toàn bộ
                   </button>
                   {grades.map(grade => (
                     <button
                       key={grade}
                       onClick={() => setLeaderboardGradeFilter(grade)}
                       className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${leaderboardGradeFilter === grade ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                     >
                       Khối {grade}
                     </button>
                   ))}
                 </div>
               </div>
             )}

             {/* Render leaderboard list (shared logic) */}
             {(() => {
               const isWeekly = leaderboardTab === 'weekly';
               const rawData = isWeekly ? weeklyLeaderboardData : leaderboardData;
               const isGradeFilter = !isWeekly && leaderboardGradeFilter !== 'all';

               const getDisplayXp = (p: UserProfile) => {
                 if (isWeekly) return p.weeklyXp || 0;
                 if (isGradeFilter && p.gradeXp) return p.gradeXp[leaderboardGradeFilter as number] || 0;
                 return p.xp;
               };

               const userInList = rawData.some(p => p.id === user.id);
               const userHasXp = !isGradeFilter || (user.gradeXp && user.gradeXp[leaderboardGradeFilter as number] > 0);
               let combinedData: UserProfile[] = userInList
                 ? rawData
                 : (userHasXp ? [...rawData, user] : rawData);

               combinedData = combinedData.sort((a, b) => getDisplayXp(b) - getDisplayXp(a));
               if (isGradeFilter) combinedData = combinedData.filter(p => getDisplayXp(p) > 0);
               if (isWeekly) combinedData = combinedData.filter(p => (p.weeklyXp || 0) > 0);

               const top3 = combinedData.slice(0, 3);
               const rest = combinedData.slice(3);

               return (
                 <div className="space-y-4">
                   {isLoadingLeaderboard ? (
                     <div className="flex items-center justify-center py-16">
                       <div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                       <span className="ml-4 text-slate-400 font-bold">Đang tải...</span>
                     </div>
                   ) : combinedData.length === 0 ? (
                     <div className="text-center py-16">
                       <p className="text-slate-500 font-bold">Chưa có dữ liệu xếp hạng</p>
                     </div>
                   ) : (
                     <>
                       {/* Unified Leaderboard List */}
                       <div className="bg-slate-900/80 border border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
                         {/* Column header */}
                         <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-b border-slate-700/60 bg-slate-800/40">
                           <span className="w-9 sm:w-11 text-center text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider">Hạng</span>
                           <span className="flex-1 text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider pl-1">Thí sinh</span>
                           <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider text-right">XP {isWeekly ? 'Tuần' : 'Tích lũy'}</span>
                         </div>

                         {combinedData.map((p, i) => {
                           const isMe = p.id === user.id;
                           const levelConfig = LEVEL_CONFIG.find(c => c.level === p.level);
                           const displayXp = getDisplayXp(p);
                           const displayRank = isMe && myRank > 0 ? myRank : i + 1;
                           const isTop3 = displayRank <= 3;

                           return (
                             <div
                               key={p.id}
                               className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-6 border-b border-slate-800/60 last:border-0 transition-colors ${
                                 isMe ? 'bg-red-600/8 border-l-2 border-l-red-500' : ''
                               } ${isTop3 ? 'py-4 sm:py-5' : 'py-3 sm:py-4'}`}
                             >
                               {/* Rank badge */}
                               <LbRankBadge rank={displayRank} size={isTop3 ? 'md' : 'sm'} />

                               {/* Avatar + Info */}
                               <div className="flex-1 flex items-center gap-3 sm:gap-4 min-w-0">
                                 <LbRankedAvatar
                                   rank={displayRank}
                                   avatar={p.avatar}
                                   name={p.name}
                                   equippedFrame={p.equippedFrame}
                                   unlockedFrames={p.unlockedFrames}
                                   size={isTop3 ? 'lg' : 'md'}
                                 />
                                 <div className="min-w-0">
                                   <p className={`font-black truncate ${isTop3 ? 'text-sm sm:text-base text-white' : 'text-sm text-slate-200'}`}>
                                     {p.name}{isMe ? ' (Tôi)' : ''}
                                   </p>
                                   <div className="flex items-center gap-1.5 mt-0.5">
                                     {levelConfig && (
                                       <span className="text-[9px] sm:text-[10px] font-black uppercase" style={{ color: levelConfig.color }}>
                                         {levelConfig.title}
                                       </span>
                                     )}
                                     <span className="text-[9px] sm:text-[10px] font-bold text-slate-600">LV.{p.level}</span>
                                   </div>
                                 </div>
                               </div>

                               {/* Grade (optional) */}
                               {!isGradeFilter && !isWeekly && (
                                 <div className="text-center w-10 hidden sm:block flex-shrink-0">
                                   <p className="font-black text-slate-400 text-sm">{p.grade}</p>
                                   <p className="text-[7px] font-black text-slate-600 uppercase">Khối</p>
                                 </div>
                               )}

                               {/* XP */}
                               <div className="text-right flex-shrink-0">
                                 <p className={`font-mono font-black ${isTop3 ? 'text-sm sm:text-base text-white' : 'text-sm text-slate-300'}`}>
                                   {displayXp.toLocaleString()}
                                 </p>
                                 <p className="text-[7px] sm:text-[8px] font-black text-slate-600 uppercase">{isWeekly ? 'XP Tuần' : 'XP'}</p>
                               </div>
                             </div>
                           );
                         })}
                       </div>

                       {/* My rank banner if not in top 20 */}
                       {myRank > 20 && (
                         <div className="bg-red-600/10 border border-red-600/20 rounded-2xl p-4 text-center">
                           <p className="text-sm font-black text-red-400">Thứ hạng của bạn: #{myRank}</p>
                         </div>
                       )}
                     </>
                   )}
                 </div>
               );
             })()}

             <button onClick={() => setView('home')} className="w-full py-3 sm:py-5 bg-slate-800 text-white font-black rounded-xl sm:rounded-2xl hover:bg-slate-700 transition-colors text-sm sm:text-base">QUAY LẠI</button>
          </div>
        )}

        {view === 'stats' && (
          <StatsPage onBack={() => setView('home')} />
        )}

        {view === 'certificate' && user && (
          <CertificatePage
            user={user}
            onBack={() => setView('profile')}
          />
        )}

        {view === 'roadmap' && user && (
          <RoadmapPage
            user={user}
            onBack={() => setView('home')}
            onGoRewards={() => setView('rewards')}
          />
        )}
        </Suspense>
      </main>

      {/* Frame Unlock Popup */}
      {showFrameUnlock && newlyUnlockedItems.length > 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border-2 border-purple-500 rounded-[32px] p-8 max-w-sm w-full shadow-2xl text-center animate-in zoom-in-95 duration-300"
            style={{ boxShadow: '0 0 40px rgba(168,85,247,0.4)' }}>
            <div className="text-5xl mb-4 animate-bounce">🎉</div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">MỞ KHÓA THÀNH CÔNG!</h3>
            <p className="text-slate-400 text-sm mb-6">Bạn đã nhận được phần thưởng mới:</p>
            <div className="space-y-3 mb-6">
              {newlyUnlockedItems.map(itemId => {
                const frame = WEEKLY_FRAMES.find(f => f.items.some(i => i.id === itemId));
                const item = frame?.items.find(i => i.id === itemId);
                if (!item || !frame) return null;
                return (
                  <div key={itemId} className="flex items-center gap-3 bg-slate-800 rounded-2xl p-3">
                    <span className="text-2xl">{item.emoji}</span>
                    <div className="text-left">
                      <p className="font-black text-white text-sm">{item.name}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: frame.color }}>
                        Tuần {frame.week}: {frame.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowFrameUnlock(false); setView('rewards'); }}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-sm uppercase tracking-widest transition-all"
              >
                XEM KHO
              </button>
              <button
                onClick={() => setShowFrameUnlock(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-2xl text-sm uppercase tracking-widest transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rank Popup */}
      {showRankPopup && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setShowRankPopup(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-[32px] p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">BXH TUẦN NÀY</p>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl ${
                myWeeklyRank === 1 ? 'bg-yellow-500/20 border border-yellow-500/40' :
                myWeeklyRank <= 3 ? 'bg-amber-600/20 border border-amber-600/40' :
                myWeeklyRank <= 10 ? 'bg-blue-600/20 border border-blue-600/40' :
                'bg-slate-800 border border-slate-700'
              }`}>
                <LbRankBadge rank={myWeeklyRank} size="lg" />
                <div>
                  <p className="font-black text-white text-lg leading-none">#{myWeeklyRank}</p>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {user.weeklyXp.toLocaleString()} XP tuần
                  </p>
                </div>
              </div>
            </div>
            {weeklyTop5.length > 0 && (
              <div className="space-y-2 mb-5">
                {weeklyTop5.map((p, i) => {
                  const isMe = p.id === user.id;
                  const rank = i + 1;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                        isMe ? 'bg-red-600/10 border border-red-600/30' : 'bg-slate-800/60'
                      }`}
                    >
                      <LbRankBadge rank={rank} size="sm" />
                      <AvatarDisplay
                        avatar={p.avatar}
                        name={p.name}
                        equippedFrame={p.equippedFrame}
                        unlockedFrames={p.unlockedFrames}
                        size="sm"
                      />
                      <p className="flex-1 font-black text-sm text-white truncate">
                        {p.name}{isMe ? ' (Tôi)' : ''}
                      </p>
                      <p className="font-mono text-sm font-black text-slate-300 shrink-0">
                        {p.weeklyXp.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
                {myWeeklyRank > 5 && (
                  <>
                    <div className="text-center text-slate-700 text-xs font-bold py-1">· · ·</div>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-red-600/10 border border-red-600/30">
                      <span className="text-sm font-black text-red-400 w-7 text-center shrink-0">#{myWeeklyRank}</span>
                      <AvatarDisplay
                        avatar={user.avatar}
                        name={user.name}
                        equippedFrame={user.equippedFrame}
                        unlockedFrames={user.unlockedFrames}
                        size="sm"
                      />
                      <p className="flex-1 font-black text-sm text-white truncate">{user.name} (Tôi)</p>
                      <p className="font-mono text-sm font-black text-slate-300 shrink-0">
                        {user.weeklyXp.toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRankPopup(false); setView('leaderboard'); }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all"
              >
                XEM BXH ĐẦY ĐỦ
              </button>
              <button
                onClick={() => setShowRankPopup(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl text-xs uppercase tracking-widest transition-all border border-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
