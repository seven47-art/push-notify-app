// src/routes/uploads.ts
// Firebase Storage를 이용한 알람 파일 업로드 API
import { Hono } from 'hono'
import type { Bindings } from '../types'

const uploads = new Hono<{ Bindings: Bindings }>()

// =============================================
// Firebase Storage OAuth2 액세스 토큰 획득
// FCM과 동일한 서비스 계정 JSON 재사용
// =============================================
async function getStorageAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
  }

  const encodeBase64Url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const headerEncoded = encodeBase64Url(header)
  const payloadEncoded = encodeBase64Url(payload)
  const signingInput = `${headerEncoded}.${payloadEncoded}`

  // 개인키 파싱 및 서명
  const privateKeyPem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const privateKeyDer = Uint8Array.from(atob(privateKeyPem), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signingInput))
  const signatureEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const jwt = `${signingInput}.${signatureEncoded}`

  // OAuth2 토큰 요청
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenData: any = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Storage 액세스 토큰 획득 실패: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// =============================================
// Firebase Storage에 파일 업로드
// =============================================
async function uploadToFirebaseStorage(
  accessToken: string,
  bucket: string,
  filePath: string,
  fileData: ArrayBuffer,
  contentType: string
): Promise<string> {
  // Firebase Storage REST API (JSON API v1)
  const encodedPath = encodeURIComponent(filePath)
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: fileData,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Firebase Storage 업로드 실패: ${res.status} ${errText}`)
  }

  const obj: any = await res.json()
  // 공개 다운로드 URL 생성
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`
  return downloadUrl
}

// =============================================
// Firebase Storage에서 파일 삭제
// =============================================
export async function deleteFromFirebaseStorage(
  serviceAccountJson: string,
  bucket: string,
  filePath: string
): Promise<void> {
  try {
    const accessToken = await getStorageAccessToken(serviceAccountJson)
    const encodedPath = encodeURIComponent(filePath)
    const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}`
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
  } catch (e) {
    console.error('[Firebase Storage 삭제 실패]', e)
    // 삭제 실패는 무시 (알람 삭제는 계속 진행)
  }
}

// =============================================
// POST /api/uploads/alarm-file
// 알람 파일 업로드 (Firebase Storage)
// Body: multipart/form-data { file, session_token }
// Response: { success, url, fileName }
// =============================================
uploads.post('/alarm-file', async (c) => {
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (!serviceAccountJson) {
      return c.json({ success: false, error: 'Firebase 서비스 계정 미설정' }, 500)
    }

    // 서비스 계정에서 bucket 이름 추출
    const sa = JSON.parse(serviceAccountJson)
    const projectId = sa.project_id || c.env.FCM_PROJECT_ID
    // Firebase Storage 기본 버킷: {projectId}.firebasestorage.app
    const bucket = `${projectId}.firebasestorage.app`

    // multipart 파싱
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const sessionToken = formData.get('session_token') as string | null

    if (!file) {
      return c.json({ success: false, error: 'file 필드 필수' }, 400)
    }

    // 세션 검증
    if (!sessionToken) {
      return c.json({ success: false, error: '인증 토큰 필수' }, 401)
    }
    const sessionRow = await c.env.DB.prepare(
      "SELECT user_id FROM user_sessions WHERE session_token = ? AND expires_at > datetime('now')"
    ).bind(sessionToken).first() as { user_id: string } | null
    if (!sessionRow) {
      return c.json({ success: false, error: '세션 만료 또는 유효하지 않음' }, 401)
    }

    // 파일 크기 제한 (50MB - Flutter에서 압축 후 업로드)
    const MAX_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return c.json({ success: false, error: `파일 크기 초과: 최대 50MB (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)` }, 400)
    }

    // 허용 파일 타입: 오디오/비디오
    const allowedExtensions = ['mp3', 'mp4', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'wma', 'mov', 'mkv', 'avi', 'wmv', 'm4v', 'webm']
    const fileName = file.name || 'unknown'
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (!allowedExtensions.includes(ext)) {
      return c.json({ success: false, error: `허용되지 않는 파일 형식: ${ext}` }, 400)
    }

    // 파일 경로: alarm-files/{userId}/{timestamp}_{originalName}
    const timestamp = Date.now()
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `alarm-files/${sessionRow.user_id}/${timestamp}_${safeFileName}`

    // Content-Type 결정
    let contentType = file.type || 'application/octet-stream'
    if (!file.type) {
      if (ext === 'mp3') contentType = 'audio/mp3'
      else if (ext === 'mp4') contentType = 'video/mp4'
    }

    // 파일 데이터 읽기
    const fileBuffer = await file.arrayBuffer()

    // Firebase Storage 업로드
    const accessToken = await getStorageAccessToken(serviceAccountJson)
    const downloadUrl = await uploadToFirebaseStorage(accessToken, bucket, filePath, fileBuffer, contentType)

    return c.json({
      success: true,
      url: downloadUrl,
      fileName: fileName,
      filePath: filePath,
      size: file.size,
      contentType: contentType,
    })
  } catch (e: any) {
    console.error('[uploads/alarm-file 오류]', e)
    return c.json({ success: false, error: e.message || '업로드 실패' }, 500)
  }
})

export default uploads
