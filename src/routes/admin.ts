// src/routes/admin.ts
import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import type { Bindings } from '../types'

const admin = new Hono<{ Bindings: Bindings }>()

const DEFAULT_PASSWORD = '1111'

// ── Firebase Storage 액세스 토큰 헬퍼 ──────────────────
async function getFirebaseStorageToken(serviceAccountJson: string): Promise<string> {
  const sa  = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  const sigInput = `${enc(header)}.${enc(payload)}`
  const keyDer = Uint8Array.from(atob(
    sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s+/g,'')
  ), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyDer.buffer,
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sigEnc = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:`${sigInput}.${sigEnc}` }),
  })
  const tokenData: any = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Storage 토큰 획득 실패')
  return tokenData.access_token
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifySession(c: any): Promise<boolean> {
  const sessionToken = getCookie(c, 'admin_session')
  if (!sessionToken) return false
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_session_token'"
  ).first() as { value: string } | null
  return row?.value === sessionToken
}

// ── GET /admin → 무조건 /admin/login ─────────────────
admin.get('/', async (c) => {
  return c.redirect('/admin/login')
})

// ── GET /admin/login ──────────────────────────────────
admin.get('/login', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (isLoggedIn) return c.redirect('/admin/dashboard')
  return c.html(adminLoginHTML())
})

// ── GET /admin/dashboard ──────────────────────────────
admin.get('/dashboard', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin/login')
  return c.html(adminDashboardHTML())
})

// ── GET /admin/settings ───────────────────────────────
admin.get('/settings', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.redirect('/admin/login')
  return c.html(adminSettingsHTML())
})

// ── POST /admin/login ─────────────────────────────────
admin.post('/login', async (c) => {
  const { username, password } = await c.req.parseBody()
  if (username !== 'admin') {
    return c.html(adminLoginHTML('아이디 또는 비밀번호가 틀렸습니다.'))
  }
  const hashed = await hashPassword(password as string)
  let row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'admin_password'"
  ).first() as { value: string } | null
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

// ── POST /admin/logout ────────────────────────────────
admin.post('/logout', async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM app_settings WHERE key = 'admin_session_token'"
  ).run()
  setCookie(c, 'admin_session', '', { httpOnly: true, secure: true, maxAge: 0 })
  return c.redirect('/admin/login')
})

// ── GET /admin/apk-info ───────────────────────────────
admin.get('/apk-info', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.json({ error: 'Unauthorized' }, 401)
  const row = await c.env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'apk_info'"
  ).first() as { value: string } | null
  if (!row) return c.json({})
  try {
    return c.json(JSON.parse(row.value))
  } catch {
    return c.json({})
  }
})

