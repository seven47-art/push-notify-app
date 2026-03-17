// src/routes/uploads.ts
// Firebase Storage 직접 업로드용 Signed URL 발급 + 파일 상태 관리 API
//
// 업로드 흐름:
//   앱 → POST /api/uploads/prepare  → Signed URL + file_id 반환
//   앱 → Firebase Storage 직접 PUT  → 업로드 완료
//   앱 → POST /api/uploads/complete → status = processing 으로 변경
//   Eventarc → Cloud Run 변환 처리 → PATCH /api/uploads/:id/status
//   앱 → GET  /api/uploads/:id      → status 폴링 (ready 될 때까지)

import { Hono } from 'hono'
import type { Bindings } from '../types'

const uploads = new Hono<{ Bindings: Bindings }>()

// =============================================
// Firebase Storage OAuth2 액세스 토큰 획득
// =============================================
async function getStorageAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   exp,
  }

  const encodeBase64Url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const headerEncoded  = encodeBase64Url(header)
  const payloadEncoded = encodeBase64Url(payload)
  const signingInput   = `${headerEncoded}.${payloadEncoded}`

  const privateKeyPem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const privateKeyDer = Uint8Array.from(atob(privateKeyPem), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', privateKeyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const encoder   = new TextEncoder()
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput))
  const signatureEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${signingInput}.${signatureEncoded}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const tokenData: any = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Storage 액세스 토큰 획득 실패: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// =============================================
// Firebase Storage 파일 삭제 (export — alarms.ts 등에서 사용)
// =============================================
export async function deleteFromFirebaseStorage(
  serviceAccountJson: string,
  bucket: string,
  filePath: string
): Promise<void> {
  try {
    const accessToken  = await getStorageAccessToken(serviceAccountJson)
    const encodedPath  = encodeURIComponent(filePath)
    const deleteUrl    = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}`
    await fetch(deleteUrl, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  } catch (e) {
    console.error('[Firebase Storage 삭제 실패]', e)
  }
}

// =============================================
// 세션 토큰 → user_id 검증 헬퍼
// =============================================
async function getUserIdFromSession(db: any, sessionToken: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT user_id FROM user_sessions WHERE session_token = ? AND expires_at > datetime('now')"
  ).bind(sessionToken).first() as { user_id: string } | null
  return row?.user_id ?? null
}

// =============================================
// 허용 확장자 / MIME 정의
// =============================================
const ALLOWED_VIDEO_EXTS  = ['mp4', 'mov']
const ALLOWED_AUDIO_EXTS  = ['mp3', 'm4a', 'wav']
const ALLOWED_EXTS        = [...ALLOWED_VIDEO_EXTS, ...ALLOWED_AUDIO_EXTS]

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_DURATION_SEC    = 30                  // 30 초

// =============================================
// POST /api/uploads/prepare
// 앱이 Firebase Storage 직접 업로드 전 호출
// 1) 파라미터 1차 검증 (확장자, 파일 크기)
// 2) DB에 uploaded_files 레코드 생성 (status=uploading)
// 3) Firebase Storage Resumable Upload URL 발급 후 반환
//
// Body: { session_token, file_name, file_size, file_type }
// Response: { success, file_id, upload_url, original_path, bucket }
// =============================================
uploads.post('/prepare', async (c) => {
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (!serviceAccountJson) {
      return c.json({ success: false, error: 'Firebase 서비스 계정 미설정' }, 500)
    }

    const body = await c.req.json() as {
      session_token: string
      file_name:     string
      file_size:     number
      file_type?:    string  // 앱이 직접 전달 (선택)
    }
    const { session_token, file_name, file_size } = body

    // 세션 검증
    if (!session_token) return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    const userId = await getUserIdFromSession(c.env.DB, session_token)
    if (!userId)    return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)

    // 확장자 검증
    const ext = (file_name || '').split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTS.includes(ext)) {
      return c.json({
        success: false,
        error: `허용되지 않는 파일 형식입니다. 허용: ${ALLOWED_EXTS.join(', ')}`,
      }, 400)
    }

    // 파일 크기 1차 검증
    if (file_size > MAX_FILE_SIZE_BYTES) {
      return c.json({
        success: false,
        error: `파일 크기 초과: 최대 10MB (현재 ${(file_size / 1024 / 1024).toFixed(1)}MB)`,
      }, 400)
    }

    // file_type 결정 (video / audio)
    const fileType: 'video' | 'audio' = ALLOWED_VIDEO_EXTS.includes(ext) ? 'video' : 'audio'

    // Storage 경로 생성
    const sa        = JSON.parse(serviceAccountJson)
    const projectId = sa.project_id || c.env.FCM_PROJECT_ID
    const bucket    = `${projectId}.firebasestorage.app`
    const timestamp = Date.now()
    const safeName  = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const originalPath = `original/${userId}/${timestamp}_${safeName}`

    // DB 레코드 생성 (status = uploading)
    const result = await c.env.DB.prepare(`
      INSERT INTO uploaded_files
        (user_id, file_type, original_ext, original_path, file_size, status)
      VALUES (?, ?, ?, ?, ?, 'uploading')
    `).bind(userId, fileType, ext, originalPath, file_size).run()

    const fileId = result.meta.last_row_id as number

    // Firebase Storage Resumable Upload URL 발급
    const accessToken  = await getStorageAccessToken(serviceAccountJson)
    const encodedPath  = encodeURIComponent(originalPath)
    const contentType  = EXT_TO_MIME[ext] || 'application/octet-stream'
    const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=resumable&name=${encodedPath}`

    const initRes = await fetch(initUrl, {
      method:  'POST',
      headers: {
        'Authorization':           `Bearer ${accessToken}`,
        'Content-Type':            'application/json',
        'X-Upload-Content-Type':   contentType,
        'X-Upload-Content-Length': String(file_size),
      },
      body: JSON.stringify({ contentType }),
    })

    if (!initRes.ok) {
      const errText = await initRes.text()
      throw new Error(`Resumable Upload 초기화 실패: ${initRes.status} ${errText}`)
    }

    const uploadUrl = initRes.headers.get('Location') || ''
    if (!uploadUrl) throw new Error('Resumable Upload URL 획득 실패')

    return c.json({
      success:       true,
      file_id:       fileId,
      upload_url:    uploadUrl,    // 앱이 이 URL로 직접 PUT 업로드
      original_path: originalPath,
      bucket:        bucket,
      content_type:  contentType,
    })
  } catch (e: any) {
    console.error('[uploads/prepare 오류]', e)
    return c.json({ success: false, error: e.message || '준비 실패' }, 500)
  }
})

