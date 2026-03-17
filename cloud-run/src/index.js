// cloud-run/src/index.js
// RinGo 미디어 변환 Cloud Run 서비스
//
// 흐름:
//   Firebase Storage(original/) 업로드
//   → Eventarc CloudEvent 수신
//   → ffprobe 분석 (codec, duration, resolution)
//   → 30초 초과 / 파일이상 → failed 처리
//   → ffmpeg 변환 (video→mp4 H264+AAC+faststart / audio→m4a AAC)
//   → Storage(processed/) 저장
//   → 원본(original/) 삭제
//   → Cloudflare Worker API PATCH /api/uploads/:id/status 호출

'use strict'

const express     = require('express')
const { Storage } = require('@google-cloud/storage')
const { execFile } = require('child_process')
const fs          = require('fs')
const path        = require('path')
const os          = require('os')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)
const app           = express()
app.use(express.json({ limit: '10mb' }))

// ── 환경 변수 ──────────────────────────────────────────────────
const PORT               = process.env.PORT               || 8080
const WORKER_BASE_URL    = process.env.WORKER_BASE_URL    || ''   // ex) https://ringo-server.pages.dev
const CLOUD_RUN_SECRET   = process.env.CLOUD_RUN_SECRET   || ''   // Cloudflare Worker와 공유 시크릿
const GCS_BUCKET         = process.env.GCS_BUCKET         || ''   // ex) my-project.firebasestorage.app

// ── 정책 상수 ──────────────────────────────────────────────────
const MAX_DURATION_SEC   = 30       // 최대 재생 길이
const MAX_VIDEO_HEIGHT   = 720      // 최대 해상도 (720p)
const ALLOWED_VIDEO_EXTS = ['mp4', 'mov']
const ALLOWED_AUDIO_EXTS = ['mp3', 'm4a', 'wav']

const storage = new Storage()

// ──────────────────────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'ringo-media-converter' }))

