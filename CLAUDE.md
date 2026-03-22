# RinGo 프로젝트 - AI 작업 규칙

## 작업 전 주의사항

1. 대화 중 마음대로 먼저 작업하면 안 됨 (소스를 만지거나 빌드하는 작업)
2. 항상 무슨 작업이든 지금 잘 되고 있는 기능들에 영향을 주면 안 됨
3. 특별한 이야기 없으면 빌드는 깃허브에서 진행
4. 새로 빌드할 때마다 버전업해서 진행 (기존 버전이랑만 겹치지 않으면 됨)
5. 링고의 모든 페이지는 Flutter로 구현한다. (네이티브앱)

## 핵심 구조

### 라우팅
- `/native_main` → MainScreen (현재 사용 중인 네이티브 방식)
- `/main` → WebViewScreen (⚠️ 차단 예정, 아래 WebView 정리 작업 참고)

## 개발 규칙
- APK 빌드는 사용자가 명시적으로 요청할 때만 실행
- 코드 수정 후 git push만 수행 (빌드 X)
- 피드백 없는 코드는 임의로 재수정 금지
- 창작 금지 - 샘플 이미지가 있으면 그대로 복제
- 작업 전 반드시 확인/분석 먼저, 사용자 승인 후 작업
- 빌드는 몰아서 진행 (작업 완료 후 요청 시 push)
- 새 화면/기능 임의 창작 금지 → 반드시 웹뷰 기준으로 동일하게 구현

---

## 현재 진행 중인 작업: WebView 소스 정리

### 기준 태그
- `v3.7.91-웹뷰소스-차단전` — 정리 작업 시작 전 안전 복원 지점

### 작업 순서
1. **접근 차단** — 코드에서 진입 경로만 막음 (파일 삭제 X)
2. **빌드 & 테스트** — 앱/서버 정상 동작 확인
3. **최종 삭제** — 사용자 확인 후에만 실행

### 🔴 즉시 삭제 후보 (Flutter 앱 내부, 현재 미사용)

| # | 대상 | 위치 | 참조 여부 | 차단 방법 |
|---|------|------|-----------|-----------|
| 1 | `WebViewScreen` 클래스 전체 (~1,100줄) | `lib/main.dart` lines 234-1343 | `/main` 라우트에서만 참조, 실제 네비게이션 없음 | 주석처리 또는 빈 위젯 교체 |
| 2 | `import webview_flutter` | `lib/main.dart` line 10 | WebViewScreen 내부에서만 사용 | import 제거 |
| 3 | `webview_flutter: ^4.10.0` | `pubspec.yaml` line 35 | lib/main.dart에서만 import | 주석처리 |
| 4 | `const String _appUrl = kAppUrl` | `lib/main.dart` line 31 | WebViewScreen 내부(line 361)에서만 사용 | 제거 |
| 5 | `const String kAppUrl` | `lib/config.dart` line 7 | lib/main.dart line 31에서만 참조 | 주석처리 (kBaseUrl은 유지) |
| 6 | `webview_flutter` lock 엔트리 | `pubspec.lock` lines 728-755 | pubspec.yaml 제거 후 flutter pub get으로 자동 정리 | 자동 |

### 🟡 보류 후보 (서버에서 아직 연결 중, 삭제 확정 금지)

| # | 대상 | 위치 | 참조 여부 | 비고 |
|---|------|------|-----------|------|
| 1 | `appHtml.ts` | `src/appHtml.ts` (1,340줄) | `src/index.tsx` import, `/app` 라우트 | 서버에서 HTML 제공 중 |
| 2 | `mobile-app.js` | `public/static/mobile-app.js` (3,971줄) | `appHtml.ts` script 태그 | appHtml.ts 종속 |
| 3 | `/app` 라우트 | `src/index.tsx` line 1541 | 서버 엔드포인트 | 브라우저 접근 가능 여부 확인 후 결정 |
| 4 | `/static/mobile-app.js` 캐시 설정 | `src/index.tsx` lines 37-38 | `/app` 라우트 종속 | 함께 결정 |
| 5 | `style.css` | `public/static/style.css` (1줄) | 참조 없음 | 서버 static 정리 시 함께 결정 |
| 6 | `youtubehelp.html` | `public/static/youtubehelp.html` | 참조 없음 | 동일 |

### 🟢 삭제 금지 (공용 또는 다른 기능에서 사용 중)

| # | 대상 | 위치 | 사용처 |
|---|------|------|--------|
| 1 | `app.js` | `public/static/app.js` (2,687줄) | 어드민 페이지 전용 JS |
| 2 | `src/index.tsx` | 서버 메인 파일 | API + 어드민 + /app 전체 |
| 3 | `src/routes/*.ts` | 15개 API 라우트 | 네이티브 앱에서 직접 호출 |
| 4 | `ringo-logo.png`, `ringo-logo-dark.png`, `ringo-icon.png` | `public/static/` | 서버 HTML, 앱 fallback |
| 5 | `lib/config.dart` (kBaseUrl) | line 5-6 | 앱 전체에서 사용 |
| 6 | `lib/main.dart` lines 1-229 | 앱 초기화, 라우트 정의 | WebView 무관 |
| 7 | `lib/screens/*.dart` 전체 (21개) | 네이티브 UI 화면 | 활성 사용 중 |

### 진행 상태
- [x] WebView 진입 경로 파악 완료
- [x] 관련 파일 목록 작성 완료
- [x] 참조 여부 분석 완료
- [x] 삭제 후보 / 보류 후보 분류 완료
- [x] 태그 `v3.7.91-웹뷰소스-차단전` 생성 완료
- [ ] 즉시 삭제 후보 접근 차단 (Flutter)
- [ ] 보류 후보 접근 차단 (서버)
- [ ] 빌드 & 테스트
- [ ] 사용자 확인 후 최종 삭제

---

## 다크모드 작업 (대기)
- WebView: CSS 변수 `:root`(다크) / `[data-theme="light"]`(라이트) 존재, light 오버라이드 7개만 있음
- Flutter: `_isDark` 변수 있으나 하드코딩된 색상, 테마 동기화 없음
- 작업 범위: WebView light 오버라이드 추가, Flutter 조건부 색상, 테마 동기화
- **상태: 사용자 요청 시 진행**
