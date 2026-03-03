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
import auth from './routes/auth'

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
app.route('/api/auth', auth)

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
  const channelImg  = linkData?.channel_image_url || ''
  const remaining   = linkData?.max_uses ? linkData.max_uses - linkData.use_count : null

  // APK 다운로드 URL
  const INSTALL_URL = 'https://8080-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai/PushNotify-debug-arm64.apk'
  const DEEP_LINK   = 'pushapp://join?token=' + token

  // 채널 이미지 HTML
  const imgHtml = channelImg
    ? '<div class="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden border-2 border-indigo-400/40 shadow-lg"><img src="' + channelImg + '" alt="' + channelName + '" class="w-full h-full object-cover"></div>'
    : '<div class="w-20 h-20 mx-auto mb-4 rounded-2xl bg-indigo-900/60 flex items-center justify-center border-2 border-indigo-400/40"><i class="fas fa-layer-group text-indigo-300 text-2xl"></i></div>'

  const descHtml = channelDesc
    ? '<p class="text-slate-400 text-sm leading-relaxed mb-4">' + channelDesc + '</p>'
    : '<p class="text-slate-500 text-sm mb-4">이 채널에 가입하면 새 콘텐츠 알림을 받을 수 있습니다.</p>'

  const remainHtml = remaining !== null
    ? '<div class="bg-amber-900/30 border border-amber-500/25 rounded-xl px-4 py-2 mb-4 inline-block"><span class="text-amber-300 text-xs">남은 초대 <b>' + remaining + '명</b></span></div>'
    : ''

  // 오류 아이콘
  const errIcon = status === 'expired' ? 'clock' : status === 'full' ? 'user-slash' : 'ban'
  const errTitle = status === 'expired' ? '만료된 초대 링크' : status === 'full' ? '초대 인원 초과' : '유효하지 않은 링크'

  const validBody = isValid ? (
    '<div id="screen-join" class="fade-in" style="display:none">' +
    '  <div class="text-center mb-6">' +
    '    <div class="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-3 pulse-ring"><i class="fas fa-bell text-white text-xl"></i></div>' +
    '    <p class="text-indigo-300 text-xs font-semibold tracking-widest uppercase">PushNotify</p>' +
    '  </div>' +
    '  <div class="glass rounded-3xl p-7 text-center mb-4">' +
    imgHtml +
    '    <span class="inline-block bg-indigo-900/60 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full mb-3 border border-indigo-500/30">채널 초대</span>' +
    '    <h1 class="text-white text-xl font-bold mb-2">' + channelName + '</h1>' +
    descHtml +
    remainHtml +
    '    <button onclick="openInApp()" class="btn-primary w-full text-white py-4 rounded-2xl font-bold text-base mb-3"><i class="fas fa-door-open mr-2"></i>PushNotify 앱에서 참여하기</button>' +
    '    <p class="text-slate-500 text-xs">앱이 자동으로 열리지 않으면 버튼을 눌러주세요</p>' +
    '  </div>' +
    '  <div class="glass rounded-2xl p-5 text-center">' +
    '    <p class="text-slate-400 text-sm mb-3">앱이 설치되어 있지 않나요?</p>' +
    '    <button onclick="goInstall()" class="btn-green w-full text-white py-3 rounded-xl font-semibold text-sm"><i class="fas fa-download mr-2"></i>PushNotify 앱 설치하기</button>' +
    '  </div>' +
    '</div>' +
    '<div id="screen-install" class="fade-in" style="display:none">' +
    '  <div class="text-center mb-6">' +
    '    <div class="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-3"><i class="fas fa-bell text-white text-xl"></i></div>' +
    '    <p class="text-indigo-300 text-xs font-semibold tracking-widest uppercase">PushNotify</p>' +
    '  </div>' +
    '  <div class="glass rounded-3xl p-7 text-center mb-4">' +
    '    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-900/40 flex items-center justify-center border border-amber-500/30"><i class="fas fa-mobile-alt text-amber-300 text-2xl"></i></div>' +
    '    <h1 class="text-white text-lg font-bold mb-2">' + channelName + '</h1>' +
    '    <p class="text-slate-400 text-sm mb-5">채널에 참여하려면 <b class="text-white">PushNotify 앱</b>이 필요합니다.</p>' +
    '    <div class="text-left space-y-3 mb-6">' +
    '      <div class="flex items-start gap-3"><div class="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">1</div><p class="text-slate-300 text-sm">아래 버튼으로 <b class="text-white">앱을 설치</b>하세요</p></div>' +
    '      <div class="flex items-start gap-3"><div class="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">2</div><p class="text-slate-300 text-sm">설치 후 <b class="text-white">이 링크를 다시 열면</b> 채널 참여 화면이 나타납니다</p></div>' +
    '      <div class="flex items-start gap-3"><div class="w-6 h-6 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">3</div><p class="text-slate-300 text-sm"><b class="text-white">참여하기</b>를 누르면 알림을 받을 수 있어요</p></div>' +
    '    </div>' +
    '    <button onclick="goInstall()" class="btn-green w-full text-white py-4 rounded-2xl font-bold text-base mb-3"><i class="fas fa-download mr-2"></i>앱 설치하기 (Android)</button>' +
    '    <button onclick="showScreen(\'screen-join\')" class="w-full text-slate-400 py-2 text-sm">이미 설치했어요 → 앱 열기</button>' +
    '  </div>' +
    '</div>'
  ) : (
    '<div id="screen-error" class="fade-in" style="display:flex;flex-direction:column">' +
    '  <div class="glass rounded-3xl p-8 text-center w-full">' +
    '    <div class="w-20 h-20 mx-auto mb-5 rounded-full bg-red-900/30 flex items-center justify-center border border-red-500/30"><i class="fas fa-' + errIcon + ' text-red-400 text-3xl"></i></div>' +
    '    <h1 class="text-white text-xl font-bold mb-3">' + errTitle + '</h1>' +
    '    <p class="text-slate-400 text-sm mb-6">' + statusMsg + '</p>' +
    '    <p class="text-slate-500 text-xs">채널 관리자에게 새로운 초대 링크를 요청하세요</p>' +
    '  </div>' +
    '</div>'
  )

  return c.html(
    '<!DOCTYPE html>' +
    '<html lang="ko"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
    '<title>' + (isValid ? channelName + ' - 채널 초대' : '유효하지 않은 링크') + ' | PushNotify</title>' +
    '<meta name="theme-color" content="#6366f1">' +
    '<script src="https://cdn.tailwindcss.com"><\/script>' +
    '<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">' +
    '<style>' +
    '* { box-sizing:border-box; }' +
    'body { background:linear-gradient(160deg,#0f0c29 0%,#1e1b4b 50%,#0f0c29 100%); min-height:100vh; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }' +
    '.glass { background:rgba(30,27,75,0.85); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border:1px solid rgba(139,92,246,0.25); }' +
    '.btn-primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); box-shadow:0 6px 24px rgba(99,102,241,0.45); transition:all .2s; border:none; cursor:pointer; }' +
    '.btn-primary:active { transform:scale(0.97); opacity:.9; }' +
    '.btn-green { background:linear-gradient(135deg,#10b981,#059669); box-shadow:0 6px 24px rgba(16,185,129,0.35); transition:all .2s; border:none; cursor:pointer; }' +
    '.btn-green:active { transform:scale(0.97); }' +
    '.pulse-ring { animation:pulseRing 2s ease-out infinite; }' +
    '@keyframes pulseRing { 0%{box-shadow:0 0 0 0 rgba(99,102,241,.5)} 70%{box-shadow:0 0 0 18px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }' +
    '.fade-in { animation:fadeIn .5s ease both; }' +
    '@keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }' +
    '</style></head>' +
    '<body class="flex items-center justify-center p-4 min-h-screen">' +
    '<div class="w-full max-w-sm mx-auto">' +
    '<div id="screen-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5rem 0">' +
    '  <div class="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" style="border-top-color:#6366f1;border-color:rgba(99,102,241,.3)"></div>' +
    '  <p class="text-slate-300 text-sm">앱 확인 중...</p>' +
    '</div>' +
    validBody +
    '</div>' +
    '<script>' +
    'var DEEP_LINK="' + DEEP_LINK + '";' +
    'var INSTALL_URL="' + INSTALL_URL + '";' +
    'var ua=navigator.userAgent.toLowerCase();' +
    'var isMobile=/android|iphone|ipad|ipod/.test(ua);' +
    'function showScreen(id){' +
    '  ["screen-loading","screen-join","screen-install","screen-error"].forEach(function(s){' +
    '    var el=document.getElementById(s);' +
    '    if(!el)return;' +
    '    if(s===id){el.style.display=s==="screen-loading"?"flex":"block";}' +
    '    else{el.style.display="none";}' +
    '  });' +
    '}' +
    'function openInApp(){' +
    '  var start=Date.now();' +
    '  window.location.href=DEEP_LINK;' +
    '  var t=setTimeout(function(){if(!document.hidden&&Date.now()-start<3500){showScreen("screen-install");}},2500);' +
    '  document.addEventListener("visibilitychange",function(){if(document.hidden)clearTimeout(t);},{once:true});' +
    '}' +
    'function goInstall(){' +
    '  window.location.href=INSTALL_URL;' +
    '  setTimeout(function(){showScreen("screen-join");},3000);' +
    '}' +
    (isValid ? (
      'if(isMobile){' +
      '  showScreen("screen-loading");' +
      '  window.location.href=DEEP_LINK;' +
      '  var autoT=setTimeout(function(){showScreen("screen-install");},2200);' +
      '  document.addEventListener("visibilitychange",function(){' +
      '    if(document.hidden){clearTimeout(autoT);setTimeout(function(){showScreen("screen-join");},500);}' +
      '  },{once:true});' +
      '}else{showScreen("screen-join");}' 
    ) : '') +
    '<\/script>' +
    '</body></html>'
  )
})

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
  --bg: #121212; --bg2: #1E1E2E; --bg3: #2A2A3E;
  --primary: #6C63FF; --primary-dim: rgba(108,99,255,0.15);
  --teal: #26D0CE; --text: #FFFFFF; --text2: #B0B0C0;
  --text3: #707080; --border: #2E2E42;
  --danger: #EF4444; --success: #4CAF50; --nav-h: 62px;
}
body { background:var(--bg); color:var(--text); font-family:-apple-system,'Noto Sans KR',sans-serif; height:100dvh; overflow:hidden; display:flex; flex-direction:column; }

