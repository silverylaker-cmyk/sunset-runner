# SUNSET RUNNER

OutRun 스타일 의사 3D 레이싱 게임. 빌드 과정 없는 정적 웹앱(HTML + CSS + ES modules)입니다.

## 조작
| 입력 | 폰 | PC |
|---|---|---|
| 조향 | 폰을 핸들처럼 세워 잡고 좌우로 돌리기 (센서 없으면 화면 중앙 드래그) | ← → |
| 액셀 | 화면 오른쪽 위 모서리 사각형 터치 | ↑ 또는 Space |
| 브레이크 | 화면 왼쪽 위 모서리 사각형 터치 | ↓ |
| 시작/재시작 | 화면 탭 | Enter |

HUD 하단 버튼: **재보정**(현재 자세를 중립으로), **🔊**(음소거), **dbg**(센서 원시값 표시).

## 배포 (정적 호스팅)
기울기 센서는 **HTTPS**에서만 동작하므로 반드시 HTTPS 호스팅에 올리세요.

### GitHub Pages
```bash
git init && git add . && git commit -m "Sunset Runner"
gh repo create sunset-runner --public --source=. --push
# GitHub 저장소 Settings → Pages → Source: "Deploy from a branch", Branch: main / (root)
```
몇 분 후 `https://<계정>.github.io/sunset-runner/` 에서 접속.

### Vercel / Netlify
프레임워크 없음, 빌드 명령 없음, 출력 디렉터리는 저장소 루트로 설정하면 됩니다.
```bash
npx vercel --prod      # 또는 npx netlify deploy --prod --dir=.
```

## 로컬 테스트 (PC)
ES module 때문에 `file://`로는 열리지 않습니다. 아무 정적 서버나 사용:
```bash
python3 -m http.server 8080     # http://localhost:8080
```

## 폰에서 전체화면
- iOS Safari: 공유 → 홈 화면에 추가 → 홈 화면 아이콘으로 실행하면 주소창 없이 전체화면
- Android Chrome: 시작 탭 시 자동으로 전체화면 + 가로 고정 시도

## 규칙
- 시작 75초, 체크포인트마다 +50초, 6스테이지 완주 시 GOAL
- 점수 = 주행거리(m) + 남은 시간 × 100 (GOAL 시), 최고 기록은 브라우저에 저장

## 문제 해결
- **iOS에서 센서 권한 팝업이 안 뜸**: 한 번 거부하면 Safari가 다시 묻지 않습니다. 설정 → Safari → 고급 → 웹사이트 데이터에서 해당 사이트를 삭제한 뒤 다시 접속하세요. 또한 `http://`로 접속하면 센서가 아예 동작하지 않습니다.
- **조향 방향이 반대**: HUD의 **좌우반전** 버튼을 누르세요.
- **핸들 중립이 틀어짐**: 폰을 편한 자세로 잡은 상태에서 **재보정**을 누르세요. 출발 신호(GO!) 시점에도 자동 보정됩니다.
- **센서 값 확인**: **dbg** 버튼으로 중력 벡터·회전각·조향값을 볼 수 있습니다. 콘솔에서는 `window.__game`으로 게임 객체에 접근할 수 있습니다.
