// src/routes/admin.ts
import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import type { Bindings } from '../types'

const admin = new Hono<{ Bindings: Bindings }>()

// ── 비밀번호 해시 (SHA-256) ──────────────────────────
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── 세션 토큰 생성 ───────────────────────────────────
function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── 세션 검증 미들웨어 ───────────────────────────────
async function verifySession(c: any): Promise<boolean> {
  const sessionToken = getCookie(c, 'admin_session')
  if (!sessionToken) return false
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_session_token'"
  ).first() as { value: string } | null
  return row?.value === sessionToken
}

// ── GET /admin - 로그인 페이지 or 관리자 대시보드 ──
admin.get('/', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (isLoggedIn) {
    return c.html(adminDashboardHTML())
  }
  return c.html(adminLoginHTML())
})

// ── POST /admin/login - 로그인 처리 ─────────────────
admin.post('/login', async (c) => {
  const { username, password } = await c.req.parseBody()
  if (username !== 'admin') {
    return c.html(adminLoginHTML('아이디 또는 비밀번호가 틀렸습니다.'))
  }
  const hashed = await hashPassword(password as string)
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null

  // 비밀번호가 없으면 최초 설정
  if (!row) {
    await c.env.DB.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('admin_password', ?)"
    ).bind(hashed).run()
    const token = generateToken()
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_session_token', ?)"
    ).bind(token).run()
    setCookie(c, 'admin_session', token, { httpOnly: true, secure: true, maxAge: 86400 * 7 })
    return c.redirect('/admin')
  }

  if (row.value !== hashed) {
    return c.html(adminLoginHTML('아이디 또는 비밀번호가 틀렸습니다.'))
  }

  const token = generateToken()
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_session_token', ?)"
  ).bind(token).run()
  setCookie(c, 'admin_session', token, { httpOnly: true, secure: true, maxAge: 86400 * 7 })
  return c.redirect('/admin')
})

// ── POST /admin/logout - 로그아웃 ───────────────────
admin.post('/logout', async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM app_settings WHERE key = 'admin_session_token'"
  ).run()
  setCookie(c, 'admin_session', '', { httpOnly: true, secure: true, maxAge: 0 })
  return c.redirect('/admin')
})

// ── POST /admin/change-password - 비밀번호 변경 ─────
admin.post('/change-password', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin')

  const { current_password, new_password, confirm_password } = await c.req.parseBody()

  if (new_password !== confirm_password) {
    return c.html(adminDashboardHTML('새 비밀번호가 일치하지 않습니다.', ''))
  }
  if ((new_password as string).length < 6) {
    return c.html(adminDashboardHTML('비밀번호는 최소 6자 이상이어야 합니다.', ''))
  }

  const currentHashed = await hashPassword(current_password as string)
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null

  if (!row || row.value !== currentHashed) {
    return c.html(adminDashboardHTML('현재 비밀번호가 틀렸습니다.', ''))
  }

  const newHashed = await hashPassword(new_password as string)
  await c.env.DB.prepare(
    "UPDATE app_settings SET value = ? WHERE key = 'admin_password'"
  ).bind(newHashed).run()

  return c.html(adminDashboardHTML('', '비밀번호가 성공적으로 변경되었습니다!'))
})

// ── HTML 템플릿: 로그인 페이지 ──────────────────────
function adminLoginHTML(error = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RinGo 관리자 로그인</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1f2937; border-radius: 16px; padding: 40px; width: 100%; max-width: 400px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo-text { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #f59e0b, #ef4444);
                 -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #9ca3af; font-size: 14px; margin-top: 4px; }
    label { display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input { width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
            border-radius: 10px; color: white; font-size: 15px; outline: none; transition: border 0.2s; }
    input:focus { border-color: #f59e0b; }
    .field { margin-bottom: 20px; }
    .btn { width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #ef4444);
           border: none; border-radius: 10px; color: white; font-size: 16px; font-weight: 600;
           cursor: pointer; transition: opacity 0.2s; margin-top: 8px; }
    .btn:hover { opacity: 0.9; }
    .error { background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 16px;
             border-radius: 10px; font-size: 14px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-text">RinGo</div>
      <div class="subtitle">관리자 로그인</div>
    </div>
    ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="field">
        <label>아이디</label>
        <input type="text" name="username" value="admin" required autocomplete="username">
      </div>
      <div class="field">
        <label>비밀번호</label>
        <input type="password" name="password" required autocomplete="current-password" autofocus>
      </div>
      <button type="submit" class="btn">로그인</button>
    </form>
  </div>
</body>
</html>`
}

// ── HTML 템플릿: 관리자 대시보드 ────────────────────
function adminDashboardHTML(error = '', success = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RinGo 관리자</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           min-height: 100vh; color: white; }
    .header { background: #1f2937; border-bottom: 1px solid #374151;
              padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
    .logo-text { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #f59e0b, #ef4444);
                 -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .badge { background: #374151; color: #9ca3af; padding: 4px 12px; border-radius: 20px; font-size: 13px; }
    .logout-btn { background: #374151; border: none; color: #d1d5db; padding: 8px 16px;
                  border-radius: 8px; cursor: pointer; font-size: 14px; }
    .logout-btn:hover { background: #4b5563; }
    .container { max-width: 600px; margin: 40px auto; padding: 0 24px; }
    .card { background: #1f2937; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .card-title { font-size: 18px; font-weight: 700; margin-bottom: 24px; color: #f9fafb; }
    label { display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input { width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
            border-radius: 10px; color: white; font-size: 15px; outline: none; transition: border 0.2s; }
    input:focus { border-color: #f59e0b; }
    .field { margin-bottom: 16px; }
    .btn { padding: 12px 24px; background: linear-gradient(135deg, #f59e0b, #ef4444);
           border: none; border-radius: 10px; color: white; font-size: 15px; font-weight: 600;
           cursor: pointer; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .error { background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 16px;
             border-radius: 10px; font-size: 14px; margin-bottom: 20px; }
    .success { background: #052e16; border: 1px solid #22c55e; color: #86efac; padding: 12px 16px;
               border-radius: 10px; font-size: 14px; margin-bottom: 20px; }
    .hint { color: #6b7280; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-text">RinGo 관리자</div>
    <div class="header-right">
      <span class="badge">admin</span>
      <form method="POST" action="/admin/logout" style="display:inline">
        <button type="submit" class="logout-btn">로그아웃</button>
      </form>
    </div>
  </div>
  <div class="container">
    <div class="card">
      <div class="card-title">🔐 비밀번호 변경</div>
      ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
      ${success ? `<div class="success">✅ ${success}</div>` : ''}
      <form method="POST" action="/admin/change-password">
        <div class="field">
          <label>현재 비밀번호</label>
          <input type="password" name="current_password" required>
        </div>
        <div class="field">
          <label>새 비밀번호</label>
          <input type="password" name="new_password" required>
          <p class="hint">최소 6자 이상</p>
        </div>
        <div class="field">
          <label>새 비밀번호 확인</label>
          <input type="password" name="confirm_password" required>
        </div>
        <button type="submit" class="btn">비밀번호 변경</button>
      </form>
    </div>
  </div>
</body>
</html>`
}

export default admin
