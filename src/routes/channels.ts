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

// GET /api/channels  (owner_id, search 파라미터로 필터 가능)
channels.get('/', async (c) => {
  try {
    const ownerId = c.req.query('owner_id')
    const search  = c.req.query('search')?.trim()   // 채널명 검색어
    const params: (string)[] = []

    let where = 'WHERE ch.is_active = 1'
    if (ownerId) {
      where += ' AND ch.owner_id = ?'
      params.push(ownerId)
    }
    if (search) {
      where += ' AND ch.name LIKE ?'
      params.push('%' + search + '%')
    }

    const query = `
      SELECT
        ch.id, ch.name, ch.description, ch.image_url, ch.owner_id, ch.is_active, ch.created_at,
        COUNT(DISTINCT s.id)  as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT il.id) as invite_link_count
      FROM channels ch
      LEFT JOIN subscribers s  ON ch.id = s.channel_id  AND s.is_active = 1
      LEFT JOIN contents ct    ON ch.id = ct.channel_id
      LEFT JOIN channel_invite_links il ON ch.id = il.channel_id AND il.is_active = 1
      ${where}
      GROUP BY ch.id
      ORDER BY ch.created_at DESC
    `

    const stmt = c.env.DB.prepare(query)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()
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
    const { name: rawName, channel_name, description, image_url, owner_id, phone_number, homepage_url } = body

    // Flutter는 channel_name, 웹은 name으로 전송 — 둘 다 수용
    const name = rawName || channel_name

    // owner_id가 없으면 'web_user'로 대체 (모바일 웹 호환)
    const finalOwnerId = owner_id || 'web_user'

    if (!name || !name.trim()) {
      return c.json({ success: false, error: '채널명은 필수입니다' }, 400)
    }
    if (!description || !description.trim()) {
      return c.json({ success: false, error: '채널 소개는 필수입니다' }, 400)
    }

    // image_url이 너무 크면 null 처리 (D1 SQLITE_TOOBIG 방지, 한도 800KB)
    const safeImageUrl = (image_url && image_url.length <= 819200) ? image_url : null
    if (image_url && !safeImageUrl) {
      return c.json({ success: false, error: '이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.' }, 400)
    }

    const publicId = generatePublicId()

    const result = await c.env.DB.prepare(`
      INSERT INTO channels (name, description, image_url, owner_id, public_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name.trim(), description.trim(), safeImageUrl || null, finalOwnerId, publicId).run()

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
    const { name, description, image_url, is_active, homepage_url } = body

    // image_url이 너무 크면 에러 반환 (D1 SQLITE_TOOBIG 방지, 한도 800KB)
    if (image_url && image_url.length > 819200) {
      return c.json({ success: false, error: '이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.' }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE channels 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          homepage_url = COALESCE(?, homepage_url),
          is_active = COALESCE(?, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name || null, description || null, image_url || null, homepage_url || null, is_active ?? null, id).run()

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
