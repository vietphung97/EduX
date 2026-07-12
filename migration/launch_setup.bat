@echo off
echo Dang chay setup... xem tien trinh trong setup.log
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_local.ps1" > "%~dp0launch.log" 2>&1
echo Exit code: %ERRORLEVEL% >> "%~dp0launch.log"
