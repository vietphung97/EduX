/**
 * MultiplayerLobby - Room management and player waiting screen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Difficulty,
  UserProfile,
  MultiplayerGameState,
  PlayerInfo,
  GameHistory
} from '../types';
import {
  THACH_DAU_DAILY_MATCH_CAP,
  THACH_DAU_WINDOW_LABEL,
  countThachDauTodayInWindow,
  getThachDauStatus,
} from '../utils/programRules';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setPlayerReady,
  kickPlayer,
  subscribeToRoom,
  updateRoomState
} from '../utils/multiplayerSync';
import {
  getPlayerId,
  setActiveRoom,
  clearActiveRoom,
  getPlayerAvatar,
  getActiveRoom
} from '../utils/playerSession';
import { leaveRoom as leaveRoomFromServer } from '../utils/multiplayerSync';
import { TopicsByGrade } from '../services/sheets';
import { DIFFICULTY_MULTIPLIERS, XP_PER_QUESTION } from '../utils/gameLogic';
import AvatarDisplay from './AvatarDisplay';

interface MultiplayerLobbyProps {
  user: UserProfile;
  topicsByGrade: TopicsByGrade;
  grades: number[];
  onStartGame: (roomCode: string, state: MultiplayerGameState) => void;
  onBack: () => void;
  initialRoomCode?: string;
  isJoining?: boolean;
}

const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  user,
  topicsByGrade,
  grades,
  onStartGame,
  onBack,
  initialRoomCode,
  isJoining = false
}) => {
  // View state
  const [mode, setMode] = useState<'select' | 'create' | 'join' | 'lobby'>(
    initialRoomCode ? 'join' : 'select'
  );

  // Room state
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [roomState, setRoomState] = useState<MultiplayerGameState | null>(null);
  const [isHost, setIsHost] = useState(!isJoining);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Config state (for host)
  const [selectedGrade, setSelectedGrade] = useState<number>(user.grade || grades[0] || 3);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [maxPlayers, setMaxPlayers] = useState(4);

  const playerId = getPlayerId();

  // Subscribe to room updates
  useEffect(() => {
    if (!roomCode || mode !== 'lobby') return;

    const subscription = subscribeToRoom(roomCode, (state, source) => {
      if (!state) {
        setError('Phòng đã bị đóng');
        setMode('select');
        clearActiveRoom();
        return;
      }

      setRoomState(state);

      // Check if game started
      if (state.gamePhase === 'countdown' || state.gamePhase === 'playing') {
        onStartGame(roomCode, state);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [roomCode, mode, onStartGame]);

  // Đọc lịch sử từ localStorage để kiểm tra hạn mức Thách đấu 5 trận/buổi
  // (chỉ đếm trận multiplayer hôm nay trong khung 14h-21h VN). Đọc lại mỗi
  // lần bấm để bắt cả các trận vừa kết thúc ở tab khác / lần chơi vừa rồi.
  const readGameHistory = (): GameHistory[] => {
    try {
      const raw = localStorage.getItem('arena_x_history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  /** Kiểm tra quy định 3.2 ngay trước khi tạo/tham gia phòng. */
  const ensureThachDauAllowed = (): boolean => {
    const status = getThachDauStatus();
    if (!status.open) {
      setError(`Thách đấu chỉ mở: ${THACH_DAU_WINDOW_LABEL}. Vui lòng quay lại đúng khung giờ.`);
      return false;
    }
    const used = countThachDauTodayInWindow(readGameHistory());
    if (used >= THACH_DAU_DAILY_MATCH_CAP) {
      setError(`Bạn đã chơi đủ ${THACH_DAU_DAILY_MATCH_CAP}/${THACH_DAU_DAILY_MATCH_CAP} trận Thách đấu trong buổi hôm nay.`);
      return false;
    }
    return true;
  };

  // Create room handler
  const handleCreateRoom = async () => {
    if (!ensureThachDauAllowed()) return;
    setIsLoading(true);
    setError('');

    try {
      // Auto-leave old room if exists
      const activeRoom = getActiveRoom();
      if (activeRoom && activeRoom.roomCode) {
        console.log('Auto-leaving old room:', activeRoom.roomCode);
        await leaveRoomFromServer(activeRoom.roomCode, playerId);
        clearActiveRoom();
      }

      const topics = selectedTopics.length > 0
        ? selectedTopics
        : [topicsByGrade[selectedGrade]?.[0] || 'General'];

      const newRoomCode = await createRoom(
        playerId,
        user.name,
        getPlayerAvatar(user.avatar),
        {
          grade: selectedGrade,
          topics,
          difficulty: selectedDifficulty,
          maxPlayers,
          timeLimit: 300
        },
        { equippedFrame: user.equippedFrame, unlockedFrames: user.unlockedFrames }
      );

      if (newRoomCode) {
        setRoomCode(newRoomCode);
        setIsHost(true);
        setActiveRoom(newRoomCode, true);
        setMode('lobby');
      } else {
        setError('Không thể tạo phòng. Vui lòng thử lại.');
      }
    } catch (err) {
      setError('Lỗi tạo phòng');
      console.error(err);
    }

    setIsLoading(false);
  };

  // Join room handler
  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError('Vui lòng nhập mã phòng');
      return;
    }
    if (!ensureThachDauAllowed()) return;

    setIsLoading(true);
    setError('');

    try {
      // Auto-leave old room if exists (and different from the one we're joining)
      const activeRoom = getActiveRoom();
      if (activeRoom && activeRoom.roomCode && activeRoom.roomCode !== roomCode.toUpperCase()) {
        console.log('Auto-leaving old room:', activeRoom.roomCode);
        await leaveRoomFromServer(activeRoom.roomCode, playerId);
        clearActiveRoom();
      }

      const result = await joinRoom(
        roomCode.toUpperCase(),
        playerId,
        user.name,
        getPlayerAvatar(user.avatar),
        { equippedFrame: user.equippedFrame, unlockedFrames: user.unlockedFrames }
      );

      if (result.success) {
        setIsHost(false);
        setActiveRoom(roomCode.toUpperCase(), false);
        setMode('lobby');
      } else {
        setError(result.error || 'Không thể tham gia phòng');
      }
    } catch (err) {
      setError('Lỗi tham gia phòng');
      console.error(err);
    }

    setIsLoading(false);
  };

  // Leave room handler
  const handleLeaveRoom = async () => {
    if (roomCode) {
      await leaveRoom(roomCode, playerId);
      clearActiveRoom();
    }
    setRoomCode('');
    setRoomState(null);
    setMode('select');
  };

  // Ready toggle handler
  const handleToggleReady = async () => {
    if (!roomState) return;

    const currentPlayer = roomState.players[playerId];
    if (!currentPlayer) return;

    await setPlayerReady(roomCode, playerId, !currentPlayer.isReady);
  };

  // Kick player handler (host only)
  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!isHost || targetPlayerId === playerId) return;
    await kickPlayer(roomCode, playerId, targetPlayerId);
  };

  // Update room settings (host only)
  const handleUpdateSettings = async (updates: Partial<MultiplayerGameState['roomSettings']>) => {
    if (!isHost || !roomState) return;

    await updateRoomState(roomCode, {
      roomSettings: {
        ...roomState.roomSettings,
        ...updates
      }
    });
  };

  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  // Check if all players ready
  const allPlayersReady = roomState
    ? (Object.values(roomState.players) as PlayerInfo[]).every(p => p.isReady)
    : false;

  const playerCount = roomState ? Object.keys(roomState.players).length : 0;

  // Render mode selection
  if (mode === 'select') {
    const tdHistory = readGameHistory();
    const tdUsed = countThachDauTodayInWindow(tdHistory);
    const tdRemaining = Math.max(0, THACH_DAU_DAILY_MATCH_CAP - tdUsed);
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center">
          <h2 className="text-4xl font-black italic tracking-tighter">THÁCH ĐẤU</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">
            Chơi cùng bạn bè
          </p>
        </div>

        {/* Banner hiển thị quy định 3.2 */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-xs sm:text-sm text-blue-200 space-y-1">
          <p className="font-bold uppercase tracking-widest text-blue-300 text-[10px]">Quy định Thách đấu</p>
          <p>Khung giờ mở: <span className="font-bold">{THACH_DAU_WINDOW_LABEL}</span>.</p>
          <p>Hôm nay đã chơi: <span className="font-bold">{tdUsed}/{THACH_DAU_DAILY_MATCH_CAP}</span> trận — còn <span className="font-bold">{tdRemaining}</span> lượt.</p>
          <p className="text-blue-300/80 text-[11px]">Rank 1 mỗi trận được cộng thêm +100 XP.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setMode('create')}
            className="bg-slate-900 border border-slate-800 p-8 rounded-[30px] hover:border-blue-500 transition-all text-left group"
          >
            <div className="text-5xl mb-4">🏠</div>
            <h3 className="text-2xl font-black mb-2 group-hover:text-blue-500 transition-colors">
              TẠO PHÒNG
            </h3>
            <p className="text-slate-400 text-sm">
              Tạo phòng mới và mời bạn bè tham gia
            </p>
          </button>

          <button
            onClick={() => setMode('join')}
            className="bg-slate-900 border border-slate-800 p-8 rounded-[30px] hover:border-green-500 transition-all text-left group"
          >
            <div className="text-5xl mb-4">🚪</div>
            <h3 className="text-2xl font-black mb-2 group-hover:text-green-500 transition-colors">
              THAM GIA
            </h3>
            <p className="text-slate-400 text-sm">
              Nhập mã phòng để tham gia trận đấu
            </p>
          </button>
        </div>

        <button
          onClick={onBack}
          className="w-full py-4 bg-slate-800 text-slate-300 font-black rounded-2xl hover:bg-slate-700 transition-colors"
        >
          QUAY LẠI
        </button>
      </div>
    );
  }

  // Render create room form
  if (mode === 'create') {
    return (
      <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 p-10 rounded-[40px] space-y-8 shadow-2xl animate-in fade-in duration-500">
        <div className="text-center">
          <h2 className="text-3xl font-black">TẠO PHÒNG THÁCH ĐẤU</h2>
          <p className="text-slate-500 text-sm mt-2">Cấu hình trận đấu cho nhóm</p>
        </div>

        <div className="space-y-6">
          {/* Grade Selection */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">
              Chọn Khối Lớp
            </label>
            <div className="grid grid-cols-4 gap-2">
              {grades.map(g => (
                <button
                  key={g}
                  onClick={() => { setSelectedGrade(g); setSelectedTopics([]); }}
                  className={`py-3 rounded-2xl font-bold transition-all ${
                    selectedGrade === g
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Lớp {g}
                </button>
              ))}
            </div>
          </div>

          {/* Topic Selection */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">
              Chọn Chủ Đề
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {(topicsByGrade[selectedGrade] || []).map(topic => (
                <button
                  key={topic}
                  onClick={() => setSelectedTopics(prev =>
                    prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
                  )}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                    selectedTopics.includes(topic)
                      ? 'border-blue-600 bg-blue-600/10 text-blue-500'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">
              Độ Khó
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(Difficulty).filter(d => d !== Difficulty.EXPERT).map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDifficulty(d)}
                  className={`py-3 rounded-2xl font-bold transition-all flex flex-col items-center gap-1 ${
                    selectedDifficulty === d
                      ? 'bg-slate-700 border-2 border-blue-600 text-white'
                      : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-xs">{d}</span>
                  <span className={`text-[10px] font-black ${
                    selectedDifficulty === d ? 'text-blue-400' : 'text-slate-500'
                  }`}>
                    {XP_PER_QUESTION[d]}XP/câu
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Max Players */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 mb-4 tracking-widest">
              Số Người Chơi Tối Đa
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 py-3 rounded-2xl font-bold transition-all ${
                    maxPlayers === n
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-center font-bold">{error}</div>
        )}

        <div className="pt-6 border-t border-slate-800 flex gap-4">
          <button
            onClick={() => setMode('select')}
            className="flex-1 py-4 bg-slate-800 text-slate-300 font-black rounded-2xl"
          >
            QUAY LẠI
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={isLoading}
            className="flex-[2] py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                ĐANG TẠO...
              </>
            ) : (
              'TẠO PHÒNG'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Render join room form
  if (mode === 'join') {
    return (
      <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 p-10 rounded-[40px] space-y-8 shadow-2xl animate-in fade-in duration-500">
        <div className="text-center">
          <h2 className="text-3xl font-black">THAM GIA PHÒNG</h2>
          <p className="text-slate-500 text-sm mt-2">Nhập mã phòng từ bạn bè</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Nhập mã phòng (VD: ABC123)"
            maxLength={6}
            className="w-full px-6 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-center text-2xl font-black tracking-[0.3em] uppercase placeholder:text-slate-600 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-green-500 transition-colors"
          />
        </div>

        {error && (
          <div className="text-red-500 text-center font-bold">{error}</div>
        )}

        <div className="pt-6 border-t border-slate-800 flex gap-4">
          <button
            onClick={() => { setMode('select'); setError(''); }}
            className="flex-1 py-4 bg-slate-800 text-slate-300 font-black rounded-2xl"
          >
            QUAY LẠI
          </button>
          <button
            onClick={handleJoinRoom}
            disabled={isLoading || !roomCode.trim()}
            className="flex-[2] py-4 bg-green-600 text-white font-black rounded-2xl shadow-xl shadow-green-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                ĐANG VÀO...
              </>
            ) : (
              'VÀO PHÒNG'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Render lobby
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Room Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-[30px]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase text-slate-500 tracking-widest">Mã Phòng</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-4xl font-black tracking-[0.3em]">{roomCode}</span>
              <button
                onClick={copyRoomCode}
                className="p-2 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
                title="Sao chép mã phòng"
              >
                📋
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase text-slate-500 tracking-widest">Trạng Thái</p>
            <p className="text-lg font-black text-yellow-500 mt-1">
              ⏳ Đang chờ ({playerCount}/{roomState?.roomSettings.maxPlayers || maxPlayers})
            </p>
          </div>
        </div>
      </div>

      {/* Room Settings (visible to all) */}
      {roomState && (
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl">
          <div className="flex flex-wrap gap-3 justify-center">
            <span className="px-3 py-1 bg-slate-800 rounded-full text-sm font-bold text-slate-300">
              📚 Lớp {roomState.roomSettings.grade}
            </span>
            <span className="px-3 py-1 bg-slate-800 rounded-full text-sm font-bold text-slate-300">
              🎯 {roomState.roomSettings.difficulty}
            </span>
            <span className="px-3 py-1 bg-slate-800 rounded-full text-sm font-bold text-slate-300">
              ⏱️ {Math.floor(roomState.roomSettings.timeLimit / 60)} phút
            </span>
            {roomState.roomSettings.topics.slice(0, 2).map(topic => (
              <span key={topic} className="px-3 py-1 bg-blue-600/20 rounded-full text-sm font-bold text-blue-400">
                {topic}
              </span>
            ))}
            {roomState.roomSettings.topics.length > 2 && (
              <span className="px-3 py-1 bg-blue-600/20 rounded-full text-sm font-bold text-blue-400">
                +{roomState.roomSettings.topics.length - 2}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Players List */}
      <div className="bg-slate-900 border border-slate-800 rounded-[30px] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-black text-lg">NGƯỜI CHƠI</h3>
          <div className="flex gap-1">
            {Array.from({ length: roomState?.roomSettings.maxPlayers || maxPlayers }).map((_, i) => {
              const playerList = roomState ? Object.values(roomState.players) : [];
              const filled = i < playerList.length;
              return (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all ${filled ? 'bg-blue-500' : 'bg-slate-700'}`}
                />
              );
            })}
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {roomState && (Object.values(roomState.players) as PlayerInfo[]).map((player) => (
            <div
              key={player.id}
              className={`flex items-center gap-4 p-4 transition-all ${
                player.id === playerId ? 'bg-blue-600/5' : ''
              } ${player.isReady ? 'border-l-2 border-green-500' : 'border-l-2 border-transparent'}`}
            >
              <AvatarDisplay
                avatar={player.avatar}
                name={player.name}
                equippedFrame={player.equippedFrame}
                unlockedFrames={player.unlockedFrames}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black truncate">{player.name}</span>
                  {player.isHost && (
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] font-black rounded uppercase tracking-widest">
                      👑 HOST
                    </span>
                  )}
                  {player.id === playerId && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-500 text-[10px] font-black rounded uppercase tracking-widest">
                      Bạn
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {player.isReady ? (
                  <span className="px-3 py-1.5 bg-green-500/15 text-green-400 text-xs font-black rounded-full border border-green-500/30">
                    ✓ SẴN SÀNG
                  </span>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-800 text-slate-500 text-xs font-bold rounded-full animate-pulse">
                    ⏳ Đang chờ
                  </span>
                )}
                {isHost && player.id !== playerId && (
                  <button
                    onClick={() => handleKickPlayer(player.id)}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                    title="Đuổi khỏi phòng"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* Empty slots */}
          {roomState && Array.from({ length: Math.max(0, (roomState.roomSettings.maxPlayers) - Object.keys(roomState.players).length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center gap-4 p-4 opacity-30">
              <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center">
                <span className="text-slate-600 text-lg">+</span>
              </div>
              <span className="text-slate-600 font-bold text-sm">Đang chờ người chơi...</span>
            </div>
          ))}
        </div>
      </div>

      {/* All-ready banner */}
      {allPlayersReady && playerCount >= 2 && (
        <div className="bg-green-600/10 border border-green-500/40 rounded-2xl p-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
          <p className="text-green-400 font-black text-lg uppercase tracking-widest">⚡ TẤT CẢ ĐÃ SẴN SÀNG!</p>
          {isHost && <p className="text-green-500/70 text-sm mt-1">Bấm BẮT ĐẦU để vào trận</p>}
          {!isHost && <p className="text-green-500/70 text-sm mt-1">Đang chờ host bắt đầu...</p>}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={handleLeaveRoom}
          className="flex-1 py-4 bg-slate-800 text-slate-300 font-black rounded-2xl hover:bg-slate-700 transition-colors"
        >
          RỜI PHÒNG
        </button>

        {!isHost ? (
          <button
            onClick={handleToggleReady}
            className={`flex-[2] py-4 font-black rounded-2xl shadow-xl transition-all active:scale-95 ${
              roomState?.players[playerId]?.isReady
                ? 'bg-yellow-600 text-white shadow-yellow-600/20 hover:bg-yellow-500'
                : 'bg-green-600 text-white shadow-green-600/20 hover:bg-green-500'
            }`}
          >
            {roomState?.players[playerId]?.isReady ? '✓ SẴN SÀNG — Bấm để hủy' : '🎮 SẴN SÀNG CHIẾN ĐẤU'}
          </button>
        ) : (
          <button
            onClick={() => roomState && onStartGame(roomCode, roomState)}
            disabled={!allPlayersReady || playerCount < 2}
            className={`flex-[2] py-4 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              allPlayersReady && playerCount >= 2
                ? 'bg-red-600 text-white shadow-red-600/30 hover:bg-red-500 animate-pulse'
                : 'bg-red-600/60 text-white/70'
            }`}
          >
            {!allPlayersReady
              ? '⏳ CHỜ NGƯỜI CHƠI SẴN SÀNG'
              : playerCount < 2
              ? '👥 CẦN ÍT NHẤT 2 NGƯỜI'
              : '⚔️ BẮT ĐẦU TRẬN ĐẤU!'}
          </button>
        )}
      </div>

      {/* Share Instructions */}
      <div className="text-center">
        <p className="text-slate-500 text-sm">
          Chia sẻ mã phòng{' '}
          <button
            onClick={copyRoomCode}
            className="font-black text-white hover:text-yellow-400 transition-colors underline decoration-dotted underline-offset-2"
            title="Sao chép mã"
          >
            {roomCode}
          </button>
          {' '}cho bạn bè để tham gia
        </p>
      </div>
    </div>
  );
};

export default MultiplayerLobby;
