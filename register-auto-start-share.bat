@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [업무일지] LAN용 웹서버를 "로그온 시 자동 시작"으로 등록합니다. (관리자 권한 필요)
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0register-auto-start-share.ps1'"
pause
