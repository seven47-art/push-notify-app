// src/index.tsx
import { Hono } from 'hono'
// [BLOCKED] WebView 정리 예정 – appHtml import 차단
// import { APP_HTML } from './appHtml'
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
import alarms from './routes/alarms'
import fcm from './routes/fcm'
import users from './routes/users'
import notices from './routes/notices'
import settings from './routes/settings'
import admin from './routes/admin'
import uploads from './routes/uploads'
import reports from './routes/reports'
import blocked from './routes/blocked'
import { deleteFromFirebaseStorage } from './routes/uploads'

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
app.route('/api/alarms', alarms)
app.route('/api/fcm', fcm)
app.route('/api/users', users)
app.route('/api/notices', notices)
app.route('/api/settings', settings)
app.route('/api/uploads', uploads)
app.route('/api/reports', reports)
app.route('/api/blocked', blocked)

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Push Notification Admin API' })
})

// APK 다운로드 페이지
app.get('/download', async (c) => {
  // DB에서 최신 APK 정보 읽기, 없으면 GitHub Releases 최신 버전 사용
  let apkVersion = 'v3.7.92'
  let apkUrl = 'https://github.com/seven47-art/push-notify-app/releases/latest/download/RinGo-v3.7.92.apk'
  let apkLabel = 'RinGo-v3.7.92'

  try {
    const row = await c.env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'apk_info'"
    ).first() as { value: string } | null
    if (row) {
      const info = JSON.parse(row.value)
      const dbUrl = info.url || ''
      // Firebase Storage URL은 권한 만료로 사용 불가 → GitHub Releases 기본값 유지
      if (dbUrl && !dbUrl.includes('firebasestorage')) {
        apkVersion = info.version || apkVersion
        apkUrl = dbUrl
        apkLabel = 'RinGo-' + apkVersion
      }
    }
  } catch {}

  // WebView에서는 외부 URL/다운로드 불가 → 크롬 안내 + URL 복사로 대응
  // 일반 브라우저에서는 직접 다운로드 가능
  const downloadBtn = apkUrl
    ? `<a href="/download/apk" id="dlBtn" class="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl transition-all text-lg mb-4">⬇️ ${apkLabel}</a>
       <div id="webviewFallback" class="hidden">
         <div class="bg-indigo-900/40 border border-indigo-400/30 rounded-xl p-4 text-center mb-4">
           <p class="text-white text-sm font-bold mb-3">📢 새 버전이 출시되었습니다!</p>
           <p class="text-indigo-200 text-xs mb-3">이 앱에서는 직접 다운로드가 불가합니다.<br/><b>크롬 브라우저</b>에서 아래 주소로 접속하세요.</p>
           <div class="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
             <span class="flex-1 text-indigo-300 text-sm font-bold">ringo.run</span>
             <button onclick="copyUrl()" id="copyBtn" class="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">복사</button>
           </div>
         </div>
       </div>
       <script>
         function copyUrl(){
           var t=document.createElement('textarea');t.value='https://ringo.run/download';
           document.body.appendChild(t);t.select();document.execCommand('copy');
           document.body.removeChild(t);
           document.getElementById('copyBtn').textContent='✅ 복사됨';
         }
         // 다운로드 버튼 클릭 시 WebView 감지
         document.getElementById('dlBtn').addEventListener('click',function(e){
           // 일반 브라우저면 정상 동작, WebView면 에러 → fallback 표시
           setTimeout(function(){
             document.getElementById('webviewFallback').classList.remove('hidden');
             document.getElementById('dlBtn').classList.add('hidden');
           }, 500);
         });
       </script>`
    : `<button disabled class="block w-full bg-gray-700 text-gray-500 font-bold py-4 px-6 rounded-xl text-lg mb-4 cursor-not-allowed">준비 중...</button>`

  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RinGo 다운로드</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 min-h-screen flex items-center justify-center p-4">
  <div class="bg-gray-900 border border-indigo-500/30 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
    <p class="text-white text-sm mb-5 leading-relaxed font-semibold">전화방식의 새로운 알람앱 링고</p>
    <div class="flex items-center justify-center mx-auto mb-6">
      <img src="/static/ringo-logo.png" alt="RinGo" class="h-20 object-contain" />
    </div>
    <p class="text-gray-500 text-xs mb-6">Android arm64 · ${apkVersion}</p>

    ${downloadBtn}

    <div class="bg-yellow-900/30 border border-yellow-600/30 rounded-xl p-4 text-left text-xs text-yellow-300 space-y-1">
      <p class="font-bold text-yellow-200 mb-2">📋 설치 방법</p>
      <p>1. 크롬 브라우저에서 <b>ringo.run</b> 접속</p>
      <p>2. 다운로드 버튼으로 APK 다운로드</p>
      <p>3. 설정 → 보안 → <b>알 수 없는 앱 허용</b></p>
      <p>4. 다운로드 폴더에서 파일 실행</p>
    </div>

    <p class="text-gray-600 text-xs mt-4">Android 5.0+ / arm64 기기 필요</p>
  </div>
</body>
</html>`)
})

// APK 직접 다운로드 리다이렉트 (WebView 호환)
app.get('/download/apk', async (c) => {
  let apkUrl = 'https://github.com/seven47-art/push-notify-app/releases/latest/download/RinGo-v3.7.92.apk'
  try {
    const row = await c.env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'apk_info'"
    ).first() as { value: string } | null
    if (row) {
      const info = JSON.parse(row.value)
      const dbUrl = info.url || ''
      if (dbUrl && !dbUrl.includes('firebasestorage')) {
        apkUrl = dbUrl
      }
    }
  } catch {}
  return c.redirect(apkUrl)
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
  const channelId   = linkData?.channel_id || ''
  const remaining   = linkData?.max_uses ? linkData.max_uses - linkData.use_count : null

  // APK 다운로드 URL
  const INSTALL_URL = 'https://ringo.run/download'
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
    '    <p class="text-indigo-300 text-xs font-semibold tracking-widest uppercase">RinGo</p>' +
    '  </div>' +
    '  <div class="glass rounded-3xl p-7 text-center mb-4">' +
    imgHtml +
    '    <span class="inline-block bg-indigo-900/60 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full mb-3 border border-indigo-500/30">채널 초대</span>' +
    '    <h1 class="text-white text-xl font-bold mb-2">' + channelName + '</h1>' +
    descHtml +
    remainHtml +
    '    <button onclick="openInApp()" class="btn-primary w-full text-white py-4 rounded-2xl font-bold text-base mb-3"><i class="fas fa-door-open mr-2"></i>RinGo 앱에서 참여하기</button>' +
    '    <p class="text-slate-500 text-xs">앱이 자동으로 열리지 않으면 버튼을 눌러주세요</p>' +
    '  </div>' +
    '  <div class="glass rounded-2xl p-5 text-center">' +
    '    <p class="text-slate-400 text-sm mb-3">앱이 설치되어 있지 않나요?</p>' +
    '    <button onclick="goInstall()" class="btn-green w-full text-white py-3 rounded-xl font-semibold text-sm"><i class="fas fa-download mr-2"></i>RinGo 앱 설치하기</button>' +
    '  </div>' +
    '</div>' +
    '<div id="screen-install" class="fade-in" style="display:none">' +
    '  <div class="text-center mb-6">' +
    '    <div class="inline-flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-2xl mb-3"><i class="fas fa-bell text-white text-xl"></i></div>' +
    '    <p class="text-indigo-300 text-xs font-semibold tracking-widest uppercase">RinGo</p>' +
    '  </div>' +
    '  <div class="glass rounded-3xl p-7 text-center mb-4">' +
    '    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-900/40 flex items-center justify-center border border-amber-500/30"><i class="fas fa-mobile-alt text-amber-300 text-2xl"></i></div>' +
    '    <h1 class="text-white text-lg font-bold mb-2">' + channelName + '</h1>' +
    '    <p class="text-slate-400 text-sm mb-5">채널에 참여하려면 <b class="text-white">RinGo 앱</b>이 필요합니다.</p>' +
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

  // OG 태그용 값 준비
  const ogTitle = (isValid ? channelName + ' - 채널 초대' : '유효하지 않은 링크') + ' | RinGo'
  const ogDesc  = isValid
    ? (channelDesc || '여기를 눌러 링크를 확인하세요.')
    : '유효하지 않은 초대 링크입니다.'
  const ogImage = (isValid && channelId)
    ? 'https://ringo.run/api/channels/' + channelId + '/image'
    : 'https://ringo.run/static/og-default.png'
  const ogUrl   = 'https://ringo.run/join/' + token

  return c.html(
    '<!DOCTYPE html>' +
    '<html lang="ko"><head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
    '<title>' + ogTitle + '</title>' +
    '<meta name="description" content="' + ogDesc + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="' + ogUrl + '">' +
    '<meta property="og:title" content="' + ogTitle + '">' +
    '<meta property="og:description" content="' + ogDesc + '">' +
    '<meta property="og:image" content="' + ogImage + '">' +
    '<meta property="og:image:width" content="600">' +
    '<meta property="og:image:height" content="600">' +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' + ogTitle + '">' +
    '<meta name="twitter:description" content="' + ogDesc + '">' +
    '<meta name="twitter:image" content="' + ogImage + '">' +
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
    '  var intentUrl="intent://join?token=' + token + '#Intent;scheme=pushapp;package=com.pushnotify.push_notify_app;end";' +
    '  window.location.href=intentUrl;' +
    '}' +
    'function goInstall(){' +
    '  window.location.href=INSTALL_URL;' +
    '  setTimeout(function(){showScreen("screen-join");},3000);' +
    '}' +
    (isValid ? (
      'if(isMobile){' +
      '  var intentUrl="intent://join?token=' + token + '#Intent;scheme=pushapp;package=com.pushnotify.push_notify_app;end";' +
      '  var appOpened=false;' +
      '  document.addEventListener("visibilitychange",function(){' +
      '    if(document.hidden){appOpened=true;}' +
      '    else{if(appOpened){document.body.style.display="none";}}' +
      '  });' +
      '  window.location.href=intentUrl;' +
      '  setTimeout(function(){if(!document.hidden){showScreen("screen-join");}},2000);' +
      '}else{showScreen("screen-join");}' 
    ) : '') +
    '<\/script>' +
    '</body></html>'
  )
})

// =============================================
// 서비스 이용약관
// =============================================
app.get('/terms', async (c) => {
  let content = '<p>서비스 이용약관이 아직 등록되지 않았습니다.</p>'
  try {
    const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'terms'").first() as { value: string } | null
    if (row && row.value) content = row.value
  } catch {}
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>서비스 이용약관 - RinGo</title>
<link rel="icon" href="/static/ringo-icon-r.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#FAFBFF;color:#1A1A2E;line-height:1.8}
.header{background:#fff;border-bottom:1px solid rgba(108,99,255,0.08);padding:16px 20px}
.header-inner{max-width:800px;margin:0 auto;display:flex;align-items:center;gap:12px}
.header a{text-decoration:none;display:flex;align-items:center;gap:8px}
.header img{height:28px}
.header span{font-size:14px;color:#64648C}
.content{max-width:800px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:28px;font-weight:700;margin-bottom:8px}
.date{font-size:13px;color:#9E9EBF;margin-bottom:32px}
.body{font-size:15px;color:#333;line-height:1.8;white-space:pre-wrap}
.body h2,.body h3{margin-top:24px;margin-bottom:8px}
</style>
</head>
<body>
<div class="header"><div class="header-inner"><a href="/"><img src="/static/ringo-logo-color.png" alt="RinGo"></a><span>/ 서비스 이용약관</span></div></div>
<div class="content">
<h1>서비스 이용약관</h1>
<div class="date">RinGo 서비스</div>
<div class="body">${content}</div>
</div>
</body>
</html>`)
})

