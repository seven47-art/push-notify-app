// src/routes/admin.ts
import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import type { Bindings } from '../types'

const admin = new Hono<{ Bindings: Bindings }>()

// 초기 비밀번호
const DEFAULT_PASSWORD = '1111'

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

// ── 세션 검증 ────────────────────────────────────────
async function verifySession(c: any): Promise<boolean> {
  const sessionToken = getCookie(c, 'admin_session')
  if (!sessionToken) return false
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_session_token'"
  ).first() as { value: string } | null
  return row?.value === sessionToken
}

// ── GET /admin → 무조건 /admin/login 으로 리다이렉트 ─
admin.get('/', async (c) => {
  return c.redirect('/admin/login')
})

// ── GET /admin/login ─────────────────────────────────
admin.get('/login', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (isLoggedIn) return c.redirect('/admin/dashboard')
  return c.html(adminLoginHTML())
})

// ── GET /admin/dashboard ─────────────────────────────
admin.get('/dashboard', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin/login')
  return c.html(adminDashboardHTML())
})

// ── GET /admin/settings ──────────────────────────────
admin.get('/settings', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin/login')
  return c.html(adminSettingsHTML())
})

// ── POST /admin/login ────────────────────────────────
admin.post('/login', async (c) => {
  const { username, password } = await c.req.parseBody()
  if (username !== 'admin') {
    return c.html(adminLoginHTML('아이디 또는 비밀번호가 틀렸습니다.'))
  }

  const hashed = await hashPassword(password as string)
  let row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null

  // 비밀번호 미설정 시 기본값 1111 세팅
  if (!row) {
    const defaultHashed = await hashPassword(DEFAULT_PASSWORD)
    await c.env.DB.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('admin_password', ?)"
    ).bind(defaultHashed).run()
    row = { value: defaultHashed }
  }

  if (row.value !== hashed) {
    return c.html(adminLoginHTML('아이디 또는 비밀번호가 틀렸습니다.'))
  }

  const token = generateToken()
  await c.env.DB.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_session_token', ?)"
  ).bind(token).run()
  setCookie(c, 'admin_session', token, { httpOnly: true, secure: true, maxAge: 86400 * 7 })
  return c.redirect('/admin/dashboard')
})

// ── POST /admin/logout ───────────────────────────────
admin.post('/logout', async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM app_settings WHERE key = 'admin_session_token'"
  ).run()
  setCookie(c, 'admin_session', '', { httpOnly: true, secure: true, maxAge: 0 })
  return c.redirect('/admin/login')
})

// ── POST /admin/change-password ──────────────────────
admin.post('/change-password', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin/login')

  const { current_password, new_password, confirm_password } = await c.req.parseBody()

  if (new_password !== confirm_password) {
    return c.html(adminSettingsHTML('새 비밀번호가 일치하지 않습니다.'))
  }
  if ((new_password as string).length < 4) {
    return c.html(adminSettingsHTML('비밀번호는 최소 4자 이상이어야 합니다.'))
  }

  const currentHashed = await hashPassword(current_password as string)
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null

  if (!row || row.value !== currentHashed) {
    return c.html(adminSettingsHTML('현재 비밀번호가 틀렸습니다.'))
  }

  const newHashed = await hashPassword(new_password as string)
  await c.env.DB.prepare(
    "UPDATE app_settings SET value = ? WHERE key = 'admin_password'"
  ).bind(newHashed).run()

  return c.html(adminSettingsHTML('', '비밀번호가 성공적으로 변경되었습니다!'))
})

