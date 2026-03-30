@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [업무일지] 자동 시작 등록을 해제합니다. (관리자 권한 필요)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0unregister-auto-start-share.ps1'"
pause