// =============================================
// POST /api/uploads/complete
// 앱이 Firebase Storage 업로드 완료 후 호출
// DB status = uploading → processing 으로 변경
// (Eventarc → Cloud Run 변환이 자동으로 이어받음)
//
// Body: { session_token, file_id, original_url }
// Response: { success, file_id, status }
// =============================================
uploads.post('/complete', async (c) => {
  try {
    const body = await c.req.json() as {
      session_token: string
      file_id:       number
      original_url:  string
    }
    const { session_token, file_id, original_url } = body

    if (!session_token) return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    const userId = await getUserIdFromSession(c.env.DB, session_token)
    if (!userId)        return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)

    // 본인 파일인지 확인
    const fileRow: any = await c.env.DB.prepare(
      'SELECT id, status FROM uploaded_files WHERE id = ? AND user_id = ?'
    ).bind(file_id, userId).first()
    if (!fileRow) return c.json({ success: false, error: '파일을 찾을 수 없습니다' }, 404)
    if (fileRow.status !== 'uploading') {
      return c.json({ success: false, error: `이미 처리된 파일입니다 (status: ${fileRow.status})` }, 400)
    }

    // status = processing, original_url 저장
    await c.env.DB.prepare(`
      UPDATE uploaded_files
      SET status = 'processing', original_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(original_url || '', file_id, userId).run()

    return c.json({ success: true, file_id, status: 'processing' })
  } catch (e: any) {
    console.error('[uploads/complete 오류]', e)
    return c.json({ success: false, error: e.message || '처리 실패' }, 500)
  }
})

// =============================================
// GET /api/uploads/lookup
// Cloud Run이 original_path로 file_id 조회 (내부 API)
//
// Query: original_path
// Header: X-Internal-Secret
// =============================================
uploads.get('/lookup', async (c) => {
  try {
    const secret         = c.req.header('X-Internal-Secret') || ''
    const expectedSecret = c.env.CLOUD_RUN_SECRET   || ''
    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }

    const originalPath = c.req.query('original_path') || ''
    if (!originalPath) return c.json({ success: false, error: 'original_path 필수' }, 400)

    const row: any = await c.env.DB.prepare(
      'SELECT id FROM uploaded_files WHERE original_path = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(originalPath).first()

    if (!row) return c.json({ success: false, error: '파일을 찾을 수 없습니다' }, 404)

    return c.json({ success: true, file_id: row.id })
  } catch (e: any) {
    return c.json({ success: false, error: e.message || '조회 실패' }, 500)
  }
})

// =============================================
// GET /api/uploads/:id
// 앱이 변환 완료 여부를 폴링
//
// Query: session_token
// Response: { success, file_id, status, processed_url, duration_sec, error_message }
// =============================================
uploads.get('/:id', async (c) => {
  try {
    const fileId       = Number(c.req.param('id'))
    const sessionToken = c.req.query('session_token') || ''

    if (!sessionToken) return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    const userId = await getUserIdFromSession(c.env.DB, sessionToken)
    if (!userId)       return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)

    const row: any = await c.env.DB.prepare(`
      SELECT id, file_type, status, processed_url, duration_sec,
             video_codec, audio_codec, resolution, error_message, created_at
      FROM uploaded_files
      WHERE id = ? AND user_id = ?
    `).bind(fileId, userId).first()

    if (!row) return c.json({ success: false, error: '파일을 찾을 수 없습니다' }, 404)

    return c.json({
      success:       true,
      file_id:       row.id,
      file_type:     row.file_type,
      status:        row.status,
      processed_url: row.processed_url || null,  // ready 상태일 때만 값 존재
      duration_sec:  row.duration_sec  || null,
      video_codec:   row.video_codec   || null,
      audio_codec:   row.audio_codec   || null,
      resolution:    row.resolution    || null,
      error_message: row.error_message || null,
      created_at:    row.created_at,
    })
  } catch (e: any) {
    console.error('[uploads/:id 오류]', e)
    return c.json({ success: false, error: e.message || '조회 실패' }, 500)
  }
})

// =============================================
// PATCH /api/uploads/:id/status
// Cloud Run이 변환 완료 후 호출 (내부 API)
// Cloud Run → 이 엔드포인트로 결과 기록
//
// Header: X-Internal-Secret (Cloud Run 공유 시크릿)
// Body: {
//   status,           -- 'ready' | 'failed'
//   processed_path,   -- Storage 변환 파일 경로
//   processed_url,    -- 변환 파일 다운로드 URL
//   duration_sec,
//   video_codec,
//   audio_codec,
//   resolution,
//   error_message
// }
// =============================================
uploads.patch('/:id/status', async (c) => {
  try {
    // 내부 시크릿 검증 (Cloud Run만 호출 가능)
    const secret         = c.req.header('X-Internal-Secret') || ''
    const expectedSecret = c.env.CLOUD_RUN_SECRET   || ''
    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }

    const fileId = Number(c.req.param('id'))
    const body   = await c.req.json() as {
      status:         'ready' | 'failed'
      processed_path?: string
      processed_url?:  string
      duration_sec?:   number
      video_codec?:    string
      audio_codec?:    string
      resolution?:     string
      error_message?:  string
    }

    const { status, processed_path, processed_url,
            duration_sec, video_codec, audio_codec,
            resolution, error_message } = body

    if (!['ready', 'failed'].includes(status)) {
      return c.json({ success: false, error: 'status는 ready 또는 failed만 허용' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE uploaded_files SET
        status         = ?,
        processed_path = COALESCE(?, processed_path),
        processed_url  = COALESCE(?, processed_url),
        duration_sec   = COALESCE(?, duration_sec),
        video_codec    = COALESCE(?, video_codec),
        audio_codec    = COALESCE(?, audio_codec),
        resolution     = COALESCE(?, resolution),
        error_message  = COALESCE(?, error_message),
        updated_at     = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      status,
      processed_path || null,
      processed_url  || null,
      duration_sec   ?? null,
      video_codec    || null,
      audio_codec    || null,
      resolution     || null,
      error_message  || null,
      fileId
    ).run()

    return c.json({ success: true, file_id: fileId, status })
  } catch (e: any) {
    console.error('[uploads/:id/status 오류]', e)
    return c.json({ success: false, error: e.message || '상태 업데이트 실패' }, 500)
  }
})

// =============================================
// POST /api/uploads/alarm-file
// Flutter main.dart의 _uploadToWorker가 호출하는 엔드포인트
// multipart/form-data로 파일을 받아 Firebase Storage에 업로드 후 URL 반환
//
// FormData: session_token (field), file (file)
// Response: { success, url }
// =============================================
uploads.post('/alarm-file', async (c) => {
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (!serviceAccountJson) {
      return c.json({ success: false, error: 'Firebase 서비스 계정 미설정' }, 500)
    }

    const formData = await c.req.formData()
    const sessionToken = formData.get('session_token') as string || ''
    const file = formData.get('file') as File | null

    // 세션 검증
    if (!sessionToken) return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    const userId = await getUserIdFromSession(c.env.DB, sessionToken)
    if (!userId) return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)

    if (!file) return c.json({ success: false, error: '파일 없음' }, 400)

    // 확장자 검증
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTS.includes(ext)) {
      return c.json({
        success: false,
        error: `허용되지 않는 파일 형식입니다. 허용: ${ALLOWED_EXTS.join(', ')}`,
      }, 400)
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ success: false, error: `파일 크기가 10MB를 초과합니다` }, 400)
    }

    // Firebase Storage 경로 설정
    const sa = JSON.parse(serviceAccountJson)
    const bucket = `${sa.project_id || c.env.FCM_PROJECT_ID}.firebasestorage.app`
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `alarm-files/${userId}/${Date.now()}_${sanitizedName}`
    const encodedPath = encodeURIComponent(storagePath)

    // Firebase Storage에 직접 업로드
    const accessToken = await getStorageAccessToken(serviceAccountJson)
    const fileBytes = await file.arrayBuffer()
    const contentType = EXT_TO_MIME[ext] || file.type || 'application/octet-stream'

    const uploadRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': contentType,
          'Content-Length': String(fileBytes.byteLength),
        },
        body: fileBytes,
      }
    )

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[alarm-file 업로드 실패]', uploadRes.status, errText)
      return c.json({ success: false, error: `Storage 업로드 실패: ${uploadRes.status}` }, 500)
    }

    // 다운로드 URL 구성
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`

    console.log(`[alarm-file] 업로드 완료: userId=${userId} path=${storagePath}`)
    return c.json({ success: true, url: downloadUrl })
  } catch (e: any) {
    console.error('[uploads/alarm-file 오류]', e)
    return c.json({ success: false, error: e.message || '업로드 실패' }, 500)
  }
})

