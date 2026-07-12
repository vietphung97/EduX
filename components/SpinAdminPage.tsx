/**
 * SpinAdminPage.tsx
 * Trang quản lý vòng quay may mắn — KHÔNG publish, chỉ vào qua link ẩn:
 *   <domain>/#admin-vongquay
 * Chức năng:
 *   1. Cấu hình giải: tỉ lệ % mỗi lượt, quota tổng, bật/tắt từng giải (lưu edux_spin_config)
 *   2. Tình trạng quota thẻ: đã trúng / giới hạn
 *   3. Danh sách trúng thưởng (mặc định chỉ thẻ điện thoại) + xuất CSV
 *   4. Reset chương trình (sandbox-first): Quét → Báo cáo + CSV → Confirm phrase → Xóa
 */

import React, { useEffect, useState, useCallback } from 'react';
import { SPIN_PRIZES } from './LuckySpin';
import { getCurrentProgramWeek } from '../constants';
import {
  getSpinConfig,
  updateSpinConfig,
  getSpinWinCounts,
  getSpinHistoryAdmin,
  getProgramResetSnapshot,
  computeResetStats,
  resetProgramAllUsers,
  SpinConfigRow,
  SpinHistoryRow,
  ProgramResetSnapshot,
  ProgramResetStats,
} from '../services/supabase';

// Mật khẩu cấu hình trong .env.local: VITE_SPIN_ADMIN_PASSWORD=...
// Chưa cấu hình → chặn truy cập luôn (an toàn mặc định).
const ADMIN_PASSWORD: string = (import.meta as any).env?.VITE_SPIN_ADMIN_PASSWORD || '';
const AUTH_SESSION_KEY = 'edux_spin_admin_ok';