// ── 공통 사이드바 레이아웃 ───────────────────────────
function layoutHTML(title: string, activeMenu: string, content: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - RinGo 관리자</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           min-height: 100vh; color: white; display: flex; flex-direction: column; }

    /* 헤더 */
    .header { background: #1f2937; border-bottom: 1px solid #374151;
              padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between;
              position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
    .logo-text { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #f59e0b, #ef4444);
                 -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .header-user { color: #9ca3af; font-size: 14px; }
    .logout-btn { background: #374151; border: none; color: #f9fafb; padding: 7px 14px;
                  border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .logout-btn:hover { background: #4b5563; }

    /* 레이아웃 */
    .layout { display: flex; padding-top: 56px; min-height: 100vh; }

    /* 사이드바 */
    .sidebar { width: 220px; background: #1a2234; border-right: 1px solid #2d3748;
               position: fixed; top: 56px; bottom: 0; left: 0; overflow-y: auto; padding: 16px 0; }
    .sidebar-section { padding: 8px 12px 4px; color: #6b7280; font-size: 11px; font-weight: 600;
                       text-transform: uppercase; letter-spacing: 0.05em; }
    .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px;
                    color: #9ca3af; font-size: 14px; font-weight: 500; cursor: pointer;
                    text-decoration: none; transition: all 0.15s; border-left: 3px solid transparent; }
    .sidebar-item:hover { background: #243046; color: #f9fafb; }
    .sidebar-item.active { background: #1e3a5f; color: #f59e0b; border-left-color: #f59e0b; }
    .sidebar-item .icon { font-size: 16px; width: 20px; text-align: center; }

    /* 메인 콘텐츠 */
    .main { margin-left: 220px; flex: 1; padding: 32px; }
    .page-title { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: #f9fafb; }
  </style>
</head>
<body>
  <!-- 헤더 -->
  <div class="header">
    <div class="logo-text">RinGo</div>
    <div class="header-right">
      <span class="header-user">👤 admin</span>
      <form method="POST" action="/admin/logout" style="margin:0">
        <button type="submit" class="logout-btn">로그아웃</button>
      </form>
    </div>
  </div>

  <div class="layout">
    <!-- 사이드바 -->
    <nav class="sidebar">
      <div style="padding: 12px 16px 8px; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">메뉴</div>
      <a href="/admin/dashboard" class="sidebar-item ${activeMenu === 'dashboard' ? 'active' : ''}">
        <span class="icon">🏠</span> 대시보드
      </a>
      <div style="height: 1px; background: #2d3748; margin: 8px 0;"></div>
      <div style="padding: 8px 16px 4px; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">설정</div>
      <a href="/admin/settings" class="sidebar-item ${activeMenu === 'settings' ? 'active' : ''}">
        <span class="icon">⚙️</span> 관리자 설정
      </a>
    </nav>

    <!-- 메인 -->
    <main class="main">
      ${content}
    </main>
  </div>
</body>
</html>`
}

// ── HTML: 로그인 페이지 ──────────────────────────────
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

// ── HTML: 대시보드 ───────────────────────────────────
function adminDashboardHTML() {
  const content = `
    <div class="page-title">대시보드</div>
    <div style="background: #1f2937; border-radius: 12px; padding: 32px; color: #9ca3af; font-size: 15px; line-height: 1.7;">
      <p>안녕하세요, <strong style="color: white;">admin</strong>님!</p>
      <p style="margin-top: 8px;">RinGo 관리자 페이지에 오신 것을 환영합니다.</p>
      <p style="margin-top: 16px; color: #6b7280; font-size: 13px;">왼쪽 사이드바의 <strong style="color: #f59e0b;">관리자 설정</strong>에서 비밀번호를 변경할 수 있습니다.</p>
    </div>
  `
  return layoutHTML('대시보드', 'dashboard', content)
}

// ── HTML: 관리자 설정 ────────────────────────────────
function adminSettingsHTML(error = '', success = '') {
  const content = `
    <div class="page-title">관리자 설정</div>
    <div style="background: #1f2937; border-radius: 12px; padding: 32px; max-width: 480px;">
      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 24px; color: #f9fafb;">🔐 비밀번호 변경</h3>
      ${error ? `<div style="background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 16px; border-radius: 10px; font-size: 14px; margin-bottom: 16px;">⚠️ ${error}</div>` : ''}
      ${success ? `<div style="background: #052e16; border: 1px solid #22c55e; color: #86efac; padding: 12px 16px; border-radius: 10px; font-size: 14px; margin-bottom: 16px;">✅ ${success}</div>` : ''}
      <form method="POST" action="/admin/change-password">
        <div style="margin-bottom: 16px;">
          <label style="display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px;">현재 비밀번호</label>
          <input type="password" name="current_password" required autofocus
            style="width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
                   border-radius: 10px; color: white; font-size: 15px; outline: none;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px;">새 비밀번호</label>
          <input type="password" name="new_password" required
            style="width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
                   border-radius: 10px; color: white; font-size: 15px; outline: none;">
          <p style="color: #6b7280; font-size: 12px; margin-top: 6px;">최소 4자 이상</p>
        </div>
        <div style="margin-bottom: 24px;">
          <label style="display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px;">새 비밀번호 확인</label>
          <input type="password" name="confirm_password" required
            style="width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
                   border-radius: 10px; color: white; font-size: 15px; outline: none;">
        </div>
        <button type="submit"
          style="width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #ef4444);
                 border: none; border-radius: 10px; color: white; font-size: 15px; font-weight: 600;
                 cursor: pointer;">변경하기</button>
      </form>
    </div>
  `
  return layoutHTML('관리자 설정', 'settings', content)
}

export default admin
