# PushNotify - 폐쇄형 채널 구독 앱

초대 링크로만 참여 가능한 폐쇄형 채널에서 푸시 알림을 받는 Flutter Android 앱입니다.

---

## 📱 앱 기능

| 화면 | 기능 |
|------|------|
| 홈 | 내 구독 채널 목록, 초대 링크 입력 |
| 채널 | 구독 중인 채널 목록 및 상세 콘텐츠 |
| 알림 | 받은 알림 목록, 수락/거절 |
| 설정 | 기기 ID, FCM 토큰 확인, 초기화 |

---

## 🔨 로컬 빌드 방법

### 사전 요구사항
- Flutter SDK 3.x 이상
- Android Studio 또는 Android SDK
- Java 17

### 빌드 명령어

```bash
# 1. 압축 해제 후 폴더 이동
cd push_notify_app

# 2. 패키지 설치
flutter pub get

# 3. APK 빌드 (debug - 빠름)
flutter build apk --debug

# 4. APK 위치
# build/app/outputs/flutter-apk/app-debug.apk

# [선택] arm64 전용 (파일 크기 절반)
flutter build apk --debug --target-platform android-arm64
```

### 디바이스 설치
```bash
# 연결된 기기에 바로 설치
flutter install

# 또는 ADB로 설치
adb install build/app/outputs/flutter-apk/app-debug.apk
```

---

## ⚙️ API 서버 URL 설정

`lib/services/api_service.dart` 파일에서 `_baseUrl`을 변경합니다:

```dart
// 현재 (샌드박스 테스트용)
static const String _baseUrl = 'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai';

// Cloudflare Pages 배포 후
static const String _baseUrl = 'https://your-project.pages.dev';

// 로컬 PC에서 테스트 시 (Android 에뮬레이터)
static const String _baseUrl = 'http://10.0.2.2:3000';
```

---

## 🔗 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/invites/verify/:token` | 초대 링크 검증 |
| POST | `/api/invites/join` | 채널 참여 |
| GET | `/api/subscribers?user_id=` | 내 구독 채널 |
| POST | `/api/subscribers/action` | 알림 수락/거절 |
| GET | `/api/contents?channel_id=` | 채널 콘텐츠 |

---

## 📂 프로젝트 구조

```
lib/
├── main.dart                    # 앱 진입점, 라우팅
├── services/
│   └── api_service.dart         # API 통신 (URL 설정 여기)
└── screens/
    ├── splash_screen.dart        # 스플래시
    ├── home_screen.dart          # 홈 (초대 링크 입력)
    ├── join_channel_screen.dart  # 채널 참여
    ├── my_channels_screen.dart   # 내 채널 목록
    ├── channel_detail_screen.dart # 채널 콘텐츠
    ├── notification_screen.dart  # 알림 내역
    └── settings_screen.dart      # 설정
```

---

## 🚀 GitHub Actions 자동 빌드

`.github/workflows/build.yml` 포함 - GitHub에 push하면 자동으로 APK가 생성됩니다.

1. GitHub 레포 생성 후 push
2. Actions 탭 → `Build APK` 실행 확인
3. Artifacts에서 `push-notify-debug-apk` 다운로드