/* ── 앱바 ── */
.appbar { height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 16px; background:var(--primary); flex-shrink:0; }
.appbar-left { display:flex; align-items:center; gap:10px; }
.appbar-icon { background:rgba(255,255,255,0.2); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; }
.appbar-title { font-size:20px; font-weight:700; color:#fff; }
.appbar-menu { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:6px; }

/* ── 하단 네비 ── */
.bottom-nav { height:var(--nav-h); display:flex; background:var(--bg2); border-top:1px solid var(--border); flex-shrink:0; }
.nav-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; background:none; border:none; color:var(--text3); cursor:pointer; font-size:10px; transition:color 0.15s; padding:4px 0; }
.nav-btn i { font-size:20px; }
.nav-btn.active { color:var(--primary); }

/* ── 화면 ── */
#screen-wrap { flex:1; overflow:hidden; position:relative; }
.screen { display:none; position:absolute; inset:0; overflow-y:auto; flex-direction:column; }
.screen.active { display:flex; }

/* ── 섹션 헤더 ── */
.section-header { display:flex; align-items:center; justify-content:space-between; padding:16px 16px 8px; }
.section-title { font-size:16px; font-weight:700; }
.section-btn { background:var(--bg3); border:1px solid rgba(108,99,255,0.4); color:var(--primary); font-size:12px; font-weight:600; padding:6px 12px; border-radius:20px; cursor:pointer; display:flex; align-items:center; gap:5px; }

