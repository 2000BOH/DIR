# 업무일지 서버 실행 + 브라우저 (UNC/한글 경로)
# 서버는 새 cmd 창에서 실행되어 오류 메시지를 볼 수 있습니다.
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

# pushd로 UNC 경로에 들어간 뒤 node 실행. 창은 /k 로 유지되어 크래시 시에도 글자가 남습니다.
$inner = 'pushd "' + $root.Replace('"', '""') + '" && node server.js || pause'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $inner

Start-Sleep -Seconds 5
Start-Process 'http://127.0.0.1:3000/'
Write-Host '서버 창(검은 창)을 닫으면 사이트 연결이 끊깁니다.'
Write-Host '브라우저에 "연결할 수 없음"이면 서버 창에 빨간 오류가 있는지 확인하세요.'
Write-Host '여러 명이 같은 사무실 PC로 접속할 때는 start-web-share.bat 을 사용하세요.'
