// src/routes/invites.ts
// 폐쇄형 채널 초대 링크 관리 API
import { Hono } from 'hono'
import type { Bindings } from '../types'

const invites = new Hono<{ Bindings: Bindings }>()

// =============================================
// 랜덤 토큰 생성 유틸
// =============================================
function generateInviteToken(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let token = prefix + '_'
  for (let i = 0; i < 12; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

function generatePublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'ch_'
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

// =============================================
// 초대 링크 CRUD
// =============================================

// GET /api/invites?channel_id=X - 채널의 초대 링크 목록
invites.get('/', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    if (!channelId) return c.json({ success: false, error: 'channel_id is required' }, 400)

    const { results } = await c.env.DB.prepare(`
      SELECT 
        il.*,
        ch.name as channel_name,
        COUNT(s.id) as joined_count
      FROM channel_invite_links il
      JOIN channels ch ON il.channel_id = ch.id
      LEFT JOIN subscribers s ON s.joined_via_invite_id = il.id AND s.is_active = 1
      WHERE il.channel_id = ?
      GROUP BY il.id
      ORDER BY il.created_at DESC
    `).bind(channelId).all()

    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/invites - 초대 링크 생성
invites.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, label, max_uses, expires_days, created_by } = body

    if (!channel_id) {
      return c.json({ success: false, error: 'channel_id is required' }, 400)
    }

    // 채널 존재 확인
    const channel: any = await c.env.DB.prepare('SELECT id, name FROM channels WHERE id = ?').bind(channel_id).first()
    if (!channel) return c.json({ success: false, error: 'Channel not found' }, 404)

    // 초대 토큰 생성 (inv_ 접두어 + 12자 랜덤)
    const inviteToken = generateInviteToken('inv')
    
    // 만료일 계산
    let expiresAt = null
    if (expires_days && expires_days > 0) {
      const expDate = new Date()
      expDate.setDate(expDate.getDate() + expires_days)
      expiresAt = expDate.toISOString().replace('T', ' ').split('.')[0]
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO channel_invite_links (channel_id, invite_token, label, max_uses, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      channel_id,
      inviteToken,
      label || `${channel.name} 초대링크`,
      max_uses || null,
      expiresAt,
      created_by
    ).run()

    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        channel_id,
        invite_token: inviteToken,
        label: label || `${channel.name} 초대링크`,
        max_uses: max_uses || null,
        expires_at: expiresAt,
        join_url: `/join/${inviteToken}`  // Flutter 앱이 열 딥링크 URL
      }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /api/invites/:id - 초대 링크 수정 (활성화/비활성화, max_uses 변경)
invites.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { label, max_uses, is_active, expires_days } = body

    let expiresAt = undefined
    if (expires_days !== undefined) {
      if (expires_days === null || expires_days === 0) {
        expiresAt = null
      } else {
        const expDate = new Date()
        expDate.setDate(expDate.getDate() + expires_days)
        expiresAt = expDate.toISOString().replace('T', ' ').split('.')[0]
      }
    }

    await c.env.DB.prepare(`
      UPDATE channel_invite_links 
      SET label = COALESCE(?, label),
          max_uses = CASE WHEN ? IS NOT NULL THEN ? ELSE max_uses END,
          is_active = COALESCE(?, is_active),
          expires_at = CASE WHEN ? IS NOT NULL THEN ? ELSE expires_at END
      WHERE id = ?
    `).bind(
      label || null,
      max_uses ?? null, max_uses ?? null,
      is_active ?? null,
      expiresAt !== undefined ? '1' : null,
      expiresAt !== undefined ? expiresAt : null,
      id
    ).run()

    return c.json({ success: true, message: 'Invite link updated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE /api/invites/:id - 초대 링크 삭제
invites.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('DELETE FROM channel_invite_links WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: 'Invite link deleted' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// =============================================
// 초대 링크 검증 (Flutter 앱 / 랜딩 페이지용)
// =============================================

// GET /api/invites/verify/:token - 초대 토큰 유효성 검증
invites.get('/verify/:token', async (c) => {
  try {
    const token = c.req.param('token')

    const link: any = await c.env.DB.prepare(`
      SELECT il.*, ch.name as channel_name, ch.description as channel_description, 
             ch.image_url as channel_image_url
      FROM channel_invite_links il
      JOIN channels ch ON il.channel_id = ch.id
      WHERE il.invite_token = ? AND il.is_active = 1
    `).bind(token).first()

    if (!link) {
      return c.json({ success: false, valid: false, reason: 'INVALID_TOKEN', message: '유효하지 않은 초대 링크입니다' })
    }

    // 만료 확인
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return c.json({ success: false, valid: false, reason: 'EXPIRED', message: '만료된 초대 링크입니다' })
    }

    // 최대 사용 횟수 확인
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return c.json({ success: false, valid: false, reason: 'LIMIT_REACHED', message: '사용 횟수가 초과된 초대 링크입니다' })
    }

    // 채널 활성 확인
    const channel: any = await c.env.DB.prepare('SELECT is_active FROM channels WHERE id = ?').bind(link.channel_id).first()
    if (!channel || !channel.is_active) {
      return c.json({ success: false, valid: false, reason: 'CHANNEL_INACTIVE', message: '비활성화된 채널입니다' })
    }

    return c.json({
      success: true,
      valid: true,
      data: {
        invite_id: link.id,
        channel_id: link.channel_id,
        channel_name: link.channel_name,
        channel_description: link.channel_description,
        channel_image_url: link.channel_image_url,
        remaining_uses: link.max_uses ? link.max_uses - link.use_count : null,
        expires_at: link.expires_at
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/invites/join - 초대 링크로 채널 참여 (Flutter 앱용)
invites.post('/join', async (c) => {
  try {
    const body = await c.req.json()
    const { invite_token, user_id, display_name, fcm_token, platform } = body

    // fcm_token은 빈 문자열도 허용 (아래에서 users 테이블로 보완)
    if (!invite_token || !user_id || !platform) {
      return c.json({ success: false, error: 'invite_token, user_id, platform are required' }, 400)
    }

    // 토큰 검증
    const link: any = await c.env.DB.prepare(`
      SELECT il.*, ch.name as channel_name, ch.is_active as channel_active
      FROM channel_invite_links il
      JOIN channels ch ON il.channel_id = ch.id
      WHERE il.invite_token = ? AND il.is_active = 1
    `).bind(invite_token).first()

    if (!link) return c.json({ success: false, valid: false, reason: 'INVALID_TOKEN', message: '유효하지 않은 초대 링크입니다' }, 400)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return c.json({ success: false, valid: false, reason: 'EXPIRED', message: '만료된 초대 링크입니다' }, 400)
    if (link.max_uses !== null && link.use_count >= link.max_uses) return c.json({ success: false, valid: false, reason: 'LIMIT_REACHED', message: '사용 횟수가 초과된 초대 링크입니다' }, 400)
    if (!link.channel_active) return c.json({ success: false, valid: false, reason: 'CHANNEL_INACTIVE', message: '비활성화된 채널입니다' }, 400)

    // FCM 토큰 결정: 앱이 보낸 토큰이 있으면 우선 사용, 없으면 users 테이블에서 보완
    // (새 가입자는 로그인 직후 /api/fcm/register로 users.fcm_token이 이미 저장되어 있음)
    let effectiveFcmToken = (fcm_token || '').trim()
    if (!effectiveFcmToken) {
      const userRow: any = await c.env.DB.prepare(
        'SELECT fcm_token FROM users WHERE user_id = ?'
      ).bind(user_id).first()
      effectiveFcmToken = userRow?.fcm_token || ''
    }

    // 이미 가입한 회원인지 확인
    const existing: any = await c.env.DB.prepare(
      'SELECT id, is_active FROM subscribers WHERE channel_id = ? AND user_id = ?'
    ).bind(link.channel_id, user_id).first()

    if (existing) {
      if (existing.is_active) {
        // 이미 활성 멤버지만 FCM 토큰은 최신으로 갱신
        if (effectiveFcmToken) {
          await c.env.DB.prepare(
            'UPDATE subscribers SET fcm_token = ?, updated_at = CURRENT_TIMESTAMP WHERE channel_id = ? AND user_id = ?'
          ).bind(effectiveFcmToken, link.channel_id, user_id).run()
        }
        return c.json({ success: true, already_member: true, message: '이미 채널 멤버입니다', data: { channel_id: link.channel_id, channel_name: link.channel_name } })
      } else {
        // 비활성 → 재활성화 + FCM 토큰 갱신
        await c.env.DB.prepare(`
          UPDATE subscribers SET is_active = 1, fcm_token = ?, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE channel_id = ? AND user_id = ?
        `).bind(effectiveFcmToken, link.channel_id, user_id).run()
      }
    } else {
      // 새 구독자 등록
      await c.env.DB.prepare(`
        INSERT INTO subscribers (channel_id, user_id, display_name, fcm_token, platform, joined_via_invite_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(link.channel_id, user_id, display_name || null, effectiveFcmToken, platform, link.id).run()
    }

    // 초대 링크 사용 횟수 증가
    await c.env.DB.prepare(`
      UPDATE channel_invite_links SET use_count = use_count + 1 WHERE id = ?
    `).bind(link.id).run()

    return c.json({
      success: true,
      already_member: false,
      message: `${link.channel_name} 채널에 참여했습니다! 🎉`,
      data: {
        channel_id: link.channel_id,
        channel_name: link.channel_name
      }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export { generatePublicId }
export default invites
