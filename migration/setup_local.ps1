# ============================================================
# setup_local.ps1 — Tu dong cai Postgres portable + PostgREST,
# backup data tu Supabase cloud va chuyen sang DB local.
# Khong can quyen admin. Log: migration\setup.log
# Chay: powershell -ExecutionPolicy Bypass -File setup_local.ps1
# ============================================================
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MigDir  = $PSScriptRoot
$RepoDir = Split-Path $MigDir -Parent
$Root    = "E:\Work\PY\edux-localdb"
$LogFile = Join-Path $MigDir "setup.log"

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Set-Content -Path $LogFile -Value "=== EDUX LOCAL DB SETUP $(Get-Date) ===" -Encoding UTF8

try {

. (Join-Path $MigDir ".secrets.ps1")   # $SUPA_REF, $SUPA_PASSWORD

New-Item -ItemType Directory -Force -Path $Root | Out-Null
$PgDir   = Join-Path $Root "pgsql"
$DataDir = Join-Path $Root "data"
$PrestDir= Join-Path $Root "postgrest"
$Bin     = Join-Path $PgDir "bin"

# ---------- Sinh secrets ----------
function RandStr($n) { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count $n | ForEach-Object {[char]$_}) }
$SecretsFile = Join-Path $MigDir ".secrets.local.txt"
if (Test-Path $SecretsFile) {
  $prev = Get-Content $SecretsFile | ConvertFrom-StringData
  $PgSuperPw = $prev.PgSuperPw; $AuthPw = $prev.AuthPw; $JwtSecret = $prev.JwtSecret
  Log "Dung lai secrets cu tu .secrets.local.txt"
} else {
  $PgSuperPw = RandStr 20; $AuthPw = RandStr 20; $JwtSecret = RandStr 48
  "PgSuperPw=$PgSuperPw`nAuthPw=$AuthPw`nJwtSecret=$JwtSecret" | Set-Content $SecretsFile -Encoding ASCII
  Log "Da sinh secrets moi -> .secrets.local.txt"
}

# ---------- Buoc 1: Tai PostgreSQL portable ----------
if (-not (Test-Path (Join-Path $Bin "pg_ctl.exe"))) {
  $versions = @("17.8-1","17.7-1","17.6-1","17.5-1","17.4-1","16.10-1","16.9-1")
  $zip = Join-Path $Root "pg-binaries.zip"
  $ok = $false
  foreach ($v in $versions) {
    $url = "https://get.enterprisedb.com/postgresql/postgresql-$v-windows-x64-binaries.zip"
    Log "Thu tai PostgreSQL $v ..."
    try {
      & curl.exe -sfL --retry 2 -o $zip $url
      if ($LASTEXITCODE -eq 0 -and (Get-Item $zip).Length -gt 100MB) { $ok = $true; Log "Tai xong PostgreSQL $v ($([math]::Round((Get-Item $zip).Length/1MB)) MB)"; break }
    } catch { }
  }
  if (-not $ok) { throw "Khong tai duoc PostgreSQL binaries tu EDB" }
  Log "Giai nen PostgreSQL..."
  Expand-Archive -Path $zip -DestinationPath $Root -Force
  Remove-Item $zip -Force
} else { Log "PostgreSQL da co san - bo qua tai" }
$PgVer = (& (Join-Path $Bin "pg_ctl.exe") --version)
Log "PostgreSQL: $PgVer"

# ---------- Buoc 2: Tai PostgREST ----------
$PrestExe = Join-Path $PrestDir "postgrest.exe"
if (-not (Test-Path $PrestExe)) {
  New-Item -ItemType Directory -Force -Path $PrestDir | Out-Null
  $pzip = Join-Path $Root "postgrest.zip"
  Log "Tai PostgREST v14.14..."
  & curl.exe -sfL --retry 2 -o $pzip "https://github.com/PostgREST/postgrest/releases/download/v14.14/postgrest-v14.14-windows-x86-64.zip"
  if ($LASTEXITCODE -ne 0) { throw "Khong tai duoc PostgREST" }
  Expand-Archive -Path $pzip -DestinationPath $PrestDir -Force
  Remove-Item $pzip -Force
  if (-not (Test-Path $PrestExe)) {
    $found = Get-ChildItem $PrestDir -Recurse -Filter "postgrest.exe" | Select-Object -First 1
    if ($found) { Copy-Item $found.FullName $PrestExe }
  }
}
Log "PostgREST: OK"

