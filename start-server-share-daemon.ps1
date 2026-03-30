# 예약 작업에서 호출: LAN 공유용(HOST=0.0.0.0)으로 서버만 기동(콘솔 창 없음).
# 이미 3000번 포트가 열려 있으면 중복 기동하지 않습니다.
$root = $PSScriptRoot
Set-Location -LiteralPath $root

$env:HOST = '0.0.0.0'

$inUse = $false
try {
  $null = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop
  $inUse = $true
} catch { }

if ($inUse) { exit 0 }

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  npm install --omit=dev 2>&1 | Out-Null
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { exit 1 }

& node server.js
