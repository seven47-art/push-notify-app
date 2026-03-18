// src/routes/auth.ts
// 이메일 기반 회원가입 / 로그인 / 세션 관리
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { isEmailBlocked } from './blocked'

const auth = new Hono<{ Bindings: Bindings }>()

// ── 유틸: SHA-256 해시 (Web Crypto API - Cloudflare Workers 호환) ──
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateId(prefix: string = ''): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let id = prefix
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function generateSalt(): string {
  return generateId('salt_')
}

function generateSessionToken(): string {
  return generateId('sess_') + '_' + Date.now()
}

// 세션 만료일 (365일 = 1년)
function sessionExpiry(): string {
  const d = new Date()
  d.setDate(d.getDate() + 365)
  return d.toISOString().replace('T', ' ').split('.')[0]
}

// ── POST /api/auth/register - 회원가입 ──
auth.post('/register', async (c) => {
  try {
    const { email, password, display_name } = await c.req.json()

    if (!email || !password) {
      return c.json({ success: false, error: '이메일과 비밀번호를 입력해주세요' }, 400)
    }
    // 이메일 형식 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ success: false, error: '올바른 이메일 형식이 아닙니다' }, 400)
    }
    // 비밀번호 길이 검증
    if (password.length < 6) {
      return c.json({ success: false, error: '비밀번호는 6자 이상이어야 합니다' }, 400)
    }

    // 이메일 중복 확인
    const existing: any = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first()
    if (existing) {
      return c.json({ success: false, error: '이미 사용 중인 이메일입니다' }, 409)
    }

    // 차단된 이메일 확인
    if (await isEmailBlocked(c.env.DB, email)) {
      return c.json({ success: false, error: '사용할 수 없는 계정입니다. 고객센터에 문의하세요.' }, 403)
    }

    // 비밀번호 해시
    const salt = generateSalt()
    const passwordHash = await sha256(password + salt)
    const userId = 'u_' + generateId()

    // 사용자 생성
    await c.env.DB.prepare(`
      INSERT INTO users (user_id, email, password_hash, salt, display_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, email.toLowerCase(), passwordHash, salt, display_name || email.split('@')[0]).run()

    // 세션 생성
    const sessionToken = generateSessionToken()
    const expiresAt = sessionExpiry()
    await c.env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(userId, sessionToken, expiresAt).run()

    return c.json({
      success: true,
      message: '회원가입이 완료됐습니다',
      data: {
        user_id: userId,
        email: email.toLowerCase(),
        display_name: display_name || email.split('@')[0],
        session_token: sessionToken,
        expires_at: expiresAt
      }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/auth/login - 로그인 ──
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ success: false, error: '이메일과 비밀번호를 입력해주세요' }, 400)
    }

    // 차단된 이메일 확인
    if (await isEmailBlocked(c.env.DB, email)) {
      return c.json({ success: false, error: '사용할 수 없는 계정입니다. 고객센터에 문의하세요.' }, 403)
    }

    // 사용자 조회
    const user: any = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).bind(email.toLowerCase()).first()

    if (!user) {
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)
    }

    // 비밀번호 검증
    const passwordHash = await sha256(password + user.salt)
    if (passwordHash !== user.password_hash) {
      return c.json({ success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)
    }

    // 기존 세션 삭제 후 새 세션 생성
    await c.env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(user.user_id).run()
    const sessionToken = generateSessionToken()
    const expiresAt = sessionExpiry()
    await c.env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(user.user_id, sessionToken, expiresAt).run()

    return c.json({
      success: true,
      message: '로그인 성공',
      data: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        profile_image: user.profile_image,
        session_token: sessionToken,
        expires_at: expiresAt
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/auth/me - 세션 확인 ──
auth.get('/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization') || ''
    const sessionToken = authHeader.replace('Bearer ', '').trim()

    if (!sessionToken) {
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }

    const session: any = await c.env.DB.prepare(`
      SELECT s.*, u.email, u.display_name, u.profile_image
      FROM user_sessions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.session_token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).bind(sessionToken).first()

    if (!session) {
      return c.json({ success: false, error: '세션이 만료됐습니다. 다시 로그인해주세요' }, 401)
    }

    return c.json({
      success: true,
      data: {
        user_id: session.user_id,
        email: session.email,
        display_name: session.display_name,
        profile_image: session.profile_image
      }
    })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/auth/logout - 로그아웃 ──
auth.post('/logout', async (c) => {
  try {
    const authHeader = c.req.header('Authorization') || ''
    const sessionToken = authHeader.replace('Bearer ', '').trim()
    if (sessionToken) {
      await c.env.DB.prepare('DELETE FROM user_sessions WHERE session_token = ?').bind(sessionToken).run()
    }
    return c.json({ success: true, message: '로그아웃 됐습니다' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/auth/google - 구글 플레이 이메일 자동 로그인/회원가입 ──
// 별도 비밀번호 없이 이메일만으로 계정 생성 및 로그인
// 앱 설치 후 구글 계정 이메일을 받아서 자동으로 처리
auth.post('/google', async (c) => {
  try {
    const { email, display_name, google_id } = await c.req.json()

    if (!email) {
      return c.json({ success: false, error: '이메일이 필요합니다' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ success: false, error: '올바른 이메일 형식이 아닙니다' }, 400)
    }

    const emailLower = email.toLowerCase()

    // 차단된 이메일 확인
    if (await isEmailBlocked(c.env.DB, emailLower)) {
      return c.json({ success: false, error: '사용할 수 없는 계정입니다. 고객센터에 문의하세요.' }, 403)
    }

    // 기존 사용자 조회
    let user: any = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND is_active = 1'
    ).bind(emailLower).first()

    if (!user) {
      // 신규 사용자 자동 생성 (비밀번호 없음 - google_id로 구분)
      const userId = 'u_' + generateId()
      const dummySalt = generateSalt()
      const dummyHash = await sha256('google_oauth_' + (google_id || emailLower))
      const name = display_name || emailLower.split('@')[0]

      await c.env.DB.prepare(`
        INSERT INTO users (user_id, email, password_hash, salt, display_name, login_type)
        VALUES (?, ?, ?, ?, ?, 'google')
      `).bind(userId, emailLower, dummyHash, dummySalt, name).run()

      user = { user_id: userId, email: emailLower, display_name: name, profile_image: null }
    }

    // 기존 세션 모두 삭제 후 새 세션 생성 (영구 세션 - 1년)
    await c.env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(user.user_id).run()
    const sessionToken = generateSessionToken()

    // 1년 세션 (자동 로그인 유지)
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    const expiresAt = d.toISOString().replace('T', ' ').split('.')[0]

    await c.env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_token, expires_at)
      VALUES (?, ?, ?)
    `).bind(user.user_id, sessionToken, expiresAt).run()

    return c.json({
      success: true,
      message: '로그인 성공',
      is_new_user: !user.created_at,
      data: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        profile_image: user.profile_image,
        session_token: sessionToken,
        expires_at: expiresAt
      }
    })
  } catch (e: any) {
    // login_type 컬럼 없으면 없이 재시도
    try {
      const { email, display_name, google_id } = await c.req.json().catch(() => ({ email: '', display_name: '', google_id: '' }))
      const emailLower = (email || '').toLowerCase()
      if (!emailLower) return c.json({ success: false, error: e.message }, 500)

      let user: any = await c.env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND is_active = 1'
      ).bind(emailLower).first()

      if (!user) {
        const userId = 'u_' + generateId()
        const dummySalt = generateSalt()
        const dummyHash = await sha256('google_oauth_' + (google_id || emailLower))
        const name = display_name || emailLower.split('@')[0]
        await c.env.DB.prepare(`
          INSERT INTO users (user_id, email, password_hash, salt, display_name)
          VALUES (?, ?, ?, ?, ?)
        `).bind(userId, emailLower, dummyHash, dummySalt, name).run()
        user = { user_id: userId, email: emailLower, display_name: name, profile_image: null }
      }

      await c.env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(user.user_id).run()
      const sessionToken = generateSessionToken()
      const d = new Date(); d.setFullYear(d.getFullYear() + 1)
      const expiresAt = d.toISOString().replace('T', ' ').split('.')[0]
      await c.env.DB.prepare(`INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)`)
        .bind(user.user_id, sessionToken, expiresAt).run()

      return c.json({
        success: true, message: '로그인 성공',
        data: { user_id: user.user_id, email: user.email, display_name: user.display_name,
          profile_image: user.profile_image, session_token: sessionToken, expires_at: expiresAt }
      })
    } catch (e2: any) {
      return c.json({ success: false, error: e2.message }, 500)
    }
  }
})

// ── PUT /api/auth/phone - 전화번호 저장 (통화 알람 수신용) ──
auth.put('/phone', async (c) => {
  try {
    const { user_id, phone_number } = await c.req.json()
    if (!user_id) return c.json({ success: false, error: 'user_id 필수' }, 400)

    // 전화번호 형식 검증 (+821012345678 등 국제 형식)
    const cleaned = (phone_number || '').trim()
    if (cleaned && !/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      return c.json({ success: false, error: '전화번호는 국제 형식(+82...)으로 입력하세요' }, 400)
    }

    await c.env.DB.prepare(
      'UPDATE users SET phone_number = ?, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).bind(cleaned || null, user_id).run()

    return c.json({ success: true, phone_number: cleaned || null })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default auth
