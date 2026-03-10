// src/routes/settings.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const settings = new Hono<{ Bindings: Bindings }>()

// GET /api/settings/:key - 설정값 조회 (앱용)
settings.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const row = await c.env.DB.prepare(
      'SELECT value, updated_at FROM app_settings WHERE key = ?'
    ).bind(key).first()
    if (!row) return c.json({ success: false, error: '설정을 찾을 수 없습니다' }, 404)
    return c.json({ success: true, data: row })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/settings/:key - 설정값 저장 (관리자용)
settings.put('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const { value } = await c.req.json()
    if (value === undefined || value === null) return c.json({ success: false, error: 'value는 필수입니다' }, 400)
    await c.env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run()
    return c.json({ success: true, message: '설정이 저장되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default settings
