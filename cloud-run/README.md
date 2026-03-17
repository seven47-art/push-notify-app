# RinGo Media Converter - Cloud Run 서비스

Firebase Storage에 업로드된 원본 파일을 ffprobe로 분석하고 ffmpeg로 변환합니다.

## 변환 정책

| 타입 | 입력 | 출력 | 옵션 |
|------|------|------|------|
| video | mp4, mov | mp4 (H264 + AAC) | `-movflags +faststart`, 최대 720p |
| audio | mp3, m4a, wav | m4a (AAC) | 128k |

## 파일 경로 구조

```
original/{userId}/{timestamp}_{filename}   ← 앱 업로드 원본 (변환 후 삭제)
processed/{userId}/{timestamp}_{basename}.mp4|m4a  ← 변환 결과물
```

## 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `WORKER_BASE_URL` | Cloudflare Worker URL | `https://ringo-server.pages.dev` |
| `CLOUD_RUN_SECRET` | 내부 API 시크릿 (Worker와 공유) | `랜덤 문자열 32자` |
| `GCS_BUCKET` | Firebase Storage 버킷명 | `my-project.firebasestorage.app` |
| `PORT` | 서버 포트 (기본: 8080) | `8080` |

## 배포 방법

### 1. 이미지 빌드 & 푸시

```bash
PROJECT_ID=your-gcp-project-id
IMAGE=gcr.io/${PROJECT_ID}/ringo-media-converter

docker build -t ${IMAGE} .
docker push ${IMAGE}
```

### 2. Cloud Run 배포

```bash
gcloud run deploy ringo-media-converter \
  --image=${IMAGE} \
  --region=asia-northeast3 \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --set-env-vars="WORKER_BASE_URL=https://ringo-server.pages.dev,GCS_BUCKET=your-project.firebasestorage.app,CLOUD_RUN_SECRET=your-secret"
```

### 3. Eventarc 트리거 설정

```bash
gcloud eventarc triggers create ringo-storage-trigger \
  --location=asia-northeast3 \
  --destination-run-service=ringo-media-converter \
  --destination-run-region=asia-northeast3 \
  --destination-run-path=/convert \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=your-project.firebasestorage.app" \
  --service-account=your-service-account@your-project.iam.gserviceaccount.com
```

### 4. Cloudflare Worker 환경 변수 추가

Cloudflare Dashboard 또는 wrangler.toml에 추가:

```
CLOUD_RUN_SECRET = "your-secret"   # Cloud Run과 동일한 값
```

## 처리 흐름

```
앱 → POST /api/uploads/prepare   → Signed URL + file_id 반환
앱 → Firebase Storage PUT         → 원본 파일 업로드 (original/)
앱 → POST /api/uploads/complete   → status = processing
     ↓ Eventarc 자동 트리거
Cloud Run /convert 수신
  → ffprobe 분석 (codec, duration, resolution)
  → duration > 30s → failed 처리
  → ffmpeg 변환
  → processed/ 저장
  → original/ 삭제
  → PATCH /api/uploads/:id/status (ready or failed)
앱 → GET /api/uploads/:id 폴링  → status=ready → processed_url 획득
```