# ---------- Buoc 3: initdb + start ----------
$PgPort = 5432
if (Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue) {
  if (-not (Test-Path (Join-Path $DataDir "postgresql.conf"))) { $PgPort = 5433; Log "Port 5432 dang ban -> dung 5433" }
}
if (-not (Test-Path (Join-Path $DataDir "postgresql.conf"))) {
  Log "Khoi tao data dir (initdb)..."
  $pwfile = Join-Path $Root "pw.tmp"
  Set-Content $pwfile $PgSuperPw -Encoding ASCII
  & (Join-Path $Bin "initdb.exe") -D $DataDir -U postgres -A scram-sha-256 --pwfile=$pwfile -E UTF8 2>&1 | Out-Null
  Remove-Item $pwfile -Force
  Add-Content (Join-Path $DataDir "postgresql.conf") "`nport = $PgPort`nlisten_addresses = 'localhost'"
} else {
  $m = Select-String -Path (Join-Path $DataDir "postgresql.conf") -Pattern "^port = (\d+)"
  if ($m) { $PgPort = [int]$m.Matches[0].Groups[1].Value }
}
$pgRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port $PgPort -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $pgRunning) {
  Log "Khoi dong PostgreSQL (port $PgPort)..."
  # KHONG dung -Wait (PS cho ca cay tien trinh gom postgres daemon -> treo vinh vien)
  Start-Process -FilePath (Join-Path $Bin "pg_ctl.exe") -ArgumentList "-D","`"$DataDir`"","-l","`"$(Join-Path $Root 'pg.log')`"","start" -WindowStyle Hidden
  $up = $false
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    if (Test-NetConnection -ComputerName 127.0.0.1 -Port $PgPort -InformationLevel Quiet -WarningAction SilentlyContinue) { $up = $true; break }
  }
  if (-not $up) { throw "PostgreSQL khong mo port $PgPort sau 60s (xem pg.log)" }
}
$env:PGPASSWORD = $PgSuperPw
& (Join-Path $Bin "psql.exe") -h 127.0.0.1 -p $PgPort -U postgres -d postgres -c "select version();" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL local khong phan hoi" }
Log "PostgreSQL local dang chay (port $PgPort)"

# ---------- Buoc 4: Tim connection Supabase + backup ----------
$DumpFile = Join-Path $MigDir "edux_dump.sql"
# Project o ap-southeast-1 (xac dinh qua dai IPv6 AWS); host direct chi co IPv6
$SUPA_PASSWORD = [uri]::EscapeDataString($SUPA_PASSWORD)   # ky tu dac biet (@, :, /) trong mat khau
$conns = @()
foreach ($portNum in @(5432, 6543)) {
  foreach ($aws in @("aws-0","aws-1")) {
    $conns += "postgresql://postgres.${SUPA_REF}:$SUPA_PASSWORD@$aws-ap-southeast-1.pooler.supabase.com:$portNum/postgres?sslmode=require&connect_timeout=10"
  }
}
$conns += "postgresql://postgres:$SUPA_PASSWORD@db.$SUPA_REF.supabase.co:5432/postgres?sslmode=require&connect_timeout=10"
$env:PGPASSWORD = $null
$SupaConn = $null
$ErrorActionPreference = "Continue"   # stderr cua psql khong duoc phep nem exception
foreach ($c in $conns) {
  $hostname = (($c -split "@")[1] -split "/")[0]
  $err = & (Join-Path $Bin "psql.exe") $c -c "select 1;" 2>&1
  if ($LASTEXITCODE -eq 0) { $SupaConn = $c; Log "Ket noi Supabase OK qua: $hostname"; break }
  Log ("  that bai ${hostname}: " + ((@($err) | Select-Object -First 2) -join ' | '))
}
# Giu EAP=Continue cho cac buoc psql/pg_dump phia sau (kiem tra $LASTEXITCODE thu cong)
if (-not $SupaConn) { throw "Khong ket noi duoc Supabase - xem loi tung host o tren" }

Log "Dang backup (pg_dump) tu Supabase..."
& (Join-Path $Bin "pg_dump.exe") $SupaConn --schema=public --no-owner --no-privileges -f $DumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump loi" }
Log "Backup xong: edux_dump.sql ($([math]::Round((Get-Item $DumpFile).Length/1KB)) KB)"

