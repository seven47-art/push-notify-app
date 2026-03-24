// src/routes/channels.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { sendFCMMulticast } from './fcm'

// ── URL 정규화 + 형식 검증 헬퍼 ─────────────────────────────────
// 비어있으면 null 반환, http(s):// 없으면 https:// 자동 추가, 유효하지 않으면 에러 반환
function normalizeUrl(raw: string | undefined | null): { ok: boolean; value: string | null; error?: string } {
  if (!raw || !raw.trim()) return { ok: true, value: null }
  let url = raw.trim()
  // http(s):// 없으면 https:// 자동 추가
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  try {
    const parsed = new URL(url)
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { ok: false, value: null, error: '올바른 URL 형식이 아닙니다 (예: example.com)' }
    }
    return { ok: true, value: url }
  } catch {
    return { ok: false, value: null, error: '올바른 URL 형식이 아닙니다 (예: example.com)' }
  }
}

// ── 채널 1개 완전 삭제 헬퍼 (DB + 구독자 FCM 전송) ──────────────
// users.ts의 deleteUserFully 채널 처리 로직과 동일하게 맞춤
async function deleteChannelFully(db: any, env: any, channelId: string | number) {
  const chId = Number(channelId)
  const serviceAccount = (env as any).FCM_SERVICE_ACCOUNT_JSON || ''
  const projectId      = (env as any).FCM_PROJECT_ID           || ''

  // 1. 구독자 FCM 토큰 수집 → channel_deleted 전송
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

  // 2. notification_batches / logs 삭제
  const batches = await db.prepare(
    `SELECT id FROM notification_batches WHERE channel_id = ?`
  ).bind(chId).all()
  for (const b of (batches.results as { id: number }[])) {
    await db.prepare(`DELETE FROM notification_logs WHERE batch_id = ?`).bind(b.id).run()
  }
  await db.prepare(`DELETE FROM notification_batches WHERE channel_id = ?`).bind(chId).run()

  // 3. alarm_schedules / alarm_logs 삭제
  const alarmSchedules = await db.prepare(
    `SELECT id FROM alarm_schedules WHERE channel_id = ?`
  ).bind(chId).all()
  for (const a of (alarmSchedules.results as { id: number }[])) {
    await db.prepare(`DELETE FROM alarm_logs WHERE alarm_id = ?`).bind(a.id).run()
  }
  await db.prepare(`DELETE FROM alarm_schedules WHERE channel_id = ?`).bind(chId).run()

  // 4. 나머지 관련 데이터 삭제
  await db.prepare(`DELETE FROM subscribers WHERE channel_id = ?`).bind(chId).run()
  await db.prepare(`DELETE FROM contents WHERE channel_id = ?`).bind(chId).run()
  await db.prepare(`DELETE FROM channel_invite_links WHERE channel_id = ?`).bind(chId).run()

  // 5. 채널 본체 삭제
  await db.prepare(`DELETE FROM channels WHERE id = ?`).bind(chId).run()
}

const channels = new Hono<{ Bindings: Bindings }>()

function generatePublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'ch_'
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

