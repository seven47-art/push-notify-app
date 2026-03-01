// src/routes/channels.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const channels = new Hono<{ Bindings: Bindings }>()

// GET /api/channels - 채널 목록 조회
channels.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT 
        ch.*,
        COUNT(DISTINCT s.id) as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      LEFT JOIN contents ct ON ch.id = ct.channel_id
      GROUP BY ch.id
      ORDER BY ch.created_at DESC
    `).all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/:id - 채널 상세 조회
channels.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const channel = await c.env.DB.prepare(`
      SELECT 
        ch.*,
        COUNT(DISTINCT s.id) as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT nb.id) as batch_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      LEFT JOIN contents ct ON ch.id = ct.channel_id
      LEFT JOIN notification_batches nb ON ch.id = nb.channel_id
      WHERE ch.id = ?
      GROUP BY ch.id
    `).bind(id).first()
    
    if (!channel) return c.json({ success: false, error: 'Channel not found' }, 404)
    return c.json({ success: true, data: channel })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/channels - 채널 생성
channels.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, description, image_url, owner_id } = body
    
    if (!name || !owner_id) {
      return c.json({ success: false, error: 'name and owner_id are required' }, 400)
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO channels (name, description, image_url, owner_id)
      VALUES (?, ?, ?, ?)
    `).bind(name, description || null, image_url || null, owner_id).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id, name, description, owner_id } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/channels/:id - 채널 수정
channels.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { name, description, image_url, is_active } = body
    
    await c.env.DB.prepare(`
      UPDATE channels 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name || null, description || null, image_url || null, is_active ?? null, id).run()
    
    return c.json({ success: true, message: 'Channel updated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/channels/:id - 채널 삭제
channels.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM channels WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Channel deleted' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default channels
