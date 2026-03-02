// src/index.tsx
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings } from './types'

import channels from './routes/channels'
import contents from './routes/contents'
import subscribers from './routes/subscribers'
import notifications from './routes/notifications'
import invites from './routes/invites'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret']
}))

app.use('/static/*', serveStatic({ root: './public' }))

// API 라우터
app.route('/api/channels', channels)
app.route('/api/contents', contents)
app.route('/api/subscribers', subscribers)
app.route('/api/notifications', notifications)
app.route('/api/invites', invites)

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Push Notification Admin API' })
})

// APK 다운로드 페이지
app.get('/download', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PushNotify APK 다운로드</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 min-h-screen flex items-center justify-center p-4">
  <div class="bg-gray-900 border border-indigo-500/30 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
    <div class="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
      <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-white mb-2">PushNotify</h1>
    <p class="text-gray-400 text-sm mb-1">폐쇄형 채널 구독 앱</p>
    <p class="text-gray-500 text-xs mb-6">Android arm64 · debug v1.0.0</p>

    <a href="/static/PushNotify-debug-arm64.apk"
       download="PushNotify-debug-arm64.apk"
       class="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl transition-all text-lg mb-4">
      ⬇️ APK 다운로드 (55MB)
    </a>

    <div class="bg-yellow-900/30 border border-yellow-600/30 rounded-xl p-4 text-left text-xs text-yellow-300 space-y-1">
      <p class="font-bold text-yellow-200 mb-2">📋 설치 방법</p>
      <p>1. APK 파일 다운로드</p>
      <p>2. 설정 → 보안 → <b>알 수 없는 앱 허용</b></p>
      <p>3. 다운로드 폴더에서 파일 실행</p>
    </div>

    <p class="text-gray-600 text-xs mt-4">Android 5.0+ / arm64 기기 필요</p>
  </div>
</body>
</html>`)
})

// =============================================
// 채널 참여 랜딩 페이지 /join/:token
// Flutter 앱에서 딥링크로 열리는 페이지
// 채널 정보를 보여주고 앱 열기/설치 유도
// =============================================
app.get('/join/:token', async (c) => {
  const token = c.req.param('token')

  // 토큰 검증
  let linkData: any = null
  try {
    const link = await c.env.DB.prepare(`
      SELECT il.*, ch.name as channel_name, ch.description as channel_description,
             ch.image_url as channel_image_url
      FROM channel_invite_links il
      JOIN channels ch ON il.channel_id = ch.id
      WHERE il.invite_token = ? AND il.is_active = 1
    `).bind(token).first()
    linkData = link
  } catch (e) {}

  // 토큰 상태 판단
  let status = 'valid'
  let statusMsg = ''
  if (!linkData) { status = 'invalid'; statusMsg = '존재하지 않는 초대 링크입니다' }
  else if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) { status = 'expired'; statusMsg = '만료된 초대 링크입니다' }
  else if (linkData.max_uses !== null && linkData.use_count >= linkData.max_uses) { status = 'full'; statusMsg = '사용 횟수가 초과된 초대 링크입니다' }

  const isValid = status === 'valid'
  const channelName = linkData?.channel_name || '알 수 없는 채널'
  const channelDesc = linkData?.channel_description || ''
  const channelImg = linkData?.channel_image_url || ''
  const remaining = linkData?.max_uses ? linkData.max_uses - linkData.use_count : null

  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${isValid ? channelName + ' - 채널 참여' : '유효하지 않은 링크'}</title>
<meta property="og:title" content="${isValid ? channelName + ' 채널에 초대되었습니다' : '유효하지 않은 초대 링크'}">
<meta property="og:description" content="${isValid ? (channelDesc || '채널에 참여하여 알림을 받아보세요') : statusMsg}">
${channelImg ? `<meta property="og:image" content="${channelImg}">` : ''}
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<style>
  body { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%); min-height: 100vh; }
  .card { background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(20px); border: 1px solid rgba(99,102,241,0.2); }
  .btn-join { background: linear-gradient(135deg, #6366f1, #4f46e5); box-shadow: 0 8px 32px rgba(99,102,241,0.4); }
  .btn-join:hover { background: linear-gradient(135deg, #4f46e5, #3730a3); transform: translateY(-1px); }
  .btn-install { background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 8px 32px rgba(16,185,129,0.3); }
  .glow { box-shadow: 0 0 60px rgba(99,102,241,0.3); }
  .float { animation: float 3s ease-in-out infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  .step-dot { width:8px;height:8px;border-radius:50%; }
  .badge-token { font-family: monospace; letter-spacing: 0.05em; }
</style>
</head>
<body class="flex items-center justify-center p-4 py-12">
  <div class="w-full max-w-md">

    <!-- 앱 로고 -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl float mb-4 glow">
        <i class="fas fa-bell text-white text-2xl"></i>
      </div>
      <p class="text-slate-400 text-sm">Push Notification</p>
    </div>

    ${isValid ? `
    <!-- 유효한 초대 링크 -->
    <div class="card rounded-3xl p-8 text-center mb-6">

      <!-- 채널 이미지 -->
      ${channelImg ? `
      <div class="w-24 h-24 mx-auto mb-5 rounded-2xl overflow-hidden border-2 border-indigo-500/50">
        <img src="${channelImg}" alt="${channelName}" class="w-full h-full object-cover">
      </div>` : `
      <div class="w-24 h-24 mx-auto mb-5 rounded-2xl bg-indigo-900/50 flex items-center justify-center border-2 border-indigo-500/50">
        <i class="fas fa-layer-group text-indigo-400 text-3xl"></i>
      </div>`}

      <!-- 초대 메시지 -->
      <p class="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-2">채널 초대</p>
      <h1 class="text-white text-2xl font-bold mb-3">${channelName}</h1>
      ${channelDesc ? `<p class="text-slate-400 text-sm leading-relaxed mb-5">${channelDesc}</p>` : ''}

      <!-- 채널 정보 배지 -->
      <div class="flex justify-center gap-3 mb-6">
        <div class="bg-indigo-900/40 border border-indigo-500/30 rounded-xl px-4 py-2">
          <div class="text-indigo-300 text-xs">폐쇄형 채널</div>
          <div class="text-white text-xs font-bold mt-0.5">초대 전용</div>
        </div>
        ${remaining !== null ? `
        <div class="bg-amber-900/40 border border-amber-500/30 rounded-xl px-4 py-2">
          <div class="text-amber-300 text-xs">남은 초대</div>
          <div class="text-white text-xs font-bold mt-0.5">${remaining}명</div>
        </div>` : ''}
        ${linkData?.expires_at ? `
        <div class="bg-rose-900/40 border border-rose-500/30 rounded-xl px-4 py-2">
          <div class="text-rose-300 text-xs">만료</div>
          <div class="text-white text-xs font-bold mt-0.5">${new Date(linkData.expires_at).toLocaleDateString('ko-KR')}</div>
        </div>` : ''}
      </div>

      <!-- 참여 버튼 (앱 딥링크) -->
      <a href="pushapp://join?token=${token}" id="deepLinkBtn"
        class="btn-join block w-full text-white py-4 rounded-2xl font-bold text-base mb-3 transition-all duration-200">
        <i class="fas fa-door-open mr-2"></i>앱에서 채널 참여하기
      </a>

      <!-- 앱 없을 때 설치 유도 -->
      <div id="installSection" class="hidden">
        <div class="border-t border-slate-700/50 pt-4 mt-4">
          <p class="text-slate-400 text-xs mb-3">앱이 없으신가요? 앱을 설치하고 채널에 참여하세요</p>
          <div class="grid grid-cols-2 gap-2">
            <a href="https://play.google.com/store/apps" target="_blank"
              class="btn-install flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200">
              <i class="fab fa-google-play text-base"></i>Android
            </a>
            <a href="https://apps.apple.com" target="_blank"
              class="btn-install flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200">
              <i class="fab fa-apple text-base"></i>iOS
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- 이용 안내 -->
    <div class="card rounded-2xl p-5">
      <h3 class="text-white font-semibold text-sm mb-4 flex items-center gap-2">
        <i class="fas fa-circle-info text-indigo-400"></i> 참여 방법
      </h3>
      <div class="space-y-3">
        <div class="flex items-start gap-3">
          <div class="step-dot bg-indigo-500 flex-shrink-0 mt-1.5"></div>
          <p class="text-slate-400 text-xs">앱을 설치하고 계정을 만드세요</p>
        </div>
        <div class="flex items-start gap-3">
          <div class="step-dot bg-indigo-400 flex-shrink-0 mt-1.5"></div>
          <p class="text-slate-400 text-xs">"앱에서 채널 참여하기" 버튼을 눌러 채널에 참여하세요</p>
        </div>
        <div class="flex items-start gap-3">
          <div class="step-dot bg-indigo-300 flex-shrink-0 mt-1.5"></div>
          <p class="text-slate-400 text-xs">새 콘텐츠가 등록되면 푸시 알림을 받게 됩니다</p>
        </div>
      </div>
      <div class="mt-4 bg-slate-900/50 rounded-xl p-3 border border-slate-700/50">
        <p class="text-slate-500 text-xs mb-1">초대 토큰</p>
        <code class="badge-token text-indigo-400 text-xs break-all">${token}</code>
      </div>
    </div>

    <script>
      // 딥링크 시도 후 앱 없으면 설치 섹션 표시
      document.getElementById('deepLinkBtn').addEventListener('click', function(e) {
        setTimeout(function() {
          document.getElementById('installSection').classList.remove('hidden')
        }, 2000)
      })
      
      // 모바일 환경 자동 딥링크 시도
      const ua = navigator.userAgent.toLowerCase()
      const isMobile = /android|iphone|ipad|ipod/.test(ua)
      if (isMobile) {
        // 1.5초 후 설치 섹션 표시
        setTimeout(() => document.getElementById('installSection').classList.remove('hidden'), 1500)
      } else {
        // PC는 바로 설치 섹션 표시
        document.getElementById('installSection').classList.remove('hidden')
      }
    </script>

    ` : `
    <!-- 유효하지 않은 / 만료된 링크 -->
    <div class="card rounded-3xl p-8 text-center">
      <div class="w-20 h-20 mx-auto mb-5 rounded-full bg-red-900/30 flex items-center justify-center border border-red-500/30">
        <i class="fas fa-${status === 'expired' ? 'clock' : status === 'full' ? 'users-slash' : 'ban'} text-red-400 text-3xl"></i>
      </div>
      <h1 class="text-white text-xl font-bold mb-3">${status === 'expired' ? '만료된 초대 링크' : status === 'full' ? '초대 인원 초과' : '유효하지 않은 링크'}</h1>
      <p class="text-slate-400 text-sm mb-6">${statusMsg}</p>
      <div class="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
        <p class="text-slate-500 text-xs">채널 관리자에게 새로운 초대 링크를 요청하세요</p>
      </div>
    </div>
    `}

  </div>
</body>
</html>`)
})

