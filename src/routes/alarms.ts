// src/routes/alarms.ts
// 채널 알람 스케줄 관리 + 통화형 알람 발송 (FCM V1 API + Twilio 연동 or 시뮬레이션)
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { sendFCMDataMessage } from './fcm'

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
    const { channel_id, created_by, scheduled_at, msg_type, msg_value } = body

    if (!channel_id || !created_by || !scheduled_at || !msg_type) {
      return c.json({ success: false, error: 'channel_id, created_by, scheduled_at, msg_type 필수' }, 400)
    }
    // scheduled_at이 UTC ISO 문자열인지 확인 후 미래 시간 검증
    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return c.json({ success: false, error: '현재 시각 이후로 설정해주세요' }, 400)
    }

    // msg_value 크기 검증: Base64 데이터(대용량)는 저장 불가, 파일명/URL만 허용
    const safeValue = (msg_value || '').toString()
    if (safeValue.length > 2000) {
      return c.json({ success: false, error: '메시지 소스 값이 너무 큽니다. 파일명 또는 URL만 저장 가능합니다.' }, 400)
    }

    // 채널 존재 확인
    const channel = await c.env.DB.prepare('SELECT id, name FROM channels WHERE id = ? AND is_active = 1').bind(channel_id).first()
    if (!channel) return c.json({ success: false, error: '채널을 찾을 수 없습니다' }, 404)

    // 구독자 수 조회
    const subCount: any = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM subscribers WHERE channel_id = ? AND is_active = 1'
    ).bind(channel_id).first()

    const result = await c.env.DB.prepare(`
      INSERT INTO alarm_schedules (channel_id, created_by, scheduled_at, msg_type, msg_value, status, total_targets)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).bind(channel_id, created_by, scheduled_at, msg_type, safeValue, subCount?.cnt || 0).run()

    const alarmId = result.meta.last_row_id as number

    // ── 5분 전 FCM 예약 신호 발송 (AlarmManager 방식) ─────────────────
    // 알람 시간 5분 전에 각 앱에 "예약 신호(type=alarm_schedule)"를 FCM으로 전송
    // 앱은 이 신호를 받아 AlarmManager.setExactAndAllowWhileIdle()로 정확한 시간 예약
    const scheduledMs   = scheduledDate.getTime()         // 알람 실행 시각 (ms)
    const notifyMs      = scheduledMs - 2 * 60 * 1000     // 2분 전
    const nowMs         = Date.now()
    const delaySeconds  = Math.max(0, Math.floor((notifyMs - nowMs) / 1000))

    // 콘텐츠 URL 생성
    const webhookBase = (c.env as any).WEBHOOK_BASE_URL || 'https://ringo-server.pages.dev'
    let contentUrl = safeValue
    if (['audio', 'video', 'file'].includes(msg_type) && safeValue) {
      contentUrl = `${webhookBase}/api/contents/stream/${encodeURIComponent(safeValue)}`
    }

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
        if (s.fcm_token) fcmTargets.set(s.user_id, s.fcm_token)
      }

      // 각 기기에 예약 신호 전송 (비동기, 결과 무시 — 실패해도 폴링 폴백 동작)
      const schedulePayload: Record<string, string> = {
        type:           'alarm_schedule',       // 앱이 AlarmManager 예약하는 신호
        alarm_id:       String(alarmId),
        channel_name:   (channel as any).name,
        msg_type:       msg_type,
        msg_value:      safeValue,
        content_url:    contentUrl,
        homepage_url:   '',
        scheduled_time: String(scheduledMs),    // 앱이 AlarmManager에 넘길 Unix ms
        notify_delay_s: String(delaySeconds),   // 디버그용: 몇 초 후 발송인지
      }

      // 모든 토큰에 FCM 발송 (fire-and-forget)
      const sendPromises = Array.from(fcmTargets.values()).map(token =>
        sendFCMDataMessage(token, schedulePayload, fcmServiceAccount, fcmProjectId)
          .catch(() => ({ success: false }))
      )
      c.executionCtx?.waitUntil(Promise.all(sendPromises))
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
// GET /api/alarms?channel_id=X&user_id=Y  - 알람 목록 조회
// 조회 시 이미 지난 pending/triggered 알람은 자동 삭제 후 반환
// =============================================
alarms.get('/', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    const userId    = c.req.query('user_id')
    const params: any[] = []
    let where = 'WHERE 1=1'

    if (channelId) { where += ' AND a.channel_id = ?'; params.push(channelId) }
    if (userId)    { where += ' AND a.created_by = ?'; params.push(userId) }

    const stmt = c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      ${where}
      ORDER BY a.scheduled_at ASC
    `)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()

    // ── 지난 알람 자동 삭제 ──────────────────────────────────────────
    // scheduled_at이 현재 시각보다 과거이고, status가 pending/triggered인 알람은
    // 이미 울렸거나 울려야 했지만 남아있는 것 → 자동 삭제 처리
    const now = new Date()
    const expiredAlarms = (results as any[]).filter(a => {
      const scheduledAt = new Date(a.scheduled_at)
      return scheduledAt < now && (a.status === 'pending' || a.status === 'triggered')
    })

    if (expiredAlarms.length > 0) {
      // 지난 알람 일괄 삭제 (alarm_logs 먼저 삭제 후 alarm_schedules 삭제)
      for (const alarm of expiredAlarms) {
        try {
          await c.env.DB.prepare('DELETE FROM alarm_logs WHERE alarm_id = ?').bind(alarm.id).run()
          await c.env.DB.prepare('DELETE FROM alarm_schedules WHERE id = ?').bind(alarm.id).run()
        } catch (_) { /* 삭제 실패 무시 */ }
      }
      // 삭제 후 남은 알람만 반환
      const expiredIds = new Set(expiredAlarms.map((a: any) => a.id))
      const activeResults = (results as any[]).filter(a => !expiredIds.has(a.id))
      return c.json({ success: true, data: activeResults })
    }
    // ────────────────────────────────────────────────────────────────

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

        // 모든 구독자에게 취소 신호 발송 (fire-and-forget)
        const sendPromises = subs
          .filter(s => s.fcm_token)
          .map(s => sendFCMDataMessage(s.fcm_token, cancelPayload, fcmServiceAccount, fcmProjectId)
            .catch(() => ({ success: false }))
          )
        c.executionCtx?.waitUntil(Promise.all(sendPromises))
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
    const now = new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM

    // 발송 대상 알람 조회: pending + triggered 모두 포함
    // (triggered 포함 이유: FCM 발송은 완료됐어도 폴링 사용자가 아직 못 받을 수 있음)
    const { results: dueAlarms } = await c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name, ch.owner_id as channel_owner_id,
             ch.homepage_url as channel_homepage_url
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      WHERE a.status IN ('pending', 'triggered')
        AND replace(substr(a.scheduled_at, 1, 16), 'Z', '') <= ?
      ORDER BY a.scheduled_at ASC
      LIMIT 20
    `).bind(now).all() as { results: any[] }

    if (dueAlarms.length === 0) {
      return c.json({ success: true, message: '발송할 알람 없음', triggered: 0 })
    }

    const twilioSid   = (c.env as any).TWILIO_ACCOUNT_SID || ''
    const twilioToken = (c.env as any).TWILIO_AUTH_TOKEN  || ''
    const twilioFrom  = (c.env as any).TWILIO_FROM_NUMBER || ''
    const webhookBase = (c.env as any).WEBHOOK_BASE_URL   || 'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai'
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
      let contentUrl = alarm.msg_value || ''
      if (['audio', 'video', 'file'].includes(alarm.msg_type) && alarm.msg_value) {
        contentUrl = `${webhookBase}/api/contents/stream/${encodeURIComponent(alarm.msg_value)}`
      }

      // ── 4) 수신자별 발송 ────────────────────────────────────────
      let sentCount = 0, failedCount = 0
      const callResults: any[] = []

      for (const recipient of recipients) {
        // ★ FCM/Twilio 방식: alarm_logs로 개인별 중복 체크 (이미 받은 사람 스킵)
        if (!isPollingMode && recipient.user_id) {
          const alreadyLogged: any = await c.env.DB.prepare(
            'SELECT id FROM alarm_logs WHERE alarm_id = ? AND receiver_id = ?'
          ).bind(alarm.id, recipient.user_id).first()
          if (alreadyLogged) {
            callResults.push({
              user_id:      recipient.user_id,
              display_name: recipient.display_name,
              role:         recipient.role,
              mode:         'skipped',
              success:      true,
              message:      '이미 발송됨 (alarm_logs 기준)'
            })
            continue
          }
        }

        if (useTwilio && recipient.phone_number) {
          // ── Twilio 음성 통화 ──
          const callRes = await makeTwilioCall(
            recipient.phone_number,
            alarm.channel_name,
            alarm.msg_type,
            contentUrl || alarm.msg_value || '',
            twilioSid, twilioToken, twilioFrom,
            webhookBase
          )
          callResults.push({
            user_id:      recipient.user_id,
            display_name: recipient.display_name,
            role:         recipient.role,
            phone:        recipient.phone_number,
            mode:         'twilio',
            ...callRes
          })
          if (callRes.success) sentCount++; else failedCount++

        } else if (useFCM && recipient.fcm_token) {
          // ── FCM 데이터 메시지 ──
          const fcmRes = await sendFCMDataMessage(
            recipient.fcm_token,
            {
              type:         'alarm',
              channel_name: alarm.channel_name || '알람',
              msg_type:     alarm.msg_type     || 'youtube',
              msg_value:    alarm.msg_value    || '',
              alarm_id:     String(alarm.id),
              content_url:  contentUrl         || '',
              homepage_url: alarm.channel_homepage_url || '',
            },
            fcmServiceAccount,
            fcmProjectId
          )
          callResults.push({
            user_id:      recipient.user_id,
            display_name: recipient.display_name,
            role:         recipient.role,
            mode:         'fcm',
            ...fcmRes
          })
          if (fcmRes.success) sentCount++; else failedCount++

        } else {
          // ── 폴링(app_polling) 방식 ──
          callResults.push({
            user_id:      recipient.user_id,
            display_name: recipient.display_name,
            role:         recipient.role,
            mode:         'app_polling',
            success:      true,
            message:      '앱 폴링으로 수신됨'
          })
          sentCount++
        }

        // ★ alarm_logs INSERT OR IGNORE (UNIQUE INDEX로 자동 중복 방지)
        if (recipient.user_id) {
          const lastResult = callResults[callResults.length - 1]
          if (lastResult.mode !== 'skipped') {
            try {
              await c.env.DB.prepare(`
                INSERT OR IGNORE INTO alarm_logs
                  (alarm_id, channel_id, channel_name, receiver_id, msg_type, msg_value, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).bind(
                alarm.id,
                alarm.channel_id,
                alarm.channel_name || '알람',
                recipient.user_id,
                alarm.msg_type  || 'youtube',
                alarm.msg_value || '',
                lastResult.success ? 'received' : 'failed'
              ).run()
            } catch (_) {}
          }
        }
      }

      if (callResults.length === 0) continue

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

      // ── 발송 완료된 알람 자동 삭제 ──────────────────────────────────
      // triggered 상태가 되고 모든 수신자에게 발송 완료된 알람은 DB에서 정리
      // (alarm_logs는 수신 이력으로 보존, alarm_schedules만 삭제)
      try {
        await c.env.DB.prepare('DELETE FROM alarm_logs WHERE alarm_id = ?').bind(alarm.id).run()
        await c.env.DB.prepare('DELETE FROM alarm_schedules WHERE id = ?').bind(alarm.id).run()
      } catch (_) { /* 삭제 실패 무시 — 다음 조회 시 GET에서 처리됨 */ }
      // ────────────────────────────────────────────────────────────────

      totalTriggered++
      results.push({
        alarm_id:      alarm.id,
        channel_name:  alarm.channel_name,
        scheduled_at:  alarm.scheduled_at,
        msg_type:      alarm.msg_type,
        msg_value:     alarm.msg_value,
        content_url:   contentUrl,
        homepage_url:  alarm.channel_homepage_url || '',
        total_targets: recipientMap.size,
        sent_count:    sentCount,
        failed_count:  failedCount,
        mode:          useTwilio ? 'twilio' : useFCM ? 'fcm' : 'app_polling',
        recipients:    callResults
      })
    }

    return c.json({ success: true, triggered: totalTriggered, results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/alarms/pending  - 곧 발송될 알람 목록 (폴링용)
// =============================================
alarms.get('/pending', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      WHERE a.status = 'pending'
      ORDER BY a.scheduled_at ASC
      LIMIT 50
    `).all() as { results: any[] }
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
// GET /api/alarms/inbox  - 수신함 (채널별 그룹)
// =============================================
alarms.get('/inbox', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    // 채널별 최신 알람 + 전체 목록
    const { results } = await c.env.DB.prepare(`
      SELECT
        l.id, l.alarm_id, l.channel_id, l.channel_name,
        l.msg_type, l.msg_value, l.status, l.received_at
      FROM alarm_logs l
      WHERE l.receiver_id = ?
      ORDER BY l.received_at DESC
      LIMIT 200
    `).bind(user.id).all() as { results: any[] }

    // 채널별 그룹핑
    const groups: Record<string, any> = {}
    for (const row of results) {
      const key = String(row.channel_id)
      if (!groups[key]) {
        groups[key] = {
          channel_id:   row.channel_id,
          channel_name: row.channel_name,
          items:        [],
          unread:       0,
          latest_at:    row.received_at
        }
      }
      groups[key].items.push(row)
      if (row.status === 'received') groups[key].unread++
    }

    return c.json({ success: true, data: Object.values(groups) })
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
// GET /api/alarms/outbox  - 발신함 (채널별 그룹)
// =============================================
alarms.get('/outbox', async (c) => {
  try {
    const user = await getUserFromSession(c)
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401)

    const { results } = await c.env.DB.prepare(`
      SELECT
        a.id, a.channel_id, ch.name as channel_name,
        a.msg_type, a.msg_value, a.scheduled_at, a.status,
        a.total_targets, a.sent_count, a.triggered_at
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      WHERE a.created_by = ?
      ORDER BY a.scheduled_at DESC
      LIMIT 200
    `).bind(user.id).all() as { results: any[] }

    // 채널별 그룹핑
    const groups: Record<string, any> = {}
    for (const row of results) {
      const key = String(row.channel_id)
      if (!groups[key]) {
        groups[key] = {
          channel_id:   row.channel_id,
          channel_name: row.channel_name,
          items:        [],
          latest_at:    row.scheduled_at
        }
      }
      groups[key].items.push(row)
    }

    return c.json({ success: true, data: Object.values(groups) })
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
        SELECT a.*, ch.name as channel_name
        FROM alarm_schedules a
        JOIN channels ch ON a.channel_id = ch.id
        WHERE a.id = ?
      `).bind(alarm_schedule_id).first()

      if (alarm) {
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO alarm_logs
            (alarm_id, channel_id, channel_name, receiver_id, msg_type, msg_value, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          alarm_schedule_id,
          alarm.channel_id,
          alarm.channel_name || '알람',
          user.user_id,
          alarm.msg_type || 'youtube',
          alarm.msg_value || '',
          status
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
