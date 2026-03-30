# 입주지원센터 업무일지

Node.js(Express) 기반 업무일지 웹앱입니다.

## PC에서 브라우저로 보기 (로컬)

1. 이 폴더에서 터미널을 엽니다.
2. `npm install`
3. `npm start`
4. 브라우저 주소창에 **http://localhost:3000** 입력  
   (같은 내부망의 다른 PC에서는 `http://이-컴퓨터의-IP:3000`)

## GitHub에 연결하기

1. [GitHub](https://github.com)에서 새 저장소(New repository)를 만듭니다. (비어 있는 저장소, README 추가하지 않음)
2. 아래를 **저장소 폴더에서** 실행합니다. (`YOUR_USER`, `YOUR_REPO` 를 본인 것으로 바꿉니다.)

```powershell
# 네트워크 드라이브에서 "dubious ownership" 오류가 나면 한 번만 실행
git config --global --add safe.directory "//192.168.45.86/입주지원센터/업무일지"

cd \\192.168.45.86\입주지원센터\업무일지
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

GitHub 로그인은 브라우저 또는 Personal Access Token을 사용합니다.

**업무 데이터(`data/` JSON)를 외부에 올리지 않으려면** GitHub 저장소를 **Private**으로 만드세요.

## 인터넷에서 브라우저로 보기 (선택)

이 앱은 서버(Express)가 있어야 하므로 **GitHub Pages만으로는 동작하지 않습니다.**  
저장소를 [Render](https://render.com) 등에 연결해 **Web Service**로 배포하면 공개 URL로 접속할 수 있습니다.

- Render: New → Web Service → GitHub 저장소 선택 → Build: `npm install`, Start: `npm start`
- 저장소 루트의 `render.yaml`을 참고할 수 있습니다.
- 무료 플랜은 디스크가 유지되지 않을 수 있어, 재시작 시 `data/` 내용이 초기화될 수 있습니다. 장기 보관은 Private GitHub + 로컬/백업을 권장합니다.
