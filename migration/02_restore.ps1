# ============================================================
# 02_restore.ps1 — Tạo DB local và restore dump
#
# Cách chạy (mặc định db=edux, user=postgres, host=localhost):
#   .\02_restore.ps1
# Sẽ hỏi mật khẩu postgres vài lần (hoặc set $env:PGPASSWORD trước).
# ============================================================
param(
  [string]$Db = "edux",
  [string]$PgUser = "postgres",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432
)

$common = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser)

Write-Host "1/4 Tao database '$Db' (bo qua neu da ton tai)..."
psql @common -d postgres -c "CREATE DATABASE ""$Db"";" 2>$null

Write-Host "2/4 Tao roles + auth shim..."
psql @common -d $Db -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "00_roles_and_auth_shim.sql")
if ($LASTEXITCODE -ne 0) { Write-Host "LOI o buoc shim" -ForegroundColor Red; exit 1 }

Write-Host "3/4 Restore dump..."
psql @common -d $Db -f (Join-Path $PSScriptRoot "edux_dump.sql")
if ($LASTEXITCODE -ne 0) { Write-Host "Co loi khi restore — xem log o tren (mot so loi 'already exists' co the bo qua)." -ForegroundColor Yellow }

Write-Host "4/4 Cap quyen sau restore..."
psql @common -d $Db -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot "03_post_restore_grants.sql")

Write-Host "XONG. Kiem tra bang danh sach bang o tren." -ForegroundColor Green
