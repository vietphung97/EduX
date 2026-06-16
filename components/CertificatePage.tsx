/**
 * CertificatePage.tsx
 * Giấy chứng nhận EDUSO SUMMER ENGLISH ARENA — đè text động (họ tên, lớp, trường, tháng)
 * lên ảnh template `public/cert/certificate.png` bằng font viết tay (Caveat).
 *
 * NGUỒN DỮ LIỆU DUY NHẤT: Eduso (https://eduso.vn/currentuser).
 *  - Họ tên  ← edusoUser.name
 *  - Lớp     ← edusoUser.className
 *  - Trường  ← edusoUser.school
 *  - Tháng   ← tháng hiện tại
 *
 * Nếu user là tài khoản tạm (guest, không có edusoUser) ⇒ chặn truy cập, yêu cầu đăng nhập Eduso.
 * Nếu edusoUser tồn tại nhưng API chưa trả className/school ⇒ vẫn render chứng nhận,
 * các dòng đó để trống và hiển thị cảnh báo về backend cần bổ sung.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserProfile, EdusoUserData } from '../types';
import { checkEdusoUserWithClass, EDUSO_LOGIN_URL } from '../utils/userSession';

interface CertificatePageProps {
  user: UserProfile;
  edusoUser?: EdusoUserData | null;
  onBack: () => void;
}

const TEMPLATE_URL = ((import.meta as any).env?.BASE_URL || '/') + 'cert/certificate.png';

const CertificatePage: React.FC<CertificatePageProps> = ({ user, edusoUser, onBack }) => {
  // State riêng để hỗ trợ refresh từ Eduso mà không phải reload app.
  const [eduso, setEduso] = useState<EdusoUserData | null>(edusoUser || null);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(edusoUser ? Date.now() : null);

  // Sync ngay khi mở trang: gọi /currentuserwithclass để lấy luôn className + school.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSyncing(true);
      const fresh = await checkEdusoUserWithClass(5000);
      if (cancelled) return;
      if (fresh) {
        setEduso(fresh);
        setSyncedAt(Date.now());
      }
      setSyncing(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const manualSync = async () => {
    setSyncing(true);
    const fresh = await checkEdusoUserWithClass(6000);
    if (fresh) {
      setEduso(fresh);
      setSyncedAt(Date.now());
    }
    setSyncing(false);
  };

  const [imgOk, setImgOk] = useState<boolean | null>(null);
  const imgProbe = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImgOk(true);
    img.onerror = () => setImgOk(false);
    img.src = TEMPLATE_URL;
    imgProbe.current = img;
  }, []);

  // ====== TRƯỜNG HỢP CHƯA ĐĂNG NHẬP ĐUSO ======
  // Định nghĩa: là Eduso user khi có eduso (object có userId).
  // Phụ trợ: nếu user.id bắt đầu bằng "temp_" thì chắc chắn là guest.
  const isEdusoUser = !!eduso?.userId && !user.id.startsWith('temp_');

  if (!isEdusoUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 animate-in fade-in duration-300">
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 text-center space-y-5">
          <div className="text-5xl">🔒</div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Cần đăng nhập Eduso</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Giấy chứng nhận chỉ cấp cho học sinh đang đăng nhập bằng tài khoản{' '}
            <b>Eduso</b>. Bạn đang dùng tài khoản tạm — họ tên, lớp và trường không đầy đủ.
            Vui lòng đăng nhập tại{' '}
            <a
              href={EDUSO_LOGIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 underline hover:text-red-300"
            >
              {EDUSO_LOGIN_URL.replace(/^https?:\/\//, '').split('/')[0]}
            </a>{' '}
            rồi quay lại đây.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={manualSync}
              disabled={syncing}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-black rounded-xl text-xs uppercase tracking-widest"
            >
              {syncing ? '⏳ ĐANG ĐỒNG BỘ…' : '🔄 ĐỒNG BỘ LẠI EDUSO'}
            </button>
            <button
              onClick={onBack}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl text-xs uppercase tracking-widest border border-slate-700"
            >
              QUAY LẠI
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====== RENDER GIẤY CHỨNG NHẬN ======
  const data = {
    fullName: eduso!.name?.trim() || '',
    className: (eduso!.className || '').trim(),
    school: (eduso!.school || '').trim(),
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
  };

  // Các trường Eduso chưa cấp ⇒ cảnh báo backend.
  const missing: string[] = [];
  if (!data.fullName)  missing.push('name');
  if (!data.className) missing.push('className');
  if (!data.school)    missing.push('school');

  // Toạ độ tương đối (% theo chiều rộng/cao ảnh template 1508×1043).
  const POS = {
    name:   { yPct: 47.8, left: '37.0%', width: '52%', fontSize: 'clamp(20px, 3.8vw, 50px)' },
    klass:  { yPct: 55.2, left: '30.5%', width: '58%', fontSize: 'clamp(18px, 3.4vw, 46px)' },
    school: { yPct: 62.7, left: '33.8%', width: '55%', fontSize: 'clamp(18px, 3.4vw, 46px)' },
    // Dots "....." trên dòng Tháng tập trung tại y=925 (88.7%) — bottom ở 91% để
    // baseline "06" rơi đúng vào dòng kẻ chấm; left dịch trái để khít với "Tháng …."
    month:  { yPct: 89.0, left: '28%', width: '9%',  fontSize: 'clamp(14px, 2.2vw, 28px)' },
  } as const;
  const ASPECT = 1508 / 1043;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-20 px-4 animate-in fade-in duration-500">
      {/* Header & nút điều khiển — ẩn khi in */}
      <div className="flex justify-between items-center no-print gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter uppercase">🎓 GIẤY CHỨNG NHẬN</h2>
          <p className="text-slate-500 text-xs uppercase tracking-widest">Eduso Summer English Arena · 2026</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={manualSync}
            disabled={syncing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-black rounded-xl text-xs uppercase tracking-widest border border-slate-700"
            title="Đồng bộ lại thông tin từ eduso.vn/currentuser"
          >
            {syncing ? '⏳ SYNC…' : '🔄 SYNC EDUSO'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!imgOk || missing.length > 0}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all"
            title={missing.length > 0 ? 'Cần đủ tên, lớp, trường mới in được chứng nhận' : 'In hoặc lưu PDF'}
          >
            🖨️ IN / LƯU PDF
          </button>
          <button
            onClick={onBack}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl transition-all text-[10px] sm:text-xs uppercase tracking-widest border border-slate-700"
          >
            QUAY LẠI
          </button>
        </div>
      </div>

      {/* Thẻ tóm tắt nguồn dữ liệu (chỉ debug; ẩn khi in) */}
      <div className="no-print bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Info label="Họ và tên" value={data.fullName} />
        <Info label="Lớp"        value={data.className} />
        <Info label="Trường"     value={data.school} />
        <Info label="Tháng"      value={data.month} />
        <p className="col-span-2 sm:col-span-4 text-[11px] text-slate-500">
          Nguồn: <code className="text-slate-300">{EDUSO_LOGIN_URL.replace(/^https?:\/\//, '').split('/')[0]}/currentuserwithclass</code>
          {syncedAt && <> · cập nhật {new Date(syncedAt).toLocaleTimeString('vi-VN')}</>}
          {' '}· user ID <code className="text-slate-300">{eduso!.userId}</code>
        </p>
      </div>

      {/* Cảnh báo trường thiếu từ Eduso */}
      {missing.length > 0 && (
        <div className="no-print bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 text-amber-200 text-sm">
          ⚠️ API <code className="font-mono">/currentuserwithclass</code> chưa trả về:
          {' '}<b>{missing.join(', ')}</b>.
          Backend Eduso cần bổ sung các field này vào response để chứng nhận in được đầy đủ.
        </div>
      )}

      {/* Cảnh báo khi thiếu file template */}
      {imgOk === false && (
        <div className="no-print bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 text-amber-200 text-sm">
          ⚠️ Chưa tìm thấy <code className="font-mono">public/cert/certificate.png</code>.
        </div>
      )}

      {/* Giấy chứng nhận — phần in */}
      <div className="cert-print mx-auto" style={{ maxWidth: '1100px' }}>
        <div
          className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-white"
          style={{ aspectRatio: `${ASPECT}` as any }}
        >
          {imgOk !== false ? (
            <img
              src={TEMPLATE_URL}
              alt="Eduso Summer English Arena - Giấy chứng nhận"
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
              (Đặt file certificate.png vào public/cert/ để xem chứng nhận)
            </div>
          )}

          <OverlayText pos={POS.name}   text={data.fullName} />
          <OverlayText pos={POS.klass}  text={data.className} />
          <OverlayText pos={POS.school} text={data.school} />
          <OverlayText pos={POS.month}  text={data.month} align="center" />
        </div>
      </div>

      <p className="no-print text-center text-xs text-slate-600">
        Nhấn <b>In / Lưu PDF</b> để xuất chứng nhận khổ A4 ngang (landscape).
      </p>
    </div>
  );
};

/** Một dòng text viết tay đè lên template, định vị bằng % cha.
 *  Dùng `bottom` để mép đáy text khớp với dòng kẻ chấm (yPct). */
const OverlayText: React.FC<{
  pos: { yPct: number; left: string; width: string; fontSize: string };
  text: string;
  align?: 'left' | 'center';
}> = ({ pos, text, align = 'left' }) => (
  <div
    className="absolute font-handwriting text-[#1e3a8a]"
    style={{
      bottom: `${100 - pos.yPct}%`,
      left: pos.left,
      width: pos.width,
      fontSize: pos.fontSize,
      lineHeight: 1,
      textAlign: align,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'clip',
    }}
  >
    {text}
  </div>
);

/** Thẻ tóm tắt một trường dữ liệu Eduso (chỉ hiển thị giá trị + label, không sửa). */
const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-0.5 font-bold ${value ? 'text-white' : 'text-amber-400 italic'}`}>
      {value || '— chưa có —'}
    </p>
  </div>
);

export default CertificatePage;
