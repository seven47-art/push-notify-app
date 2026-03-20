// src/routes/users.ts - 회원 관리 API
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { sendFCMDataMessage, sendFCMMulticast } from './fcm'

// ── FCM force_logout 전송 헬퍼 ──────────────────────────────
async function sendForceLogout(db: any, env: any, userId: string) {
  try {
    const userRow = await db.prepare(
      `SELECT fcm_token FROM users WHERE user_id = ?`
    ).bind(userId).first() as { fcm_token: string | null } | null
    const fcmToken = userRow?.fcm_token
    if (!fcmToken) return
    const serviceAccount = (env as any).FCM_SERVICE_ACCOUNT_JSON || ''
    const projectId      = (env as any).FCM_PROJECT_ID           || ''
    if (!serviceAccount || !projectId) return
    await sendFCMDataMessage(
      fcmToken,
      { action: 'force_logout', reason: 'deleted' },
      serviceAccount,
      projectId
    )
  } catch (_) { /* FCM 실패해도 삭제 계속 진행 */ }
}

// ── 회원 1명 완전 삭제 (채널·구독자 알람 포함) ──────────────
// sendForceLogout: true = 관리자 삭제/차단 시 본인 기기에 force_logout 전송
//                 false = 자발적 탈퇴 (앱에서 직접 로그아웃하므로 FCM 불필요)
async function deleteUserFully(db: any, env: any, userId: string, sendForceLogoutFcm = true) {
  const serviceAccount = (env as any).FCM_SERVICE_ACCOUNT_JSON || ''
  const projectId      = (env as any).FCM_PROJECT_ID           || ''

  // 1. FCM force_logout 전송 (관리자 삭제 시에만)
  if (sendForceLogoutFcm) {
    await sendForceLogout(db, env, userId)
  }

  // 2. 운영 채널 목록 조회
  const myChannels = await db.prepare(
    `SELECT id FROM channels WHERE owner_id = ?`
  ).bind(userId).all()

  for (const ch of (myChannels.results as { id: number }[])) {
    const chId = ch.id

    // 3a. 이 채널 구독자들의 FCM 토큰 수집 → channel_deleted 전송
    const subRows = await db.prepare(
      `SELECT COALESCE(s.fcm_token, u.fcm_token) as fcm_token
       FROM subscribers s
       LEFT JOIN users u ON u.user_id = s.user_id
       WHERE s.channel_id = ? AND COALESCE(s.fcm_token, u.fcm_token) IS NOT NULL`
    ).bind(chId).all()
    const subTokens = (subRows.results as { fcm_token: string }[])
      .map(r => r.fcm_token).filter(Boolean)

    if (subTokens.length > 0 && serviceAccount && projectId) {
      try {
        await sendFCMMulticast(
          subTokens,
          { action: 'channel_deleted', channel_id: String(chId) },
          serviceAccount,
          projectId
        )
      } catch (_) { /* FCM 실패해도 DB 삭제 계속 */ }
    }

    // 3b. 채널 관련 DB 데이터 삭제
    const batches = await db.prepare(
      `SELECT id FROM notification_batches WHERE channel_id = ?`
    ).bind(chId).all()
    for (const b of (batches.results as { id: number }[])) {
      await db.prepare(`DELETE FROM notification_logs WHERE batch_id = ?`).bind(b.id).run()
    }
    await db.prepare(`DELETE FROM notification_batches WHERE channel_id = ?`).bind(chId).run()

    // 구독자 alarm_logs 삭제 (수신함에서 제거)
    const alarmSchedules = await db.prepare(
      `SELECT id FROM alarm_schedules WHERE channel_id = ?`
    ).bind(chId).all()
    for (const a of (alarmSchedules.results as { id: number }[])) {
      await db.prepare(`DELETE FROM alarm_logs WHERE alarm_id = ?`).bind(a.id).run()
    }
    await db.prepare(`DELETE FROM alarm_schedules WHERE channel_id = ?`).bind(chId).run()
    await db.prepare(`DELETE FROM subscribers WHERE channel_id = ?`).bind(chId).run()
    await db.prepare(`DELETE FROM contents WHERE channel_id = ?`).bind(chId).run()
    await db.prepare(`DELETE FROM channel_invite_links WHERE channel_id = ?`).bind(chId).run()
    await db.prepare(`DELETE FROM channels WHERE id = ?`).bind(chId).run()
  }

  // 4. 삭제 회원 본인의 구독 정보 삭제 (다른 채널 구독)
  await db.prepare(`DELETE FROM subscribers WHERE user_id = ?`).bind(userId).run()
  // 5. 삭제 회원 본인의 alarm_logs 삭제 (수신함 + 발신함)
  await db.prepare(`DELETE FROM alarm_logs WHERE receiver_id = ?`).bind(userId).run()
  await db.prepare(`DELETE FROM alarm_logs WHERE sender_id = ?`).bind(userId).run()
  // 6. 세션 삭제
  await db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(userId).run()
  // 7. 회원 삭제
  await db.prepare(`DELETE FROM users WHERE user_id = ?`).bind(userId).run()
}

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
        COUNT(DISTINCT s.id) AS subscribe_count,
        CASE WHEN b.email IS NOT NULL THEN 1 ELSE 0 END AS is_blocked
      FROM users u
      LEFT JOIN subscribers s ON s.user_id = u.user_id AND s.is_active = 1
      LEFT JOIN blocked_emails b ON LOWER(b.email) = LOWER(u.email)
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
      await deleteUserFully(DB, c.env, uid)
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

    // deleteUserFully 사용: 채널 구독자 FCM(channel_deleted) 전송 포함
    // sendForceLogoutFcm=false: 자발적 탈퇴이므로 본인 기기 force_logout 불필요
    await deleteUserFully(DB, c.env, user_id, false)

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
    await deleteUserFully(DB, c.env, userId)
    return c.json({ success: true, message: '회원이 삭제되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default users
