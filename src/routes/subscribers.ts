// src/routes/subscribers.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const subscribers = new Hono<{ Bindings: Bindings }>()

// GET /api/subscribers?channel_id=X&user_id=Y - 구독자/가입채널 목록 조회
subscribers.get('/', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    const userId    = c.req.query('user_id')

    let query = `
      SELECT s.id, s.channel_id, s.user_id, s.display_name, s.fcm_token, s.platform,
             s.is_active, s.subscribed_at, s.accepted_count, s.rejected_count,
             ch.name as channel_name, ch.description as channel_description,
             ch.image_url, ch.owner_id, ch.is_secret,
             il.label as invite_label, il.invite_token as invite_token,
             u.email as email,
             (SELECT COUNT(*) FROM subscribers s2 WHERE s2.channel_id = ch.id AND s2.is_active = 1) as subscriber_count
      FROM subscribers s
      JOIN channels ch ON s.channel_id = ch.id
      LEFT JOIN channel_invite_links il ON s.joined_via_invite_id = il.id
      LEFT JOIN users u ON s.user_id = u.user_id
      WHERE s.is_active = 1
    `
    const params: any[] = []

    if (channelId) {
      query += ' AND s.channel_id = ?'
      params.push(channelId)
    }
    if (userId) {
      query += ' AND s.user_id = ?'
      params.push(userId)
    }
    query += ' ORDER BY s.subscribed_at DESC'

    const stmt = c.env.DB.prepare(query)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/subscribers/register - Flutter 앱에서 구독 등록 (FCM 토큰 등록)
subscribers.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, user_id, display_name, fcm_token, platform } = body
    
    if (!channel_id || !user_id || !fcm_token || !platform) {
      return c.json({ success: false, error: 'channel_id, user_id, fcm_token, platform are required' }, 400)
    }
    
    // UPSERT: 이미 존재하면 FCM 토큰과 활성 상태 업데이트
    await c.env.DB.prepare(`
      INSERT INTO subscribers (channel_id, user_id, display_name, fcm_token, platform)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel_id, user_id) DO UPDATE SET
        fcm_token = excluded.fcm_token,
        display_name = COALESCE(excluded.display_name, display_name),
        is_active = 1,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(channel_id, user_id, display_name || null, fcm_token, platform).run()
    
    return c.json({ success: true, message: 'Subscriber registered successfully' }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/subscribers/:id/token - FCM 토큰 갱신
subscribers.put('/:id/token', async (c) => {
  try {
    const id = c.req.param('id')
    const { fcm_token } = await c.req.json()
    
    if (!fcm_token) return c.json({ success: false, error: 'fcm_token is required' }, 400)
    
    await c.env.DB.prepare(`
      UPDATE subscribers SET fcm_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(fcm_token, id).run()
    
    return c.json({ success: true, message: 'FCM token updated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/subscribers/leave?user_id=X&channel_id=Y - 채널 나가기 (user+channel 기반, /:id 보다 먼저 등록)
subscribers.delete('/leave', async (c) => {
  try {
    const userId    = c.req.query('user_id')
    const channelId = c.req.query('channel_id')
    if (!userId || !channelId) {
      return c.json({ success: false, error: 'user_id and channel_id are required' }, 400)
    }
    await c.env.DB.prepare(`
      UPDATE subscribers SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND channel_id = ?
    `).bind(userId, channelId).run()
    // 해당 채널의 수신함 alarm_logs 삭제
    await c.env.DB.prepare(`
      DELETE FROM alarm_logs WHERE receiver_id = ? AND channel_id = ?
    `).bind(userId, channelId).run()
    return c.json({ success: true, message: 'Left channel successfully' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/subscribers/force - 관리자: 구독자 강제 채널 탈퇴 (/:id 보다 먼저 등록)
subscribers.delete('/force', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, user_ids } = body
    if (!channel_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return c.json({ success: false, error: 'channel_id, user_ids 필수' }, 400)
    }
    let removed = 0
    for (const user_id of user_ids) {
      await c.env.DB.prepare(`
        UPDATE subscribers SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE channel_id = ? AND user_id = ?
      `).bind(channel_id, user_id).run()
      removed++
    }
    return c.json({ success: true, removed })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/subscribers/:id - 구독자 완전 삭제 (subscriber row id)
subscribers.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`
      DELETE FROM subscribers WHERE id = ?
    `).bind(id).run()
    return c.json({ success: true, message: 'Subscriber deleted' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/subscribers/bulk-delete - 구독자 일괄 삭제
subscribers.post('/bulk-delete', async (c) => {
  try {
    const { ids } = await c.req.json<{ ids: number[] }>()
    if (!Array.isArray(ids) || ids.length === 0)
      return c.json({ success: false, error: 'ids 배열이 필요합니다' }, 400)

    let deleted = 0
    for (const id of ids) {
      await c.env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run()
      deleted++
    }
    return c.json({ success: true, deleted })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/subscribers/force - 관리자: 회원을 채널에 강제 구독
subscribers.post('/force', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, user_ids } = body
    if (!channel_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return c.json({ success: false, error: 'channel_id, user_ids 필수' }, 400)
    }
    let added = 0
    for (const user_id of user_ids) {
      // users 테이블에서 fcm_token, display_name 조회
      const user = await c.env.DB.prepare(
        'SELECT user_id, display_name, fcm_token FROM users WHERE user_id = ?'
      ).bind(user_id).first<{ user_id: string; display_name: string; fcm_token: string }>()
      if (!user) continue
      // UPSERT: 이미 존재하면 is_active=1로 재활성화
      await c.env.DB.prepare(`
        INSERT INTO subscribers (channel_id, user_id, display_name, fcm_token, platform)
        VALUES (?, ?, ?, ?, 'android')
        ON CONFLICT(channel_id, user_id) DO UPDATE SET
          is_active = 1,
          fcm_token = COALESCE(excluded.fcm_token, fcm_token),
          display_name = COALESCE(excluded.display_name, display_name),
          updated_at = CURRENT_TIMESTAMP
      `).bind(channel_id, user.user_id, user.display_name || null, user.fcm_token || '').run()
      added++
    }
    return c.json({ success: true, added })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/subscribers/force - 관리자: 구독자 강제 채널 탈퇴
// (위에서 이미 등록됨 - 이 위치의 중복 제거)

// POST /api/subscribers/action - Flutter 앱에서 수락/거절 이벤트 기록
subscribers.post('/action', async (c) => {
  try {
    const body = await c.req.json()
    const { batch_id, subscriber_id, action } = body
    
    if (!batch_id || !subscriber_id || !action) {
      return c.json({ success: false, error: 'batch_id, subscriber_id, action are required' }, 400)
    }
    
    if (!['accepted', 'rejected'].includes(action)) {
      return c.json({ success: false, error: 'action must be accepted or rejected' }, 400)
    }
    
    // 알림 로그 상태 업데이트
    await c.env.DB.prepare(`
      UPDATE notification_logs 
      SET status = ?, action_at = CURRENT_TIMESTAMP
      WHERE batch_id = ? AND subscriber_id = ?
    `).bind(action, batch_id, subscriber_id).run()
    
    // 배치 통계 업데이트
    if (action === 'accepted') {
      await c.env.DB.prepare(`
        UPDATE notification_batches SET accepted_count = accepted_count + 1 WHERE id = ?
      `).bind(batch_id).run()
      await c.env.DB.prepare(`
        UPDATE subscribers SET accepted_count = accepted_count + 1, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(subscriber_id).run()
    } else {
      await c.env.DB.prepare(`
        UPDATE notification_batches SET rejected_count = rejected_count + 1 WHERE id = ?
      `).bind(batch_id).run()
      await c.env.DB.prepare(`
        UPDATE subscribers SET rejected_count = rejected_count + 1 WHERE id = ?
      `).bind(subscriber_id).run()
    }
    
    return c.json({ success: true, message: `Action ${action} recorded` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default subscribers