// SHA-256 해시 (Cloudflare Workers Web Crypto API)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// GET /api/channels  (owner_id, search 파라미터로 필터 가능)
channels.get('/', async (c) => {
  try {
    const ownerId = c.req.query('owner_id')
    const search  = c.req.query('search')?.trim()
    const params: (string)[] = []

    let where = 'WHERE ch.is_active = 1'
    if (ownerId) {
      // 특정 사용자의 운영 채널 (홈 화면용 — users 조인 불필요)
      where += ' AND ch.owner_id = ?'
      params.push(ownerId)
    } else {
      // 채널 탭 전체 목록: 정식 가입 회원(users 테이블)이 운영 중인 채널만 노출
      where += ' AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = ch.owner_id)'
    }
    if (search) {
      where += ' AND ch.name LIKE ?'
      params.push('%' + search + '%')
    }

    const query = `
      SELECT
        ch.id, ch.name, ch.description, ch.image_url, ch.owner_id, ch.is_active, ch.created_at,
        ch.homepage_url, ch.public_id, ch.is_popular,
        ch.is_secret,
        ch.is_favorite,
        u.email as owner_email,
        CASE WHEN b.email IS NOT NULL THEN 1 ELSE 0 END AS owner_is_blocked,
        COUNT(DISTINCT s.id)  as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT il.id) as invite_link_count,
        COUNT(DISTINCT CASE WHEN a.scheduled_at > datetime('now') AND a.status = 'pending' THEN a.id END) as pending_alarm_count,
        MAX(a.scheduled_at) as last_alarm_at
      FROM channels ch
      LEFT JOIN users u         ON ch.owner_id = u.user_id
      LEFT JOIN blocked_emails b ON LOWER(b.email) = LOWER(u.email)
      LEFT JOIN subscribers s  ON ch.id = s.channel_id  AND s.is_active = 1
      LEFT JOIN contents ct    ON ch.id = ct.channel_id
      LEFT JOIN channel_invite_links il ON ch.id = il.channel_id AND il.is_active = 1
      LEFT JOIN alarm_schedules a ON ch.id = a.channel_id
      ${where}
      GROUP BY ch.id
      ORDER BY ch.is_favorite DESC, ch.created_at DESC
    `

    const stmt = c.env.DB.prepare(query)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/popular  — 인기채널 목록 (is_popular=1)
channels.get('/popular', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        ch.id, ch.name, ch.description, ch.image_url, ch.owner_id,
        ch.homepage_url, ch.public_id, ch.is_popular, ch.is_secret, ch.created_at,
        COUNT(DISTINCT s.id) as subscriber_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      WHERE ch.is_active = 1 AND ch.is_popular = 1
      GROUP BY ch.id
      ORDER BY ch.created_at DESC
    `).all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/best  — 베스트채널 (구독자 많은 순 10개, 동수 시 created_at ASC)
channels.get('/best', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        ch.id, ch.name, ch.description, ch.image_url, ch.owner_id,
        ch.homepage_url, ch.public_id, ch.is_popular, ch.is_secret, ch.created_at,
        COUNT(DISTINCT s.id) as subscriber_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      WHERE ch.is_active = 1
        AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = ch.owner_id)
      GROUP BY ch.id
      ORDER BY subscriber_count DESC, ch.created_at ASC
      LIMIT 10
    `).all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PATCH /api/channels/:id/favorite  — 내 채널 즐겨찾기 토글
channels.patch('/:id/favorite', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const isFavorite = body.is_favorite ? 1 : 0

    await c.env.DB.prepare(
      'UPDATE channels SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(isFavorite, id).run()

    return c.json({ success: true, is_favorite: isFavorite })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PATCH /api/channels/:id/popular  — 인기채널 지정/해제
channels.patch('/:id/popular', async (c) => {
  try {
    const id   = c.req.param('id')
    const body = await c.req.json()
    const isPopular = Number(body.is_popular) === 1 ? 1 : 0

    await c.env.DB.prepare(
      'UPDATE channels SET is_popular = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(isPopular, id).run()

    return c.json({ success: true, is_popular: isPopular })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/check-name?name=XXX&exclude_id=YYY  (채널명 중복 체크)
channels.get('/check-name', async (c) => {
  try {
    const name      = c.req.query('name')?.trim()
    const excludeId = c.req.query('exclude_id')

    if (!name) return c.json({ available: false, error: '채널명을 입력하세요' }, 400)

    let row
    if (excludeId) {
      // 수정 시: 자신 제외 + 활성 채널만 체크
      row = await c.env.DB.prepare(
        'SELECT id FROM channels WHERE LOWER(name) = LOWER(?) AND id != ? AND is_active = 1'
      ).bind(name, excludeId).first()
    } else {
      // 생성 시: 활성 채널만 체크 (삭제된 채널명은 재사용 가능)
      row = await c.env.DB.prepare(
        'SELECT id FROM channels WHERE LOWER(name) = LOWER(?) AND is_active = 1'
      ).bind(name).first()
    }

    return c.json({ available: !row })
  } catch (e: any) {
    return c.json({ available: false, error: e.message }, 500)
  }
})

// GET /api/channels/by-public-id/:publicId  (수신화면 채널 이미지 조회용)
channels.get('/by-public-id/:publicId', async (c) => {
  try {
    const publicId = c.req.param('publicId')
    const channel = await c.env.DB.prepare(
      'SELECT id, name, image_url, public_id FROM channels WHERE public_id = ? AND is_active = 1'
    ).bind(publicId).first()

    if (!channel) return c.json({ success: false, error: 'Channel not found' }, 404)
    return c.json({ success: true, data: channel })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/channels/:id/image  — base64 이미지를 실제 이미지로 응답 (OG 태그용)
channels.get('/:id/image', async (c) => {
  try {
    const id = c.req.param('id')
    const channel: any = await c.env.DB.prepare(
      'SELECT image_url FROM channels WHERE id = ? AND is_active = 1'
    ).bind(id).first()

    if (!channel || !channel.image_url) {
      return c.redirect('https://ringo.run/static/og-default.png', 302)
    }

    const imageUrl = channel.image_url as string

    // base64 데이터 URI인 경우 → 실제 이미지로 변환
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return c.redirect('https://ringo.run/static/og-default.png', 302)
      const mimeType = match[1]
      const base64Data = match[2]
      const binary = Uint8Array.from(atob(base64Data), ch => ch.charCodeAt(0))
      return new Response(binary, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        }
      })
    }

    // 일반 URL인 경우 → 그대로 리다이렉트
    return c.redirect(imageUrl, 302)
  } catch (e: any) {
    return c.redirect('https://ringo.run/static/og-default.png', 302)
  }
})

// GET /api/channels/:id
channels.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const userId = c.req.query('user_id')
    const channel = await c.env.DB.prepare(`
      SELECT 
        ch.*,
        COUNT(DISTINCT s.id) as subscriber_count,
        COUNT(DISTINCT ct.id) as content_count,
        COUNT(DISTINCT il.id) as invite_link_count,
        COUNT(DISTINCT nb.id) as batch_count,
        COUNT(DISTINCT CASE WHEN a.scheduled_at > datetime('now') AND a.status = 'pending' THEN a.id END) as pending_alarm_count
      FROM channels ch
      LEFT JOIN subscribers s ON ch.id = s.channel_id AND s.is_active = 1
      LEFT JOIN contents ct ON ch.id = ct.channel_id
      LEFT JOIN channel_invite_links il ON ch.id = il.channel_id AND il.is_active = 1
      LEFT JOIN notification_batches nb ON ch.id = nb.channel_id
      LEFT JOIN alarm_schedules a ON ch.id = a.channel_id
      WHERE ch.id = ?
      GROUP BY ch.id
    `).bind(id).first()

    if (!channel) return c.json({ success: false, error: 'Channel not found' }, 404)

    // 구독자의 즐겨찾기 상태 포함 (user_id 파라미터가 있을 경우)
    let subscriberFavorite = 0
    if (userId) {
      const sub: any = await c.env.DB.prepare(
        'SELECT is_favorite FROM subscribers WHERE channel_id = ? AND user_id = ? AND is_active = 1'
      ).bind(id, userId).first()
      if (sub) subscriberFavorite = sub.is_favorite || 0
    }

    return c.json({ success: true, data: { ...channel as any, subscriber_is_favorite: subscriberFavorite } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/channels
channels.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { name: rawName, channel_name, description, image_url, owner_id, phone_number, homepage_url, is_secret, password } = body

    // Flutter는 channel_name, 웹은 name으로 전송 — 둘 다 수용
    const name = rawName || channel_name

    // owner_id가 없으면 'web_user'로 대체 (모바일 웹 호환)
    const finalOwnerId = owner_id || 'web_user'

    if (!name || !name.trim()) {
      return c.json({ success: false, error: '채널명은 필수입니다' }, 400)
    }

    // 채널명 특수문자 검증 (모든 언어 허용, 특수문자만 차단)
    const invalidChars = /[!@#$%^&*()+={}\[\]|\\/<>?~`"';:]/
    if (invalidChars.test(name.trim())) {
      return c.json({ success: false, error: '채널명에 특수문자를 사용할 수 없습니다' }, 400)
    }
    if (!description || !description.trim()) {
      return c.json({ success: false, error: '채널 소개는 필수입니다' }, 400)
    }

    // 비밀채널인 경우 비밀번호 필수
    const isSecret = is_secret ? 1 : 0
    if (isSecret && (!password || !password.trim())) {
      return c.json({ success: false, error: '비밀채널은 비밀번호가 필수입니다' }, 400)
    }

    // homepage_url 정규화 (http(s):// 없으면 https:// 자동 추가) + 형식 검증
    const hpNorm = normalizeUrl(homepage_url)
    if (!hpNorm.ok) return c.json({ success: false, error: hpNorm.error }, 400)
    const safeHomepageUrl = hpNorm.value

    // 채널명 중복 체크 (활성 채널만, 대소문자 구분 없이)
    const existing = await c.env.DB.prepare(
      'SELECT id FROM channels WHERE LOWER(name) = LOWER(?) AND is_active = 1')
      .bind(name.trim()).first()
    if (existing) {
      return c.json({ success: false, error: '이미 사용 중인 채널명입니다.' }, 409)
    }

    // image_url이 너무 크면 null 처리 (D1 SQLITE_TOOBIG 방지, 한도 800KB)
    const safeImageUrl = (image_url && image_url.length <= 819200) ? image_url : null
    if (image_url && !safeImageUrl) {
      return c.json({ success: false, error: '이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.' }, 400)
    }
    // 채널 대표이미지 필수
    if (!safeImageUrl) {
      return c.json({ success: false, error: '채널 대표이미지는 필수입니다' }, 400)
    }

    const publicId = generatePublicId()
    const passwordHash = (isSecret && password) ? await hashPassword(password.trim()) : null

    const result = await c.env.DB.prepare(`
      INSERT INTO channels (name, description, image_url, owner_id, public_id, homepage_url, is_secret, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(name.trim(), description.trim(), safeImageUrl || null, finalOwnerId, publicId, safeHomepageUrl || null, isSecret, passwordHash).run()

    const newChannelId = result.meta.last_row_id as number

    // ── 채널 운영자를 구독자로 자동 등록 ────────────────────────────
    // 채널 생성 즉시 운영자도 구독자(is_active=1)로 등록하여
    // 운영자가 직접 보낸 알람도 본인에게 수신되도록 보장
    // 이후 알람 발송은 subscribers 테이블만 조회하면 됨 (운영자 별도 조회 불필요)
    if (finalOwnerId && finalOwnerId !== 'web_user') {
      try {
        // 운영자의 display_name, fcm_token 조회
        const ownerUser: any = await c.env.DB.prepare(
          'SELECT display_name, fcm_token FROM users WHERE user_id = ?'
        ).bind(finalOwnerId).first()

        const ownerFcmToken = ownerUser?.fcm_token || ''
        const ownerPlatform = 'android'   // 앱 사용자는 android 기본값

        // fcm_token NOT NULL 조건 때문에 토큰 없으면 빈 문자열로 대체
        await c.env.DB.prepare(`
          INSERT OR IGNORE INTO subscribers
            (channel_id, user_id, display_name, fcm_token, platform, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `).bind(
          newChannelId,
          finalOwnerId,
          ownerUser?.display_name || null,
          ownerFcmToken,
          ownerPlatform
        ).run()
      } catch (subErr: any) {
        // 자동 등록 실패해도 채널 생성은 성공으로 처리
        console.error('운영자 자동 구독 등록 실패:', subErr.message)
      }
    }
    // ─────────────────────────────────────────────────────────────────

    return c.json({
      success: true,
      data: { id: newChannelId, name, description, owner_id: finalOwnerId, public_id: publicId }
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
    const { name, description, image_url, is_active, homepage_url, is_secret, password, remove_password } = body

    // image_url이 너무 크면 에러 반환 (D1 SQLITE_TOOBIG 방지, 한도 800KB)
    if (image_url && image_url.length > 819200) {
      return c.json({ success: false, error: '이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.' }, 400)
    }

    // homepage_url 정규화 (요청에 포함된 경우만)
    let safeHomepageUrl = homepage_url ?? null
    if ('homepage_url' in body) {
      const hpNorm = normalizeUrl(homepage_url)
      if (!hpNorm.ok) return c.json({ success: false, error: hpNorm.error }, 400)
      safeHomepageUrl = hpNorm.value
    }

    // 채널명 중복 체크 (변경하는 경우에만)
    if (name && name.trim()) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM channels WHERE LOWER(name) = LOWER(?) AND id != ? AND is_active = 1'
      ).bind(name.trim(), id).first()
      if (existing) {
        return c.json({ success: false, error: '이미 사용 중인 채널명입니다' }, 409)
      }
    }

    // 비밀번호 처리
    let passwordHash: string | null | undefined = undefined // undefined = 변경 안 함
    let isSecretVal: number | undefined = undefined
    if (is_secret !== undefined) {
      isSecretVal = is_secret ? 1 : 0
      if (isSecretVal === 1 && password && password.trim()) {
        passwordHash = await hashPassword(password.trim())
      } else if (isSecretVal === 0 || remove_password) {
        passwordHash = null
      }
    } else if (password && password.trim()) {
      // 비밀번호만 변경
      passwordHash = await hashPassword(password.trim())
    } else if (remove_password) {
      passwordHash = null
    }

    // homepage_url은 요청에 명시적으로 포함된 경우 null도 그대로 덮어씀 (삭제 지원)
    const hasHomepage = 'homepage_url' in body

    await c.env.DB.prepare(`
      UPDATE channels 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          homepage_url = CASE WHEN ? = 1 THEN ? ELSE homepage_url END,
          is_active = COALESCE(?, is_active),
          is_secret = COALESCE(?, is_secret),
          password_hash = CASE WHEN ? IS NOT NULL OR ? = 1 THEN ? ELSE password_hash END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name?.trim() || null,
      description || null,
      image_url || null,
      hasHomepage ? 1 : 0,
      safeHomepageUrl,
      is_active ?? null,
      isSecretVal ?? null,
      passwordHash !== undefined ? passwordHash : null,
      passwordHash !== undefined ? 1 : 0,
      passwordHash !== undefined ? passwordHash : null,
      id
    ).run()

    return c.json({ success: true, message: 'Channel updated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/channels/:id/verify-password — 비밀채널 가입 시 비밀번호 검증
channels.post('/:id/verify-password', async (c) => {
  try {
    const id = c.req.param('id')
    const { password } = await c.req.json()
    if (!password) return c.json({ success: false, error: '비밀번호를 입력하세요' }, 400)

    const channel = await c.env.DB.prepare(
      'SELECT is_secret, password_hash FROM channels WHERE id = ? AND is_active = 1'
    ).bind(id).first() as any

    if (!channel) return c.json({ success: false, error: '채널을 찾을 수 없습니다' }, 404)
    if (!channel.is_secret) return c.json({ success: true, message: '공개 채널입니다' })
    if (!channel.password_hash) return c.json({ success: false, error: '비밀번호가 설정되지 않은 채널입니다' }, 400)

    const inputHash = await hashPassword(password.trim())
    if (inputHash !== channel.password_hash) {
      return c.json({ success: false, error: '비밀번호가 올바르지 않습니다' }, 401)
    }
    return c.json({ success: true, message: '비밀번호 확인 완료' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/channels/:id
channels.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await deleteChannelFully(c.env.DB, c.env, id)
    return c.json({ success: true, message: 'Channel deleted' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/channels/bulk-delete
channels.post('/bulk-delete', async (c) => {
  try {
    const { ids } = await c.req.json()
    if (!Array.isArray(ids) || ids.length === 0)
      return c.json({ success: false, error: 'ids 필수' }, 400)
    for (const id of ids) {
      await deleteChannelFully(c.env.DB, c.env, id)
    }
    return c.json({ success: true, deleted: ids.length })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default channels