/* ── 채널 타일 (운영) ── */
.channel-tile { display:flex; align-items:center; gap:10px; background:var(--bg2); margin:3px 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--border); }
.channel-tile .info { flex:1; min-width:0; }
.channel-tile .ch-name { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.channel-tile .ch-sub { font-size:11px; color:var(--text3); margin-top:2px; }

/* 운영 채널 액션 버튼 3개 */
.ch-actions { display:flex; gap:4px; flex-shrink:0; }
.ch-action-btn { width:34px; height:34px; border-radius:8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; transition:opacity 0.15s; }
.ch-action-btn:active { opacity:0.7; }
.btn-alarm  { background:rgba(38,208,206,0.15); color:var(--teal); }
.btn-invite { background:rgba(108,99,255,0.15); color:var(--primary); }
.btn-setting{ background:rgba(112,112,128,0.2); color:var(--text2); }

/* ── 가입 채널 타일 ── */
.joined-tile { display:flex; align-items:center; gap:10px; background:var(--bg2); margin:3px 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--border); cursor:pointer; }
.joined-tile:active { background:var(--bg3); }
.joined-tile .info { flex:1; min-width:0; }
.joined-tile .chevron { color:var(--text3); font-size:13px; }

/* ── 아바타 ── */
.avatar { border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; }
.avatar img { width:100%; height:100%; object-fit:cover; }

/* ── 더보기 버튼 ── */
.more-btn { display:flex; align-items:center; justify-content:center; gap:6px; margin:6px 14px 2px; padding:10px; background:var(--bg2); border:1px dashed var(--border); border-radius:10px; color:var(--text3); font-size:13px; cursor:pointer; }
.more-btn:active { background:var(--bg3); }

/* ── 빈 상태 ── */
.empty-box { margin:12px 14px; padding:20px; background:var(--bg2); border-radius:12px; text-align:center; color:var(--text3); font-size:13px; line-height:1.6; }

/* ── 로딩 ── */
.loading { padding:24px; text-align:center; color:var(--text3); }
@keyframes spin { to { transform:rotate(360deg); } }
.spin { animation:spin 0.8s linear infinite; display:inline-block; }

