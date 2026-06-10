// ============ EDUSO INTEGRATION ============

export interface EdusoUserData {
  userId: string;
  name?: string;
  email: string;
  phone?: string;
}

export interface StoredUserData {
  userID: string;
  isTempUser: boolean;
  email?: string;
  phone?: string;
  playerName?: string;
  lastUsed?: number;
}

// ============ GAME ENUMS ============

export enum Difficulty {
  EASY = 'Dễ',
  MEDIUM = 'Trung bình',
  HARD = 'Khó',
  EXPERT = 'Chuyên gia'
}

export enum UserLevel {
  APPRENTICE = 'Tập sự',
  WARRIOR = 'Chiến binh',
  MASTER = 'Bậc thầy',
  ELITE = 'Tinh Anh',
  LEGEND = 'Huyền thoại'
}

export type QuestionType =
  | 'complete'
  | 'word-form'
  | 'odd-one'
  | 'image-quiz'
  | 'quiz'
  | 'error-finding'
  | 'reorder'
  | 'puzzle';

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  instruction?: string;
  options: string[];
  correctAnswer: string;
  correctAnswers?: string[];
  funExplanation: string;
  seriousExplanation: string;
  imageUrl?: string;
  category: string;
  grade: number;
  difficulty: Difficulty;
}

export interface UserAnswer {
  questionId: string;
  selectedOption: string;
  isCorrect: boolean;
}

export interface XpBreakdown {
  correctXp: number;
  streakBonus: number;
  rankBonus: number;
  totalXp: number;
  // legacy fields kept for backward compat
  baseXp: number;
  multiplier: number;
  multipliedXp: number;
}

export interface GameResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  timeSpent: number;
  maxStreak: number;
  xpEarned: number;
  xpBreakdown: XpBreakdown;
  categoryBreakdown: Record<string, { correct: number; total: number }>;
  typeBreakdown: Record<string, { correct: number; total: number }>;
  difficultyBreakdown: Record<string, { correct: number; total: number }>;
  sessionDetails: {
    questions: Question[];
    answers: UserAnswer[];
  };
}

export interface FrameItem {
  id: string;
  name: string;
  emoji: string;
  xpRequired: number;
}

export interface WeeklyFrame {
  id: string;
  week: number;
  name: string;
  emoji: string;
  color: string;
  glowColor: string;
  frameImage: string;
  items: [FrameItem, FrameItem, FrameItem];
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  grade: number;
  xp: number;
  level: UserLevel;
  totalGames: number;
  bestStreak: number;
  weeklyXp: number;
  weeklyXpWeek?: number; // Tuần chương trình mà weeklyXp đang tính cho (1-8)
  topicStats?: Record<string, { correct: number; total: number }>;
  gradeXp?: Record<number, number>;
  unlockedFrames?: string[];
  equippedFrame?: string;
  spinsUsed?: number;
  lastSpinWeek?: number;
}

export interface RoomMember {
  id: string;
  name: string;
  avatar: string;
  ready: boolean;
  score?: number;
  finished?: boolean;
}

export interface GameHistory {
  id: string;
  playedAt: string;
  grade: number;
  topics: string[];
  difficulty: Difficulty;
  correctCount: number;
  totalQuestions: number;
  xpEarned: number;
  maxStreak: number;
  timeSpent: number;
  score: number;
  mode?: 'solo' | 'multiplayer';
  roomCode?: string;
  // Multiplayer result details
  myRank?: number;
  totalPlayers?: number;
  opponents?: Array<{
    name: string;
    avatar: string;
    score: number;
    correctCount: number;
    rank: number;
  }>;
}

// ============ MULTIPLAYER TYPES ============

export type GamePhase = 'waiting' | 'countdown' | 'playing' | 'completed';

export interface PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  equippedFrame?: string;
  unlockedFrames?: string[];
  isHost: boolean;
  isReady: boolean;
  score: number;
  correctCount: number;
  currentQuestionIndex: number;
  streak: number;
  maxStreak: number;
  finishedAt?: number;
  lastActivity: number;
}

export interface MultiplayerGameState {
  roomCode: string;
  hostId: string;
  players: Record<string, PlayerInfo>;
  gamePhase: GamePhase;
  questions: Question[];
  roomSettings: {
    grade: number;
    topics: string[];
    difficulty: Difficulty;
    maxPlayers: number;
    timeLimit: number;
  };
  startedAt?: number;
  endedAt?: number;
  lastUpdate: number;
  shuffleSeed?: number;
}

export interface MultiplayerAnswer {
  playerId: string;
  questionIndex: number;
  answer: string;
  isCorrect: boolean;
  timestamp: number;
}

export interface MultiplayerResult {
  rank: number;
  playerId: string;
  playerName: string;
  playerAvatar?: string;
  playerEquippedFrame?: string;
  playerUnlockedFrames?: string[];
  score: number;
  correctCount: number;
  totalQuestions: number;
  maxStreak: number;
  timeSpent: number;
  xpEarned: number;
}
