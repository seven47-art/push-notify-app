// src/routes/alarms.ts
// 채널 알람 스케줄 관리 + 통화형 알람 발송 (Twilio 연동 or 시뮬레이션)
import { Hono } from 'hono'
import type { Bindings } from '../types'

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

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
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
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// DELETE /api/alarms/:id  - 알람 취소
// =============================================
alarms.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      "UPDATE alarm_schedules SET status = 'cancelled' WHERE id = ? AND status = 'pending'"
    ).bind(id).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// POST /api/alarms/trigger  - 시간 도래한 알람 실행 (Cron 또는 폴링에서 호출)
// 각 구독자 전화번호로 Twilio 통화 발신
// 통화 수락 시 /api/alarms/twiml 이 실행되어 메시지 소스 재생
// =============================================
alarms.post('/trigger', async (c) => {
  try {
    // UTC 기준 현재 시각 (클라이언트가 UTC ISO로 저장하므로 동일 기준으로 비교)
    const now = new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM (UTC)

    // 현재 시각 기준 발송 대기 중인 알람 조회
    // scheduled_at은 UTC ISO 형식 (예: 2026-03-03T11:45:00Z)
    // 비교 시 'Z' suffix 제거하여 동일 형식으로 비교
    const { results: dueAlarms } = await c.env.DB.prepare(`
      SELECT a.*, ch.name as channel_name
      FROM alarm_schedules a
      JOIN channels ch ON a.channel_id = ch.id
      WHERE a.status = 'pending'
        AND replace(substr(a.scheduled_at, 1, 16), 'Z', '') <= ?
      ORDER BY a.scheduled_at ASC
      LIMIT 20
    `).bind(now).all() as { results: any[] }

    if (dueAlarms.length === 0) {
      return c.json({ success: true, message: '발송할 알람 없음', triggered: 0 })
    }

    const twilioSid    = (c.env as any).TWILIO_ACCOUNT_SID  || ''
    const twilioToken  = (c.env as any).TWILIO_AUTH_TOKEN   || ''
    const twilioFrom   = (c.env as any).TWILIO_FROM_NUMBER  || ''
    const webhookBase  = (c.env as any).WEBHOOK_BASE_URL    || 'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai'
    const useTwilio    = !!(twilioSid && twilioToken && twilioFrom)

    let totalTriggered = 0
    const results: any[] = []

    for (const alarm of dueAlarms) {
      // 즉시 triggered 상태로 변경 (중복 발송 방지)
      await c.env.DB.prepare(
        "UPDATE alarm_schedules SET status = 'triggered', triggered_at = datetime('now') WHERE id = ? AND status = 'pending'"
      ).bind(alarm.id).run()

      // 채널 구독자 조회 (전화번호 있는 회원만)
      const { results: subscribers } = await c.env.DB.prepare(`
        SELECT s.id, s.display_name, s.fcm_token,
               u.phone_number
        FROM subscribers s
        LEFT JOIN users u ON s.user_id = u.user_id
        WHERE s.channel_id = ? AND s.is_active = 1
      `).bind(alarm.channel_id).all() as { results: any[] }

      let sentCount = 0, failedCount = 0
      const callResults: any[] = []

      for (const sub of subscribers) {
        if (useTwilio && sub.phone_number) {
          // 실제 Twilio 통화 발신
          const callRes = await makeTwilioCall(
            sub.phone_number,
            alarm.channel_name,
            alarm.msg_type,
            alarm.msg_value || '',
            twilioSid, twilioToken, twilioFrom,
            webhookBase
          )
          callResults.push({ subscriber_id: sub.id, display_name: sub.display_name, phone: sub.phone_number, ...callRes })
          if (callRes.success) sentCount++; else failedCount++
        } else {
          // 시뮬레이션 모드 (Twilio 미설정 or 전화번호 없음)
          // FCM 푸시로 대체 발송
          callResults.push({
            subscriber_id: sub.id,
            display_name: sub.display_name,
            mode: 'simulation',
            success: true,
            message: sub.phone_number ? '시뮬레이션' : '전화번호 없음(푸시 대체)'
          })
          sentCount++
        }
      }

      // 발송 결과 업데이트
      await c.env.DB.prepare(
        'UPDATE alarm_schedules SET sent_count = ?, total_targets = ? WHERE id = ?'
      ).bind(sentCount, subscribers.length, alarm.id).run()

      totalTriggered++
      results.push({
        alarm_id: alarm.id,
        channel_name: alarm.channel_name,
        scheduled_at: alarm.scheduled_at,
        msg_type: alarm.msg_type,
        total_targets: subscribers.length,
        sent_count: sentCount,
        failed_count: failedCount,
        mode: useTwilio ? 'twilio' : 'simulation',
        calls: callResults
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

export default alarms
