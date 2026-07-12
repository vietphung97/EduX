# ============================================================
# 01_export.ps1 — Export toàn bộ schema + data từ Supabase cloud
#
# Lấy connection string: Supabase Dashboard > Project Settings >
# Database > Connection string (Session mode, port 5432).
# Dạng: postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
#
# Cách chạy:
#   .\01_export.ps1 -ConnectionString "postgresql://postgres.xxxx:matkhau@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
#
# Yêu cầu: pg_dump (cài kèm PostgreSQL 17) có trong PATH.
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$ConnectionString
)

$out = Join-Path $PSScriptRoot "edux_dump.sql"

pg_dump $ConnectionString `
  --schema=public `
  --no-owner `
  --no-privileges `
  --quote-all-identifiers `
  --file=$out

if ($LASTEXITCODE -eq 0) {
  Write-Host "OK -> $out ($([math]::Round((Get-Item $out).Length/1KB)) KB)" -ForegroundColor Green
} else {
  Write-Host "pg_dump loi (exit $LASTEXITCODE). Kiem tra connection string / version pg_dump >= server." -ForegroundColor Red
}