// =============================================
// Admin 대시보드 (메인)
// =============================================
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Push Notification Admin</title>
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
  .nav-item { transition:all 0.2s; border-radius:8px; }
  .nav-item:hover,.nav-item.active { background:rgba(99,102,241,0.2); color:#a5b4fc; }
  .nav-item.active { border-left:3px solid #6366f1; }
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
</style>
</head>
<body class="flex h-screen overflow-hidden">

<!-- 사이드바 -->
<div class="sidebar w-64 flex-shrink-0 flex flex-col h-full overflow-y-auto">
  <div class="p-6 border-b border-slate-700/50">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
        <i class="fas fa-bell text-white text-lg"></i>
      </div>
      <div>
        <h1 class="font-bold text-white text-sm">Push Admin</h1>
        <p class="text-slate-400 text-xs">폐쇄형 채널 관리</p>
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
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('channels')">
      <i class="fas fa-layer-group w-4 text-center text-purple-400"></i> 채널 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('invites')">
      <i class="fas fa-link w-4 text-center text-amber-400"></i> 초대 링크
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('contents')">
      <i class="fas fa-photo-film w-4 text-center text-blue-400"></i> 콘텐츠 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('subscribers')">
      <i class="fas fa-users w-4 text-center text-emerald-400"></i> 구독자 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('notifications')">
      <i class="fas fa-paper-plane w-4 text-center text-sky-400"></i> 알림 발송
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('logs')">
      <i class="fas fa-list-check w-4 text-center text-rose-400"></i> 발송 로그
    </a>
  </nav>

  <div class="p-4 border-t border-slate-700/50">
    <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
      <div class="text-amber-400 text-xs font-semibold mb-1"><i class="fas fa-lock mr-1"></i>폐쇄형 채널</div>
      <div class="text-slate-400 text-xs">채널은 초대 링크 없이 접근 불가</div>
    </div>
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
      <div class="flex justify-between items-center mb-6">
        <p class="text-slate-400 text-sm">폐쇄형 채널 — 초대 링크 없이는 채널 존재를 알 수 없습니다</p>
        <button onclick="openChannelModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <i class="fas fa-plus"></i> 채널 추가
        </button>
      </div>
      <div id="channelsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
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

      <!-- 초대 링크 안내 박스 -->
      <div class="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
        <i class="fas fa-circle-info text-indigo-400 mt-0.5 flex-shrink-0"></i>
        <div class="text-sm">
          <p class="text-indigo-300 font-semibold mb-1">폐쇄형 채널 초대 방식</p>
          <p class="text-slate-400">채널은 외부에 노출되지 않습니다. 초대 링크(<code class="text-indigo-400">/join/토큰</code>)를 받은 사용자만 채널에 참여할 수 있습니다. 링크를 카카오톡, 문자, SNS 등으로 공유하세요.</p>
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
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center gap-3">
          <select id="subscriberChannelFilter" class="input-field text-sm w-48" onchange="loadSubscribers()">
            <option value="">전체 채널</option>
          </select>
          <select id="subscriberPlatformFilter" class="input-field text-sm w-40" onchange="loadSubscribers()">
            <option value="">전체 플랫폼</option>
            <option value="android">🤖 Android</option>
            <option value="ios">🍎 iOS</option>
            <option value="web">🌐 Web</option>
          </select>
        </div>
        <span class="text-slate-400 text-sm" id="subscriberCount"></span>
      </div>
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-slate-700">
              <th class="text-left px-5 py-3 text-slate-400 font-medium">구독자</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">채널</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">가입 경로</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">플랫폼</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">수락</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">거절</th>
              <th class="text-left px-5 py-3 text-slate-400 font-medium">구독일</th>
              <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
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

    <!-- ===== 발송 로그 ===== -->
    <div id="page-logs" class="page">
      <div class="flex justify-between items-center mb-6">
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

  </main>
</div>

<!-- ===== 채널 모달 ===== -->
<div id="channelModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-md mx-4">
    <div class="card-header px-6 py-4 flex items-center justify-between">
      <h3 id="channelModalTitle" class="text-white font-semibold">채널 추가</h3>
      <button onclick="closeModal('channelModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <input type="hidden" id="channelId">
      <div class="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
        <i class="fas fa-lock mr-1"></i> 채널은 외부에 비공개입니다. 초대 링크를 통해서만 참여 가능합니다.
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널명 *</label>
        <input id="channelName" type="text" class="input-field" placeholder="힐링 뮤직 채널">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label>
        <textarea id="channelDescription" class="input-field" rows="2" placeholder="채널 설명"></textarea>
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">이미지 URL</label>
        <input id="channelImageUrl" type="url" class="input-field" placeholder="https://...">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Owner ID *</label>
        <input id="channelOwnerId" type="text" class="input-field" value="admin">
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('channelModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveChannel()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ===== 초대 링크 생성 모달 ===== -->
<div id="inviteModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-md mx-4">
    <div class="card-header px-6 py-4 flex items-center justify-between">
      <h3 class="text-white font-semibold flex items-center gap-2">
        <i class="fas fa-link text-amber-400"></i> 초대 링크 생성
      </h3>
      <button onclick="closeModal('inviteModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 *</label>
        <select id="inviteChannelId" class="input-field">
          <option value="">채널 선택...</option>
        </select>
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">링크 이름 (구분용)</label>
        <input id="inviteLabel" type="text" class="input-field" placeholder="예: 카카오톡 공유용, VIP 초대">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">최대 사용 횟수</label>
          <input id="inviteMaxUses" type="number" min="1" class="input-field" placeholder="무제한">
          <p class="text-slate-500 text-xs mt-1">비워두면 무제한</p>
        </div>
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">만료 (일)</label>
          <input id="inviteExpiresDays" type="number" min="1" class="input-field" placeholder="무기한">
          <p class="text-slate-500 text-xs mt-1">비워두면 무기한</p>
        </div>
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('inviteModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveInvite()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold">
          <i class="fas fa-link mr-1"></i>링크 생성
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ===== 콘텐츠 모달 ===== -->
<div id="contentModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
    <div class="card-header px-6 py-4 flex items-center justify-between sticky top-0">
      <h3 class="text-white font-semibold">콘텐츠 등록</h3>
      <button onclick="closeModal('contentModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-6 space-y-4">
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 *</label>
        <select id="contentChannelId" class="input-field"></select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">타입 *</label>
          <select id="contentType" class="input-field" onchange="onContentTypeChange()">
            <option value="audio">🎵 오디오</option>
            <option value="video">🎬 비디오</option>
            <option value="youtube">📺 유튜브</option>
          </select>
        </div>
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">재생 시간(초)</label>
          <input id="contentDuration" type="number" class="input-field" placeholder="245">
        </div>
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">제목 *</label>
        <input id="contentTitle" type="text" class="input-field" placeholder="콘텐츠 제목">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label>
        <textarea id="contentDescription" class="input-field" rows="2"></textarea>
      </div>
      <div>
        <label id="contentUrlLabel" class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">콘텐츠 URL *</label>
        <input id="contentUrl" type="url" class="input-field" placeholder="https://...">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">썸네일 URL</label>
        <input id="contentThumbnail" type="url" class="input-field" placeholder="https://...">
      </div>
      <div class="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" id="sendAfterCreate" class="w-4 h-4 accent-indigo-500">
          <div>
            <span class="text-amber-300 text-sm font-semibold">등록 후 즉시 푸시 알림 발송</span>
            <p class="text-slate-400 text-xs mt-0.5">채널 구독자 전체에게 즉시 발송</p>
          </div>
        </label>
        <div id="notifSettingsDiv" class="hidden mt-3 space-y-2">
          <input id="autoNotifTitle" type="text" class="input-field text-sm" placeholder="알림 제목">
          <textarea id="autoNotifBody" class="input-field text-sm" rows="2" placeholder="알림 내용"></textarea>
        </div>
      </div>
      <div class="flex gap-3 pt-2">
        <button onclick="closeModal('contentModal')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-semibold">취소</button>
        <button onclick="saveContent()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold">
          <i class="fas fa-cloud-arrow-up mr-2"></i>등록
        </button>
      </div>
    </div>
  </div>
</div>

<script src="/static/app.js"></script>
</body>
</html>`)
})

// =============================================
// 모바일 웹 앱 - Flutter 앱과 동일한 UI/UX
// =============================================
app.get('/app', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>PushNotify</title>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  :root {
    --bg: #121212;
    --bg2: #1E1E2E;
    --bg3: #2A2A3E;
    --primary: #6C63FF;
    --primary-dim: rgba(108,99,255,0.15);
    --teal: #26D0CE;
    --text: #FFFFFF;
    --text2: #B0B0C0;
    --text3: #707080;
    --border: #2E2E42;
    --danger: #EF4444;
    --success: #4CAF50;
    --nav-h: 62px;
  }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, 'Noto Sans KR', sans-serif; height: 100dvh; overflow: hidden; }

  /* 앱바 */
  .appbar {
    height: 56px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; background: var(--primary); flex-shrink: 0;
    position: sticky; top: 0; z-index: 100;
  }
  .appbar-title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 700; color: #fff; }
  .appbar-icon { background: rgba(255,255,255,0.2); border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
  .appbar-actions button { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 6px; }

  /* 하단 네비게이션 */
  .bottom-nav {
    height: var(--nav-h); display: flex; background: var(--bg2);
    border-top: 1px solid var(--border); flex-shrink: 0;
    position: sticky; bottom: 0; z-index: 100;
  }
  .nav-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 3px; background: none; border: none; color: var(--text3); cursor: pointer;
    font-size: 10px; transition: color 0.15s; padding: 4px 0;
  }
  .nav-btn i { font-size: 20px; }
  .nav-btn.active { color: var(--primary); }
  .nav-btn.active i { text-shadow: 0 0 12px rgba(108,99,255,0.5); }

  /* 화면 래퍼 */
  #screen-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .screen { display: none; flex: 1; overflow-y: auto; flex-direction: column; }
  .screen.active { display: flex; }

  /* 섹션 헤더 */
  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 8px;
  }
  .section-title { font-size: 15px; font-weight: 700; }
  .section-btn {
    background: var(--bg3); border: 1px solid rgba(108,99,255,0.4);
    color: var(--primary); font-size: 12px; font-weight: 600;
    padding: 6px 12px; border-radius: 20px; cursor: pointer; white-space: nowrap;
  }

  /* 채널 타일 */
  .channel-tile {
    display: flex; align-items: center; gap: 12px;
    background: var(--bg2); margin: 4px 14px;
    padding: 10px 14px; border-radius: 12px; cursor: pointer;
    transition: background 0.15s;
  }
  .channel-tile:active { background: var(--bg3); }
  .channel-tile .info { flex: 1; min-width: 0; }
  .channel-tile .name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .channel-tile .sub { font-size: 11px; color: var(--text3); margin-top: 2px; }
  .channel-tile .close-btn { background: none; border: none; color: var(--text3); font-size: 16px; cursor: pointer; padding: 4px; }
  .channel-tile .chevron { color: var(--text3); font-size: 14px; }

  /* 아바타 */
  .avatar {
    width: 44px; height: 44px; border-radius: 22px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700; overflow: hidden;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }

  /* 빈 상태 */
  .empty-box {
    background: var(--bg2); margin: 4px 14px; border-radius: 12px;
    padding: 18px; text-align: center; color: var(--text3); font-size: 13px; line-height: 1.6;
  }

  /* 구분선 */
  .divider { border: none; border-top: 1px solid var(--border); margin: 6px 0; }

  /* 모달 오버레이 */
  .modal-overlay {
    display: none; position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    align-items: flex-end; justify-content: center;
  }
  .modal-overlay.active { display: flex; }
  .modal-sheet {
    width: 100%; max-width: 480px; background: var(--bg2);
    border-radius: 20px 20px 0 0; padding: 0 0 24px; max-height: 90dvh; overflow-y: auto;
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .modal-handle { width: 40px; height: 4px; background: var(--text3); border-radius: 2px; margin: 14px auto 0; }
  .modal-title { font-size: 16px; font-weight: 700; padding: 14px 20px 8px; }
  .modal-body { padding: 0 20px; }

  /* 폼 요소 */
  .form-label { font-size: 13px; color: var(--text2); margin-bottom: 6px; margin-top: 16px; display: block; }
  .form-input {
    width: 100%; background: var(--bg3); border: 1px solid var(--border);
    color: var(--text); font-size: 14px; padding: 12px 14px; border-radius: 12px;
    outline: none; transition: border-color 0.15s;
  }
  .form-input:focus { border-color: var(--primary); }
  .form-input::placeholder { color: var(--text3); }
  .form-textarea { resize: none; }
  .char-count { font-size: 11px; color: var(--text3); text-align: right; margin-top: 4px; }

  /* 이미지 선택 박스 */
  .img-picker {
    display: flex; align-items: center; gap: 14px;
    background: var(--bg3); border: 1px solid var(--border);
    padding: 12px 14px; border-radius: 12px; cursor: pointer;
  }
  .img-thumb {
    width: 60px; height: 60px; border-radius: 10px; background: var(--bg2);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;
  }
  .img-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .img-hint { font-size: 12px; color: var(--text3); }

  /* 이미지 소스 선택 */
  .img-source-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .img-source-btn {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    background: none; border: 1px solid var(--border); border-radius: 14px;
    padding: 18px 0; cursor: pointer; transition: background 0.15s;
  }
  .img-source-btn:active { background: var(--bg3); }
  .img-source-icon { width: 60px; height: 60px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
  .img-source-label { font-size: 13px; color: var(--text2); }

  /* 버튼 */
  .btn-primary { background: var(--primary); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; padding: 14px; width: 100%; cursor: pointer; margin-top: 16px; }
  .btn-teal { background: var(--teal); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; padding: 14px; width: 100%; cursor: pointer; margin-top: 16px; }
  .btn-ghost { background: var(--bg3); color: var(--text2); border: none; border-radius: 12px; font-size: 14px; font-weight: 600; padding: 12px; width: 100%; cursor: pointer; margin-top: 8px; }
  .btn-danger { background: var(--danger); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; padding: 8px 14px; cursor: pointer; }
  .btn-sm { padding: 6px 12px; font-size: 12px; margin-top: 0; border-radius: 8px; }

  /* 알림 카드 */
  .notif-card {
    background: var(--bg2); margin: 6px 14px; border-radius: 14px; overflow: hidden;
  }
  .notif-header { display: flex; align-items: center; gap: 10px; padding: 14px; }
  .notif-icon-wrap { width: 40px; height: 40px; border-radius: 10px; background: var(--primary-dim); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .notif-meta { flex: 1; min-width: 0; }
  .notif-title { font-size: 13px; font-weight: 600; }
  .notif-channel { font-size: 11px; color: var(--text3); margin-top: 2px; }
  .notif-time { font-size: 11px; color: var(--text3); }
  .notif-body { padding: 0 14px 12px; font-size: 12px; color: var(--text2); }
  .notif-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 14px 14px; }
  .btn-reject { background: rgba(239,68,68,0.12); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-size: 13px; font-weight: 600; padding: 10px; cursor: pointer; }
  .btn-accept { background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; padding: 10px; cursor: pointer; }
  .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge-accepted { background: rgba(76,175,80,0.15); color: var(--success); }
  .badge-rejected { background: rgba(239,68,68,0.15); color: var(--danger); }
  .badge-pending { background: var(--primary-dim); color: var(--primary); }

  /* 설정 리스트 */
  .settings-section { margin: 12px 14px 0; }
  .settings-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; padding-left: 2px; }
  .settings-card { background: var(--bg2); border-radius: 14px; overflow: hidden; }
  .settings-item { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .settings-item:last-child { border-bottom: none; }
  .settings-item-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .settings-item-text { flex: 1; }
  .settings-item-title { font-size: 14px; }
  .settings-item-sub { font-size: 11px; color: var(--text3); margin-top: 2px; }
  .settings-item-value { font-size: 12px; color: var(--text3); }
  .settings-toggle { width: 44px; height: 26px; border-radius: 13px; background: var(--bg3); border: none; cursor: pointer; position: relative; flex-shrink: 0; transition: background 0.2s; }
  .settings-toggle.on { background: var(--primary); }
  .settings-toggle::after { content: ''; position: absolute; width: 20px; height: 20px; border-radius: 10px; background: #fff; top: 3px; left: 3px; transition: left 0.2s; }
  .settings-toggle.on::after { left: 21px; }

  /* 토스트 */
  .toast { position: fixed; bottom: calc(var(--nav-h) + 16px); left: 50%; transform: translateX(-50%); background: #323250; color: #fff; padding: 10px 20px; border-radius: 24px; font-size: 13px; font-weight: 500; z-index: 999; white-space: nowrap; box-shadow: 0 4px 20px rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.2s; pointer-events: none; }
  .toast.show { opacity: 1; }

  /* 앱바 다크 (채널만들기 등 서브화면) */
  .appbar.dark { background: var(--bg2); }
  .appbar.dark .appbar-title { font-size: 17px; color: var(--text); }

  /* 로딩 */
  .loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text3); gap: 10px; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 인포 배너 */
  .info-note { margin: 0 14px 6px; padding: 10px 14px; background: var(--bg3); border-radius: 10px; font-size: 11px; color: var(--text3); line-height: 1.5; }
</style>
</head>
<body>
<div style="display:flex; flex-direction:column; height:100dvh;">

  <!-- 앱바 (동적으로 변경) -->
  <div class="appbar" id="appbar">
    <div class="appbar-title">
      <div class="appbar-icon"><i class="fas fa-bell" style="color:#fff;font-size:14px;"></i></div>
      <span>PushNotify</span>
    </div>
    <div class="appbar-actions">
      <button onclick="App.refresh()"><i class="fas fa-rotate-right"></i></button>
    </div>
  </div>

  <!-- 화면 영역 -->
  <div id="screen-wrap">

    <!-- 홈 화면 -->
    <div class="screen active" id="screen-home">
      <div class="section-header">
        <span class="section-title">나의 운영채널</span>
        <button class="section-btn" onclick="App.openCreateChannel()">⊕ 채널 만들기</button>
      </div>
      <div id="owned-list"><div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div></div>

      <hr class="divider" style="margin:10px 0;">

      <div class="section-header">
        <span class="section-title">나의 가입채널</span>
        <button class="section-btn" onclick="App.openJoinChannel()">⊕ 채널 참여</button>
      </div>
      <div id="joined-list"><div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div></div>
      <div style="height:16px;"></div>
    </div>

    <!-- 채널 화면 -->
    <div class="screen" id="screen-channel">
      <div class="section-header">
        <span class="section-title">채널 목록</span>
      </div>
      <div id="channel-list-all"><div class="loading"><i class="fas fa-spinner spin"></i> 로딩 중...</div></div>
      <div style="height:16px;"></div>
    </div>

    <!-- 수신함 화면 -->
    <div class="screen" id="screen-inbox">
      <div class="section-header">
        <span class="section-title">수신함</span>
        <button class="section-btn" style="border-color:rgba(239,68,68,0.4);color:#EF4444;" onclick="App.clearInbox()">모두 지우기</button>
      </div>
      <div id="inbox-list"><div class="empty-box">받은 알림이 없습니다.</div></div>
      <div style="height:16px;"></div>
    </div>

    <!-- 발신함 화면 -->
    <div class="screen" id="screen-send">
      <div class="section-header"><span class="section-title">발신함</span></div>
      <div id="send-list"><div class="empty-box">발신 내역이 없습니다.</div></div>
      <div style="height:16px;"></div>
    </div>

    <!-- 설정 화면 -->
    <div class="screen" id="screen-settings">
      <!-- 앱 정보 카드 -->
      <div style="margin:16px 14px 0;">
        <div style="background:linear-gradient(135deg,var(--primary),#8B7FFF);border-radius:16px;padding:20px;display:flex;align-items:center;gap:16px;">
          <div style="background:rgba(255,255,255,0.2);border-radius:12px;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-bell" style="color:#fff;font-size:24px;"></i>
          </div>
          <div>
            <div style="font-size:17px;font-weight:700;color:#fff;">PushNotify</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.75);">폐쇄형 채널 알림 앱 v1.0.0</div>
          </div>
        </div>
      </div>

      <div class="settings-section" style="margin-top:20px;">
        <div class="settings-label">알림 설정</div>
        <div class="settings-card">
          <div class="settings-item">
            <div class="settings-item-icon" style="background:rgba(108,99,255,0.15);">
              <i class="fas fa-bell" style="color:var(--primary);"></i>
            </div>
            <div class="settings-item-text">
              <div class="settings-item-title">푸시 알림 받기</div>
              <div class="settings-item-sub">채널에서 새 콘텐츠 알림을 받습니다</div>
            </div>
            <button class="settings-toggle on" id="notif-toggle" onclick="App.toggleNotif(this)"></button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">기기 정보</div>
        <div class="settings-card">
          <div class="settings-item">
            <div class="settings-item-icon" style="background:rgba(108,99,255,0.15);">
              <i class="fas fa-user" style="color:var(--primary);"></i>
            </div>
            <div class="settings-item-text">
              <div class="settings-item-title">사용자 ID</div>
              <div class="settings-item-sub" id="settings-user-id">로딩 중...</div>
            </div>
          </div>
          <div class="settings-item" onclick="App.showFcmToken()">
            <div class="settings-item-icon" style="background:rgba(108,99,255,0.15);">
              <i class="fas fa-key" style="color:var(--primary);"></i>
            </div>
            <div class="settings-item-text">
              <div class="settings-item-title">FCM 토큰</div>
              <div class="settings-item-sub" id="settings-fcm-token">터치하여 확인</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text3);font-size:12px;"></i>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">서버 연결</div>
        <div class="settings-card">
          <div class="settings-item">
            <div class="settings-item-icon" style="background:rgba(76,175,80,0.15);">
              <i class="fas fa-cloud" style="color:var(--success);"></i>
            </div>
            <div class="settings-item-text">
              <div class="settings-item-title">API 서버</div>
              <div class="settings-item-sub">Cloudflare Workers / D1</div>
            </div>
            <span class="status-badge badge-accepted">연결됨</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">관리</div>
        <div class="settings-card">
          <div class="settings-item" onclick="App.resetDevice()" style="cursor:pointer;">
            <div class="settings-item-icon" style="background:rgba(239,68,68,0.15);">
              <i class="fas fa-trash" style="color:var(--danger);"></i>
            </div>
            <div class="settings-item-text">
              <div class="settings-item-title" style="color:var(--danger);">기기 초기화</div>
              <div class="settings-item-sub">모든 구독 정보 삭제</div>
            </div>
          </div>
        </div>
      </div>
      <div style="height:24px;"></div>
    </div>
  </div>

  <!-- 하단 네비게이션 -->
  <div class="bottom-nav">
    <button class="nav-btn active" id="nav-home" onclick="App.goto('home')">
      <i class="fas fa-home"></i><span>홈</span>
    </button>
    <button class="nav-btn" id="nav-channel" onclick="App.goto('channel')">
      <i class="fas fa-list"></i><span>채널</span>
    </button>
    <button class="nav-btn" id="nav-inbox" onclick="App.goto('inbox')">
      <i class="fas fa-inbox"></i><span>수신함</span>
    </button>
    <button class="nav-btn" id="nav-send" onclick="App.goto('send')">
      <i class="fas fa-paper-plane"></i><span>발신함</span>
    </button>
    <button class="nav-btn" id="nav-settings" onclick="App.goto('settings')">
      <i class="fas fa-cog"></i><span>설정</span>
    </button>
  </div>
</div>

<!-- ===================== 채널 만들기 모달 ===================== -->
<div class="modal-overlay" id="modal-create">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 만들기</div>
    <div class="modal-body">
      <label class="form-label">채널명</label>
      <input class="form-input" id="create-name" placeholder="10자 내로 적어주세요" maxlength="10" oninput="document.getElementById('create-name-cnt').textContent=this.value.length+'/10'">
      <div class="char-count" id="create-name-cnt">0/10</div>

      <label class="form-label">채널 전화번호</label>
      <input class="form-input" id="create-phone" type="tel" placeholder="010-0000-0000">

      <label class="form-label">채널 소개</label>
      <textarea class="form-input form-textarea" id="create-desc" placeholder="50자 내로 적어주세요" rows="3" maxlength="50" oninput="document.getElementById('create-desc-cnt').textContent=this.value.length+'/50'"></textarea>
      <div class="char-count" id="create-desc-cnt">0/50</div>

      <label class="form-label">채널 대표이미지 선택</label>
      <div class="img-picker" onclick="App.openImagePicker()">
        <div class="img-thumb" id="create-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">미선택시 새이투두 이미지 적용</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="create-homepage" type="url" placeholder="https://">

      <button class="btn-teal" onclick="App.createChannel()">확인</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-create')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ===================== 이미지 소스 선택 모달 ===================== -->
<div class="modal-overlay" id="modal-img-src">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">사용할 애플리케이션</div>
    <div class="modal-body">
      <div class="img-source-grid">
        <button class="img-source-btn" onclick="App.pickImageFrom('gallery')">
          <div class="img-source-icon" style="background:rgba(233,30,99,0.15);"><i class="fas fa-images" style="color:#E91E63;"></i></div>
          <span class="img-source-label">갤러리</span>
        </button>
        <button class="img-source-btn" onclick="App.pickImageFrom('camera')">
          <div class="img-source-icon" style="background:rgba(33,150,243,0.15);"><i class="fas fa-camera" style="color:#2196F3;"></i></div>
          <span class="img-source-label">카메라</span>
        </button>
        <button class="img-source-btn" onclick="App.pickImageFrom('gallery')">
          <div class="img-source-icon" style="background:rgba(76,175,80,0.15);"><i class="fas fa-photo-film" style="color:#4CAF50;"></i></div>
          <span class="img-source-label">포토</span>
        </button>
        <button class="img-source-btn" onclick="App.closeModal('modal-img-src')">
          <div class="img-source-icon" style="background:rgba(100,100,120,0.15);"><i class="fas fa-times" style="color:#888;"></i></div>
          <span class="img-source-label">취소</span>
        </button>
      </div>
      <input type="file" id="file-input" accept="image/*" style="display:none;" onchange="App.onFileSelected(this)">
      <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none;" onchange="App.onFileSelected(this)">
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ===================== 채널 참여 모달 ===================== -->
<div class="modal-overlay" id="modal-join">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 참여</div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text3);margin-bottom:14px;">채널 운영자에게 받은 초대 링크 또는 초대 코드를 입력하세요.</p>
      <input class="form-input" id="join-token" placeholder="inv_xxxx_xxxxxx 또는 전체 URL">
      <button class="btn-primary" onclick="App.joinChannel()">확인</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-join')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ===================== 채널 수정 모달 ===================== -->
<div class="modal-overlay" id="modal-edit">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 수정</div>
    <div class="modal-body">
      <input type="hidden" id="edit-channel-id">

      <label class="form-label">채널명</label>
      <input class="form-input" id="edit-name" maxlength="10">

      <label class="form-label">채널 소개</label>
      <textarea class="form-input form-textarea" id="edit-desc" rows="3" maxlength="50"></textarea>

      <label class="form-label">비밀번호(이전 비밀번호) 공개 채널은 비워두도 됩니다.</label>
      <input class="form-input" id="edit-pwd-old" type="password" placeholder="영문, 숫자가능, 6자이상">

      <label class="form-label">비밀번호설정 (새로운 비밀번호)</label>
      <input class="form-input" id="edit-pwd-new" type="password" placeholder="영문, 숫자가능, 6자이상">

      <label class="form-label">채널 대표이미지 선택</label>
      <div class="img-picker" onclick="App.openImagePicker('edit')">
        <div class="img-thumb" id="edit-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">미선택시 새이투두 이미지 적용</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="edit-homepage" type="url" placeholder="https://">

      <button class="btn-primary" onclick="App.saveEditChannel()">저장</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-edit')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- 토스트 -->
<div class="toast" id="toast"></div>

<script src="/static/mobile-app.js"></script>
</body>
</html>`)
})

app.get('*', (c) => c.redirect('/'))

export default app
