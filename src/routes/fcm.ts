// src/routes/fcm.ts
// FCM 토큰 관리 + Firebase V1 API를 통한 data-only 푸시 발송
import { Hono } from 'hono'
import type { Bindings } from '../types'

const fcm = new Hono<{ Bindings: Bindings }>()

// =============================================
// Firebase V1 API OAuth2 액세스 토큰 획득
// 서비스 계정 JSON으로 JWT를 서명해 access_token을 발급받음
// =============================================
async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 3600

  // JWT Header
  const header = { alg: 'RS256', typ: 'JWT' }
  // JWT Payload
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
  }

  const encodeBase64Url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const encodedHeader  = encodeBase64Url(header)
  const encodedPayload = encodeBase64Url(payload)
  const signingInput   = `${encodedHeader}.${encodedPayload}`

  // PEM private key → CryptoKey
  const pemKey = sa.private_key as string
  const pemBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder    = new TextEncoder()
  const signature  = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const jwt = `${signingInput}.${encodedSignature}`

  // JWT → access_token 교환
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
    throw new Error(`FCM 액세스 토큰 획득 실패: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// =============================================
// FCM V1 API data-only 메시지 발송
// data-only: notification 키 없음 → 상단 알림 안 뜸
// Android에서는 RinGoFCMService.onMessageReceived()가 직접 FakeCallActivity 실행
// =============================================
export async function sendFCMDataMessage(
  fcmToken: string,
  data: Record<string, string>,
  serviceAccountJson: string,
  projectId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const accessToken = await getFirebaseAccessToken(serviceAccountJson)

    const message = {
      message: {
        token: fcmToken,
        data: data,    // data-only (notification 키 없음)
        android: {
          priority: 'high',          // 백그라운드에서도 즉시 수신
          ttl: '60s',
        },
      },
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    )

    const result: any = await res.json()

    if (res.ok && result.name) {
      return { success: true, messageId: result.name }
    } else {
      return { success: false, error: result.error?.message || JSON.stringify(result) }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// =============================================
// FCM V1 API Multicast 발송 (최대 500명씩 분할)
// tokens: FCM 토큰 배열, data: 공통 data payload
// 반환: { successCount, failureCount, invalidTokens }
// =============================================
export async function sendFCMMulticast(
  tokens: string[],
  data: Record<string, string>,
  serviceAccountJson: string,
  projectId: string
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[]; failedDetails: { token: string; error: string }[] }> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [], failedDetails: [] }

  const CHUNK_SIZE = 500
  let successCount = 0
  let failureCount = 0
  const invalidTokens: string[] = []
  const failedDetails: { token: string; error: string }[] = []

  // 500명씩 청크 분할
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE)

    try {
      const accessToken = await getFirebaseAccessToken(serviceAccountJson)

      // FCM V1 sendEach - 50개씩 순차 병렬 전송 (Workers Paid 플랜: subrequest 10,000개)
      const CONCURRENT = 50
      const chunkResults: { token: string; success: boolean; isInvalid?: boolean; error?: string }[] = []

      for (let ci = 0; ci < chunk.length; ci += CONCURRENT) {
        const batch = chunk.slice(ci, ci + CONCURRENT)

        const batchResults = await Promise.all(batch.map(async (token) => {
          const message = {
            message: {
              token,
              data,
              android: {
                priority: 'high',
                ttl: '60s',
              },
            },
          }

          try {
            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
              }
            )

            const result: any = await res.json()

            if (res.ok && result.name) {
              return { token, success: true }
            } else {
              const errCode = result.error?.details?.[0]?.errorCode || result.error?.status || ''
              const isInvalid = errCode === 'UNREGISTERED' || errCode === 'INVALID_ARGUMENT'
              return { token, success: false, isInvalid, error: result.error?.message || errCode || 'unknown' }
            }
          } catch (e: any) {
            return { token, success: false, isInvalid: false, error: e.message }
          }
        }))

        chunkResults.push(...batchResults)
      }

      for (const r of chunkResults) {
        if (r.success) {
          successCount++
        } else {
          failureCount++
          if ((r as any).isInvalid) {
            invalidTokens.push(r.token)
          }
          failedDetails.push({ token: r.token, error: r.error || 'unknown' })
        }
      }
    } catch (e: any) {
      // 청크 전체 실패 시 해당 청크 수만큼 failureCount 증가
      failureCount += chunk.length
      failedDetails.push({ token: '_chunk_error_', error: e.message })
    }
  }

  return { successCount, failureCount, invalidTokens, failedDetails }
}

// =============================================
// POST /api/fcm/register  - FCM 토큰 등록/갱신
// 앱 로그인 후 FCM 토큰을 서버에 저장 (구독자 테이블의 fcm_token 컬럼)
// =============================================
fcm.post('/register', async (c) => {
  try {
    // 인증 확인
    const authHeader = c.req.header('Authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return c.json({ success: false, error: '인증 토큰 없음' }, 401)

    // 세션 확인
    const user: any = await c.env.DB.prepare(
      'SELECT user_id FROM user_sessions WHERE session_token = ? AND expires_at > datetime("now")'
    ).bind(token).first()
    if (!user) return c.json({ success: false, error: '세션 만료' }, 401)

    const { fcm_token } = await c.req.json()
    if (!fcm_token) return c.json({ success: false, error: 'fcm_token 필수' }, 400)

    // users 테이블 fcm_token 업데이트
    await c.env.DB.prepare(
      'UPDATE users SET fcm_token = ?, updated_at = datetime("now") WHERE user_id = ?'
    ).bind(fcm_token, user.user_id).run()

    // subscribers 테이블 fcm_token도 업데이트 (해당 사용자의 모든 구독)
    await c.env.DB.prepare(
      'UPDATE subscribers SET fcm_token = ? WHERE user_id = ?'
    ).bind(fcm_token, user.user_id).run()

    return c.json({ success: true, message: 'FCM 토큰 등록 완료' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/fcm/test  - FCM 테스트 발송 (디버그용)
// =============================================
fcm.post('/test', async (c) => {
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
    const projectId = c.env.FCM_PROJECT_ID || (c.env as any).FCM_PROJECT_ID || ''

    // 디버그: env 키 목록 확인
    const envKeys = Object.keys(c.env || {})

    if (!serviceAccountJson || !projectId) {
      return c.json({ 
        success: false, 
        error: 'FCM_SERVICE_ACCOUNT_JSON 또는 FCM_PROJECT_ID 미설정',
        debug_env_keys: envKeys,
        has_sa_json: !!serviceAccountJson,
        has_project_id: !!projectId
      }, 400)
    }

    const { fcm_token, channel_name, msg_type, msg_value, alarm_id, content_url } = await c.req.json()
    if (!fcm_token) return c.json({ success: false, error: 'fcm_token 필수' }, 400)

    const result = await sendFCMDataMessage(
      fcm_token,
      {
        type:         'alarm',
        channel_name: channel_name || '테스트 채널',
        msg_type:     msg_type     || 'youtube',
        msg_value:    msg_value    || '',
        alarm_id:     String(alarm_id || 0),
        content_url:  content_url  || '',
      },
      serviceAccountJson,
      projectId
    )

    return c.json({ success: result.success, messageId: result.messageId, error: result.error })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default fcm