// =============================================
// DELETE /api/uploads/:id
// 파일 레코드 + Storage 원본/변환 파일 삭제
// =============================================
uploads.delete('/:id', async (c) => {
  try {
    const fileId       = Number(c.req.param('id'))
    const sessionToken = c.req.query('session_token') || ''

    if (!sessionToken) return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    const userId = await getUserIdFromSession(c.env.DB, sessionToken)
    if (!userId)       return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)

    const row: any = await c.env.DB.prepare(
      'SELECT original_path, processed_path FROM uploaded_files WHERE id = ? AND user_id = ?'
    ).bind(fileId, userId).first()
    if (!row) return c.json({ success: false, error: '파일을 찾을 수 없습니다' }, 404)

    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (serviceAccountJson) {
      const sa      = JSON.parse(serviceAccountJson)
      const bucket  = `${sa.project_id || c.env.FCM_PROJECT_ID}.firebasestorage.app`
      if (row.original_path)  await deleteFromFirebaseStorage(serviceAccountJson, bucket, row.original_path)
      if (row.processed_path) await deleteFromFirebaseStorage(serviceAccountJson, bucket, row.processed_path)
    }

    await c.env.DB.prepare('DELETE FROM uploaded_files WHERE id = ? AND user_id = ?')
      .bind(fileId, userId).run()

    return c.json({ success: true })
  } catch (e: any) {
    console.error('[uploads/:id DELETE 오류]', e)
    return c.json({ success: false, error: e.message || '삭제 실패' }, 500)
  }
})

export default uploads
