# 관리자 권한: 자동 시작 예약 작업·방화벽 규칙 제거
#Requires -RunAsAdministrator
$ErrorActionPreference = 'SilentlyContinue'

$taskName = 'WorkLogWebServerShare'
$fwName = 'WorkLog Web TCP 3000'

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Remove-NetFirewallRule -DisplayName $fwName

Write-Host "제거 완료(작업·규칙이 없었으면 무시됨): $taskName / $fwName"
exit 0
