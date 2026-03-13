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

// ── GET /admin ───────────────────────────────────────
admin.get('/', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (isLoggedIn) return c.html(adminDashboardHTML())
  return c.html(adminLoginHTML())
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
  return c.redirect('/admin')
})

// ── POST /admin/logout ───────────────────────────────
admin.post('/logout', async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM app_settings WHERE key = 'admin_session_token'"
  ).run()
  setCookie(c, 'admin_session', '', { httpOnly: true, secure: true, maxAge: 0 })
  return c.redirect('/admin')
})

// ── POST /admin/change-password ──────────────────────
admin.post('/change-password', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin')

  const { current_password, new_password, confirm_password } = await c.req.parseBody()

  if (new_password !== confirm_password) {
    return c.html(adminDashboardHTML('새 비밀번호가 일치하지 않습니다.', '', true))
  }
  if ((new_password as string).length < 4) {
    return c.html(adminDashboardHTML('비밀번호는 최소 4자 이상이어야 합니다.', '', true))
  }

  const currentHashed = await hashPassword(current_password as string)
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null

  if (!row || row.value !== currentHashed) {
    return c.html(adminDashboardHTML('현재 비밀번호가 틀렸습니다.', '', true))
  }

  const newHashed = await hashPassword(new_password as string)
  await c.env.DB.prepare(
    "UPDATE app_settings SET value = ? WHERE key = 'admin_password'"
  ).bind(newHashed).run()

  return c.html(adminDashboardHTML('', '비밀번호가 성공적으로 변경되었습니다!', true))
})

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

// ── HTML: 관리자 대시보드 ────────────────────────────
function adminDashboardHTML(error = '', success = '', showPwModal = false) {
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

    /* 헤더 */
    .header { background: #1f2937; border-bottom: 1px solid #374151;
              padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; position: relative; }
    .logo-text { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #f59e0b, #ef4444);
                 -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

    /* ADMIN 드롭다운 */
    .admin-menu { position: relative; }
    .admin-btn { background: #374151; border: none; color: #f9fafb; padding: 8px 16px;
                 border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600;
                 display: flex; align-items: center; gap: 6px; }
    .admin-btn:hover { background: #4b5563; }
    .admin-btn .arrow { font-size: 10px; transition: transform 0.2s; }
    .admin-btn.open .arrow { transform: rotate(180deg); }
    .dropdown { display: none; position: absolute; right: 0; top: calc(100% + 8px);
                background: #1f2937; border: 1px solid #374151; border-radius: 10px;
                min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 100; overflow: hidden; }
    .dropdown.open { display: block; }
    .dropdown-item { display: block; width: 100%; padding: 12px 16px; background: none; border: none;
                     color: #d1d5db; font-size: 14px; text-align: left; cursor: pointer; }
    .dropdown-item:hover { background: #374151; color: white; }
    .dropdown-divider { border-top: 1px solid #374151; }
    .dropdown-item.danger { color: #f87171; }
    .dropdown-item.danger:hover { background: #450a0a; }

    /* 대시보드 콘텐츠 */
    .container { max-width: 800px; margin: 40px auto; padding: 0 24px; }
    .welcome { color: #9ca3af; font-size: 15px; margin-bottom: 24px; }
    .welcome strong { color: white; }

    /* 모달 */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7);
                     z-index: 200; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: #1f2937; border-radius: 16px; padding: 32px; width: 100%; max-width: 420px;
             box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    .modal-title { font-size: 18px; font-weight: 700; margin-bottom: 24px; }
    .modal-close { float: right; background: none; border: none; color: #9ca3af;
                   font-size: 20px; cursor: pointer; margin-top: -4px; }
    label { display: block; color: #d1d5db; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    input[type=password] { width: 100%; padding: 12px 16px; background: #374151; border: 1px solid #4b5563;
            border-radius: 10px; color: white; font-size: 15px; outline: none; transition: border 0.2s; }
    input[type=password]:focus { border-color: #f59e0b; }
    .field { margin-bottom: 16px; }
    .btn-primary { width: 100%; padding: 13px; background: linear-gradient(135deg, #f59e0b, #ef4444);
           border: none; border-radius: 10px; color: white; font-size: 15px; font-weight: 600;
           cursor: pointer; transition: opacity 0.2s; margin-top: 4px; }
    .btn-primary:hover { opacity: 0.9; }
    .error { background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 16px;
             border-radius: 10px; font-size: 14px; margin-bottom: 16px; }
    .success-msg { background: #052e16; border: 1px solid #22c55e; color: #86efac; padding: 12px 16px;
               border-radius: 10px; font-size: 14px; margin-bottom: 16px; }
    .hint { color: #6b7280; font-size: 12px; margin-top: 6px; }
  </style>
</head>
<body>
  <!-- 헤더 -->
  <div class="header">
    <div class="logo-text">RinGo 관리자</div>
    <div class="admin-menu">
      <button class="admin-btn" id="adminBtn" onclick="toggleDropdown()">
        ADMIN <span class="arrow">▼</span>
      </button>
      <div class="dropdown" id="adminDropdown">
        <button class="dropdown-item" onclick="openPwModal()">🔐 비밀번호 변경</button>
        <div class="dropdown-divider"></div>
        <form method="POST" action="/admin/logout" style="margin:0">
          <button type="submit" class="dropdown-item danger">🚪 로그아웃</button>
        </form>
      </div>
    </div>
  </div>

  <!-- 대시보드 본문 -->
  <div class="container">
    <p class="welcome">안녕하세요, <strong>admin</strong>님! RinGo 관리자 페이지입니다.</p>
  </div>

  <!-- 비밀번호 변경 모달 -->
  <div class="modal-overlay ${showPwModal ? 'open' : ''}" id="pwModal" onclick="closePwModalOutside(event)">
    <div class="modal">
      <div class="modal-title">
        🔐 비밀번호 변경
        <button class="modal-close" onclick="closePwModal()">✕</button>
      </div>
      ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
      ${success ? `<div class="success-msg">✅ ${success}</div>` : ''}
      <form method="POST" action="/admin/change-password">
        <div class="field">
          <label>현재 비밀번호</label>
          <input type="password" name="current_password" required autofocus>
        </div>
        <div class="field">
          <label>새 비밀번호</label>
          <input type="password" name="new_password" required>
          <p class="hint">최소 4자 이상</p>
        </div>
        <div class="field">
          <label>새 비밀번호 확인</label>
          <input type="password" name="confirm_password" required>
        </div>
        <button type="submit" class="btn-primary">변경하기</button>
      </form>
    </div>
  </div>

  <script>
    function toggleDropdown() {
      const btn = document.getElementById('adminBtn')
      const dd = document.getElementById('adminDropdown')
      btn.classList.toggle('open')
      dd.classList.toggle('open')
    }
    document.addEventListener('click', function(e) {
      const menu = document.querySelector('.admin-menu')
      if (!menu.contains(e.target)) {
        document.getElementById('adminBtn').classList.remove('open')
        document.getElementById('adminDropdown').classList.remove('open')
      }
    })
    function openPwModal() {
      document.getElementById('pwModal').classList.add('open')
      document.getElementById('adminDropdown').classList.remove('open')
      document.getElementById('adminBtn').classList.remove('open')
    }
    function closePwModal() {
      document.getElementById('pwModal').classList.remove('open')
    }
    function closePwModalOutside(e) {
      if (e.target === document.getElementById('pwModal')) closePwModal()
    }
  </script>
</body>
</html>`
}

export default admin
