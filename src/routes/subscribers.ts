// src/routes/subscribers.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const subscribers = new Hono<{ Bindings: Bindings }>()

// GET /api/subscribers?channel_id=X - 구독자 목록 조회
subscribers.get('/', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    let query = `
      SELECT s.*, ch.name as channel_name,
             il.label as invite_label, il.invite_token as invite_token
      FROM subscribers s
      JOIN channels ch ON s.channel_id = ch.id
      LEFT JOIN channel_invite_links il ON s.joined_via_invite_id = il.id
    `
    const params: any[] = []
    if (channelId) {
      query += ' WHERE s.channel_id = ?'
      params.push(channelId)
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

// DELETE /api/subscribers/:id - 구독 취소
subscribers.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(`
      UPDATE subscribers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()
    return c.json({ success: true, message: 'Subscription cancelled' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

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
