# 여러 PC에서 접속할 때: 서버를 0.0.0.0에 바인딩 (LAN 공유)
# 한 대의 PC에서만 이 스크립트를 실행해 두고, 나머지는 브라우저로 http://서버IP:3000 접속
$root = $PSScriptRoot
Set-Location -LiteralPath $root

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'npm install 실행 중...'
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'npm install 실패. Enter를 눌러 종료...'
    Read-Host
    exit 1
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Node.js를 찾을 수 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 시도하세요.'
  Read-Host 'Enter를 눌러 종료'
  exit 1
}

$inner = 'pushd "' + $root.Replace('"', '""') + '" && set HOST=0.0.0.0 && node server.js || pause'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $inner

Start-Sleep -Seconds 5
Start-Process 'http://127.0.0.1:3000/'
Write-Host ''
Write-Host '[공유용] 서버가 모든 네트워크 인터페이스에서 수신합니다.'
Write-Host '  이 PC에서 접속: http://127.0.0.1:3000'
Write-Host '  다른 PC에서는:   http://(이 PC의 IP주소):3000  (예: http://192.168.45.86:3000)'
Write-Host '  크롬에서 위 주소를 즐겨찾기에 넣으면 매번 파일을 열 필요가 없습니다.'
Write-Host '서버 창(검은 창)을 닫으면 전 직원 접속이 끊깁니다.'
Write-Host ''
Write-Host '※ 터미널 없이 항상 켜 두려면(로그온 시 자동 실행): register-auto-start-share.bat 를 한 번 관리자로 실행하세요.'
