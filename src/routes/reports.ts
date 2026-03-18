// src/routes/reports.ts
// 채널 신고 API
import { Hono } from 'hono'
import type { Bindings } from '../types'

const reports = new Hono<{ Bindings: Bindings }>()

// ── 세션 검증 헬퍼 ────────────────────────────────────────
async function getSessionUser(c: any): Promise<{ userId: string; displayName: string } | null> {
  const auth = c.req.header('Authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  const row = await c.env.DB.prepare(`
    SELECT s.user_id, u.display_name
    FROM user_sessions s
    JOIN users u ON s.user_id = u.user_id
    WHERE s.session_token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).bind(token).first() as { user_id: string; display_name: string } | null
  if (!row) return null
  return { userId: row.user_id, displayName: row.display_name }
}

// ── DB 초기화: reports 테이블 생성 ────────────────────────
async function ensureReportsTable(db: any) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type   TEXT    NOT NULL DEFAULT 'channel',
      reason        TEXT    NOT NULL,
      description   TEXT,
      status        TEXT    NOT NULL DEFAULT 'pending',
      channel_id    INTEGER,
      channel_name  TEXT,
      alarm_id      INTEGER,
      alarm_title   TEXT,
      alarm_preview TEXT,
      reporter_id   TEXT    NOT NULL,
      reporter_name TEXT,
      target_user_id   TEXT,
      target_user_name TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `).run()
}

// ── POST /api/reports  ─────────────────────────────────────
// Body: { report_type, reason, description?, channel_id?, channel_name?,
//         alarm_id?, alarm_title?, alarm_preview?,
//         target_user_id?, target_user_name? }
reports.post('/', async (c) => {
  try {
    await ensureReportsTable(c.env.DB)

    const user = await getSessionUser(c)
    if (!user) return c.json({ success: false, error: '로그인이 필요합니다' }, 401)

    const body = await c.req.json() as any
    const { report_type = 'channel', reason, description = '',
            channel_id, channel_name, alarm_id, alarm_title, alarm_preview,
            target_user_id = '', target_user_name = '' } = body

    // 유효성 검사
    const allowedReasons = [
      '불법 광고 / 스팸', '사기 / 피싱', '음란 / 선정적 콘텐츠',
      '괴롭힘 / 혐오', '저작권 / 도용 의심', '기타'
    ]
    if (!reason || !allowedReasons.includes(reason)) {
      return c.json({ success: false, error: '신고 사유를 선택해 주세요' }, 400)
    }

    // 중복 신고 방지: 같은 reporter + channel_id + reason 조합, 24시간 내
    if (channel_id) {
      const dup = await c.env.DB.prepare(`
        SELECT id FROM reports
        WHERE reporter_id = ? AND channel_id = ? AND reason = ?
          AND created_at > datetime('now', '-24 hours')
        LIMIT 1
      `).bind(user.userId, channel_id, reason).first()
      if (dup) return c.json({ success: false, error: '동일한 사유로 이미 신고하셨습니다. 24시간 후 다시 신고할 수 있습니다.' }, 429)
    }

    await c.env.DB.prepare(`
      INSERT INTO reports
        (report_type, reason, description, status,
         channel_id, channel_name, alarm_id, alarm_title, alarm_preview,
         reporter_id, reporter_name, target_user_id, target_user_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      report_type, reason, description || null, 'pending',
      channel_id || null, channel_name || null,
      alarm_id || null, alarm_title || null, alarm_preview || null,
      user.userId, user.displayName || user.userId,
      target_user_id || null, target_user_name || null
    ).run()

    return c.json({ success: true, message: '신고가 접수되었습니다.' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports  (관리자 전용) ───────────────────────
reports.get('/', async (c) => {
  try {
    await ensureReportsTable(c.env.DB)

    // 쿼리 파라미터
    const status = c.req.query('status') || ''
    const type   = c.req.query('type')   || ''
    const limit  = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const offset = parseInt(c.req.query('offset') || '0')

    let where = 'WHERE 1=1'
    const binds: any[] = []
    if (status) { where += ' AND status = ?'; binds.push(status) }
    if (type)   { where += ' AND report_type = ?'; binds.push(type) }

    const rows = await c.env.DB.prepare(
      `SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all()

    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM reports ${where}`
    ).bind(...binds).first() as { cnt: number }

    return c.json({ success: true, data: rows.results, total: total?.cnt || 0 })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── PATCH /api/reports/:id  신고 상태 변경 (관리자 전용) ──
reports.patch('/:id', async (c) => {
  try {
    const id     = parseInt(c.req.param('id'))
    const body   = await c.req.json() as any
    const status = body.status // pending | reviewing | resolved | dismissed

    const allowed = ['pending', 'reviewing', 'resolved', 'dismissed']
    if (!allowed.includes(status)) return c.json({ success: false, error: '유효하지 않은 상태값' }, 400)

    await c.env.DB.prepare(
      `UPDATE reports SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(status, id).run()

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default reports
