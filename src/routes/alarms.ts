// src/routes/alarms.ts
// 채널 알람 스케줄 관리 + 통화형 알람 발송 (FCM V1 API + Twilio 연동 or 시뮬레이션)
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { sendFCMDataMessage, sendFCMMulticast } from './fcm'

// ── URL 정규화 + 형식 검증 헬퍼 ─────────────────────────────────
// 비어있으면 null 반환, http(s):// 없으면 https:// 자동 추가, 유효하지 않으면 에러 반환
function normalizeUrl(raw: string | undefined | null): { ok: boolean; value: string | null; error?: string } {
  if (!raw || !raw.trim()) return { ok: true, value: null }
  let url = raw.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  try {
    const parsed = new URL(url)
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { ok: false, value: null, error: '올바른 URL 형식이 아닙니다 (예: example.com)' }
    }
    return { ok: true, value: url }
  } catch {
    return { ok: false, value: null, error: '올바른 URL 형식이 아닙니다 (예: example.com)' }
  }
}
import { deleteFromFirebaseStorage } from './uploads'

const alarms = new Hono<{ Bindings: Bindings }>()

// =============================================
// Twilio Voice Call 유틸리티
// 알람을 받은 회원이 통화버튼 누르면 메시지 소스(YouTube/오디오/비디오) 실행
// =============================================
async function makeTwilioCall(
  to: string,
  channelName: string,
  msgType: string,
  msgValue: string,
  twilioAccountSid: string,
  twilioAuthToken: string,
  twilioFromNumber: string,
  webhookBaseUrl: string
): Promise<{ success: boolean; callSid?: string; error?: string }> {
  try {
    // TwiML Webhook URL - 통화 수락 시 재생할 콘텐츠
    const twimlUrl = `${webhookBaseUrl}/api/alarms/twiml?type=${encodeURIComponent(msgType)}&value=${encodeURIComponent(msgValue)}&channel=${encodeURIComponent(channelName)}`

    const formData = new URLSearchParams({
      To: to,
      From: twilioFromNumber,
      Url: twimlUrl,
      Method: 'GET',
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    )

    const result: any = await response.json()
    if (result.sid) {
      return { success: true, callSid: result.sid }
    } else {
      return { success: false, error: result.message || result.code || 'Twilio call failed' }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// =============================================
// GET /api/alarms/twiml  - Twilio가 통화 수락 시 호출하는 TwiML Webhook
// 회원이 통화버튼을 누르면 설정된 메시지 소스(YouTube URL 등)를 음성으로 안내
// =============================================
alarms.get('/twiml', (c) => {
  const msgType  = c.req.query('type')    || 'youtube'
  const msgValue = c.req.query('value')   || ''
  const channel  = c.req.query('channel') || '채널'

  let twiml = ''

  if (msgType === 'youtube') {
    // YouTube URL이 있는 경우: 음성으로 URL과 채널 안내 후 연결 유도
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">안녕하세요. ${channel} 채널의 알람입니다.</Say>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">설정하신 유튜브 영상을 지금 확인해 주세요.</Say>
  <Play>${msgValue.startsWith('http') ? '' : ''}</Play>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">앱에서 알람을 확인하세요. 감사합니다.</Say>
</Response>`
  } else if (msgType === 'audio') {
    // 오디오 파일 직접 재생
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">안녕하세요. ${channel} 채널의 알람입니다.</Say>
  ${msgValue ? `<Play>${msgValue}</Play>` : '<Say language="ko-KR">알람이 도착했습니다.</Say>'}
</Response>`
  } else if (msgType === 'video') {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">안녕하세요. ${channel} 채널의 알람입니다.</Say>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">설정하신 비디오가 준비됐습니다. 앱에서 확인해 주세요.</Say>
</Response>`
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ko-KR" voice="Google.ko-KR-Wavenet-A">안녕하세요. ${channel} 채널의 알람입니다. 앱을 확인해 주세요.</Say>
</Response>`
  }

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  })
})

// =============================================
// POST /api/alarms  - 알람 예약 저장
// =============================================
alarms.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, created_by, scheduled_at, msg_type, msg_value, link_url, content_text } = body

    if (!channel_id || !created_by || !scheduled_at || !msg_type) {
      return c.json({ success: false, error: 'channel_id, created_by, scheduled_at, msg_type 필수' }, 400)
    }
    // scheduled_at이 UTC ISO 문자열인지 확인 후 미래 시간 검증
    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date(Date.now() - 60 * 1000)) {
      return c.json({ success: false, error: '현재 시각 이후로 설정해주세요' }, 400)
    }

    // msg_value 크기 검증: Base64 데이터(대용량)는 저장 불가, 파일명/URL만 허용
    const safeValue = (msg_value || '').toString()
    if (safeValue.length > 2000) {
      return c.json({ success: false, error: '메시지 소스 값이 너무 큽니다. 파일명 또는 URL만 저장 가능합니다.' }, 400)
    }

    // content_text 검증 (선택, 최대 20자)
    const safeContentText = (content_text || '').toString().trim().slice(0, 20) || null

    // link_url 정규화 (http(s):// 없으면 https:// 자동 추가) + 형식 검증
    const linkNorm = normalizeUrl(link_url)
    if (!linkNorm.ok) return c.json({ success: false, error: linkNorm.error }, 400)

    // 채널 존재 확인 (public_id 포함)
    const channel = await c.env.DB.prepare('SELECT id, name, public_id, homepage_url, image_url FROM channels WHERE id = ? AND is_active = 1').bind(channel_id).first()
    if (!channel) return c.json({ success: false, error: '채널을 찾을 수 없습니다' }, 404)

    // 예약 시간이 이미 지난 pending 알람을 triggered로 자동 전환
    // ★ scheduled_at에 ISO 'T' 구분자가 포함될 수 있어 replace()로 정규화
    await c.env.DB.prepare(
      "UPDATE alarm_schedules SET status = 'triggered' WHERE channel_id = ? AND status = 'pending' AND replace(substr(scheduled_at,1,19),'T',' ') <= datetime('now')"
    ).bind(channel_id).run()

    // 채널당 pending 알람 최대 3개 제한 (미래 예약만 카운트)
    // ★ scheduled_at에 ISO 'T' 구분자가 포함될 수 있어 replace()로 정규화
    const MAX_ALARMS_PER_CHANNEL = 3
    const alarmCount: any = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM alarm_schedules WHERE channel_id = ? AND status = 'pending' AND replace(substr(scheduled_at,1,19),'T',' ') > datetime('now')"
    ).bind(channel_id).first()
    if ((alarmCount?.cnt || 0) >= MAX_ALARMS_PER_CHANNEL) {
      return c.json({ success: false, error: `채널당 최대 ${MAX_ALARMS_PER_CHANNEL}개까지 알람을 예약할 수 있습니다. 기존 알람을 삭제 후 다시 시도해 주세요.` }, 400)
    }

    // 5분 이내 중복 예약 방지 (기존 pending 알람과 ±5분 미만이면 차단)
    const MIN_INTERVAL_MINUTES = 5
    // ★ scheduled_at에 ISO 'T' 구분자가 포함될 수 있어 replace()로 정규화
    const conflictCheck: any = await c.env.DB.prepare(`
      SELECT scheduled_at FROM alarm_schedules
      WHERE channel_id = ? AND status = 'pending'
        AND replace(substr(scheduled_at,1,19),'T',' ') > datetime('now')
        AND ABS((strftime('%s', replace(substr(scheduled_at,1,19),'T',' ')) - strftime('%s', replace(substr(?,1,19),'T',' '))) / 60.0) < ?
      LIMIT 1
    `).bind(channel_id, scheduled_at, MIN_INTERVAL_MINUTES).first()
    if (conflictCheck) {
      const conflictTime = conflictCheck.scheduled_at.replace('T', ' ').slice(0, 16)
      return c.json({ success: false, error: `이미 근접한 시간(${conflictTime} UTC)에 예약된 알람이 있습니다. 5분 이상 간격으로 예약해 주세요.` }, 400)
    }

    // 구독자 수 조회
    const subCount: any = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM subscribers WHERE channel_id = ? AND is_active = 1'
    ).bind(channel_id).first()

    const safeLinkUrl = linkNorm.value || (channel as any).homepage_url || null

    const result = await c.env.DB.prepare(`
      INSERT INTO alarm_schedules (channel_id, created_by, scheduled_at, msg_type, msg_value, status, total_targets, link_url, content_text)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(channel_id, created_by, scheduled_at, msg_type, safeValue, subCount?.cnt || 0, safeLinkUrl, safeContentText).run()

    const alarmId = result.meta.last_row_id as number

    // ── alarm_logs 껍데기 INSERT (수신자별, status=pending) ──────────────
    // 알람 생성 시점에 구독자 전원을 alarm_logs에 미리 기록
    // → 시간 지나 alarm_schedules 삭제돼도 로그 보존
    // → 앱 수신함/발신함에서 receiver_id/sender_id 기준으로 조회 가능
    const { results: allSubs } = await c.env.DB.prepare(`
      SELECT s.user_id
      FROM subscribers s
      WHERE s.channel_id = ? AND s.is_active = 1
    `).bind(channel_id).all() as { results: any[] }

    // 배치 INSERT: D1 batch API로 한 번에 처리 (순차 await 제거 → 타임아웃 방지)
    if (allSubs.length > 0) {
      const BATCH_SIZE = 50  // D1 batch 최대 권장 단위
      for (let i = 0; i < allSubs.length; i += BATCH_SIZE) {
        const chunk = allSubs.slice(i, i + BATCH_SIZE)
        const stmts = chunk.map(sub =>
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO alarm_logs
              (alarm_id, channel_id, channel_name, receiver_id, msg_type, msg_value, status, sender_id, scheduled_at, link_url, content_text)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
          `).bind(
            alarmId,
            channel_id,
            (channel as any).name || '알람',
            sub.user_id,
            msg_type,
            safeValue,
            created_by,
            scheduled_at,
            safeLinkUrl,
            safeContentText
          )
        )
        try { await c.env.DB.batch(stmts) } catch (_) {}
      }
    }
    // ─────────────────────────────────────────────────────────────────
    // 알람 시간 5분 전에 각 앱에 "예약 신호(type=alarm_schedule)"를 FCM으로 전송
    // 앱은 이 신호를 받아 AlarmManager.setExactAndAllowWhileIdle()로 정확한 시간 예약
    const scheduledMs   = scheduledDate.getTime()         // 알람 실행 시각 (ms)
    const notifyMs      = scheduledMs - 2 * 60 * 1000     // 2분 전
    const nowMs         = Date.now()
    const delaySeconds  = Math.max(0, Math.floor((notifyMs - nowMs) / 1000))

    // 콘텐츠 URL 생성
    const webhookBase = (c.env as any).WEBHOOK_BASE_URL || 'https://ringo.run'
    // audio/video/file은 Firebase Storage URL(msg_value)을 직접 사용
    let contentUrl = safeValue

    // ★ channel_image: base64 데이터 URI는 FCM 4KB 제한 초과 → 프록시 URL로 변환
    const rawImageUrl = (channel as any).image_url || ''
    const channelImageForFcm = rawImageUrl.startsWith('data:') 
      ? `${webhookBase}/api/channels/${channel_id}/image`
      : rawImageUrl

    // 구독자 + 채널 운영자 FCM 토큰 수집
    const fcmServiceAccount = (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
    const fcmProjectId      = (c.env as any).FCM_PROJECT_ID           || ''

    if (fcmServiceAccount && fcmProjectId) {
      // 구독자 목록 조회 (채널 생성 시 운영자도 자동 등록되므로 별도 조회 불필요)
      const { results: subs } = await c.env.DB.prepare(`
        SELECT s.user_id, COALESCE(s.fcm_token, u.fcm_token) as fcm_token
        FROM subscribers s
        LEFT JOIN users u ON s.user_id = u.user_id
        WHERE s.channel_id = ? AND s.is_active = 1
          AND COALESCE(s.fcm_token, u.fcm_token) IS NOT NULL
      `).bind(channel_id).all() as { results: any[] }

      const fcmTargets = new Map<string, string>()
      for (const s of subs) {
        // COALESCE 결과값(fcm_token)을 직접 사용 — s.fcm_token(NULL)이 아닌 쿼리 결과값으로 체크
        const token = s.fcm_token  // COALESCE(s.fcm_token, u.fcm_token) 결과
        if (token) fcmTargets.set(s.user_id, token)
      }

      // 각 기기에 예약 신호 전송 (비동기, 결과 무시 — 실패해도 폴링 폴백 동작)
      const schedulePayload: Record<string, string> = {
        type:           'alarm_schedule',       // 앱이 AlarmManager 예약하는 신호
        alarm_id:       String(alarmId),
        channel_name:   (channel as any).name,
        channel_public_id: (channel as any).public_id || '',
        channel_image:  channelImageForFcm,
        msg_type:       msg_type,
        msg_value:      safeValue,
        content_url:    contentUrl,
        homepage_url:   (channel as any).homepage_url || '',
        link_url:       safeLinkUrl || '',
        content_text:   safeContentText || '',
        scheduled_time: String(scheduledMs),    // 앱이 AlarmManager에 넘길 Unix ms
        notify_delay_s: String(delaySeconds),   // 디버그용: 몇 초 후 발송인지
      }

      // FCM Multicast 발송 (fire-and-forget) - 500명씩 자동 분할
      const tokenList = Array.from(fcmTargets.values())
      const multicastPromise = sendFCMMulticast(tokenList, schedulePayload, fcmServiceAccount, fcmProjectId)
        .then(async (res) => {
          // invalid token 즉시 비활성화
          if (res.invalidTokens.length > 0) {
            for (const badToken of res.invalidTokens) {
              await c.env.DB.prepare(
                "UPDATE subscribers SET fcm_token = NULL WHERE fcm_token = ?"
              ).bind(badToken).run().catch(() => {})
            }
          }
        })
        .catch(() => {})
      c.executionCtx?.waitUntil(multicastPromise)
    }
    // ─────────────────────────────────────────────────────────────────

    return c.json({
      success: true,
      data: {
        id: alarmId,
        channel_id,
        channel_name: (channel as any).name,
        scheduled_at,
        msg_type,
        total_targets: subCount?.cnt || 0,
        status: 'pending'
      }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms/count?channel_ids=id1,id2,...  - 채널별 pending 알람 개수 조회
// 내채널 리스트 알람 아이콘/배지 표시용
// =============================================
alarms.get('/count', async (c) => {
  try {
    const channelIds = (c.req.query('channel_ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (channelIds.length === 0) return c.json({ success: true, data: {} })

    // 채널별 pending 알람 개수 집계
    const placeholders = channelIds.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(`
      SELECT channel_id, COUNT(*) as count
      FROM alarm_schedules
      WHERE channel_id IN (${placeholders})
        AND status = 'pending'
        AND replace(substr(scheduled_at,1,19),'T',' ') > datetime('now')
      GROUP BY channel_id
    `).bind(...channelIds).all()

    // { channelId: count } 형태로 변환
    const data: Record<string, number> = {}
    for (const row of results as any[]) {
      data[row.channel_id] = row.count
    }

    return c.json({ success: true, data })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms?channel_id=X&user_id=Y  - 알람 목록 조회
// 조회 시 이미 지난 pending/triggered 알람은 자동 삭제 후 반환
// =============================================
alarms.get('/', async (c) => {
  try {
    const channelId  = c.req.query('channel_id')
    // created_by, user_id 둘 다 수락 (프론트 호환)
    const userId     = c.req.query('user_id') || c.req.query('created_by')
    const params: any[] = []
    let where = 'WHERE 1=1'

    if (channelId) { where += ' AND a.channel_id = ?'; params.push(channelId) }
    if (userId)    { where += ' AND a.created_by = ?'; params.push(userId) }
    // 미래 pending + 최근 3일 이내 지난 알람(triggered/pending 모두) 반환
    where += " AND (  (a.status = 'pending' AND replace(substr(a.scheduled_at,1,19),'T',' ') > datetime('now'))" +
             "     OR (replace(substr(a.scheduled_at,1,19),'T',' ') <= datetime('now') AND replace(substr(a.scheduled_at,1,19),'T',' ') >= datetime('now','-3 days') AND a.status IN ('pending','triggered'))  )"

    const stmt = c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      ${where}
      ORDER BY a.scheduled_at ASC
    `)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()

    // 지난 알람 자동 삭제는 alarm-cron.js 에서 처리 (조회 응답 지연 방지)
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// DELETE /api/alarms/:id  - 알람 삭제 + FCM alarm_cancel 신호 발송
// =============================================
alarms.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    // 알람 + 채널 정보 조회
    const alarm: any = await c.env.DB.prepare(`
      SELECT a.id, a.status, a.channel_id, a.msg_type, ch.name as channel_name
      FROM alarm_schedules a
      LEFT JOIN channels ch ON ch.id = a.channel_id
      WHERE a.id = ?
    `).bind(id).first()
    if (!alarm) return c.json({ success: false, error: '알람을 찾을 수 없습니다' }, 404)

    // FCM alarm_cancel 신호 발송 (pending 상태인 경우만 - 아직 앱에 예약된 상태)
    if (alarm.status === 'pending') {
      const fcmServiceAccount = (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
      const fcmProjectId      = (c.env as any).FCM_PROJECT_ID           || ''

      if (fcmServiceAccount && fcmProjectId) {
        // 해당 채널 구독자 FCM 토큰 수집
        const { results: subs } = await c.env.DB.prepare(`
          SELECT s.user_id, COALESCE(s.fcm_token, u.fcm_token) as fcm_token
          FROM subscribers s
          LEFT JOIN users u ON s.user_id = u.user_id
          WHERE s.channel_id = ? AND s.is_active = 1
            AND COALESCE(s.fcm_token, u.fcm_token) IS NOT NULL
        `).bind(alarm.channel_id).all() as { results: any[] }

        const cancelPayload: Record<string, string> = {
          type:         'alarm_cancel',   // 앱이 AlarmManager 취소하는 신호
          alarm_id:     String(id),
          channel_name: alarm.channel_name || '',
        }

        // FCM Multicast로 취소 신호 발송 (fire-and-forget)
        const cancelTokens = subs.filter(s => s.fcm_token).map(s => s.fcm_token as string)
        const cancelPromise = sendFCMMulticast(cancelTokens, cancelPayload, fcmServiceAccount, fcmProjectId)
          .then(async (res) => {
            if (res.invalidTokens.length > 0) {
              for (const badToken of res.invalidTokens) {
                await c.env.DB.prepare(
                  "UPDATE subscribers SET fcm_token = NULL WHERE fcm_token = ?"
                ).bind(badToken).run().catch(() => {})
              }
            }
          })
          .catch(() => {})
        c.executionCtx?.waitUntil(cancelPromise)
      }
    }

    // alarm_logs 먼저 삭제 (FK 제약 방지)
    await c.env.DB.prepare(
      "DELETE FROM alarm_logs WHERE alarm_id = ?"
    ).bind(id).run()

    // 알람 스케줄 삭제
    await c.env.DB.prepare(
      "DELETE FROM alarm_schedules WHERE id = ?"
    ).bind(id).run()

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/trigger  - 시간 도래한 알람 실행 (Cron 또는 폴링에서 호출)
// 채널 운영자 + 구독자 각각 독립적으로 알람 발송
// ★ 핵심 원칙: alarm_logs(alarm_id, receiver_id) UNIQUE INDEX 로 개인별 중복 방지
//   - FCM/Twilio: 서버가 각 수신자에게 직접 발송, alarm_logs에 기록
//   - 폴링(app_polling): 호출자 본인의 alarm_logs 유무로 중복 판단
//   - alarm_schedules.status는 모든 수신자 처리 완료 후 'triggered'로 변경
// =============================================
alarms.post('/trigger', async (c) => {
  try {
    // 호출자 세션 토큰으로 user_id 식별 (폴링 방식에서 개인 식별용)
    const authHeader   = c.req.header('Authorization') || ''
    const sessionToken = authHeader.replace('Bearer ', '').trim()
    let pollingUserId: string | null = null
    if (sessionToken) {
      const sessionRow: any = await c.env.DB.prepare(
        "SELECT user_id FROM user_sessions WHERE session_token = ? AND expires_at > datetime('now')"
      ).bind(sessionToken).first()
      pollingUserId = sessionRow?.user_id || null
    }

    // UTC 기준 현재 시각 (분 단위 절사)
    // ※ cleanup 로직은 /api/alarms/cleanup 으로 분리됨
    const now = new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM

    // 발송 대상 알람 조회: pending + triggered 모두 포함
    // (triggered 포함 이유: FCM 발송은 완료됐어도 폴링 사용자가 아직 못 받을 수 있음)
    // LIMIT 제거 - 모든 시간 도래 알람 처리 (Multicast로 대용량 처리 가능)
    const { results: dueAlarms } = await c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name, ch.owner_id as channel_owner_id,
             ch.homepage_url as channel_homepage_url, ch.public_id as channel_public_id,
             ch.image_url as channel_image_url,
             a.link_url as alarm_link_url, a.content_text as alarm_content_text
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      WHERE a.status IN ('pending', 'triggered')
        AND (a.is_enabled IS NULL OR a.is_enabled = 1)
        AND replace(replace(substr(a.scheduled_at, 1, 19), 'T', ' '), 'Z', '') <= ?
      ORDER BY a.scheduled_at ASC
    `).bind(now).all() as { results: any[] }

    if (dueAlarms.length === 0) {
      return c.json({ success: true, message: '발송할 알람 없음', triggered: 0 })
    }

    const twilioSid   = (c.env as any).TWILIO_ACCOUNT_SID || ''
    const twilioToken = (c.env as any).TWILIO_AUTH_TOKEN  || ''
    const twilioFrom  = (c.env as any).TWILIO_FROM_NUMBER || ''
    const webhookBase = (c.env as any).WEBHOOK_BASE_URL   || 'https://ringo.run'
    const useTwilio   = !!(twilioSid && twilioToken && twilioFrom)

    const fcmServiceAccount = (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
    const fcmProjectId      = (c.env as any).FCM_PROJECT_ID           || ''
    const useFCM            = !!(fcmServiceAccount && fcmProjectId)

    let totalTriggered = 0
    const results: any[] = []

    for (const alarm of dueAlarms) {

      // ── 1) 수신자 목록 구성 ─────────────────────────────────────
      // 채널 생성 시 운영자가 자동으로 구독자에 등록되므로
      // subscribers 테이블만 조회하면 운영자 포함 전체 수신자 목록을 얻을 수 있다.
      const { results: subscribers } = await c.env.DB.prepare(`
        SELECT s.id, s.user_id, s.display_name,
               COALESCE(s.fcm_token, u.fcm_token) as fcm_token,
               u.phone_number
        FROM subscribers s
        LEFT JOIN users u ON s.user_id = u.user_id
        WHERE s.channel_id = ? AND s.is_active = 1
      `).bind(alarm.channel_id).all() as { results: any[] }

      const recipientMap = new Map<string, any>()

      for (const sub of subscribers) {
        recipientMap.set(sub.user_id || String(sub.id), {
          user_id:      sub.user_id,
          display_name: sub.display_name,
          fcm_token:    sub.fcm_token || '',
          phone_number: sub.phone_number,
          role:         sub.user_id === alarm.channel_owner_id ? 'owner' : 'subscriber'
        })
      }

      // ── 2) 폴링 방식: 호출자 본인만 처리 ───────────────────────
      let recipients = Array.from(recipientMap.values())
      const isPollingMode = pollingUserId && !useFCM && !useTwilio

      if (isPollingMode) {
        // 이 알람의 수신 대상인지 확인
        if (!recipients.some(r => r.user_id === pollingUserId)) continue
        // 이미 alarm_logs에 기록된 경우(이전 폴링에서 수신됨) → 중복 스킵
        const alreadyLogged: any = await c.env.DB.prepare(
          'SELECT id FROM alarm_logs WHERE alarm_id = ? AND receiver_id = ?'
        ).bind(alarm.id, pollingUserId).first()
        if (alreadyLogged) continue
        // 호출자 본인에게만 전달
        recipients = recipients.filter(r => r.user_id === pollingUserId)
      }

      // ── 3) 콘텐츠 URL 생성 ──────────────────────────────────────
      // audio/video/file은 Firebase Storage URL(msg_value)을 직접 사용
      let contentUrl = alarm.msg_value || ''

      // ── 4) 발송 ─────────────────────────────────────────────────
      let sentCount = 0, failedCount = 0
      const callResults: any[] = []

      // ── 중복 수신자 배치 조회 (개별 루프 → 1회 IN 쿼리로 최적화) ──────
      // 이미 alarm_logs에 기록된 receiver_id를 한 번에 조회
      const allUserIds = recipients.map(r => r.user_id).filter(Boolean)
      const alreadySentSet = new Set<string>()
      if (!isPollingMode && allUserIds.length > 0) {
        // D1은 prepared statement 파라미터 바인딩을 지원하므로
        // IN 절을 동적으로 생성 (최대 수천 개 처리 가능)
        const placeholders = allUserIds.map(() => '?').join(',')
        const { results: sentRows } = await c.env.DB.prepare(
          `SELECT receiver_id FROM alarm_logs WHERE alarm_id = ? AND receiver_id IN (${placeholders})`
        ).bind(alarm.id, ...allUserIds).all() as { results: any[] }
        for (const row of sentRows) alreadySentSet.add(row.receiver_id)
      }
      // ────────────────────────────────────────────────────────────────────

      if (useTwilio) {
        // ── Twilio 음성 통화 (순차 발송) ──
        for (const recipient of recipients) {
          if (!recipient.phone_number) continue
          if (!isPollingMode && recipient.user_id) {
            if (alreadySentSet.has(recipient.user_id)) {
              callResults.push({ user_id: recipient.user_id, mode: 'skipped', success: true }); continue
            }
          }
          const callRes = await makeTwilioCall(
            recipient.phone_number, alarm.channel_name, alarm.msg_type,
            contentUrl || alarm.msg_value || '', twilioSid, twilioToken, twilioFrom, webhookBase
          )
          callResults.push({ user_id: recipient.user_id, display_name: recipient.display_name, role: recipient.role, phone: recipient.phone_number, mode: 'twilio', ...callRes })
          if (callRes.success) sentCount++; else failedCount++
        }

      } else if (useFCM) {
        // ── FCM Multicast 발송 ──
        // 이미 발송된 수신자 제외 (alreadySentSet 기준 — 위에서 배치 조회 완료)
        const notYetSent: typeof recipients = []
        for (const recipient of recipients) {
          if (recipient.user_id && alreadySentSet.has(recipient.user_id)) {
            callResults.push({ user_id: recipient.user_id, display_name: recipient.display_name, role: recipient.role, mode: 'skipped', success: true, message: '이미 발송됨 (alarm_logs 기준)' })
            continue
          }
          notYetSent.push(recipient)
        }

        if (notYetSent.length > 0) {
          const fcmPayload: Record<string, string> = {
            type:         'alarm',
            channel_name: alarm.channel_name || '알람',
            channel_public_id: alarm.channel_public_id || '',
            channel_image: (alarm.channel_image_url || '').startsWith('data:') ? `${webhookBase}/api/channels/${alarm.channel_id}/image` : (alarm.channel_image_url || ''),
            msg_type:     alarm.msg_type     || 'youtube',
            msg_value:    alarm.msg_value    || '',
            alarm_id:     String(alarm.id),
            content_url:  contentUrl         || '',
            homepage_url: alarm.channel_homepage_url || '',
            link_url:     alarm.alarm_link_url || '',
            content_text: alarm.alarm_content_text || '',
          }

          // FCM 토큰이 있는 수신자와 없는 수신자 분리
          const withToken    = notYetSent.filter(r => r.fcm_token)
          const withoutToken = notYetSent.filter(r => !r.fcm_token)

          // Multicast 발송 (500명씩 자동 분할)
          const tokenList = withToken.map(r => r.fcm_token as string)
          const multiRes = tokenList.length > 0
            ? await sendFCMMulticast(tokenList, fcmPayload, fcmServiceAccount, fcmProjectId)
            : { successCount: 0, failureCount: 0, invalidTokens: [] }

          sentCount  += multiRes.successCount
          failedCount += multiRes.failureCount

          // invalid token 즉시 비활성화 (배치 처리)
          if (multiRes.invalidTokens.length > 0) {
            const ph = multiRes.invalidTokens.map(() => '?').join(',')
            await c.env.DB.prepare(
              `UPDATE subscribers SET fcm_token = NULL WHERE fcm_token IN (${ph})`
            ).bind(...multiRes.invalidTokens).run().catch(() => {})
          }

          // callResults 구성 (토큰 있는 수신자)
          for (const r of withToken) {
            const isInvalid = multiRes.invalidTokens.includes(r.fcm_token as string)
            callResults.push({ user_id: r.user_id, display_name: r.display_name, role: r.role, mode: 'fcm', success: !isInvalid })
          }

          // 토큰 없는 수신자는 폴링 방식
          for (const r of withoutToken) {
            callResults.push({ user_id: r.user_id, display_name: r.display_name, role: r.role, mode: 'app_polling', success: true, message: '앱 폴링으로 수신됨' })
            sentCount++
          }
        }

      } else {
        // ── 폴링(app_polling) 방식 ──
        for (const recipient of recipients) {
          callResults.push({ user_id: recipient.user_id, display_name: recipient.display_name, role: recipient.role, mode: 'app_polling', success: true, message: '앱 폴링으로 수신됨' })
          sentCount++
        }
      }

      // ★ alarm_logs 배치 업데이트 (개별 루프 → 그룹별 1회 쿼리로 최적화)
      const toUpdate = callResults.filter(r => r.mode !== 'skipped' && r.user_id)
      if (toUpdate.length > 0) {
        // 성공/실패 그룹으로 분리
        const receivedIds = toUpdate.filter(r => r.success).map(r => r.user_id)
        const failedIds   = toUpdate.filter(r => !r.success).map(r => r.user_id)

        // 그룹별 배치 UPDATE
        for (const [ids, status] of [[receivedIds, 'received'], [failedIds, 'failed']] as [string[], string][]) {
          if (ids.length === 0) continue
          const ph = ids.map(() => '?').join(',')
          await c.env.DB.prepare(
            `UPDATE alarm_logs SET status = ? WHERE alarm_id = ? AND receiver_id IN (${ph}) AND status = 'pending'`
          ).bind(status, alarm.id, ...ids).run().catch(() => {})
        }

        // UPDATE로 변경 안 된 행(alarm_logs에 없는 신규 수신자) → 배치 INSERT
        // 알람 생성 시 alarm_logs 껍데기를 미리 INSERT하므로 여기서는 누락분만 처리
        const { results: existingRows } = await c.env.DB.prepare(
          `SELECT receiver_id FROM alarm_logs WHERE alarm_id = ? AND receiver_id IN (${toUpdate.map(() => '?').join(',')})`
        ).bind(alarm.id, ...toUpdate.map(r => r.user_id)).all() as { results: any[] }
        const existingSet = new Set(existingRows.map((r: any) => r.receiver_id))

        // 배치 INSERT: 누락분을 D1 batch API로 한 번에 처리
        const missingRecipients = toUpdate.filter(r => !existingSet.has(r.user_id))
        if (missingRecipients.length > 0) {
          const BATCH_SIZE = 50
          for (let bi = 0; bi < missingRecipients.length; bi += BATCH_SIZE) {
            const chunk = missingRecipients.slice(bi, bi + BATCH_SIZE)
            const stmts = chunk.map(r =>
              c.env.DB.prepare(`
                INSERT OR IGNORE INTO alarm_logs
                  (alarm_id, channel_id, channel_name, receiver_id, msg_type, msg_value, status, sender_id, scheduled_at, link_url, content_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                alarm.id, alarm.channel_id, alarm.channel_name || '알람',
                r.user_id, alarm.msg_type || 'youtube', alarm.msg_value || '',
                r.success ? 'received' : 'failed',
                alarm.created_by || null, alarm.scheduled_at || null,
                alarm.alarm_link_url || alarm.channel_homepage_url || null,
                alarm.alarm_content_text || null
              )
            )
            try { await c.env.DB.batch(stmts) } catch (_) {}
          }
        }
      }

      // 수신자 없거나 처리 불가 → 시간이 지난 pending 알람은 즉시 삭제
      if (callResults.length === 0) {
        // scheduled_at이 현재 이전인 pending 알람은 삭제 (구독자 없는 채널 등)
        await c.env.DB.prepare(
          "DELETE FROM alarm_schedules WHERE id = ? AND status = 'pending'"
        ).bind(alarm.id).run()
        continue
      }

      // ── 5) alarm_schedules 업데이트 ─────────────────────────────
      // 폴링 방식이 아닐 때(FCM/Twilio): 처음 발송 시 status → triggered
      if (!isPollingMode && alarm.status === 'pending') {
        await c.env.DB.prepare(
          "UPDATE alarm_schedules SET status = 'triggered', triggered_at = datetime('now') WHERE id = ? AND status = 'pending'"
        ).bind(alarm.id).run()
      }

      // 발송 카운트 업데이트 (누적이 아닌 alarm_logs 기준 실제 발송 수로 덮어쓰기)
      const actualSent = callResults.filter(r => r.mode !== 'skipped' && r.success).length
      if (actualSent > 0) {
        // alarm_logs 실제 레코드 수로 sent_count 설정 (중복 방지)
        const { results: logCount } = await c.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM alarm_logs WHERE alarm_id = ?'
        ).bind(alarm.id).all() as { results: any[] }
        const realSentCount = logCount[0]?.cnt ?? actualSent
        await c.env.DB.prepare(
          'UPDATE alarm_schedules SET sent_count = ?, total_targets = ? WHERE id = ?'
        ).bind(realSentCount, recipientMap.size, alarm.id).run()
      }

      // ── 발송 완료된 알람: 즉시 삭제하지 않음 ──────────────────────────
      // alarm_logs FK(ON DELETE CASCADE)로 인해 alarm_schedules 삭제 시
      // alarm_logs까지 연쇄 삭제되어 수신함/발신함에 이력이 안 남는 문제 해결
      // → status='triggered'로만 변경, 실제 삭제는 3일 후 cleanup에서 처리
      // ────────────────────────────────────────────────────────────────

      totalTriggered++
      results.push({
        alarm_id:          alarm.id,
        channel_name:      alarm.channel_name,
        channel_public_id: alarm.channel_public_id || '',
        channel_image:     (alarm.channel_image_url || '').startsWith('data:') ? `${webhookBase}/api/channels/${alarm.channel_id}/image` : (alarm.channel_image_url || ''),
        scheduled_at:      alarm.scheduled_at,
        msg_type:          alarm.msg_type,
        msg_value:         alarm.msg_value,
        content_url:       contentUrl,
        homepage_url:      alarm.channel_homepage_url || '',
        link_url:          alarm.alarm_link_url || '',
        content_text:      alarm.alarm_content_text || '',
        total_targets:     recipientMap.size,
        sent_count:        sentCount,
        failed_count:      failedCount,
        mode:              useTwilio ? 'twilio' : useFCM ? 'fcm' : 'app_polling',
        recipients:        callResults
      })
    }

    return c.json({ success: true, triggered: totalTriggered, results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/cleanup  - 3일 이전 데이터 정리 (Cron에서 별도 호출)
// /trigger에서 분리해 독립적으로 실행 가능
// =============================================
alarms.post('/cleanup', async (c) => {
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    let deletedFiles = 0

    // Firebase Storage 파일 삭제 (audio/video/file 타입)
    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson)
        const projectId = sa.project_id || c.env.FCM_PROJECT_ID
        const bucket = `${projectId}.firebasestorage.app`
        // alarm_logs에서 3일 초과 Firebase URL 수집
        const { results: oldLogFiles } = await c.env.DB.prepare(
          "SELECT DISTINCT msg_value FROM alarm_logs WHERE received_at < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours') AND msg_type IN ('audio','video','file') AND msg_value LIKE 'https://firebasestorage%'"
        ).all() as { results: any[] }
        // alarm_schedules에서도 수집
        const { results: oldSchedFiles } = await c.env.DB.prepare(
          "SELECT DISTINCT msg_value FROM alarm_schedules WHERE replace(substr(scheduled_at,1,19),'T',' ') < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours') AND msg_type IN ('audio','video','file') AND msg_value LIKE 'https://firebasestorage%'"
        ).all() as { results: any[] }
        // 중복 제거 후 삭제
        const allUrls = [...new Set([...oldLogFiles, ...oldSchedFiles].map((r: any) => r.msg_value))]
        for (const url of allUrls) {
          try {
            const match = (url as string).match(/\/o\/([^?]+)/)
            if (match) {
              const filePath = decodeURIComponent(match[1])
              await deleteFromFirebaseStorage(serviceAccountJson, bucket, filePath)
              deletedFiles++
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 3일 이전 alarm_logs 삭제
    const logsResult = await c.env.DB.prepare(
      "DELETE FROM alarm_logs WHERE received_at < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours')"
    ).run()

    // 3일 이전 alarm_schedules 삭제 (triggered/cancelled/pending 모두 - 안전망)
    const schedulesResult = await c.env.DB.prepare(
      "DELETE FROM alarm_schedules WHERE replace(substr(scheduled_at,1,19),'T',' ') < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours') AND status IN ('triggered', 'cancelled', 'pending')"
    ).run()

    return c.json({
      success: true,
      deleted_logs: logsResult.meta.changes ?? 0,
      deleted_schedules: schedulesResult.meta.changes ?? 0,
      deleted_files: deletedFiles
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/bulk-delete  - 알람 일괄 삭제
// =============================================
alarms.post('/bulk-delete', async (c) => {
  try {
    const { ids } = await c.req.json<{ ids: number[] }>()
    if (!Array.isArray(ids) || ids.length === 0)
      return c.json({ success: false, error: 'ids 배열이 필요합니다' }, 400)

    let deleted = 0
    for (const id of ids) {
      await c.env.DB.prepare('DELETE FROM alarm_logs WHERE alarm_id = ?').bind(id).run()
      await c.env.DB.prepare('DELETE FROM alarm_schedules WHERE id = ?').bind(id).run()
      deleted++
    }
    return c.json({ success: true, deleted })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms/pending  - 곧 발송될 알람 목록 (앱 시작 시 AlarmManager 재예약용)
// user_id 파라미터로 본인이 가입한 채널의 알람만 반환
// =============================================
alarms.get('/pending', async (c) => {
  try {
    const userId = c.req.query('user_id')

    let query: string
    let params: any[]

    if (userId) {
      // 내가 가입한 채널의 pending 알람만 반환
      query = `
        SELECT a.*, ch.name as channel_name, ch.public_id as channel_public_id,
               ch.homepage_url as channel_homepage_url
        FROM alarm_schedules a
        JOIN channels ch ON a.channel_id = ch.id
        JOIN subscribers s ON s.channel_id = a.channel_id
        WHERE a.status = 'pending'
          AND (a.is_enabled IS NULL OR a.is_enabled = 1)
          AND replace(substr(a.scheduled_at,1,19),'T',' ') > datetime('now')
          AND s.user_id = ? AND s.is_active = 1
        ORDER BY a.scheduled_at ASC
        LIMIT 200
      `
      params = [userId]
    } else {
      // user_id 없으면 전체 반환 (관리자용)
      query = `
        SELECT a.*, ch.name as channel_name, ch.public_id as channel_public_id,
               ch.homepage_url as channel_homepage_url
        FROM alarm_schedules a
        JOIN channels ch ON a.channel_id = ch.id
        WHERE a.status = 'pending'
          AND (a.is_enabled IS NULL OR a.is_enabled = 1)
        ORDER BY a.scheduled_at ASC
        LIMIT 200
      `
      params = []
    }

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as { results: any[] }
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// 세션 토큰으로 사용자 조회 헬퍼
// =============================================
async function getUserFromSession(c: any): Promise<{ id: string; user_id: string } | null> {
  try {
    const authHeader = c.req.header('Authorization') || ''
    const sessionToken = authHeader.replace('Bearer ', '').trim()
    if (!sessionToken) return null
    const session = await c.env.DB.prepare(`
      SELECT s.user_id FROM user_sessions s
      WHERE s.session_token = ? AND s.expires_at > datetime('now')
    `).bind(sessionToken).first() as { user_id: string } | null
    if (!session) return null
    return { id: session.user_id, user_id: session.user_id }
  } catch { return null }
}

// =============================================
// GET /api/alarms/logs  - 알람 로그 전체 조회 (관리자용)
// =============================================
alarms.get('/logs', async (c) => {
  try {
    // 3일 이전 데이터 즉시 삭제
    await c.env.DB.prepare(
      "DELETE FROM alarm_logs WHERE received_at < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours')"
    ).run()
    await c.env.DB.prepare(
      "DELETE FROM alarm_schedules WHERE replace(substr(scheduled_at,1,19),'T',' ') < datetime('now', '+9 hours', 'start of day', '-2 days', '-9 hours') AND status IN ('triggered', 'cancelled')"
    ).run()

    const limit  = Math.min(Number(c.req.query('limit')  || 200), 500)
    const offset = Number(c.req.query('offset') || 0)
    const dateFrom = c.req.query('date_from') || ''  // YYYY-MM-DD
    const dateTo   = c.req.query('date_to')   || ''  // YYYY-MM-DD
    const channel  = (c.req.query('channel')  || '').trim()  // 채널명 부분일치
    const sender   = (c.req.query('sender')   || '').trim()  // 발신자 이메일 부분일치

    // ── WHERE 조건 구성 (GROUP BY 이전 행 단위 필터) ──────────────
    // channel_name: alarm_logs 컬럼 → 직접 WHERE 가능
    // sender email: users JOIN 결과 컬럼 → WHERE에서 처리 (JOIN 후 필터)
    // 날짜: received_at 직접 비교
    const whereConditions: string[] = []
    const whereParams: any[] = []
    if (dateFrom) { whereConditions.push("l.received_at >= ?"); whereParams.push(dateFrom + ' 00:00:00') }
    if (dateTo)   { whereConditions.push("l.received_at <= ?"); whereParams.push(dateTo + ' 23:59:59') }
    if (channel)  { whereConditions.push("l.channel_name LIKE ?"); whereParams.push('%' + channel + '%') }
    if (sender)   { whereConditions.push("COALESCE(u.email, '-') LIKE ?"); whereParams.push('%' + sender + '%') }
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // ── 메인 쿼리: alarm_id 기준 집계 ────────────────────────────
    // sender 필터가 있으면 LEFT JOIN → INNER처럼 동작해도 무방
    const { results } = await c.env.DB.prepare(`
      SELECT
        l.alarm_id                      AS id,
        l.channel_name,
        COALESCE(u.email, '-')          AS sender_email,
        COUNT(l.id)                     AS receiver_count,
        l.msg_type,
        l.msg_value,
        l.content_text,
        MAX(l.status)                   AS status,
        MIN(l.scheduled_at)             AS scheduled_at,
        l.link_url,
        CASE WHEN b.email IS NOT NULL THEN 1 ELSE 0 END AS sender_is_blocked
      FROM alarm_logs l
      LEFT JOIN users u ON u.user_id = l.sender_id
      LEFT JOIN blocked_emails b ON LOWER(b.email) = LOWER(u.email)
      ${whereClause}
      GROUP BY l.alarm_id
      ORDER BY MIN(l.scheduled_at) DESC
      LIMIT ? OFFSET ?
    `).bind(...whereParams, limit, offset).all() as { results: any[] }

    // ── COUNT 쿼리: 동일 조건으로 총 건수 계산 ───────────────────
    const { results: countResult } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT l.alarm_id) AS total
      FROM alarm_logs l
      LEFT JOIN users u ON u.user_id = l.sender_id
      ${whereClause}
    `).bind(...whereParams).all() as { results: any[] }

    return c.json({
      success: true,
      total: countResult[0]?.total || 0,
      data: results
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/inbox/bulk-delete  - 수신함 로그 선택 삭제 (본인 것만)
// =============================================
alarms.post('/inbox/bulk-delete', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
    const { log_ids } = await c.req.json() as { log_ids: number[] }
    if (!Array.isArray(log_ids) || log_ids.length === 0)
      return c.json({ success: false, error: 'log_ids 필수' }, 400)
    const placeholders = log_ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE alarm_logs SET deleted_by_receiver = 1 WHERE id IN (${placeholders}) AND receiver_id = ?`
    ).bind(...log_ids, user.id).run()
    return c.json({ success: true, deleted: log_ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// DELETE /api/alarms/inbox/delete-all  - 수신함 전체 삭제 (본인 것만)
// =============================================
alarms.delete('/inbox/delete-all', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const channelId = c.req.query('channel_id') || ''
    let query = `UPDATE alarm_logs SET deleted_by_receiver = 1 WHERE receiver_id = ? AND deleted_by_receiver = 0 AND replace(substr(scheduled_at,1,19),'T',' ') <= datetime('now')`
    const params: any[] = [user.id]
    if (channelId) {
      query += ` AND channel_id = ?`
      params.push(Number(channelId))
    }
    const result = await c.env.DB.prepare(query).bind(...params).run()

    return c.json({ success: true, deleted: result.meta?.changes || 0 })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// DELETE /api/alarms/outbox/delete-all  - 발신함 전체 삭제 (본인 것만)
// =============================================
alarms.delete('/outbox/delete-all', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const channelId = c.req.query('channel_id') || ''
    let query = `UPDATE alarm_logs SET deleted_by_sender = 1 WHERE sender_id = ? AND deleted_by_sender = 0 AND replace(substr(scheduled_at,1,19),'T',' ') <= datetime('now')`
    const params: any[] = [user.id]
    if (channelId) {
      query += ` AND channel_id = ?`
      params.push(Number(channelId))
    }
    const result = await c.env.DB.prepare(query).bind(...params).run()

    return c.json({ success: true, deleted: result.meta?.changes || 0 })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/outbox/bulk-delete  - 발신함 로그 선택 삭제 (본인 것만)
// =============================================
alarms.post('/outbox/bulk-delete', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
    const { log_ids } = await c.req.json() as { log_ids: number[] }
    if (!Array.isArray(log_ids) || log_ids.length === 0)
      return c.json({ success: false, error: 'log_ids 필수' }, 400)
    const placeholders = log_ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `UPDATE alarm_logs SET deleted_by_sender = 1 WHERE id IN (${placeholders}) AND sender_id = ?`
    ).bind(...log_ids, user.id).run()
    return c.json({ success: true, deleted: log_ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/logs/bulk-delete  - 알람 로그 선택 삭제 (관리자용)
// =============================================
alarms.post('/logs/bulk-delete', async (c) => {
  try {
    const { alarm_ids } = await c.req.json() as { alarm_ids: number[] }
    if (!Array.isArray(alarm_ids) || alarm_ids.length === 0)
      return c.json({ success: false, error: 'alarm_ids 필수' }, 400)

    const placeholders = alarm_ids.map(() => '?').join(',')
    await c.env.DB.prepare(
      `DELETE FROM alarm_logs WHERE alarm_id IN (${placeholders})`
    ).bind(...alarm_ids).run()

    return c.json({ success: true, deleted: alarm_ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms/inbox  - 수신함
// =============================================
alarms.get('/inbox', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const channelId = c.req.query('channel_id') || ''

    const limit  = Math.min(Number(c.req.query('limit')  || 20), 100)
    const offset = Number(c.req.query('offset') || 0)
    const params: any[] = [user.id]

    // LEFT JOIN channels: 삭제된 채널 로그도 표시 (channel_name은 alarm_logs에 저장된 값 사용)
    // 미래 알람 제외: scheduled_at <= 현재시각인 것만 표시
    let query = `
      SELECT
        l.id, l.alarm_id, l.channel_id,
        COALESCE(ch.name, l.channel_name) as channel_name,
        l.msg_type, l.msg_value, l.status, l.received_at,
        l.scheduled_at, l.link_url, l.content_text, ch.image_url as channel_image
      FROM alarm_logs l
      LEFT JOIN channels ch ON ch.id = l.channel_id
      WHERE l.receiver_id = ?
        AND l.deleted_by_receiver = 0
        AND replace(substr(l.scheduled_at,1,19),'T',' ') <= datetime('now')
    `
    if (channelId) {
      query += ` AND l.channel_id = ?`
      params.push(Number(channelId))
    }

    // 전체 카운트 (미래 알람 제외)
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM alarm_logs l WHERE l.receiver_id = ? AND l.deleted_by_receiver = 0 AND replace(substr(l.scheduled_at,1,19),'T',' ') <= datetime('now')${channelId ? ' AND l.channel_id = ?' : ''}`
    ).bind(...params).first() as any
    const total = countResult?.total || 0

    query += ` ORDER BY l.received_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as { results: any[] }

    // 필터 칩용 채널 목록: 삭제된 채널 제외 (INNER JOIN)
    const channels = offset === 0 ? (() => {
      return c.env.DB.prepare(
        `SELECT DISTINCT l.channel_id as id,
                ch.name as name,
                ch.image_url
         FROM alarm_logs l
         INNER JOIN channels ch ON ch.id = l.channel_id
         WHERE l.receiver_id = ?
           AND l.deleted_by_receiver = 0
           AND replace(substr(l.scheduled_at,1,19),'T',' ') <= datetime('now')
         ORDER BY name ASC`
      ).bind(user.id).all()
    })() : Promise.resolve({ results: [] })

    const chResult = await channels as { results: any[] }
    const channelList = offset === 0 ? chResult.results.map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      image_url: ch.image_url || ''
    })) : undefined

    const data = results.map((r: any) => ({ ...r }))

    const hasMore = offset + limit < total
    return c.json({ success: true, data, channels: channelList, total, hasMore })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/inbox/:id/status  - 수신 알람 상태 변경
// =============================================
alarms.post('/inbox/:id/status', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)
    const id     = Number(c.req.param('id'))
    const { status } = await c.req.json() as { status: string }
    if (!['received','accepted','rejected','timeout'].includes(status))
      return c.json({ success: false, error: 'invalid status' }, 400)

    await c.env.DB.prepare(
      'UPDATE alarm_logs SET status = ? WHERE id = ? AND receiver_id = ?'
    ).bind(status, id, user.id).run()

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms/outbox  - 발신함
// =============================================
alarms.get('/outbox', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const channelId = c.req.query('channel_id') || ''

    // alarm_logs는 수신자마다 1행 → GROUP BY alarm_id 로 묶어 발신 단위로 1건만 표시
    // LEFT JOIN channels: 삭제된 채널 로그도 표시 (channel_name은 alarm_logs에 저장된 값 사용)
    // 미래 알람 제외: scheduled_at <= 현재시각인 것만 표시
    let whereClause = `WHERE l.sender_id = ? AND l.deleted_by_sender = 0 AND replace(substr(l.scheduled_at,1,19),'T',' ') <= datetime('now')`
    const params: any[] = [user.id]
    if (channelId) {
      whereClause += ` AND l.channel_id = ?`
      params.push(Number(channelId))
    }
    const limit  = Math.min(Number(c.req.query('limit')  || 20), 100)
    const offset = Number(c.req.query('offset') || 0)

    // 전체 카운트 (alarm_id 기준 중복 제거, 삭제된 채널도 포함)
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT l.alarm_id) as total FROM alarm_logs l ${whereClause}`
    ).bind(...params).first() as any
    const total = countResult?.total || 0

    // GROUP BY alarm_id + LEFT JOIN channels: 삭제된 채널도 표시
    const query = `
      SELECT
        MIN(l.id) as id, l.alarm_id, l.channel_id,
        COALESCE(ch.name, l.channel_name) as channel_name,
        l.msg_type, l.msg_value,
        MAX(l.status) as status,
        MIN(l.received_at) as received_at,
        l.scheduled_at, l.link_url, l.content_text,
        ch.image_url as channel_image,
        COUNT(l.id) as receiver_count
      FROM alarm_logs l
      LEFT JOIN channels ch ON ch.id = l.channel_id
      ${whereClause}
      GROUP BY l.alarm_id
      ORDER BY MIN(l.received_at) DESC
      LIMIT ? OFFSET ?
    `
    params.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all() as { results: any[] }

    // 필터 칩용 채널 목록: 삭제된 채널 제외 (INNER JOIN)
    const chResult = offset === 0
      ? await c.env.DB.prepare(
          `SELECT DISTINCT l.channel_id as id,
                  ch.name as name,
                  ch.image_url
           FROM alarm_logs l
           INNER JOIN channels ch ON ch.id = l.channel_id
           WHERE l.sender_id = ?
             AND l.deleted_by_sender = 0
             AND replace(substr(l.scheduled_at,1,19),'T',' ') <= datetime('now')
           ORDER BY name ASC`
        ).bind(user.id).all() as { results: any[] }
      : { results: [] }

    const channelList = offset === 0 ? chResult.results.map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      image_url: ch.image_url || ''
    })) : undefined

    const data = results.map((r: any) => ({ ...r }))

    const hasMore = offset + limit < total
    return c.json({ success: true, data, channels: channelList, total, hasMore })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/status  - 앱(FakeCallActivity)에서 alarm 상태 기록
// alarm_schedule_id + user의 alarm_logs 레코드를 찾아 status 업데이트
// =============================================
alarms.post('/status', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const { alarm_schedule_id, status } = await c.req.json() as {
      alarm_schedule_id: number
      status: string
    }

    if (!alarm_schedule_id || !status) {
      return c.json({ success: false, error: 'alarm_schedule_id, status 필수' }, 400)
    }
    if (!['accepted', 'rejected', 'timeout'].includes(status)) {
      return c.json({ success: false, error: '유효하지 않은 status' }, 400)
    }

    // alarm_logs에서 해당 alarm_schedule_id + receiver_id 로 로그 찾기
    const log: any = await c.env.DB.prepare(
      'SELECT id FROM alarm_logs WHERE alarm_id = ? AND receiver_id = ?'
    ).bind(alarm_schedule_id, user.user_id).first()

    if (!log) {
      // 로그가 없으면 새로 생성 (폴링 수신 후 app 응답)
      // alarm_schedules에서 채널 정보 조회
      const alarm: any = await c.env.DB.prepare(`
        SELECT a.*, ch.name as channel_name, ch.homepage_url as channel_homepage_url, a.scheduled_at, a.link_url, a.content_text
        FROM alarm_schedules a
        JOIN channels ch ON a.channel_id = ch.id
        WHERE a.id = ?
      `).bind(alarm_schedule_id).first()

      if (alarm) {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO alarm_logs
            (alarm_id, channel_id, channel_name, receiver_id, msg_type, msg_value, status, sender_id, scheduled_at, link_url, content_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          alarm_schedule_id,
          alarm.channel_id,
          alarm.channel_name || '알람',
          user.user_id,
          alarm.msg_type || 'youtube',
          alarm.msg_value || '',
          status,
          alarm.created_by || null,
          alarm.scheduled_at || null,
          alarm.link_url || alarm.channel_homepage_url || null,
          alarm.content_text || null
        ).run()
      }
      return c.json({ success: true, action: 'created', status })
    }

    // 기존 로그 업데이트
    await c.env.DB.prepare(
      'UPDATE alarm_logs SET status = ? WHERE id = ? AND receiver_id = ?'
    ).bind(status, log.id, user.user_id).run()

    // accepted/rejected 카운트 업데이트
    if (status === 'accepted') {
      await c.env.DB.prepare(
        'UPDATE subscribers SET accepted_count = accepted_count + 1 WHERE user_id = ? AND channel_id = (SELECT channel_id FROM alarm_schedules WHERE id = ?)'
      ).bind(user.user_id, alarm_schedule_id).run().catch(() => {})
    } else if (status === 'rejected') {
      await c.env.DB.prepare(
        'UPDATE subscribers SET rejected_count = rejected_count + 1 WHERE user_id = ? AND channel_id = (SELECT channel_id FROM alarm_schedules WHERE id = ?)'
      ).bind(user.user_id, alarm_schedule_id).run().catch(() => {})
    }

    return c.json({ success: true, action: 'updated', status })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default alarms