// Danh sách ID tài khoản được phép vào (VITE_SPIN_ADMIN_IDS, phân cách dấu phẩy).
// Trống → không ai vào được.
const ADMIN_IDS: string[] = String((import.meta as any).env?.VITE_SPIN_ADMIN_IDS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

/** ID tài khoản đang đăng nhập trong app (đọc từ localStorage) */
function getLoggedInUserId(): string | null {
  try {
    const raw = localStorage.getItem('arena_x_user');
    return raw ? (JSON.parse(raw).id || null) : null;
  } catch {
    return null;
  }
}

const SpinAdminPage: React.FC = () => {
  // ── Đăng nhập bằng mật khẩu ─────────────────────────────────────────────────
  const [authed, setAuthed] = useState(() => {
    try { return sessionStorage.getItem(AUTH_SESSION_KEY) === '1'; } catch { return false; }
  });
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');

  const tryLogin = () => {
    if (!ADMIN_PASSWORD) {
      setPwError('Chưa cấu hình VITE_SPIN_ADMIN_PASSWORD trong file .env');
      return;
    }
    if (pwInput === ADMIN_PASSWORD) {
      try { sessionStorage.setItem(AUTH_SESSION_KEY, '1'); } catch { /* ignore */ }
      setAuthed(true);
    } else {
      setPwError('Sai mật khẩu');
    }
  };

  // ── Cấu hình ────────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<SpinConfigRow[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // ── Quota + danh sách ───────────────────────────────────────────────────────
  const [winCounts, setWinCounts] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<SpinHistoryRow[]>([]);
  const [onlyCards, setOnlyCards] = useState(true);
  const [weekFilter, setWeekFilter] = useState<string>('all');
  const [loadingList, setLoadingList] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingList(true);
    const [cfg, counts, rows] = await Promise.all([
      getSpinConfig(),
      getSpinWinCounts(getCurrentProgramWeek()),
      getSpinHistoryAdmin(onlyCards),
    ]);

    // Merge config server với default trong code (đảm bảo đủ 9 giải)
    const cfgMap = new Map((cfg || []).map(r => [r.prizeId, r]));
    setConfig(SPIN_PRIZES.map(p => cfgMap.get(p.id) || ({
      prizeId: p.id,
      weight: p.weight,
      quota: p.quota,
      enabled: true,
    })));
    setConfigLoaded(true);
    setWinCounts(counts || {});
    setHistory(rows);
    setLoadingList(false);
  }, [onlyCards]);

  useEffect(() => {
    if (authed) loadAll(); // chỉ tải dữ liệu sau khi qua mật khẩu
  }, [authed, loadAll]);

  const updateRow = (prizeId: string, patch: Partial<SpinConfigRow>) => {
    setConfig(prev => prev.map(r => (r.prizeId === prizeId ? { ...r, ...patch } : r)));
  };

  const totalWeight = config.reduce((s, r) => s + (r.enabled ? r.weight : 0), 0);

  const saveConfig = async () => {
    setSaving(true);
    setSaveMsg('');
    const ok = await updateSpinConfig(config);
    setSaving(false);
    setSaveMsg(ok ? '✅ Đã lưu cấu hình' : '❌ Lỗi khi lưu — kiểm tra đã chạy SQL lucky_spin.sql chưa');
    setTimeout(() => setSaveMsg(''), 4000);
  };

  const exportCsv = () => {
    const header = ['Thời gian', 'Tuần', 'Tài khoản', 'Giải', 'XP', 'Họ tên HS', 'Lớp', 'Trường', 'SĐT', 'Nhà mạng', 'Đã điền form'];
    const lines = filteredHistory.map(r => [
      new Date(r.createdAt).toLocaleString('vi-VN'),
      r.week ?? '',
      r.userName ?? r.userId,
      r.prizeLabel ?? r.prizeId,
      r.xpBonus || '',
      r.studentName ?? '',
      r.className ?? '',
      r.school ?? '',
      r.phone ?? '',
      r.carrier ?? '',
      r.claimed ? 'Có' : 'Chưa',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trung-thuong-vongquay-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const prizeById = new Map(SPIN_PRIZES.map(p => [p.id, p]));

  // Danh sách các tuần thực sự có trong dữ liệu (để đổ vào dropdown lọc)
  const availableWeeks = Array.from(new Set(history.map(r => r.week).filter((w): w is number => w !== null && w !== undefined)))
    .sort((a, b) => a - b);
  const filteredHistory = weekFilter === 'all'
    ? history
    : history.filter(r => (weekFilter === 'none' ? (r.week === null || r.week === undefined) : r.week === Number(weekFilter)));

  // ── 3. RESET CHƯƠNG TRÌNH (chuẩn bị program mới) ───────────────────────────
  // Flow 4 bước bắt buộc (sandbox-first):
  //   (1) Quét sandbox → snapshot + thống kê (chưa đụng DB)
  //   (2) Tải báo cáo + 3 CSV (bắt phải tải mới enable bước sau)
  //   (3) Gõ phrase xác nhận
  //   (4) Xóa thật
  const [resetSnap, setResetSnap] = useState<ProgramResetSnapshot | null>(null);
  const [resetStats, setResetStats] = useState<ProgramResetStats | null>(null);
  const [resetExported, setResetExported] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const RESET_CONFIRM_PHRASE = 'XÓA TOÀN BỘ';

  const downloadBlob = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadCsv = (filename: string, header: string[], rows: any[][]) => {
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [header.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    downloadBlob(filename, csv, 'text/csv;charset=utf-8');
  };

  // BƯỚC 1: Quét sandbox — pull data + compute stats, KHÔNG xóa gì.
  const runDryRunScan = async () => {
    setResetBusy(true);
    setResetMsg({ tone: 'info', text: 'Đang quét dữ liệu (read-only)...' });
    const snap = await getProgramResetSnapshot();
    if (!snap) {
      setResetBusy(false);
      setResetMsg({ tone: 'err', text: '❌ Không lấy được snapshot — kiểm tra kết nối Supabase' });
      return;
    }
    const stats = computeResetStats(snap);
    setResetSnap(snap);
    setResetStats(stats);
    setResetExported(false);       // quét lại thì phải tải báo cáo lại
    setResetConfirmText('');       // và phải nhập phrase lại
    setResetBusy(false);
    setResetMsg({
      tone: 'ok',
      text: `✅ Quét xong — chưa xóa gì. Snapshot @ ${new Date(snap.fetchedAt).toLocaleString('vi-VN')}.`,
    });
  };

  // BƯỚC 2: Tải báo cáo (.txt) + 3 CSV từ snapshot đã quét.
  const downloadFullReport = () => {
    if (!resetSnap || !resetStats) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const s = resetStats;

    const L: string[] = [];
    L.push('═══════════════════════════════════════════════════════════');
    L.push('  BÁO CÁO TIỀN-RESET CHƯƠNG TRÌNH EDUX');
    L.push(`  Snapshot lúc: ${new Date(s.fetchedAt).toLocaleString('vi-VN')}`);
    L.push('═══════════════════════════════════════════════════════════');
    L.push('');
    L.push('[1] PROFILES (edux_profiles) — sẽ RESET (giữ tên/avatar/lớp)');
    L.push(`    Tổng số tài khoản:     ${s.profiles.total}`);
    L.push(`    Đang có XP > 0:        ${s.profiles.withXp}`);
    L.push(`    Tổng XP tích lũy:      ${s.profiles.totalXp.toLocaleString('vi-VN')}`);
    L.push(`    Tổng XP tuần:          ${s.profiles.totalWeeklyXp.toLocaleString('vi-VN')}`);
    L.push(`    Tổng số trận đã chơi:  ${s.profiles.totalGames.toLocaleString('vi-VN')}`);
    L.push(`    HS đã mở khung:        ${s.profiles.withUnlockedFrames} (tổng ${s.profiles.framesUnlockedTotal} khung sẽ bị thu hồi)`);
    L.push(`    Phân bố theo lớp:      ${Object.entries(s.profiles.byGrade).sort().map(([g, n]) => `Lớp ${g}: ${n}`).join(' · ') || '—'}`);
    L.push('    Top 5 XP cao nhất (sẽ về 0):');
    s.profiles.topXp.forEach((p, i) => L.push(`      ${i + 1}. ${p.name} — ${p.xp.toLocaleString('vi-VN')} XP`));
    L.push('');
    L.push('[2] GAME HISTORY (edux_game_history) — sẽ XÓA SẠCH');
    L.push(`    Tổng số trận:          ${s.gameHistory.total.toLocaleString('vi-VN')}`);
    L.push(`    Solo:                  ${s.gameHistory.solo.toLocaleString('vi-VN')}`);
    L.push(`    Thách đấu (multi):     ${s.gameHistory.multiplayer.toLocaleString('vi-VN')}`);
    L.push(`    Tổng XP đã trao:       ${s.gameHistory.totalXpEarned.toLocaleString('vi-VN')}`);
    L.push(`    Phân bố theo lớp:      ${Object.entries(s.gameHistory.byGrade).sort().map(([g, n]) => `Lớp ${g}: ${n}`).join(' · ') || '—'}`);
    L.push(`    Trận sớm nhất:         ${s.gameHistory.earliest ? new Date(s.gameHistory.earliest).toLocaleString('vi-VN') : '—'}`);
    L.push(`    Trận mới nhất:         ${s.gameHistory.latest ? new Date(s.gameHistory.latest).toLocaleString('vi-VN') : '—'}`);
    L.push('');
    L.push('[3] SPIN HISTORY (edux_spin_history) — sẽ XÓA SẠCH (reset quota thẻ)');
    L.push(`    Tổng số lượt quay:     ${s.spinHistory.total.toLocaleString('vi-VN')}`);
    L.push(`    Tổng XP từ vòng quay:  ${s.spinHistory.totalXpBonus.toLocaleString('vi-VN')}`);
    L.push(`    Số thẻ điện thoại đã trúng: ${s.spinHistory.cardsWon}`);
    L.push(`      Đã nhận (claimed):     ${s.spinHistory.cardsClaimed}`);
    L.push(`      CHƯA NHẬN:             ${s.spinHistory.cardsUnclaimed}  ${s.spinHistory.cardsUnclaimed > 0 ? '⚠ XÁC NHẬN ĐÃ TRAO THƯỞNG TRƯỚC KHI XÓA!' : ''}`);
    L.push(`    Theo từng giải:`);
    Object.entries(s.spinHistory.byPrize).forEach(([pid, n]) => L.push(`      ${pid.padEnd(10)} ${n}`));
    if (s.spinHistory.unclaimedDetail.length > 0) {
      L.push('');
      L.push('    ⚠ DANH SÁCH THẺ CHƯA NHẬN (tối đa 20 dòng — xem CSV để đủ):');
      s.spinHistory.unclaimedDetail.forEach((r, i) => L.push(
        `      ${(i + 1).toString().padStart(2)}. ${r.userName} — ${r.prizeLabel} — ${r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : ''}`,
      ));
    }
    L.push('');
    L.push('═══════════════════════════════════════════════════════════');
    L.push('  3 CSV backup kèm theo:');
    L.push(`    backup-profiles-${stamp}.csv`);
    L.push(`    backup-game-history-${stamp}.csv`);
    L.push(`    backup-spin-history-${stamp}.csv`);
    L.push('═══════════════════════════════════════════════════════════');

    downloadBlob(`RESET-REPORT-${stamp}.txt`, L.join('\n'), 'text/plain;charset=utf-8');

    downloadCsv(
      `backup-profiles-${stamp}.csv`,
      ['id', 'name', 'grade', 'xp', 'weekly_xp', 'level', 'total_games', 'best_streak', 'unlocked_frames', 'equipped_frame', 'grade_xp', 'topic_stats'],
      resetSnap.profiles.map(p => [
        p.id, p.name, p.grade, p.xp, p.weekly_xp, p.level, p.total_games, p.best_streak,
        JSON.stringify(p.unlocked_frames || []),
        p.equipped_frame || '',
        JSON.stringify(p.grade_xp || {}),
        JSON.stringify(p.topic_stats || {}),
      ]),
    );

    downloadCsv(
      `backup-game-history-${stamp}.csv`,
      ['id', 'user_id', 'played_at', 'mode', 'grade', 'difficulty', 'correct_count', 'total_questions', 'xp_earned', 'max_streak', 'time_spent', 'score', 'room_code'],
      resetSnap.gameHistory.map(g => [
        g.id, g.user_id, g.played_at, g.mode, g.grade, g.difficulty,
        g.correct_count, g.total_questions, g.xp_earned, g.max_streak,
        g.time_spent, g.score, g.room_code || '',
      ]),
    );

    downloadCsv(
      `backup-spin-history-${stamp}.csv`,
      ['id', 'user_id', 'user_name', 'prize_id', 'prize_label', 'xp_bonus', 'week', 'phone', 'carrier', 'student_name', 'class_name', 'school', 'claimed', 'created_at'],
      resetSnap.spinHistory.map(s => [
        s.id, s.user_id, s.user_name, s.prize_id, s.prize_label, s.xp_bonus, s.week,
        s.phone, s.carrier, s.student_name, s.class_name, s.school,
        s.claimed ? 'Có' : 'Chưa', s.created_at,
      ]),
    );

    setResetExported(true);
    setResetMsg({
      tone: 'ok',
      text: '✅ Đã tải 1 báo cáo + 3 CSV. Có thể chuyển sang bước xác nhận.',
    });
  };

  const doReset = async () => {
    if (!resetStats) {
      setResetMsg({ tone: 'err', text: '❌ Phải quét báo cáo trước (Bước 1)' });
      return;
    }
    if (!resetExported) {
      setResetMsg({ tone: 'err', text: '❌ Phải tải báo cáo + CSV trước khi xóa (Bước 2)' });
      return;
    }
    if (resetConfirmText !== RESET_CONFIRM_PHRASE) {
      setResetMsg({ tone: 'err', text: `❌ Phải gõ chính xác "${RESET_CONFIRM_PHRASE}"` });
      return;
    }
    const unclaimedWarn = resetStats.spinHistory.cardsUnclaimed > 0
      ? `\n\n⚠ CẢNH BÁO: còn ${resetStats.spinHistory.cardsUnclaimed} thẻ điện thoại đã TRÚNG nhưng CHƯA NHẬN. Sau khi xóa sẽ KHÔNG còn dữ liệu để trao thưởng!\n`
      : '';
    if (!window.confirm(
      'CẢNH BÁO CUỐI CÙNG\n\n' +
      'Thao tác này sẽ XOÁ VĨNH VIỄN:\n' +
      ' - XP và tiến trình mọi học sinh\n' +
      ' - Toàn bộ lịch sử thi đấu\n' +
      ' - Toàn bộ lượt vòng quay (kèm quà tặng đã trúng)\n' +
      ' - Khung huy hiệu đã mở khoá\n' +
      unclaimedWarn +
      '\nTài khoản học sinh (tên, avatar, lớp) được GIỮ LẠI.\n\n' +
      'Bấm OK để xác nhận xoá. Không có Undo.'
    )) return;

    setResetBusy(true);
    setResetMsg({ tone: 'info', text: 'Đang xoá dữ liệu... vui lòng giữ tab này mở' });
    const res = await resetProgramAllUsers();
    setResetBusy(false);

    if (res.ok) {
      setResetMsg({
        tone: 'ok',
        text: `✅ Hoàn tất: reset ${res.profilesReset} profile · xoá ${res.gameHistoryDeleted} trận · xoá ${res.spinHistoryDeleted} lượt quay. Sẵn sàng cho chương trình mới.`,
      });
      setResetConfirmText('');
      setResetExported(false);
      setResetSnap(null);
      setResetStats(null);
      loadAll();
    } else {
      setResetMsg({
        tone: 'err',
        text: `⚠ Có lỗi (đã xử lý một phần): ${res.profilesReset} profile · ${res.gameHistoryDeleted} game · ${res.spinHistoryDeleted} spin. ${res.error || ''}`,
      });
    }
  };

  // ── Chặn theo tài khoản: chỉ ID trong VITE_SPIN_ADMIN_IDS được vào ─────────
  const loggedInId = (getLoggedInUserId() || '').toLowerCase();
  const accountAllowed = ADMIN_IDS.length > 0 && ADMIN_IDS.includes(loggedInId);
  if (!accountAllowed) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-3">⛔</p>
          <h1 className="text-lg font-black uppercase tracking-tight">Không có quyền truy cập</h1>
          <p className="text-slate-500 text-xs font-bold mt-2 leading-relaxed">
            Tài khoản đang đăng nhập không được cấp quyền vào trang này.
          </p>
        </div>
      </div>
    );
  }

  // ── Màn hình nhập mật khẩu ──────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center">
          <p className="text-4xl mb-3">🔐</p>
          <h1 className="text-lg font-black uppercase tracking-tight">Trang quản lý vòng quay</h1>
          <p className="text-slate-500 text-xs font-bold mt-1 mb-5">Nhập mật khẩu để tiếp tục</p>
          <input
            type="password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') tryLogin(); }}
            autoFocus
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold text-center focus:outline-none focus:border-yellow-500"
            placeholder="Mật khẩu"
          />
          {pwError && <p className="text-xs font-bold text-red-400 mt-2">{pwError}</p>}
          <button
            onClick={tryLogin}
            className="mt-4 w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-xs uppercase tracking-widest transition-all"
          >
            Vào trang quản lý
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">⚙️ Quản lý vòng quay may mắn</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            Trang nội bộ — không chia sẻ link này
          </p>
        </div>

        {/* ── 1. Cấu hình giải ── */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black uppercase">Cấu hình giải thưởng</h2>
            <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
              Math.abs(totalWeight - 100) < 0.01 ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
            }`}>
              Tổng tỉ lệ: {totalWeight.toFixed(2)}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            📅 Quota đang tính cho <b className="text-slate-300">Tuần {getCurrentProgramWeek() ?? '—'}</b> — tự khôi phục về 0 khi sang tuần mới, lịch sử tuần trước vẫn được giữ nguyên.
          </p>

          {!configLoaded ? (
            <p className="text-slate-500 text-sm py-4 text-center">Đang tải...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3">Giải</th>
                    <th className="py-2 pr-3">Tỉ lệ %/lượt</th>
                    <th className="py-2 pr-3">Tỉ lệ thực tế</th>
                    <th className="py-2 pr-3">Quota (tổng HS trúng/tuần)</th>
                    <th className="py-2 pr-3">Đã trúng (tuần này)</th>
                    <th className="py-2">Bật</th>
                  </tr>
                </thead>
                <tbody>
                  {config.map(row => {
                    const p = prizeById.get(row.prizeId);
                    const won = winCounts[row.prizeId] || 0;
                    const isCard = p?.type === 'card';
                    const quotaFull = isCard && row.quota !== null && won >= row.quota;
                    return (
                      <tr key={row.prizeId} className="border-b border-slate-800/50">
                        <td className="py-2.5 pr-3 font-bold whitespace-nowrap">
                          {p?.emoji} {p?.label || row.prizeId}
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            step={0.05}
                            value={row.weight}
                            onChange={e => updateRow(row.prizeId, { weight: Number(e.target.value) || 0 })}
                            className="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg font-bold text-white focus:outline-none focus:border-yellow-500"
                          />
                        </td>
                        <td className="py-2.5 pr-3 font-black text-slate-300 whitespace-nowrap">
                          {/* Tỉ lệ thực tế = trọng số / tổng trọng số các giải đang bật */}
                          {row.enabled && totalWeight > 0
                            ? `${((row.weight / totalWeight) * 100).toFixed(2)}%`
                            : <span className="text-slate-600">0%</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          {isCard ? (
                            <input
                              type="number"
                              min={0}
                              value={row.quota ?? 0}
                              onChange={e => updateRow(row.prizeId, { quota: Number(e.target.value) || 0 })}
                              className="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg font-bold text-white focus:outline-none focus:border-yellow-500"
                            />
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className={`py-2.5 pr-3 font-black ${quotaFull ? 'text-red-400' : 'text-slate-300'}`}>
                          {isCard ? `${won}/${row.quota ?? '∞'}${quotaFull ? ' (hết)' : ''}` : won}
                        </td>
                        <td className="py-2.5">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={e => updateRow(row.prizeId, { enabled: e.target.checked })}
                            className="w-4 h-4 accent-yellow-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={saveConfig}
              disabled={saving || !configLoaded}
              className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-700 disabled:text-slate-500 text-black font-black rounded-xl text-xs uppercase tracking-widest transition-all"
            >
              {saving ? 'Đang lưu...' : '💾 Lưu cấu hình'}
            </button>
            {saveMsg && <span className="text-xs font-bold">{saveMsg}</span>}
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Tỉ lệ là trọng số tương đối mỗi lượt quay. Thẻ hết quota tự ngừng ra (không cần tắt tay).
          </p>
        </section>

        {/* ── 2. Danh sách trúng thưởng ── */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-black uppercase">Danh sách trúng thưởng</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyCards}
                  onChange={e => setOnlyCards(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500"
                />
                Chỉ thẻ điện thoại
              </label>
              <select
                value={weekFilter}
                onChange={e => setWeekFilter(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 focus:outline-none focus:border-yellow-500"
              >
                <option value="all">Tất cả các tuần</option>
                {availableWeeks.map(w => (
                  <option key={w} value={String(w)}>Tuần {w}</option>
                ))}
                {history.some(r => r.week === null || r.week === undefined) && (
                  <option value="none">Ngoài chương trình</option>
                )}
              </select>
              <button
                onClick={loadAll}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl text-xs uppercase tracking-widest border border-slate-700 transition-all"
              >
                🔄 Tải lại
              </button>
              <button
                onClick={exportCsv}
                disabled={filteredHistory.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                ⬇ Xuất CSV
              </button>
            </div>
          </div>

          {loadingList ? (
            <p className="text-slate-500 text-sm py-6 text-center">Đang tải...</p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">Chưa có dữ liệu</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    <th className="py-2 pr-3 whitespace-nowrap">Thời gian</th>
                    <th className="py-2 pr-3">Tuần</th>
                    <th className="py-2 pr-3">Tài khoản</th>
                    <th className="py-2 pr-3">Giải</th>
                    <th className="py-2 pr-3">Họ tên HS</th>
                    <th className="py-2 pr-3">Lớp</th>
                    <th className="py-2 pr-3">Trường</th>
                    <th className="py-2 pr-3">SĐT</th>
                    <th className="py-2 pr-3">Nhà mạng</th>
                    <th className="py-2">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(r => (
                    <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-400">
                        {new Date(r.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">{r.week ?? '—'}</td>
                      <td className="py-2 pr-3 font-bold">{r.userName || r.userId}</td>
                      <td className="py-2 pr-3 font-bold whitespace-nowrap">
                        {prizeById.get(r.prizeId)?.emoji} {r.prizeLabel || r.prizeId}
                      </td>
                      <td className="py-2 pr-3">{r.studentName || '—'}</td>
                      <td className="py-2 pr-3">{r.className || '—'}</td>
                      <td className="py-2 pr-3">{r.school || '—'}</td>
                      <td className="py-2 pr-3 font-mono">{r.phone || '—'}</td>
                      <td className="py-2 pr-3">{r.carrier || '—'}</td>
                      <td className="py-2">
                        {r.prizeId.startsWith('card')
                          ? (r.claimed
                              ? <span className="text-green-400 font-black">✓</span>
                              : <span className="text-amber-400 font-black">Chưa</span>)
                          : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 3. Reset chương trình ── */}
        <section className="bg-slate-900 border-2 border-red-900/60 rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-lg font-black uppercase text-red-300">⚠ Reset chương trình mới</h2>
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 uppercase tracking-widest">
              Không thể hoàn tác
            </span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed mb-4">
            Xoá <b className="text-red-300">XP, lịch sử thi đấu, hạng tuần, lượt vòng quay & quà tặng, khung huy hiệu</b> của
            <b className="text-red-300"> toàn bộ học sinh</b> để bắt đầu chương trình mới. Tài khoản (tên/avatar/lớp) được giữ lại.
          </p>

          <ol className="space-y-3 text-sm">
            {/* Bước 1: Quét sandbox */}
            <li className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                  resetStats ? 'bg-green-500 text-black' : 'bg-slate-700 text-white'
                }`}>{resetStats ? '✓' : '1'}</span>
                <div className="flex-1">
                  <p className="font-black text-white">Quét sandbox — thống kê dữ liệu sẽ bị ảnh hưởng (read-only)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                    Pull snapshot 3 bảng (profiles + game_history + spin_history). Hoàn toàn không xóa.
                  </p>
                  <button
                    onClick={runDryRunScan}
                    disabled={resetBusy}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    {resetBusy && !resetStats ? 'Đang quét...' : (resetStats ? '🔄 Quét lại' : '🔍 Quét sandbox')}
                  </button>
                </div>
              </div>

              {/* Inline report — chỉ hiện sau khi quét */}
              {resetStats && (
                <div className="mt-4 ml-10 space-y-3">
                  {/* Snapshot meta */}
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Snapshot: {new Date(resetStats.fetchedAt).toLocaleString('vi-VN')}
                  </p>

                  {/* 3 thẻ stats lớn */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Profiles</p>
                      <p className="text-2xl font-black text-white">{resetStats.profiles.total}</p>
                      <p className="text-[11px] text-slate-400 font-bold mt-1">
                        {resetStats.profiles.withXp} có XP · tổng {resetStats.profiles.totalXp.toLocaleString('vi-VN')} XP
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {resetStats.profiles.framesUnlockedTotal} khung sẽ bị thu hồi
                      </p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Trận đấu</p>
                      <p className="text-2xl font-black text-white">{resetStats.gameHistory.total.toLocaleString('vi-VN')}</p>
                      <p className="text-[11px] text-slate-400 font-bold mt-1">
                        Solo {resetStats.gameHistory.solo} · Multi {resetStats.gameHistory.multiplayer}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        XP đã trao: {resetStats.gameHistory.totalXpEarned.toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Vòng quay</p>
                      <p className="text-2xl font-black text-white">{resetStats.spinHistory.total.toLocaleString('vi-VN')}</p>
                      <p className="text-[11px] text-slate-400 font-bold mt-1">
                        {resetStats.spinHistory.cardsWon} thẻ trúng ({resetStats.spinHistory.cardsClaimed} đã nhận)
                      </p>
                      <p className={`text-[11px] font-black mt-0.5 ${resetStats.spinHistory.cardsUnclaimed > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {resetStats.spinHistory.cardsUnclaimed > 0
                          ? `⚠ ${resetStats.spinHistory.cardsUnclaimed} thẻ chưa nhận!`
                          : '✓ Không có thẻ tồn'}
                      </p>
                    </div>
                  </div>

                  {/* Cảnh báo thẻ chưa nhận */}
                  {resetStats.spinHistory.cardsUnclaimed > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3">
                      <p className="text-amber-300 font-black text-xs mb-2">
                        ⚠ Còn {resetStats.spinHistory.cardsUnclaimed} thẻ điện thoại đã trúng nhưng chưa điền form nhận
                      </p>
                      <div className="max-h-32 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <tbody>
                            {resetStats.spinHistory.unclaimedDetail.map((r, i) => (
                              <tr key={i} className="border-b border-amber-500/10">
                                <td className="py-1 pr-2 font-bold text-amber-200">{r.userName}</td>
                                <td className="py-1 pr-2 text-amber-300">{r.prizeLabel}</td>
                                <td className="py-1 text-amber-500/70 text-[10px] whitespace-nowrap">
                                  {r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-amber-400/80 mt-2">
                        Xem đủ trong CSV. Nên trao thưởng hết trước khi xóa.
                      </p>
                    </div>
                  )}

                  {/* Top 5 XP */}
                  {resetStats.profiles.topXp.length > 0 && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Top 5 XP (sẽ về 0)</p>
                      <div className="space-y-1">
                        {resetStats.profiles.topXp.map((p, i) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-300">{i + 1}. {p.name}</span>
                            <span className="font-black text-slate-400">{p.xp.toLocaleString('vi-VN')} XP</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phân bố lớp */}
                  {Object.keys(resetStats.profiles.byGrade).length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      <span className="font-black text-slate-500">Profile theo lớp: </span>
                      {Object.entries(resetStats.profiles.byGrade).sort().map(([g, n]) => `Lớp ${g}: ${n}`).join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </li>

            {/* Bước 2: Tải báo cáo + CSV */}
            <li className={`bg-slate-950/60 border rounded-2xl p-4 ${resetStats ? 'border-slate-800' : 'border-slate-900'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                  resetExported ? 'bg-green-500 text-black' : resetStats ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-600'
                }`}>{resetExported ? '✓' : '2'}</span>
                <div className="flex-1">
                  <p className={`font-black ${resetStats ? 'text-white' : 'text-slate-600'}`}>
                    Tải báo cáo + 3 CSV (bắt buộc)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                    1 file <code>RESET-REPORT-*.txt</code> + 3 file CSV (profiles, game_history, spin_history).
                  </p>
                  <button
                    onClick={downloadFullReport}
                    disabled={!resetStats || resetBusy}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-black rounded-xl text-xs uppercase tracking-widest border border-slate-700 transition-all"
                  >
                    ⬇ Tải báo cáo + CSV
                  </button>
                </div>
              </div>
            </li>

            {/* Bước 3: Confirm phrase */}
            <li className={`bg-slate-950/60 border rounded-2xl p-4 ${resetExported ? 'border-slate-800' : 'border-slate-900'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                  resetConfirmText === RESET_CONFIRM_PHRASE && resetExported
                    ? 'bg-green-500 text-black'
                    : resetExported ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-600'
                }`}>{resetConfirmText === RESET_CONFIRM_PHRASE && resetExported ? '✓' : '3'}</span>
                <div className="flex-1">
                  <p className={`font-black ${resetExported ? 'text-white' : 'text-slate-600'}`}>
                    Gõ chính xác <code className="px-1.5 py-0.5 bg-red-500/15 text-red-300 rounded text-[11px] font-mono">{RESET_CONFIRM_PHRASE}</code> để xác nhận
                  </p>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={e => setResetConfirmText(e.target.value)}
                    disabled={!resetExported || resetBusy}
                    placeholder={RESET_CONFIRM_PHRASE}
                    className="mt-2 w-full max-w-sm px-3 py-2 bg-slate-900 border border-slate-700 disabled:opacity-40 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </li>

            {/* Bước 4: Xóa */}
            <li className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                  resetConfirmText === RESET_CONFIRM_PHRASE && resetExported
                    ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-600'
                }`}>4</span>
                <div className="flex-1">
                  <p className={`font-black ${resetConfirmText === RESET_CONFIRM_PHRASE && resetExported ? 'text-red-300' : 'text-slate-600'}`}>
                    Thực hiện xoá (không hoàn tác)
                  </p>
                  <button
                    onClick={doReset}
                    disabled={resetBusy || !resetExported || resetConfirmText !== RESET_CONFIRM_PHRASE}
                    className="mt-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    {resetBusy && resetExported ? 'Đang xoá...' : '🗑 Xoá & bắt đầu chương trình mới'}
                  </button>
                </div>
              </div>
            </li>
          </ol>

          {resetMsg && (
            <p className={`mt-4 text-xs font-bold ${
              resetMsg.tone === 'ok' ? 'text-green-400' :
              resetMsg.tone === 'err' ? 'text-red-400' : 'text-slate-400'
            }`}>
              {resetMsg.text}
            </p>
          )}

          <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
            Lưu ý: cấu hình giải vòng quay (% tỉ lệ, quota) <b>không bị reset</b> — chỉnh ở mục 1 nếu muốn đổi cho chương trình mới.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SpinAdminPage;