// ── POST /admin/upload-apk ────────────────────────────
// APK 파일을 Firebase Storage에 업로드하고 DB에 저장
admin.post('/upload-apk', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.json({ success: false, message: '로그인이 필요합니다.' }, 401)
  try {
    const serviceAccountJson = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    if (!serviceAccountJson) return c.json({ success: false, message: 'Firebase 서비스 계정 미설정' }, 500)

    const formData = await c.req.formData()
    const version  = (formData.get('version') as string || '').trim()
    const file     = formData.get('file') as File | null

    if (!version) return c.json({ success: false, message: '버전명을 입력하세요.' })
    if (!file)    return c.json({ success: false, message: 'APK 파일을 선택하세요.' })
    if (!file.name.endsWith('.apk')) return c.json({ success: false, message: '.apk 파일만 업로드 가능합니다.' })

    // Firebase Storage 설정
    const sa        = JSON.parse(serviceAccountJson)
    const projectId = sa.project_id || c.env.FCM_PROJECT_ID
    const bucket    = `${projectId}.firebasestorage.app`
    const filePath  = `apk/RinGo-${version}.apk`

    // 액세스 토큰 획득
    const accessToken = await getFirebaseStorageToken(serviceAccountJson)

    // Firebase Storage 업로드
    const encodedPath = encodeURIComponent(filePath)
    const uploadUrl   = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodedPath}`
    const fileBuffer  = await file.arrayBuffer()

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.android.package-archive',
      },
      body: fileBuffer,
    })
    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      return c.json({ success: false, message: `업로드 실패: ${uploadRes.status} ${errText}` })
    }

    // 파일 공개 설정 (allUsers에 reader 권한)
    const aclUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedPath}/acl`
    await fetch(aclUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity: 'allUsers', role: 'READER' }),
    }).catch(() => {}) // ACL 실패는 무시 (버킷 정책으로 공개일 경우)

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`

    // DB 저장
    const apkInfo = JSON.stringify({ version, url: downloadUrl, updated_at: new Date().toISOString() })
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('apk_info', ?)"
    ).bind(apkInfo).run()

    return c.json({ success: true, message: `${version} APK 업로드 완료!`, url: downloadUrl })
  } catch (err: any) {
    return c.json({ success: false, message: '업로드 실패: ' + err.message })
  }
})

// ── POST /admin/save-apk-url (기존 URL 입력 방식 유지) ──
admin.post('/save-apk-url', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.json({ success: false, message: '로그인이 필요합니다.' }, 401)
  try {
    const formData = await c.req.formData()
    const version = (formData.get('version') as string || '').trim()
    const url = (formData.get('url') as string || '').trim()
    if (!version) return c.json({ success: false, message: '버전명을 입력하세요.' })
    if (!url) return c.json({ success: false, message: 'URL을 입력하세요.' })
    const apkInfo = JSON.stringify({
      version,
      url,
      updated_at: new Date().toISOString()
    })
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('apk_info', ?)"
    ).bind(apkInfo).run()
    return c.json({ success: true, message: `${version} 다운로드 URL이 저장됐습니다!` })
  } catch (err: any) {
    return c.json({ success: false, message: '저장 실패: ' + err.message })
  }
})

// ── POST /admin/change-password ───────────────────────
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

// ── HTML: 로그인 페이지 ───────────────────────────────
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

// ── HTML: 관리자 대시보드 (기존 / 라우트 전체 통합) ──
function adminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RinGo 관리자</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root { --primary:#6366f1; }
  body { background:#0f172a; color:#e2e8f0; font-family:'Segoe UI',sans-serif; }
  .sidebar { background:linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%); border-right:1px solid #1e293b; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:12px; }
  .card-header { background:linear-gradient(135deg,#312e81,#1e1b4b); border-radius:12px 12px 0 0; }
  .btn-primary { background:linear-gradient(135deg,#6366f1,#4f46e5); }
  .btn-primary:hover { background:linear-gradient(135deg,#4f46e5,#3730a3); }
  .btn-success { background:linear-gradient(135deg,#10b981,#059669); }
  .btn-danger { background:linear-gradient(135deg,#ef4444,#dc2626); }
  .btn-warning { background:linear-gradient(135deg,#f59e0b,#d97706); }
  .btn-secondary { background:#334155; color:#e2e8f0; }
  .btn-secondary:hover { background:#475569; }
  .nav-item { transition:all 0.2s; border-radius:8px; border-left:3px solid transparent; }
  .nav-item:hover,.nav-item.active { background:rgba(99,102,241,0.2); color:#a5b4fc; }
  .nav-item.active { border-left-color:#6366f1; }
  .nav-item-settings:hover { background:rgba(245,158,11,0.15); color:#fbbf24; }
  .nav-item-settings.active { background:rgba(245,158,11,0.15); color:#fbbf24; border-left-color:#f59e0b; }
  .nav-item-logout:hover { background:rgba(239,68,68,0.15); color:#f87171; }
  .stat-card { background:linear-gradient(135deg,#1e293b,#0f172a); }
  .badge { padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600; }
  .badge-audio { background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); }
  .badge-video { background:rgba(168,85,247,0.2); color:#d8b4fe; border:1px solid rgba(168,85,247,0.3); }
  .badge-youtube { background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }
  .badge-completed { background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3); }
  .badge-processing { background:rgba(245,158,11,0.2); color:#fcd34d; border:1px solid rgba(245,158,11,0.3); }
  .badge-pending { background:rgba(100,116,139,0.2); color:#94a3b8; border:1px solid rgba(100,116,139,0.3); }
  .badge-failed { background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); }
  .badge-active { background:rgba(16,185,129,0.2); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3); }
  .badge-inactive { background:rgba(100,116,139,0.2); color:#94a3b8; border:1px solid rgba(100,116,139,0.3); }
  .badge-expired { background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.25); }
  .badge-full { background:rgba(245,158,11,0.2); color:#fcd34d; border:1px solid rgba(245,158,11,0.3); }
  .input-field { background:#0f172a; border:1px solid #334155; color:#e2e8f0; border-radius:8px; padding:8px 12px; width:100%; transition:border-color 0.2s; }
  .input-field:focus { outline:none; border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.1); }
  .input-field option { background:#1e293b; }
  .modal-overlay { background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); }
  .table-row:hover { background:rgba(99,102,241,0.05); }
  .spinner { animation:spin 1s linear infinite; }
  @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:500; box-shadow:0 10px 25px rgba(0,0,0,0.3); animation:slideIn 0.3s ease; }
  .toast.success { background:linear-gradient(135deg,#10b981,#059669); color:white; }
  .toast.error { background:linear-gradient(135deg,#ef4444,#dc2626); color:white; }
  @keyframes slideIn { from{transform:translateX(100px);opacity:0} to{transform:translateX(0);opacity:1} }
  ::-webkit-scrollbar { width:6px; height:6px; }
  ::-webkit-scrollbar-track { background:#0f172a; }
  ::-webkit-scrollbar-thumb { background:#334155; border-radius:3px; }
  .page { display:none; }
  .page.active { display:block; }
  .invite-token { font-family:monospace; font-size:12px; background:#0f172a; padding:4px 8px; border-radius:6px; border:1px solid #334155; color:#a5b4fc; letter-spacing:0.03em; }
  .link-card { background:#0f172a; border:1px solid #334155; border-radius:10px; transition:border-color 0.2s; }
  .link-card:hover { border-color:rgba(99,102,241,0.4); }
  .copy-btn { transition:all 0.15s; }
  .copy-btn.copied { background:rgba(16,185,129,0.2); color:#6ee7b7; }
  .progress-bar { height:4px; border-radius:2px; background:#1e293b; }
  .progress-fill { height:100%; border-radius:2px; transition:width 0.3s; }
  /* 설정 모달 */
  .settings-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); z-index:200; align-items:center; justify-content:center; }
  .settings-modal.open { display:flex; }
</style>
</head>
<body class="flex h-screen overflow-hidden">

<!-- 사이드바 -->
<div class="sidebar w-64 flex-shrink-0 flex flex-col h-full overflow-y-auto">
  <div class="p-6 border-b border-slate-700/50">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">
        <span style="font-size:18px;font-weight:900;color:white;">R</span>
      </div>
      <div>
        <h1 class="font-bold text-white text-sm">RinGo Admin</h1>
        <p class="text-slate-400 text-xs">관리자 페이지</p>
      </div>
    </div>
  </div>

  <div class="p-4 border-b border-slate-700/50">
    <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">채널 선택</label>
    <select id="globalChannelSelect" class="input-field text-sm" onchange="onChannelChange()">
      <option value="">전체 채널</option>
    </select>
  </div>

  <nav class="flex-1 p-4 space-y-1">
    <div class="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">메뉴</div>
    <a href="#" class="nav-item active flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('dashboard')">
      <i class="fas fa-chart-line w-4 text-center text-indigo-400"></i> 대시보드
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('members')">
      <i class="fas fa-user-gear w-4 text-center text-pink-400"></i> 회원 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('channels')">
      <i class="fas fa-layer-group w-4 text-center text-purple-400"></i> 채널 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('subscribers')">
      <i class="fas fa-users w-4 text-center text-emerald-400"></i> 구독자 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('alarms')">
      <i class="fas fa-bell w-4 text-center text-orange-400"></i> 알람 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('alarm-logs')">
      <i class="fas fa-history w-4 text-center text-yellow-400"></i> 알람 로그
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('invites')">
      <i class="fas fa-link w-4 text-center text-amber-400"></i> 초대 링크
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('contents')">
      <i class="fas fa-photo-film w-4 text-center text-blue-400"></i> 콘텐츠 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('notifications')">
      <i class="fas fa-paper-plane w-4 text-center text-sky-400"></i> 알림 발송
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('notices')">
      <i class="fas fa-bullhorn w-4 text-center text-amber-400"></i> 공지사항 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('terms')">
      <i class="fas fa-file-alt w-4 text-center text-teal-400"></i> 서비스 이용약관
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('privacy')">
      <i class="fas fa-shield-alt w-4 text-center text-green-400"></i> 개인정보보호정책
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('logs')">
      <i class="fas fa-list-check w-4 text-center text-rose-400"></i> 발송 로그
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('admin-alarm')">
      <i class="fas fa-satellite-dish w-4 text-center text-red-400"></i> 관리자 알람발송
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('download-mgmt')">
      <i class="fas fa-download w-4 text-center text-emerald-400"></i> 다운로드 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('banner-mgmt')">
      <i class="fas fa-image w-4 text-center text-pink-400"></i> 배너 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('reports')">
      <i class="fas fa-flag w-4 text-center text-red-400"></i> 신고 관리
    </a>
  </nav>

  <!-- 하단: 관리자 설정 + 로그아웃 -->
  <div class="p-4 border-t border-slate-700/50 space-y-1">
    <a href="#" class="nav-item nav-item-settings flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="openSettingsModal()">
      <i class="fas fa-cog w-4 text-center text-amber-400"></i> 관리자 설정
    </a>
    <form method="POST" action="/admin/logout" style="margin:0">
      <button type="submit" class="nav-item nav-item-logout w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer border-none bg-transparent">
        <i class="fas fa-sign-out-alt w-4 text-center text-red-400"></i> 로그아웃
      </button>
    </form>
  </div>
</div>

<!-- 메인 콘텐츠 -->
<div class="flex-1 flex flex-col h-full overflow-hidden">
  <header class="bg-slate-900 border-b border-slate-700/50 px-6 py-3 flex items-center justify-between flex-shrink-0">
    <h2 id="pageTitle" class="text-white font-semibold text-lg">대시보드</h2>
    <div class="flex items-center gap-3">
      <button onclick="refreshCurrentPage()" class="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
        <i class="fas fa-rotate-right"></i>
      </button>
      <div class="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
        <i class="fas fa-user-shield text-indigo-400 text-sm"></i>
        <span class="text-slate-300 text-sm">Admin</span>
      </div>
    </div>
  </header>

  <main class="flex-1 overflow-y-auto p-6">

    <!-- ===== 대시보드 ===== -->
    <div id="page-dashboard" class="page active">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center"><i class="fas fa-layer-group text-purple-400"></i></div>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-channels">-</div>
          <div class="text-slate-400 text-sm">전체 채널</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center"><i class="fas fa-link text-amber-400"></i></div>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-invites">-</div>
          <div class="text-slate-400 text-sm">활성 초대 링크</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center"><i class="fas fa-users text-emerald-400"></i></div>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-subscribers">-</div>
          <div class="text-slate-400 text-sm">전체 구독자</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-sky-500/20 rounded-xl flex items-center justify-center"><i class="fas fa-paper-plane text-sky-400"></i></div>
            <span id="acceptRate" class="text-sky-400 text-xs">-% 수락률</span>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-sent">-</div>
          <div class="text-slate-400 text-sm">총 발송 수</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="card lg:col-span-2">
          <div class="card-header px-5 py-4">
            <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-chart-bar text-indigo-400"></i> 최근 7일 발송 현황</h3>
          </div>
          <div class="p-5"><canvas id="dailyChart" height="200"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header px-5 py-4">
            <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-chart-pie text-purple-400"></i> 수락률</h3>
          </div>
          <div class="p-5 flex flex-col items-center">
            <canvas id="acceptChart" width="180" height="180"></canvas>
            <div class="mt-4 w-full space-y-2">
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-emerald-400"></div><span class="text-slate-300">수락</span></div>
                <span id="acceptCount" class="text-white font-semibold">-</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-red-400"></div><span class="text-slate-300">거절</span></div>
                <span id="rejectCount" class="text-white font-semibold">-</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-slate-500"></div><span class="text-slate-300">미응답</span></div>
                <span id="noResponseCount" class="text-white font-semibold">-</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header px-5 py-4 flex items-center justify-between">
          <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-clock-rotate-left text-amber-400"></i> 최근 알림 발송 내역</h3>
          <button onclick="showPage('notifications')" class="text-indigo-400 text-sm hover:text-indigo-300">전체 보기 →</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-700">
              <th class="text-left px-5 py-3 text-slate-400 font-medium">채널</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">콘텐츠</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">제목</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">대상</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">발송</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">수락률</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">일시</th>
            </tr></thead>
            <tbody id="recentBatchesTable"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== 채널 관리 ===== -->
    <div id="page-channels" class="page">
      <div class="flex justify-between items-center mb-4">
        <p class="text-slate-400 text-sm">폐쇄형 채널 — 초대 링크 없이는 채널 존재를 알 수 없습니다</p>
        <button onclick="openChannelModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <i class="fas fa-plus"></i> 채널 추가
        </button>
      </div>
      <!-- 검색 바 -->
      <div class="mb-4 flex items-center gap-2">
        <div class="relative flex-1 max-w-sm">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
          <input type="text" id="channelSearchInput" class="input-field pl-9 text-sm" placeholder="채널명 또는 운영자 검색..." oninput="filterChannels(this.value)">
        </div>
        <button onclick="document.getElementById('channelSearchInput').value=''; filterChannels('')" class="bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-colors">
          <i class="fas fa-times"></i>
        </button>
        <span id="channelCount" class="text-slate-500 text-xs ml-1"></span>
      </div>
      <div id="chBulkDeleteBar" class="hidden items-center gap-3 mb-3 bg-rose-900/20 border border-rose-500/30 rounded-lg px-4 py-2">
        <span id="chSelectedCount" class="text-rose-400 text-sm font-medium"></span>
        <button onclick="bulkDeleteChannels()" class="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded text-sm">
          <i class="fas fa-trash mr-1"></i>선택 삭제
        </button>
        <button onclick="clearChSelection()" class="text-slate-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-slate-700">취소</button>
      </div>
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-700 text-left">
              <th class="px-4 py-3"><input type="checkbox" id="chCheckAll" class="w-4 h-4 accent-indigo-500 cursor-pointer" onchange="toggleChCheckAll(this)"></th>
              <th class="px-5 py-3 text-slate-400 font-medium">채널</th>
              <th class="px-5 py-3 text-slate-400 font-medium text-center">구독자</th>
              <th class="px-5 py-3 text-slate-400 font-medium text-center">초대링크</th>
              <th class="px-5 py-3 text-slate-400 font-medium text-center">콘텐츠</th>
              <th class="px-5 py-3 text-slate-400 font-medium">운영자</th>
              <th class="px-5 py-3 text-slate-400 font-medium text-center">상태</th>
              <th class="px-5 py-3 text-slate-400 font-medium text-center">관리 (⭐인기채널 지정 포함)</th>
            </tr>
          </thead>
          <tbody id="channelsList"></tbody>
        </table>
      </div>
    </div>

    <!-- ===== 초대 링크 관리 ===== -->
    <div id="page-invites" class="page">
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center gap-3">
          <select id="inviteChannelFilter" class="input-field text-sm w-52" onchange="loadInvites()">
            <option value="">채널 선택...</option>
          </select>
          <span class="text-slate-500 text-sm" id="inviteLinkCount"></span>
        </div>
        <button onclick="openInviteModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <i class="fas fa-plus"></i> 초대 링크 생성
        </button>
      </div>
      <div class="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
        <i class="fas fa-circle-info text-indigo-400 mt-0.5 flex-shrink-0"></i>
        <div class="text-sm">
          <p class="text-indigo-300 font-semibold mb-1">폐쇄형 채널 초대 방식</p>
          <p class="text-slate-400">채널은 외부에 노출되지 않습니다. 초대 링크(<code class="text-indigo-400">/join/토큰</code>)를 받은 사용자만 채널에 참여할 수 있습니다.</p>
        </div>
      </div>
      <div id="invitesList" class="space-y-3"></div>
    </div>

    <!-- ===== 콘텐츠 관리 ===== -->
    <div id="page-contents" class="page">
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center gap-3">
          <select id="contentChannelFilter" class="input-field text-sm w-48" onchange="loadContents()">
            <option value="">전체 채널</option>
          </select>
          <select id="contentTypeFilter" class="input-field text-sm w-40" onchange="loadContents()">
            <option value="">전체 타입</option>
            <option value="audio">🎵 오디오</option>
            <option value="video">🎬 비디오</option>
            <option value="youtube">📺 유튜브</option>
          </select>
        </div>
        <button onclick="openContentModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <i class="fas fa-plus"></i> 콘텐츠 등록
        </button>
      </div>
      <div id="contentsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </div>

    <!-- ===== 구독자 관리 ===== -->
    <div id="page-subscribers" class="page">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <select id="subscriberChannelFilter" class="input-field text-sm w-48" onchange="loadSubscribers()">
          <option value="">전체 채널</option>
        </select>
        <select id="subscriberPlatformFilter" class="input-field text-sm w-40" onchange="loadSubscribers()">
          <option value="">전체 플랫폼</option>
          <option value="android">🤖 Android</option>
          <option value="ios">🍎 iOS</option>
          <option value="web">🌐 Web</option>
        </select>
        <span class="text-slate-400 text-sm" id="subscriberCount"></span>
        <div id="subBulkDeleteBar" class="hidden flex items-center gap-2 ml-auto">
          <span id="subSelectedCount" class="text-slate-300 text-sm font-semibold"></span>
          <button onclick="bulkDeleteSubscribers()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <i class="fas fa-trash mr-1"></i>선택 삭제
          </button>
          <button onclick="clearSubSelection()" class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded-xl text-sm transition-colors">취소</button>
        </div>
      </div>
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-700">
              <th class="px-4 py-3 w-8"><input type="checkbox" id="subCheckAll" onchange="toggleSubCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer"></th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">구독자</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">채널</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">가입 경로</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">플랫폼</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">수락</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">거절</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">구독일</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">삭제</th>
            </tr></thead>
            <tbody id="subscribersTable"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== 알림 발송 ===== -->
    <div id="page-notifications" class="page">
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div class="lg:col-span-2">
          <div class="card">
            <div class="card-header px-5 py-4">
              <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-paper-plane text-sky-400"></i> 새 알림 발송</h3>
            </div>
            <div class="p-5 space-y-4">
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 선택 *</label>
                <select id="notifChannel" class="input-field text-sm" onchange="loadNotifContents()">
                  <option value="">채널 선택...</option>
                </select>
              </div>
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">콘텐츠 선택 *</label>
                <select id="notifContent" class="input-field text-sm" onchange="onContentSelect()">
                  <option value="">먼저 채널을 선택하세요</option>
                </select>
              </div>
              <div id="contentPreview" class="hidden bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div class="flex gap-3">
                  <img id="previewThumbnail" src="" class="w-16 h-12 object-cover rounded-lg flex-shrink-0" onerror="this.style.display='none'">
                  <div>
                    <p id="previewTitle" class="text-white text-sm font-medium"></p>
                    <p id="previewType" class="text-slate-400 text-xs mt-1"></p>
                  </div>
                </div>
              </div>
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">알림 제목 *</label>
                <input id="notifTitle" type="text" class="input-field text-sm" placeholder="새 콘텐츠가 등록되었습니다 🎵">
              </div>
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">알림 내용 *</label>
                <textarea id="notifBody" class="input-field text-sm" rows="3" placeholder="내용을 입력하세요..."></textarea>
              </div>
              <div id="subscriberPreview" class="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-3 hidden">
                <div class="flex items-center gap-2 text-sm">
                  <i class="fas fa-users text-indigo-400"></i>
                  <span id="targetCount" class="text-indigo-300 font-semibold"></span>
                  <span class="text-slate-400">명에게 발송 예정</span>
                </div>
              </div>
              <button onclick="sendNotification()" id="sendBtn"
                class="btn-success w-full text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                <i class="fas fa-paper-plane"></i>
                <span id="sendBtnText">푸시 알림 발송</span>
              </button>
            </div>
          </div>
        </div>
        <div class="lg:col-span-3">
          <div class="card">
            <div class="card-header px-5 py-4 flex items-center justify-between">
              <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-history text-blue-400"></i> 발송 이력</h3>
              <button onclick="loadBatches()" class="text-slate-400 hover:text-white text-sm"><i class="fas fa-rotate-right mr-1"></i>새로고침</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="border-b border-slate-700">
                  <th class="text-left px-4 py-3 text-slate-400 font-medium">콘텐츠</th>
                  <th class="text-center px-4 py-3 text-slate-400 font-medium">대상</th>
                  <th class="text-center px-4 py-3 text-slate-400 font-medium">발송</th>
                  <th class="text-center px-4 py-3 text-slate-400 font-medium">수락률</th>
                  <th class="text-center px-4 py-3 text-slate-400 font-medium">상태</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-medium">일시</th>
                </tr></thead>
                <tbody id="batchesTable"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 공지사항 관리 ===== -->
    <div id="page-notices" class="page">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-white text-xl font-bold flex items-center gap-2"><i class="fas fa-bullhorn text-amber-400"></i> 공지사항 관리</h2>
        <button onclick="openNoticeModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <i class="fas fa-plus mr-1"></i> 공지사항 추가
        </button>
      </div>
      <div class="card overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-700/50">
              <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase">제목</th>
              <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase w-1/3">내용 미리보기</th>
              <th class="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase">상태</th>
              <th class="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase">등록일</th>
              <th class="px-5 py-3 text-center text-xs font-semibold text-slate-400 uppercase">관리</th>
            </tr>
          </thead>
          <tbody id="notices-table-body">
            <tr><td colspan="5" class="px-5 py-8 text-center text-slate-500">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== 개인정보보호정책 관리 ===== -->
    <div id="page-privacy" class="page">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-white text-xl font-bold flex items-center gap-2"><i class="fas fa-shield-alt text-green-400"></i> 개인정보보호정책 관리</h2>
        <button onclick="savePrivacy()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <i class="fas fa-save mr-1"></i> 저장
        </button>
      </div>
      <div class="card p-6">
        <label class="block text-slate-400 text-sm font-semibold mb-3">개인정보보호정책 내용</label>
        <textarea id="privacy-editor" class="w-full bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm p-4 resize-none focus:outline-none focus:border-green-400" style="min-height:480px;line-height:1.8;" placeholder="개인정보보호정책 내용을 입력하세요..."></textarea>
        <p class="text-slate-500 text-xs mt-2">* 앱의 '개인정보보호정책' 메뉴에 표시됩니다.</p>
      </div>
    </div>

    <!-- ===== 서비스 이용약관 관리 ===== -->
    <div id="page-terms" class="page">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-white text-xl font-bold flex items-center gap-2"><i class="fas fa-file-alt text-teal-400"></i> 서비스 이용약관 관리</h2>
        <button onclick="saveTerms()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <i class="fas fa-save mr-1"></i> 저장
        </button>
      </div>
      <div class="card p-6">
        <label class="block text-slate-400 text-sm font-semibold mb-3">이용약관 내용</label>
        <textarea id="terms-editor" class="w-full bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm p-4 resize-none focus:outline-none focus:border-teal-400" style="min-height:480px;line-height:1.8;" placeholder="서비스 이용약관 내용을 입력하세요..."></textarea>
        <p class="text-slate-500 text-xs mt-2">* 앱의 '서비스 이용약관' 메뉴에 표시됩니다.</p>
      </div>
    </div>

    <!-- ===== 발송 로그 ===== -->
    <div id="page-logs" class="page">
      <div class="flex gap-3 mb-4">
        <select id="logBatchFilter" class="input-field text-sm w-72" onchange="loadLogs()">
          <option value="">배치 선택 (최근 발송 이력)</option>
        </select>
        <select id="logStatusFilter" class="input-field text-sm w-40" onchange="filterLogs()">
          <option value="">전체 상태</option>
          <option value="sent">발송완료</option>
          <option value="accepted">수락</option>
          <option value="rejected">거절</option>
          <option value="failed">실패</option>
        </select>
      </div>
      <div id="batchStats" class="hidden card mb-4 p-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center"><div class="text-xl font-bold text-white" id="logStatTotal">-</div><div class="text-slate-400 text-xs">총 대상</div></div>
          <div class="text-center"><div class="text-xl font-bold text-blue-400" id="logStatSent">-</div><div class="text-slate-400 text-xs">발송 완료</div></div>
          <div class="text-center"><div class="text-xl font-bold text-emerald-400" id="logStatAccepted">-</div><div class="text-slate-400 text-xs">수락</div></div>
          <div class="text-center"><div class="text-xl font-bold text-red-400" id="logStatRejected">-</div><div class="text-slate-400 text-xs">거절</div></div>
        </div>
      </div>
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-700">
              <th class="text-left px-5 py-3 text-slate-400 font-medium">구독자</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">플랫폼</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">FCM 토큰</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">발송 시각</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">액션 시각</th>
            </tr></thead>
            <tbody id="logsTable"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== 알람 관리 ===== -->
    <div id="page-alarms" class="page">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-white" id="alarmStatTotal">-</div><div class="text-slate-400 text-sm mt-1">전체 알람</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-amber-400" id="alarmStatPending">-</div><div class="text-slate-400 text-sm mt-1">대기중</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-emerald-400" id="alarmStatTriggered">-</div><div class="text-slate-400 text-sm mt-1">발송완료</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-rose-400" id="alarmStatCancelled">-</div><div class="text-slate-400 text-sm mt-1">취소됨</div></div>
      </div>
      <div class="card mb-4">
        <div class="card-header px-5 py-4 flex flex-wrap items-center gap-3">
          <i class="fas fa-bell text-orange-400"></i>
          <span class="text-white font-semibold">알람 목록</span>
          <div id="alarmBulkDeleteBar" class="hidden flex items-center gap-2">
            <span id="alarmSelectedCount" class="text-slate-300 text-sm font-semibold"></span>
            <button onclick="bulkDeleteAlarms()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"><i class="fas fa-trash mr-1"></i>선택 삭제</button>
            <button onclick="clearAlarmSelection()" class="bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded-xl text-sm transition-colors">취소</button>
          </div>
          <div class="ml-auto flex items-center gap-2 flex-wrap">
            <select id="alarmFilterStatus" onchange="filterAlarms()" class="bg-slate-700 border border-slate-600 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
              <option value="">전체 상태</option>
              <option value="pending">대기중</option>
              <option value="triggered">발송완료</option>
              <option value="cancelled">취소됨</option>
            </select>
            <select id="alarmFilterChannel" onchange="filterAlarms()" class="bg-slate-700 border border-slate-600 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
              <option value="">전체 채널</option>
            </select>
            <button onclick="loadAlarmManagement()" class="btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2"><i class="fas fa-refresh"></i> 새로고침</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-slate-700/50">
                <th class="px-4 py-3 w-8"><input type="checkbox" id="alarmCheckAll" onchange="toggleAlarmCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer"></th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">채널</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">콘텐츠 유형</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">예약 시간</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">대상/발송</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">상태</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">등록일</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium text-sm">삭제</th>
              </tr>
            </thead>
            <tbody id="alarmTableBody"><tr><td colspan="8" class="text-center py-10 text-slate-500">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== 알람 로그 ===== -->
    <div id="page-alarm-logs" class="page">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center"><i class="fas fa-history text-yellow-400"></i></div>
            <div><h2 class="text-white font-bold text-lg">알람 로그</h2><p class="text-slate-400 text-sm">전체 알람 수신 이력</p></div>
          </div>
          <div class="flex items-center gap-2">
            <div id="alarmLogsBulkBar" class="hidden items-center gap-2">
              <span id="alarmLogsSelectedCount" class="text-slate-400 text-sm"></span>
              <button onclick="deleteSelectedAlarmLogs()" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm flex items-center gap-1"><i class="fas fa-trash-alt"></i> 선택 삭제</button>
              <button onclick="clearAlarmLogsSelection()" class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm">취소</button>
            </div>
            <button onclick="loadAlarmLogs()" class="btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2"><i class="fas fa-sync-alt"></i> 새로고침</button>
          </div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400">시작일</label>
            <input type="date" id="alarmLogsDateFrom" class="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" onkeydown="if(event.key==='Enter') searchAlarmLogs()">
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400">종료일</label>
            <input type="date" id="alarmLogsDateTo" class="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500" onkeydown="if(event.key==='Enter') searchAlarmLogs()">
          </div>
          <button onclick="searchAlarmLogs()" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i class="fas fa-search"></i> 검색</button>
          <button onclick="resetAlarmLogsSearch()" class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm">초기화</button>
          <span id="alarmLogsSearchInfo" class="text-xs text-slate-400 ml-1"></span>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-700/50">
                <tr class="text-slate-400 text-xs uppercase tracking-wider">
                  <th class="px-4 py-3 text-center w-10"><input type="checkbox" id="alarmLogsCheckAll" onchange="toggleAlarmLogsAll(this)" class="accent-indigo-500 cursor-pointer"></th>
                  <th class="px-4 py-3 text-left">ID</th>
                  <th class="px-4 py-3 text-left">채널</th>
                  <th class="px-4 py-3 text-left">발신자</th>
                  <th class="px-4 py-3 text-center">수신자</th>
                  <th class="px-4 py-3 text-left">타입</th>
                  <th class="px-4 py-3 text-left">컨텐츠</th>
                  <th class="px-4 py-3 text-left">상태</th>
                  <th class="px-4 py-3 text-left">시간</th>
                </tr>
              </thead>
              <tbody id="alarmLogsTableBody"><tr><td colspan="9" class="text-center py-8 text-slate-500">로딩 중...</td></tr></tbody>
            </table>
          </div>
          <div id="alarmLogsPagination" class="px-5 py-3 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400"></div>
        </div>
      </div>
    </div>

    <!-- ===== 회원 관리 ===== -->
    <div id="page-members" class="page">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-white" id="statTotal">-</div><div class="text-slate-400 text-sm mt-1">전체 회원</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-emerald-400" id="statActive">-</div><div class="text-slate-400 text-sm mt-1">활성 회원</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-sky-400" id="statFcm">-</div><div class="text-slate-400 text-sm mt-1">FCM 등록</div></div>
        <div class="card p-4 text-center"><div class="text-2xl font-bold text-amber-400" id="statWeek">-</div><div class="text-slate-400 text-sm mt-1">최근 7일 가입</div></div>
      </div>
      <div class="flex gap-3 mb-4 items-center flex-wrap">
        <input id="memberSearch" type="text" class="input-field flex-1 min-w-48" placeholder="이메일, 이름, ID 검색..." oninput="debounceSearchMembers()">
        <button onclick="loadMembers()" class="btn-primary text-white px-4 py-2 rounded-xl text-sm font-semibold"><i class="fas fa-search mr-1"></i>검색</button>
        <div id="bulkDeleteBar" class="hidden flex items-center gap-2">
          <span id="selectedCount" class="text-slate-300 text-sm font-semibold"></span>
          <button onclick="bulkDeleteMembers()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"><i class="fas fa-trash mr-1"></i>선택 삭제</button>
          <button onclick="clearMemberSelection()" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">취소</button>
        </div>
      </div>
      <div class="card overflow-hidden">
        <table class="w-full">
          <thead><tr class="border-b border-slate-700">
            <th class="px-4 py-3 w-10"><input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer"></th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">회원</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">이메일</th>
            <th class="text-center px-4 py-3 text-slate-400 font-medium">구독</th>
            <th class="text-center px-4 py-3 text-slate-400 font-medium">FCM</th>
            <th class="text-center px-4 py-3 text-slate-400 font-medium">상태</th>
            <th class="text-left px-4 py-3 text-slate-400 font-medium">가입일</th>
            <th class="text-center px-4 py-3 text-slate-400 font-medium">관리</th>
          </tr></thead>
          <tbody id="membersTable"></tbody>
        </table>
        <div id="memberPagination" class="px-5 py-3 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400"></div>
      </div>
    </div>

    <!-- ===== 관리자 알람발송 ===== -->
    <div id="page-admin-alarm" class="page">
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center"><i class="fas fa-satellite-dish text-red-400"></i></div>
          <div><h2 class="text-xl font-bold text-white">관리자 알람발송</h2><p class="text-slate-400 text-sm">관리자 채널을 통해 직접 알람을 발송합니다</p></div>
        </div>
        <div class="flex gap-2 border-b border-slate-700 pb-0">
          <button id="admin-tab-channel" onclick="adminShowTab('channel')" class="admin-tab active px-4 py-2 text-sm font-semibold text-white border-b-2 border-indigo-500 -mb-px"><i class="fas fa-layer-group mr-1.5"></i>채널 관리</button>
          <button id="admin-tab-members" onclick="adminShowTab('members')" class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white"><i class="fas fa-users mr-1.5"></i>구독자 관리</button>
          <button id="admin-tab-send" onclick="adminShowTab('send')" class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white"><i class="fas fa-paper-plane mr-1.5"></i>알람 발송</button>
          <button id="admin-tab-list" onclick="adminShowTab('list')" class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white"><i class="fas fa-calendar-check mr-1.5"></i>예약 알람</button>
        </div>
        <div id="admin-tab-content-channel">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-semibold">관리자 채널 목록</h3>
            <button onclick="adminOpenCreateChannel()" class="btn-primary text-white px-4 py-2 rounded-xl text-sm font-semibold"><i class="fas fa-plus mr-1.5"></i>채널 생성</button>
          </div>
          <div id="admin-channel-list" class="space-y-3"><div class="text-slate-500 text-sm text-center py-8"><i class="fas fa-spinner spin mr-2"></i>불러오는 중...</div></div>
        </div>
        <div id="admin-tab-content-members" class="hidden">
          <div class="mb-4">
            <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">관리할 채널 선택</label>
            <select id="admin-member-channel-select" onchange="adminLoadMemberPanels()" class="input-field text-sm"><option value="">채널을 선택하세요</option></select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="card rounded-xl overflow-hidden">
              <div class="card-header p-3 flex items-center justify-between">
                <span class="text-white text-sm font-semibold"><i class="fas fa-users mr-1.5 text-blue-300"></i>전체 회원</span>
                <span id="admin-left-count" class="text-slate-400 text-xs">0명</span>
              </div>
              <div class="p-3 border-b border-slate-700 space-y-2">
                <select id="admin-left-filter" onchange="adminLoadLeftMembers(1)" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs">
                  <option value="">전체 회원</option>
                  <option value="fcm">FCM 있는 회원만</option>
                </select>
                <input id="admin-left-search" type="text" placeholder="이름/이메일 검색..." oninput="adminLeftSearchDebounce()" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs placeholder-slate-500">
              </div>
              <div id="admin-left-list" class="overflow-y-auto" style="max-height:360px;"><div class="text-slate-500 text-xs text-center py-6">채널을 선택하세요</div></div>
              <div class="p-3 border-t border-slate-700 flex items-center justify-between gap-2">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer"><input type="checkbox" id="admin-left-all" onchange="adminToggleAllLeft(this.checked)" class="w-3.5 h-3.5 accent-indigo-500"> 전체선택</label>
                <button onclick="adminForceSubscribe()" class="btn-success text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex-1"><i class="fas fa-arrow-right mr-1"></i>가입</button>
              </div>
              <div id="admin-left-pagination" class="flex justify-center gap-1 p-2 border-t border-slate-700"></div>
            </div>
            <div class="card rounded-xl overflow-hidden">
              <div class="card-header p-3 flex items-center justify-between">
                <span class="text-white text-sm font-semibold"><i class="fas fa-check-circle mr-1.5 text-emerald-300"></i>채널 구독자</span>
                <span id="admin-right-count" class="text-slate-400 text-xs">0명</span>
              </div>
              <div class="p-3 border-b border-slate-700">
                <input id="admin-right-search" type="text" placeholder="이름/이메일 검색..." oninput="adminRightSearchDebounce()" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs placeholder-slate-500">
              </div>
              <div id="admin-right-list" class="overflow-y-auto" style="max-height:360px;"><div class="text-slate-500 text-xs text-center py-6">채널을 선택하세요</div></div>
              <div class="p-3 border-t border-slate-700 flex items-center justify-between gap-2">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer"><input type="checkbox" id="admin-right-all" onchange="adminToggleAllRight(this.checked)" class="w-3.5 h-3.5 accent-indigo-500"> 전체선택</label>
                <button onclick="adminForceUnsubscribe()" class="btn-danger text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex-1"><i class="fas fa-arrow-left mr-1"></i>채널 나가기</button>
              </div>
            </div>
          </div>
        </div>
        <div id="admin-tab-content-send" class="hidden">
          <div class="card rounded-xl p-5 space-y-4">
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">발송 채널 *</label>
              <select id="admin-send-channel" class="input-field text-sm"><option value="">채널을 선택하세요</option></select>
            </div>
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">컨텐츠 타입 *</label>
              <div class="grid grid-cols-4 gap-2">
                <button onclick="adminSelectMsgType('youtube')" id="admin-type-youtube" class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-indigo-500 bg-indigo-500/10 text-white text-xs font-semibold cursor-pointer"><i class="fab fa-youtube text-red-400 text-lg"></i>YouTube</button>
                <button onclick="adminSelectMsgType('audio')" id="admin-type-audio" class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer"><i class="fas fa-music text-purple-400 text-lg"></i>오디오</button>
                <button onclick="adminSelectMsgType('video')" id="admin-type-video" class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer"><i class="fas fa-video text-blue-400 text-lg"></i>비디오</button>
                <button onclick="adminSelectMsgType('file')" id="admin-type-file" class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer"><i class="fas fa-file text-orange-400 text-lg"></i>파일</button>
              </div>
            </div>
            <div>
              <label id="admin-send-url-label" class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">YouTube URL *</label>
              <input id="admin-send-url" type="url" class="input-field text-sm" placeholder="https://youtu.be/...">
            </div>
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">링크 URL <span class="text-slate-500 normal-case font-normal">(선택)</span></label>
              <input id="admin-send-link-url" type="url" class="input-field text-sm" placeholder="https://...">
            </div>
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">발송 시간 *</label>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="text-slate-500 text-xs mb-1 block">날짜</label><input id="admin-send-date" type="date" class="input-field text-sm w-full" onchange="adminUpdateTimePreview()"></div>
                <div><label class="text-slate-500 text-xs mb-1 block">시간</label><select id="admin-send-hour" class="input-field text-sm w-full" onchange="adminUpdateTimePreview()"></select></div>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label class="text-slate-500 text-xs mb-1 block">분</label>
                  <select id="admin-send-minute" class="input-field text-sm w-full" onchange="adminUpdateTimePreview()">
                    ${Array.from({length:60},(_,i)=>`<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}분</option>`).join('')}
                  </select>
                </div>
                <div class="flex items-end">
                  <div id="admin-send-time-preview" class="w-full text-center py-2 rounded-xl bg-indigo-900/30 border border-indigo-500/30 text-indigo-300 text-sm font-semibold">-</div>
                </div>
              </div>
            </div>
            <button onclick="adminSendAlarm()" class="w-full btn-primary text-white py-3 rounded-xl font-bold text-sm"><i class="fas fa-satellite-dish mr-2"></i>알람 발송</button>
          </div>
        </div>
        <div id="admin-tab-content-list" class="hidden">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-semibold">예약된 알람 목록</h3>
            <button onclick="adminLoadReservationList()" class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
          </div>
          <div id="admin-reservation-list" class="space-y-3"><div class="text-slate-500 text-sm text-center py-8"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div></div>
        </div>
      </div>
    </div>

    <!-- 다운로드 관리 페이지 -->
    <div id="page-download-mgmt" class="page">
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center"><i class="fas fa-download text-emerald-400"></i></div>
          <div><h2 class="text-xl font-bold text-white">다운로드 관리</h2><p class="text-slate-400 text-sm">APK 파일을 업로드하면 다운로드 페이지에 자동 반영됩니다</p></div>
        </div>

        <!-- 현재 배포 중인 APK -->
        <div class="card rounded-xl p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-info-circle mr-2 text-blue-400"></i>현재 배포 중인 APK</h3>
          <div id="current-apk-url-display" class="text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>
        </div>

        <!-- APK 파일 업로드 -->
        <div class="card rounded-xl p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-upload mr-2 text-emerald-400"></i>새 APK 업로드</h3>

          <div class="mb-4">
            <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">버전명 <span class="text-red-400">*</span></label>
            <input type="text" id="apkVersionInput" class="input-field text-sm" placeholder="예: v2.3.51">
          </div>

          <div class="mb-4">
            <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">APK 파일 선택 <span class="text-red-400">*</span></label>
            <div class="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-500 transition-colors" onclick="document.getElementById('apkFileInput').click()">
              <i class="fas fa-cloud-upload-alt text-3xl text-slate-500 mb-2 block"></i>
              <p class="text-slate-400 text-sm" id="apkFileLabel">클릭하여 APK 파일 선택</p>
              <p class="text-slate-600 text-xs mt-1">.apk 파일만 업로드 가능</p>
            </div>
            <input type="file" id="apkFileInput" accept=".apk" class="hidden" onchange="onApkFileSelected(this)">
          </div>

          <!-- 업로드 진행 표시 -->
          <div id="apk-upload-progress" class="mb-4 hidden">
            <div class="flex justify-between text-xs text-slate-400 mb-1">
              <span>업로드 중...</span>
              <span id="apk-progress-pct">0%</span>
            </div>
            <div class="w-full bg-slate-700 rounded-full h-2">
              <div id="apk-progress-bar" class="bg-emerald-500 h-2 rounded-full transition-all" style="width:0%"></div>
            </div>
          </div>

          <div id="apk-upload-result" class="mb-4 hidden"></div>

          <button onclick="uploadApkFile()" id="apkUploadBtn" class="w-full btn-primary text-white py-3 rounded-xl text-sm font-semibold">
            <i class="fas fa-upload mr-2"></i>업로드 &amp; 배포
          </button>
        </div>
      </div>
    </div>

    <!-- ===== 배너 관리 페이지 ===== -->
    <div id="page-banner-mgmt" class="page">
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-pink-600/20 flex items-center justify-center"><i class="fas fa-image text-pink-400"></i></div>
      <div><h2 class="text-xl font-bold text-white">배너 관리</h2><p class="text-slate-400 text-sm">홈 화면 상단 배너를 설정합니다</p></div>
    </div>

    <!-- 현재 배너 상태 -->
    <div class="card rounded-xl p-5">
      <h3 class="text-white font-semibold mb-4"><i class="fas fa-eye mr-2 text-pink-400"></i>현재 배너 상태</h3>
      <div id="banner-current-status" class="text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>
    </div>

    <!-- 배너 설정 -->
    <div class="card rounded-xl p-5 space-y-5">
      <h3 class="text-white font-semibold"><i class="fas fa-edit mr-2 text-pink-400"></i>배너 설정</h3>

      <!-- ON/OFF 토글 -->
      <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
        <div>
          <div class="text-white text-sm font-semibold">배너 표시</div>
          <div class="text-slate-400 text-xs mt-0.5">홈 화면 상단에 배너 노출 여부</div>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" id="banner-enabled" class="sr-only peer">
          <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
        </label>
      </div>

      <!-- 배너 타입 -->
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">배너 타입</label>
        <select id="banner-type" class="input-field text-sm" onchange="toggleBannerType()">
          <option value="svg">기본 SVG 배너 (내장)</option>
          <option value="image">이미지 URL 배너</option>
        </select>
      </div>

      <!-- 이미지 URL (이미지 타입일 때만 표시) -->
      <div id="banner-image-url-wrap">
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">이미지 URL</label>
        <input type="url" id="banner-image-url" class="input-field text-sm" placeholder="https://example.com/banner.jpg">
        <p class="text-slate-500 text-xs mt-1.5">권장 사이즈: 가로 전체 × 높이 120px (3:1 비율)</p>
      </div>

      <!-- 링크 URL -->
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">클릭 링크 URL <span class="text-slate-500 font-normal normal-case">(선택사항)</span></label>
        <input type="url" id="banner-link-url" class="input-field text-sm" placeholder="https://example.com (없으면 비워두세요)">
        <p class="text-slate-500 text-xs mt-1.5">배너 클릭 시 이동할 URL. 비워두면 클릭해도 아무 동작 안 함</p>
      </div>

      <!-- 저장 버튼 -->
      <button onclick="saveBannerSettings()" class="w-full btn-primary text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
        <i class="fas fa-save"></i> 배너 설정 저장
      </button>
    </div>

    <!-- 미리보기 -->
    <div class="card rounded-xl p-5">
      <h3 class="text-white font-semibold mb-4"><i class="fas fa-mobile-alt mr-2 text-blue-400"></i>배너 미리보기</h3>
      <div id="banner-preview" class="rounded-2xl overflow-hidden" style="max-width:380px;min-height:120px;background:linear-gradient(135deg,#1a1040,#2d1b6e,#0f4c75);display:flex;align-items:center;padding:20px;">
        <span class="text-white text-sm opacity-60">미리보기 영역</span>
      </div>
    </div>
  </div>
</div>

    <!-- ===== 신고 관리 ===== -->
    <div id="page-reports" class="page">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center"><i class="fas fa-flag text-red-400"></i></div>
            <div><h2 class="text-xl font-bold text-white">신고 관리</h2><p class="text-slate-400 text-sm">접수된 신고를 검토하고 처리합니다</p></div>
          </div>
          <div class="flex items-center gap-2">
            <select id="report-filter-status" onchange="loadReports()" class="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none">
              <option value="">전체 상태</option>
              <option value="pending">검토 대기</option>
              <option value="reviewing">검토 중</option>
              <option value="resolved">처리 완료</option>
              <option value="dismissed">기각</option>
            </select>
            <select id="report-filter-type" onchange="loadReports()" class="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none">
              <option value="">전체 유형</option>
              <option value="channel">채널</option>
              <option value="alarm">알람</option>
            </select>
            <button onclick="loadReports()" class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2"><i class="fas fa-rotate-right"></i></button>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="card p-4 rounded-xl"><div class="text-2xl font-bold text-white" id="rstat-total">-</div><div class="text-slate-400 text-sm mt-1">전체 신고</div></div>
          <div class="card p-4 rounded-xl"><div class="text-2xl font-bold text-amber-400" id="rstat-pending">-</div><div class="text-slate-400 text-sm mt-1">검토 대기</div></div>
          <div class="card p-4 rounded-xl"><div class="text-2xl font-bold text-emerald-400" id="rstat-resolved">-</div><div class="text-slate-400 text-sm mt-1">처리 완료</div></div>
          <div class="card p-4 rounded-xl"><div class="text-2xl font-bold text-slate-400" id="rstat-dismissed">-</div><div class="text-slate-400 text-sm mt-1">기각</div></div>
        </div>
        <div class="card rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">신고일시</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">유형</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">신고 사유</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">채널명 / 알람</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">신고자</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">대상</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">상태</th>
                  <th class="text-left px-4 py-3 text-slate-400 font-semibold">처리</th>
                </tr>
              </thead>
              <tbody id="reports-tbody">
                <tr><td colspan="8" class="text-center py-10 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</td></tr>
              </tbody>
            </table>
          </div>
          <div id="reports-pagination" class="px-4 py-3 border-t border-slate-700/50 flex items-center justify-between text-slate-400 text-sm"></div>
        </div>
        <div id="report-detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center;">
          <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;width:90%;max-width:520px;max-height:80vh;overflow-y:auto;padding:24px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
              <h3 style="color:white;font-size:18px;font-weight:700;">신고 상세</h3>
              <button onclick="document.getElementById('report-detail-modal').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div id="report-detail-content"></div>
          </div>
        </div>
      </div>
    </div>

  </main>
</div>

<!-- ===== 각종 모달 ===== -->
<div id="memberModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
    <div class="card-header px-6 py-4 flex items-center justify-between sticky top-0">
      <h3 class="text-white font-semibold"><i class="fas fa-user mr-2"></i>회원 상세</h3>
      <button onclick="closeModal('memberModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div id="memberModalContent" class="p-6"></div>
  </div>
</div>

<div id="channelModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-md mx-4">
    <div class="card-header px-6 py-4 flex items-center justify-between">
      <h3 id="channelModalTitle" class="text-white font-semibold">채널 추가</h3>
      <button onclick="closeModal('channelModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <input type="hidden" id="channelId">
      <div class="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300"><i class="fas fa-lock mr-1"></i> 채널은 외부에 비공개입니다.</div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널명 *</label><input id="channelName" type="text" class="input-field" placeholder="힐링 뮤직 채널"></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label><textarea id="channelDescription" class="input-field" rows="2" placeholder="채널 설명"></textarea></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">이미지 URL</label><input id="channelImageUrl" type="url" class="input-field" placeholder="https://..."></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Owner ID *</label><input id="channelOwnerId" type="text" class="input-field" value="admin"></div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('channelModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveChannel()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold">저장</button>
      </div>
    </div>
  </div>
</div>

<div id="inviteModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-md mx-4">
    <div class="card-header px-6 py-4 flex items-center justify-between">
      <h3 class="text-white font-semibold flex items-center gap-2"><i class="fas fa-link text-amber-400"></i> 초대 링크 생성</h3>
      <button onclick="closeModal('inviteModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 *</label><select id="inviteChannelId" class="input-field"><option value="">채널 선택...</option></select></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">링크 이름</label><input id="inviteLabel" type="text" class="input-field" placeholder="예: 카카오톡 공유용"></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">최대 사용 횟수</label><input id="inviteMaxUses" type="number" min="1" class="input-field" placeholder="무제한"><p class="text-slate-500 text-xs mt-1">비워두면 무제한</p></div>
        <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">만료 (일)</label><input id="inviteExpiresDays" type="number" min="1" class="input-field" placeholder="무기한"><p class="text-slate-500 text-xs mt-1">비워두면 무기한</p></div>
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('inviteModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveInvite()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold"><i class="fas fa-link mr-1"></i>링크 생성</button>
      </div>
    </div>
  </div>
</div>

<div id="contentModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
    <div class="card-header px-6 py-4 flex items-center justify-between sticky top-0">
      <h3 class="text-white font-semibold">콘텐츠 등록</h3>
      <button onclick="closeModal('contentModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 *</label><select id="contentChannelId" class="input-field"></select></div>
      <div class="grid grid-cols-2 gap-4">
        <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">타입 *</label><select id="contentType" class="input-field" onchange="onContentTypeChange()"><option value="audio">🎵 오디오</option><option value="video">🎬 비디오</option><option value="youtube">📺 유튜브</option></select></div>
        <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">재생 시간(초)</label><input id="contentDuration" type="number" class="input-field" placeholder="245"></div>
      </div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">제목 *</label><input id="contentTitle" type="text" class="input-field" placeholder="콘텐츠 제목"></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label><textarea id="contentDescription" class="input-field" rows="2"></textarea></div>
      <div><label id="contentUrlLabel" class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">콘텐츠 URL *</label><input id="contentUrl" type="url" class="input-field" placeholder="https://..."></div>
      <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">썸네일 URL</label><input id="contentThumbnail" type="url" class="input-field" placeholder="https://..."></div>
      <div class="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" id="sendAfterCreate" class="w-4 h-4 accent-indigo-500">
          <div><span class="text-amber-300 text-sm font-semibold">등록 후 즉시 푸시 알림 발송</span><p class="text-slate-400 text-xs mt-0.5">채널 구독자 전체에게 즉시 발송</p></div>
        </label>
        <div id="notifSettingsDiv" class="hidden mt-3 space-y-2">
          <input id="autoNotifTitle" type="text" class="input-field text-sm" placeholder="알림 제목">
          <textarea id="autoNotifBody" class="input-field text-sm" rows="2" placeholder="알림 내용"></textarea>
        </div>
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('contentModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveContent()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold"><i class="fas fa-cloud-arrow-up mr-2"></i>등록</button>
      </div>
    </div>
  </div>
</div>

<div id="adminChannelModal" class="modal-overlay hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50">
  <div class="card rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
    <h3 id="adminChannelModalTitle" class="text-white font-bold text-lg">채널 생성</h3>
    <input type="hidden" id="adminChannelId">
    <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널명 *</label><input id="adminChannelName" type="text" class="input-field text-sm" placeholder="채널명"></div>
    <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 설명</label><textarea id="adminChannelDesc" class="input-field text-sm" rows="2" placeholder="채널 설명"></textarea></div>
    <div><label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">홈페이지 URL</label><input id="adminChannelHomepage" type="text" class="input-field text-sm" placeholder="https://..."></div>
    <div>
      <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">대표 이미지</label>
      <div class="flex items-center gap-2 mb-2">
        <label class="cursor-pointer btn-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold"><i class="fas fa-upload mr-1.5"></i>파일 선택<input type="file" id="adminChannelImageFile" accept="image/*" class="hidden" onchange="adminPreviewChannelImage(this)"></label>
        <span class="text-slate-500 text-xs">또는</span>
        <input id="adminChannelImageUrl" type="url" class="input-field text-sm flex-1" placeholder="이미지 URL 직접 입력">
      </div>
      <div id="adminChannelImagePreview" class="mt-2 hidden">
        <img id="adminChannelImgTag" src="" class="w-16 h-16 rounded-xl object-cover border border-slate-600">
        <button onclick="adminClearChannelImage()" class="mt-1 text-xs text-red-400 hover:text-red-300"><i class="fas fa-times mr-1"></i>이미지 제거</button>
      </div>
    </div>
    <div class="flex gap-3 pt-2">
      <button onclick="closeAdminChannelModal()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
      <button onclick="adminSaveChannel()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold"><i class="fas fa-save mr-1.5"></i>저장</button>
    </div>
  </div>
</div>

<!-- ===== 관리자 설정 모달 ===== -->
<div class="settings-modal" id="settingsModal" onclick="closeSettingsModalOutside(event)">
  <div class="card w-full max-w-md mx-4 rounded-2xl p-8" style="background:#1f2937;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <h3 style="font-size:18px;font-weight:700;color:white;">⚙️ 관리자 설정</h3>
      <button onclick="closeSettingsModal()" style="background:none;border:none;color:#9ca3af;font-size:20px;cursor:pointer;">✕</button>
    </div>
    <h4 style="font-size:15px;font-weight:600;color:#f9fafb;margin-bottom:20px;">🔐 비밀번호 변경</h4>
    <div id="settingsError" style="display:none;background:#450a0a;border:1px solid #ef4444;color:#fca5a5;padding:12px 16px;border-radius:10px;font-size:14px;margin-bottom:16px;"></div>
    <div id="settingsSuccess" style="display:none;background:#052e16;border:1px solid #22c55e;color:#86efac;padding:12px 16px;border-radius:10px;font-size:14px;margin-bottom:16px;"></div>
    <form id="settingsForm" onsubmit="submitChangePassword(event)">
      <div style="margin-bottom:16px;">
        <label style="display:block;color:#d1d5db;font-size:14px;font-weight:500;margin-bottom:6px;">현재 비밀번호</label>
        <input type="password" id="settingsCurrent" required style="width:100%;padding:12px 16px;background:#374151;border:1px solid #4b5563;border-radius:10px;color:white;font-size:15px;outline:none;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;color:#d1d5db;font-size:14px;font-weight:500;margin-bottom:6px;">새 비밀번호</label>
        <input type="password" id="settingsNew" required style="width:100%;padding:12px 16px;background:#374151;border:1px solid #4b5563;border-radius:10px;color:white;font-size:15px;outline:none;box-sizing:border-box;">
        <p style="color:#6b7280;font-size:12px;margin-top:6px;">최소 4자 이상</p>
      </div>
      <div style="margin-bottom:24px;">
        <label style="display:block;color:#d1d5db;font-size:14px;font-weight:500;margin-bottom:6px;">새 비밀번호 확인</label>
        <input type="password" id="settingsConfirm" required style="width:100%;padding:12px 16px;background:#374151;border:1px solid #4b5563;border-radius:10px;color:white;font-size:15px;outline:none;box-sizing:border-box;">
      </div>
      <button type="submit" style="width:100%;padding:13px;background:linear-gradient(135deg,#f59e0b,#ef4444);border:none;border-radius:10px;color:white;font-size:15px;font-weight:600;cursor:pointer;">변경하기</button>
    </form>
  </div>
</div>




<script src="/static/app.js"></script>
<script>
// 관리자 설정 모달 제어
function openSettingsModal() {
  document.getElementById('settingsModal').classList.add('open')
  document.getElementById('settingsCurrent').value = ''
  document.getElementById('settingsNew').value = ''
  document.getElementById('settingsConfirm').value = ''
  document.getElementById('settingsError').style.display = 'none'
  document.getElementById('settingsSuccess').style.display = 'none'
  setTimeout(() => document.getElementById('settingsCurrent').focus(), 100)
}
function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('open')
}
function closeSettingsModalOutside(e) {
  if (e.target === document.getElementById('settingsModal')) closeSettingsModal()
}
// ── 다운로드 관리 ──────────────────────────────────────
async function loadCurrentApkInfo() {
  try {
    const res  = await fetch('/admin/apk-info')
    const data = await res.json()
    const el   = document.getElementById('current-apk-url-display')
    if (data.url) {
      el.innerHTML =
        '<div class="space-y-2">' +
          '<p class="text-white font-semibold text-sm"><i class="fas fa-tag mr-2 text-emerald-400"></i>버전: ' + (data.version || '-') + '</p>' +
          '<p class="text-slate-400 text-xs break-all"><i class="fas fa-link mr-2"></i>' + data.url + '</p>' +
          '<p class="text-slate-500 text-xs">업데이트: ' + (data.updated_at ? new Date(data.updated_at).toLocaleString('ko-KR') : '-') + '</p>' +
          '<a href="' + data.url + '" target="_blank" class="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 mt-1"><i class="fas fa-external-link-alt"></i> 다운로드 링크 확인</a>' +
        '</div>'
      document.getElementById('apkVersionInput').value = data.version || ''
    } else {
      el.innerHTML = '<p class="text-slate-500"><i class="fas fa-exclamation-circle mr-2"></i>배포 중인 APK가 없습니다.</p>'
    }
  } catch(e) {
    document.getElementById('current-apk-url-display').innerHTML = '<p class="text-red-400">불러오기 실패</p>'
  }
}

function onApkFileSelected(input) {
  const file = input.files[0]
  const label = document.getElementById('apkFileLabel')
  if (file) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    label.innerHTML = '<i class="fas fa-file mr-1 text-emerald-400"></i>' + file.name + ' (' + sizeMB + ' MB)'
  } else {
    label.textContent = '클릭하여 APK 파일 선택'
  }
}

async function uploadApkFile() {
  const version   = document.getElementById('apkVersionInput').value.trim()
  const fileInput = document.getElementById('apkFileInput')
  const file      = fileInput.files[0]
  const resultEl  = document.getElementById('apk-upload-result')
  const progressWrap = document.getElementById('apk-upload-progress')
  const progressBar  = document.getElementById('apk-progress-bar')
  const progressPct  = document.getElementById('apk-progress-pct')
  const btn       = document.getElementById('apkUploadBtn')

  if (!version) { alert('버전명을 입력하세요. (예: v2.3.51)'); return }
  if (!file)    { alert('APK 파일을 선택하세요.'); return }

  // 진행 바 표시
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>업로드 중...'
  progressWrap.classList.remove('hidden')
  resultEl.classList.add('hidden')

  // XHR로 업로드 진행률 표시
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('version', version)
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100)
        progressBar.style.width = pct + '%'
        progressPct.textContent = pct + '%'
      }
    })
    xhr.addEventListener('load', () => {
      progressWrap.classList.add('hidden')
      btn.disabled = false
      btn.innerHTML = '<i class="fas fa-upload mr-2"></i>업로드 & 배포'
      try {
        const data = JSON.parse(xhr.responseText)
        if (data.success) {
          resultEl.innerHTML = '<div class="bg-emerald-900/30 border border-emerald-600/30 text-emerald-300 px-4 py-3 rounded-xl text-sm"><i class="fas fa-check-circle mr-2"></i>' + data.message + '</div>'
          fileInput.value = ''
          document.getElementById('apkFileLabel').textContent = '클릭하여 APK 파일 선택'
          loadCurrentApkInfo()
        } else {
          resultEl.innerHTML = '<div class="bg-red-900/30 border border-red-600/30 text-red-300 px-4 py-3 rounded-xl text-sm"><i class="fas fa-exclamation-circle mr-2"></i>' + data.message + '</div>'
        }
      } catch(e) {
        resultEl.innerHTML = '<div class="bg-red-900/30 border border-red-600/30 text-red-300 px-4 py-3 rounded-xl text-sm">응답 파싱 오류</div>'
      }
      resultEl.classList.remove('hidden')
      resolve(null)
    })
    xhr.addEventListener('error', () => {
      progressWrap.classList.add('hidden')
      btn.disabled = false
      btn.innerHTML = '<i class="fas fa-upload mr-2"></i>업로드 & 배포'
      resultEl.innerHTML = '<div class="bg-red-900/30 border border-red-600/30 text-red-300 px-4 py-3 rounded-xl text-sm">네트워크 오류가 발생했습니다.</div>'
      resultEl.classList.remove('hidden')
      resolve(null)
    })
    xhr.open('POST', '/admin/upload-apk')
    xhr.send(formData)
  })
}

// ── 배너 관리 함수 ──────────────────────────────────
async function loadBannerSettings() {
  try {
    const res = await fetch('/api/settings/banner')
    const data = await res.json()
    const banner = data?.data ? JSON.parse(data.data) : null
    const statusEl = document.getElementById('banner-current-status')
    if (banner) {
      const enabledBadge = banner.enabled
        ? '<span class="badge" style="background:rgba(16,185,129,0.2);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);">ON</span>'
        : '<span class="badge" style="background:rgba(100,116,139,0.2);color:#94a3b8;border:1px solid rgba(100,116,139,0.3);">OFF</span>'
      statusEl.innerHTML = \`
        <div class="space-y-1.5 text-sm">
          <div class="flex items-center gap-2">표시 상태: \${enabledBadge}</div>
          <div class="text-slate-400">타입: \${banner.type === 'image' ? '이미지 URL' : '기본 SVG'}</div>
          \${banner.image_url ? \`<div class="text-slate-400 break-all">이미지: \${banner.image_url}</div>\` : ''}
          \${banner.link_url ? \`<div class="text-slate-400 break-all">링크: \${banner.link_url}</div>\` : '<div class="text-slate-500">링크: 없음</div>'}
        </div>\`
      document.getElementById('banner-enabled').checked = !!banner.enabled
      document.getElementById('banner-type').value = banner.type || 'svg'
      document.getElementById('banner-image-url').value = banner.image_url || ''
      document.getElementById('banner-link-url').value = banner.link_url || ''
      toggleBannerType()
      updateBannerPreview(banner)
    } else {
      statusEl.innerHTML = '<p class="text-slate-500">설정된 배너가 없습니다. (기본 SVG 배너 표시 중)</p>'
    }
  } catch(e) {
    document.getElementById('banner-current-status').innerHTML = '<p class="text-red-400">불러오기 실패</p>'
  }
}

function toggleBannerType() {
  const type = document.getElementById('banner-type').value
  const wrap = document.getElementById('banner-image-url-wrap')
  if (wrap) wrap.style.display = type === 'image' ? 'block' : 'none'
}

function updateBannerPreview(banner) {
  const preview = document.getElementById('banner-preview')
  if (!preview) return
  if (banner?.type === 'image' && banner?.image_url) {
    preview.innerHTML = \`<img src="\${banner.image_url}" style="width:100%;height:120px;object-fit:cover;border-radius:12px;" onerror="this.style.display='none'">\`
  } else {
    preview.innerHTML = \`<div style="padding:16px;color:#fff;">
      <div style="font-size:16px;font-weight:800;">전화 방식의 새로운</div>
      <div style="font-size:16px;font-weight:800;color:#7ee8fa;">알람 앱, RinGo</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:6px;">채널을 만들고, 구독하고 원하는 시간에 알람을 예약하세요.</div>
    </div>\`
  }
}

async function saveBannerSettings() {
  const enabled = document.getElementById('banner-enabled').checked
  const type = document.getElementById('banner-type').value
  const image_url = document.getElementById('banner-image-url').value.trim()
  const link_url = document.getElementById('banner-link-url').value.trim()
  const payload = { enabled, type, image_url, link_url }
  try {
    const res = await fetch('/admin/banner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (data.success) {
      alert('✅ 배너 설정이 저장되었습니다.')
      loadBannerSettings()
    } else {
      alert('❌ 저장 실패: ' + (data.error || '알 수 없는 오류'))
    }
  } catch(e) {
    alert('❌ 오류: ' + e.message)
  }
}

async function submitChangePassword(e) {
  e.preventDefault()
  const current = document.getElementById('settingsCurrent').value
  const newPw = document.getElementById('settingsNew').value
  const confirm = document.getElementById('settingsConfirm').value
  const errEl = document.getElementById('settingsError')
  const sucEl = document.getElementById('settingsSuccess')
  errEl.style.display = 'none'
  sucEl.style.display = 'none'
  if (newPw !== confirm) { errEl.textContent = '⚠️ 새 비밀번호가 일치하지 않습니다.'; errEl.style.display = 'block'; return }
  if (newPw.length < 4) { errEl.textContent = '⚠️ 비밀번호는 최소 4자 이상이어야 합니다.'; errEl.style.display = 'block'; return }
  try {
    const formData = new FormData()
    formData.append('current_password', current)
    formData.append('new_password', newPw)
    formData.append('confirm_password', confirm)
    const res = await fetch('/admin/change-password', { method: 'POST', body: formData })
    const html = await res.text()
    if (html.includes('성공적으로 변경')) {
      sucEl.textContent = '✅ 비밀번호가 성공적으로 변경되었습니다!'
      sucEl.style.display = 'block'
      document.getElementById('settingsForm').reset()
      setTimeout(() => closeSettingsModal(), 2000)
    } else if (html.includes('현재 비밀번호가 틀렸습니다')) {
      errEl.textContent = '⚠️ 현재 비밀번호가 틀렸습니다.'
      errEl.style.display = 'block'
    } else {
      errEl.textContent = '⚠️ 오류가 발생했습니다.'
      errEl.style.display = 'block'
    }
  } catch(err) {
    errEl.textContent = '⚠️ 네트워크 오류가 발생했습니다.'
    errEl.style.display = 'block'
  }
}
</script>
<script>
// ── 5분 비활동 자동 로그아웃 ──
(function() {
  const TIMEOUT_MS = 5 * 60 * 1000  // 5분
  let _timer = null

  function resetTimer() {
    clearTimeout(_timer)
    _timer = setTimeout(async () => {
      try { await fetch('/admin/logout', { method: 'POST' }) } catch {}
      alert('5분 동안 활동이 없어 자동 로그아웃됩니다.')
      location.href = '/admin'
    }, TIMEOUT_MS)
  }

  // 마우스, 키보드, 터치 활동 감지
  ;['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(e => {
    document.addEventListener(e, resetTimer, { passive: true })
  })

  resetTimer()
})()
</script>
</body>
</html>`
}

// ── HTML: 관리자 설정 페이지 (비밀번호 변경 POST 응답용) ─
function adminSettingsHTML(error = '', success = '') {
  // POST /admin/change-password 결과는 모달 JS에서 처리하므로
  // 여기서는 간단히 대시보드로 리다이렉트 응답을 반환
  // (실제로는 fetch로 호출하므로 HTML 응답 내용으로 판단)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>비밀번호 변경</title></head>
<body style="background:#111827;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
${error ? `<p style="color:#fca5a5;">⚠️ ${error}</p>` : ''}
${success ? `<p style="color:#86efac;">✅ ${success}</p>` : ''}
</body></html>`
}

// ── POST /admin/banner ────────────────────────────────
admin.post('/banner', async (c) => {
  const isLoggedIn = await verifySession(c)
  if (!isLoggedIn) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const body = await c.req.json()
    const { enabled, type, image_url, link_url } = body
    const value = JSON.stringify({ enabled: !!enabled, type: type || 'svg', image_url: image_url || '', link_url: link_url || '' })
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('banner', ?)"
    ).bind(value).run()
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default admin