// =============================================
// 개인정보 처리방침
// =============================================
app.get('/privacy', async (c) => {
  let content = '<p>개인정보 처리방침이 아직 등록되지 않았습니다.</p>'
  try {
    const row = await c.env.DB.prepare("SELECT value FROM app_settings WHERE key = 'privacy'").first() as { value: string } | null
    if (row && row.value) content = row.value
  } catch {}
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>개인정보 처리방침 - RinGo</title>
<link rel="icon" href="/static/ringo-icon-r.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#FAFBFF;color:#1A1A2E;line-height:1.8}
.header{background:#fff;border-bottom:1px solid rgba(108,99,255,0.08);padding:16px 20px}
.header-inner{max-width:800px;margin:0 auto;display:flex;align-items:center;gap:12px}
.header a{text-decoration:none;display:flex;align-items:center;gap:8px}
.header img{height:28px}
.header span{font-size:14px;color:#64648C}
.content{max-width:800px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:28px;font-weight:700;margin-bottom:8px}
.date{font-size:13px;color:#9E9EBF;margin-bottom:32px}
.body{font-size:15px;color:#333;line-height:1.8;white-space:pre-wrap}
.body h2,.body h3{margin-top:24px;margin-bottom:8px}
</style>
</head>
<body>
<div class="header"><div class="header-inner"><a href="/"><img src="/static/ringo-logo-color.png" alt="RinGo"></a><span>/ 개인정보 처리방침</span></div></div>
<div class="content">
<h1>개인정보 처리방침</h1>
<div class="date">RinGo 서비스</div>
<div class="body">${content}</div>
</div>
</body>
</html>`)
})

// =============================================
// ringo.run 홈페이지 (랜딩 페이지)
// =============================================
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RinGo - 채널을 만들고, 알람을 예약하세요</title>
<meta name="description" content="RinGo는 채널 기반 알람 예약 서비스입니다. 채널을 만들고, 구독하고, 원하는 시간에 알람을 예약하세요.">
<meta property="og:title" content="RinGo - 채널 기반 알람 예약 서비스">
<meta property="og:description" content="채널을 만들고, 구독하고, 원하는 시간에 알람을 예약하세요.">
<meta property="og:image" content="https://ringo.run/static/ringo-logo.png">
<meta property="og:url" content="https://ringo.run">
<link rel="icon" href="/static/ringo-icon-r.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --primary:#6C63FF;--primary-light:#8B83FF;--primary-dark:#5A52E0;
  --teal:#00BCD4;--teal-light:#4DD0E1;
  --bg:#FAFBFF;--surface:#FFFFFF;--surface-glass:rgba(255,255,255,0.7);
  --text:#1A1A2E;--text2:#64648C;--text3:#9E9EBF;
  --border:rgba(108,99,255,0.08);
  --gradient:linear-gradient(135deg,#6C63FF 0%,#00BCD4 100%);
  --shadow:0 4px 24px rgba(108,99,255,0.08);
  --shadow-lg:0 12px 48px rgba(108,99,255,0.12);
  --dark-bg:#0F0E1A;--dark-surface:#1A1A2E;
}
html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden;-webkit-font-smoothing:antialiased}

/* ── Sticky Nav (Dark) ─────────────────── */
.nav{position:fixed;top:0;left:0;right:0;z-index:100;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);background:rgba(15,14,26,0.85);border-bottom:1px solid rgba(108,99,255,0.15);transition:box-shadow .3s}
.nav.scrolled{box-shadow:0 4px 24px rgba(0,0,0,0.3)}
.nav-inner{max-width:1080px;margin:0 auto;padding:0 20px;height:64px;display:flex;align-items:center;justify-content:space-between}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-logo img{height:32px;width:auto;object-fit:contain}
.nav-links{display:flex;align-items:center;gap:24px}
.nav-links a{text-decoration:none;font-size:14px;font-weight:500;color:rgba(255,255,255,0.7);transition:color .2s}
.nav-links a:hover{color:#fff}
.nav-cta{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--gradient);color:#fff;border:none;border-radius:50px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
.nav-cta:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(108,99,255,0.3)}

/* ── Mobile Hamburger Menu ─────── */
.nav-hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:rgba(255,255,255,0.8)}
.nav-hamburger svg{width:24px;height:24px}
.nav-mobile{display:none;position:absolute;top:64px;left:0;right:0;background:rgba(15,14,26,0.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(108,99,255,0.15);padding:16px 20px;flex-direction:column;gap:4px}
.nav-mobile.open{display:flex}
.nav-mobile a{text-decoration:none;font-size:15px;font-weight:500;color:rgba(255,255,255,0.7);padding:12px 16px;border-radius:12px;transition:all .2s}
.nav-mobile a:hover{color:#fff;background:rgba(108,99,255,0.15)}
@media(max-width:768px){
  .nav-links{display:none}
  .nav-hamburger{display:block}
}
@media(min-width:769px){.nav-mobile{display:none !important}}

/* ── Section common ──────────────── */
section{padding:100px 20px}
.container{max-width:1080px;margin:0 auto}
.section-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:50px;font-size:12px;font-weight:600;color:var(--primary);background:rgba(108,99,255,0.08);margin-bottom:16px}
.section-title{font-size:clamp(28px,5vw,42px);font-weight:800;line-height:1.25;letter-spacing:-0.5px;margin-bottom:16px}
.section-sub{font-size:clamp(15px,2.5vw,18px);color:var(--text2);line-height:1.6;max-width:540px}

/* ── Hero (Dark) ────────────────────────── */
.hero{padding:80px 20px 80px;text-align:center;position:relative;overflow:hidden;background:linear-gradient(180deg,var(--dark-bg) 0%,var(--dark-surface) 85%,var(--bg) 100%)}
.hero::before{content:'';position:absolute;top:-40%;left:-20%;width:140%;height:140%;background:radial-gradient(ellipse at 30% 20%,rgba(108,99,255,0.12) 0%,transparent 60%),radial-gradient(ellipse at 70% 80%,rgba(0,188,212,0.08) 0%,transparent 60%);pointer-events:none}
.hero .container{position:relative}
.hero .section-badge{color:#8B83FF;background:rgba(108,99,255,0.2)}
.hero .section-title{color:#fff}
.hero .section-sub{color:rgba(255,255,255,0.65);margin:0 auto 32px}
.hero-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:48px}
.btn-primary{display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:var(--gradient);color:#fff;border:none;border-radius:16px;font-size:16px;font-weight:700;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
.btn-primary:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}
.btn-primary svg{width:24px;height:24px}
.btn-secondary{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--surface);color:var(--text);border:1.5px solid var(--border);border-radius:16px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;transition:all .2s}
.btn-secondary:hover{border-color:var(--primary);color:var(--primary);transform:translateY(-1px)}
.hero-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(255,152,0,0.1);color:#F59E0B;border-radius:50px;font-size:11px;font-weight:600;margin-top:4px}
.hero-mockup{position:relative;max-width:320px;margin:0 auto}
.hero-mockup-frame{background:linear-gradient(145deg,#1a1a2e 0%,#2d2d4e 100%);border-radius:40px;padding:12px;box-shadow:var(--shadow-lg),0 0 0 1px rgba(255,255,255,0.1) inset}
.hero-mockup-screen{background:#111;border-radius:30px;overflow:hidden;aspect-ratio:9/19.5;display:flex;align-items:center;justify-content:center}
.hero-mockup-screen img{width:100%;height:100%;object-fit:cover}
.hero-mockup-notch{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:120px;height:28px;background:#1a1a2e;border-radius:0 0 16px 16px;z-index:2}
.hero-glow{position:absolute;bottom:-60px;left:50%;transform:translateX(-50%);width:280px;height:120px;background:radial-gradient(ellipse,rgba(108,99,255,0.15),transparent 70%);filter:blur(40px);pointer-events:none}

/* ── Features ────────────────────── */
.features{background:var(--surface)}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:48px}
.feature-card{padding:32px 28px;border-radius:20px;background:var(--bg);border:1px solid var(--border);transition:transform .3s,box-shadow .3s}
.feature-card:hover{transform:translateY(-4px);box-shadow:var(--shadow)}
.feature-icon{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:20px}
.feature-card h3{font-size:18px;font-weight:700;margin-bottom:10px}
.feature-card p{font-size:14px;color:var(--text2);line-height:1.65}
@media(max-width:768px){.features-grid{grid-template-columns:1fr;gap:16px}}

/* ── Steps ───────────────────────── */
.steps-list{display:flex;flex-direction:column;gap:64px;margin-top:56px}
.step-item{display:flex;align-items:center;gap:48px}
.step-item:nth-child(even){flex-direction:row-reverse}
.step-visual{flex:1;position:relative}
.step-visual-box{background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:32px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.step-visual-box::after{content:'';position:absolute;top:0;right:0;width:100px;height:100px;border-radius:0 24px 0 60px;opacity:0.06}
.step-content{flex:1}
.step-number{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:var(--gradient);color:#fff;font-size:16px;font-weight:800;margin-bottom:16px}
.step-content h3{font-size:22px;font-weight:700;margin-bottom:12px}
.step-content p{font-size:15px;color:var(--text2);line-height:1.7}
.step-emoji{font-size:64px;text-align:center;line-height:1}
@media(max-width:768px){.step-item,.step-item:nth-child(even){flex-direction:column;gap:24px;text-align:center}}

/* ── Screenshots (Swipe) ─────────────────── */
.screenshots{background:var(--surface);text-align:center}
.screenshots-row{display:flex;justify-content:center;gap:24px;margin-top:48px}
.screenshot-card{flex-shrink:0;width:220px;background:linear-gradient(145deg,#1a1a2e,#2d2d4e);border-radius:28px;padding:8px;box-shadow:var(--shadow)}
.screenshot-inner{background:#111;border-radius:22px;overflow:hidden;aspect-ratio:9/19.5;display:flex;align-items:center;justify-content:center}
.screenshot-inner img{width:100%;height:100%;object-fit:cover}
.screenshot-inner .placeholder{color:var(--text3);font-size:13px;padding:20px;text-align:center}
.screenshot-label{color:var(--text3);font-size:12px;font-weight:500;margin-top:12px;padding-bottom:4px}
/* Mobile: swipe carousel */
.screenshots-swipe{display:none}
.swipe-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;gap:16px;padding:0 calc(50% - 120px);scrollbar-width:none}
.swipe-track::-webkit-scrollbar{display:none}
.swipe-track .screenshot-card{scroll-snap-align:center;width:240px;flex-shrink:0}
.swipe-dots{display:flex;justify-content:center;gap:8px;margin-top:20px}
.swipe-dot{width:8px;height:8px;border-radius:50%;background:var(--text3);opacity:0.3;border:none;padding:0;cursor:pointer;transition:all .3s}
.swipe-dot.active{opacity:1;background:var(--primary);transform:scale(1.3)}
@media(max-width:768px){
  .screenshots-row{display:none}
  .screenshots-swipe{display:block;margin-top:48px}
}

/* ── CTA ─────────────────────────── */
.cta-section{text-align:center}
.cta-box{background:var(--gradient);border-radius:32px;padding:64px 32px;color:#fff;position:relative;overflow:hidden}
.cta-box::before{content:'';position:absolute;top:-50%;right:-30%;width:80%;height:200%;background:radial-gradient(circle,rgba(255,255,255,0.08),transparent 60%);pointer-events:none}
.cta-box h2{font-size:clamp(26px,4vw,36px);font-weight:800;margin-bottom:12px;position:relative}
.cta-box p{font-size:16px;opacity:0.85;margin-bottom:32px;position:relative}
.cta-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;position:relative}
.btn-white{display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:#fff;color:var(--primary);border:none;border-radius:16px;font-size:16px;font-weight:700;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
.btn-white:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.15)}
.btn-ghost{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:rgba(255,255,255,0.15);color:#fff;border:1.5px solid rgba(255,255,255,0.3);border-radius:16px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;backdrop-filter:blur(8px);transition:all .2s}
.btn-ghost:hover{background:rgba(255,255,255,0.25);transform:translateY(-1px)}

/* ── Footer ──────────────────────── */
.footer{background:var(--surface);border-top:1px solid var(--border);padding:40px 20px;text-align:center}
.footer-links{display:flex;justify-content:center;flex-wrap:wrap;gap:24px;margin-bottom:16px}
.footer-links a{text-decoration:none;font-size:13px;color:var(--text2);transition:color .2s}
.footer-links a:hover{color:var(--primary)}
.footer-copy{font-size:12px;color:var(--text3)}

/* ── Animations ──────────────────── */
.fade-up{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease}
.fade-up.visible{opacity:1;transform:translateY(0)}
@media(prefers-reduced-motion:reduce){.fade-up{opacity:1;transform:none;transition:none}}
</style>
</head>
<body>

<!-- ═══ Nav ═══ -->
<nav class="nav" id="nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo">
      <img src="/static/ringo-logo.png" alt="RinGo">
    </a>
    <div class="nav-links">
      <a href="#features">기능</a>
      <a href="#how">사용법</a>
      <a href="#screenshots">스크린샷</a>
      <a href="#download" class="nav-cta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        다운로드
      </a>
    </div>
    <button class="nav-hamburger" id="navHamburger" onclick="toggleMobileMenu()" aria-label="메뉴">
      <svg id="hamburgerIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      <svg id="closeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div class="nav-mobile" id="navMobile">
    <a href="#features" onclick="closeMobileMenu()">기능</a>
    <a href="#how" onclick="closeMobileMenu()">사용법</a>
    <a href="#screenshots" onclick="closeMobileMenu()">스크린샷</a>
    <a href="#download" onclick="closeMobileMenu()">다운로드</a>
  </div>
</nav>

<!-- ═══ Hero ═══ -->
<section class="hero">
  <div class="container">
    <div class="hero-banner fade-up">
      <img src="/static/hero-banner.png" alt="RinGo - 전화 수신 방식의 미디어 알람 앱" style="width:100%;max-width:800px;height:auto;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.12)">
    </div>
    <div style="height:24px"></div>
    <div class="section-badge fade-up">🔔 채널 기반 알람 서비스</div>
    <h1 class="section-title fade-up">채널을 만들고,<br>알람을 예약하세요</h1>
    <p class="section-sub fade-up">RinGo는 채널을 만들어 구독자에게 원하는 시간에 알람을 보내는 서비스입니다.<br>유튜브, 오디오, 영상 콘텐츠를 알람과 함께 전달하세요.</p>
  </div>
</section>

<!-- ═══ Features ═══ -->
<section class="features" id="features">
  <div class="container">
    <div class="section-badge fade-up">✨ 주요 기능</div>
    <h2 class="section-title fade-up">쉽고 강력한 알람 예약</h2>
    <p class="section-sub fade-up">복잡한 설정 없이, 채널을 만들고 구독자에게 알람을 보내세요.</p>
    <div class="features-grid">
      <div class="feature-card fade-up">
        <div class="feature-icon" style="background:rgba(108,99,255,0.1)">📢</div>
        <h3>채널 생성</h3>
        <p>나만의 채널을 만들고 초대 링크로 구독자를 모으세요. 공개/비밀 채널 모두 지원합니다.</p>
      </div>
      <div class="feature-card fade-up">
        <div class="feature-icon" style="background:rgba(0,188,212,0.1)">⏰</div>
        <h3>알람 예약</h3>
        <p>원하는 날짜와 시간에 알람을 예약하세요. 유튜브 링크, 오디오, 영상 파일을 함께 전달할 수 있습니다.</p>
      </div>
      <div class="feature-card fade-up">
        <div class="feature-icon" style="background:rgba(245,158,11,0.1)">🔔</div>
        <h3>알람 수신</h3>
        <p>구독한 채널에서 알람이 울리면 전화처럼 알림을 받고, 바로 콘텐츠를 재생할 수 있습니다.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═══ How it works ═══ -->
<section id="how">
  <div class="container">
    <div style="text-align:center">
      <div class="section-badge fade-up">🚀 사용 방법</div>
      <h2 class="section-title fade-up">3단계로 시작하세요</h2>
    </div>
    <div class="steps-list">
      <div class="step-item fade-up">
        <div class="step-visual">
          <div class="step-visual-box" style="text-align:center">
            <div class="step-emoji">📱</div>
            <div style="margin-top:16px;font-size:14px;color:var(--text2)">앱 설치 후 간편 가입</div>
          </div>
        </div>
        <div class="step-content">
          <div class="step-number">1</div>
          <h3>앱 설치 & 가입</h3>
          <p>RinGo 앱을 설치하고 간단한 가입 절차를 완료하세요. 이메일 하나로 바로 시작할 수 있습니다.</p>
        </div>
      </div>
      <div class="step-item fade-up">
        <div class="step-visual">
          <div class="step-visual-box" style="text-align:center">
            <div class="step-emoji">🎯</div>
            <div style="margin-top:16px;font-size:14px;color:var(--text2)">채널을 만들거나 구독</div>
          </div>
        </div>
        <div class="step-content">
          <div class="step-number">2</div>
          <h3>채널 생성 또는 구독</h3>
          <p>내가 운영하는 채널을 만들거나, 초대 링크를 통해 다른 채널을 구독하세요.</p>
        </div>
      </div>
      <div class="step-item fade-up">
        <div class="step-visual">
          <div class="step-visual-box" style="text-align:center">
            <div class="step-emoji">🔔</div>
            <div style="margin-top:16px;font-size:14px;color:var(--text2)">시간을 정해 알람 예약</div>
          </div>
        </div>
        <div class="step-content">
          <div class="step-number">3</div>
          <h3>알람 예약 & 수신</h3>
          <p>원하는 시간에 알람을 예약하면, 구독자에게 전화처럼 알림이 울립니다. 콘텐츠도 함께 전달됩니다.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══ Screenshots ═══ -->
<section class="screenshots" id="screenshots">
  <div class="container">
    <div class="section-badge fade-up">📸 앱 미리보기</div>
    <h2 class="section-title fade-up">이렇게 사용해요</h2>
    <p class="section-sub fade-up" style="margin:0 auto">실제 앱 화면을 확인해보세요.</p>
    <!-- Desktop: 4장 가로 나열 -->
    <div class="screenshots-row fade-up">
      <div class="screenshot-card">
        <div class="screenshot-inner"><img src="/static/screenshot-home.png" alt="홈 화면"></div>
        <div class="screenshot-label">홈</div>
      </div>
      <div class="screenshot-card">
        <div class="screenshot-inner"><img src="/static/screenshot-channel.png" alt="내 채널"></div>
        <div class="screenshot-label">내 채널</div>
      </div>
      <div class="screenshot-card">
        <div class="screenshot-inner"><img src="/static/screenshot-alarm.png" alt="알람 수신"></div>
        <div class="screenshot-label">수신 화면</div>
      </div>
      <div class="screenshot-card">
        <div class="screenshot-inner"><img src="/static/screenshot-content.png" alt="콘텐츠 재생"></div>
        <div class="screenshot-label">콘텐츠 재생</div>
      </div>
    </div>
    <!-- Mobile: 스와이프 캐러셀 -->
    <div class="screenshots-swipe fade-up">
      <div class="swipe-track" id="swipeTrack">
        <div class="screenshot-card" data-index="0">
          <div class="screenshot-inner"><img src="/static/screenshot-home.png" alt="홈 화면"></div>
          <div class="screenshot-label">홈</div>
        </div>
        <div class="screenshot-card" data-index="1">
          <div class="screenshot-inner"><img src="/static/screenshot-channel.png" alt="내 채널"></div>
          <div class="screenshot-label">내 채널</div>
        </div>
        <div class="screenshot-card" data-index="2">
          <div class="screenshot-inner"><img src="/static/screenshot-alarm.png" alt="알람 수신"></div>
          <div class="screenshot-label">수신 화면</div>
        </div>
        <div class="screenshot-card" data-index="3">
          <div class="screenshot-inner"><img src="/static/screenshot-content.png" alt="콘텐츠 재생"></div>
          <div class="screenshot-label">콘텐츠 재생</div>
        </div>
      </div>
      <div class="swipe-dots" id="swipeDots">
        <button class="swipe-dot active" data-index="0"></button>
        <button class="swipe-dot" data-index="1"></button>
        <button class="swipe-dot" data-index="2"></button>
        <button class="swipe-dot" data-index="3"></button>
      </div>
    </div>
  </div>
</section>

<!-- ═══ Download CTA ═══ -->
<section class="cta-section" id="download">
  <div class="container">
    <div class="cta-box fade-up">
      <h2>지금 RinGo를 시작하세요</h2>
      <p>채널을 만들고, 구독자에게 알람을 보내보세요.</p>
      <div class="cta-btns">
        <a href="#" class="btn-white" onclick="alert('Google Play 출시 준비 중입니다!');return false">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.61 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/></svg>
          Google Play (출시 예정)
        </a>

      </div>
    </div>
  </div>
</section>

<!-- ═══ Footer ═══ -->
<footer class="footer">
  <div class="container">
    <div class="footer-links">
      <a href="/terms">이용약관</a>
      <a href="/privacy">개인정보처리방침</a>
      <a href="mailto:formaasiacorp@gmail.com">문의</a>
    </div>
    <div class="footer-copy">&copy; 2025 RinGo. All rights reserved.</div>
  </div>
</footer>

<script>
// Nav scroll effect
const nav = document.getElementById('nav')
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10)
})

// Mobile hamburger menu
function toggleMobileMenu() {
  const mobile = document.getElementById('navMobile')
  const hIcon = document.getElementById('hamburgerIcon')
  const cIcon = document.getElementById('closeIcon')
  const isOpen = mobile.classList.toggle('open')
  hIcon.style.display = isOpen ? 'none' : 'block'
  cIcon.style.display = isOpen ? 'block' : 'none'
}
function closeMobileMenu() {
  const mobile = document.getElementById('navMobile')
  const hIcon = document.getElementById('hamburgerIcon')
  const cIcon = document.getElementById('closeIcon')
  mobile.classList.remove('open')
  hIcon.style.display = 'block'
  cIcon.style.display = 'none'
}

// Screenshot swipe dots
;(function(){
  const track = document.getElementById('swipeTrack')
  const dots = document.querySelectorAll('.swipe-dot')
  if (!track || !dots.length) return
  function updateDots() {
    const cards = track.querySelectorAll('.screenshot-card')
    const trackRect = track.getBoundingClientRect()
    const center = trackRect.left + trackRect.width / 2
    let closest = 0, minDist = Infinity
    cards.forEach(function(card, i) {
      const cardRect = card.getBoundingClientRect()
      const cardCenter = cardRect.left + cardRect.width / 2
      const dist = Math.abs(cardCenter - center)
      if (dist < minDist) { minDist = dist; closest = i }
    })
    dots.forEach(function(d, i) { d.classList.toggle('active', i === closest) })
  }
  track.addEventListener('scroll', updateDots, { passive: true })
  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      var idx = parseInt(this.getAttribute('data-index'))
      var cards = track.querySelectorAll('.screenshot-card')
      if (cards[idx]) { cards[idx].scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' }) }
    })
  })
})()

// Scroll animation (Intersection Observer)
const faders = document.querySelectorAll('.fade-up')
const obsOpts = { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }})
}, obsOpts)
faders.forEach(el => observer.observe(el))
</script>
</body>
</html>`)
})

// 기존 관리자 대시보드 (하위 호환용 - 직접 접근 불가)
// =============================================
app.get('/_legacy_dashboard', (c) => {
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
      <!-- 선택 삭제 바 -->
      <div id="chBulkDeleteBar" class="hidden items-center gap-3 mb-3 bg-rose-900/20 border border-rose-500/30 rounded-lg px-4 py-2">
        <span id="chSelectedCount" class="text-rose-400 text-sm font-medium"></span>
        <button onclick="bulkDeleteChannels()" class="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded text-sm">
          <i class="fas fa-trash mr-1"></i>선택 삭제
        </button>
        <button onclick="clearChSelection()" class="text-slate-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-slate-700">
          취소
        </button>
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
      <!-- 검색 + 선택삭제 툴바 -->
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
              <th class="px-4 py-3 w-8">
                <input type="checkbox" id="subCheckAll" onchange="toggleSubCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer">
              </th>
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

    <!-- ===== 발송 로그 ===== -->
    <!-- ===== 공지사항 관리 ===== -->
    <div id="page-notices" class="page">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-white text-xl font-bold flex items-center gap-2">
          <i class="fas fa-bullhorn text-amber-400"></i> 공지사항 관리
        </h2>
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
        <h2 class="text-white text-xl font-bold flex items-center gap-2">
          <i class="fas fa-shield-alt text-green-400"></i> 개인정보보호정책 관리
        </h2>
        <button onclick="savePrivacy()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <i class="fas fa-save mr-1"></i> 저장
        </button>
      </div>
      <div class="card p-6">
        <label class="block text-slate-400 text-sm font-semibold mb-3">개인정보보호정책 내용</label>
        <textarea id="privacy-editor"
          class="w-full bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm p-4 resize-none focus:outline-none focus:border-green-400"
          style="min-height:480px;line-height:1.8;"
          placeholder="개인정보보호정책 내용을 입력하세요..."></textarea>
        <p class="text-slate-500 text-xs mt-2">* 앱의 '개인정보보호정책' 메뉴에 표시됩니다. 저장 후 즉시 반영됩니다.</p>
      </div>
    </div>

    <!-- ===== 서비스 이용약관 관리 ===== -->
    <div id="page-terms" class="page">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-white text-xl font-bold flex items-center gap-2">
          <i class="fas fa-file-alt text-teal-400"></i> 서비스 이용약관 관리
        </h2>
        <button onclick="saveTerms()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <i class="fas fa-save mr-1"></i> 저장
        </button>
      </div>
      <div class="card p-6">
        <label class="block text-slate-400 text-sm font-semibold mb-3">이용약관 내용</label>
        <textarea id="terms-editor"
          class="w-full bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm p-4 resize-none focus:outline-none focus:border-teal-400"
          style="min-height:480px;line-height:1.8;"
          placeholder="서비스 이용약관 내용을 입력하세요..."></textarea>
        <p class="text-slate-500 text-xs mt-2">* 앱의 '서비스 이용약관' 메뉴에 표시됩니다. 저장 후 즉시 반영됩니다.</p>
      </div>
    </div>

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
      <!-- 통계 카드 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-white" id="alarmStatTotal">-</div>
          <div class="text-slate-400 text-sm mt-1">전체 알람</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-amber-400" id="alarmStatPending">-</div>
          <div class="text-slate-400 text-sm mt-1">대기중</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-emerald-400" id="alarmStatTriggered">-</div>
          <div class="text-slate-400 text-sm mt-1">발송완료</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-rose-400" id="alarmStatCancelled">-</div>
          <div class="text-slate-400 text-sm mt-1">취소됨</div>
        </div>
      </div>

      <!-- 필터 + 선택삭제 툴바 -->
      <div class="card mb-4">
        <div class="card-header px-5 py-4 flex flex-wrap items-center gap-3">
          <i class="fas fa-bell text-orange-400"></i>
          <span class="text-white font-semibold">알람 목록</span>
          <div id="alarmBulkDeleteBar" class="hidden flex items-center gap-2">
            <span id="alarmSelectedCount" class="text-slate-300 text-sm font-semibold"></span>
            <button onclick="bulkDeleteAlarms()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <i class="fas fa-trash mr-1"></i>선택 삭제
            </button>
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
            <button onclick="loadAlarmManagement()" class="btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
              <i class="fas fa-refresh"></i> 새로고침
            </button>
          </div>
        </div>

        <!-- 알람 테이블 -->
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-slate-700/50">
                <th class="px-4 py-3 w-8">
                  <input type="checkbox" id="alarmCheckAll" onchange="toggleAlarmCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer">
                </th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">채널</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">콘텐츠 유형</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">예약 시간</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">대상/발송</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">상태</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium text-sm">등록일</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium text-sm">삭제</th>
              </tr>
            </thead>
            <tbody id="alarmTableBody">
              <tr><td colspan="8" class="text-center py-10 text-slate-500">불러오는 중...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== 알람 로그 ===== -->
    <div id="page-alarm-logs" class="page">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <i class="fas fa-history text-yellow-400"></i>
            </div>
            <div>
              <h2 class="text-white font-bold text-lg">알람 로그</h2>
              <p class="text-slate-400 text-sm">전체 알람 수신 이력</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div id="alarmLogsBulkBar" class="hidden items-center gap-2">
              <span id="alarmLogsSelectedCount" class="text-slate-400 text-sm"></span>
              <button onclick="deleteSelectedAlarmLogs()" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm flex items-center gap-1">
                <i class="fas fa-trash-alt"></i> 선택 삭제
              </button>
              <button onclick="clearAlarmLogsSelection()" class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm">
                취소
              </button>
            </div>
            <button onclick="loadAlarmLogs()" class="btn-secondary text-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
              <i class="fas fa-sync-alt"></i> 새로고침
            </button>
          </div>
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
                  <th class="px-4 py-3 text-left">연결URL</th>
                  <th class="px-4 py-3 text-left">상태</th>
                  <th class="px-4 py-3 text-left">시간</th>
                </tr>
              </thead>
              <tbody id="alarmLogsTableBody">
                <tr><td colspan="10" class="text-center py-8 text-slate-500">로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
          <div id="alarmLogsPagination" class="px-5 py-3 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400"></div>
        </div>
      </div>
    </div>

    <!-- ===== 회원 관리 ===== -->
    <div id="page-members" class="page">
      <!-- 통계 카드 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-white" id="statTotal">-</div>
          <div class="text-slate-400 text-sm mt-1">전체 회원</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-emerald-400" id="statActive">-</div>
          <div class="text-slate-400 text-sm mt-1">활성 회원</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-sky-400" id="statFcm">-</div>
          <div class="text-slate-400 text-sm mt-1">FCM 등록</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-amber-400" id="statWeek">-</div>
          <div class="text-slate-400 text-sm mt-1">최근 7일 가입</div>
        </div>
      </div>
      <!-- 검색 + 선택삭제 툴바 -->
      <div class="flex gap-3 mb-4 items-center flex-wrap">
        <input id="memberSearch" type="text" class="input-field flex-1 min-w-48" placeholder="이메일, 이름, ID 검색..." oninput="debounceSearchMembers()">
        <button onclick="loadMembers()" class="btn-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
          <i class="fas fa-search mr-1"></i>검색
        </button>
        <div id="bulkDeleteBar" class="hidden flex items-center gap-2">
          <span id="selectedCount" class="text-slate-300 text-sm font-semibold"></span>
          <button onclick="bulkDeleteMembers()" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <i class="fas fa-trash mr-1"></i>선택 삭제
          </button>
          <button onclick="clearMemberSelection()" class="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">
            취소
          </button>
        </div>
      </div>
      <!-- 목록 테이블 -->
      <div class="card overflow-hidden">
        <table class="w-full">
          <thead><tr class="border-b border-slate-700">
            <th class="px-4 py-3 w-10">
              <input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)" class="w-4 h-4 accent-indigo-500 cursor-pointer">
            </th>
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

    <!-- ===== 관리자 알람발송 페이지 ===== -->
    <div id="page-admin-alarm" class="page">
      <div class="space-y-6">
        <!-- 페이지 헤더 -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center">
            <i class="fas fa-satellite-dish text-red-400"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">관리자 알람발송</h2>
            <p class="text-slate-400 text-sm">관리자 채널을 통해 직접 알람을 발송합니다</p>
          </div>
        </div>

        <!-- 탭 -->
        <div class="flex gap-2 border-b border-slate-700 pb-0">
          <button id="admin-tab-channel" onclick="adminShowTab('channel')"
            class="admin-tab active px-4 py-2 text-sm font-semibold text-white border-b-2 border-indigo-500 -mb-px">
            <i class="fas fa-layer-group mr-1.5"></i>채널 관리
          </button>
          <button id="admin-tab-members" onclick="adminShowTab('members')"
            class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white">
            <i class="fas fa-users mr-1.5"></i>구독자 관리
          </button>
          <button id="admin-tab-send" onclick="adminShowTab('send')"
            class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white">
            <i class="fas fa-paper-plane mr-1.5"></i>알람 발송
          </button>
          <button id="admin-tab-list" onclick="adminShowTab('list')"
            class="admin-tab px-4 py-2 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white">
            <i class="fas fa-calendar-check mr-1.5"></i>예약 알람
          </button>
        </div>

        <!-- 탭1: 채널 관리 -->
        <div id="admin-tab-content-channel">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-semibold">관리자 채널 목록</h3>
            <button onclick="adminOpenCreateChannel()" class="btn-primary text-white px-4 py-2 rounded-xl text-sm font-semibold">
              <i class="fas fa-plus mr-1.5"></i>채널 생성
            </button>
          </div>
          <div id="admin-channel-list" class="space-y-3">
            <div class="text-slate-500 text-sm text-center py-8">
              <i class="fas fa-spinner spin mr-2"></i>불러오는 중...
            </div>
          </div>
        </div>

        <!-- 탭2: 구독자 관리 -->
        <div id="admin-tab-content-members" class="hidden">
          <div class="mb-4">
            <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">관리할 채널 선택</label>
            <select id="admin-member-channel-select" onchange="adminLoadMemberPanels()" class="input-field text-sm">
              <option value="">채널을 선택하세요</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <!-- 왼쪽: 전체 회원 -->
            <div class="card rounded-xl overflow-hidden">
              <div class="card-header p-3 flex items-center justify-between">
                <span class="text-white text-sm font-semibold"><i class="fas fa-users mr-1.5 text-blue-300"></i>전체 회원</span>
                <span id="admin-left-count" class="text-slate-400 text-xs">0명</span>
              </div>
              <div class="p-3 border-b border-slate-700 space-y-2">
                <select id="admin-left-filter" onchange="adminLoadLeftMembers(1)"
                  class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs">
                  <option value="">전체 회원</option>
                  <option value="fcm">FCM 있는 회원만</option>
                </select>
                <input id="admin-left-search" type="text" placeholder="이름/이메일 검색..."
                  oninput="adminLeftSearchDebounce()"
                  class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs placeholder-slate-500">
              </div>
              <div id="admin-left-list" class="overflow-y-auto" style="max-height:360px;">
                <div class="text-slate-500 text-xs text-center py-6">채널을 선택하세요</div>
              </div>
              <div class="p-3 border-t border-slate-700 flex items-center justify-between gap-2">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" id="admin-left-all" onchange="adminToggleAllLeft(this.checked)" class="w-3.5 h-3.5 accent-indigo-500"> 전체선택
                </label>
                <button onclick="adminForceSubscribe()" class="btn-success text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex-1">
                  <i class="fas fa-arrow-right mr-1"></i>가입
                </button>
              </div>
              <div id="admin-left-pagination" class="flex justify-center gap-1 p-2 border-t border-slate-700"></div>
            </div>
            <!-- 오른쪽: 채널 구독자 -->
            <div class="card rounded-xl overflow-hidden">
              <div class="card-header p-3 flex items-center justify-between">
                <span class="text-white text-sm font-semibold"><i class="fas fa-check-circle mr-1.5 text-emerald-300"></i>채널 구독자</span>
                <span id="admin-right-count" class="text-slate-400 text-xs">0명</span>
              </div>
              <div class="p-3 border-b border-slate-700">
                <input id="admin-right-search" type="text" placeholder="이름/이메일 검색..."
                  oninput="adminRightSearchDebounce()"
                  class="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-300 text-xs placeholder-slate-500">
              </div>
              <div id="admin-right-list" class="overflow-y-auto" style="max-height:360px;">
                <div class="text-slate-500 text-xs text-center py-6">채널을 선택하세요</div>
              </div>
              <div class="p-3 border-t border-slate-700 flex items-center justify-between gap-2">
                <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input type="checkbox" id="admin-right-all" onchange="adminToggleAllRight(this.checked)" class="w-3.5 h-3.5 accent-indigo-500"> 전체선택
                </label>
                <button onclick="adminForceUnsubscribe()" class="btn-danger text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex-1">
                  <i class="fas fa-arrow-left mr-1"></i>채널 나가기
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 탭3: 알람 발송 -->
        <div id="admin-tab-content-send" class="hidden">
          <div class="card rounded-xl p-5 space-y-4">
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">발송 채널 *</label>
              <select id="admin-send-channel" class="input-field text-sm">
                <option value="">채널을 선택하세요</option>
              </select>
            </div>
            <div>
              <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">컨텐츠 타입 *</label>
              <div class="grid grid-cols-4 gap-2">
                <button onclick="adminSelectMsgType('youtube')" id="admin-type-youtube"
                  class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-indigo-500 bg-indigo-500/10 text-white text-xs font-semibold cursor-pointer">
                  <i class="fab fa-youtube text-red-400 text-lg"></i>YouTube
                </button>
                <button onclick="adminSelectMsgType('audio')" id="admin-type-audio"
                  class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer">
                  <i class="fas fa-music text-purple-400 text-lg"></i>오디오
                </button>
                <button onclick="adminSelectMsgType('video')" id="admin-type-video"
                  class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer">
                  <i class="fas fa-video text-blue-400 text-lg"></i>비디오
                </button>
                <button onclick="adminSelectMsgType('file')" id="admin-type-file"
                  class="admin-type-btn flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-600 bg-slate-700/50 text-slate-400 text-xs font-semibold cursor-pointer">
                  <i class="fas fa-file text-orange-400 text-lg"></i>파일
                </button>
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
                <div>
                  <label class="text-slate-500 text-xs mb-1 block">날짜</label>
                  <input id="admin-send-date" type="date" class="input-field text-sm w-full"
                    onchange="adminUpdateTimePreview()">
                </div>
                <div>
                  <label class="text-slate-500 text-xs mb-1 block">시간</label>
                  <select id="admin-send-hour" class="input-field text-sm w-full"
                    onchange="adminUpdateTimePreview()">
                  </select>
                </div>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label class="text-slate-500 text-xs mb-1 block">분</label>
                  <select id="admin-send-minute" class="input-field text-sm w-full"
                    onchange="adminUpdateTimePreview()">
                    <option value="00">00분</option>
                    <option value="01">01분</option>
                    <option value="02">02분</option>
                    <option value="03">03분</option>
                    <option value="04">04분</option>
                    <option value="05">05분</option>
                    <option value="06">06분</option>
                    <option value="07">07분</option>
                    <option value="08">08분</option>
                    <option value="09">09분</option>
                    <option value="10">10분</option>
                    <option value="11">11분</option>
                    <option value="12">12분</option>
                    <option value="13">13분</option>
                    <option value="14">14분</option>
                    <option value="15">15분</option>
                    <option value="16">16분</option>
                    <option value="17">17분</option>
                    <option value="18">18분</option>
                    <option value="19">19분</option>
                    <option value="20">20분</option>
                    <option value="21">21분</option>
                    <option value="22">22분</option>
                    <option value="23">23분</option>
                    <option value="24">24분</option>
                    <option value="25">25분</option>
                    <option value="26">26분</option>
                    <option value="27">27분</option>
                    <option value="28">28분</option>
                    <option value="29">29분</option>
                    <option value="30">30분</option>
                    <option value="31">31분</option>
                    <option value="32">32분</option>
                    <option value="33">33분</option>
                    <option value="34">34분</option>
                    <option value="35">35분</option>
                    <option value="36">36분</option>
                    <option value="37">37분</option>
                    <option value="38">38분</option>
                    <option value="39">39분</option>
                    <option value="40">40분</option>
                    <option value="41">41분</option>
                    <option value="42">42분</option>
                    <option value="43">43분</option>
                    <option value="44">44분</option>
                    <option value="45">45분</option>
                    <option value="46">46분</option>
                    <option value="47">47분</option>
                    <option value="48">48분</option>
                    <option value="49">49분</option>
                    <option value="50">50분</option>
                    <option value="51">51분</option>
                    <option value="52">52분</option>
                    <option value="53">53분</option>
                    <option value="54">54분</option>
                    <option value="55">55분</option>
                    <option value="56">56분</option>
                    <option value="57">57분</option>
                    <option value="58">58분</option>
                    <option value="59">59분</option>
                  </select>
                </div>
                <div class="flex items-end">
                  <div id="admin-send-time-preview"
                    class="w-full text-center py-2 rounded-xl bg-indigo-900/30 border border-indigo-500/30 text-indigo-300 text-sm font-semibold">
                    -
                  </div>
                </div>
              </div>
            </div>
            <button onclick="adminSendAlarm()" class="w-full btn-primary text-white py-3 rounded-xl font-bold text-sm">
              <i class="fas fa-satellite-dish mr-2"></i>알람 발송
            </button>
          </div>
        </div>

        <!-- 탭4: 예약 알람 -->
        <div id="admin-tab-content-list" class="hidden">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-white font-semibold">예약된 알람 목록</h3>
            <button onclick="adminLoadReservationList()" class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <i class="fas fa-sync-alt mr-1"></i>새로고침
            </button>
          </div>
          <div id="admin-reservation-list" class="space-y-3">
            <div class="text-slate-500 text-sm text-center py-8">
              <i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...
            </div>
          </div>
        </div>

      </div>
    </div>

  </main>
</div>

<!-- ===== 회원 상세 모달 ===== -->
<div id="memberModal" class="hidden fixed inset-0 modal-overlay flex items-center justify-center z-50">
  <div class="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
    <div class="card-header px-6 py-4 flex items-center justify-between sticky top-0">
      <h3 class="text-white font-semibold"><i class="fas fa-user mr-2"></i>회원 상세</h3>
      <button onclick="closeModal('memberModal')" class="text-slate-400 hover:text-white"><i class="fas fa-times"></i></button>
    </div>
    <div id="memberModalContent" class="p-6"></div>
  </div>
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

<!-- ===== 관리자 알람발송 페이지 (main 안으로 이동됨) ===== -->
<!-- 관리자 채널 생성/수정 모달 -->
<div id="adminChannelModal" class="modal-overlay hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50">
  <div class="card rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
    <h3 id="adminChannelModalTitle" class="text-white font-bold text-lg">채널 생성</h3>
    <input type="hidden" id="adminChannelId">
    <div>
      <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널명 *</label>
      <input id="adminChannelName" type="text" class="input-field text-sm" placeholder="채널명">
    </div>
    <div>
      <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널 설명</label>
      <textarea id="adminChannelDesc" class="input-field text-sm" rows="2" placeholder="채널 설명"></textarea>
    </div>
    <div>
      <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">홈페이지 URL</label>
      <input id="adminChannelHomepage" type="text" class="input-field text-sm" placeholder="https://...">
    </div>
    <div>
      <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">대표 이미지 <span class="text-slate-500 normal-case font-normal">(선택)</span></label>
      <!-- 파일 첨부 -->
      <div class="flex items-center gap-2 mb-2">
        <label class="cursor-pointer btn-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
          <i class="fas fa-upload mr-1.5"></i>파일 선택
          <input type="file" id="adminChannelImageFile" accept="image/*" class="hidden" onchange="adminPreviewChannelImage(this)">
        </label>
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
      <button onclick="adminSaveChannel()" class="flex-1 btn-primary text-white py-2.5 rounded-xl text-sm font-semibold">
        <i class="fas fa-save mr-1.5"></i>저장
      </button>
    </div>
  </div>
</div>

<script src="/static/app.js?v=${Date.now()}"></script>
</body>
</html>`)
})

// =============================================
// [BLOCKED] WebView 정리 예정 – /app 라우트 차단
// 기존 WebView 앱 사용자 → 다운로드 페이지로 리다이렉트
// =============================================
app.get('/app', (c) => {
  return c.redirect('/download')
})

// 관리자 페이지
app.route('/admin', admin)

// =============================================
// Cleanup API - cron-job.org 에서 매일 UTC 15:00 호출
// Authorization: Bearer <ADMIN_SECRET> 헤더로 인증
// =============================================
app.post('/api/admin/cleanup', async (c) => {
  // Bearer 토큰 인증
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || token !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const now = new Date().toISOString()
    let firebaseDeleted = 0

    // ── Firebase Storage 파일 삭제 (3일 초과 audio/video/file 타입) ──
    try {
      const serviceAccountJson = (c.env as any).FCM_SERVICE_ACCOUNT_JSON || ''
      if (serviceAccountJson) {
        const sa = JSON.parse(serviceAccountJson)
        const projectId = sa.project_id || (c.env as any).FCM_PROJECT_ID
        const bucket = `${projectId}.firebasestorage.app`
        // alarm_logs에서 3일 초과 Firebase URL 수집
        const { results: oldFiles } = await c.env.DB.prepare(
          `SELECT DISTINCT msg_value FROM alarm_logs
           WHERE received_at < datetime('now', '+9 hours', 'start of day', '-3 days', '-9 hours')
             AND msg_type IN ('audio','video','file')
             AND msg_value LIKE 'https://firebasestorage%'`
        ).all() as { results: any[] }
        // alarm_schedules에서도 수집
        const { results: oldSchedFiles } = await c.env.DB.prepare(
          `SELECT DISTINCT msg_value FROM alarm_schedules
           WHERE scheduled_at < datetime('now', '+9 hours', 'start of day', '-3 days', '-9 hours')
             AND status IN ('triggered','cancelled')
             AND msg_type IN ('audio','video','file')
             AND msg_value LIKE 'https://firebasestorage%'`
        ).all() as { results: any[] }
        // 중복 제거 후 삭제
        const allUrls = [...new Set([...oldFiles, ...oldSchedFiles].map((r: any) => r.msg_value))]
        for (const url of allUrls) {
          try {
            const match = url.match(/\/o\/([^?]+)/)
            if (match) {
              const filePath = decodeURIComponent(match[1])
              await deleteFromFirebaseStorage(serviceAccountJson, bucket, filePath)
              firebaseDeleted++
            }
          } catch (_) {}
        }
      }
    } catch (fe) {
      console.error('[Cleanup] Firebase 삭제 오류:', fe)
    }

    // ── DB 삭제 ──
    const logsResult = await c.env.DB.prepare(
      "DELETE FROM alarm_logs WHERE received_at < datetime('now', '+9 hours', 'start of day', '-3 days', '-9 hours')"
    ).run()

    const schedulesResult = await c.env.DB.prepare(
      "DELETE FROM alarm_schedules WHERE scheduled_at < datetime('now', '+9 hours', 'start of day', '-3 days', '-9 hours') AND status IN ('triggered', 'cancelled')"
    ).run()

    console.log(`[Cleanup] ${now} - alarm_logs: ${logsResult.meta?.changes ?? 0}건, alarm_schedules: ${schedulesResult.meta?.changes ?? 0}건, firebase: ${firebaseDeleted}건 삭제`)

    return c.json({
      ok: true,
      timestamp: now,
      deleted: {
        alarm_logs: logsResult.meta?.changes ?? 0,
        alarm_schedules: schedulesResult.meta?.changes ?? 0,
        firebase_files: firebaseDeleted,
      }
    })
  } catch (e: any) {
    console.error('[Cleanup] 오류:', e)
    return c.json({ error: e?.message ?? 'Unknown error' }, 500)
  }
})

app.get('*', (c) => c.redirect('/'))

// =============================================
// Cloudflare Cron Trigger - 매일 KST 00:00 (UTC 15:00) 실행
// alarm_logs / alarm_schedules 3일 초과분 + Firebase Storage 파일 자동 삭제
// =============================================
const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (event, env, ctx) => {
  ctx.waitUntil((async () => {
    try {
      const KST_3DAYS_AGO = "datetime('now', '+9 hours', 'start of day', '-3 days', '-9 hours')"
      let firebaseDeleted = 0

      // ── 1) Firebase Storage 파일 삭제 (DB 삭제 전에 URL 수집) ──
      try {
        const serviceAccountJson = env.FCM_SERVICE_ACCOUNT_JSON || ''
        if (serviceAccountJson) {
          const sa = JSON.parse(serviceAccountJson)
          const projectId = sa.project_id || env.FCM_PROJECT_ID
          const bucket = `${projectId}.firebasestorage.app`

          // alarm_logs에서 3일 초과 Firebase URL 수집
          const { results: oldLogFiles } = await env.DB.prepare(
            `SELECT DISTINCT msg_value FROM alarm_logs
             WHERE received_at < ${KST_3DAYS_AGO}
               AND msg_type IN ('audio','video','file')
               AND msg_value LIKE 'https://firebasestorage%'`
          ).all() as { results: any[] }

          // alarm_schedules에서도 수집
          const { results: oldSchedFiles } = await env.DB.prepare(
            `SELECT DISTINCT msg_value FROM alarm_schedules
             WHERE replace(substr(scheduled_at,1,19),'T',' ') < ${KST_3DAYS_AGO}
               AND status IN ('triggered','cancelled')
               AND msg_type IN ('audio','video','file')
               AND msg_value LIKE 'https://firebasestorage%'`
          ).all() as { results: any[] }

          // 중복 제거 후 삭제
          const allUrls = [...new Set([...oldLogFiles, ...oldSchedFiles].map((r: any) => r.msg_value))]
          for (const url of allUrls) {
            try {
              const match = url.match(/\/o\/([^?]+)/)
              if (match) {
                const filePath = decodeURIComponent(match[1])
                await deleteFromFirebaseStorage(serviceAccountJson, bucket, filePath)
                firebaseDeleted++
              }
            } catch (_) {}
          }
        }
      } catch (fe) {
        console.error('[Cron] Firebase 삭제 오류:', fe)
      }

      // ── 2) DB 레코드 삭제 (Firebase 파일 삭제 후) ──
      const logsResult = await env.DB.prepare(
        `DELETE FROM alarm_logs WHERE received_at < ${KST_3DAYS_AGO}`
      ).run()

      const schedulesResult = await env.DB.prepare(
        `DELETE FROM alarm_schedules WHERE scheduled_at < ${KST_3DAYS_AGO} AND status IN ('triggered', 'cancelled')`
      ).run()

      console.log(`[Cron] KST 기준 3일 초과분 삭제 완료 - alarm_logs: ${logsResult.meta?.changes ?? 0}건, alarm_schedules: ${schedulesResult.meta?.changes ?? 0}건, firebase: ${firebaseDeleted}건 - ${new Date().toISOString()}`)
    } catch (e) {
      console.error('[Cron] 삭제 실패:', e)
    }
  })())
}

export default {
  fetch: app.fetch,
  scheduled,
}