# ---------- Buoc 5: Restore vao local ----------
$env:PGPASSWORD = $PgSuperPw
$P = @("-h","127.0.0.1","-p",$PgPort,"-U","postgres")
& (Join-Path $Bin "psql.exe") @P -d postgres -c "DROP DATABASE IF EXISTS edux;" | Out-Null
& (Join-Path $Bin "psql.exe") @P -d postgres -c "CREATE DATABASE edux;" | Out-Null
Log "Da tao database edux"

$shim = (Get-Content (Join-Path $MigDir "00_roles_and_auth_shim.sql") -Raw) -replace "DOI_MAT_KHAU_NAY", $AuthPw
$shimTmp = Join-Path $Root "shim.tmp.sql"
Set-Content $shimTmp $shim -Encoding UTF8
& (Join-Path $Bin "psql.exe") @P -d edux -v ON_ERROR_STOP=1 -f $shimTmp | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Loi khi tao roles/auth shim" }
& (Join-Path $Bin "psql.exe") @P -d edux -c "ALTER ROLE authenticator WITH PASSWORD '$AuthPw';" | Out-Null
Remove-Item $shimTmp -Force
Log "Roles + auth shim OK"

Log "Dang restore dump..."
& (Join-Path $Bin "psql.exe") @P -d edux -f $DumpFile 2>&1 | Where-Object { $_ -match "ERROR" } | ForEach-Object { Log "  restore: $_" }
& (Join-Path $Bin "psql.exe") @P -d edux -v ON_ERROR_STOP=1 -f (Join-Path $MigDir "03_post_restore_grants.sql") | Out-Null
Log "Restore + grants xong"

$counts = & (Join-Path $Bin "psql.exe") @P -d edux -t -A -c "select relname||'='||n_live_tup from pg_stat_user_tables where relname like 'edux_%' order by relname;"
foreach ($c in $counts) { Log "  bang: $c" }

# ---------- Buoc 6: Cau hinh + chay PostgREST ----------
$conf = @"
db-uri = "postgres://authenticator:$AuthPw@127.0.0.1:$PgPort/edux"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JwtSecret"
server-host = "127.0.0.1"
server-port = 3000
db-max-rows = 1000
"@
$ConfFile = Join-Path $PrestDir "postgrest.conf"
Set-Content $ConfFile $conf -Encoding ASCII
Get-Process -Name postgrest -ErrorAction SilentlyContinue | Stop-Process -Force
# PostgREST can libpq.dll va cac DLL di kem — muon tu pgsql\bin qua PATH
$env:Path = "$Bin;" + $env:Path
$ver = & $PrestExe --version 2>&1
Log "PostgREST version check: $ver (exit $LASTEXITCODE)"
Start-Process -FilePath $PrestExe -ArgumentList $ConfFile -WindowStyle Hidden -RedirectStandardError (Join-Path $Root "postgrest.err.log") -RedirectStandardOutput (Join-Path $Root "postgrest.out.log")
Start-Sleep -Seconds 4
if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  foreach ($lf in @("postgrest.err.log","postgrest.out.log")) {
    $p = Join-Path $Root $lf
    if (Test-Path $p) { foreach ($ln in (Get-Content $p | Select-Object -Last 6)) { Log "  ${lf}: $ln" } }
  }
  throw "PostgREST khong mo port 3000 - xem loi o tren"
}
Log "PostgREST da khoi dong (port 3000)"

# ---------- Buoc 7: Sinh anon key (JWT HS256, thuan PowerShell) ----------
function B64Url($bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
$hdr = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
$exp = [int][double]::Parse((Get-Date -UFormat %s)) + 315360000
$pl  = B64Url ([Text.Encoding]::UTF8.GetBytes('{"role":"anon","iss":"edux-local","exp":' + $exp + '}'))
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($JwtSecret)
$sig = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$hdr.$pl")))
$AnonKey = "$hdr.$pl.$sig"
Log "Anon key: $AnonKey"

# ---------- Buoc 8: Cap nhat .env.local ----------
$envFile = Join-Path $RepoDir ".env.local"
if (Test-Path $envFile) { Copy-Item $envFile "$envFile.bak" -Force; Log "Da backup .env.local -> .env.local.bak" }
@"
# Local Postgres + PostgREST (tu dong sinh boi setup_local.ps1)
VIT