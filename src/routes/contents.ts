// src/routes/contents.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const contents = new Hono<{ Bindings: Bindings }>()

// GET /api/contents?channel_id=X - 콘텐츠 목록 조회
contents.get('/', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    let query = `
      SELECT ct.*, ch.name as channel_name
      FROM contents ct
      JOIN channels ch ON ct.channel_id = ch.id
    `
    const params: any[] = []
    if (channelId) {
      query += ' WHERE ct.channel_id = ?'
      params.push(channelId)
    }
    query += ' ORDER BY ct.created_at DESC'
    
    const stmt = c.env.DB.prepare(query)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/contents/:id - 콘텐츠 상세 조회
contents.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const content = await c.env.DB.prepare(`
      SELECT ct.*, ch.name as channel_name
      FROM contents ct
      JOIN channels ch ON ct.channel_id = ch.id
      WHERE ct.id = ?
    `).bind(id).first()
    
    if (!content) return c.json({ success: false, error: 'Content not found' }, 404)
    return c.json({ success: true, data: content })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/contents - 콘텐츠 등록
contents.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, title, description, content_type, content_url, thumbnail_url, duration_seconds, metadata, created_by } = body
    
    if (!channel_id || !title || !content_type || !content_url || !created_by) {
      return c.json({ success: false, error: 'channel_id, title, content_type, content_url, created_by are required' }, 400)
    }
    
    const validTypes = ['audio', 'video', 'youtube', 'file']
    if (!validTypes.includes(content_type)) {
      return c.json({ success: false, error: 'content_type must be audio, video, youtube, or file' }, 400)
    }

    // ★ audio/video/file 타입은 mp3/mp4 확장자만 허용
    if (['audio', 'video', 'file'].includes(content_type) && content_url) {
      const urlLower = content_url.toLowerCase().split('?')[0]
      if (!urlLower.endsWith('.mp3') && !urlLower.endsWith('.mp4')) {
        return c.json({ success: false, error: '파일은 mp3, mp4 형식만 허용됩니다' }, 400)
      }
    }
    
    // youtube URL에서 자동으로 youtube_id 추출
    let finalMetadata = metadata
    if (content_type === 'youtube' && content_url) {
      const youtubeMatch = content_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)
      if (youtubeMatch) {
        const existingMeta = metadata ? JSON.parse(metadata) : {}
        finalMetadata = JSON.stringify({ ...existingMeta, youtube_id: youtubeMatch[1] })
      }
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO contents (channel_id, title, description, content_type, content_url, thumbnail_url, duration_seconds, metadata, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      channel_id, title, description || null, content_type, content_url,
      thumbnail_url || null, duration_seconds || null, finalMetadata || null, created_by
    ).run()
    
    return c.json({ 
      success: true, 
      data: { id: result.meta.last_row_id, channel_id, title, content_type, content_url } 
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/contents/:id - 콘텐츠 수정
contents.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { title, description, content_url, thumbnail_url, duration_seconds } = body
    
    await c.env.DB.prepare(`
      UPDATE contents 
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          content_url = COALESCE(?, content_url),
          thumbnail_url = COALESCE(?, thumbnail_url),
          duration_seconds = COALESCE(?, duration_seconds),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(title || null, description || null, content_url || null, thumbnail_url || null, duration_seconds || null, id).run()
    
    return c.json({ success: true, message: 'Content updated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/contents/:id - 콘텐츠 삭제
contents.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM contents WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Content deleted' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// GET /api/contents/stream/:filename - 알람 파일 스트리밍
// Flutter 앱에서 오디오/비디오 파일을 직접 재생할 수 있도록 콘텐츠 URL 반환
// =============================================
contents.get('/stream/:filename', async (c) => {
  try {
    const filename = decodeURIComponent(c.req.param('filename'))

    // DB에서 파일명으로 콘텐츠 검색
    const content: any = await c.env.DB.prepare(`
      SELECT id, content_url, content_type, title
      FROM contents
      WHERE content_url LIKE ?
         OR content_url = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(`%${filename}%`, filename).first()

    if (!content) {
      return c.json({ success: false, error: '파일을 찾을 수 없습니다' }, 404)
    }

    // content_url이 외부 URL이면 리다이렉트
    if (content.content_url && content.content_url.startsWith('http')) {
      return c.redirect(content.content_url, 302)
    }

    return c.json({
      success: true,
      content_url: content.content_url,
      content_type: content.content_type,
      title: content.title
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default contents
