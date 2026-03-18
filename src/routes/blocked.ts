// src/routes/blocked.ts
// 계정 차단 관리 API (관리자 전용)
import { Hono } from 'hono'
import type { Bindings } from '../types'

const blocked = new Hono<{ Bindings: Bindings }>()

// ── DB 초기화 ─────────────────────────────────────────────
let _blockedTableReady = false
async function ensureBlockedTable(db: any) {
  if (_blockedTableReady) return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS blocked_emails (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL UNIQUE,
      reason     TEXT,
      blocked_by TEXT    NOT NULL DEFAULT 'admin',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `).run()
  _blockedTableReady = true
}

// ── GET /api/blocked  목록 조회 ───────────────────────────
blocked.get('/', async (c) => {
  try {
    await ensureBlockedTable(c.env.DB)
    const limit  = Math.min(parseInt(c.req.query('limit') || '50'), 200)
    const offset = parseInt(c.req.query('offset') || '0')
    const q      = (c.req.query('q') || '').trim()

    let where = ''
    const params: any[] = []
    if (q) { where = 'WHERE email LIKE ?'; params.push('%' + q + '%') }

    const rows = await c.env.DB.prepare(
      `SELECT * FROM blocked_emails ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all()

    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM blocked_emails ${where}`
    ).bind(...params).first() as { cnt: number }

    return c.json({ success: true, data: rows.results, total: total?.cnt || 0 })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/blocked  차단 추가 ──────────────────────────
blocked.post('/', async (c) => {
  try {
    await ensureBlockedTable(c.env.DB)
    const body  = await c.req.json() as any
    const email  = (body.email || '').trim().toLowerCase()
    const reason = (body.reason || '').trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ success: false, error: '유효한 이메일을 입력하세요' }, 400)
    }

    // 이미 차단된 이메일인지 확인 (소문자 비교)
    const existing = await c.env.DB.prepare(
      `SELECT id FROM blocked_emails WHERE LOWER(email) = ?`
    ).bind(email).first()
    if (existing) {
      return c.json({ success: false, error: '이미 차단된 이메일입니다' }, 409)
    }

    // 해당 유저 계정도 비활성화 처리
    await c.env.DB.prepare(
      `UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE LOWER(email) = ?`
    ).bind(email).run()

    // 해당 유저 세션 전체 삭제
    const userRow = await c.env.DB.prepare(
      `SELECT user_id FROM users WHERE LOWER(email) = ?`
    ).bind(email).first() as { user_id: string } | null
    if (userRow) {
      await c.env.DB.prepare(
        `DELETE FROM user_sessions WHERE user_id = ?`
      ).bind(userRow.user_id).run()
    }

    await c.env.DB.prepare(
      `INSERT INTO blocked_emails (email, reason) VALUES (?, ?)`
    ).bind(email, reason || null).run()

    return c.json({ success: true, message: `${email} 차단 완료` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── DELETE /api/blocked/:id  차단 해제 ───────────────────
blocked.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))

    // 차단 해제할 이메일 가져오기
    const row = await c.env.DB.prepare(
      `SELECT email FROM blocked_emails WHERE id = ?`
    ).bind(id).first() as { email: string } | null

    if (!row) return c.json({ success: false, error: '차단 항목을 찾을 수 없습니다' }, 404)

    // 계정 다시 활성화
    await c.env.DB.prepare(
      `UPDATE users SET is_active = 1, updated_at = datetime('now') WHERE email = ?`
    ).bind(row.email).run()

    await c.env.DB.prepare(
      `DELETE FROM blocked_emails WHERE id = ?`
    ).bind(id).run()

    return c.json({ success: true, message: `${row.email} 차단 해제 완료` })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/blocked/check?email=  차단 여부 확인 ─────────
// auth.ts 에서 내부적으로 사용하지 않고 직접 DB 조회로 처리
export async function isEmailBlocked(db: any, email: string): Promise<boolean> {
  try {
    await ensureBlockedTable(db)
    const row = await db.prepare(
      `SELECT id FROM blocked_emails WHERE email = ? LIMIT 1`
    ).bind(email.toLowerCase()).first()
    return !!row
  } catch {
    return false  // 오류 시 차단 안 된 것으로 처리 (서비스 중단 방지)
  }
}

export default blocked
