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

const app = new Hono<{ Bindings: Bindings }>()

// 미들웨어
app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret']
}))

// 정적 파일 서빙
app.use('/static/*', serveStatic({ root: './public' }))

// API 라우터 마운트
app.route('/api/channels', channels)
app.route('/api/contents', contents)
app.route('/api/subscribers', subscribers)
app.route('/api/notifications', notifications)

// 헬스체크
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Push Notification Admin API'
  })
})

// Admin 대시보드 메인 페이지
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
  :root {
    --primary: #6366f1;
    --primary-dark: #4f46e5;
    --secondary: #f59e0b;
    --success: #10b981;
    --danger: #ef4444;
    --warning: #f59e0b;
  }
  body { background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; }
  .sidebar { background: linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%); border-right: 1px solid #1e293b; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
  .card-header { background: linear-gradient(135deg, #312e81, #1e1b4b); border-radius: 12px 12px 0 0; }
  .btn-primary { background: linear-gradient(135deg, #6366f1, #4f46e5); }
  .btn-primary:hover { background: linear-gradient(135deg, #4f46e5, #3730a3); }
  .btn-success { background: linear-gradient(135deg, #10b981, #059669); }
  .btn-success:hover { background: linear-gradient(135deg, #059669, #047857); }
  .btn-danger { background: linear-gradient(135deg, #ef4444, #dc2626); }
  .nav-item { transition: all 0.2s; border-radius: 8px; }
  .nav-item:hover, .nav-item.active { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; }
  .nav-item.active { border-left: 3px solid #6366f1; }
  .stat-card { background: linear-gradient(135deg, #1e293b, #0f172a); }
  .badge { padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .badge-audio { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
  .badge-video { background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.3); }
  .badge-youtube { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
  .badge-completed { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }
  .badge-processing { background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245,158,11,0.3); }
  .badge-pending { background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
  .badge-failed { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); }
  .input-field { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 8px; padding: 8px 12px; width: 100%; transition: border-color 0.2s; }
  .input-field:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .input-field option { background: #1e293b; }
  .modal-overlay { background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
  .progress-bar { height: 6px; border-radius: 3px; background: #1e293b; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .table-row:hover { background: rgba(99, 102, 241, 0.05); }
  .spinner { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.3); animation: slideIn 0.3s ease; }
  .toast.success { background: linear-gradient(135deg, #10b981, #059669); color: white; }
  .toast.error { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
  @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #0f172a; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #475569; }
  .page { display: none; }
  .page.active { display: block; }
  .content-type-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .stat-trend { font-size: 12px; }
</style>
</head>
<body class="flex h-screen overflow-hidden">

<!-- 사이드바 -->
<div class="sidebar w-64 flex-shrink-0 flex flex-col h-full overflow-y-auto">
  <!-- 로고 -->
  <div class="p-6 border-b border-slate-700/50">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
        <i class="fas fa-bell text-white text-lg"></i>
      </div>
      <div>
        <h1 class="font-bold text-white text-sm">Push Admin</h1>
        <p class="text-slate-400 text-xs">알림 관리 시스템</p>
      </div>
    </div>
  </div>
  
  <!-- 채널 선택 -->
  <div class="p-4 border-b border-slate-700/50">
    <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">현재 채널</label>
    <select id="globalChannelSelect" class="input-field text-sm" onchange="onChannelChange()">
      <option value="">전체 채널</option>
    </select>
  </div>
  
  <!-- 네비게이션 -->
  <nav class="flex-1 p-4 space-y-1">
    <div class="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">메뉴</div>
    <a href="#" class="nav-item active flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('dashboard')">
      <i class="fas fa-chart-line w-4 text-center text-indigo-400"></i> 대시보드
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('channels')">
      <i class="fas fa-layer-group w-4 text-center text-purple-400"></i> 채널 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('contents')">
      <i class="fas fa-photo-film w-4 text-center text-blue-400"></i> 콘텐츠 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('subscribers')">
      <i class="fas fa-users w-4 text-center text-emerald-400"></i> 구독자 관리
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('notifications')">
      <i class="fas fa-paper-plane w-4 text-center text-amber-400"></i> 알림 발송
    </a>
    <a href="#" class="nav-item flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 cursor-pointer" onclick="showPage('logs')">
      <i class="fas fa-list-check w-4 text-center text-rose-400"></i> 발송 로그
    </a>
  </nav>
  
  <!-- 푸터 -->
  <div class="p-4 border-t border-slate-700/50">
    <div class="text-xs text-slate-500 flex items-center gap-2">
      <i class="fas fa-circle text-emerald-400 text-xs"></i>
      <span id="fcmStatus">FCM 상태: 시뮬레이션</span>
    </div>
  </div>
</div>

<!-- 메인 콘텐츠 -->
<div class="flex-1 flex flex-col h-full overflow-hidden">
  <!-- 상단 헤더 -->
  <header class="bg-slate-900 border-b border-slate-700/50 px-6 py-3 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <h2 id="pageTitle" class="text-white font-semibold text-lg">대시보드</h2>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="refreshCurrentPage()" class="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700">
        <i class="fas fa-rotate-right"></i>
      </button>
      <div class="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
        <i class="fas fa-user-shield text-indigo-400 text-sm"></i>
        <span class="text-slate-300 text-sm">Admin</span>
      </div>
    </div>
  </header>
  
  <!-- 페이지 콘텐츠 -->
  <main class="flex-1 overflow-y-auto p-6">
    
    <!-- ===== 대시보드 페이지 ===== -->
    <div id="page-dashboard" class="page active">
      <!-- 통계 카드 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <i class="fas fa-layer-group text-indigo-400"></i>
            </div>
            <span class="text-emerald-400 stat-trend"><i class="fas fa-arrow-up text-xs"></i> 활성</span>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-channels">-</div>
          <div class="text-slate-400 text-sm">전체 채널</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <i class="fas fa-users text-emerald-400"></i>
            </div>
            <span class="text-emerald-400 stat-trend"><i class="fas fa-arrow-up text-xs"></i> 구독중</span>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-subscribers">-</div>
          <div class="text-slate-400 text-sm">전체 구독자</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <i class="fas fa-photo-film text-blue-400"></i>
            </div>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-contents">-</div>
          <div class="text-slate-400 text-sm">전체 콘텐츠</div>
        </div>
        <div class="stat-card card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <i class="fas fa-paper-plane text-amber-400"></i>
            </div>
            <span id="acceptRate" class="text-amber-400 stat-trend text-xs">-% 수락률</span>
          </div>
          <div class="text-2xl font-bold text-white mb-1" id="stat-sent">-</div>
          <div class="text-slate-400 text-sm">총 발송 수</div>
        </div>
      </div>
      
      <!-- 차트 + 최근 배치 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- 발송 통계 차트 -->
        <div class="card lg:col-span-2">
          <div class="card-header px-5 py-4">
            <h3 class="text-white font-semibold flex items-center gap-2">
              <i class="fas fa-chart-bar text-indigo-400"></i> 최근 7일 발송 현황
            </h3>
          </div>
          <div class="p-5">
            <canvas id="dailyChart" height="200"></canvas>
          </div>
        </div>
        
        <!-- 수락/거절 도넛 차트 -->
        <div class="card">
          <div class="card-header px-5 py-4">
            <h3 class="text-white font-semibold flex items-center gap-2">
              <i class="fas fa-chart-pie text-purple-400"></i> 수락률 현황
            </h3>
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
      
      <!-- 최근 알림 배치 -->
      <div class="card">
        <div class="card-header px-5 py-4 flex items-center justify-between">
          <h3 class="text-white font-semibold flex items-center gap-2">
            <i class="fas fa-clock-rotate-left text-amber-400"></i> 최근 알림 발송 내역
          </h3>
          <button onclick="showPage('notifications')" class="text-indigo-400 text-sm hover:text-indigo-300">전체 보기 →</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-700">
                <th class="text-left px-5 py-3 text-slate-400 font-medium">채널</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">콘텐츠</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">제목</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">대상</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">발송</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">수락률</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">발송일시</th>
              </tr>
            </thead>
            <tbody id="recentBatchesTable"></tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- ===== 채널 관리 페이지 ===== -->
    <div id="page-channels" class="page">
      <div class="flex justify-between items-center mb-6">
        <p class="text-slate-400 text-sm">채널을 생성하고 관리합니다</p>
        <button onclick="openChannelModal()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <i class="fas fa-plus"></i> 채널 추가
        </button>
      </div>
      <div id="channelsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    </div>
    
    <!-- ===== 콘텐츠 관리 페이지 ===== -->
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
    
    <!-- ===== 구독자 관리 페이지 ===== -->
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
        <div class="flex items-center gap-2 text-slate-400 text-sm">
          <i class="fas fa-mobile-screen"></i>
          <span id="subscriberCount">0명 구독 중</span>
        </div>
      </div>
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-700">
                <th class="text-left px-5 py-3 text-slate-400 font-medium">구독자</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">채널</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">플랫폼</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">수락</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">거절</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">구독일</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
              </tr>
            </thead>
            <tbody id="subscribersTable"></tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- ===== 알림 발송 페이지 ===== -->
    <div id="page-notifications" class="page">
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <!-- 발송 폼 -->
        <div class="lg:col-span-2">
          <div class="card">
            <div class="card-header px-5 py-4">
              <h3 class="text-white font-semibold flex items-center gap-2">
                <i class="fas fa-paper-plane text-amber-400"></i> 새 알림 발송
              </h3>
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
              <!-- 선택된 콘텐츠 미리보기 -->
              <div id="contentPreview" class="hidden bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div class="flex gap-3">
                  <img id="previewThumbnail" src="" class="w-16 h-12 object-cover rounded-lg flex-shrink-0" onerror="this.style.display='none'">
                  <div class="flex-1 min-w-0">
                    <p id="previewTitle" class="text-white text-sm font-medium truncate"></p>
                    <p id="previewType" class="text-slate-400 text-xs mt-1"></p>
                    <p id="previewDuration" class="text-slate-500 text-xs"></p>
                  </div>
                </div>
              </div>
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">알림 제목 *</label>
                <input id="notifTitle" type="text" class="input-field text-sm" placeholder="새 콘텐츠가 등록되었습니다 🎵">
              </div>
              <div>
                <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">알림 내용 *</label>
                <textarea id="notifBody" class="input-field text-sm" rows="3" placeholder="콘텐츠 설명을 입력하세요..."></textarea>
              </div>
              <!-- 구독자 미리보기 -->
              <div id="subscriberPreview" class="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-3 hidden">
                <div class="flex items-center gap-2 text-sm">
                  <i class="fas fa-users text-indigo-400"></i>
                  <span id="targetCount" class="text-indigo-300 font-semibold"></span>
                  <span class="text-slate-400">명에게 발송 예정</span>
                </div>
              </div>
              <button onclick="sendNotification()" id="sendBtn" class="btn-success w-full text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <i class="fas fa-paper-plane"></i>
                <span id="sendBtnText">푸시 알림 발송</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- 발송 이력 -->
        <div class="lg:col-span-3">
          <div class="card">
            <div class="card-header px-5 py-4 flex items-center justify-between">
              <h3 class="text-white font-semibold flex items-center gap-2">
                <i class="fas fa-history text-blue-400"></i> 발송 이력
              </h3>
              <button onclick="loadBatches()" class="text-slate-400 hover:text-white transition-colors text-sm">
                <i class="fas fa-rotate-right mr-1"></i>새로고침
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-slate-700">
                    <th class="text-left px-4 py-3 text-slate-400 font-medium">콘텐츠</th>
                    <th class="text-center px-4 py-3 text-slate-400 font-medium">대상</th>
                    <th class="text-center px-4 py-3 text-slate-400 font-medium">발송</th>
                    <th class="text-center px-4 py-3 text-slate-400 font-medium">수락률</th>
                    <th class="text-center px-4 py-3 text-slate-400 font-medium">상태</th>
                    <th class="text-left px-4 py-3 text-slate-400 font-medium">일시</th>
                  </tr>
                </thead>
                <tbody id="batchesTable"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- ===== 발송 로그 페이지 ===== -->
    <div id="page-logs" class="page">
      <div class="flex justify-between items-center mb-6">
        <select id="logBatchFilter" class="input-field text-sm w-64" onchange="loadLogs()">
          <option value="">배치 선택 (최근 발송 이력)</option>
        </select>
        <div class="flex items-center gap-3">
          <select id="logStatusFilter" class="input-field text-sm w-40" onchange="filterLogs()">
            <option value="">전체 상태</option>
            <option value="sent">발송완료</option>
            <option value="accepted">수락</option>
            <option value="rejected">거절</option>
            <option value="failed">실패</option>
          </select>
        </div>
      </div>
      
      <!-- 배치 통계 -->
      <div id="batchStats" class="hidden card mb-4 p-4">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-xl font-bold text-white" id="logStatTotal">-</div>
            <div class="text-slate-400 text-xs">총 대상</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-blue-400" id="logStatSent">-</div>
            <div class="text-slate-400 text-xs">발송 완료</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-emerald-400" id="logStatAccepted">-</div>
            <div class="text-slate-400 text-xs">수락</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-red-400" id="logStatRejected">-</div>
            <div class="text-slate-400 text-xs">거절</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-700">
                <th class="text-left px-5 py-3 text-slate-400 font-medium">구독자</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">플랫폼</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">FCM 토큰</th>
                <th class="text-center px-5 py-3 text-slate-400 font-medium">상태</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">발송 시각</th>
                <th class="text-left px-5 py-3 text-slate-400 font-medium">액션 시각</th>
              </tr>
            </thead>
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
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">채널명 *</label>
        <input id="channelName" type="text" class="input-field" placeholder="힐링 뮤직 채널">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label>
        <textarea id="channelDescription" class="input-field" rows="2" placeholder="채널에 대한 설명을 입력하세요"></textarea>
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
        <select id="contentChannelId" class="input-field">
          <option value="">채널 선택...</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">콘텐츠 타입 *</label>
          <select id="contentType" class="input-field" onchange="onContentTypeChange()">
            <option value="audio">🎵 오디오</option>
            <option value="video">🎬 비디오</option>
            <option value="youtube">📺 유튜브</option>
          </select>
        </div>
        <div>
          <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">재생 시간 (초)</label>
          <input id="contentDuration" type="number" class="input-field" placeholder="245">
        </div>
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">제목 *</label>
        <input id="contentTitle" type="text" class="input-field" placeholder="콘텐츠 제목">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">설명</label>
        <textarea id="contentDescription" class="input-field" rows="2" placeholder="콘텐츠 설명"></textarea>
      </div>
      <div>
        <label id="contentUrlLabel" class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">콘텐츠 URL *</label>
        <input id="contentUrl" type="url" class="input-field" placeholder="https://...">
      </div>
      <div>
        <label class="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">썸네일 URL</label>
        <input id="contentThumbnail" type="url" class="input-field" placeholder="https://...">
      </div>
      <!-- 등록 후 즉시 발송 옵션 -->
      <div class="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" id="sendAfterCreate" class="w-4 h-4 accent-indigo-500">
          <div>
            <span class="text-amber-300 text-sm font-semibold">등록 후 즉시 푸시 알림 발송</span>
            <p class="text-slate-400 text-xs mt-0.5">채널 구독자 전체에게 즉시 발송합니다</p>
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

// SPA 폴백 - 모든 경로를 메인으로
app.get('*', (c) => c.redirect('/'))

export default app
