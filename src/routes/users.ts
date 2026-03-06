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
  const search = c.req.query('search') || ''
  const page   = parseInt(c.req.query('page')  || '1')
  const limit  = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

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
    if (search) {
      query += ` WHERE (u.email LIKE ? OR u.display_name LIKE ? OR u.user_id LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const rows = await DB.prepare(query).bind(...params).all()

    let countQuery = `SELECT COUNT(*) as total FROM users`
    const countParams: any[] = []
    if (search) {
      countQuery += ` WHERE (email LIKE ? OR display_name LIKE ? OR user_id LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
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
