# 📡 Push Notification Admin Dashboard

## 프로젝트 개요
채널 기반 푸시 알림 관리 시스템 (Admin/Channel Owner용 웹 대시보드)

- **목표**: 오디오/비디오/유튜브 콘텐츠를 등록하고, Flutter 앱 구독자에게 FCM 푸시 알림을 발송하는 관리 시스템
- **아키텍처**: Admin Web → Hono API → D1 DB + FCM → Flutter App (구독자)

## 시스템 아키텍처

```
[Admin 웹 대시보드]
        ↓ 1) 콘텐츠 등록 (audio/video/youtube)
[Hono API 서버 (Cloudflare Workers)]
        ↓ 2) 구독자 조회 + 배치 생성
[D1 Database (notification_batches)]
        ↓ 3) FCM 배치 발송
[FCM / APNs]
        ↓ 4) 푸시 수신 (수락/거절)
[Flutter 앱 (구독자)]
        ↓ 5) 수락 이벤트 기록
[D1 Database (notification_logs)]
```

## 현재 구현된 기능

### ✅ 완료된 기능
1. **대시보드** - 채널/구독자/콘텐츠/발송 통계 카드, 일별 발송 차트, 수락률 도넛 차트
2. **채널 관리** - 채널 CRUD, 구독자 수/콘텐츠 수 표시
3. **콘텐츠 관리** - audio/video/youtube 등록, 등록 후 즉시 발송 옵션
4. **구독자 관리** - FCM 토큰 관리, 플랫폼별 필터, 수락/거절 이력
5. **알림 발송** - 채널별 구독자 전체 발송, 발송 이력 조회
6. **발송 로그** - 개별 발송 상태 (sent/accepted/rejected/failed) 추적
7. **FCM 발송** - 실제 FCM Server Key 설정 시 live 발송, 미설정 시 시뮬레이션 모드

## API 엔드포인트

### 채널 API
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/channels` | 채널 목록 (구독자 수, 콘텐츠 수 포함) |
| GET | `/api/channels/:id` | 채널 상세 |
| POST | `/api/channels` | 채널 생성 |
| PUT | `/api/channels/:id` | 채널 수정 |
| DELETE | `/api/channels/:id` | 채널 삭제 |

### 콘텐츠 API
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/contents?channel_id=X` | 콘텐츠 목록 |
| GET | `/api/contents/:id` | 콘텐츠 상세 |
| POST | `/api/contents` | 콘텐츠 등록 (audio/video/youtube) |
| PUT | `/api/contents/:id` | 콘텐츠 수정 |
| DELETE | `/api/contents/:id` | 콘텐츠 삭제 |

### 구독자 API (Flutter 앱 연동)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/subscribers?channel_id=X` | 구독자 목록 |
| POST | `/api/subscribers/register` | FCM 토큰 등록/갱신 (Flutter 앱) |
| PUT | `/api/subscribers/:id/token` | FCM 토큰 갱신 |
| DELETE | `/api/subscribers/:id` | 구독 취소 |
| POST | `/api/subscribers/action` | 수락/거절 이벤트 기록 (Flutter 앱) |

### 알림 API
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/notifications/batches` | 발송 배치 목록 |
| GET | `/api/notifications/batches/:id` | 배치 상세 + 개별 로그 |
| POST | `/api/notifications/send` | 푸시 알림 발송 |
| GET | `/api/notifications/stats` | 통계 (전체/채널별) |

## 데이터 모델

### 핵심 테이블
- **channels**: 채널 정보 (name, owner_id, is_active)
- **subscribers**: 구독자 + FCM 토큰 (channel_id, user_id, fcm_token, platform)
- **contents**: 콘텐츠 (channel_id, title, content_type, content_url)
- **notification_batches**: 발송 배치 (status, total_targets, sent_count, accepted_count)
- **notification_logs**: 개별 발송 로그 (batch_id, subscriber_id, status, action_at)

### 스토리지
- **Cloudflare D1** (SQLite): 모든 데이터 저장

## Flutter 앱 연동 가이드

### 1. FCM 토큰 등록
```dart
// 앱 시작 시 구독 등록
await http.post(
  Uri.parse('/api/subscribers/register'),
  body: jsonEncode({
    'channel_id': 1,
    'user_id': 'unique_user_id',
    'display_name': '홍길동',
    'fcm_token': await FirebaseMessaging.instance.getToken(),
    'platform': Platform.isIOS ? 'ios' : 'android',
  })
);
```

### 2. 수락/거절 이벤트 전송
```dart
// 푸시 알림 수락 시 (data payload에서 batch_id, subscriber_id 파싱)
await http.post(
  Uri.parse('/api/subscribers/action'),
  body: jsonEncode({
    'batch_id': batchId,
    'subscriber_id': subscriberId,
    'action': 'accepted', // or 'rejected'
  })
);
```

## FCM 설정 방법

### 로컬 개발 (.dev.vars)
```
FCM_SERVER_KEY=your-firebase-server-key
FCM_PROJECT_ID=your-firebase-project-id
ADMIN_SECRET=your-admin-secret
```

### Cloudflare Pages 배포 시
```bash
npx wrangler pages secret put FCM_SERVER_KEY --project-name webapp
```

> FCM_SERVER_KEY가 없으면 자동으로 **시뮬레이션 모드**로 동작 (90% 성공률 랜덤 시뮬레이션)

## 로컬 개발 실행

```bash
# 의존성 설치
npm install

# D1 마이그레이션 + 시드 데이터
npm run db:migrate:local
npm run db:seed

# 빌드 + 서버 실행
npm run build
pm2 start ecosystem.config.cjs

# 서버 확인
curl http://localhost:3000/api/health
```

## 배포

```bash
# Cloudflare D1 생성
npx wrangler d1 create webapp-production

# wrangler.jsonc의 database_id 업데이트 후
npm run db:migrate:prod
npm run deploy:prod
```

## 기술 스택
- **Backend**: Hono v4 + TypeScript
- **Runtime**: Cloudflare Workers / Pages
- **Database**: Cloudflare D1 (SQLite)
- **Build**: Vite + @hono/vite-build
- **Frontend**: TailwindCSS CDN + Chart.js + Axios (CDN)
- **Push**: FCM Legacy API (Server Key 방식)

## 미구현 / 추후 계획

- [ ] Flutter 앱 클라이언트 구현
- [ ] FCM v1 HTTP API (OAuth2) 전환
- [ ] 예약 발송 기능 (Cloud Tasks / Cron Triggers)
- [ ] 구독자 세그먼트 발송 (플랫폼별, 태그별)
- [ ] R2 Storage 연동 (오디오/비디오 파일 직접 업로드)
- [ ] 관리자 인증 (JWT 기반)
- [ ] 웹훅 연동 (발송 결과 외부 시스템 연동)
- [ ] 다국어 지원

---
**Last Updated**: 2026-03-01 | **Status**: ✅ 로컬 개발 환경 동작 중
