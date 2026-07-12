
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import AvatarDisplay from './components/AvatarDisplay';

const QuestionCard = lazy(() => import('./components/QuestionCard'));
const ResultAnalytics = lazy(() => import('./components/ResultAnalytics'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const SpinAdminPage = lazy(() => import('./components/SpinAdminPage'));

/** Hash route ẩn cho trang quản lý vòng quay — chỉ ai biết link mới vào được */
const SPIN_ADMIN_HASH = '#admin-vongquay';
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
import { DEFAULT_GRADES, DEFAULT_TOPICS_BY_GRADE, LEVEL_CONFIG, PROGRAM_START_DATE, WEEKLY_FRAMES, getCurrentProgramWeek } from './constants';
import { TopicsByGrade, fetchQuestionsFromSheet } from './services/sheets';
import { fetchK9Questions, getK9Topics } from './services/k9Questions';
import { fetchK6Questions, getK6Difficulties, getK6Topics } from './services/k6Questions';
import { fetchK7Questions, getK7Difficulties, getK7Topics } from './services/k7Questions';
import { fetchK8Questions, getK8Difficulties, getK8Topics } from './services/k8Questions';
import {
  supabase,
  getLeaderboard,
  getLeaderboardByGrade,
  getWeeklyLeaderboard,
  getUserProfile,
  createUserProfile,
  upsertUserProfile,
  updateUserProfile,
  getGameHistory as getGameHistoryFromSupabase,
  recalculateAllUsersXp,
  getUserRank,
  getWeeklyUserRank,
  getWeeklyUserXp,
  getUserHistoryStats,
  recordGame
} from './services/supabase';
import { calculateDetailedXp, playSound, getLevelFromXp, generateRoomCode, DIFFICULTY_MULTIPLIERS, XP_PER_QUESTION } from './utils/gameLogic';
import {
  SOLO_WEEKLY_MATCH_CAP,
  THACH_DAU_DAILY_MATCH_CAP,
  THACH_DAU_WINDOW_LABEL,
  countSoloThisWeek,
  countThachDauTodayInWindow,
  getThachDauStatus,
  getVnParts,
} from './utils/programRules';
import { checkNewUnlocks, isFrameUsable, getFrameById } from './utils/frameLogic';
import { generateQuestions, getExpertAnalysis } from './services/gemini';
import { sendGameResultToEduso, createEndGameParams } from './utils/edusoApi';
import { startGame as startMultiplayerGame } from './utils/multiplayerSync';
import { getPlayerId, clearActiveRoom, checkRejoinableRoom, updateActiveRoomPhase, isAvatarImage, normalizeAvatarUrl } from './utils/playerSession';

/**
 * Reset weeklyXp khi profile không chứng minh được giá trị thuộc tuần hiện tại.
 * Mỗi tuần có bộ milestone riêng — không được phép dùng XP tuần cũ để unlock tuần mới.
 *
 * Nguyên tắc: weeklyXp chỉ được coi là "của tuần hiện tại" KHI `weeklyXpWeek === currentWeek`.
 * Bất kỳ trường hợp nào khác (null vì data cũ / load từ server không sync field này,
 * hay tuần đã đổi) đều phải reset về 0; giá trị thực sẽ được reconcile lại bằng
 * `getWeeklyUserXp` (đếm trực tiếp từ game/spin history theo range tuần đúng).
 */
function normalizeWeeklyXp(profile: UserProfile): UserProfile {
  const currentWeek = getCurrentProgramWeek();
  if (currentWeek === null) return profile; // Ngoài chương trình — giữ nguyên
  if (profile.weeklyXpWeek === currentWeek) return profile; // Cùng tuần — OK
  // Bao gồm cả case weeklyXpWeek == null: không chứng minh được là tuần này → reset.
  return { ...profile, weeklyXp: 0, weeklyXpWeek: currentWeek };
}

/** ── Leaderboard Components — asset cắt trực tiếp từ ảnh thiết kế gốc (public/lb) ── */

const LB_ASSET = ((import.meta as any).env?.BASE_URL || '/') + 'lb/';

/** Bề rộng card trong ảnh gốc (px nguồn) — dùng để quy đổi % giữ đúng tỉ lệ thiết kế */
const LB_CARD_W = 3488;
const LB_BADGE_DIM: Record<string, [number, number]> = {
  '1': [448, 384], '2': [520, 384], '3': [520, 343], 'n': [520, 384],
};
const LB_FRAME_GEO: Record<string, { img: string; w: number; h: number; cx: number; cy: number; r: number }> = {
  '1': { img: 'frame1.png', w: 679, h: 583, cx: 339.5, cy: 332, r: 216 },
  '2': { img: 'frame2.png', w: 605, h: 518, cx: 306.6, cy: 284, r: 191 },
  '3': { img: 'frame3.png', w: 510, h: 510, cx: 255, cy: 269, r: 165 },
  'n': { img: 'frame_n.png', w: 605, h: 518, cx: 306.6, cy: 284, r: 191 },
};
const LB_CARD_STYLE: Record<string, { bg: string; aspect: string; xp: string }> = {
  '1': { bg: 'card1.jpg', aspect: '3508 / 552', xp: '#FFD700' },
  '2': { bg: 'card2.jpg', aspect: '3508 / 528', xp: '#F8FAFC' },
  '3': { bg: 'card3.jpg', aspect: '3508 / 515', xp: '#FB923C' },
  'n': { bg: 'card_n.jpg', aspect: '3508 / 330', xp: '#CBD5E1' },
};

/** Huy hiệu hạng có cánh — ảnh thật từ thiết kế; hạng 4+ dùng bản xám + số overlay */
const LbRankBadge: React.FC<{ rank: number; size?: 'sm' | 'md' | 'lg' | 'fluid' }> = ({ rank, size = 'md' }) => {
  const key = rank >= 1 && rank <= 3 ? String(rank) : 'n';
  const [bw, bh] = LB_BADGE_DIM[key];
  const width = size === 'fluid' ? '100%' : size === 'lg' ? 64 : size === 'md' ? 52 : 40;
  if (rank >= 1 && rank <= 3) {
    return <img src={`${LB_ASSET}badge${rank}.png`} alt={`Hạng ${rank}`} draggable={false} className="flex-shrink-0 select-none" style={{ width }} />;
  }
  return (
    <div className="relative flex-shrink-0 select-none" style={{ width }}>
      <img src={`${LB_ASSET}badge_n.png`} alt={`Hạng ${rank}`} draggable={false} className="block w-full h-auto" />
      <svg viewBox={`0 0 ${bw} ${bh}`} className="absolute inset-0 w-full h-full">
        <text x={bw * 0.487} y={bh * 0.385} textAnchor="middle" dominantBaseline="central" fill="#cbd5e1" fontWeight="900" fontSize={rank > 99 ? 92 : 118} fontFamily="system-ui, sans-serif">{rank}</text>
      </svg>
    </div>
  );
};

/** Avatar trên BXH — dùng khung avatar người chơi tự trang bị (equippedFrame),
 *  không dùng khung nguyệt quế cắt từ thiết kế nữa. */
const LbRankedAvatar: React.FC<{
  avatar: string;
  name: string;
  equippedFrame?: string;
  unlockedFrames?: string[];
  fluid?: boolean;
  px?: number;
}> = ({ avatar, name, equippedFrame, unlockedFrames, fluid, px }) => {
  const frame = equippedFrame ? getFrameById(equippedFrame) : null;
  const showFrame = !!frame && isFrameUsable(frame.id, unlockedFrames || []);
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  return (
    <div
      className="relative flex-shrink-0 select-none"
      // fluid: lấp đầy parent (parent quyết định kích thước vuông theo chiều cao dòng)
      style={fluid ? { width: '100%', height: '100%' } : { width: px || 72 }}
    >
      {!fluid && <div style={{ paddingTop: '100%' }} />}
      {/* Avatar tròn ở giữa (~78%) — không có khung thì cũng không vẽ viền đè lên avatar */}
      <div
        className="absolute rounded-full overflow-hidden bg-slate-800 flex items-center justify-center"
        style={{ left: '11%', top: '11%', width: '78%', height: '78%' }}
      >
        {isAvatarImage(avatar) ? (
          <img src={normalizeAvatarUrl(avatar)} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span style={{ fontSize: '180%' }}>{avatar || '?'}</span>
        )}
      </div>
      {/* Khung của người chơi (nếu có + đủ điều kiện dùng) */}
      {showFrame && frame && (
        <img
          src={`${baseUrl}${frame.frameImage}`}
          alt={frame.name}
          draggable={false}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}
    </div>
  );
};

/** Icon + màu cho danh hiệu level */
const LB_LEVEL_META: Record<string, { icon: string; color: string }> = {
  'Tập sự': { icon: '⭐', color: '#FB923C' },
  'Chiến binh': { icon: '🛡️', color: '#60A5FA' },
  'Bậc thầy': { icon: '👑', color: '#FFD700' },
  'Tinh Anh': { icon: '🌏', color: '#C084FC' },
  'Huyền thoại': { icon: '💎', color: '#22D3EE' },
};

/** Hook: viewport mobile (<640px) — BXH mobile dùng chung 1 kích thước card */
const useIsMobileViewport = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isMobile;
};

/** Card thí sinh — nền cắt nguyên bản từ thiết kế (viền, glow, tia sét bake sẵn).
 *  Desktop: rank 1-3 card lớn, rank 4+ thu nhỏ.
 *  Mobile: MỌI vị trí dùng chung kích thước như top 3 (số hạng, avatar, chữ to rõ). */
/** Popup hiện thông tin chi tiết khi click vào avatar trên BXH.
 *  Avatar phóng to để nhìn rõ hơn, kèm khung, rank badge, tên, danh hiệu, XP. */
const LbAvatarPopup: React.FC<{
  profile: UserProfile;
  rank: number;
  xp: number;
  isMe: boolean;
  xpLabel: string;
  onClose: () => void;
}> = ({ profile, rank, xp, isMe, xpLabel, onClose }) => {
  const meta = LB_LEVEL_META[profile.level] || { icon: '⭐', color: '#FB923C' };
  const isTop3 = rank >= 1 && rank <= 3;
  const accentColor = isTop3
    ? (rank === 1 ? '#FFD700' : rank === 2 ? '#C0D5E8' : '#FF8C42')
    : '#64748B';
  // ESC để đóng
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl"
        style={{ boxShadow: `0 0 60px ${accentColor}33, 0 20px 60px rgba(0,0,0,0.6)` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Nút đóng */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors text-lg font-black"
          aria-label="Đóng"
        >
          ×
        </button>

        {/* Rank badge nhỏ ở góc trên trái */}
        <div className="absolute -top-3 -left-3 w-16 sm:w-20">
          <LbRankBadge rank={rank} size="fluid" />
        </div>

        {/* Avatar lớn ở giữa */}
        <div className="flex justify-center mb-4 pt-4">
          <div style={{ width: 200, height: 200 }}>
            <LbRankedAvatar
              avatar={profile.avatar}
              name={profile.name}
              equippedFrame={profile.equippedFrame}
              unlockedFrames={profile.unlockedFrames}
              fluid
            />
          </div>
        </div>

        {/* Tên */}
        <h2 className="text-center font-black text-white text-xl sm:text-2xl leading-tight px-2 break-words">
          {profile.name}{isMe ? ' (Tôi)' : ''}
        </h2>

        {/* Danh hiệu */}
        <p
          className="text-center font-black uppercase tracking-widest text-sm mt-2"
          style={{ color: meta.color }}
        >
          {meta.icon} {profile.level}
        </p>

        {/* Đường phân cách */}
        <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

        {/* Hạng + XP */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/40 p-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Hạng</p>
            <p className="font-mono font-black text-2xl" style={{ color: accentColor }}>#{rank}</p>
          </div>
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/40 p-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{xpLabel}</p>
            <p className="font-mono font-black text-2xl text-amber-400">{xp.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const LbCard: React.FC<{ rank: number; profile: UserProfile; xp: number; isMe: boolean; onAvatarClick?: () => void }> = ({ rank, profile, xp, isMe, onAvatarClick }) => {
  const isMobile = useIsMobileViewport();
  const top3 = rank <= 3;
  const st = LB_CARD_STYLE[top3 ? String(rank) : 'n'];
  const meta = LB_LEVEL_META[profile.level] || { icon: '⭐', color: '#FB923C' };
  // Mobile: đồng nhất mọi hạng cùng 1 kích thước (scale 1)
  const big = top3 || isMobile;
  const scale = big ? 1 : 0.62;
  const badgeKey = top3 ? String(rank) : 'n';
  const badgePct = (LB_BADGE_DIM[badgeKey][0] / LB_CARD_W) * 100 * scale;
  // Top 3 (và mobile): dùng cùng kích thước khung (679 — lớn nhất) để avatar đều nhau
  // Rank 4+ desktop: tăng tỷ lệ avatar để nhìn rõ hơn
  const frameW = big ? 679 : LB_FRAME_GEO['n'].w;
  const frameScale = big ? 1 : 0.78;
  const framePct = (frameW / LB_CARD_W) * 100 * frameScale;
  // Mobile hạng 4+: dùng tỉ lệ card top 3 (mẫu hạng 2) để cao bằng nhau
  const aspect = !top3 && isMobile ? LB_CARD_STYLE['2'].aspect : st.aspect;
  return (
    <div
      className={`relative w-full ${isMe ? 'ring-2 ring-red-500/60 rounded-lg' : ''}`}
      style={{ aspectRatio: aspect, backgroundImage: `url(${LB_ASSET}${st.bg})`, backgroundSize: '100% 100%' }}
    >
      <div className="absolute inset-0 flex items-center" style={{ paddingLeft: '0.8%', paddingRight: '7.5%' }}>
        <div className="flex-shrink-0" style={{ width: `${badgePct}%` }}>
          <LbRankBadge rank={rank} size="fluid" />
        </div>
        <div className="flex-shrink-0" style={{ width: '1.2%' }} />
        {/* Ô avatar: vuông theo CHIỀU CAO dòng (88%) để khung không tràn ra ngoài */}
        <div className="flex-shrink-0 h-full flex items-center justify-center" style={{ width: `${framePct}%` }}>
          <div
            style={{ height: '94%', aspectRatio: '1 / 1', maxWidth: '100%' }}
            className={onAvatarClick ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : ''}
            onClick={onAvatarClick ? (e) => { e.stopPropagation(); onAvatarClick(); } : undefined}
            role={onAvatarClick ? 'button' : undefined}
            aria-label={onAvatarClick ? `Xem chi tiết ${profile.name}` : undefined}
          >
            <LbRankedAvatar
              avatar={profile.avatar}
              name={profile.name}
              equippedFrame={profile.equippedFrame}
              unlockedFrames={profile.unlockedFrames}
              fluid
            />
          </div>
        </div>
        <div className="flex-1 min-w-0" style={{ paddingLeft: '2.5%' }}>
          <p className={`font-black text-white truncate leading-tight ${big ? 'text-sm sm:text-2xl' : 'text-xs sm:text-base'}`}>
            {profile.name}{isMe ? ' (Tôi)' : ''}
          </p>
          <p className={`font-black uppercase tracking-wide ${big ? 'text-[11px] sm:text-sm mt-0.5 sm:mt-1' : 'text-[10px] sm:text-[11px] mt-0.5'}`} style={{ color: meta.color }}>
            {meta.icon} {profile.level}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-mono font-black leading-none ${big ? 'text-lg sm:text-4xl' : 'text-xs sm:text-lg'}`} style={{ color: st.xp, textShadow: `0 0 14px ${st.xp}55` }}>
            {xp.toLocaleString()}
          </p>
          <p className={`font-black uppercase ${big ? 'text-[10px] sm:text-xs' : 'text-[10px]'} mt-0.5`} style={{ color: st.xp, opacity: 0.75 }}>XP</p>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // Trang quản lý vòng quay (link ẩn, không có trong menu) — render độc lập
  const [isSpinAdmin] = useState(() => typeof window !== 'undefined' && window.location.hash === SPIN_ADMIN_HASH);

  // Navigation & User
  const [view, setView] = useState<'login' | 'home' | 'solo-config' | 'lobby' | 'game' | 'multiplayer-game' | 'results' | 'leaderboard' | 'profile' | 'history' | 'stats' | 'rewards' | 'certificate' | 'roadmap'>('login');
  // Ref theo dõi view hiện tại cho các callback async (closure cũ không thấy view mới)
  const viewRef = React.useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
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
  // XP tuần này tính từ game history (cùng nguồn BXH). KHÔNG dùng user.weeklyXp vì
  // cột weekly_xp trong DB không tự reset → giữ XP tuần trước, làm hỏng BXH tuần.
  const [myWeeklyXp, setMyWeeklyXp] = useState<number>(0);
  const [weeklyTop5, setWeeklyTop5] = useState<UserProfile[]>([]);
  const [showRankPopup, setShowRankPopup] = useState(false);

  // Popup chi tiết khi click avatar trên BXH
  const [lbAvatarPopup, setLbAvatarPopup] = useState<{
    profile: UserProfile; rank: number; xp: number; isMe: boolean; xpLabel: string;
  } | null>(null);

  // Frame unlock popup state
  const [newlyUnlockedItems, setNewlyUnlockedItems] = useState<string[]>([]);
  const [showFrameUnlock, setShowFrameUnlock] = useState(false);

  // Thông báo chặn khi vi phạm quy định chương trình (đóng khung giờ, hết lượt...)
  const [programRuleNotice, setProgramRuleNotice] = useState<{ title: string; lines: string[] } | null>(null);

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
        // Hàng của chính mình dùng avatar/khung local (server có thể chưa sync)
        setWeeklyTop5(top5.map(p =>
          p.id === user.id
            ? { ...p, name: user.name, avatar: user.avatar, equippedFrame: user.equippedFrame, unlockedFrames: user.unlockedFrames }
            : p
        ));
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

        // Fetch actual rank for current user (cả all-time lẫn tuần — mỗi tab dùng rank riêng)
        const gradeFilter = leaderboardGradeFilter === 'all' ? undefined : leaderboardGradeFilter;
        const [rank, weeklyRank, weeklyXpFresh] = await Promise.all([
          getUserRank(user.id, gradeFilter),
          getWeeklyUserRank(user.id),
          getWeeklyUserXp(user.id),
        ]);
        setMyRank(rank);
        setMyWeeklyRank(weeklyRank);
        setMyWeeklyXp(weeklyXpFresh);

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

  /**
   * Đồng bộ XP + số trận của profile = tổng tích lũy từ TOÀN BỘ lịch sử đấu
   * (server + các trận local chưa sync). Lịch sử là nguồn sự thật;
   * counter trong profile có thể drift (merge max() nhiều thiết bị, bug cũ).
   */
  // Đồng bộ điểm hiển thị từ SERVER (chỉ ĐỌC — không bao giờ ghi ngược lên server).
  // Quy tắc (Viet 2026-07-03): client không được ghi đè điểm; điểm chỉ được cộng
  // atomic qua RPC (edux_record_game / edux_spin_wheel). Hàm này chỉ kéo giá trị
  // đúng từ server về cập nhật state + localStorage cho UI, KHÔNG upsert.
  const reconcileXpWithHistory = async (userId: string) => {
    try {
      // Tổng XP toàn thời gian: lấy trực tiếp từ profile trên server (đã được RPC
      // cộng atomic, là nguồn đúng duy nhất). KHÔNG cộng thêm trận local chưa sync —
      // nếu có trận chưa ghi, chính recordGame sẽ cộng khi nó sync, không tự cộng ở đây.
      const serverProfile = await getUserProfile(userId);
      if (!serverProfile) return;

      // XP TUẦN NÀY: nguồn đáng tin = getWeeklyUserXp (game + spin trong range tuần).
      const currentWeek = getCurrentProgramWeek();
      let authoritativeWeeklyXp: number | null = null;
      if (currentWeek !== null) {
        try {
          authoritativeWeeklyXp = await getWeeklyUserXp(userId);
        } catch { /* mạng lỗi — bỏ qua, giữ giá trị local */ }
      }

      setUser(prev => {
        if (!prev || prev.id !== userId) return prev;
        const nextWeeklyXp = authoritativeWeeklyXp ?? prev.weeklyXp;
        const nextWeeklyWeek = currentWeek ?? prev.weeklyXpWeek;
        // Server thắng tuyệt đối cho mọi field điểm tích lũy.
        const syncedUser: UserProfile = {
          ...prev,
          xp: serverProfile.xp,
          totalGames: serverProfile.totalGames,
          bestStreak: serverProfile.bestStreak,
          gradeXp: serverProfile.gradeXp || {},
          topicStats: serverProfile.topicStats || {},
          level: getLevelFromXp(serverProfile.xp).level,
          weeklyXp: nextWeeklyXp,
          weeklyXpWeek: nextWeeklyWeek,
        };
        localStorage.setItem('arena_x_user', JSON.stringify(syncedUser));
        // KHÔNG upsert lên server — chỉ cập nhật hiển thị local.
        return syncedUser;
      });
    } catch (e) {
      console.error('Error reconciling XP from server:', e);
    }
  };

  // Load user, history và khôi phục game state khi app khởi động
  useEffect(() => {
    const initializeApp = async () => {
      // ── Watermark reset chương trình ──────────────────────────────────────
      // Admin chạy edux_admin_reset_program() trên Supabase sẽ bump
      // edux_program_meta.last_reset_at. Nếu giá trị server > giá trị máy
      // này đã thấy → server vừa reset; phải wipe localStorage TRƯỚC khi
      // load user (nếu không Math.max(local.xp, 0) sẽ ghi đè XP cũ lên
      // server, làm reset bị "đảo ngược").
      try {
        const { data: metaRow } = await supabase
          .from('edux_program_meta')
          .select('value')
          .eq('key', 'last_reset_at')
          .maybeSingle();
        const serverResetAt = metaRow?.value || '';
        const seenResetAt = localStorage.getItem('arena_x_program_reset_seen') || '';
        if (serverResetAt && serverResetAt !== seenResetAt) {
          // Wipe các cache liên quan tiến trình (giữ avatar/preferences nếu cần)
          localStorage.removeItem('arena_x_user');
          localStorage.removeItem('arena_x_history');
          localStorage.removeItem('arena_x_weekly_xp_week');
          localStorage.setItem('arena_x_program_reset_seen', serverResetAt);
          console.info('[EduX] Phát hiện program reset mới — đã dọn localStorage và reload.');
          window.location.reload();
          return;
        }
      } catch (e) {
        // Bảng edux_program_meta chưa được tạo → bỏ qua, app chạy như cũ
        console.debug('program meta check skipped:', e);
      }

      // Load user từ localStorage CHỈ để biết id cần đồng bộ + hiển thị tạm trong
      // lúc chờ mạng (offline-first). KHÔNG được tin bất kỳ field số liệu nào từ
      // local (xp, totalGames, bestStreak, gradeXp, topicStats, unlockedFrames...) —
      // local có thể mang dữ liệu rác/cũ (vd từ bản test/demo trước đây trên máy)
      // và nếu ghi thẳng lên server sẽ tạo ra XP ảo không có nguồn gốc từ
      // edux_game_history (đã xảy ra thực tế: 1 tài khoản hiện xp=76140 dù
      // edux_game_history chỉ có 7 trận = 655 XP thật). Server LUÔN LÀ NGUỒN DUY
      // NHẤT cho mọi số liệu; local chỉ giữ id để biết cần fetch ai.
      const savedUser = localStorage.getItem('arena_x_user');
      let parsedUser = null;
      if (savedUser) {
        parsedUser = normalizeWeeklyXp(JSON.parse(savedUser));
        setUser(parsedUser); // hiển thị tạm trong lúc chờ fetch — sẽ bị ghi đè ngay dưới

        try {
          const serverProfile = await getUserProfile(parsedUser.id);
          if (serverProfile) {
            // Thay thế HOÀN TOÀN bằng serverProfile — không spread parsedUser vào nền,
            // để không có field số liệu nào lọt qua từ local nếu quên liệt kê ở đây.
            const mergedUser = normalizeWeeklyXp({
              ...serverProfile,
              // KHÔNG lấy serverProfile.weeklyXp vì cột weekly_xp server không tự reset
              // → giữ XP tuần cũ. Lấy local đã normalize theo tuần hiện tại (chỉ dùng
              // để không nhấp nháy về 0 khi chờ); giá trị thực sẽ được override ngay
              // sau bằng getWeeklyUserXp (nguồn duy nhất đáng tin cho weeklyXp).
              weeklyXp: parsedUser.weeklyXp,
              weeklyXpWeek: parsedUser.weeklyXpWeek,
            });
            setUser(mergedUser);
            localStorage.setItem('arena_x_user', JSON.stringify(mergedUser));
            console.log('Loaded user profile from Supabase (server authoritative)');
          } else {
            // Server CHƯA CÓ profile cho user này (lần đầu đồng bộ / tài khoản mới).
            // KHÔNG được giữ nguyên parsedUser (có thể là dữ liệu rác từ local) —
            // reset về giá trị mặc định an toàn rồi tạo mới trên server ngay, để
            // lần upsert/RPC tiếp theo không vô tình đẩy số liệu ảo lên server.
            const freshUser: UserProfile = {
              ...parsedUser,
              xp: 0,
              weeklyXp: 0,
              weeklyXpWeek: getCurrentProgramWeek() ?? undefined,
              totalGames: 0,
              bestStreak: 0,
              topicStats: {},
              gradeXp: {},
              unlockedFrames: [],
              spinsUsed: 0,
              lastSpinWeek: undefined,
            };
            setUser(freshUser);
            localStorage.setItem('arena_x_user', JSON.stringify(freshUser));
            createUserProfile(freshUser).catch(console.error);
            console.warn('Không tìm thấy profile trên server — khởi tạo mới, bỏ qua số liệu local cũ.');
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

        // Đồng bộ XP profile = tổng tích lũy từ TOÀN BỘ lịch sử đấu (nguồn sự thật).
        // Fix bug: XP ở profile lệch với "Tổng XP" trang Lịch sử (counter drift do
        // merge max() giữa nhiều thiết bị / bug cộng dồn cũ).
        await reconcileXpWithHistory(parsedUser.id);
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
      const [k6Diff, k7Diff, k8Diff, k6Topics, k7Topics, k8Topics, k9Topics] = await Promise.all([
        getK6Difficulties(),
        getK7Difficulties(),
        getK8Difficulties(),
        getK6Topics(),
        getK7Topics(),
        getK8Topics(),
        getK9Topics(),
      ]);
      // K6-K8 dùng category dạng "Tuần N" theo tiến độ chương trình — chỉ hiện tuần hiện tại,
      // ẩn các tuần khác đi (K9 dùng category theo chủ đề, không lọc theo tuần).
      const currentProgramWeek = getCurrentProgramWeek();
      const currentWeekLabel = currentProgramWeek ? `Tuần ${currentProgramWeek}` : null;
      const filterToCurrentWeek = (topics: string[]) => {
        if (!currentWeekLabel) return topics;
        const onlyCurrent = topics.filter(t => t === currentWeekLabel);
        return onlyCurrent.length > 0 ? onlyCurrent : topics;
      };
      setTopicsByGrade(prev => ({
        ...prev,
        6: filterToCurrentWeek(k6Topics),
        7: filterToCurrentWeek(k7Topics),
        8: filterToCurrentWeek(k8Topics),
        9: k9Topics,
      }));
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
    // Chỉ chuyển về home khi đang ở màn login. LoginScreen check Eduso mất ~2s,
    // trong lúc đó initializeApp có thể đã khôi phục game/phòng đang chơi dở —
    // không được đè view đó (fix bug: restart khi đang trong phòng bị văng về home).
    if (viewRef.current === 'login') {
      setView('home');
    }

    // Sync với Supabase để khôi phục XP trên thiết bị mới / sau khi clear cache.
    // Chạy sau khi đã navigate về home để không block UI.
    // SERVER LUÔN THẮNG TUYỆT ĐỐI — không Math.max/union với userProfile (có thể
    // là dữ liệu local rác từ thiết bị/bản cũ). Từng xảy ra thực tế: 1 tài khoản
    // đăng nhập lại với local rác (xp=76140, 300 "trận") trong khi
    // edux_game_history chỉ có 7 trận = 655 XP thật — Math.max khi đó giữ mãi
    // số rác thay vì nhận số đúng từ server.
    try {
      const serverProfile = await getUserProfile(userProfile.id);
      if (serverProfile) {
        const mergedUser: UserProfile = normalizeWeeklyXp({
          ...serverProfile,
          // weekly_xp server có thể là XP tuần cũ — không lấy thẳng. Local đã được
          // normalize cho tuần hiện tại; reconcile chính xác sẽ chạy qua getWeeklyUserXp.
          weeklyXp: userProfile.weeklyXp,
          weeklyXpWeek: userProfile.weeklyXpWeek,
        });
        setUser(mergedUser);
        localStorage.setItem('arena_x_user', JSON.stringify(mergedUser));
        console.log(`Restored profile from Supabase (server authoritative): xp=${mergedUser.xp}`);
      } else {
        // Server chưa có profile — KHÔNG giữ số liệu từ userProfile cục bộ (có thể rác),
        // khởi tạo mới an toàn rồi tạo trên server ngay.
        const freshUser: UserProfile = {
          ...userProfile,
          xp: 0,
          weeklyXp: 0,
          weeklyXpWeek: getCurrentProgramWeek() ?? undefined,
          totalGames: 0,
          bestStreak: 0,
          topicStats: {},
          gradeXp: {},
          unlockedFrames: [],
          spinsUsed: 0,
          lastSpinWeek: undefined,
        };
        setUser(freshUser);
        localStorage.setItem('arena_x_user', JSON.stringify(freshUser));
        createUserProfile(freshUser).catch(console.error);
        console.warn('Không tìm thấy profile trên server sau đăng nhập Eduso — khởi tạo mới, bỏ qua số liệu local cũ.');
      }
    } catch (e) {
      // Không block login nếu Supabase lỗi
      console.error('Error syncing profile on login:', e);
    }

    // Đối chiếu XP profile với tổng tích lũy từ lịch sử đấu (nguồn sự thật)
    reconcileXpWithHistory(userProfile.id);
  };

  const handleUpdateAvatar = (newAvatar: string) => {
    if (!user) return;
    const updatedUser = { ...user, avatar: newAvatar };
    setUser(updatedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
    // Sync avatar lên server để khôi phục được sau reload / thiết bị mới
    upsertUserProfile(updatedUser).catch(console.error);
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

  /**
   * ⚠️ TEST: unlock toàn bộ 3 mốc của một khung (kích hoạt bằng giữ 10s vào card
   * khung ở trang Quà tặng). Cổng bật/tắt nằm trong RewardsPage (ENABLE_TEST_UNLOCK_HOLD).
   */
  const handleTestUnlockFrame = (frameId: string) => {
    if (!user) return;
    const frame = WEEKLY_FRAMES.find(f => f.id === frameId);
    if (!frame) return;
    const current = new Set(user.unlockedFrames || []);
    frame.items.forEach(it => current.add(it.id));
    const updatedUser: UserProfile = { ...user, unlockedFrames: Array.from(current) };
    setUser(updatedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(updatedUser));
    upsertUserProfile(updatedUser).catch(console.error);
    console.log(`[TEST] Unlocked frame ${frameId}`);
  };

  const handleSpinResult = (
    prize: import('./components/LuckySpin').SpinPrize,
    res: import('./components/LuckySpin').SpinServerResult
  ) => {
    if (!user) return;
    const currentWeek = getCurrentProgramWeek();
    // XP đã được RPC edux_spin_wheel cộng ATOMIC ở server (res.newXp/newWeeklyXp
    // là giá trị THẬT sau khi cộng). Client CHỈ đồng bộ lại theo server — không
    // tự tính xp = user.xp + bonus (tránh sai lệch/ghi ngược số local lên server).
    const newWeeklyXp = res.newWeeklyXp;

    // Check frame unlock milestones với weeklyXp mới từ server
    const currentUnlocked = user.unlockedFrames || [];
    const newUnlocks = checkNewUnlocks(newWeeklyXp, currentUnlocked, currentWeek);
    const updatedUnlockedFrames = newUnlocks.length > 0
      ? [...currentUnlocked, ...newUnlocks]
      : currentUnlocked;

    const syncedUser: UserProfile = {
      ...user,
      xp: res.newXp,
      weeklyXp: res.newWeeklyXp,
      weeklyXpWeek: currentWeek ?? user.weeklyXpWeek,
      level: getLevelFromXp(res.newXp).level,
      unlockedFrames: updatedUnlockedFrames,
    };
    setUser(syncedUser);
    localStorage.setItem('arena_x_user', JSON.stringify(syncedUser));
    // Chỉ unlockedFrames cần ghi server (xp/weeklyXp server đã đúng, không ghi lại).
    if (newUnlocks.length > 0) {
      updateUserProfile(user.id, { unlockedFrames: updatedUnlockedFrames }).catch(console.error);
      setNewlyUnlockedItems(newUnlocks);
      setShowFrameUnlock(true);
    }
  };

  const handlePracticeTopic = (topic: string) => {
    setSelectedTopics([topic]);
    setView('solo-config');
  };

  /**
   * Vào màn cấu hình Đấu hạng — chặn nếu đã hết 7 lượt solo trong tuần.
   * Decision Viet 2026-06-19: hết lượt thì KHÔNG cho chơi (kể cả luyện tập).
   */
  const handleEnterDauHang = () => {
    const soloUsed = countSoloThisWeek(gameHistory, PROGRAM_START_DATE);
    if (soloUsed >= SOLO_WEEKLY_MATCH_CAP) {
      setProgramRuleNotice({
        title: 'Đã hết lượt Đấu hạng tuần này',
        lines: [
          `Bạn đã chơi đủ ${SOLO_WEEKLY_MATCH_CAP}/${SOLO_WEEKLY_MATCH_CAP} lượt Đấu hạng trong tuần.`,
          'Hẹn gặp lại vào Thứ 2 tuần sau để tiếp tục tích XP nhé!',
        ],
      });
      return;
    }
    setView('solo-config');
  };

  /**
   * Vào Lobby Thách đấu — gate theo quy định 3.2:
   *   - Khung giờ: 14h–21h các ngày T3/T5/T7 (giờ VN).
   *   - Hạn mức: 5 trận/buổi (= 5 trận/ngày trong khung giờ).
   * Vi phạm điều kiện nào hiển thị thông báo và KHÔNG chuyển view.
   */
  const handleEnterThachDauLobby = () => {
    const status = getThachDauStatus();
    if (status.open === false) {
      setProgramRuleNotice({
        title: status.reason === 'wrong_day' ? 'Ngoài ngày Thách đấu' : 'Ngoài khung giờ Thách đấu',
        lines: [
          `Thách đấu chỉ mở: ${THACH_DAU_WINDOW_LABEL}.`,
          'Bạn vẫn có thể tham gia Đấu hạng (tự luyện) để tích lũy XP.',
        ],
      });
      return;
    }
    const used = countThachDauTodayInWindow(gameHistory);
    if (used >= THACH_DAU_DAILY_MATCH_CAP) {
      setProgramRuleNotice({
        title: 'Đã hết lượt Thách đấu trong buổi',
        lines: [
          `Mỗi buổi tối đa ${THACH_DAU_DAILY_MATCH_CAP} trận Thách đấu (bạn đã chơi ${used}/${THACH_DAU_DAILY_MATCH_CAP}).`,
          'Hẹn gặp lại ở buổi Thách đấu kế tiếp.',
        ],
      });
      return;
    }
    setView('lobby');
  };

  const startSoloGame = async () => {
    // Defense-in-depth: check quota lần nữa khi bấm "BẮT ĐẦU CHIẾN".
    // Phòng trường hợp user mở 2 tab, hoặc đang ở solo-config thì hết lượt (cross-device).
    const soloUsed = countSoloThisWeek(gameHistory, PROGRAM_START_DATE);
    if (soloUsed >= SOLO_WEEKLY_MATCH_CAP) {
      setProgramRuleNotice({
        title: 'Đã hết lượt Đấu hạng tuần này',
        lines: [
          `Bạn đã chơi đủ ${SOLO_WEEKLY_MATCH_CAP}/${SOLO_WEEKLY_MATCH_CAP} lượt trong tuần.`,
          'Hẹn gặp lại vào Thứ 2 tuần sau để tiếp tục tích XP nhé!',
        ],
      });
      setView('home');
      return;
    }
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
    const rawXpData = calculateDetailedXp(correctCount, maxStreak, selectedDifficulty);

    // Quy định 3.1 (cap chặt theo quyết định nội bộ ESEA 2026):
    // Mỗi tuần chỉ tính XP cho TỐI ĐA 7 lượt Đấu hạng (solo) đầu tiên.
    // Trận thứ 8 trở đi vẫn được chơi để luyện tập NHƯNG xpEarned = 0
    // ở cả XP tổng, gradeXp lẫn weeklyXp.
    const soloPlayedThisWeekBeforeThis = countSoloThisWeek(gameHistory, PROGRAM_START_DATE);
    const isCountableSolo = soloPlayedThisWeekBeforeThis < SOLO_WEEKLY_MATCH_CAP;
    const xpData = isCountableSolo
      ? rawXpData
      : { ...rawXpData, totalXp: 0, correctXp: 0, streakBonus: 0, rankBonus: 0, baseXp: 0, multipliedXp: 0 };

    // Lưu vào history (trận quá cap lưu xpEarned = 0 để stats không phồng)
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

    // Thông báo edge case: trận này không tính XP (race cross-device khi cap chạm).
    // Bình thường handleEnterDauHang/startSoloGame đã chặn từ trước.
    if (!isCountableSolo) {
      setProgramRuleNotice({
        title: 'Trận này không tính XP',
        lines: [
          `Bạn đã chơi ${soloPlayedThisWeekBeforeThis}/${SOLO_WEEKLY_MATCH_CAP} lượt Đấu hạng tuần này.`,
          'Hẹn gặp lại Thứ 2 tuần sau để tiếp tục tích XP nhé!',
        ],
      });
    }

    if (user) {
      const updatedTopicStats = { ...(user.topicStats || {}) };
      const topicCorrect: Record<string, number> = {};
      const topicTotal: Record<string, number> = {};
      Object.entries(catBreak).forEach(([topic, stats]) => {
        if (!updatedTopicStats[topic]) {
          updatedTopicStats[topic] = { correct: 0, total: 0 };
        }
        updatedTopicStats[topic].correct += stats.correct;
        updatedTopicStats[topic].total += stats.total;
        topicCorrect[topic] = stats.correct;
        topicTotal[topic] = stats.total;
      });

      // Cập nhật gradeXp cho khối vừa chơi (xpData.totalXp đã = 0 nếu trận vượt cap client-side;
      // server sẽ áp lại cap 7 trận/tuần một cách chính xác, không tin số client tính)
      const updatedGradeXp = { ...(user.gradeXp || {}) };
      updatedGradeXp[selectedGrade] = (updatedGradeXp[selectedGrade] || 0) + xpData.totalXp;

      const newWeeklyXp = user.weeklyXp + xpData.totalXp;

      // Check frame unlock milestones (dùng ước tính client để UI phản hồi ngay,
      // sẽ đồng bộ lại số thật sau khi RPC trả về bên dưới)
      const programWeek = getCurrentProgramWeek();
      const currentUnlocked = user.unlockedFrames || [];
      const newUnlocks = checkNewUnlocks(newWeeklyXp, currentUnlocked, programWeek);
      const updatedUnlockedFrames = newUnlocks.length > 0
        ? [...currentUnlocked, ...newUnlocks]
        : currentUnlocked;

      const optimisticUser: UserProfile = {
        ...user,
        xp: user.xp + xpData.totalXp,
        weeklyXp: newWeeklyXp,
        weeklyXpWeek: programWeek || user.weeklyXpWeek,
        level: getLevelFromXp(user.xp + xpData.totalXp).level,
        totalGames: user.totalGames + 1,
        bestStreak: Math.max(user.bestStreak, maxStreak),
        topicStats: updatedTopicStats,
        grade: selectedGrade,
        gradeXp: updatedGradeXp,
        unlockedFrames: updatedUnlockedFrames,
      };
      setUser(optimisticUser);
      localStorage.setItem('arena_x_user', JSON.stringify(optimisticUser));

      // Hiển thị popup unlock frame nếu có items mới + ghi lên server (nếu không,
      // unlock chỉ tồn tại local và biến mất khi profile được đồng bộ lại từ
      // server ở lần load/login sau — xem cùng cơ chế ở handleSpinResult).
      if (newUnlocks.length > 0) {
        setNewlyUnlockedItems(newUnlocks);
        setShowFrameUnlock(true);
        updateUserProfile(user.id, { unlockedFrames: updatedUnlockedFrames }).catch(console.error);
      }

      // Ghi trận + cộng XP ATOMIC ở server (RPC edux_record_game — xem
      // scripts/sql/edux_record_game_rpc.sql). Server tự áp lại cap 7 trận/tuần
      // và cộng dồn xp/weekly_xp bằng `xp = xp + delta` (không ghi đè tuyệt đối),
      // nên không bị race condition hay bypass cap qua nhiều tab như cách cũ.
      recordGame(user.id, { ...historyEntry, mode: 'solo' }, rawXpData.totalXp, topicCorrect, topicTotal)
        .then(res => {
          if (!res) return;
          setUser(prev => prev && prev.id === user.id ? {
            ...prev,
            xp: res.newXp,
            weeklyXp: res.newWeeklyXp,
            totalGames: res.newTotalGames,
            bestStreak: res.newBestStreak,
            level: getLevelFromXp(res.newXp).level,
          } : prev);
        })
        .catch(err => {
          console.error('Error recording game to Supabase:', err);
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
      gameStartTime.current = new Date(); // Save game start time for Eduso API

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
      const newXp = user.xp + myResult.xpEarned; // ước tính để check unlock ngay, số thật lấy từ RPC bên dưới
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

      const optimisticUserMp: UserProfile = {
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
      setUser(optimisticUserMp);
      localStorage.setItem('arena_x_user', JSON.stringify(optimisticUserMp));

      if (newUnlocksMp.length > 0) {
        setNewlyUnlockedItems(newUnlocksMp);
        setShowFrameUnlock(true);
        updateUserProfile(user.id, { unlockedFrames: updatedUnlockedFramesMp }).catch(console.error);
      }

      // Ghi trận + cộng XP ATOMIC ở server (multiplayer không bị cap 7 trận —
      // RPC chỉ áp cap cho mode='solo' — nhưng vẫn cần cộng dồn atomic để
      // tránh race condition khi nhiều trận kết thúc gần nhau).
      recordGame(user.id, historyEntry, myResult.xpEarned, {}, {})
        .then(res => {
          if (!res) return;
          setUser(prev => prev && prev.id === user.id ? {
            ...prev,
            xp: res.newXp,
            weeklyXp: res.newWeeklyXp,
            totalGames: res.newTotalGames,
            bestStreak: res.newBestStreak,
            level: getLevelFromXp(res.newXp).level,
          } : prev);
        })
        .catch(err => {
          console.error('Error recording multiplayer game to Supabase:', err);
        });

      // Send game result to Eduso API (if user is logged in with Eduso)
      if (edusoUser && gameStartTime.current) {
        const endGameParams = createEndGameParams(
          edusoUser.userId,
          user.name,
          gameStartTime.current,
          myResult.xpEarned,
          'EDUX_ARENA'
        );
        sendGameResultToEduso(endGameParams).catch(err => {
          console.error('Error sending multiplayer game result to Eduso:', err);
        });
      }
    }
  };

  const handleLeaveMultiplayer = () => {
    clearActiveRoom();
    setRoomCode('');
    setMultiplayerState(null);
    setMultiplayerQuestions([]);
    setView('home');
  };

  // Trang quản lý vòng quay — link ẩn, render độc lập không qua login/menu
  if (isSpinAdmin) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>}>
        <SpinAdminPage />
      </Suspense>
    );
  }

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
          <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
             <div className="text-center space-y-6">
                <div className="inline-block px-4 py-1.5 bg-red-600/10 border border-red-600/50 rounded-full text-red-500 text-xs font-black uppercase tracking-widest">
                  ĐẤU TRƯỜNG X
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter italic uppercase text-white leading-none">
                 EDUSO SUMMER ENGLISH <br/> <span className="text-red-600"> ARENA</span>
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
               // Mốc chia ĐỀU trên thanh (1/3, 2/3, 3/3) cho cân đối;
               // fill nội suy tuyến tính theo từng đoạn để khớp vị trí mốc
               const positions = milestones.map((_, i) => ((i + 1) / milestones.length) * 100);
               const progressPct = (() => {
                 const xp = user.weeklyXp;
                 let prevXp = 0;
                 let prevPos = 0;
                 for (let i = 0; i < milestones.length; i++) {
                   if (xp < milestones[i].xp) {
                     return prevPos + ((xp - prevXp) / (milestones[i].xp - prevXp)) * (positions[i] - prevPos);
                   }
                   prevXp = milestones[i].xp;
                   prevPos = positions[i];
                 }
                 return 100;
               })();
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
                     {/* Milestone markers — vị trí chia đều, khớp với label bên dưới */}
                     {milestones.map((m, idx) => {
                       const pct = positions[idx];
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
                               className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]"
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
                   {/* Labels đặt thẳng dưới đúng vị trí mốc */}
                   <div className="relative mt-3 h-4">
                     {milestones.map((m, idx) => (
                       <span
                         key={idx}
                         className="absolute text-[10px] font-bold -translate-x-1/2 whitespace-nowrap"
                         style={{ left: `${positions[idx]}%`, color: m.unlocked ? weekFrame.color : '#475569' }}
                       >
                         {m.xp.toLocaleString()}
                       </span>
                     ))}
                   </div>
                 </div>
               );
             })()}

             {/* ── Banner công bố BXH tuần (Thứ 2 hàng tuần) ── */}
             {(() => {
               const vn = getVnParts();
               const programWeek = getCurrentProgramWeek();
               // Hiển thị mọi Thứ 2 (VN) khi chương trình đang chạy.
               // Tuần 1 (01/07 - 07/07): T2 đầu tiên = 06/07/2026 → khớp mốc công bố trong kế hoạch.
               // Kết thúc chương trình: 19/08/2026 → không hiển thị sau ngày này.
               const PROGRAM_END_KEY = '2026-08-19';
               if (vn.day !== 1 || !programWeek || programWeek < 1 || vn.dateKey > PROGRAM_END_KEY) return null;
               // Kế hoạch: công bố tuần TRƯỚC đó. Tuần hiện tại của chương trình
               // tính theo Wed-Tue, nên T2 đầu mỗi "tuần lịch" rơi vào CUỐI tuần
               // chương trình → công bố luôn tuần chương trình đang trôi.
               return (
                 <button
                   onClick={() => setView('leaderboard')}
                   className="w-full flex items-center gap-3 p-4 rounded-2xl border bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border-amber-500/40 hover:border-amber-400 transition-all text-left animate-in fade-in duration-500"
                 >
                   <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
                     📣
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Công bố Thứ 2</p>
                     <p className="font-black text-white text-sm mt-0.5">Kết quả BXH tuần {programWeek} đã có!</p>
                     <p className="text-[11px] text-amber-200/80 mt-0.5">Bấm để xem ai dẫn đầu tuần này.</p>
                   </div>
                   <span className="text-amber-400 font-black text-lg shrink-0">›</span>
                 </button>
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

             {/* Tính quota còn lại để hiển thị trên 2 nút Đấu hạng / Thách đấu */}
             {(() => null)()}
             {/* Desktop: large cards side by side */}
             <div className="hidden md:grid grid-cols-2 gap-8">
                {(() => {
                  const soloUsed = countSoloThisWeek(gameHistory, PROGRAM_START_DATE);
                  const soloRemaining = Math.max(0, SOLO_WEEKLY_MATCH_CAP - soloUsed);
                  const soloExhausted = soloRemaining === 0;
                  return (
                    <button
                      onClick={handleEnterDauHang}
                      className={`relative group overflow-hidden bg-slate-900 border border-slate-800 p-10 rounded-[40px] transition-all text-left shadow-2xl ${
                        soloExhausted ? 'opacity-70 hover:border-slate-700' : 'hover:border-red-600'
                      }`}
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl group-hover:scale-110 transition-transform">🎯</div>
                      <h3 className="text-3xl font-black mb-2 group-hover:text-red-500 transition-colors uppercase">Đấu hạng</h3>
                      <p className="text-slate-400 mb-3 font-medium italic">Thi đấu cá nhân, vượt qua 15 câu hỏi trong 5 phút để leo rank</p>
                      <div className={`inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-widest ${
                        soloExhausted
                          ? 'bg-slate-800 border-slate-700 text-slate-500'
                          : soloRemaining <= 2
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      }`}>
                        {soloExhausted
                          ? '⛔ Hết lượt tuần này — hẹn Thứ 2 tuần sau'
                          : <>Bạn còn <span className="text-base">{soloRemaining}/{SOLO_WEEKLY_MATCH_CAP}</span> lượt chơi tuần này</>}
                      </div>
                      <div className={`flex items-center gap-2 font-bold uppercase tracking-widest text-sm ${
                        soloExhausted ? 'text-slate-500' : 'text-red-500'
                      }`}>
                        {soloExhausted ? 'XEM HƯỚNG DẪN' : 'BẮT ĐẦU NGAY'} <span className="group-hover:translate-x-2 transition-transform">→</span>
                      </div>
                    </button>
                  );
                })()}

                {(() => {
                  const tdStatus = getThachDauStatus();
                  const tdUsed = countThachDauTodayInWindow(gameHistory);
                  const tdRemaining = Math.max(0, THACH_DAU_DAILY_MATCH_CAP - tdUsed);
                  const tdExhausted = tdRemaining === 0;
                  // 4 trạng thái pill: closed-wrong-day | closed-wrong-hour | exhausted | open
                  let pillTone = 'bg-sky-500/10 border-sky-500/40 text-sky-300';
                  let pillContent: React.ReactNode;
                  if (tdStatus.open === false) {
                    pillTone = 'bg-slate-800 border-slate-700 text-slate-400';
                    pillContent = tdStatus.reason === 'wrong_day'
                      ? '🌙 Hôm nay không mở Thách đấu'
                      : '⏰ Ngoài khung giờ Thách đấu (14h–21h)';
                  } else if (tdExhausted) {
                    pillTone = 'bg-slate-800 border-slate-700 text-slate-500';
                    pillContent = '⛔ Hết lượt Thách đấu trong buổi hôm nay';
                  } else {
                    if (tdRemaining <= 1) pillTone = 'bg-amber-500/10 border-amber-500/40 text-amber-300';
                    pillContent = <>Bạn còn <span className="text-base">{tdRemaining}/{THACH_DAU_DAILY_MATCH_CAP}</span> lượt chơi hôm nay</>;
                  }
                  return (
                    <button
                      onClick={handleEnterThachDauLobby}
                      className={`relative group overflow-hidden bg-slate-900 border border-slate-800 p-10 rounded-[40px] transition-all text-left shadow-2xl ${
                        tdStatus.open === false || tdExhausted ? 'opacity-70 hover:border-slate-700' : 'hover:border-blue-500'
                      }`}
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl group-hover:scale-110 transition-transform">👥</div>
                      <h3 className="text-3xl font-black mb-2 group-hover:text-blue-500 transition-colors uppercase">Thách đấu</h3>
                      <p className="text-slate-400 mb-3 font-medium italic">Thách đấu bạn bè, tích lũy XP, trở thành Huyền thoại</p>
                      <div className={`inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-widest ${pillTone}`}>
                        {pillContent}
                      </div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                        Mở: {THACH_DAU_WINDOW_LABEL}
                      </p>
                      <div className={`flex items-center gap-2 font-bold uppercase tracking-widest text-sm ${
                        tdStatus.open === false || tdExhausted ? 'text-slate-500' : 'text-blue-500'
                      }`}>
                        {tdStatus.open === false || tdExhausted ? 'XEM CHI TIẾT' : 'THÁCH ĐẤU NGAY'} <span className="group-hover:translate-x-2 transition-transform">→</span>
                      </div>
                    </button>
                  );
                })()}
             </div>

             {/* Mobile: compact list rows with chevron */}
             <div className="md:hidden flex flex-col gap-3">
                {(() => {
                  const soloUsed = countSoloThisWeek(gameHistory, PROGRAM_START_DATE);
                  const soloRemaining = Math.max(0, SOLO_WEEKLY_MATCH_CAP - soloUsed);
                  const soloExhausted = soloRemaining === 0;
                  return (
                    <button
                      onClick={handleEnterDauHang}
                      className={`flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl transition-all text-left group ${
                        soloExhausted ? 'opacity-70' : 'hover:border-red-600/50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-2xl flex-shrink-0">🎯</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-white uppercase">Đấu hạng</h3>
                        <p className={`text-[10px] mt-0.5 font-bold ${
                          soloExhausted ? 'text-slate-500' : soloRemaining <= 2 ? 'text-amber-300' : 'text-emerald-300'
                        }`}>
                          {soloExhausted
                            ? 'Hết lượt — hẹn T2 tuần sau'
                            : `Còn ${soloRemaining}/${SOLO_WEEKLY_MATCH_CAP} lượt tuần này`}
                        </p>
                      </div>
                      <span className={`font-bold text-lg group-hover:translate-x-1 transition-transform flex-shrink-0 ${
                        soloExhausted ? 'text-slate-500' : 'text-red-500'
                      }`}>›</span>
                    </button>
                  );
                })()}

                {(() => {
                  const tdStatus = getThachDauStatus();
                  const tdUsed = countThachDauTodayInWindow(gameHistory);
                  const tdRemaining = Math.max(0, THACH_DAU_DAILY_MATCH_CAP - tdUsed);
                  const tdExhausted = tdRemaining === 0;
                  const isClosed = tdStatus.open === false;
                  let lineColor = 'text-sky-300';
                  let lineText: string;
                  if (isClosed) {
                    lineColor = 'text-slate-400';
                    lineText = tdStatus.reason === 'wrong_day'
                      ? '🌙 Hôm nay không mở Thách đấu'
                      : '⏰ Ngoài khung giờ 14h–21h';
                  } else if (tdExhausted) {
                    lineColor = 'text-slate-500';
                    lineText = 'Hết lượt Thách đấu buổi hôm nay';
                  } else {
                    if (tdRemaining <= 1) lineColor = 'text-amber-300';
                    lineText = `Còn ${tdRemaining}/${THACH_DAU_DAILY_MATCH_CAP} lượt hôm nay`;
                  }
                  return (
                    <button
                      onClick={handleEnterThachDauLobby}
                      className={`flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl transition-all text-left group ${
                        isClosed || tdExhausted ? 'opacity-70' : 'hover:border-blue-500/50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-2xl flex-shrink-0">👥</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-white uppercase">Thách đấu</h3>
                        <p className={`text-[10px] mt-0.5 font-bold ${lineColor}`}>{lineText}</p>
                      </div>
                      <span className={`font-bold text-lg group-hover:translate-x-1 transition-transform flex-shrink-0 ${
                        isClosed || tdExhausted ? 'text-slate-500' : 'text-blue-500'
                      }`}>›</span>
                    </button>
                  );
                })()}
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
                          <span className={`text-[10px] font-black tracking-widest uppercase ${selectedDifficulty === d ? 'text-red-400' : 'text-slate-500'}`}>{XP_PER_QUESTION[d]}XP/câu</span>
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
                    <span className="px-1.5 sm:px-2 py-0.5 bg-red-600/10 border border-red-600/20 rounded text-[10px] text-red-500 font-black">
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
                 <p className="text-[10px] font-black uppercase text-slate-500">XP</p>
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
                 <p className="text-[10px] font-black uppercase text-slate-500">Streak</p>
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
            onTestUnlockFrame={handleTestUnlockFrame}
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
            onRecalculate={async () => {
              // Client KHÔNG tự tính lại rồi ghi đè xp lên server (vi phạm quy tắc
              // "điểm chỉ được cộng qua RPC, không ghi đè"). Việc tính lại/sửa điểm
              // do server đảm nhiệm; ở đây chỉ ĐỌC LẠI giá trị đúng từ server về
              // cập nhật hiển thị. (Fix dữ liệu hàng loạt dùng recalculateAllUsersXp.)
              if (user) {
                await reconcileXpWithHistory(user.id);
                const freshHistory = await getGameHistoryFromSupabase(user.id, 50);
                setGameHistory(freshHistory);
                localStorage.setItem('arena_x_history', JSON.stringify(freshHistory));
              }
            }}
            onRecalculateAll={async () => {
              const currentWeek = getCurrentProgramWeek();
              // Dùng PROGRAM_START_DATE đã neo +07:00 — KHÔNG hardcode new Date('2026-06-01')
              // vì sẽ parse thành UTC midnight, lệch 7h, weekly_xp tính sai biên tuần.
              const result = await recalculateAllUsersXp(PROGRAM_START_DATE.getTime(), currentWeek);
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
            // Truyền roomCode cũ + isJoining để khi auto-rejoin lobby
            // (host/khách reload trang) component vào thẳng lobby thay
            // vì màn chọn "Tạo / Tham gia".
            initialRoomCode={roomCode || undefined}
            isJoining={!isHost}
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
               <div className="flex items-center justify-center gap-2 sm:gap-4">
                 <img src={`${LB_ASSET}laurel_l.png`} alt="" draggable={false} className="h-8 sm:h-12 w-auto select-none" />
                 <h2 className="text-lg sm:text-2xl md:text-4xl font-black italic tracking-tighter text-white">BẢNG VÀNG HỆ THỐNG</h2>
                 <img src={`${LB_ASSET}laurel_r.png`} alt="" draggable={false} className="h-8 sm:h-12 w-auto select-none" />
               </div>
               <p className="text-[10px] sm:text-xs font-bold tracking-[0.25em] text-slate-400 uppercase mt-1 sm:mt-2">
                 {leaderboardTab === 'weekly' ? 'Dựa trên XP tuần này' : 'Dựa trên XP tích lũy toàn thời gian'}
               </p>
             </div>

             {/* All-time / Weekly tabs */}
             <div className="flex gap-2 justify-center">
               <button
                 onClick={() => setLeaderboardTab('alltime')}
                 className={`px-4 sm:px-5 py-2.5 sm:py-2 rounded-full font-black text-[11px] sm:text-xs uppercase tracking-widest transition-all ${leaderboardTab === 'alltime' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
               >
                 Toàn thời gian
               </button>
               <button
                 onClick={() => setLeaderboardTab('weekly')}
                 className={`px-4 sm:px-5 py-2.5 sm:py-2 rounded-full font-black text-[11px] sm:text-xs uppercase tracking-widest transition-all ${leaderboardTab === 'weekly' ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
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
                     className={`px-4 py-2.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${leaderboardGradeFilter === 'all' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                   >
                     Toàn bộ
                   </button>
                   {grades.map(grade => (
                     <button
                       key={grade}
                       onClick={() => setLeaderboardGradeFilter(grade)}
                       className={`px-4 py-2.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${leaderboardGradeFilter === grade ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
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
               // Rank của tôi theo đúng tab đang xem (tuần ≠ tích lũy)
               const myTabRank = isWeekly ? myWeeklyRank : myRank;
               // Hàng của chính mình luôn dùng avatar/khung từ profile local
               // (server có thể giữ avatar cũ chưa kịp sync)
               const rawData = (isWeekly ? weeklyLeaderboardData : leaderboardData).map(p =>
                 p.id === user.id
                   ? { ...p, name: user.name, avatar: user.avatar, equippedFrame: user.equippedFrame, unlockedFrames: user.unlockedFrames }
                   : p
               );
               const isGradeFilter = !isWeekly && leaderboardGradeFilter !== 'all';

               const getDisplayXp = (p: UserProfile) => {
                 if (isWeekly) return p.weeklyXp || 0;
                 if (isGradeFilter && p.gradeXp) return p.gradeXp[leaderboardGradeFilter as number] || 0;
                 return p.xp;
               };

               const userInList = rawData.some(p => p.id === user.id);
               // Inject user vào danh sách nếu chưa có:
               // - Tab weekly: chỉ inject khi có XP THỰC SỰ tuần này (myWeeklyXp > 0),
               //   và inject bằng user.weeklyXp = myWeeklyXp (KHÔNG dùng user.weeklyXp stale từ profile).
               // - Tab grade filter: inject nếu user có gradeXp[grade] > 0.
               // - Tab all-time: luôn inject nếu chưa có (user.xp đáng tin).
               const userHasXp = isWeekly
                 ? myWeeklyXp > 0
                 : (!isGradeFilter || (user.gradeXp && user.gradeXp[leaderboardGradeFilter as number] > 0));
               const userInject: UserProfile = isWeekly
                 ? { ...user, weeklyXp: myWeeklyXp }
                 : user;
               let combinedData: UserProfile[] = userInList
                 ? rawData
                 : (userHasXp ? [...rawData, userInject] : rawData);

               combinedData = combinedData.sort((a, b) => getDisplayXp(b) - getDisplayXp(a));
               // Luôn lọc user có XP > 0 ở mọi tab (all-time, grade, weekly).
               // Tránh hạng 1-5 hiển thị user 0 XP khi chưa ai đấu nhiều.
               combinedData = combinedData.filter(p => getDisplayXp(p) > 0);

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
                       {/* Column header */}
                       <div className="flex items-center px-3 sm:px-6">
                         <span className="w-[88px] sm:w-[180px] text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider">Hạng</span>
                         <span className="flex-1 text-center text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider">Thí sinh</span>
                         <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-wider text-right">XP {isWeekly ? 'Tuần' : 'Tích lũy'}</span>
                       </div>

                       {/* Top 3 — featured cards */}
                       <div className="space-y-3">
                         {top3.map((p, i) => {
                           const isMe = p.id === user.id;
                           const xpVal = getDisplayXp(p);
                           const xpLabel = isWeekly ? 'XP Tuần' : 'XP Tích Lũy';
                           return (
                             <LbCard
                               key={p.id}
                               rank={i + 1}
                               profile={p}
                               xp={xpVal}
                               isMe={isMe}
                               onAvatarClick={() => setLbAvatarPopup({ profile: p, rank: i + 1, xp: xpVal, isMe, xpLabel })}
                             />
                           );
                         })}
                       </div>

                       {/* Rank 4+ — card thu nhỏ cùng phong cách thiết kế */}
                       {rest.length > 0 && (
                         <div className="space-y-1.5 sm:space-y-2">
                           {rest.map((p, i) => {
                             const isMe = p.id === user.id;
                             const displayRank = isMe && myTabRank > 0 ? myTabRank : i + 4;
                             // Mobile: chỉ hiện top 5 + hàng của chính mình (desktop hiện đủ)
                             const hideOnMobile = displayRank > 5 && !isMe;
                             const xpVal = getDisplayXp(p);
                             const xpLabel = isWeekly ? 'XP Tuần' : 'XP Tích Lũy';
                             return (
                               <div key={p.id} className={hideOnMobile ? 'hidden sm:block' : ''}>
                                 <LbCard
                                   rank={displayRank}
                                   profile={p}
                                   xp={xpVal}
                                   isMe={isMe}
                                   onAvatarClick={() => setLbAvatarPopup({ profile: p, rank: displayRank, xp: xpVal, isMe, xpLabel })}
                                 />
                               </div>
                             );
                           })}
                         </div>
                       )}

                       {/* My rank banner if not in top 20 */}
                       {myTabRank > 20 && (
                         <div className="bg-red-600/10 border border-red-600/20 rounded-2xl p-4 text-center">
                           <p className="text-sm font-black text-red-400">Thứ hạng của bạn: #{myTabRank}</p>
                         </div>
                       )}

                       {/* Footer note */}
                       <p className="flex items-center justify-center gap-1.5 text-[10px] sm:text-xs text-slate-500 font-semibold pt-1">
                         <span className="inline-flex w-3.5 h-3.5 rounded-full border border-slate-600 items-center justify-center text-[10px] font-black">i</span>
                         XP được cập nhật sau mỗi lượt đấu hạng và thách đấu
                       </p>
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
            edusoUser={edusoUser}
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

      {/* Thông báo quy định chương trình (chặn vào Thách đấu ngoài khung giờ / hết lượt) */}
      {programRuleNotice && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setProgramRuleNotice(null)}
        >
          <div
            className="bg-slate-900 border-2 border-amber-500/70 rounded-[28px] p-7 max-w-sm w-full shadow-2xl text-center animate-in zoom-in-95 duration-300"
            style={{ boxShadow: '0 0 30px rgba(245,158,11,0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl mb-3">⏰</div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight mb-3">{programRuleNotice.title}</h3>
            <div className="space-y-2 mb-5 text-sm text-slate-300">
              {programRuleNotice.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <button
              onClick={() => setProgramRuleNotice(null)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-2xl text-sm uppercase tracking-widest transition-all"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Popup chi tiết khi click avatar trên BXH */}
      {lbAvatarPopup && (
        <LbAvatarPopup
          profile={lbAvatarPopup.profile}
          rank={lbAvatarPopup.rank}
          xp={lbAvatarPopup.xp}
          isMe={lbAvatarPopup.isMe}
          xpLabel={lbAvatarPopup.xpLabel}
          onClose={() => setLbAvatarPopup(null)}
        />
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
