// src/routes/channels.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const channels = new Hono<{ Bindings: Bindings }>()

function generatePublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'ch_'
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

// GET /api/channels
channels.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT 
        ch.id, ch.name, ch.description, ch.image_url, ch.owner_id, ch.is_active, ch.created_at,
        COUNT(DISTINCT s.id) as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT il.id) as invite_link_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      LEFT JOIN contents ct ON ch.id = ct.channel_id
      LEFT JOIN channel_invite_links il ON ch.id = il.channel_id AND il.is_active = 1
      GROUP BY ch.id
      ORDER BY ch.created_at DESC
    `).all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/:id
channels.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const channel = await c.env.DB.prepare(`
      SELECT 
        ch.*,
        COUNT(DISTINCT s.id) as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT il.id) as invite_link_count,
        COUNT(DISTINCT nb.id) as batch_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      LEFT JOIN contents ct ON ch.id = ct.channel_id
      LEFT JOIN channel_invite_links il ON ch.id = il.channel_id AND il.is_active = 1
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

// POST /api/channels
channels.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name, description, image_url, owner_id, phone_number, homepage_url } = body

    // owner_id가 없으면 'web_user'로 대체 (모바일 웹 호환)
    const finalOwnerId = owner_id || 'web_user'

    if (!name || !name.trim()) {
      return c.json({ success: false, error: '채널명은 필수입니다' }, 400)
    }
    if (!description || !description.trim()) {
      return c.json({ success: false, error: '채널 소개는 필수입니다' }, 400)
    }

    const publicId = generatePublicId()

    const result = await c.env.DB.prepare(`
      INSERT INTO channels (name, description, image_url, owner_id, public_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name.trim(), description.trim(), image_url || null, finalOwnerId, publicId).run()

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id, name, description, owner_id: finalOwnerId, public_id: publicId }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/channels/:id
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

// DELETE /api/channels/:id
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
