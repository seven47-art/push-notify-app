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
    const serviceAccountJson = (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
    const projectId = (c.env as any).FCM_PROJECT_ID || ''

    if (!serviceAccountJson || !projectId) {
      return c.json({ success: false, error: 'FCM_SERVICE_ACCOUNT_JSON 또는 FCM_PROJECT_ID 미설정' }, 400)
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
