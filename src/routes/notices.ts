// src/routes/notices.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const notices = new Hono<{ Bindings: Bindings }>()

// ── Firebase Storage OAuth2 액세스 토큰 (uploads.ts 동일 로직) ──
async function getStorageToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }
  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const input = `${enc(header)}.${enc(payload)}`
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)).buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  ))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${sig}` }),
  })
  const data: any = await res.json()
  if (!data.access_token) throw new Error('Storage 액세스 토큰 획득 실패')
  return data.access_token
}

// GET /api/notices - 공지사항 목록
notices.get('/', async (c) => {
  try {
    const all    = c.req.query('all') === '1'
    const limit  = Math.min(Number(c.req.query('limit')  || 20), 100)
    const offset = Number(c.req.query('offset') || 0)
    const where = all ? '' : 'WHERE is_active = 1'
    const countResult = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM notices ${where}`).first() as any
    const total = countResult?.total || 0
    const query = all
      ? `SELECT * FROM notices ORDER BY created_at DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM notices WHERE is_active = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?`
    const { results } = await c.env.DB.prepare(query).bind(limit, offset).all()
    return c.json({ success: true, data: results, total, hasMore: offset + limit < total })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/notices/:id - 공지사항 상세
notices.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const notice = await c.env.DB.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first()
    if (!notice) return c.json({ success: false, error: '공지사항을 찾을 수 없습니다' }, 404)
    return c.json({ success: true, data: notice })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/notices - 공지사항 생성
notices.post('/', async (c) => {
  try {
    const { title, content, is_active, image_url } = await c.req.json()
    if (!title?.trim()) return c.json({ success: false, error: '제목은 필수입니다' }, 400)
    if (!content?.trim()) return c.json({ success: false, error: '내용은 필수입니다' }, 400)
    const result = await c.env.DB.prepare(
      'INSERT INTO notices (title, content, is_active, image_url) VALUES (?, ?, ?, ?)'
    ).bind(title.trim(), content.trim(), is_active ?? 1, image_url || null).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id, title, content, image_url } }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/notices/:id - 공지사항 수정
notices.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { title, content, is_active, image_url } = await c.req.json()
    await c.env.DB.prepare(`
      UPDATE notices
      SET title = COALESCE(?, title),
          content = COALESCE(?, content),
          is_active = COALESCE(?, is_active),
          image_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(title || null, content || null, is_active ?? null, image_url ?? null, id).run()
    return c.json({ success: true, message: '공지사항이 수정되었습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/notices/upload-image - 공지사항 이미지 업로드
notices.post('/upload-image', async (c) => {
  try {
    const saJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (!saJson) return c.json({ success: false, error: 'Firebase 서비스 계정 미설정' }, 500)

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ success: false, error: '파일 없음' }, 400)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!allowed.includes(ext)) return c.json({ success: false, error: `허용: ${allowed.join(', ')}` }, 400)
    if (file.size > 5 * 1024 * 1024) return c.json({ success: false, error: '5MB 초과' }, 400)

    const sa = JSON.parse(saJson)
    const bucket = `${sa.project_id || c.env.FCM_PROJECT_ID}.firebasestorage.app`
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `notices/${Date.now()}_${safeName}`
    const encodedPath = encodeURIComponent(storagePath)
    const token = await getStorageToken(saJson)
    const buf = await file.arrayBuffer()
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
    const ct = mimeMap[ext] || file.type || 'application/octet-stream'

    // 1) 파일 업로드
    const upRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': ct,
          'Content-Length': String(buf.byteLength),
        },
        body: buf,
      }
    )
    if (!upRes.ok) return c.json({ success: false, error: `Storage 업로드 실패: ${upRes.status}` }, 500)

    // 2) metadata에 firebaseStorageDownloadTokens 설정 → 공개 접근 가능
    const downloadToken = crypto.randomUUID()
    const patchRes = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: downloadToken } }),
      }
    )
    if (!patchRes.ok) {
      console.error('[notices/upload-image] metadata patch 실패:', patchRes.status)
    }

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`
    return c.json({ success: true, url })
  } catch (e: any) {
    console.error('[notices/upload-image 오류]', e)
    return c.json({ success: false, error: e.message || '업로드 실패' }, 500)
  }
})

// DELETE /api/notices/:id - 공지사항 삭제
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
