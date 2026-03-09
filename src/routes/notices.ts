// src/routes/notices.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const notices = new Hono<{ Bindings: Bindings }>()

// GET /api/notices - 공지사항 목록 (앱용: is_active=1만)
notices.get('/', async (c) => {
  try {
    const all = c.req.query('all') === '1' // 관리자용: 전체 조회
    const query = all
      ? 'SELECT * FROM notices ORDER BY created_at DESC'
      : 'SELECT * FROM notices WHERE is_active = 1 ORDER BY created_at DESC'
    const { results } = await c.env.DB.prepare(query).all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/notices/:id - 공지사항 상세
notices.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const notice = await c.env.DB.prepare(
      'SELECT * FROM notices WHERE id = ?'
    ).bind(id).first()
    if (!notice) return c.json({ success: false, error: '공지사항을 찾을 수 없습니다' }, 404)
    return c.json({ success: true, data: notice })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/notices - 공지사항 생성 (관리자용)
notices.post('/', async (c) => {
  try {
    const { title, content, is_active } = await c.req.json()
    if (!title?.trim()) return c.json({ success: false, error: '제목은 필수입니다' }, 400)
    if (!content?.trim()) return c.json({ success: false, error: '내용은 필수입니다' }, 400)

    const result = await c.env.DB.prepare(
      'INSERT INTO notices (title, content, is_active) VALUES (?, ?, ?)'
    ).bind(title.trim(), content.trim(), is_active ?? 1).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id, title, content } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/notices/:id - 공지사항 수정 (관리자용)
notices.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { title, content, is_active } = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE notices
      SET title = COALESCE(?, title),
          content = COALESCE(?, content),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(title || null, content || null, is_active ?? null, id).run()

    return c.json({ success: true, message: '공지사항이 수정되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/notices/:id - 공지사항 삭제 (관리자용)
notices.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: '공지사항이 삭제되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default notices