/* ── 사이드 드로어 ── */
.drawer-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:200; opacity:0; pointer-events:none; transition:opacity 0.25s; }
.drawer-overlay.open { opacity:1; pointer-events:all; }
.drawer { position:fixed; top:0; right:0; bottom:0; width:72vw; max-width:280px; background:var(--bg2); z-index:201; transform:translateX(100%); transition:transform 0.25s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; }
.drawer.open { transform:translateX(0); }
.drawer-header { padding:20px 16px 12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
.drawer-logo { width:36px; height:36px; background:var(--primary); border-radius:10px; display:flex; align-items:center; justify-content:center; }
.drawer-app-name { font-size:17px; font-weight:700; }
.drawer-menu-label { font-size:11px; color:var(--text3); font-weight:600; letter-spacing:0.05em; padding:14px 16px 4px; text-transform:uppercase; }
.drawer-menu-item { display:flex; align-items:center; gap:12px; padding:13px 16px; cursor:pointer; color:var(--text2); font-size:14px; font-weight:500; transition:background 0.15s; }
.drawer-menu-item:active { background:var(--bg3); }
.drawer-menu-item i { width:20px; text-align:center; color:var(--text3); font-size:15px; }
.drawer-version { margin-top:auto; padding:12px 16px; font-size:11px; color:var(--text3); border-top:1px solid var(--border); }

/* ── 모달 ── */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:300; display:none; align-items:flex-end; justify-content:center; }
.modal-overlay.active { display:flex; }
.modal-sheet { background:var(--bg2); border-radius:20px 20px 0 0; width:100%; max-height:88vh; overflow-y:auto; padding-bottom:env(safe-area-inset-bottom,16px); }
.modal-handle { width:36px; height:4px; background:var(--border); border-radius:2px; margin:10px auto 4px; }
.modal-title { font-size:17px; font-weight:700; padding:8px 16px 12px; }
.modal-body { padding:0 16px 12px; }
.form-label { font-size:12px; color:var(--text2); font-weight:600; margin-bottom:5px; margin-top:12px; display:block; }
.form-input { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:11px 13px; font-size:14px; outline:none; font-family:inherit; resize:none; }
.form-input:focus { border-color:var(--primary); }
.form-textarea { min-height:80px; }
.char-count { font-size:11px; color:var(--text3); text-align:right; margin-top:3px; }
.img-picker { display:flex; align-items:center; gap:12px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 14px; cursor:pointer; margin-top:4px; }
.img-thumb { width:52px; height:52px; border-radius:8px; background:var(--bg2); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }
.img-thumb img { width:100%; height:100%; object-fit:cover; }
.img-hint { font-size:12px; color:var(--text3); }
.btn-teal { width:100%; background:var(--teal); color:#fff; font-size:16px; font-weight:700; padding:15px; border:none; border-radius:12px; cursor:pointer; margin-top:14px; }
.btn-ghost { width:100%; background:transparent; border:1px solid var(--border); color:var(--text2); font-size:14px; padding:12px; border-radius:12px; cursor:pointer; margin-top:8px; }
.btn-danger-outline { width:100%; background:transparent; border:1px solid rgba(239,68,68,0.4); color:var(--danger); font-size:14px; padding:12px; border-radius:12px; cursor:pointer; margin-top:8px; }
.img-src-btn { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid var(--border); cursor:pointer; color:var(--text); font-size:14px; }
.img-src-btn:last-child { border-bottom:none; }
.img-src-btn i { width:28px; text-align:center; color:var(--primary); font-size:18px; }

/* ── 수신함 ── */
.notif-card { background:var(--bg2); margin:4px 14px; padding:13px; border-radius:12px; border:1px solid var(--border); }
.notif-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:6px; }
.notif-icon-wrap { width:36px; height:36px; background:var(--primary-dim); border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.notif-meta { flex:1; min-width:0; }
.notif-title { font-size:14px; font-weight:600; }
.notif-channel { font-size:11px; color:var(--text3); margin-top:2px; }
.notif-time { font-size:11px; color:var(--text3); white-space:nowrap; }
.notif-body { font-size:13px; color:var(--text2); line-height:1.5; }
.notif-actions { display:flex; gap:8px; margin-top:10px; }
.btn-accept { flex:1; background:rgba(76,175,80,0.15); border:1px solid rgba(76,175,80,0.4); color:var(--success); padding:9px; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.btn-reject { flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:var(--danger); padding:9px; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.status-badge { display:inline-flex; align-items:center; gap:4px; font-size:10px; padding:3px 7px; border-radius:20px; font-weight:600; margin-top:4px; }
.badge-accepted { background:rgba(76,175,80,0.15); color:var(--success); }
.badge-rejected { background:rgba(239,68,68,0.1); color:var(--danger); }
.badge-pending { background:rgba(108,99,255,0.15); color:var(--primary); }

/* ── 설정 화면 ── */
.settings-menu-label { font-size:12px; color:var(--text3); font-weight:600; letter-spacing:0.05em; padding:16px 16px 6px; text-transform:uppercase; }
.settings-menu-item { display:flex; align-items:center; gap:14px; padding:15px 16px; cursor:pointer; color:var(--text); font-size:15px; transition:background 0.15s; border-bottom:1px solid var(--border); }
.settings-menu-item:active { background:var(--bg3); }
.settings-menu-item i { width:22px; text-align:center; color:var(--primary); font-size:16px; }
.settings-menu-item .menu-arrow { margin-left:auto; color:var(--text3); font-size:12px; }
.settings-info-card { margin:12px 14px; background:var(--bg2); border-radius:12px; border:1px solid var(--border); overflow:hidden; }
.settings-info-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
.settings-info-row:last-child { border-bottom:none; }
.settings-info-label { font-size:12px; color:var(--text3); }
.settings-info-value { font-size:12px; color:var(--text2); font-family:monospace; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ── 토스트 ── */
#toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px); background:rgba(40,40,60,0.95); color:#fff; padding:10px 20px; border-radius:20px; font-size:13px; font-weight:500; opacity:0; transition:all 0.25s; pointer-events:none; white-space:nowrap; z-index:999; }
#toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

/* ── 로그인/회원가입 풀스크린 ── */
#auth-screen {
  position:fixed; inset:0; z-index:1000;
  background:linear-gradient(160deg,#0D0D1A 0%,#1A1028 50%,#0D0D1A 100%);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0 28px; overflow-y:auto;
}
#auth-screen.hidden { display:none; }

.auth-logo-wrap {
  display:flex; flex-direction:column; align-items:center; gap:10px; margin-bottom:32px;
}
.auth-logo-icon {
  width:80px; height:80px; border-radius:22px;
  background:linear-gradient(135deg,#FF6B6B,#FF8E53);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 8px 32px rgba(255,107,107,0.35);
}
.auth-app-title { font-size:26px; font-weight:800; color:#fff; letter-spacing:-0.3px; }
.auth-app-sub { font-size:13px; color:#8888AA; margin-top:-4px; }

/* 탭 전환 */
.auth-tab-bar {
  display:flex; width:100%; background:#1E1E2E; border-radius:14px;
  padding:4px; gap:4px; margin-bottom:24px;
}
.auth-tab {
  flex:1; padding:11px 0; border:none; border-radius:10px;
  font-size:15px; font-weight:600; cursor:pointer;
  background:transparent; color:#6B6B8A; transition:all 0.2s;
}
.auth-tab.active { background:var(--primary); color:#fff; box-shadow:0 2px 12px rgba(108,99,255,0.35); }

/* 입력 폼 */
.auth-form { width:100%; display:flex; flex-direction:column; gap:14px; }
.auth-input-wrap {
  display:flex; align-items:center; gap:10px;
  background:#1E1E2E; border:1.5px solid #2A2A42;
  border-radius:12px; padding:14px 14px;
  transition:border-color 0.2s;
}
.auth-input-wrap:focus-within { border-color:var(--primary); }
.auth-input-wrap i { color:#5555AA; font-size:15px; width:16px; text-align:center; flex-shrink:0; }
.auth-input-wrap input {
  flex:1; background:transparent; border:none; outline:none;
  color:#fff; font-size:15px; font-family:inherit;
}
.auth-input-wrap input::placeholder { color:#4A4A6A; }
.auth-eye-btn { background:none; border:none; color:#5555AA; cursor:pointer; padding:0 2px; font-size:15px; }

.auth-submit-btn {
  width:100%; padding:16px; border:none; border-radius:14px;
  font-size:16px; font-weight:700; cursor:pointer; color:#fff;
  background:linear-gradient(135deg,#FF6B6B,#FF8E53);
  box-shadow:0 4px 20px rgba(255,107,107,0.35);
  margin-top:6px; transition:opacity 0.2s; letter-spacing:0.3px;
}
.auth-submit-btn:active { opacity:0.85; }
.auth-submit-btn:disabled { opacity:0.5; cursor:not-allowed; }

.auth-error {
  background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3);
  color:#FF7070; font-size:13px; padding:10px 14px; border-radius:10px;
  text-align:center; display:none;
}
.auth-error.show { display:block; }
</style>
</head>
<body>

<!-- ══ 로그인 / 회원가입 화면 ══ -->
<div id="auth-screen">
  <!-- 로고 -->
  <div class="auth-logo-wrap">
    <div class="auth-logo-icon">
      <i class="fas fa-clock" style="color:#fff;font-size:34px;"></i>
    </div>
    <div class="auth-app-title">PushNotify</div>
    <div class="auth-app-sub">채널 알림 구독 서비스</div>
  </div>

  <!-- 탭 -->
  <div class="auth-tab-bar">
    <button class="auth-tab active" id="tab-login"  onclick="Auth.switchTab('login')">로그인</button>
    <button class="auth-tab"        id="tab-signup" onclick="Auth.switchTab('signup')">회원가입</button>
  </div>

  <!-- 로그인 폼 -->
  <div class="auth-form" id="form-login">
    <div class="auth-input-wrap">
      <i class="fas fa-envelope"></i>
      <input type="email" id="login-email" placeholder="example@email.com" autocomplete="email">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="login-pw" placeholder="비밀번호 입력" autocomplete="current-password">
      <button class="auth-eye-btn" onclick="Auth.togglePw('login-pw',this)"><i class="fas fa-eye-slash"></i></button>
    </div>
    <div class="auth-error" id="login-error"></div>
    <button class="auth-submit-btn" id="login-btn" onclick="Auth.login()">로그인</button>
  </div>

  <!-- 회원가입 폼 -->
  <div class="auth-form" id="form-signup" style="display:none;">
    <div class="auth-input-wrap">
      <i class="fas fa-user"></i>
      <input type="text" id="signup-name" placeholder="닉네임" autocomplete="nickname">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-envelope"></i>
      <input type="email" id="signup-email" placeholder="example@email.com" autocomplete="email">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="signup-pw" placeholder="비밀번호 (6자 이상)" autocomplete="new-password">
      <button class="auth-eye-btn" onclick="Auth.togglePw('signup-pw',this)"><i class="fas fa-eye-slash"></i></button>
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="signup-pw2" placeholder="비밀번호 확인" autocomplete="new-password">
    </div>
    <div class="auth-error" id="signup-error"></div>
    <button class="auth-submit-btn" id="signup-btn" onclick="Auth.signup()">회원가입</button>
  </div>

  <div style="height:40px;"></div>
</div>

<!-- ══ 앱바 ══ -->
<div class="appbar" id="appbar" style="display:none;">
  <div class="appbar-left">
    <div class="appbar-icon"><i class="fas fa-bell" style="color:#fff;font-size:16px;"></i></div>
    <span class="appbar-title">PushNotify</span>
  </div>
  <button class="appbar-menu" onclick="App.openDrawer()"><i class="fas fa-bars"></i></button>
</div>

<!-- ══ 화면 영역 ══ -->
<div id="screen-wrap" style="display:none;">

  <!-- 홈 화면 -->
  <div class="screen active" id="screen-home">
    <!-- 사용자 환영 카드 -->
    <div style="margin:12px 14px 4px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;gap:10px;">
      <div style="width:38px;height:38px;border-radius:10px;background:var(--primary-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="fas fa-user" style="color:var(--primary);font-size:16px;"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--text3);">안녕하세요 👋</div>
        <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="home-username">-</div>
      </div>
    </div>
    <!-- 나의 운영채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">나의 운영채널</span>
      <button class="section-btn" onclick="App.openCreateChannel()"><i class="fas fa-plus"></i> 채널 만들기</button>
    </div>
    <div id="owned-list"></div>
    <div id="owned-more" style="display:none;"></div>

    <!-- 나의 가입채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">나의 가입채널</span>
      <button class="section-btn" onclick="App.openJoinChannel()"><i class="fas fa-plus"></i> 채널 참여</button>
    </div>
    <div id="joined-list"></div>
    <div id="joined-more" style="display:none;"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 채널 탭 -->
  <div class="screen" id="screen-channel">
    <div class="section-header">
      <span class="section-title">채널</span>
    </div>
    <div id="channel-list-all"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 수신함 -->
  <div class="screen" id="screen-inbox">
    <div class="section-header">
      <span class="section-title">수신함</span>
      <button class="section-btn" onclick="App.clearInbox()"><i class="fas fa-trash-alt"></i> 비우기</button>
    </div>
    <div id="inbox-list"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 발신함 -->
  <div class="screen" id="screen-send">
    <div class="section-header">
      <span class="section-title">발신함</span>
    </div>
    <div id="send-list"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 설정 화면 -->
  <div class="screen" id="screen-settings">
    <div class="section-header">
      <span class="section-title">설정</span>
    </div>
    <div class="settings-menu-label">메뉴</div>
    <div class="settings-menu-item" onclick="App.goto('home')">
      <i class="fas fa-satellite-dish"></i> 나의 운영 채널
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.openCreateChannel()">
      <i class="fas fa-plus-circle"></i> 채널 만들기
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.goto('channel')">
      <i class="fas fa-list"></i> 나의 가입 채널
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.openJoinChannel()">
      <i class="fas fa-door-open"></i> 채널 참여
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="toast('준비 중입니다')">
      <i class="fas fa-shield-alt"></i> 개인정보보호정책
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="toast('v1.0.0 (web)')">
      <i class="fas fa-info-circle"></i> 버전
      <span style="margin-left:auto;font-size:13px;color:var(--text3);">v1.0.0</span>
    </div>

    <div class="settings-menu-label" style="margin-top:8px;">계정 정보</div>
    <div class="settings-info-card">
      <div class="settings-info-row">
        <span class="settings-info-label">이름</span>
        <span class="settings-info-value" id="settings-display-name">-</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">이메일</span>
        <span class="settings-info-value" id="settings-email">-</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">사용자 ID</span>
        <span class="settings-info-value" id="settings-user-id">-</span>
      </div>
      <div class="settings-info-row" onclick="App.showFcmToken()" style="cursor:pointer;">
        <span class="settings-info-label">FCM 토큰</span>
        <span class="settings-info-value" id="settings-fcm-token">-</span>
      </div>
    </div>
    <button class="btn-danger-outline" style="margin:12px 14px 6px;width:calc(100% - 28px);" onclick="App.logout()">
      <i class="fas fa-sign-out-alt"></i> 로그아웃
    </button>
    <button class="btn-ghost" style="margin:0 14px 12px;width:calc(100% - 28px);" onclick="App.resetDevice()">
      <i class="fas fa-trash-restore"></i> 기기 초기화
    </button>
    <div style="height:20px;"></div>
  </div>

</div><!-- /screen-wrap -->

<!-- ══ 하단 네비 ══ -->
<div class="bottom-nav" style="display:none;">
  <button class="nav-btn active" id="nav-home" onclick="App.goto('home')">
    <i class="fas fa-home"></i><span>홈</span>
  </button>
  <button class="nav-btn" id="nav-channel" onclick="App.goto('channel')">
    <i class="fas fa-layer-group"></i><span>채널</span>
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

<!-- ══ 사이드 드로어 ══ -->
<div class="drawer-overlay" id="drawer-overlay" onclick="App.closeDrawer()"></div>
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <div class="drawer-logo"><i class="fas fa-bell" style="color:#fff;font-size:18px;"></i></div>
    <div style="flex:1;min-width:0;">
      <div class="drawer-app-name">PushNotify</div>
      <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="drawer-user-email">로그인 중...</div>
    </div>
  </div>
  <div class="drawer-menu-label">메뉴</div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('home')">
    <i class="fas fa-satellite-dish"></i> 나의 운영 채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.openCreateChannel()">
    <i class="fas fa-plus-circle"></i> 채널 만들기
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('channel')">
    <i class="fas fa-list"></i> 나의 가입 채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.openJoinChannel()">
    <i class="fas fa-door-open"></i> 채널 참여
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();toast('준비 중입니다')">
    <i class="fas fa-shield-alt"></i> 개인정보보호정책
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();toast('v1.0.0 (web)')">
    <i class="fas fa-info-circle"></i> 버전
    <span style="margin-left:auto;font-size:12px;color:var(--text3);">v1.0.0</span>
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.logout()" style="color:var(--danger);">
    <i class="fas fa-sign-out-alt" style="color:var(--danger);"></i> 로그아웃
  </div>
  <div class="drawer-version">PushNotify Web v1.0.0</div>
</div>

<!-- ══ 모달: 채널 만들기 ══ -->
<div class="modal-overlay" id="modal-create">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 만들기</div>
    <div class="modal-body">
      <label class="form-label">채널명 *</label>
      <input class="form-input" id="create-name" placeholder="10자 내로 적어주세요" maxlength="10"
        oninput="document.getElementById('create-name-cnt').textContent=this.value.length+'/10'">
      <div class="char-count" id="create-name-cnt">0/10</div>

      <label class="form-label">채널 전화번호</label>
      <input class="form-input" id="create-phone" type="tel" placeholder="010-0000-0000">

      <label class="form-label">채널 소개 *</label>
      <textarea class="form-input form-textarea" id="create-desc" placeholder="50자 내로 적어주세요" rows="3" maxlength="50"
        oninput="document.getElementById('create-desc-cnt').textContent=this.value.length+'/50'"></textarea>
      <div class="char-count" id="create-desc-cnt">0/50</div>

      <label class="form-label">채널 대표이미지 선택</label>
      <div class="img-picker" onclick="App.openImagePicker('create')">
        <div class="img-thumb" id="create-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">미선택시 기본 이미지 적용</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="create-homepage" type="url" placeholder="https://">

      <button class="btn-teal" onclick="App.createChannel()">확인</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-create')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 채널 수정 ══ -->
<div class="modal-overlay" id="modal-edit">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 설정</div>
    <div class="modal-body">
      <input type="hidden" id="edit-channel-id">
      <label class="form-label">채널명</label>
      <input class="form-input" id="edit-name" maxlength="10">

      <label class="form-label">채널 소개</label>
      <textarea class="form-input form-textarea" id="edit-desc" maxlength="50" rows="3"></textarea>

      <label class="form-label">채널 대표이미지</label>
      <div class="img-picker" onclick="App.openImagePicker('edit')">
        <div class="img-thumb" id="edit-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">탭하여 변경</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="edit-homepage" type="url" placeholder="https://">

      <button class="btn-teal" onclick="App.saveEditChannel()">저장</button>
      <button class="btn-danger-outline" onclick="App.confirmDeleteChannelFromEdit()">채널 삭제</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-edit')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 알람 설정 전체화면 ══ -->
<div class="fullscreen-overlay" id="modal-alarm">
  <!-- 앱바 -->
  <div class="app-bar" style="display:flex;align-items:center;gap:6px;padding:0 16px;">
    <button class="appbar-back" onclick="App.closeModal('modal-alarm')">
      <i class="fas fa-arrow-left"></i>
    </button>
    <span id="alarm-modal-title" style="font-size:17px;font-weight:700;flex:1;">알람 설정</span>
  </div>

  <!-- 스크롤 영역 -->
  <div style="flex:1;overflow-y:auto;padding-bottom:90px;">

    <!-- 메시지 소스 선택 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">메시지 소스</div>
      <div class="msg-type-row">
        <div class="msg-type-btn selected" id="src-youtube"  onclick="App.selectMsgSrc('youtube')">
          <div class="msg-type-icon" style="background:#FF0000;"><i class="fab fa-youtube" style="color:#fff;"></i></div>
          <span class="msg-type-label">YouTube</span>
        </div>
        <div class="msg-type-btn" id="src-audio" onclick="App.selectMsgSrc('audio')">
          <div class="msg-type-icon" style="background:#4CAF50;"><i class="fas fa-microphone" style="color:#fff;"></i></div>
          <span class="msg-type-label">오디오</span>
        </div>
        <div class="msg-type-btn" id="src-video" onclick="App.selectMsgSrc('video')">
          <div class="msg-type-icon" style="background:#2196F3;"><i class="fas fa-video" style="color:#fff;"></i></div>
          <span class="msg-type-label">비디오</span>
        </div>
        <div class="msg-type-btn" id="src-file" onclick="App.selectMsgSrc('file')">
          <div class="msg-type-icon" style="background:#9C27B0;"><i class="fas fa-paperclip" style="color:#fff;"></i></div>
          <span class="msg-type-label">파일</span>
        </div>
      </div>
      <!-- 소스별 입력 영역 -->
      <div class="msg-input-area" id="alarm-input-area">
        <input id="alarm-youtube-url" type="url" placeholder="YouTube URL 붙여넣기 (https://youtube.com/...)" style="display:block;">
        <input id="alarm-audio-file" type="file" accept="audio/*" style="display:none;" onchange="App.onAlarmFileSelected(this,'audio')">
        <input id="alarm-video-file" type="file" accept="video/*" style="display:none;" onchange="App.onAlarmFileSelected(this,'video')">
        <input id="alarm-attach-file" type="file" style="display:none;" onchange="App.onAlarmFileSelected(this,'file')">
        <div id="alarm-file-preview" style="display:none;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--teal);"></div>
        <div id="alarm-src-hint" style="font-size:12px;color:var(--text3);display:none;"></div>
      </div>
    </div>

    <!-- 날짜 선택 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">날짜 선택</div>
      <div class="calendar-wrap">
        <div class="cal-header">
          <button class="cal-nav-btn" onclick="App.calMove(-1)"><i class="fas fa-chevron-left"></i></button>
          <span class="cal-month" id="cal-month-label"></span>
          <button class="cal-nav-btn" onclick="App.calMove(1)"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="cal-grid">
          <div class="cal-dow">일</div><div class="cal-dow">월</div><div class="cal-dow">화</div>
          <div class="cal-dow">수</div><div class="cal-dow">목</div><div class="cal-dow">금</div>
          <div class="cal-dow">토</div>
        </div>
        <div class="cal-grid" id="cal-days"></div>
      </div>
    </div>

    <!-- 시간 선택 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">시간 선택</div>
      <div class="time-picker">
        <div class="time-col">
          <button class="time-spin" onclick="App.changeHour(1)"><i class="fas fa-chevron-up"></i></button>
          <div class="time-val" id="time-hour">09</div>
          <button class="time-spin" onclick="App.changeHour(-1)"><i class="fas fa-chevron-down"></i></button>
        </div>
        <div class="time-sep">:</div>
        <div class="time-col">
          <button class="time-spin" onclick="App.changeMin(5)"><i class="fas fa-chevron-up"></i></button>
          <div class="time-val" id="time-min">00</div>
          <button class="time-spin" onclick="App.changeMin(-5)"><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>
    </div>

  </div><!-- /스크롤 -->

  <!-- 하단 고정 버튼 -->
  <div class="alarm-bottom-btns">
    <button class="btn-alarm-cancel" onclick="App.closeModal('modal-alarm')">취소</button>
    <button class="btn-alarm-done"   onclick="App.saveAlarmSetting()">확인</button>
  </div>
</div>

<!-- ══ 모달: 초대코드 ══ -->
<div class="modal-overlay" id="modal-invite">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">초대 코드</div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text2);margin-bottom:10px;" id="invite-channel-name-label"></p>
      <div id="invite-code-box" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;font-family:monospace;font-size:13px;color:var(--primary);word-break:break-all;line-height:1.6;">
        초대 링크를 불러오는 중...
      </div>
      <button class="btn-teal" onclick="App.copyInviteCode()" style="margin-top:12px;">
        <i class="fas fa-copy"></i> 복사
      </button>
      <button class="btn-ghost" onclick="App.closeModal('modal-invite')">닫기</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 채널 참여 ══ -->
<div class="modal-overlay" id="modal-join">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 참여</div>
    <div class="modal-body">
      <label class="form-label">초대 코드 또는 초대 링크</label>
      <input class="form-input" id="join-token" placeholder="코드 또는 URL 붙여넣기">
      <button class="btn-teal" onclick="App.joinChannel()">참여하기</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-join')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 이미지 소스 선택 ══ -->
<div class="modal-overlay" id="modal-img-src">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">이미지 선택</div>
    <div class="modal-body">
      <div class="img-src-btn" onclick="App.pickImageFrom('camera')">
        <i class="fas fa-camera"></i> 카메라
      </div>
      <div class="img-src-btn" onclick="App.pickImageFrom('gallery')">
        <i class="fas fa-images"></i> 갤러리
      </div>
      <div class="img-src-btn" onclick="App.closeModal('modal-img-src')">
        <i class="fas fa-times"></i> 취소
      </div>
    </div>
  </div>
</div>

<!-- 파일 인풋 (hidden) -->
<input type="file" id="file-input" accept="image/*" style="display:none" onchange="App.onFileSelected(this)">
<input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none" onchange="App.onFileSelected(this)">

<!-- 토스트 -->
<div id="toast"></div>

<!-- 알람 설정 + 토글 스타일 -->
<style>
.toggle-btn { width:48px; height:26px; background:var(--border); border:none; border-radius:13px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
.toggle-btn span { position:absolute; top:3px; left:3px; width:20px; height:20px; background:#fff; border-radius:50%; transition:transform 0.2s; }
.toggle-btn.on { background:var(--primary); }
.toggle-btn.on span { transform:translateX(22px); }
/* ── 알람 설정 전체화면 ── */
.alarm-section-card { margin:10px 14px; background:var(--bg2); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
.alarm-section-title { font-size:18px; font-weight:700; color:var(--text); padding:18px 16px 14px; }
.alarm-section-row { display:flex; align-items:center; justify-content:space-between; padding:16px; border-top:1px solid var(--border); cursor:pointer; transition:background 0.15s; }
.alarm-section-row:active { background:var(--bg3); }
.alarm-section-row-label { font-size:16px; font-weight:600; color:var(--text); }
.alarm-section-row-value { font-size:13px; color:var(--primary); max-width:55%; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* 메시지 타입 1행 */
.msg-type-row { display:flex; flex-direction:row; gap:8px; padding:12px 14px; }
.msg-type-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; background:var(--bg3); border:2px solid var(--border); border-radius:12px; padding:10px 6px; cursor:pointer; transition:all 0.15s; flex:1; }
.msg-type-btn.selected { border-color:var(--primary); background:var(--primary-dim); }
.msg-type-btn:active { opacity:0.8; }
.msg-type-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; }
.msg-type-label { font-size:11px; font-weight:600; color:var(--text2); white-space:nowrap; }
.msg-type-btn.selected .msg-type-label { color:var(--primary); }
.msg-input-area { padding:0 14px 14px; display:flex; flex-direction:column; gap:8px; }
.msg-input-area input, .msg-input-area textarea { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:11px 13px; font-size:14px; outline:none; font-family:inherit; resize:none; }
.msg-input-area input:focus, .msg-input-area textarea:focus { border-color:var(--primary); }
/* 달력 */
.calendar-wrap { padding:10px 14px; }
.cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.cal-nav-btn { background:none; border:none; color:var(--text2); font-size:18px; cursor:pointer; padding:4px 12px; border-radius:8px; }
.cal-nav-btn:active { background:var(--bg3); }
.cal-month { font-size:16px; font-weight:700; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
.cal-dow { text-align:center; font-size:11px; color:var(--text3); padding:4px 0; font-weight:600; }
.cal-day { text-align:center; padding:8px 2px; border-radius:8px; cursor:pointer; font-size:14px; transition:background 0.1s; }
.cal-day:hover { background:var(--bg3); }
.cal-day.today { color:var(--teal); font-weight:700; }
.cal-day.selected { background:var(--primary) !important; color:#fff; font-weight:700; border-radius:50%; }
.cal-day.other-month { color:var(--text3); opacity:0.4; }
/* 시간 피커 */
.time-picker { display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; }
.time-col { display:flex; flex-direction:column; align-items:center; gap:4px; }
.time-spin { background:none; border:none; color:var(--text2); font-size:20px; cursor:pointer; padding:4px 14px; border-radius:8px; }
.time-spin:active { background:var(--bg3); }
.time-val { font-size:32px; font-weight:700; min-width:56px; text-align:center; background:var(--bg3); border-radius:10px; padding:10px 4px; }
.time-sep { font-size:28px; font-weight:700; color:var(--text2); padding-bottom:8px; }
/* 하단 버튼 */
.alarm-bottom-btns { display:flex; gap:10px; padding:14px 14px 24px; position:sticky; bottom:0; background:var(--bg); }
.btn-alarm-done { flex:1; background:var(--teal); color:#fff; font-size:17px; font-weight:700; padding:16px; border:none; border-radius:14px; cursor:pointer; }
.btn-alarm-cancel { flex:1; background:var(--bg3); border:1px solid var(--border); color:var(--text2); font-size:17px; font-weight:600; padding:16px; border-radius:14px; cursor:pointer; }
/* 서브화면 앱바 */
.appbar-back { background:none; border:none; color:#fff; font-size:20px; cursor:pointer; padding:6px 8px 6px 0; }
/* 전체화면 오버레이 (알람 설정 등) */
.fullscreen-overlay {
  display:none;
  position:fixed;
  inset:0;
  background:var(--bg);
  z-index:300;
  flex-direction:column;
}
.fullscreen-overlay.active {
  display:flex;
}
</style>

<script src="/static/mobile-app.js"></script>
</body>
</html>`)
})

app.get('*', (c) => c.redirect('/'))

export default app