// ──────────────────────────────────────────────────────────────
// Eventarc CloudEvent 수신 엔드포인트
// POST /convert
// ──────────────────────────────────────────────────────────────
app.post('/convert', async (req, res) => {
  // 즉시 200 응답 (Eventarc 재시도 방지)
  res.status(200).json({ received: true })

  try {
    // CloudEvent 데이터 파싱
    const eventData = req.body?.data || req.body
    const bucketName = eventData?.bucket || GCS_BUCKET
    const filePath   = eventData?.name   || ''

    console.log(`[convert] 수신: bucket=${bucketName} path=${filePath}`)

    // original/ 경로만 처리 (processed/ 는 무시 — 무한루프 방지)
    if (!filePath.startsWith('original/')) {
      console.log('[convert] original/ 아님, 스킵')
      return
    }

    // 확장자 확인
    const ext      = filePath.split('.').pop()?.toLowerCase() ?? ''
    const isVideo  = ALLOWED_VIDEO_EXTS.includes(ext)
    const isAudio  = ALLOWED_AUDIO_EXTS.includes(ext)
    if (!isVideo && !isAudio) {
      console.log(`[convert] 허용되지 않는 확장자: ${ext}, 스킵`)
      return
    }

    // 파일 경로에서 file_id 추출
    // 경로 형식: original/{userId}/{timestamp}_{filename}
    // DB file_id는 PATCH 시 경로로 찾아야 함 → Worker API로 경로 기반 조회
    const fileId = await lookupFileIdByPath(filePath)
    if (!fileId) {
      console.error(`[convert] file_id 조회 실패: ${filePath}`)
      return
    }

    // 임시 작업 디렉토리
    const tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'ringo-'))
    const inputFile  = path.join(tmpDir, `input.${ext}`)
    const outputExt  = isVideo ? 'mp4' : 'm4a'
    const outputFile = path.join(tmpDir, `output.${outputExt}`)

    try {
      // ── 1) Storage에서 원본 파일 다운로드 ──────────────────────
      console.log(`[convert] 다운로드 시작: gs://${bucketName}/${filePath}`)
      await storage.bucket(bucketName).file(filePath).download({ destination: inputFile })
      console.log(`[convert] 다운로드 완료: ${inputFile}`)

      // ── 2) ffprobe 분석 ─────────────────────────────────────────
      const probeResult = await ffprobeAnalyze(inputFile)
      console.log(`[convert] ffprobe 결과:`, probeResult)

      // duration 30초 초과 검사
      if (probeResult.duration > MAX_DURATION_SEC) {
        console.warn(`[convert] duration 초과: ${probeResult.duration}s > ${MAX_DURATION_SEC}s`)
        await reportStatus(fileId, {
          status:        'failed',
          error_message: `재생 길이가 ${MAX_DURATION_SEC}초를 초과합니다 (${Math.round(probeResult.duration)}초)`,
          duration_sec:  probeResult.duration,
          video_codec:   probeResult.videoCodec,
          audio_codec:   probeResult.audioCodec,
          resolution:    probeResult.resolution,
        })
        return
      }

      // ── 3) ffmpeg 변환 ───────────────────────────────────────────
      if (isVideo) {
        await convertVideo(inputFile, outputFile, probeResult)
      } else {
        await convertAudio(inputFile, outputFile)
      }
      console.log(`[convert] ffmpeg 변환 완료: ${outputFile}`)

      // ── 4) processed/ 경로로 Storage 업로드 ────────────────────
      const pathParts     = filePath.replace('original/', '').split('/')  // [userId, timestamp_filename]
      const userId        = pathParts[0]
      const originalName  = pathParts.slice(1).join('/')
      const baseName      = originalName.replace(/\.[^/.]+$/, '')          // 확장자 제거
      const processedPath = `processed/${userId}/${baseName}.${outputExt}`
      const contentType   = isVideo ? 'video/mp4' : 'audio/mp4'

      console.log(`[convert] 업로드 시작: gs://${bucketName}/${processedPath}`)
      await storage.bucket(bucketName).upload(outputFile, {
        destination: processedPath,
        metadata:    { contentType },
      })

      // 공개 다운로드 URL 생성
      const encodedPath  = encodeURIComponent(processedPath)
      const processedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`
      console.log(`[convert] 업로드 완료: ${processedUrl}`)

      // ── 5) 원본 파일 삭제 ────────────────────────────────────────
      try {
        await storage.bucket(bucketName).file(filePath).delete()
        console.log(`[convert] 원본 삭제 완료: ${filePath}`)
      } catch (delErr) {
        console.warn(`[convert] 원본 삭제 실패 (무시):`, delErr.message)
      }

      // ── 6) Worker API에 결과 보고 (status = ready) ──────────────
      await reportStatus(fileId, {
        status:         'ready',
        processed_path: processedPath,
        processed_url:  processedUrl,
        duration_sec:   probeResult.duration,
        video_codec:    probeResult.videoCodec,
        audio_codec:    probeResult.audioCodec,
        resolution:     probeResult.resolution,
      })

      console.log(`[convert] 완료: file_id=${fileId}`)

    } finally {
      // 임시 파일 정리
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
    }

  } catch (err) {
    console.error('[convert] 처리 오류:', err)
  }
})

// ──────────────────────────────────────────────────────────────
// ffprobe 분석
// ──────────────────────────────────────────────────────────────
async function ffprobeAnalyze(inputFile) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',             'quiet',
    '-print_format',  'json',
    '-show_streams',
    '-show_format',
    inputFile,
  ])

  const data       = JSON.parse(stdout)
  const streams    = data.streams || []
  const format     = data.format  || {}

  const videoStream = streams.find(s => s.codec_type === 'video')
  const audioStream = streams.find(s => s.codec_type === 'audio')

  const duration   = parseFloat(format.duration || videoStream?.duration || audioStream?.duration || '0')
  const videoCodec = videoStream?.codec_name || null
  const audioCodec = audioStream?.codec_name || null
  const width      = videoStream?.width      || 0
  const height     = videoStream?.height     || 0
  const resolution = (width && height) ? `${width}x${height}` : null

  return { duration, videoCodec, audioCodec, resolution, width, height }
}

// ──────────────────────────────────────────────────────────────
// ffmpeg 영상 변환 (mp4, H264 + AAC, faststart, max 720p)
// ──────────────────────────────────────────────────────────────
async function convertVideo(inputFile, outputFile, probeResult) {
  const { height } = probeResult

  // 해상도 필터: 720p 초과 시 축소 (짝수 픽셀 보장)
  const scaleFilter = height > MAX_VIDEO_HEIGHT
    ? `scale=-2:${MAX_VIDEO_HEIGHT}`   // 가로는 비율 유지, 세로 720
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'  // 짝수 보정만

  const args = [
    '-i',          inputFile,
    '-vf',         scaleFilter,
    '-c:v',        'libx264',        // H.264
    '-preset',     'fast',
    '-crf',        '23',             // 품질 (낮을수록 고품질, 18~28 권장)
    '-c:a',        'aac',            // AAC
    '-b:a',        '128k',
    '-movflags',   '+faststart',     // 스트리밍 최적화 (정책 필수 옵션)
    '-y',                            // 덮어쓰기
    outputFile,
  ]

  console.log(`[ffmpeg-video] 변환 시작: ${args.join(' ')}`)
  const { stdout, stderr } = await execFileAsync('ffmpeg', args)
  if (stderr) console.log(`[ffmpeg-video] stderr:`, stderr)
}

// ──────────────────────────────────────────────────────────────
// ffmpeg 오디오 변환 (m4a, AAC)
// ──────────────────────────────────────────────────────────────
async function convertAudio(inputFile, outputFile) {
  const args = [
    '-i',    inputFile,
    '-c:a',  'aac',         // AAC
    '-b:a',  '128k',
    '-vn',                  // 비디오 스트림 제거
    '-y',
    outputFile,
  ]

  console.log(`[ffmpeg-audio] 변환 시작: ${args.join(' ')}`)
  const { stdout, stderr } = await execFileAsync('ffmpeg', args)
  if (stderr) console.log(`[ffmpeg-audio] stderr:`, stderr)
}

// ──────────────────────────────────────────────────────────────
// Storage 경로로 file_id 조회 (Worker API)
// ──────────────────────────────────────────────────────────────
async function lookupFileIdByPath(originalPath) {
  if (!WORKER_BASE_URL || !CLOUD_RUN_SECRET) {
    console.error('[lookupFileIdByPath] WORKER_BASE_URL 또는 CLOUD_RUN_SECRET 미설정')
    return null
  }
  try {
    const url = `${WORKER_BASE_URL}/api/uploads/lookup?original_path=${encodeURIComponent(originalPath)}`
    const res = await fetch(url, {
      headers: { 'X-Internal-Secret': CLOUD_RUN_SECRET },
    })
    if (!res.ok) {
      console.error(`[lookupFileIdByPath] API 오류: ${res.status}`)
      return null
    }
    const data = await res.json()
    return data?.file_id ?? null
  } catch (err) {
    console.error('[lookupFileIdByPath] 오류:', err.message)
    return null
  }
}

// ──────────────────────────────────────────────────────────────
// Worker API에 변환 결과 보고 (PATCH /api/uploads/:id/status)
// ──────────────────────────────────────────────────────────────
async function reportStatus(fileId, payload) {
  if (!WORKER_BASE_URL || !CLOUD_RUN_SECRET) {
    console.error('[reportStatus] WORKER_BASE_URL 또는 CLOUD_RUN_SECRET 미설정')
    return
  }
  try {
    const url = `${WORKER_BASE_URL}/api/uploads/${fileId}/status`
    const res = await fetch(url, {
      method:  'PATCH',
      headers: {
        'Content-Type':      'application/json',
        'X-Internal-Secret': CLOUD_RUN_SECRET,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[reportStatus] API 오류: ${res.status} ${text}`)
    } else {
      console.log(`[reportStatus] 완료: file_id=${fileId} status=${payload.status}`)
    }
  } catch (err) {
    console.error('[reportStatus] 오류:', err.message)
  }
}

// ──────────────────────────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[ringo-media-converter] 포트 ${PORT} 시작`)
  console.log(`  WORKER_BASE_URL : ${WORKER_BASE_URL || '(미설정)'}`)
  console.log(`  GCS_BUCKET      : ${GCS_BUCKET      || '(미설정)'}`)
})
