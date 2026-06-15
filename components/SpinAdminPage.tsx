/**
 * SpinAdminPage.tsx
 * Trang quản lý vòng quay may mắn — KHÔNG publish, chỉ vào qua link ẩn:
 *   <domain>/#admin-vongquay
 * Chức năng:
 *   1. Cấu hình giải: tỉ lệ % mỗi lượt, quota tổng, bật/tắt từng giải (lưu edux_spin_config)
 *   2. Tình trạng quota thẻ: đã trúng / giới hạn
 *   3. Danh sách trúng thưởng (mặc định chỉ thẻ điện thoại) + xuất CSV
 */

import React, { useEffect, useState, useCallback } from 'react';
import { SPIN_PRIZES } from './LuckySpin';
import {
  getSpinConfig,
  updateSpinConfig,
  getSpinWinCounts,
  getSpinHistoryAdmin,
  SpinConfigRow,
  SpinHistoryRow,
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
  const [loadingList, setLoadingList] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadingList(true);
    const [cfg, counts, rows] = await Promise.all([
      getSpinConfig(),
      getSpinWinCounts(),
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
    const lines = history.map(r => [
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
                    <th className="py-2 pr-3">Quota (tổng HS trúng)</th>
                    <th className="py-2 pr-3">Đã trúng</th>
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
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyCards}
                  onChange={e => setOnlyCards(e.target.checked)}
                  className="w-4 h-4 accent-yellow-500"
                />
                Chỉ thẻ điện thoại
              </label>
              <button
                onClick={loadAll}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl text-xs uppercase tracking-widest border border-slate-700 transition-all"
              >
                🔄 Tải lại
              </button>
              <button
                onClick={exportCsv}
                disabled={history.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
              >
                ⬇ Xuất CSV
              </button>
            </div>
          </div>

          {loadingList ? (
            <p className="text-slate-500 text-sm py-6 text-center">Đang tải...</p>
          ) : history.length === 0 ? (
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
                  {history.map(r => (
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
      </div>
    </div>
  );
};

export default SpinAdminPage;
