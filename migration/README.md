# Hướng dẫn migrate Supabase → Postgres tự host (Windows, không Docker)

Kiến trúc sau khi migrate: **App (supabase-js) → PostgREST (exe) → PostgreSQL (Windows service)**. Code app gần như không đổi — chỉ đổi `.env`. Realtime được thay bằng polling sẵn có trong code.

---

## GIAI ĐOẠN 1 — Chạy local trên máy dev

### Bước 1. Cài PostgreSQL 17

- Tải installer từ https://www.postgresql.org/download/windows/ (bản EDB).
- Cài mặc định, nhớ mật khẩu user `postgres`, port 5432.
- Thêm `C:\Program Files\PostgreSQL\17\bin` vào PATH (để có `psql`, `pg_dump`).
- Kiểm tra: mở PowerShell mới → `psql --version`.

### Bước 2. Export data từ Supabase cloud

- Vào Supabase Dashboard → Project Settings → Database → **Connection string** (chọn *Session mode*, port 5432), copy chuỗi có mật khẩu.
- Chạy:

```powershell
cd E:\Work\PY\EduX\migration
.\01_export.ps1 -ConnectionString "postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

- Kết quả: file `edux_dump.sql` (toàn bộ bảng `edux_*`, data, 15 RPC, trigger, RLS policy).

### Bước 3. Restore vào Postgres local

- Mở `00_roles_and_auth_shim.sql`, đổi `DOI_MAT_KHAU_NAY` thành mật khẩu bạn tự đặt cho role `authenticator`.
- Chạy:

```powershell
.\02_restore.ps1
```

- Script tự: tạo DB `edux` → tạo roles + shim `auth.uid()` → restore dump → cấp quyền. Cuối cùng in danh sách bảng + số dòng để đối chiếu với Supabase.

### Bước 4. Cài và chạy PostgREST

- Tải bản Windows từ https://github.com/PostgREST/postgrest/releases (file `postgrest-vXX-windows-x64.zip`), giải nén `postgrest.exe` vào ví dụ `C:\postgrest\`.
- Sửa `postgrest.conf` trong thư mục này:
  - `db-uri`: điền mật khẩu `authenticator` đã đặt ở Bước 3.
  - `jwt-secret`: đặt chuỗi ngẫu nhiên ≥ 32 ký tự (giữ bí mật).
- Chạy:

```powershell
C:\postgrest\postgrest.exe E:\Work\PY\EduX\migration\postgrest.conf
```

- Test: mở `http://127.0.0.1:3000/edux_profiles?limit=1` → phải trả JSON.

### Bước 5. Sinh anon key mới + cấu hình app

```powershell
node E:\Work\PY\EduX\migration\make_jwt.mjs "<jwt-secret ở Bước 4>" anon
```

Tạo/sửa `E:\Work\PY\EduX\.env.local`:

```
VITE_SUPABASE_URL=http://localhost:5555
VITE_SUPABASE_ANON_KEY=<JWT vừa sinh>
```

Vite dev server đã được cấu hình proxy `/rest/v1` → PostgREST (xem `vite.config.ts`), nên supabase-js hoạt động bình thường.

### Bước 6. Test local

```powershell
cd E:\Work\PY\EduX
npm run dev
```

Checklist:

- [ ] Đăng nhập qua Eduso, profile hiện đúng XP/level
- [ ] Chơi 1 ván solo → XP cộng đúng, history ghi lại
- [ ] BXH tuần / theo khối hiển thị đúng
- [ ] Tạo phòng multiplayer bằng 2 tab → join, trả lời, kết thúc trận (đồng bộ qua polling, chậm hơn ~1s là bình thường)
- [ ] Vòng quay: quota đúng, quay được, lịch sử ghi lại
- [ ] Console không có lỗi đỏ lặp lại (cảnh báo websocket realtime fail là bình thường — đã có polling fallback)

---

## GIAI ĐOẠN 2 — Deploy lên server Windows (IIS)

### Bước 7. Cài Postgres + PostgREST trên server

- Lặp lại Bước 1–4 trên server (copy thư mục `migration/` + `edux_dump.sql` mới nhất sang).
- **Export lại dump ngay trước khi cắt chuyển** để không mất data mới phát sinh.
- Đăng ký PostgREST chạy như Windows service (tự khởi động lại):

```powershell
# Dùng NSSM (https://nssm.cc) — đơn giản nhất:
nssm install PostgREST "C:\postgrest\postgrest.exe" "C:\postgrest\postgrest.conf"
nssm start PostgREST
```

- Giữ `server-host = "127.0.0.1"` — PostgREST chỉ nghe nội bộ, mọi truy cập từ ngoài đi qua IIS.

### Bước 8. IIS reverse proxy `/rest/v1` → PostgREST

- Cài **URL Rewrite** + **Application Request Routing (ARR)** cho IIS (qua Web Platform Installer hoặc tải trực tiếp từ iis.net).
- Trong ARR (server level) → Proxy Settings → tick **Enable proxy**.
- Thêm rule vào `web.config` của site Eduso (hoặc application `edux`):

```xml
<system.webServer>
  <rewrite>
    <rules>
      <rule name="PostgREST" stopProcessing="true">
        <match url="^rest/v1/(.*)" />
        <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
      </rule>
    </rules>
  </rewrite>
</system.webServer>
```

- Test: `https://<domain>/rest/v1/edux_profiles?limit=1` trả JSON.

### Bước 9. Build app trỏ về server

Sửa `.env.production`:

```
VITE_SUPABASE_URL=https://<domain cua site>   # supabase-js sẽ gọi <domain>/rest/v1/...
VITE_SUPABASE_ANON_KEY=<JWT sinh từ jwt-secret TRÊN SERVER>
```

Rồi `npm run build` (tự robocopy vào wwwroot như hiện tại). Chạy lại checklist Bước 6 trên môi trường thật.

### Bước 10. Cắt chuyển + backup

- Chọn giờ vắng người chơi → export dump mới nhất từ Supabase → restore lên server → deploy build mới.
- Giữ project Supabase thêm 1–2 tuần để có đường lùi.
- Đặt backup tự động hằng ngày trên server (Task Scheduler):

```powershell
pg_dump -U postgres -d edux -f "D:\backup\edux_$(Get-Date -Format yyyyMMdd).sql"
```

---

## Ghi chú kỹ thuật

- **Realtime**: không có trên stack này. Multiplayer đã có polling fallback 1s trong `utils/multiplayerSync.ts` nên vẫn chạy đúng (các thao tác ghi quan trọng đi qua RPC atomic `edux_submit_answer`, `edux_touch_activity`). BXH sẽ không tự live-update — nếu cần, thêm polling vài giây ở leaderboard.
- **db-max-rows = 1000** trong `postgrest.conf` giữ nguyên giới hạn của Supabase để hành vi query không đổi.
- **Supabase Auth/Storage**: app không dùng (đăng nhập qua cookie Eduso) → không cần migrate.
- **auth.uid() shim**: trả NULL với anon key — giống hệt hành vi hiện tại trên cloud, nên RLS policy và các RPC `SECURITY DEFINER` chạy y nguyên.
- File cần bảo mật, KHÔNG commit: mật khẩu `authenticator`, `jwt-secret`, `.env.local`, `.env.production`, `edux_dump.sql` (chứa data người dùng — đã thêm vào .gitignore).
