# 관리자 권한으로 실행: 부팅 후(로그온 시) 업무일지 웹서버를 자동으로 띄웁니다.
# UNC 경로 공유 폴더에서는 "로그온 시" 트리거가 안정적입니다(네트워크 드라이브/공유 접근).
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$taskName = 'WorkLogWebServerShare'
$fwName = 'WorkLog Web TCP 3000'
$root = $PSScriptRoot
$daemon = Join-Path $root 'start-server-share-daemon.ps1'

if (-not (Test-Path -LiteralPath $daemon)) {
  Write-Host "파일이 없습니다: $daemon"
  exit 1
}

$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$daemon`""
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $arg

# 로그온한 사용자로 실행(UNC 공유 접근 가능). 공유 폴더(UNC)는 LocalSystem보다 로그온 계정이 안전합니다.
# 서버 PC가 부팅만 하고 아무도 로그인하지 않으면 이 트리거는 실행되지 않습니다 → 해당 PC에 자동 로그온 설정을 권장합니다.
$who = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $who
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal -UserId $who -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

if (-not (Get-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $fwName -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow | Out-Null
}

Write-Host "등록 완료: 예약 작업 [$taskName]"
Write-Host "  - 트리거: Windows 계정 로그온 시 ($who)"
Write-Host "  - 동작: LAN 공유용 웹서버 (포트 3000, HOST=0.0.0.0, 창 없음)"
Write-Host "  - 방화벽: 인바운드 TCP 3000 허용 규칙 추가"
Write-Host ""
Write-Host "※ 터미널/배치 창을 닫아도 서버는 백그라운드로 계속 동작합니다."
Write-Host "※ 부팅 직후 아무도 로그인하지 않으면 작업이 안 돌 수 있으니, 서버 PC에는 자동 로그온을 권장합니다."
Write-Host ""
Write-Host "지금 바로 테스트: 작업 스케줄러 > $taskName > 실행"
Write-Host "등록 해제: unregister-auto-start-share.bat"
exit 0
