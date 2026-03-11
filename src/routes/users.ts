// src/routes/users.ts - 회원 관리 API
import { Hono } from 'hono'
import type { Bindings } from '../types'

const users = new Hono<{ Bindings: Bindings }>()

// 회원 통계 (반드시 /:userId 보다 먼저 등록)
users.get('/stats/summary', async (c) => {
  const { DB } = c.env
  try {
    const total   = await DB.prepare(`SELECT COUNT(*) as cnt FROM users`).first<{ cnt: number }>()
    const active  = await DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE is_active = 1`).first<{ cnt: number }>()
    const hasFcm  = await DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE fcm_token IS NOT NULL`).first<{ cnt: number }>()
    const week    = await DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE created_at >= datetime('now', '-7 days')`).first<{ cnt: number }>()
    return c.json({
      success: true,
      data: {
        total:    total?.cnt   || 0,
        active:   active?.cnt  || 0,
        inactive: (total?.cnt || 0) - (active?.cnt || 0),
        has_fcm:  hasFcm?.cnt  || 0,
        week:     week?.cnt    || 0,
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 목록 조회
users.get('/', async (c) => {
  const { DB } = c.env
  const search    = c.req.query('search') || ''
  const page      = parseInt(c.req.query('page')       || '1')
  const limit     = parseInt(c.req.query('limit')      || '20')
  const offset    = (page - 1) * limit
  const channelId = c.req.query('channel_id') || ''   // 채널별 필터
  const hasFcm    = c.req.query('has_fcm')    || ''   // FCM 있는 회원만
  const excludeChannelId = c.req.query('exclude_channel_id') || '' // 해당 채널 구독자 제외

  try {
    // subscribers 테이블은 is_active 컬럼 사용
    let query = `
      SELECT
        u.id, u.user_id, u.email, u.display_name, u.is_active,
        u.created_at, u.updated_at,
        (u.fcm_token IS NOT NULL) AS has_fcm,
        u.phone_number,
        COUNT(DISTINCT s.id) AS subscribe_count
      FROM users u
      LEFT JOIN subscribers s ON s.user_id = u.user_id AND s.is_active = 1
    `
    const params: any[] = []
    const where: string[] = []

    if (search) {
      where.push(`(u.email LIKE ? OR u.display_name LIKE ? OR u.user_id LIKE ?)`)
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (hasFcm === '1') {
      where.push(`u.fcm_token IS NOT NULL`)
    }
    if (channelId) {
      where.push(`EXISTS (SELECT 1 FROM subscribers sx WHERE sx.user_id = u.user_id AND sx.channel_id = ? AND sx.is_active = 1)`)
      params.push(channelId)
    }
    if (excludeChannelId) {
      where.push(`NOT EXISTS (SELECT 1 FROM subscribers sx WHERE sx.user_id = u.user_id AND sx.channel_id = ? AND sx.is_active = 1)`)
      params.push(excludeChannelId)
    }
    if (where.length) query += ` WHERE ` + where.join(' AND ')
    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const rows = await DB.prepare(query).bind(...params).all()

    let countQuery = `SELECT COUNT(*) as total FROM users u`
    const countParams: any[] = []
    const countWhere: string[] = []
    if (search) {
      countWhere.push(`(u.email LIKE ? OR u.display_name LIKE ? OR u.user_id LIKE ?)`)
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (hasFcm === '1') {
      countWhere.push(`u.fcm_token IS NOT NULL`)
    }
    if (channelId) {
      countWhere.push(`EXISTS (SELECT 1 FROM subscribers sx WHERE sx.user_id = u.user_id AND sx.channel_id = ? AND sx.is_active = 1)`)
      countParams.push(channelId)
    }
    if (excludeChannelId) {
      countWhere.push(`NOT EXISTS (SELECT 1 FROM subscribers sx WHERE sx.user_id = u.user_id AND sx.channel_id = ? AND sx.is_active = 1)`)
      countParams.push(excludeChannelId)
    }
    if (countWhere.length) countQuery += ` WHERE ` + countWhere.join(' AND ')

    const countRow = await DB.prepare(countQuery).bind(...countParams).first<{ total: number }>()
    const total = countRow?.total || 0

    return c.json({
      success: true,
      data: rows.results,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 다중 삭제
users.post('/bulk-delete', async (c) => {
  const { DB } = c.env
  try {
    const { user_ids } = await c.req.json<{ user_ids: string[] }>()
    if (!Array.isArray(user_ids) || user_ids.length === 0)
      return c.json({ success: false, error: 'user_ids 배열이 필요합니다' }, 400)

    let deleted = 0
    for (const uid of user_ids) {
      await DB.prepare(`DELETE FROM users WHERE user_id = ?`).bind(uid).run()
      deleted++
    }
    return c.json({ success: true, deleted })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 상세 조회
users.get('/:userId', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  try {
    const user = await DB.prepare(`
      SELECT id, user_id, email, display_name, is_active, phone_number,
             (fcm_token IS NOT NULL) AS has_fcm, created_at, updated_at
      FROM users WHERE user_id = ?
    `).bind(userId).first()

    if (!user) return c.json({ success: false, error: '회원을 찾을 수 없습니다' }, 404)

    // 구독 채널 목록 (subscribers 테이블 컬럼 정확히 사용)
    const subs = await DB.prepare(`
      SELECT s.id, s.is_active, s.subscribed_at, ch.name AS channel_name, ch.channel_id
      FROM subscribers s
      JOIN channels ch ON ch.id = s.channel_id
      WHERE s.user_id = ?
      ORDER BY s.subscribed_at DESC
    `).bind(userId).all()

    return c.json({
      success: true,
      data: { ...user, subscriptions: subs.results }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 활성/비활성 토글
users.patch('/:userId/toggle', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  try {
    const user = await DB.prepare(`SELECT is_active FROM users WHERE user_id = ?`).bind(userId).first<{ is_active: number }>()
    if (!user) return c.json({ success: false, error: '회원을 찾을 수 없습니다' }, 404)
    const newStatus = user.is_active ? 0 : 1
    await DB.prepare(`UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
      .bind(newStatus, userId).run()
    return c.json({ success: true, is_active: newStatus })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 탈퇴 (본인)
users.delete('/me', async (c) => {
  const { DB } = c.env
  try {
    const { user_id, session_token } = await c.req.json<{ user_id: string; session_token: string }>()
    if (!user_id || !session_token)
      return c.json({ success: false, error: '인증 정보가 필요합니다' }, 400)

    // 세션 검증
    const session = await DB.prepare(
      `SELECT user_id FROM user_sessions WHERE user_id = ? AND session_token = ? AND expires_at > CURRENT_TIMESTAMP`
    ).bind(user_id, session_token).first()
    if (!session) return c.json({ success: false, error: '인증이 유효하지 않습니다' }, 401)

    // 내가 만든 채널 목록 조회
    const myChannels = await DB.prepare(
      `SELECT id FROM channels WHERE owner_id = ?`
    ).bind(user_id).all()

    for (const ch of myChannels.results as { id: number }[]) {
      const chId = ch.id
      // 채널 관련 데이터 삭제
      const batches = await DB.prepare(`SELECT id FROM notification_batches WHERE channel_id = ?`).bind(chId).all()
      for (const b of batches.results as { id: number }[]) {
        await DB.prepare(`DELETE FROM notification_logs WHERE batch_id = ?`).bind(b.id).run()
      }
      await DB.prepare(`DELETE FROM notification_batches WHERE channel_id = ?`).bind(chId).run()
      const alarms = await DB.prepare(`SELECT id FROM alarm_schedules WHERE channel_id = ?`).bind(chId).all()
      for (const a of alarms.results as { id: number }[]) {
        await DB.prepare(`DELETE FROM alarm_logs WHERE alarm_id = ?`).bind(a.id).run()
      }
      await DB.prepare(`DELETE FROM alarm_schedules WHERE channel_id = ?`).bind(chId).run()
      await DB.prepare(`DELETE FROM subscribers WHERE channel_id = ?`).bind(chId).run()
      await DB.prepare(`DELETE FROM contents WHERE channel_id = ?`).bind(chId).run()
      await DB.prepare(`DELETE FROM channel_invite_links WHERE channel_id = ?`).bind(chId).run()
      await DB.prepare(`DELETE FROM channels WHERE id = ?`).bind(chId).run()
    }

    // 내 구독 정보 삭제
    await DB.prepare(`DELETE FROM subscribers WHERE user_id = ?`).bind(user_id).run()
    // 내 알람 로그 삭제
    await DB.prepare(`DELETE FROM alarm_logs WHERE receiver_id = ?`).bind(user_id).run()
    // 세션 삭제
    await DB.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(user_id).run()
    // 회원 삭제
    await DB.prepare(`DELETE FROM users WHERE user_id = ?`).bind(user_id).run()

    return c.json({ success: true, message: '회원탈퇴가 완료되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// 회원 단건 삭제
users.delete('/:userId', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  try {
    const user = await DB.prepare(`SELECT id FROM users WHERE user_id = ?`).bind(userId).first()
    if (!user) return c.json({ success: false, error: '회원을 찾을 수 없습니다' }, 404)
    await DB.prepare(`DELETE FROM users WHERE user_id = ?`).bind(userId).run()
    return c.json({ success: true, message: '회원이 삭제되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default users
