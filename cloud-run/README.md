# RinGo Media Converter - Cloud Run 서비스

Firebase Storage에 업로드된 원본 파일을 ffprobe로 분석하고 ffmpeg로 변환합니다.

## 변환 정책

| 타입 | 입력 | 출력 | 옵션 |
|------|------|------|------|
| video | mp4, mov | mp4 (H264 + AAC) | `-movflags +faststart`, 최대 720p |
| audio | mp3, m4a, wav | m4a (AAC) | 128k |

## 파일 경로 구조

```
original/{userId}/{timestamp}_{filename}              ← 앱 업로드 원본 (변환 후 삭제)
processed/{userId}/{timestamp}_{basename}.mp4|m4a     ← 변환 결과물 (3일 보관)
```

---

## 배포 전 필수 준비

### 1. GitHub Secrets 등록 (Settings → Secrets and variables → Actions)

| Secret 이름 | 값 | 설명 |
|-------------|-----|------|
| `GCP_SERVICE_ACCOUNT_JSON` | GCP 서비스 계정 JSON 전체 | Cloud Run 배포용 |
| `WORKER_BASE_URL` | `https://ringo-server.pages.dev` | Cloudflare Worker URL |
| `CLOUD_RUN_SECRET` | 랜덤 32자 문자열 | Cloud Run ↔ Worker 공유 시크릿 |
| `GCS_BUCKET` | `{project-id}.firebasestorage.app` | Firebase Storage 버킷명 |

> **CLOUD_RUN_SECRET 생성 예시**
> ```bash
> openssl rand -hex 32
> ```

### 2. GCP 서비스 계정 권한

`GCP_SERVICE_ACCOUNT_JSON`의 서비스 계정에 아래 역할 필요:
- `roles/run.admin` — Cloud Run 배포
- `roles/artifactregistry.admin` — Docker 이미지 저장소
- `roles/iam.serviceAccountUser` — 서비스 계정 사용
- `roles/eventarc.admin` — Eventarc 트리거 생성
- `roles/storage.admin` — Firebase Storage 접근

### 3. Cloudflare Worker에 CLOUD_RUN_SECRET 추가

Cloudflare Dashboard → Workers & Pages → ringo-server → Settings → Variables:
```
CLOUD_RUN_SECRET = (위에서 생성한 랜덤값, GitHub Secret과 동일)
```

또는 wrangler CLI:
```bash
npx wrangler pages secret put CLOUD_RUN_SECRET --project-name ringo-server
```

---

## 배포 방법 (GitHub Actions — 추천)

### Step 1: D1 DB 마이그레이션
1. GitHub → Actions → **D1 Migration** 워크플로우 선택
2. `Run workflow` 클릭
3. `migration_file`: `migrations/0015_uploaded_files.sql` (기본값 그대로)
4. `Run workflow` 실행

### Step 2: Cloud Run 배포 + Eventarc 설정
1. GitHub → Actions → **Deploy Cloud Run** 워크플로우 선택
2. `Run workflow` 클릭
3. `region`: `asia-northeast3` (서울) 또는 원하는 리전
4. `Run workflow` 실행
5. 완료 시 Cloud Run URL과 Eventarc 트리거가 자동 생성됨

---

## 수동 배포 방법 (로컬 gcloud CLI)

### 1. 이미지 빌드 & 푸시

```bash
PROJECT_ID=your-gcp-project-id
REGION=asia-northeast3
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/ringo-media-converter/converter:latest"

# Artifact Registry 저장소 생성 (최초 1회)
gcloud artifacts repositories create ringo-media-converter \
  --repository-format=docker \
  --location=${REGION} \
  --project=${PROJECT_ID}

# Docker 인증
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# 빌드 & 푸시
docker build -t ${IMAGE} ./cloud-run
docker push ${IMAGE}
```

### 2. Cloud Run 배포

```bash
WORKER_BASE_URL=https://ringo-server.pages.dev
CLOUD_RUN_SECRET=your-secret-here
GCS_BUCKET=${PROJECT_ID}.firebasestorage.app

gcloud run deploy ringo-media-converter \
  --image=${IMAGE} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=120 \
  --concurrency=10 \
  --set-env-vars="WORKER_BASE_URL=${WORKER_BASE_URL},CLOUD_RUN_SECRET=${CLOUD_RUN_SECRET},GCS_BUCKET=${GCS_BUCKET}"
```

### 3. Eventarc 트리거 설정

```bash
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

# Storage → Eventarc pubsub 권한 부여
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Eventarc 트리거 생성
gcloud eventarc triggers create ringo-storage-trigger \
  --location=${REGION} \
  --project=${PROJECT_ID} \
  --destination-run-service=ringo-media-converter \
  --destination-run-region=${REGION} \
  --destination-run-path=/convert \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=${GCS_BUCKET}" \
  --service-account="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

---

## 환경 변수 전체 목록

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| `WORKER_BASE_URL` | ✅ | Cloudflare Worker URL | `https://ringo-server.pages.dev` |
| `CLOUD_RUN_SECRET` | ✅ | 내부 API 시크릿 (Worker와 동일) | `랜덤 32자` |
| `GCS_BUCKET` | ✅ | Firebase Storage 버킷명 | `my-project.firebasestorage.app` |
| `PORT` | - | 서버 포트 (기본: 8080) | `8080` |

---

## 처리 흐름

```
앱 → POST /api/uploads/prepare    → Signed URL + file_id 반환
앱 → Firebase Storage PUT          → 원본 파일 업로드 (original/)
앱 → POST /api/uploads/complete    → DB status = processing
     ↓ Eventarc 자동 트리거
Cloud Run /convert 수신
  → original/ 경로 파싱
  → GET /api/uploads/lookup         → file_id 조회
  → ffprobe 분석 (codec, duration, resolution)
  → duration > 30s 또는 오류 → PATCH status=failed
  → ffmpeg 변환 (video→mp4 H264+AAC+faststart / audio→m4a AAC)
  → processed/ 저장
  → original/ 삭제
  → PATCH /api/uploads/:id/status   → status=ready, processed_url 저장
앱 → GET /api/uploads/:id 폴링     → status=ready → processed_url 획득
알람 저장 → POST /api/alarms        → msg_value = processed_url
```
