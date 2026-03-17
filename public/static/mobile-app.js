// public/static/mobile-app.js  v30
// RinGo 모바일 웹 앱

const API = axios.create({ baseURL: '/api' })
const MAX_PREVIEW = 3   // 홈화면 최대 미리보기 개수

// ─────────────────────────────────────────────
// 스토어 (세션 기반 인증 통합)
// ─────────────────────────────────────────────
const Store = {
  get(k)    { return localStorage.getItem(k) },
  set(k, v) { localStorage.setItem(k, v) },
  del(k)    { localStorage.removeItem(k) },

  // ── 세션/인증 ──
  getSessionToken() { return this.get('session_token') || '' },
  setSession(data) {
    this.set('session_token',  data.session_token)
    this.set('user_id',        data.user_id)
    this.set('email',          data.email || '')
    this.set('display_name',   data.display_name || '')
  },
  clearSession() {
    this.del('session_token'); this.del('user_id')
    this.del('email'); this.del('display_name')
  },
  isLoggedIn() { return !!this.getSessionToken() },
  getUserId()  { return this.get('user_id') || '' },
  getEmail()   { return this.get('email') || '' },
  getDisplayName() { return this.get('display_name') || '' },
  getFcmToken() {
    // Flutter 앱 환경이면 주입된 Android FCM 토큰 우선 사용
    const flutterToken = this.get('flutter_fcm_token')
    if (flutterToken) return flutterToken
    let t = this.get('fcm_token')
    if (!t) { t = 'fcm_' + Date.now() + '_web'; this.set('fcm_token', t) }
    return t
  },
  // Flutter 앱 환경 여부 (FlutterBridge 존재 여부로 판단 - 더 신뢰성 높음)
  isFlutterApp() { return !!window.FlutterBridge },
  getPlatform()  { return this.isFlutterApp() ? 'android' : 'web' },
  // Flutter에 FCM 토큰 직접 요청 (비동기, 타임아웃 3초)
  getFlutterFcmToken() {
    return new Promise((resolve) => {
      if (!window.FlutterBridge) { resolve({ fcm_token: this.getFcmToken(), platform: 'web' }); return }
      const cbName = '_fcmCb_' + Date.now()
      const timer = setTimeout(() => {
        delete window[cbName]
        // 타임아웃 시 localStorage의 토큰 사용
        resolve({ fcm_token: this.getFcmToken(), platform: this.get('flutter_fcm_token') ? 'android' : 'web' })
      }, 3000)
      window[cbName] = (result) => {
        clearTimeout(timer)
        delete window[cbName]
        if (result.fcm_token) {
          // 받은 토큰을 localStorage에도 저장
          localStorage.setItem('flutter_fcm_token', result.fcm_token)
        }
        resolve(result)
      }
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'get_fcm_token', callback: cbName }))
    })
  },
  getNotifs()      { try { return JSON.parse(this.get('notifications') || '[]') } catch { return [] } },
  addNotif(n)      {
    const list = this.getNotifs()
    list.unshift({ ...n, id: Date.now(), time: new Date().toLocaleString('ko-KR'), status: 'received' })
    this.set('notifications', JSON.stringify(list.slice(0, 50)))
  },
  updateNotif(id, status) {
    const list = this.getNotifs().map(n => n.id === id ? { ...n, status } : n)
    this.set('notifications', JSON.stringify(list))
  },
  clearNotifs() { this.del('notifications') },
  // 채널별 알람 설정
  getAlarm(chId)      { return this.get('alarm_' + chId) !== 'off' },
  setAlarm(chId, on)  { this.set('alarm_' + chId, on ? 'on' : 'off') },
}

// 모든 API 요청에 세션 토큰 자동 첨부
API.interceptors.request.use(config => {
  const token = Store.getSessionToken()
  if (token) config.headers['Authorization'] = 'Bearer ' + token
  return config
})

// ─────────────────────────────────────────────
// Auth (로그인 / 회원가입)
// ─────────────────────────────────────────────
const Auth = {
  // 로그인 화면 표시
  show() {
    document.getElementById('auth-screen').classList.remove('hidden')
    // 앱바 / 네비 숨김
    const appbar  = document.getElementById('appbar')
    const nav     = document.querySelector('.bottom-nav')
    const wrap    = document.getElementById('screen-wrap')
    const drawer  = document.getElementById('drawer')
    const drawerO = document.getElementById('drawer-overlay')
    if (appbar)  appbar.style.display  = 'none'
    if (nav)     nav.style.display     = 'none'
    if (wrap)    wrap.style.display    = 'none'
    if (drawer)  drawer.classList.remove('open')
    if (drawerO) drawerO.classList.remove('open')
    // 폼 초기화
    this.switchTab('login')
    ;['login-email','login-pw','signup-name','signup-email','signup-pw','signup-pw2'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = ''
    })
    ;['login-error','signup-error'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.textContent = ''; el.classList.remove('show') }
    })
  },
  // 로그인 화면 숨기고 앱 표시
  hide() {
    document.getElementById('auth-screen').classList.add('hidden')
    const appbar = document.getElementById('appbar')
    const nav    = document.querySelector('.bottom-nav')
    const wrap   = document.getElementById('screen-wrap')
    if (appbar) appbar.style.display = ''
    if (nav)    nav.style.display    = ''
    if (wrap)   wrap.style.display   = ''
  },
  // 탭 전환
  switchTab(tab) {
    document.getElementById('tab-login').classList.toggle('active',  tab === 'login')
    document.getElementById('tab-signup').classList.toggle('active', tab === 'signup')
    document.getElementById('form-login').style.display  = tab === 'login'  ? 'flex' : 'none'
    document.getElementById('form-signup').style.display = tab === 'signup' ? 'flex' : 'none'
  },
  // 비밀번호 보기/숨기기
  togglePw(inputId, btn) {
    const el = document.getElementById(inputId)
    const isText = el.type === 'text'
    el.type = isText ? 'password' : 'text'
    btn.querySelector('i').className = isText ? 'fas fa-eye-slash' : 'fas fa-eye'
  },
  setError(id, msg) {
    const el = document.getElementById(id)
    el.textContent = msg; el.classList.add('show')
  },
  clearError(id) {
    const el = document.getElementById(id)
    el.textContent = ''; el.classList.remove('show')
  },
  setBtnLoading(btnId, loading) {
    const btn = document.getElementById(btnId)
    btn.disabled = loading
    if (loading) { btn._orig = btn.textContent; btn.textContent = '처리 중...' }
    else { btn.textContent = btn._orig || btn.textContent }
  },

  // ── 로그인 실행 ──
  async login() {
    this.clearError('login-error')
    const email = document.getElementById('login-email').value.trim()
    const pw    = document.getElementById('login-pw').value
    if (!email) { this.setError('login-error','이메일을 입력하세요'); return }
    if (!pw)    { this.setError('login-error','비밀번호를 입력하세요'); return }
    this.setBtnLoading('login-btn', true)
    try {
      const res = await axios.post('/api/auth/login', { email, password: pw })
      if (res.data?.success) {
        Store.setSession(res.data.data)
        this.hide()
        App.goto('home')
        toast('로그인됐습니다 👋')
      } else {
        this.setError('login-error', res.data?.error || '로그인 실패')
      }
    } catch (e) {
      this.setError('login-error', e.response?.data?.error || '서버 오류가 발생했습니다')
    } finally {
      this.setBtnLoading('login-btn', false)
    }
  },

  // ── 회원가입 실행 ──
  async signup() {
    this.clearError('signup-error')
    const name  = document.getElementById('signup-name').value.trim()
    const email = document.getElementById('signup-email').value.trim()
    const pw    = document.getElementById('signup-pw').value
    const pw2   = document.getElementById('signup-pw2').value
    if (!name)            { this.setError('signup-error','닉네임(표시 이름)을 입력하세요'); return }
    if (!email)           { this.setError('signup-error','이메일을 입력하세요'); return }
    if (pw.length < 6)    { this.setError('signup-error','비밀번호는 6자 이상이어야 합니다'); return }
    if (pw !== pw2)       { this.setError('signup-error','비밀번호가 일치하지 않습니다'); return }
    this.setBtnLoading('signup-btn', true)
    try {
      const res = await axios.post('/api/auth/register', { email, password: pw, display_name: name })
      if (res.data?.success) {
        Store.setSession(res.data.data)
        this.hide()
        App.goto('home')
        toast('회원가입 완료! 환영합니다 🎉')
      } else {
        this.setError('signup-error', res.data?.error || '회원가입 실패')
      }
    } catch (e) {
      this.setError('signup-error', e.response?.data?.error || '서버 오류가 발생했습니다')
    } finally {
      this.setBtnLoading('signup-btn', false)
    }
  },
}

// ─────────────────────────────────────────────
// 전역 상태
// ─────────────────────────────────────────────
let currentTab    = 'home'
let ownedChannels = []
let joinedChannels= []
let imgPickerMode = 'create'   // 'create' | 'edit'
let selectedImg   = null       // base64 data URL
let currentInviteCode = ''
let currentAlarmChId  = null
let editChannelId     = null
let alarmMsgSrc  = ''  // 'youtube'|'audio'|'video'|'file'
let alarmDate    = null        // Date 객체
let alarmHour    = 9
let alarmMin     = 0
let calYear      = 0
let calMonth     = 0           // 0-based

// ─────────────────────────────────────────────
// 캐시 (30초 TTL, 메모리 기반 - 가볍게)
// ─────────────────────────────────────────────
const Cache = {
  _mem: {},          // 메모리 캐시 (앱 실행 중)
  TTL: 30000,        // 30초 (메모리)
  LS_TTL: 300000,    // 5분 (localStorage)
  LS_PREFIX: 'ringo_cache_',

  set(key, data) {
    const ts = Date.now()
    // 메모리 저장
    this._mem[key] = { data, ts }
    // localStorage 저장 (직렬화 가능한 데이터만)
    try {
      localStorage.setItem(this.LS_PREFIX + key, JSON.stringify({ data, ts }))
    } catch {}
  },
  get(key) {
    const now = Date.now()
    // 메모리 먼저 확인 (30초 TTL)
    const mem = this._mem[key]
    if (mem && now - mem.ts < this.TTL) return mem.data
    // localStorage 확인 (5분 TTL)
    try {
      const raw = localStorage.getItem(this.LS_PREFIX + key)
      if (raw) {
        const item = JSON.parse(raw)
        if (now - item.ts < this.LS_TTL) {
          this._mem[key] = item  // 메모리에도 복원
          return item.data
        } else {
          localStorage.removeItem(this.LS_PREFIX + key)
        }
      }
    } catch {}
    return null
  },
  del(key) {
    delete this._mem[key]
    try { localStorage.removeItem(this.LS_PREFIX + key) } catch {}
  },
  clear() {
    this._mem = {}
    // ringo_cache_ prefix 키만 삭제 (다른 localStorage 건드리지 않음)
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(this.LS_PREFIX))
        .forEach(k => localStorage.removeItem(k))
    } catch {}
  }
}

// ─────────────────────────────────────────────
// API 타임아웃 래퍼 (10초)
// ─────────────────────────────────────────────
function apiWithTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ])
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function toast(msg, dur = 2500) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), dur)
}

function avatarColor(name) {
  const p = ['#6C63FF','#E91E63','#4CAF50','#2196F3','#FF9800','#9C27B0']
  return p[(name || 'A').charCodeAt(0) % p.length]
}

function avatar(name, imgUrl, size = 44) {
  const c = avatarColor(name)
  const init = (name || '?')[0].toUpperCase()
  const s = `width:${size}px;height:${size}px;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;`
  if (imgUrl) {
    return `<div style="${s}background:${c}22;">
      <img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;"
        onerror="this.parentNode.innerHTML='<img src=\\/static\\/ringo-icon.png style=width:100%;height:100%;object-fit:cover;>'">
    </div>`
  }
  // 이미지 없을 때 첫 글자 + 배경색
  return `<div style="${s}background:${c};display:flex;align-items:center;justify-content:center;">
    <span style="font-size:${Math.round(size*0.45)}px;font-weight:700;color:#fff;">${init}</span>
  </div>`
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
const App = {

  // ── 탭 이동 ──────────────────────────────
  goto(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
    const screen = document.getElementById('screen-' + tab)
    const navBtn = document.getElementById('nav-' + (tab === 'home' ? 'home' : tab))
    if (screen) screen.classList.add('active')
    if (navBtn) navBtn.classList.add('active')
    currentTab = tab
    if (tab === 'home')          this.loadHome()
    else if (tab === 'channel')  this.loadChannel()
    else if (tab === 'inbox')    {
      // 편집모드만 종료, _inboxChannels는 null 초기화하지 않음 (캐시 우선 표시)
      if (this._inboxEditMode) {
        this._inboxEditMode = false
        const bar = document.getElementById('inbox-action-bar')
        const btn = document.getElementById('inbox-edit-btn')
        if (bar) bar.style.display = 'none'
        if (btn) btn.style.color = 'var(--text3)'
        document.querySelectorAll('.inbox-item-check').forEach(el => { el.style.display = 'none' })
      }
      this.loadInbox()
    }
    else if (tab === 'send')     {
      // 편집모드만 종료, _outboxChannels는 null 초기화하지 않음 (캐시 우선 표시)
      if (this._outboxEditMode) {
        this._outboxEditMode = false
        const bar = document.getElementById('outbox-action-bar')
        const btn = document.getElementById('outbox-edit-btn')
        if (bar) bar.style.display = 'none'
        if (btn) btn.style.color = 'var(--text3)'
        document.querySelectorAll('.outbox-item-check').forEach(el => { el.style.display = 'none' })
      }
      this.loadSend()
    }
    else if (tab === 'settings') this.loadSettings()
    else if (tab === 'owned-all')  this.loadOwnedAll()
    else if (tab === 'joined-all') this.loadJoinedAll()
    else if (tab === 'notices')    this.loadNotices()
  },

  // 뒤로가기 (전체 페이지에서 홈으로)
  gotoBack() {
    if (currentTab === 'owned-all' || currentTab === 'joined-all' || currentTab === 'notices') {
      this.goto('home')
    }
  },

  // ── 뒤로가기 (Android 하단 뒤로가기 버튼) ─────────────
  // Flutter에서 호출 → true 반환 시 Flutter가 앱 종료 처리
  goBack() {
    // 0. 이미지 뷰어 팝업이 열려있으면 닫기
    const imageViewer = document.getElementById('image-viewer-overlay')
    if (imageViewer) { imageViewer.remove(); return false }
    // 1. 수신함 상세 뷰가 열려있으면 채널 목록으로
    const inboxDetail = document.getElementById('inbox-detail-view')
    if (inboxDetail && inboxDetail.style.display !== 'none') {
      this.inboxBack(); return false
    }
    // 2. 발신함 상세 뷰가 열려있으면 채널 목록으로
    const outboxDetail = document.getElementById('outbox-detail-view')
    if (outboxDetail && outboxDetail.style.display !== 'none') {
      this.outboxBack(); return false
    }
    // 3. 모달이 열려있으면 가장 위(z-index 높은) 모달만 닫기
    const openModals = [...document.querySelectorAll('.fullscreen-overlay.active, .modal-overlay.active')]
    if (openModals.length) {
      const topModal = openModals.reduce((a, b) => {
        const az = parseInt(window.getComputedStyle(a).zIndex) || 0
        const bz = parseInt(window.getComputedStyle(b).zIndex) || 0
        return bz > az ? b : a
      })
      topModal.classList.remove('active'); return false
    }
    // 4. 드로어가 열려있으면 닫기
    const drawer = document.getElementById('drawer')
    if (drawer && drawer.classList.contains('open')) {
      this.closeDrawer(); return false
    }
    // 5. 전체 페이지(운영/가입채널)에서 홈으로
    if (currentTab === 'owned-all' || currentTab === 'joined-all' || currentTab === 'notices') {
      this.goto('home'); return false
    }
    // 6. 홈이 아닌 탭이면 홈으로
    if (currentTab !== 'home') {
      this.goto('home'); return false
    }
    // 7. 홈 탭이면 Flutter에서 앱 종료 처리
    return true
  },

  // ── 테마 (다크/라이트 모드) ──────────────────────────
  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
    const labelEl  = document.getElementById('theme-label')
    const toggleEl = document.getElementById('theme-toggle')
    if (labelEl)  labelEl.textContent = theme === 'dark' ? '다크' : '라이트'
    if (toggleEl) toggleEl.checked   = theme === 'dark'
    const logoEl = document.getElementById('appbar-logo')
    if (logoEl) logoEl.src = theme === 'light' ? '/static/ringo-logo-dark.png' : '/static/ringo-logo.png'
    const drawerLogoEl = document.getElementById('drawer-logo')
    if (drawerLogoEl) drawerLogoEl.src = theme === 'light' ? '/static/ringo-logo-dark.png' : '/static/ringo-logo.png'
  },

  toggleTheme(isDark) {
    this.applyTheme(isDark ? 'dark' : 'light')
  },

  // ── 홈 모드 전환 ─────────────────────────
  // ── 신홈화면 메뉴 기본 목록 ──────────────
  _defaultMenuItems() {
    return [
      { id:'channel',   label:'채널검색',     sub:'채널 찾기',       icon:'fa-search',         iconColor:'#4A6FA5', iconBg:'rgba(74,111,165,0.12)' },
      { id:'owned-all', label:'내 채널',       sub:'운영 채널 관리',  icon:'fa-satellite-dish', iconColor:'#3A8F7D', iconBg:'rgba(58,143,125,0.12)' },
      { id:'joined-all',label:'구독 채널',     sub:'가입한 채널',     icon:'fa-list',           iconColor:'#7B5EA7', iconBg:'rgba(123,94,167,0.12)' },
      { id:'notices',   label:'공지사항',      sub:'공지 확인',       icon:'fa-bullhorn',       iconColor:'#D4763B', iconBg:'rgba(212,118,59,0.12)'  },
      { id:'inbox',     label:'수신함',        sub:'받은 메시지',     icon:'fa-inbox',          iconColor:'#3A7D44', iconBg:'rgba(58,125,68,0.12)'   },
      { id:'send',      label:'발신함',        sub:'보낸 메시지',     icon:'fa-paper-plane',    iconColor:'#2C6E9E', iconBg:'rgba(44,110,158,0.12)'  },
      { id:'join-code', label:'초대코드 가입', sub:'코드로 채널 참여', icon:'fa-ticket-alt',     iconColor:'#A0527A', iconBg:'rgba(160,82,122,0.12)'  },
      { id:'settings',  label:'설정',          sub:'앱 환경설정',     icon:'fa-cog',            iconColor:'#5A6472', iconBg:'rgba(90,100,114,0.12)'  },
    ]
  },

  _getMenuOrder() {
    try {
      const saved = localStorage.getItem('homeMenuOrder')
      if (saved) {
        const order = JSON.parse(saved)
        const defaults = this._defaultMenuItems()
        // 저장된 순서 기준으로 정렬, 없는 항목은 뒤에 추가
        const mapped = order.map(id => defaults.find(d => d.id === id)).filter(Boolean)
        const extra  = defaults.filter(d => !order.includes(d.id))
        return [...mapped, ...extra]
      }
    } catch(e) {}
    return this._defaultMenuItems()
  },

  async _loadNewHome() {
    const grid = document.getElementById('new-home-grid')
    if (!grid) return

    // 메뉴 카드 렌더링
    const items = this._getMenuOrder()
    const isEdit = grid.dataset.editMode === '1'
    grid.innerHTML = items.map((item, idx) => `
      <div class="new-home-card${isEdit ? ' drag-mode' : ''}"
           data-menu-id="${item.id}"
           data-index="${idx}"
           onclick="${isEdit ? '' : `App._newHomeCardClick('${item.id}')`}"
           draggable="${isEdit ? 'true' : 'false'}">
        <div class="new-home-card-icon-wrap" style="background:${item.iconBg};">
          <i class="fas ${item.icon} new-home-card-icon" style="color:${item.iconColor};"></i>
        </div>
        <div class="new-home-card-label">${item.label}</div>
        <div class="new-home-card-sub">${item.sub}</div>
        <i class="fas fa-grip-lines drag-handle"></i>
      </div>
    `).join('')
    if (isEdit) this._bindDragEvents(grid)
  },

  _newHomeBannerClick() {
    const bannerEl = document.getElementById('new-home-banner')
    const link = bannerEl?.dataset.linkUrl
    if (link) {
      if (window.flutter_inappwebview) {
        window.flutter_inappwebview.callHandler('openUrl', link)
      } else {
        window.open(link, '_blank')
      }
    }
  },

  _newHomeCardClick(menuId) {
    if (menuId === 'join-code') {
      App.openJoinChannel()
    } else {
      App.goto(menuId)
    }
  },

  toggleHomeEditMode() {
    const grid = document.getElementById('new-home-grid')
    const btn  = document.getElementById('new-home-edit-btn')
    if (!grid) return
    const isEdit = grid.dataset.editMode === '1'
    if (isEdit) {
      // 순서 저장 후 편집 모드 종료
      const order = [...grid.querySelectorAll('.new-home-card')].map(c => c.dataset.menuId)
      localStorage.setItem('homeMenuOrder', JSON.stringify(order))
      grid.dataset.editMode = '0'
      if (btn) { btn.classList.remove('active'); btn.innerHTML = '<i class="fas fa-sort"></i> 순서 변경' }
    } else {
      grid.dataset.editMode = '1'
      if (btn) { btn.classList.add('active'); btn.innerHTML = '<i class="fas fa-check"></i> 완료' }
    }
    this._loadNewHome()
  },

  _bindDragEvents(grid) {
    let dragSrc = null
    grid.querySelectorAll('.new-home-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragSrc = card
        setTimeout(() => card.classList.add('dragging'), 0)
        e.dataTransfer.effectAllowed = 'move'
      })
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging')
        grid.querySelectorAll('.new-home-card').forEach(c => c.classList.remove('drag-over'))
      })
      card.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        grid.querySelectorAll('.new-home-card').forEach(c => c.classList.remove('drag-over'))
        if (card !== dragSrc) card.classList.add('drag-over')
      })
      card.addEventListener('drop', e => {
        e.preventDefault()
        if (!dragSrc || dragSrc === card) return
        card.classList.remove('drag-over')
        // DOM 위치 교환
        const allCards = [...grid.querySelectorAll('.new-home-card')]
        const srcIdx  = allCards.indexOf(dragSrc)
        const destIdx = allCards.indexOf(card)
        if (srcIdx < destIdx) grid.insertBefore(dragSrc, card.nextSibling)
        else                  grid.insertBefore(dragSrc, card)
      })
      // 터치 드래그 (모바일)
      let touchStartY = 0, touchStartX = 0
      card.addEventListener('touchstart', e => {
        dragSrc = card
        touchStartY = e.touches[0].clientY
        touchStartX = e.touches[0].clientX
        card.classList.add('dragging')
      }, { passive: true })
      card.addEventListener('touchmove', e => {
        e.preventDefault()
        const touch = e.touches[0]
        const el = document.elementFromPoint(touch.clientX, touch.clientY)
        const target = el?.closest('.new-home-card')
        grid.querySelectorAll('.new-home-card').forEach(c => c.classList.remove('drag-over'))
        if (target && target !== dragSrc) target.classList.add('drag-over')
      }, { passive: false })
      card.addEventListener('touchend', e => {
        card.classList.remove('dragging')
        const touch = e.changedTouches[0]
        const el = document.elementFromPoint(touch.clientX, touch.clientY)
        const target = el?.closest('.new-home-card')
        grid.querySelectorAll('.new-home-card').forEach(c => c.classList.remove('drag-over'))
        if (target && target !== dragSrc) {
          const allCards = [...grid.querySelectorAll('.new-home-card')]
          const srcIdx  = allCards.indexOf(dragSrc)
          const destIdx = allCards.indexOf(target)
          if (srcIdx < destIdx) grid.insertBefore(dragSrc, target.nextSibling)
          else                  grid.insertBefore(dragSrc, target)
        }
        dragSrc = null
      }, { passive: true })
    })
  },

  // ── 드로어 ───────────────────────────────
  openDrawer()  {
    document.getElementById('drawer-overlay').classList.add('open')
    document.getElementById('drawer').classList.add('open')
    this.checkNoticesBadge()
  },

  // ── 공지사항 미확인 뱃지 ──────────────────────────────
  async checkNoticesBadge() {
    try {
      const res = await API.get('/notices')
      const list = res.data?.data || []
      if (!list.length) { this._setNoticeBadge(false); return }
      const seen = JSON.parse(localStorage.getItem('seen_notices') || '[]')
      const hasUnread = list.some(n => !seen.includes(n.id))
      this._setNoticeBadge(hasUnread)
    } catch(e) { this._setNoticeBadge(false) }
  },
  _setNoticeBadge(show) {
    const badge = document.getElementById('notice-badge')
    if (badge) badge.style.display = show ? 'block' : 'none'
    const appbarBadge = document.getElementById('appbar-notice-badge')
    if (appbarBadge) appbarBadge.style.display = show ? 'block' : 'none'
  },
  closeDrawer() {
    document.getElementById('drawer-overlay').classList.remove('open')
    document.getElementById('drawer').classList.remove('open')
  },


  // ── 홈 화면 ──────────────────────────────
  async loadHome() {

    // 공지 뱃지 체크
    this.checkNoticesBadge()

    const uid = Store.getUserId()
    if (!uid) {
      this._loadNewHome()
      return
    }

    // 캐시 확인 → 있으면 즉시 렌더 후 백그라운드 갱신
    const cacheKey = 'home_' + uid
    const cached = Cache.get(cacheKey)
    if (cached) {
      ownedChannels  = cached.owned
      joinedChannels = cached.joined
    }

    // 채널 데이터 fetch (캐시 없으면 await, 있으면 백그라운드)
    const fetchData = async () => {
      try {
        const [oRes, jRes] = await apiWithTimeout(Promise.all([
          API.get('/channels?owner_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } })),
          API.get('/subscribers?user_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } }))
        ]))
        ownedChannels  = oRes.data?.data || []
        const ownedIds = new Set(ownedChannels.map(c => c.id))
        joinedChannels = (jRes.data?.data || []).filter(s => !ownedIds.has(s.channel_id))
        Cache.set(cacheKey, { owned: ownedChannels, joined: joinedChannels })
      } catch(e) {
        if (!cached) { ownedChannels = []; joinedChannels = [] }
        if (e.message === 'timeout') App.showToast('네트워크가 느립니다. 다시 시도해주세요.', 'error')
      }
    }

    if (!cached) {
      await fetchData()
    } else {
      fetchData() // 백그라운드 갱신
    }

    // 신홈 메뉴 카드 렌더링
    this._loadNewHome()
  },

  _renderOwned() {
    const el   = document.getElementById('owned-list')
    const more = document.getElementById('owned-more')
    if (!ownedChannels.length) {
      el.innerHTML = '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
      more.style.display = 'none'; return
    }
    const preview = ownedChannels.slice(0, MAX_PREVIEW)
    el.innerHTML = `<div class="channel-list-wrap">${preview.map(ch => this._ownedTileHtml(ch)).join('')}</div>`

    if (ownedChannels.length > MAX_PREVIEW) {
      more.style.display = 'block'
      more.innerHTML = `<div class="more-btn" onclick="App.goto('owned-all')">
        <i class="fas fa-plus-circle" style="color:var(--primary);"></i>
        + 전체보기(${ownedChannels.length}개)
      </div>`
    } else {
      more.style.display = 'none'
    }
  },

  _showAllOwned() {
    const el = document.getElementById('owned-list')
    el.innerHTML = `<div class="channel-list-wrap">${ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')}</div>`
  },

  // ── 나의 운영채널 전체 페이지 ──────────────────────────
  async loadOwnedAll() {
    const el = document.getElementById('owned-all-list')
    if (!el) return
    // 캐시 있으면 즉시 표시
    if (ownedChannels.length) {
      el.innerHTML = `<div class="channel-list-wrap">${ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')}</div>`
    } else {
      el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    }
    // 항상 API 재호출해서 최신 데이터로 갱신
    try {
      const uid = Store.getUserId()
      if (!uid) return
      const res = await API.get('/channels?owner_id=' + encodeURIComponent(uid))
      ownedChannels = res.data?.data || []
      const cacheKey = 'home_' + uid
      const cached = Cache.get(cacheKey)
      if (cached) Cache.set(cacheKey, { ...cached, owned: ownedChannels })
      el.innerHTML = ownedChannels.length
        ? `<div class="channel-list-wrap">${ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')}</div>`
        : '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
    } catch(e) {
      if (!ownedChannels.length) el.innerHTML = '<div class="empty-box">불러오기 실패</div>'
    }
  },

  // 백그라운드 재검증 후 owned-all 화면이 열려있으면 조용히 갱신
  _reRenderOwnedAll() {
    if (currentTab !== 'owned-all') return
    const el = document.getElementById('owned-all-list')
    if (!el) return
    el.innerHTML = ownedChannels.length
      ? `<div class="channel-list-wrap">${ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')}</div>`
      : '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
  },

  // ── 항목 7: fetchMyChannels() ─────────────────────────────
  // channel_created / channel_deleted / channel_updated 이벤트 수신 시 호출
  // 전체 페이지 reload 없이 ownedChannels 리스트만 서버 재조회 후 재렌더
  async fetchMyChannels() {
    try {
      const uid = Store.getUserId()
      if (!uid) return
      const r = await API.get('/channels?owner_id=' + encodeURIComponent(uid))
      ownedChannels = r.data?.data || ownedChannels
      this._reRenderOwnedAll()
      // 홈 탭 미리보기도 갱신
      this._renderOwned()
    } catch(_) {}
  },

  // ── 나의 가입채널 전체 페이지 ──────────────────────────
  async loadJoinedAll() {
    const el = document.getElementById('joined-all-list')
    if (!el) return
    // 캐시 있으면 즉시 표시
    if (joinedChannels.length) {
      el.innerHTML = `<div class="joined-list-wrap">${joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')}</div>`
    } else {
      el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    }
    // 항상 API 재호출해서 최신 데이터로 갱신
    try {
      const uid = Store.getUserId()
      if (!uid) return
      const [oRes, jRes] = await Promise.all([
        API.get('/channels?owner_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } })),
        API.get('/subscribers?user_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } }))
      ])
      ownedChannels = oRes.data?.data || []
      const ownedIds = new Set(ownedChannels.map(c => c.id))
      joinedChannels = (jRes.data?.data || []).filter(s => !ownedIds.has(s.channel_id))
      const cacheKey = 'home_' + uid
      Cache.set(cacheKey, { owned: ownedChannels, joined: joinedChannels })
      el.innerHTML = joinedChannels.length
        ? `<div class="joined-list-wrap">${joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')}</div>`
        : '<div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div>'
    } catch(e) {
      if (!joinedChannels.length) el.innerHTML = '<div class="empty-box">불러오기 실패</div>'
    }
  },

  // ── 공지사항 전체 페이지 ──────────────────────────
  _renderNoticeItems(list, hasMore, nextOffset, el, isFirst) {
    if (isFirst && !list.length) {
      el.innerHTML = '<div class="empty-box">등록된 공지사항이 없습니다.</div>'
      return
    }
    const seen = JSON.parse(localStorage.getItem('seen_notices') || '[]')
    const items = list.map(n => {
      const isUnread = !seen.includes(n.id)
      return `
      <div class="channel-tile" style="flex-direction:column;align-items:flex-start;padding:14px 16px;cursor:pointer;"
        onclick="App._toggleNotice(this, ${n.id})">
        <div style="display:flex;align-items:center;width:100%;gap:8px;">
          <i class="fas fa-bullhorn" style="color:var(--primary);font-size:14px;flex-shrink:0;"></i>
          <span style="font-size:14px;font-weight:600;color:var(--text);flex:1;">${n.title.replace(/</g,'&lt;')}</span>
          ${isUnread ? '<span style="width:8px;height:8px;background:#EF4444;border-radius:50%;flex-shrink:0;display:inline-block;"></span>' : ''}
          <span style="font-size:11px;color:var(--text3);">${n.created_at?.slice(0,10) || ''}</span>
          <i class="fas fa-chevron-down" style="font-size:11px;color:var(--text3);transition:transform 0.2s;"></i>
        </div>
        <div class="notice-content" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap;width:100%;">${n.content.replace(/</g,'&lt;')}</div>
      </div>
    `}).join('')
    if (isFirst) {
      el.innerHTML = '<div id="notices-items"></div><div id="notices-more-wrap" style="padding:12px 16px 4px;"></div>'
    }
    const itemsEl = document.getElementById('notices-items')
    if (itemsEl) itemsEl.insertAdjacentHTML('beforeend', items)
    const moreWrap = document.getElementById('notices-more-wrap')
    if (moreWrap) {
      moreWrap.innerHTML = hasMore
        ? `<button id="notices-more-btn" onclick="App.loadNotices(${nextOffset})" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--primary);font-size:14px;font-weight:600;cursor:pointer;"><i class="fas fa-plus-circle" style="margin-right:6px;"></i>더보기</button>`
        : ''
    }
  },

  async loadNotices(offset = 0) {
    const el = document.getElementById('notices-list')
    if (!el) return
    const LIMIT = 20
    const isFirst = offset === 0

    if (isFirst) {
      // 캐시 즉시 표시
      const cached = Cache.get('notices')
      if (cached) {
        this._renderNoticeItems(cached.data, cached.hasMore, cached.nextOffset, el, true)
      } else {
        el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
      }
    }

    // 더보기 버튼 로딩 상태
    const moreBtn = document.getElementById('notices-more-btn')
    if (moreBtn && !isFirst) {
      moreBtn.innerHTML = '<i class="fas fa-spinner spin"></i> 불러오는 중...'
      moreBtn.disabled = true
    }

    try {
      const res = await API.get(`/notices?limit=${LIMIT}&offset=${offset}`)
      const list = res.data?.data || []
      const hasMore = res.data?.hasMore ?? false
      const nextOffset = offset + list.length
      // 첫 페이지 결과 캐시 저장
      if (isFirst) Cache.set('notices', { data: list, hasMore, nextOffset })
      this._renderNoticeItems(list, hasMore, nextOffset, el, isFirst)
    } catch (e) {
      if (isFirst && !Cache.get('notices')) el.innerHTML = '<div class="empty-box">공지사항을 불러올 수 없습니다.</div>'
    }
  },

  _toggleNotice(el, noticeId) {
    const content = el.querySelector('.notice-content')
    const icon = el.querySelector('.fa-chevron-down, .fa-chevron-up')
    if (!content) return
    const isOpen = content.style.display !== 'none'
    content.style.display = isOpen ? 'none' : 'block'
    if (icon) {
      icon.classList.toggle('fa-chevron-down', isOpen)
      icon.classList.toggle('fa-chevron-up', !isOpen)
    }
    // 열람 시 확인 처리
    if (!isOpen && noticeId) {
      const seen = JSON.parse(localStorage.getItem('seen_notices') || '[]')
      if (!seen.includes(noticeId)) {
        seen.push(noticeId)
        localStorage.setItem('seen_notices', JSON.stringify(seen))
        // 빨간점 제거
        const dot = el.querySelector('span[style*="#EF4444"]')
        if (dot) dot.remove()
        // 드로어 뱃지 갱신
        this.checkNoticesBadge()
      }
    }
  },

  _ownedTileHtml(ch) {
    const name     = ch.name || '채널'
    const cnt        = ch.subscriber_count || 0
    const id         = ch.id
    const alarmCount = ch.pending_alarm_count || 0
    const hasAlarm   = alarmCount > 0
    const lockIcon   = ch.is_secret ? '<i class="fas fa-lock" style="font-size:13px;color:#EF4444;margin-left:4px;"></i>' : ''
    const alarmBadge = alarmCount > 0
      ? `<span style="position:absolute;top:-4px;right:-4px;background:#FF3B30;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1;pointer-events:none;">${alarmCount}</span>`
      : ''
    return `<div class="channel-tile">
      <div onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        ${avatar(name, ch.image_url, 44)}
      </div>
      <div class="info" onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        <div class="ch-name" style="display:flex;align-items:center;flex-wrap:nowrap;overflow:hidden;">${name} ${lockIcon} <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px;white-space:nowrap;"><i class="fas fa-user" style="font-size:10px;"></i> ${cnt}</span></div>
        <div class="ch-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ch.description || '채널 운영자'}</div>
      </div>
      ${hasAlarm ? `<div class="ch-actions"><div style="position:relative;display:inline-block;"><button class="ch-action-btn btn-alarm has-alarm" onclick="App.openAlarmModal(${id},'${name.replace(/'/g,"\\'")}');" title="예약알람 보기"><i class="fas fa-clock"></i></button>${alarmBadge}</div></div>` : ''}
    </div>`
  },

  _renderJoined() {
    const el   = document.getElementById('joined-list')
    const more = document.getElementById('joined-more')
    if (!joinedChannels.length) {
      el.innerHTML = '<div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div>'
      more.style.display = 'none'; return
    }
    const preview = joinedChannels.slice(0, MAX_PREVIEW)
    el.innerHTML = `<div class="joined-list-wrap">${preview.map(ch => this._joinedTileHtml(ch)).join('')}</div>`

    if (joinedChannels.length > MAX_PREVIEW) {
      more.style.display = 'block'
      more.innerHTML = `<div class="more-btn" onclick="App.goto('joined-all')">
        <i class="fas fa-plus-circle" style="color:var(--primary);"></i>
        + 전체보기(${joinedChannels.length}개)
      </div>`
    } else {
      more.style.display = 'none'
    }
  },

  _showAllJoined() {
    const el = document.getElementById('joined-list')
    el.innerHTML = `<div class="joined-list-wrap">${joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')}</div>`
  },

  _joinedTileHtml(ch) {
    const name = ch.channel_name || ch.name || '채널'
    const chId = ch.channel_id || ch.id
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:13px;color:#EF4444;margin-left:4px;"></i>' : ''
    return `<div class="joined-tile" onclick="App.openChannelDetail(${chId},'${name}')">
      ${avatar(name, ch.image_url, 44)}
      <div class="info">
        <div class="ch-name" style="display:flex;align-items:center;flex-wrap:nowrap;overflow:hidden;">${name} ${lockIcon} <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px;white-space:nowrap;"><i class="fas fa-user" style="font-size:10px;"></i> ${ch.subscriber_count || 0}</span></div>
        <div class="ch-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ch.channel_description || ch.description || ''}</div>
      </div>
      <i class="fas fa-chevron-right chevron"></i>
    </div>`
  },

  // ── 채널 탭 ──────────────────────────────
  async loadChannel() {
    // 검색창 초기화
    const inp = document.getElementById('channel-search-input')
    const clr = document.getElementById('channel-search-clear')
    if (inp) inp.value = ''
    if (clr) clr.style.display = 'none'

    // 검색 영역 숨기고 섹션 보이기
    const searchEl   = document.getElementById('channel-list-search')
    const popularSec = document.getElementById('channel-section-popular')
    const bestSec    = document.getElementById('channel-section-best')
    if (searchEl)   searchEl.style.display   = 'none'
    if (popularSec) popularSec.style.display = 'block'
    if (bestSec)    bestSec.style.display    = 'block'

    const popularEl = document.getElementById('channel-list-popular')
    const bestEl    = document.getElementById('channel-list-best')

    // 캐시 확인
    const cached = Cache.get('channels')
    if (cached) {
      if (popularEl) popularEl.innerHTML = cached.popularHtml
      if (bestEl)    bestEl.innerHTML    = cached.bestHtml
      window._allChannelList = cached.allList
    }

    try {
      const [popRes, bestRes, allRes] = await apiWithTimeout(Promise.all([
        API.get('/channels/popular'),
        API.get('/channels/best'),
        API.get('/channels')
      ]))
      const popList  = popRes.data?.data  || []
      const bestList = bestRes.data?.data || []
      window._allChannelList = allRes.data?.data || []

      const popularHtml = popList.length
        ? `<div class="ch-all-list-wrap">${popList.map(ch => this._channelTileHtml(ch)).join('')}</div>`
        : '<div class="empty-box" style="margin:4px 14px;">인기 채널이 없습니다.</div>'
      const bestHtml = bestList.length
        ? `<div class="ch-all-list-wrap">${bestList.map(ch => this._channelTileHtml(ch)).join('')}</div>`
        : '<div class="empty-box" style="margin:4px 14px;">베스트 채널이 없습니다.</div>'

      if (popularEl) popularEl.innerHTML = popularHtml
      if (bestEl)    bestEl.innerHTML    = bestHtml
      Cache.set('channels', { popularHtml, bestHtml, allList: window._allChannelList })
    } catch(e) {
      if (!cached) {
        if (popularEl) popularEl.innerHTML = '<div class="empty-box">채널 목록을 불러올 수 없습니다.</div>'
        if (bestEl)    bestEl.innerHTML    = ''
      }
      if (e.message === 'timeout') App.showToast('네트워크가 느립니다. 다시 시도해주세요.', 'error')
    }
  },

  // ── 항목 10: 채널 탭 백그라운드 preload 헬퍼 ────────────
  async _preloadChannels() {
    if (Cache.get('channels')) return  // 이미 캐시 있으면 스킵
    try {
      const [popRes, bestRes, allRes] = await Promise.all([
        API.get('/channels/popular'),
        API.get('/channels/best'),
        API.get('/channels')
      ])
      const popList  = popRes.data?.data  || []
      const bestList = bestRes.data?.data || []
      const allList  = allRes.data?.data  || []
      window._allChannelList = allList
      const popularHtml = popList.map(ch => this._channelTileHtml(ch)).join('')
      const bestHtml    = bestList.map(ch => this._channelTileHtml(ch)).join('')
      Cache.set('channels', { popularHtml, bestHtml, allList })
      console.log('[Preload] channels done, all:', allList.length)
    } catch(_) {}
  },

  // 채널 타일 HTML 생성 (공통)
  _channelTileHtml(ch) {
    const name     = ch.name || '채널'
    const isJoined = joinedChannels.some(s => (s.channel_id || s.id) === ch.id)
    const isOwner  = ch.owner_id === Store.getUserId()
    const subLabel = isOwner  ? '<span style="color:var(--primary);font-weight:600;">운영 중</span>'
                   : isJoined ? '<span style="color:var(--teal);font-weight:600;">구독 중</span>'
                   : '<span style="color:var(--text3);">참여 가능</span>'
    const subCnt   = ch.subscriber_count || 0
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:13px;color:#EF4444;margin-left:4px;"></i>' : ''
    return `<div class="ch-all-tile" onclick="App.openChannelDetail(${ch.id},'${name.replace(/'/g,"\'")}')">
      ${avatar(name, ch.image_url, 44)}
      <div class="info">
        <div class="ch-name" style="display:flex;align-items:center;flex-wrap:nowrap;overflow:hidden;">${name.replace(/</g,'&lt;')} ${lockIcon} <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px;white-space:nowrap;"><i class="fas fa-user" style="font-size:10px;"></i> ${subCnt}</span></div>
        <div class="ch-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${subLabel}</div>
      </div>
      <i class="fas fa-chevron-right chevron"></i>
    </div>`
  },

  // 채널 목록 렌더링 (검색 결과용)
  _renderChannelList(list, isCodeSearch = false) {
    const el = document.getElementById('channel-list-search')
    if (!el) return
    if (!list.length) {
      el.innerHTML = isCodeSearch
        ? '<div class="empty-box">일치하는 채널 코드가 없습니다.</div>'
        : '<div class="empty-box">검색 결과가 없습니다.</div>'
      return
    }
    el.innerHTML = `<div class="ch-all-list-wrap">${list.map(ch => this._channelTileHtml(ch)).join('')}</div>`
  },

  // 검색 입력 핸들러 (실시간 필터링)
  onChannelSearch(value) {
    const clr        = document.getElementById('channel-search-clear')
    const searchEl   = document.getElementById('channel-list-search')
    const popularSec = document.getElementById('channel-section-popular')
    const bestSec    = document.getElementById('channel-section-best')
    if (clr) clr.style.display = value ? 'block' : 'none'

    if (!value.trim()) {
      // 검색어 없으면 섹션 다시 보이기
      if (searchEl)   searchEl.style.display   = 'none'
      if (popularSec) popularSec.style.display = 'block'
      if (bestSec)    bestSec.style.display    = 'block'
      return
    }

    // 검색 중에는 섹션 숨기고 검색 결과만 표시
    if (searchEl)   searchEl.style.display   = 'block'
    if (popularSec) popularSec.style.display = 'none'
    if (bestSec)    bestSec.style.display    = 'none'

    const list = window._allChannelList || []
    const q    = value.trim()

    // 코드 검색: public_id 완전 일치 (대소문자 무시)
    const codeMatch = list.filter(ch =>
      ch.public_id && ch.public_id.toLowerCase() === q.toLowerCase()
    )
    if (codeMatch.length) {
      this._renderChannelList(codeMatch, true)
      return
    }

    // 채널명 검색: 부분 일치
    const filtered = list.filter(ch => (ch.name || '').toLowerCase().includes(q.toLowerCase()))
    this._renderChannelList(filtered, false)
  },

  // 검색창 초기화 버튼
  clearChannelSearch() {
    const inp        = document.getElementById('channel-search-input')
    const clr        = document.getElementById('channel-search-clear')
    const searchEl   = document.getElementById('channel-list-search')
    const popularSec = document.getElementById('channel-section-popular')
    const bestSec    = document.getElementById('channel-section-best')
    if (inp) { inp.value = ''; inp.focus() }
    if (clr) clr.style.display = 'none'
    if (searchEl)   searchEl.style.display   = 'none'
    if (popularSec) popularSec.style.display = 'block'
    if (bestSec)    bestSec.style.display    = 'block'
  },

  // ══════════════════════════════════════════════════════════════
  // 수신함 / 발신함  —  MessageList (state 기반)
  //   _inboxItems[]  / _outboxItems[]  : 서버에서 받은 아이템 배열 (source of truth)
  //   _inboxSelectedIds / _outboxSelectedIds : Set<number>  선택된 id
  //   모든 렌더링은 state → DOM  단방향으로만 수행
  // ══════════════════════════════════════════════════════════════

  // ── 상태 초기화 ────────────────────────────────────────────
  _inboxItems:       [],
  _inboxHasMore:     false,
  _inboxNextOffset:  0,
  _inboxChannelFilter: '',
  _inboxSelectedIds: new Set(),
  _inboxEditMode:    false,

  _outboxItems:       [],
  _outboxHasMore:     false,
  _outboxNextOffset:  0,
  _outboxChannelFilter: '',
  _outboxSelectedIds: new Set(),
  _outboxEditMode:    false,

  // ── 공통 아이콘/상태 맵 ────────────────────────────────────
  _msgIconMap: {
    youtube: '<i class="fab fa-youtube" style="color:#FF0000;font-size:20px;"></i>',
    audio:   '<i class="fas fa-music"   style="color:#4FC3F7;font-size:20px;"></i>',
    video:   '<i class="fas fa-video"   style="color:#66BB6A;font-size:20px;"></i>',
    file:    '<i class="fas fa-file"    style="color:#90A4AE;font-size:20px;"></i>'
  },
  _statusLabelMap: { pending:'대기', received:'확인중', accepted:'수락', rejected:'거절', timeout:'미수신', failed:'미수신' },
  _statusColorMap: { pending:'#90A4AE', received:'#4FC3F7', accepted:'#66BB6A', rejected:'#FF5252', timeout:'#FFA726', failed:'#FFA726' },

  // ══════════════════════════════════════════════════════════════
  // 수신함
  // ══════════════════════════════════════════════════════════════

  // ── 수신함 렌더 (state → DOM, 단일 진실 원천) ──────────────
  _renderInbox() {
    const channelEl = document.getElementById('inbox-channel-list')
    if (!channelEl) return

    // 채널 필터: _inboxChannels 기반으로 항상 표시
    // (삭제 시에만 deleteSelectedInbox에서 _inboxChannels를 직접 제거)
    const filterEl = document.getElementById('inbox-filter')
    if (filterEl) {
      filterEl.innerHTML = this._buildChannelFilter(this._inboxChannels || [], this._inboxChannelFilter, 'App.loadInbox')
    }

    const items = this._inboxItems
    if (!items.length) {
      channelEl.innerHTML = '<div class="empty-box">받은 알람이 없습니다.</div>'
      return
    }

    const rows = items.map(item => {
      const typeIcon = this._msgIconMap[item.msg_type] || '<i class="fas fa-bell" style="color:#90A4AE;font-size:20px;"></i>'
      const timeStr  = this._fmtAlarmTime(item.scheduled_at || item.received_at)
      const stLabel  = this._statusLabelMap[item.status] || item.status
      const stColor  = this._statusColorMap[item.status] || '#90A4AE'
      const chImg    = item.channel_image
        ? `<img src="${item.channel_image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<span style="font-size:11px;font-weight:700;">${(item.channel_name||'?').charAt(0).toUpperCase()}</span>`
      const isChecked = this._inboxSelectedIds.has(item.id)
      return `<div class="alarm-list-row" data-item-id="${item.id}" style="cursor:pointer;">
        <div class="inbox-item-check" style="display:${this._inboxEditMode ? 'flex' : 'none'};flex-shrink:0;padding-right:8px;align-items:center;" onclick="event.stopPropagation()">
          <input type="checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} onchange="App._onInboxCheckChange(${item.id},this.checked)" style="width:18px;height:18px;cursor:pointer;">
        </div>
        <div style="display:flex;align-items:center;flex:1;gap:0;" onclick="App.openAlarmContent(${item.id},${item.channel_id},'${(item.channel_name||'').replace(/'/g,"&#39;")}','${item.msg_type||''}','${(item.msg_value||'').replace(/'/g,"&#39;")}','${(item.link_url||'').replace(/'/g,"&#39;")}','inbox')">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;margin-right:8px;">${chImg}</div>
          <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:8px;">${typeIcon}</div>
          <span class="alarm-list-channel">${item.channel_name}</span>
          <span class="alarm-list-time">${timeStr}</span>
          <span class="alarm-list-status" style="color:${stColor};">${stLabel}</span>
        </div>
      </div>`
    }).join('')

    const moreBtn = this._inboxHasMore
      ? `<button id="inbox-more-btn" onclick="App.loadInbox('${this._inboxChannelFilter}',${this._inboxNextOffset})" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--primary);font-size:14px;font-weight:600;cursor:pointer;"><i class="fas fa-plus-circle" style="margin-right:6px;"></i>더보기</button>`
      : ''
    channelEl.innerHTML = `<div id="inbox-items">${rows}</div><div id="inbox-more-wrap" style="padding:12px 16px 4px;">${moreBtn}</div>`
  },

  // ── 체크박스 변경 핸들러 ───────────────────────────────────
  _onInboxCheckChange(id, checked) {
    if (checked) this._inboxSelectedIds.add(id)
    else this._inboxSelectedIds.delete(id)
    this._updateInboxSelectedCount()
  },

  // ── 수신함 로드 ────────────────────────────────────────────
  async loadInbox(channelId = '', offset = 0) {
    const channelEl = document.getElementById('inbox-channel-list')
    const detailView = document.getElementById('inbox-detail-view')
    if (!channelEl) return
    channelEl.style.display = 'block'
    if (detailView) detailView.style.display = 'none'

    const LIMIT = 20
    const isFirst = offset === 0
    // cacheKey를 함수 스코프로 선언 (try 블록에서도 접근 가능)
    const cacheKey = 'inbox_' + (channelId || 'all')

    if (isFirst) {
      this._inboxChannelFilter = channelId

      // 캐시 확인 (stale-while-revalidate)
      const _cacheKey = cacheKey // 이미 위에서 선언됨
      const uid = Store.getUserId()
      const preloadCached = (!channelId) ? Cache.get('inbox_items_' + uid) : null
      const cached = Cache.get(_cacheKey) || (preloadCached
        ? { data: preloadCached.items, channels: Cache.get('inbox_channels_' + uid) || [], hasMore: preloadCached.hasMore, nextOffset: preloadCached.nextOffset }
        : null)

      if (cached) {
        // 전체 조회일 때만 채널 목록 갱신 (필터 조회 시 기존 전체 채널 목록 유지)
        if (!channelId && cached.channels) this._inboxChannels = cached.channels
        // state 업데이트 → 즉시 렌더
        this._inboxItems      = cached.data || []
        this._inboxHasMore    = cached.hasMore ?? false
        this._inboxNextOffset = (cached.data || []).length
        this._inboxSelectedIds.clear()
        this._renderInbox()
        // 백그라운드 재검증
        this._fetchInboxBg(channelId, _cacheKey, channelEl)
        return
      }
      // 캐시 없으면 스피너
      this._inboxItems = []
      channelEl.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    } else {
      // 더보기 버튼 로딩
      const moreBtn = document.getElementById('inbox-more-btn')
      if (moreBtn) { moreBtn.innerHTML = '<i class="fas fa-spinner spin"></i> 불러오는 중...'; moreBtn.disabled = true }
    }

    try {
      const params = `limit=${LIMIT}&offset=${offset}` + (channelId ? `&channel_id=${encodeURIComponent(channelId)}` : '')
      console.log('[inbox] GET /alarms/inbox?' + params)
      const res = await apiWithTimeout(API.get(`/alarms/inbox?${params}`))
      const resData = res.data
      if (!resData.success) {
        console.error('[inbox] API error:', resData.error)
        throw new Error(resData.error || 'API error')
      }

      // 전체 조회일 때만 채널 목록 갱신 (필터 조회 시 기존 전체 채널 목록 유지)
      if (isFirst && !channelId && resData.channels) this._inboxChannels = resData.channels
      if (isFirst) {
        // state 완전 교체
        this._inboxItems      = resData.data || []
        this._inboxHasMore    = resData.hasMore ?? false
        this._inboxNextOffset = (resData.data || []).length
        this._inboxSelectedIds.clear()
        Cache.set(cacheKey, { ...resData })
      } else {
        // 더보기: state에 append
        this._inboxItems      = [...this._inboxItems, ...(resData.data || [])]
        this._inboxHasMore    = resData.hasMore ?? false
        this._inboxNextOffset = this._inboxItems.length
      }
      this._renderInbox()
    } catch(e) {
      console.error('[inbox] load failed:', e)
      if (isFirst) channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
      if (e.message === 'timeout') toast('네트워크가 느립니다. 다시 시도해주세요.')
    }
  },

  // ── 수신함 백그라운드 재검증 ───────────────────────────────
  async _fetchInboxBg(channelId, cacheKey, channelEl) {
    try {
      const params = `limit=20&offset=0` + (channelId ? `&channel_id=${channelId}` : '')
      const res = await API.get(`/alarms/inbox?${params}`)
      const resData = res.data
      if (!resData.success) return
      // 전체 조회일 때만 채널 목록 갱신
      const _bgChannelId = new URLSearchParams(params.split('?')[1] || params).get('channel_id') || ''
      if (!_bgChannelId && resData.channels) this._inboxChannels = resData.channels
      Cache.set(cacheKey, { ...resData })
      // 현재 inbox 탭이고, 상세뷰 닫혔을 때만 state 교체 후 렌더
      const dv = document.getElementById('inbox-detail-view')
      if (currentTab === 'inbox' && (!dv || dv.style.display === 'none')) {
        this._inboxItems      = resData.data || []
        this._inboxHasMore    = resData.hasMore ?? false
        this._inboxNextOffset = (resData.data || []).length
        this._renderInbox()
      }
    } catch(_) {}
  },

  // ── 수신함 선택 삭제 ──────────────────────────────────────
  async deleteSelectedInbox() {
    const log_ids = Array.from(this._inboxSelectedIds)
    if (!log_ids.length) { toast('삭제할 항목을 선택하세요'); return }
    try {
      const res = await API.post('/alarms/inbox/bulk-delete', { log_ids })
      if (!res.data?.success) throw new Error(res.data?.error || '삭제 실패')

      // ① state에서 즉시 제거
      const delSet = new Set(log_ids)
      this._inboxItems = this._inboxItems.filter(item => !delSet.has(item.id))
      this._inboxSelectedIds.clear()

      // ① 삭제 후 _inboxChannels에서도 더 이상 items가 없는 채널 제거
      if (this._inboxChannels) {
        const remainChIds = new Set(this._inboxItems.map(it => String(it.channel_id)))
        this._inboxChannels = this._inboxChannels.filter(ch => remainChIds.has(String(ch.id)))
        // 현재 필터 채널이 완전히 삭제됐으면 전체로 리셋
        if (this._inboxChannelFilter && !remainChIds.has(String(this._inboxChannelFilter))) {
          this._inboxChannelFilter = ''
        }
      }

      // ② 선택 모드 종료
      this._inboxEditMode = false
      const bar = document.getElementById('inbox-action-bar')
      const btn = document.getElementById('inbox-edit-btn')
      if (bar) bar.style.display = 'none'
      if (btn) btn.style.color = 'var(--text3)'
      const checkAll = document.getElementById('inbox-check-all')
      if (checkAll) checkAll.checked = false
      this._updateInboxSelectedCount()

      // ③ 즉시 렌더 (state 기반)
      this._renderInbox()

      // ④ 성공 토스트
      toast(log_ids.length + '개 삭제되었습니다')

      // ⑤ 캐시 무효화
      this._invalidateInboxCache()

      // ⑥ 백그라운드 재검증 (서버 정합성 보장, 화면은 이미 갱신됨)
      this._fetchInboxBg(this._inboxChannelFilter, 'inbox_' + (this._inboxChannelFilter || 'all'), document.getElementById('inbox-channel-list'))

    } catch(e) {
      toast('삭제 실패: ' + (e.response?.data?.error || e.message || '다시 시도해주세요'))
    }
  },

  // ── 수신함 편집 모드 ──────────────────────────────────────
  toggleInboxEditMode() {
    this._inboxEditMode = !this._inboxEditMode
    this._inboxSelectedIds.clear()
    const bar = document.getElementById('inbox-action-bar')
    const btn = document.getElementById('inbox-edit-btn')
    if (bar) bar.style.display = this._inboxEditMode ? 'flex' : 'none'
    if (btn) btn.style.color = this._inboxEditMode ? 'var(--primary)' : 'var(--text3)'
    const checkAll = document.getElementById('inbox-check-all')
    if (checkAll) checkAll.checked = false
    this._updateInboxSelectedCount()
    // 편집모드 진입/종료 시 체크박스 표시 토글 (re-render)
    this._renderInbox()
  },

  toggleInboxCheckAll(checked) {
    if (checked) {
      this._inboxItems.forEach(item => this._inboxSelectedIds.add(item.id))
    } else {
      this._inboxSelectedIds.clear()
    }
    this._renderInbox()
    this._updateInboxSelectedCount()
  },

  _updateInboxSelectedCount() {
    const el = document.getElementById('inbox-selected-count')
    if (el) el.textContent = this._inboxSelectedIds.size + '개 선택'
  },

  _setupInfiniteScroll(type) {}, // 더보기 버튼 방식 유지 (하위 호환)
  inboxOpenChannel(group) {},

  inboxBack() {
    const channelEl = document.getElementById('inbox-channel-list')
    const dv = document.getElementById('inbox-detail-view')
    if (channelEl) channelEl.style.display = 'block'
    if (dv) dv.style.display = 'none'
  },

  // ══════════════════════════════════════════════════════════════
  // 캐시 무효화
  // ══════════════════════════════════════════════════════════════

  _invalidateInboxCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ringo_cache_inbox_'))
    keys.forEach(k => localStorage.removeItem(k))
    Cache._mem && Object.keys(Cache._mem).filter(k => k.startsWith('inbox_')).forEach(k => delete Cache._mem[k])
  },

  _invalidateOutboxCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ringo_cache_outbox_'))
    keys.forEach(k => localStorage.removeItem(k))
    Cache._mem && Object.keys(Cache._mem).filter(k => k.startsWith('outbox_')).forEach(k => delete Cache._mem[k])
  },

  _invalidateAllFeedCache() {
    this._invalidateInboxCache()
    this._invalidateOutboxCache()
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith('ringo_cache_home_') ||
      k.startsWith('ringo_cache_channels') ||
      k.startsWith('ringo_cache_notices')
    )
    keys.forEach(k => localStorage.removeItem(k))
    Cache._mem && Object.keys(Cache._mem).filter(k =>
      k.startsWith('home_') || k.startsWith('channels') || k.startsWith('notices')
    ).forEach(k => delete Cache._mem[k])
  },

  // ══════════════════════════════════════════════════════════════
  // 발신함
  // ══════════════════════════════════════════════════════════════

  // ── 발신함 렌더 (state → DOM) ─────────────────────────────
  _renderOutbox() {
    const channelEl = document.getElementById('outbox-channel-list')
    if (!channelEl) return

    // 채널 필터: _outboxChannels 기반으로 항상 표시
    const filterEl = document.getElementById('outbox-filter')
    if (filterEl) {
      filterEl.innerHTML = this._buildChannelFilter(this._outboxChannels || [], this._outboxChannelFilter, 'App.loadSend')
    }

    const items = this._outboxItems
    if (!items.length) {
      channelEl.innerHTML = '<div class="empty-box">발신한 알람이 없습니다.</div>'
      return
    }

    const iconMap    = this._msgIconMap
    const statusMap  = { pending:'대기', received:'확인중', accepted:'수락', rejected:'거절', timeout:'미수신', failed:'미수신' }
    const statusColor= { pending:'#90A4AE', received:'#4FC3F7', accepted:'#66BB6A', rejected:'#FF5252', timeout:'#FFA726', failed:'#FFA726' }
    const rows = items.map(item => {
      const typeIcon = iconMap[item.msg_type] || '<i class="fas fa-bell" style="color:#90A4AE;font-size:20px;"></i>'
      const timeStr  = this._fmtAlarmTime(item.scheduled_at || item.sent_at)
      const stLabel  = statusMap[item.status] || item.status
      const stColor  = statusColor[item.status] || '#90A4AE'
      const chImg    = item.channel_image
        ? `<img src="${item.channel_image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<span style="font-size:11px;font-weight:700;">${(item.channel_name||'?').charAt(0).toUpperCase()}</span>`
      const isChecked = this._outboxSelectedIds.has(item.id)
      return `<div class="alarm-list-row" data-item-id="${item.id}" style="cursor:pointer;">
        <div class="outbox-item-check" style="display:${this._outboxEditMode ? 'flex' : 'none'};flex-shrink:0;padding-right:8px;align-items:center;" onclick="event.stopPropagation()">
          <input type="checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} onchange="App._onOutboxCheckChange(${item.id},this.checked)" style="width:18px;height:18px;cursor:pointer;">
        </div>
        <div style="display:flex;align-items:center;flex:1;gap:0;" onclick="App.openAlarmContent(${item.id},${item.channel_id},'${(item.channel_name||'').replace(/'/g,"&#39;")}','${item.msg_type||''}','${(item.msg_value||'').replace(/'/g,"&#39;")}','${(item.link_url||'').replace(/'/g,"&#39;")}','send')">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;margin-right:8px;">${chImg}</div>
          <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:8px;">${typeIcon}</div>
          <span class="alarm-list-channel">${item.channel_name}</span>
          <span class="alarm-list-time">${timeStr}</span>
          <span class="alarm-list-status" style="color:${stColor};">${stLabel}</span>
        </div>
      </div>`
    }).join('')

    const moreBtn = this._outboxHasMore
      ? `<button id="outbox-more-btn" onclick="App.loadSend('${this._outboxChannelFilter}',${this._outboxNextOffset})" style="width:100%;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;color:var(--primary);font-size:14px;font-weight:600;cursor:pointer;"><i class="fas fa-plus-circle" style="margin-right:6px;"></i>더보기</button>`
      : ''
    channelEl.innerHTML = `<div id="outbox-items">${rows}</div><div id="outbox-more-wrap" style="padding:12px 16px 4px;">${moreBtn}</div>`
  },

  _onOutboxCheckChange(id, checked) {
    if (checked) this._outboxSelectedIds.add(id)
    else this._outboxSelectedIds.delete(id)
    this._updateOutboxSelectedCount()
  },

  // ── 발신함 로드 ────────────────────────────────────────────
  async loadSend(channelId = '', offset = 0) {
    const channelEl = document.getElementById('outbox-channel-list')
    const detailView = document.getElementById('outbox-detail-view')
    if (!channelEl) return
    channelEl.style.display = 'block'
    if (detailView) detailView.style.display = 'none'

    const LIMIT = 20
    const isFirst = offset === 0
    // cacheKey를 함수 스코프로 선언 (try 블록에서도 접근 가능)
    const cacheKey = 'outbox_' + (channelId || 'all')

    if (isFirst) {
      this._outboxChannelFilter = channelId

      const uid = Store.getUserId()
      const preloadCached = (!channelId) ? Cache.get('outbox_items_' + uid) : null
      const cached = Cache.get(cacheKey) || (preloadCached
        ? { data: preloadCached.items, channels: Cache.get('outbox_channels_' + uid) || [], hasMore: preloadCached.hasMore, nextOffset: preloadCached.nextOffset }
        : null)

      if (cached) {
        // 전체 조회일 때만 채널 목록 갱신
        if (!channelId && cached.channels) this._outboxChannels = cached.channels
        this._outboxItems      = cached.data || []
        this._outboxHasMore    = cached.hasMore ?? false
        this._outboxNextOffset = (cached.data || []).length
        this._outboxSelectedIds.clear()
        this._renderOutbox()
        this._fetchOutboxBg(channelId, cacheKey, channelEl)
        return
      }
      this._outboxItems = []
      channelEl.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    } else {
      const moreBtn = document.getElementById('outbox-more-btn')
      if (moreBtn) { moreBtn.innerHTML = '<i class="fas fa-spinner spin"></i> 불러오는 중...'; moreBtn.disabled = true }
    }

    try {
      const params = `limit=${LIMIT}&offset=${offset}` + (channelId ? `&channel_id=${encodeURIComponent(channelId)}` : '')
      console.log('[outbox] GET /alarms/outbox?' + params)
      const res = await apiWithTimeout(API.get(`/alarms/outbox?${params}`))
      const resData = res.data
      if (!resData.success) {
        console.error('[outbox] API error:', resData.error)
        throw new Error(resData.error || 'API error')
      }

      // 전체 조회일 때만 채널 목록 갱신
      if (isFirst && !channelId && resData.channels) this._outboxChannels = resData.channels
      if (isFirst) {
        this._outboxItems      = resData.data || []
        this._outboxHasMore    = resData.hasMore ?? false
        this._outboxNextOffset = (resData.data || []).length
        this._outboxSelectedIds.clear()
        Cache.set(cacheKey, { ...resData })
      } else {
        this._outboxItems      = [...this._outboxItems, ...(resData.data || [])]
        this._outboxHasMore    = resData.hasMore ?? false
        this._outboxNextOffset = this._outboxItems.length
      }
      this._renderOutbox()
    } catch(e) {
      console.error('[outbox] load failed:', e)
      if (isFirst) channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
      if (e.message === 'timeout') toast('네트워크가 느립니다. 다시 시도해주세요.')
    }
  },

  // ── 발신함 백그라운드 재검증 ───────────────────────────────
  async _fetchOutboxBg(channelId, cacheKey, channelEl) {
    try {
      const params = `limit=20&offset=0` + (channelId ? `&channel_id=${channelId}` : '')
      const res = await API.get(`/alarms/outbox?${params}`)
      const resData = res.data
      if (!resData.success) return
      // 전체 조회일 때만 채널 목록 갱신
      if (!channelId && resData.channels) this._outboxChannels = resData.channels
      Cache.set(cacheKey, { ...resData })
      const dv = document.getElementById('outbox-detail-view')
      if (currentTab === 'send' && (!dv || dv.style.display === 'none')) {
        this._outboxItems      = resData.data || []
        this._outboxHasMore    = resData.hasMore ?? false
        this._outboxNextOffset = (resData.data || []).length
        this._renderOutbox()
      }
    } catch(_) {}
  },

  // ── 발신함 선택 삭제 ──────────────────────────────────────
  async deleteSelectedOutbox() {
    const log_ids = Array.from(this._outboxSelectedIds)
    if (!log_ids.length) { toast('삭제할 항목을 선택하세요'); return }
    try {
      const res = await API.post('/alarms/outbox/bulk-delete', { log_ids })
      if (!res.data?.success) throw new Error(res.data?.error || '삭제 실패')

      // ① state에서 즉시 제거
      const delSet = new Set(log_ids)
      this._outboxItems = this._outboxItems.filter(item => !delSet.has(item.id))
      this._outboxSelectedIds.clear()

      // ① 삭제 후 _outboxChannels에서도 더 이상 items가 없는 채널 제거
      if (this._outboxChannels) {
        const remainChIds = new Set(this._outboxItems.map(it => String(it.channel_id)))
        this._outboxChannels = this._outboxChannels.filter(ch => remainChIds.has(String(ch.id)))
        if (this._outboxChannelFilter && !remainChIds.has(String(this._outboxChannelFilter))) {
          this._outboxChannelFilter = ''
        }
      }

      // ② 선택 모드 종료
      this._outboxEditMode = false
      const bar = document.getElementById('outbox-action-bar')
      const btn = document.getElementById('outbox-edit-btn')
      if (bar) bar.style.display = 'none'
      if (btn) btn.style.color = 'var(--text3)'
      const checkAll = document.getElementById('outbox-check-all')
      if (checkAll) checkAll.checked = false
      this._updateOutboxSelectedCount()

      // ③ 즉시 렌더
      this._renderOutbox()

      // ④ 성공 토스트
      toast(log_ids.length + '개 삭제되었습니다')

      // ⑤ 캐시 무효화
      this._invalidateOutboxCache()

      // ⑥ 백그라운드 재검증
      this._fetchOutboxBg(this._outboxChannelFilter, 'outbox_' + (this._outboxChannelFilter || 'all'), document.getElementById('outbox-channel-list'))

    } catch(e) {
      toast('삭제 실패: ' + (e.response?.data?.error || e.message || '다시 시도해주세요'))
    }
  },

  // ── 발신함 편집 모드 ──────────────────────────────────────
  toggleOutboxEditMode() {
    this._outboxEditMode = !this._outboxEditMode
    this._outboxSelectedIds.clear()
    const bar = document.getElementById('outbox-action-bar')
    const btn = document.getElementById('outbox-edit-btn')
    if (bar) bar.style.display = this._outboxEditMode ? 'flex' : 'none'
    if (btn) btn.style.color = this._outboxEditMode ? 'var(--primary)' : 'var(--text3)'
    const checkAll = document.getElementById('outbox-check-all')
    if (checkAll) checkAll.checked = false
    this._updateOutboxSelectedCount()
    this._renderOutbox()
  },

  toggleOutboxCheckAll(checked) {
    if (checked) {
      this._outboxItems.forEach(item => this._outboxSelectedIds.add(item.id))
    } else {
      this._outboxSelectedIds.clear()
    }
    this._renderOutbox()
    this._updateOutboxSelectedCount()
  },

  _updateOutboxSelectedCount() {
    const el = document.getElementById('outbox-selected-count')
    if (el) el.textContent = this._outboxSelectedIds.size + '개 선택'
  },

  outboxOpenChannel(group) {},

  outboxBack() {
    const channelEl = document.getElementById('outbox-channel-list')
    const dv = document.getElementById('outbox-detail-view')
    if (channelEl) channelEl.style.display = 'block'
    if (dv) dv.style.display = 'none'
  },

  // ── 레거시 호환용 래퍼 (기존 HTML onclick에서 호출될 수 있음) ──
  _renderInboxItems(resData, channelEl, channelId, isFirst) {
    // state 기반 렌더로 이관됨 — 기존 호출 시 state 교체 후 renderInbox 호출
    if (isFirst) {
      // 전체 조회일 때만 채널 목록 갱신
      if (!channelId && resData.channels) this._inboxChannels = resData.channels
      this._inboxItems      = resData.data || []
      this._inboxHasMore    = resData.hasMore ?? false
      this._inboxNextOffset = (resData.data || []).length
      this._inboxChannelFilter = channelId || ''
    } else {
      this._inboxItems      = [...this._inboxItems, ...(resData.data || [])]
      this._inboxHasMore    = resData.hasMore ?? false
      this._inboxNextOffset = this._inboxItems.length
    }
    this._renderInbox()
  },

  _renderOutboxItems(resData, channelEl, channelId, isFirst) {
    if (isFirst) {
      // 전체 조회일 때만 채널 목록 갱신
      if (!channelId && resData.channels) this._outboxChannels = resData.channels
      this._outboxItems      = resData.data || []
      this._outboxHasMore    = resData.hasMore ?? false
      this._outboxNextOffset = (resData.data || []).length
      this._outboxChannelFilter = channelId || ''
    } else {
      this._outboxItems      = [...this._outboxItems, ...(resData.data || [])]
      this._outboxHasMore    = resData.hasMore ?? false
      this._outboxNextOffset = this._outboxItems.length
    }
    this._renderOutbox()
  },

  // 수신함/발신함 알람 클릭 → 컨텐츠 재생 전용 페이지 표시
  async openAlarmContent(logId, channelId, channelName, msgType, msgValue, linkUrl, source) {

    // 1. 채널 최신 정보 조회
    let currentName  = channelName
    let currentImage = ''
    try {
      const chRes = await API.get(`/channels/${channelId}`)
      const ch = chRes.data?.data ?? chRes.data
      if (ch && ch.name)      currentName  = ch.name
      if (ch && ch.image_url) currentImage = ch.image_url
    } catch(e) {}

    // 2. 상태 업데이트 (수신함만) + 캐시 무효화
    if (logId && source === 'inbox') {
      try { await API.post(`/alarms/inbox/${logId}/status`, { status: 'accepted' }) } catch(e) {}
      // 열람으로 상태 변경됐으므로 inbox 캐시 무효화
      this._invalidateInboxCache()
    }

    // 3. Flutter 앱이면 ContentPlayerActivity 실행
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({
        action:        'open_content_player',
        msg_type:      msgType    || '',
        msg_value:     msgValue   || '',
        channel_name:  currentName,
        channel_image: currentImage,
        link_url:      linkUrl    || ''
      }))
      return
    }

    // 4. 웹 브라우저 fallback: 웹 재생 페이지
    const screen = document.getElementById('screen-content-player')
    if (!screen) return

    const nameEl   = document.getElementById('cp-channel-name')
    const avatarEl = document.getElementById('cp-channel-avatar')
    if (nameEl) nameEl.textContent = currentName
    if (avatarEl) {
      avatarEl.innerHTML = currentImage
        ? `<img src="${currentImage}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`
        : `<span style="font-size:18px;font-weight:700;">${currentName.charAt(0).toUpperCase()}</span>`
    }

    const linkBtn = document.getElementById('cp-link-btn')
    if (linkBtn) {
      if (linkUrl) { linkBtn.style.display = 'flex'; linkBtn.dataset.url = linkUrl }
      else         { linkBtn.style.display = 'none' }
    }

    const ytFrame   = document.getElementById('cp-youtube-frame')
    const videoEl   = document.getElementById('cp-video-player')
    const audioEl   = document.getElementById('cp-audio-player')
    const audioWrap = document.getElementById('cp-audio-wrap')
    if (ytFrame)   { ytFrame.style.display = 'none'; ytFrame.src = '' }
    if (videoEl)   { videoEl.style.display = 'none'; videoEl.src = ''; videoEl.pause?.() }
    if (audioEl)   { audioEl.src = ''; audioEl.pause?.() }
    if (audioWrap) audioWrap.classList.remove('active')

    if (msgType === 'youtube' && msgValue) {
      let videoId = ''
      try { const u = new URL(msgValue); videoId = u.searchParams.get('v') || u.pathname.split('/').pop() || '' }
      catch(e) { videoId = msgValue }
      if (ytFrame) { ytFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`; ytFrame.style.display = 'block' }
    } else if (msgType === 'video' && msgValue) {
      if (videoEl) { videoEl.src = msgValue; videoEl.style.display = 'block'; videoEl.play?.().catch(()=>{}) }
    } else if (msgType === 'audio' && msgValue) {
      if (audioEl && audioWrap) { audioEl.src = msgValue; audioWrap.classList.add('active'); audioEl.play?.().catch(()=>{}) }
    }

    screen.dataset.source = source
    screen.classList.add('active')
  },

  cpOpenLink() {
    const linkBtn = document.getElementById('cp-link-btn')
    const url = linkBtn?.dataset?.url
    if (!url) return
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'open_url', url }))
    } else {
      window.open(url, '_blank')
    }
  },

  closeContentPlayer() {
    const screen = document.getElementById('screen-content-player')
    if (!screen) return

    // 재생 중지
    const ytFrame = document.getElementById('cp-youtube-frame')
    const videoEl = document.getElementById('cp-video-player')
    const audioEl = document.getElementById('cp-audio-player')
    if (ytFrame) ytFrame.src = ''
    if (videoEl) { videoEl.pause?.(); videoEl.src = '' }
    if (audioEl) { audioEl.pause?.(); audioEl.src = '' }

    screen.classList.remove('active')

    // 돌아갈 탭 새로고침 (캐시 먼저 invalidate → 최신 상태 표시)
    const source = screen.dataset.source
    if (source === 'inbox') {
      this._invalidateInboxCache()
      this.loadInbox()
    } else if (source === 'outbox') {
      this._invalidateOutboxCache()
      this.loadSend()
    }
  },

  _buildChannelFilter(channels, selectedId, callbackFn) {
    if (!channels || channels.length === 0) return ''
    const allBtn = `<button onclick="${callbackFn}('')" class="ch-tab-btn ${!selectedId ? 'ch-tab-active' : ''}">전체</button>`
    const chBtns = channels.map(ch =>
      `<button onclick="${callbackFn}('${ch.id}')" class="ch-tab-btn ${String(ch.id) === String(selectedId) ? 'ch-tab-active' : ''}">${ch.name}</button>`
    ).join('')
    return `<div class="ch-tab-wrap">${allBtn}${chBtns}</div>`
  },

  _msgLabel(type) {
    return { youtube:'YouTube 알람', audio:'오디오 알람', video:'비디오 알람', file:'파일 알람' }[type] || '알람'
  },

  _fmtTime(isoStr) {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      const now = new Date()
      const diff = now - d
      if (diff < 60000)   return '방금'
      if (diff < 3600000) return Math.floor(diff/60000) + '분 전'
      if (diff < 86400000) return Math.floor(diff/3600000) + '시간 전'
      const mm = String(d.getMonth()+1).padStart(2,'0')
      const dd = String(d.getDate()).padStart(2,'0')
      const hh = String(d.getHours()).padStart(2,'0')
      const mi = String(d.getMinutes()).padStart(2,'0')
      return `${mm}/${dd} ${hh}:${mi}`
    } catch { return isoStr }
  },

  // 알람이 울리는 시간 - 절대시간 표시 (UTC → KST +9h)
  _fmtAlarmTime(isoStr) {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      // UTC 문자열이면 KST(+9) 보정
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
      const mm = String(kst.getUTCMonth()+1).padStart(2,'0')
      const dd = String(kst.getUTCDate()).padStart(2,'0')
      const hh = String(kst.getUTCHours()).padStart(2,'0')
      const mi = String(kst.getUTCMinutes()).padStart(2,'0')
      return `${mm}/${dd} ${hh}:${mi}`
    } catch { return isoStr }
  },

  // ── 설정 ────────────────────────────────
  loadSettings() {
    document.getElementById('settings-user-id').textContent  = Store.getUserId()
    const tok = Store.getFcmToken()
    document.getElementById('settings-fcm-token').textContent = tok.substring(0, 20) + '...'

    // 테마 토글 상태 반영
    const isDark = (localStorage.getItem('theme') || 'light') === 'dark'
    const toggleEl = document.getElementById('theme-toggle')
    const labelEl  = document.getElementById('theme-label')
    if (toggleEl) toggleEl.checked = isDark
    if (labelEl)  labelEl.textContent = isDark ? '다크' : '라이트'

    // 계정 정보 표시
    const emailEl = document.getElementById('settings-email')
    const nameEl  = document.getElementById('settings-display-name')
    if (emailEl) emailEl.textContent = Store.getEmail() || '(미설정)'
    if (nameEl)  nameEl.textContent  = Store.getDisplayName() || '(미설정)'

    // 저장된 전화번호 표시
    const phoneEl = document.getElementById('settings-phone')
    if (phoneEl) phoneEl.value = Store.get('phone_number') || ''

    // 드로어 이메일 업데이트
    const drawerEmail = document.getElementById('drawer-user-email')
    if (drawerEmail) drawerEmail.textContent = Store.getEmail() || Store.getDisplayName() || '로그인 중...'

    // 앱 버전 표시
    const versionEl = document.getElementById('app-version-label')
    const appVer = localStorage.getItem('app_version')
    if (versionEl) versionEl.textContent = appVer ? 'v' + appVer : 'v?'
  },

  // ── 전화번호 저장 ────────────────────────
  async savePhone() {
    const phoneEl = document.getElementById('settings-phone')
    const phone = phoneEl?.value.trim() || ''
    try {
      const res = await API.put('/auth/phone', { user_id: Store.getUserId(), phone_number: phone })
      if (res.data?.success) {
        Store.set('phone_number', phone)
        toast(phone ? `✅ 전화번호 저장: ${phone}` : '전화번호가 삭제됐습니다')
      } else {
        toast('저장 실패: ' + (res.data?.error || '오류'))
      }
    } catch(e) { toast('저장 오류: ' + e.message) }
  },

  async logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return
    try {
      await API.post('/auth/logout')
    } catch {}
    Store.clearSession()
    Cache.clear()  // 캐시 초기화
    // Flutter 앱에 로그아웃 알림 → 네이티브 로그인 화면으로 이동
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'logout' }))
    } else {
      // 웹 브라우저 환경 fallback
      toast('로그아웃 됐습니다')
      setTimeout(() => Auth.show(), 500)
    }
  },

  async deleteAccount() {
    if (!confirm('정말 탈퇴하시겠습니까?\n\n내 채널, 구독 채널, 모든 정보가 삭제되며\n복구할 수 없습니다.')) return
    const userId = Store.getUserId()
    const sessionToken = Store.getSessionToken()
    if (!userId || !sessionToken) { toast('로그인 정보가 없습니다'); return }
    try {
      await API.delete('/users/me', { data: { user_id: userId, session_token: sessionToken } })
    } catch(e) {
      toast('탈퇴 처리 중 오류가 발생했습니다')
      return
    }
    Store.clearSession()
    Cache.clear()  // 탈퇴 시 캐시 전체 초기화
    // Flutter 앱에 탈퇴 알림 → 계정 선택 화면으로 이동
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'logout' }))
    } else {
      toast('탈퇴가 완료되었습니다')
      setTimeout(() => Auth.show(), 500)
    }
  },

  showFcmToken() {
    const tok = Store.getFcmToken()
    if (confirm('FCM 토큰:\n\n' + tok + '\n\n클립보드에 복사할까요?')) {
      navigator.clipboard?.writeText(tok).then(() => toast('복사됐습니다'))
    }
  },

  resetDevice() {
    if (!confirm('모든 구독 정보와 사용자 ID가 초기화됩니다.\n계속하시겠습니까?')) return
    localStorage.clear(); toast('초기화 완료'); this.loadSettings(); this.loadHome()
  },

  // ── 채널 만들기 ──────────────────────────
  _emptyImgThumbHtml() {
    return '<div class="img-thumb-empty"><i class="fas fa-camera"></i><span>IMAGE</span></div>'
  },
  openCreateChannel() {
    selectedImg = null
    document.getElementById('create-name').value     = ''
    document.getElementById('create-desc').value     = ''
    document.getElementById('create-homepage').value = ''
    document.getElementById('create-password').value = ''
    document.getElementById('create-is-secret').value = '0'
    document.getElementById('create-secret-wrap').style.display = 'none'
    document.getElementById('create-name-cnt').textContent = '0/10'
    document.getElementById('create-desc-cnt').textContent = '0/50'
    document.getElementById('create-img-thumb').innerHTML = this._emptyImgThumbHtml()
    const picker = document.getElementById('create-img-picker')
    if (picker) picker.classList.remove('has-image')
    this._setLockUI('create', false)
    this.openModal('modal-create')
    setTimeout(() => document.getElementById('create-name').focus(), 300)
  },

  toggleSecretCreate(checked) {
    document.getElementById('create-is-secret').value = checked ? '1' : '0'
    document.getElementById('create-secret-wrap').style.display = checked ? 'block' : 'none'
    if (!checked) {
      document.getElementById('create-password').value = ''
    } else {
      setTimeout(() => {
        const pw = document.getElementById('create-password')
        if (pw) { pw.focus(); pw.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
      }, 80)
    }
    this._setLockUI('create', checked)
  },

  toggleSecretEdit(checked) {
    document.getElementById('edit-is-secret').value = checked ? '1' : '0'
    document.getElementById('edit-secret-wrap').style.display = checked ? 'block' : 'none'
    if (!checked) {
      document.getElementById('edit-password').value = ''
    } else {
      setTimeout(() => {
        const pw = document.getElementById('edit-password')
        if (pw) { pw.focus(); pw.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
      }, 80)
    }
    this._setLockUI('edit', checked)
  },
  _setLockUI(prefix, locked) {
    const toggle = document.getElementById(prefix + '-lock-toggle')
    const icon   = document.getElementById(prefix + '-lock-icon')
    const label  = document.getElementById(prefix + '-lock-label')
    const badge  = document.getElementById(prefix + '-lock-badge')
    if (!toggle) return
    if (locked) {
      toggle.classList.add('locked')
      icon.className   = 'fas fa-lock lock-icon locked'
      label.className  = 'lock-label locked'
      label.textContent = '비밀채널 설정됨'
      badge.className  = 'lock-badge locked'
      badge.textContent = 'ON'
    } else {
      toggle.classList.remove('locked')
      icon.className   = 'fas fa-lock-open lock-icon unlocked'
      label.className  = 'lock-label unlocked'
      label.textContent = '비밀채널 미설정'
      badge.className  = 'lock-badge unlocked'
      badge.textContent = 'OFF'
    }
  },


  async createChannel() {
    const name = document.getElementById('create-name').value.trim()
    const desc = document.getElementById('create-desc').value.trim()
    const isSecret = document.getElementById('create-is-secret').value === '1'
    const password = document.getElementById('create-password').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }
    const invalidChars = /[!@#$%^&*()+={}\[\]|\\/<>?~`"';:]/
    if (invalidChars.test(name)) { toast('채널명에 특수문자를 사용할 수 없습니다'); return }
    if (!desc) { toast('채널 소개를 입력하세요'); return }
    if (isSecret && !password) { toast('비밀채널은 비밀번호를 입력하세요'); return }

    try {
      const res = await API.post('/channels', {
        name, description: desc,
        homepage_url:  document.getElementById('create-homepage').value.trim() || null,
        image_url:     selectedImg || null,
        owner_id:      Store.getUserId(),
        is_secret:     isSecret ? 1 : 0,
        password:      isSecret ? password : null
      })
      if (res.data?.success || res.data?.data) {
        toast('채널이 생성되었습니다!')
        const newCh = res.data?.data
        // Optimistic update: 새 채널을 즉시 목록 앞에 추가
        if (newCh) {
          ownedChannels = [newCh, ...ownedChannels.filter(c => c.id !== newCh.id)]
        }
        // 캐시 무효화 (home + channels)
        Cache.del('home_' + Store.getUserId())
        Cache.del('channels')
        this.closeModal('modal-create')
        // ── 항목 6: channel_created 이벤트 발송 ──────────────
        document.dispatchEvent(new CustomEvent('channel_created', { detail: { channel: newCh } }))
        // 내 채널 화면으로 먼저 이동 (즉시 반영)
        this.goto('owned-all')
        // 백그라운드에서 서버 최신 목록으로 재검증 (항목 7: fetchMyChannels)
        this.fetchMyChannels()
      } else {
        toast(res.data?.error || '채널 생성에 실패했습니다', 3500)
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message
      if (e.response?.status === 409) {
        toast('이미 사용 중인 채널명입니다', 3500)
      } else {
        toast('오류: ' + msg, 3500)
      }
    }
  },

  // ── 채널 수정 ──────────────────────────
  async openEditChannel(id) {
    editChannelId = id
    selectedImg   = null
    // 채널 데이터 로드
    let ch = ownedChannels.find(c => c.id === id)
    if (!ch) {
      try { const r = await API.get('/channels/' + id); ch = r.data?.data } catch {}
    }
    if (!ch) { toast('채널 정보를 불러올 수 없습니다'); return }

    document.getElementById('edit-channel-id').value  = ch.id
    const editNameEl = document.getElementById('edit-name')
    editNameEl.value    = ch.name || ''
    editNameEl.readOnly = true
    editNameEl.classList.add('opacity-50', 'cursor-not-allowed')
    document.getElementById('edit-desc').value         = ch.description || ''
    document.getElementById('edit-homepage').value     = ch.homepage_url || ''
    document.getElementById('edit-password').value     = ''
    document.getElementById('edit-is-secret').value = ch.is_secret ? '1' : '0'
    document.getElementById('edit-secret-wrap').style.display = ch.is_secret ? 'block' : 'none'
    this._setLockUI('edit', !!ch.is_secret)

    const thumb = document.getElementById('edit-img-thumb')
    if (ch.image_url) {
      thumb.innerHTML = `<img src="${ch.image_url}" style="width:100%;height:100%;object-fit:cover;">`
    } else {
      const ec = avatarColor(ch.name)
      const ei = (ch.name || '?')[0].toUpperCase()
      thumb.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${ec};"><span style="font-size:28px;font-weight:700;color:#fff;">${ei}</span></div>`
    }
    this.openModal('modal-edit')
  },

  async saveEditChannel() {
    const id       = document.getElementById('edit-channel-id').value
    const isSecret = document.getElementById('edit-is-secret').value === '1'
    const password = document.getElementById('edit-password').value.trim()

    try {
      await API.put('/channels/' + id, {
        description:   document.getElementById('edit-desc').value.trim(),
        homepage_url:  document.getElementById('edit-homepage').value.trim() || null,
        is_secret:     isSecret ? 1 : 0,
        ...(isSecret && password ? { password } : {}),
        ...(!isSecret ? { remove_password: true } : {}),
        ...(selectedImg ? { image_url: selectedImg } : {})
      })
      toast('채널이 수정됐습니다')
      Cache.del('ch_detail_' + id)
      Cache.del('home_' + Store.getUserId())
      Cache.del('channels')
      // 채널 수정 시 수신함/발신함에도 채널 정보 표시되므로 함께 무효화
      this._invalidateInboxCache()
      this._invalidateOutboxCache()
      this.closeModal('modal-edit')
      this.loadHome()
      // 채널 소개 모달이 열려있으면 즉시 갱신
      const detailModal = document.getElementById('modal-channel-detail')
      if (detailModal && detailModal.classList.contains('active')) {
        this.openChannelDetail(id)
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message
      if (e.response?.status === 409) {
        toast('이미 사용 중인 채널명입니다', 3500)
      } else {
        toast('수정 실패: ' + msg, 3000)
      }
    }
  },


  _deleteChannelFromDetail(chId, name) {
    if (!confirm(`"${name}" 채널을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    API.delete('/channels/' + chId)
      .then(() => {
        toast('삭제됐습니다')
        // 채널 삭제 시 모든 관련 캐시 무효화 (내채널/구독채널/수신함/발신함 반영)
        this._invalidateAllFeedCache()
        Cache.del('ch_detail_' + chId)
        this.closeModal('modal-channel-detail')
        if (currentTab === 'owned-all') this.loadOwnedAll()
        else this.loadHome()
      })
      .catch(e => toast('삭제 실패: ' + e.message, 3000))
  },

  // ── 알람 설정 모달 ──────────────────────
  async openAlarmModal(chId, name) {
    currentAlarmChId = chId
    const titleEl = document.getElementById('alarm-modal-title')
    if (titleEl) titleEl.textContent = name + ' · 알람 설정'

    // 기본값 설정: 현재 시각 + 10분 (5분 단위 반올림)
    const now = new Date()
    const init = new Date(now.getTime() + 10 * 60 * 1000)  // 10분 뒤
    // 5분 단위로 올림
    const roundedMin = Math.ceil(init.getMinutes() / 5) * 5
    if (roundedMin >= 60) {
      init.setMinutes(0); init.setHours(init.getHours() + 1)
    } else {
      init.setMinutes(roundedMin)
    }
    alarmDate = new Date(init.getFullYear(), init.getMonth(), init.getDate())
    calYear   = alarmDate.getFullYear()
    calMonth  = alarmDate.getMonth()
    alarmHour = init.getHours()
    alarmMin  = init.getMinutes()

    // 소스 기본값 초기화 (미선택)
    alarmMsgSrc = ''
    window._selectedAlarmFile = null
    // YouTube URL 초기화
    App._clearYoutubeUrl()
    // 파일 표시 초기화
    App._clearFileDisplay()

    // 입력 초기화 (URL 입력창은 항상 활성화 상태)
    const ytUrl = document.getElementById('alarm-youtube-url')
    if (ytUrl) {
      ytUrl.value = ''
      ytUrl.readOnly = false
      ytUrl.style.color = ''
      ytUrl.placeholder = 'YouTube URL 붙여넣기 (https://youtube.com/...)'
    }
    // 모든 프리뷰 숨김 (하위 호환)
    ;['alarm-file-preview','alarm-audio-preview','alarm-video-preview'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.style.display = 'none'; el.innerHTML = '' }
    })

    // 연결 URL 초기화
    const linkUrl = document.getElementById('alarm-link-url')
    if (linkUrl) { linkUrl.value = ''; linkUrl.readOnly = false }
    const linkClear = document.getElementById('alarm-link-clear')
    if (linkClear) linkClear.style.display = 'none'
    const linkCheck = document.getElementById('alarm-link-same-as-homepage')
    if (linkCheck) linkCheck.checked = false

    this._renderDateLabel()
    this._renderTimeLabel()
    this.openModal('modal-alarm')

    // 기존 알람 목록 로드
    this._loadAlarmList(chId)
  },

  // 알람 상태(state) - 서버에서 받은 active 알람 목록 보관
  _alarmList: [],

  // 알람 목록 로드 및 표시 (state 기반 렌더링)
  async _loadAlarmList(chId) {
    const section     = document.getElementById('alarm-list-section')
    const body        = document.getElementById('alarm-list-body')
    const settingWrap = document.getElementById('alarm-setting-wrap')
    const bottomBtns  = document.getElementById('alarm-bottom-btns')
    if (!section || !body) return
    try {
      const res = await API.get('/alarms?channel_id=' + chId)
      console.log('[Alarm] GET /api/alarms?channel_id=' + chId, 'response:', res.data)
      // 서버가 이미 만료 알람을 자동 삭제하고 반환 → 클라이언트 재삭제 불필요
      // active 알람만 필터링 (서버 처리 보완용)
      const now = new Date()
      this._alarmList = (res.data?.data || []).filter(a =>
        (a.status === 'pending' || a.status === 'triggered') &&
        new Date(a.scheduled_at) >= now
      )
      this._renderAlarmList()
    } catch(e) {
      console.error('[Alarm] _loadAlarmList error:', e)
      if (section) section.style.display = 'none'
    }
  },

  // 알람 목록 state → DOM 렌더링
  _renderAlarmList() {
    const section     = document.getElementById('alarm-list-section')
    const body        = document.getElementById('alarm-list-body')
    const settingWrap = document.getElementById('alarm-setting-wrap')
    const bottomBtns  = document.getElementById('alarm-bottom-btns')
    if (!section || !body) return

    // 기존 "+ 알람 추가하기" 버튼 제거 (재렌더 시 중복 방지)
    document.getElementById('alarm-add-btn-wrap')?.remove()

    const list = this._alarmList
    if (list.length === 0) {
      // 알람 없음 → 목록 숨기고 설정 섹션 전체 표시
      section.style.display = 'none'
      if (settingWrap) settingWrap.style.display = ''
      if (bottomBtns)  bottomBtns.style.display  = ''
      return
    }

    // 알람 있음 → 목록 표시, 설정 섹션(콘텐츠/연결URL/날짜시간/확인버튼) 숨김
    section.style.display = 'block'
    if (settingWrap) settingWrap.style.display = 'none'
    if (bottomBtns)  bottomBtns.style.display  = 'none'

    const srcLabel = { youtube:'YouTube', audio:'오디오', video:'비디오', file:'파일' }
    body.innerHTML = list.map(alarm => {
      const dt      = new Date(alarm.scheduled_at)
      const dateStr = dt.toLocaleDateString('ko-KR', { month:'long', day:'numeric' })
      const timeStr = dt.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
      return `<div data-alarm-id="${alarm.id}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text);">⏰ ${dateStr} ${timeStr}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${srcLabel[alarm.msg_type] || alarm.msg_type} · 대상 ${alarm.total_targets}명</div>
        </div>
        <button onclick="App._cancelAlarm(${alarm.id})" style="background:rgba(255,59,48,0.15);border:none;border-radius:8px;padding:6px 12px;color:#FF3B30;font-size:12px;cursor:pointer;">
          <i class="fas fa-trash"></i> 삭제
        </button>
      </div>`
    }).join('')

    // "+ 알람 추가하기" 버튼 삽입 (3개 미만일 때만)
    if (list.length < 3) {
      const btnWrap = document.createElement('div')
      btnWrap.id = 'alarm-add-btn-wrap'
      btnWrap.style.cssText = 'padding:14px 14px 4px;'
      btnWrap.innerHTML = `<button onclick="App._showAlarmAddArea()" style="width:100%;padding:12px;border:2px dashed var(--teal,#00BCD4);border-radius:12px;background:transparent;color:var(--teal,#00BCD4);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
        <i class="fas fa-plus-circle"></i> 알람 추가하기
      </button>`
      section.appendChild(btnWrap)
    }
  },

  // "+ 알람 추가하기" 버튼 클릭 → 설정 섹션 전체 표시
  _showAlarmAddArea() {
    const settingWrap = document.getElementById('alarm-setting-wrap')
    const bottomBtns  = document.getElementById('alarm-bottom-btns')
    if (settingWrap) settingWrap.style.display = ''
    if (bottomBtns)  bottomBtns.style.display  = ''
    // "+ 알람 추가하기" 버튼 제거
    document.getElementById('alarm-add-btn-wrap')?.remove()
    // 부드럽게 스크롤
    setTimeout(() => settingWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  },

  // 알람 취소 (state 기반 즉시 반영)
  async _cancelAlarm(alarmId) {
    if (!confirm('이 알람을 삭제하시겠습니까?')) return

    console.log('[Alarm] DELETE /api/alarms/' + alarmId + '  (channel_id=' + currentAlarmChId + ')')

    // ① 삭제 버튼 즉시 비활성화 (중복 클릭 방지)
    const btn = document.querySelector(`[data-alarm-id="${alarmId}"] button`)
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5' }

    let success = false
    try {
      const res = await API.delete('/alarms/' + alarmId)
      console.log('[Alarm] DELETE result:', res.status, res.data)
      success = true
    } catch(e) {
      // 404 = 이미 삭제됨 → 성공 처리
      if (e.response && e.response.status === 404) {
        console.warn('[Alarm] 404 - already deleted, treating as success')
        success = true
      } else {
        console.error('[Alarm] DELETE error:', e)
        toast('삭제 실패: ' + (e.response?.data?.error || e.message), 3000)
        // 버튼 복구
        if (btn) { btn.disabled = false; btn.style.opacity = '' }
        return   // ③ 404가 아닌 에러 시 UI 갱신 금지
      }
    }

    if (!success) return

    // ② 성공 시에만 UI 갱신
    toast('알람이 삭제됐습니다')

    // state에서 즉시 제거 → 재렌더 (서버 재조회 불필요)
    this._alarmList = this._alarmList.filter(a => a.id !== alarmId)
    this._renderAlarmList()

    // 캐시 무효화
    Cache.del('home_' + Store.getUserId())
    Cache.del('ch_detail_' + currentAlarmChId)
    this._invalidateOutboxCache()

    // ownedChannels pending_alarm_count 즉시 갱신
    const oc = ownedChannels.find(c => c.id === currentAlarmChId)
    if (oc && oc.pending_alarm_count > 0) {
      oc.pending_alarm_count = Math.max(0, oc.pending_alarm_count - 1)
      if (currentTab === 'owned-all') this.loadOwnedAll()
      this._renderOwned()
    }

    // 채널 소개 모달이 열려있으면 서버 값으로 재렌더 (pending_alarm_count 아이콘 갱신)
    const detailModal = document.getElementById('modal-channel-detail')
    if (detailModal && detailModal.classList.contains('active')) {
      const scroll = document.getElementById('ch-detail-scroll')
      if (scroll) {
        try {
          const res = await API.get('/channels/' + currentAlarmChId)
          const ch  = res.data?.data
          if (ch) {
            Cache.set('ch_detail_' + currentAlarmChId, ch)
            this._renderChannelDetail(scroll, ch)
            const idx = ownedChannels.findIndex(c => c.id === currentAlarmChId)
            if (idx !== -1) {
              ownedChannels[idx] = { ...ownedChannels[idx], pending_alarm_count: ch.pending_alarm_count || 0 }
              if (currentTab === 'owned-all') this.loadOwnedAll()
              this._renderOwned()
            }
          }
        } catch (_) {}
      }
    }
  },
  toggleAlarmInModal(btn) {
    const on = btn.classList.toggle('on')
    Store.setAlarm(currentAlarmChId, on)
    toast(on ? '알림을 켰습니다' : '알림을 껐습니다')
  },

  // ── 메시지 소스 선택 ──────────────────
  selectMsgSrc(src) {
    if (src === 'youtube') {
      // 유튜브 앱(없으면 웹) 열기
      const youtubeUrl = 'https://www.youtube.com'
      if (window.FlutterBridge) {
        window.FlutterBridge.postMessage(JSON.stringify({ action: 'launch_youtube', url: youtubeUrl }))
      } else {
        window.open(youtubeUrl, '_blank')
      }
      // 파일 선택 내용 초기화
      App._clearFileDisplay()
      return
    }

    if (src === 'file') {
      // Flutter WebView는 input[type=file] 직접 클릭 차단 → FlutterBridge 사용
      // URL 초기화는 파일 선택 완료 콜백에서 처리
      if (window.FlutterBridge) {
        window.FlutterBridge.postMessage(JSON.stringify({ action: 'pick_file' }))
      } else {
        document.getElementById('alarm-attach-file')?.click()
      }
    }
  },

  // YouTube URL 입력 감지 → X 버튼 표시/숨김
  _onYoutubeUrlInput() {
    const val = document.getElementById('alarm-youtube-url')?.value || ''
    const clearBtn = document.getElementById('alarm-youtube-clear')
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none'
    // 파일 선택 내용 초기화
    if (val) App._clearFileDisplay()
  },

  // YouTube URL X 버튼
  _clearYoutubeUrl() {
    const urlInput = document.getElementById('alarm-youtube-url')
    if (urlInput) { urlInput.value = '' }
    const clearBtn = document.getElementById('alarm-youtube-clear')
    if (clearBtn) clearBtn.style.display = 'none'
  },

  _clearEditHomepage() {
    const input = document.getElementById('edit-homepage')
    if (input) { input.value = ''; input.focus() }
  },

  // 외부 브라우저로 URL 열기 (Flutter: externalApplication / 웹: 새 탭)
  openExternalUrl(url) {
    if (!url) return
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'open_url', url }))
    } else {
      window.open(url, '_blank')
    }
  },

  // 연결 URL - 홈페이지와 동일 체크박스
  async _onAlarmLinkHomepageCheck(checkbox) {
    const linkInput = document.getElementById('alarm-link-url')
    const clearBtn  = document.getElementById('alarm-link-clear')
    if (!linkInput) return
    if (checkbox.checked) {
      try {
        const res = await API.get('/channels/' + currentAlarmChId)
        const hp = res.data?.data?.homepage_url || ''
        linkInput.value = hp ? (hp.startsWith('http') ? hp : 'https://' + hp) : ''
        linkInput.readOnly = true
        if (clearBtn) clearBtn.style.display = 'none'
      } catch(e) {
        linkInput.value = ''
        linkInput.readOnly = false
      }
    } else {
      linkInput.value = ''
      linkInput.readOnly = false
      if (clearBtn) clearBtn.style.display = 'none'
    }
  },

  _onAlarmLinkUrlInput() {
    const linkInput = document.getElementById('alarm-link-url')
    const clearBtn  = document.getElementById('alarm-link-clear')
    if (!clearBtn) return
    clearBtn.style.display = linkInput?.value ? 'flex' : 'none'
  },

  _clearAlarmLinkUrl() {
    const linkInput = document.getElementById('alarm-link-url')
    const clearBtn  = document.getElementById('alarm-link-clear')
    const checkbox  = document.getElementById('alarm-link-same-as-homepage')
    if (linkInput) { linkInput.value = ''; linkInput.readOnly = false }
    if (clearBtn)  clearBtn.style.display = 'none'
    if (checkbox)  checkbox.checked = false
  },

  // 파일 표시 초기화 (X 없이 조용히)
  _clearFileDisplay() {
    window._selectedAlarmFile = null
    alarmMsgSrc = ''
    const label = document.getElementById('alarm-file-label')
    if (label) { label.textContent = '파일을 선택하세요 (오디오/비디오)'; label.style.color = 'var(--text3)' }
    const clearBtn = document.getElementById('alarm-file-clear')
    if (clearBtn) clearBtn.style.display = 'none'
    const input = document.getElementById('alarm-attach-file')
    if (input) input.value = ''
  },
  onAlarmFileSelected(input, type) {
    const file = input.files?.[0]; if (!file) return

    // 오디오/비디오 파일 여부 확인
    const isAudio = file.type.startsWith('audio/') || ['.mp3','.m4a','.wav','.aac','.ogg','.flac','.wma'].some(e => file.name.toLowerCase().endsWith(e))
    const isVideo = file.type.startsWith('video/') || ['.mp4','.mov','.mkv','.avi','.wmv','.m4v','.webm'].some(e => file.name.toLowerCase().endsWith(e))

    if (!isAudio && !isVideo) { toast('오디오 또는 비디오 파일을 선택해 주세요'); input.value = ''; return }
    alarmMsgSrc = isAudio ? 'audio' : 'video'

    // YouTube URL 초기화
    App._clearYoutubeUrl()

    // 파일 표시 영역 업데이트
    const icon = isAudio ? '🎵' : '🎬'
    const sizeStr = file.size > 1024*1024 ? (file.size/1024/1024).toFixed(2) + ' MB' : Math.round(file.size/1024) + ' KB'
    const label = document.getElementById('alarm-file-label')
    if (label) { label.textContent = icon + ' ' + file.name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
    const clearBtn = document.getElementById('alarm-file-clear')
    if (clearBtn) clearBtn.style.display = 'flex'

    // FileReader로 base64 변환 후 저장 (서버 전송용)
    const reader = new FileReader()
    reader.onload = e => { window._selectedAlarmFile = e.target.result }
    reader.readAsDataURL(file)
    input.value = ''
  },

  // 파일 프리뷰 표시 (파일명 + X 삭제 버튼)
  _showFilePreview(previewId, label, type) {
    const preview = document.getElementById(previewId)
    if (!preview) return
    preview.innerHTML = `
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
      <button onclick="App._clearFilePreview('${previewId}','${type}')" style="
        background:rgba(255,59,48,0.15);border:none;border-radius:50%;width:22px;height:22px;
        display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-left:8px;
        color:#FF3B30;font-size:13px;font-weight:bold;line-height:1;
      ">✕</button>
    `
    preview.style.cssText += ';display:flex;align-items:center;'
  },

  // 파일 프리뷰 삭제 (X 버튼 클릭)
  _clearFilePreview(previewId, type) {
    App._clearFileDisplay()
    toast('파일이 삭제되었습니다')
  },

  // ── 녹음/녹화/파일 앱 실행 ──────────────────
  // Flutter: FlutterBridge.postMessage → 네이티브 Intent
  // 브라우저: input[type=file] 직접 호출
  _audioRecording: false,  // 오디오 녹음 진행 중 여부

  launchRecorder(type) {
    if (window.FlutterBridge) {
      if (type === 'audio') {
        // 오디오: 시작/중지 토글
        if (!this._audioRecording) {
          // 녹음 시작
          this._audioRecording = true
          const btn = document.getElementById('record-audio-btn')
          if (btn) {
            btn.innerHTML = '<i class="fas fa-stop-circle mr-1"></i>녹음 중지'
            btn.classList.remove('bg-teal-500', 'hover:bg-teal-600')
            btn.classList.add('bg-red-500', 'hover:bg-red-600')
          }
          if (typeof showToast === 'function') showToast('🎙️ 녹음 중... 완료하려면 다시 누르세요')
          window.FlutterBridge.postMessage(JSON.stringify({ action: 'record_audio' }))
        } else {
          // 녹음 중지
          this._audioRecording = false
          const btn = document.getElementById('record-audio-btn')
          if (btn) {
            btn.innerHTML = '<i class="fas fa-microphone mr-1"></i>직접 녹음'
            btn.classList.remove('bg-red-500', 'hover:bg-red-600')
            btn.classList.add('bg-teal-500', 'hover:bg-teal-600')
          }
          window.FlutterBridge.postMessage(JSON.stringify({ action: 'stop_audio_record' }))
        }
      } else {
        // 비디오: 기존 방식
        window.FlutterBridge.postMessage(JSON.stringify({ action: 'record_video' }))
      }
    } else {
      const inputId = { audio: 'alarm-audio-file', video: 'alarm-video-file' }[type]
      const input = document.getElementById(inputId)
      if (input) input.click()
    }
  },

  launchFilePicker() {
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'pick_file' }))
    } else {
      document.getElementById('alarm-attach-file')?.click()
    }
  },

  pickAudioFile() {
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'pick_audio_file' }))
    } else {
      document.getElementById('alarm-audio-file')?.click()
    }
  },

  pickVideoFile() {
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'pick_video_file' }))
    } else {
      document.getElementById('alarm-video-file')?.click()
    }
  },

  // ── 날짜 피커 (화살표 방식) ──────────────
  // ── 날짜/시간 통합 팝업 ──────────────────────────────
  openDateTimePicker() {
    const modal = document.getElementById('modal-date-picker')
    if (!modal) return
    // 현재 alarmDate/Hour/Min 기준으로 달력 및 시간 표시
    calYear  = alarmDate.getFullYear()
    calMonth = alarmDate.getMonth()
    this._renderCalGrid()
    this._renderDtTimePicker()
    modal.style.display = 'flex'
  },

  closeDateTimePicker() {
    const modal = document.getElementById('modal-date-picker')
    if (modal) modal.style.display = 'none'
  },

  // 확인 버튼 클릭 시 날짜/시간 반영
  confirmDateTime() {
    this._renderDateLabel()
    this._renderTimeLabel()
    this.closeDateTimePicker()
  },

  // 팝업 내 오전/오후 버튼
  _setAmPm(ampm) {
    const amBtn = document.getElementById('dt-btn-am')
    const pmBtn = document.getElementById('dt-btn-pm')
    if (amBtn) amBtn.classList.toggle('active', ampm === 'am')
    if (pmBtn) pmBtn.classList.toggle('active', ampm === 'pm')
    // 24시간 기준으로 변환
    const h12 = alarmHour % 12   // 12시간 기준 시
    if (ampm === 'am') {
      alarmHour = h12  // 오전: 0~11
    } else {
      alarmHour = h12 === 0 ? 12 : h12 + 12  // 오후: 12~23
    }
    this._renderDtTimePicker()
  },

  // 팝업 내 시 변경
  _dtChangeHour(delta) {
    const isAm = alarmHour < 12
    const h12 = alarmHour % 12
    let newH12 = ((h12 + delta - 1 + 12) % 12) + 1  // 1~12 범위 순환
    alarmHour = isAm ? (newH12 === 12 ? 0 : newH12) : (newH12 === 12 ? 12 : newH12 + 12)
    this._renderDtTimePicker()
  },

  // 팝업 내 분 변경
  _dtChangeMin(delta) {
    alarmMin = (alarmMin + delta + 60) % 60
    this._renderDtTimePicker()
  },

  // 팝업 내 시 직접 입력
  _dtInputHour() {
    const isAm = alarmHour < 12
    const h12cur = alarmHour % 12 === 0 ? 12 : alarmHour % 12
    const val = prompt(`시 입력 (1~12)\n현재: ${String(h12cur).padStart(2,'0')}`, String(h12cur))
    if (val === null) return
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 1 || n > 12) { toast('1~12 사이 숫자를 입력하세요'); return }
    alarmHour = isAm ? (n === 12 ? 0 : n) : (n === 12 ? 12 : n + 12)
    this._renderDtTimePicker()
  },

  // 팝업 내 분 직접 입력
  _dtInputMin() {
    const val = prompt(`분 입력 (0~59)\n현재: ${String(alarmMin).padStart(2,'0')}`, String(alarmMin))
    if (val === null) return
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0 || n > 59) { toast('0~59 사이 숫자를 입력하세요'); return }
    alarmMin = n
    this._renderDtTimePicker()
  },

  // 팝업 내 시간 UI 업데이트
  _renderDtTimePicker() {
    const isAm = alarmHour < 12
    const h12  = alarmHour % 12 === 0 ? 12 : alarmHour % 12
    const amBtn = document.getElementById('dt-btn-am')
    const pmBtn = document.getElementById('dt-btn-pm')
    const hEl   = document.getElementById('dt-hour')
    const mEl   = document.getElementById('dt-min')
    if (amBtn) amBtn.classList.toggle('active', isAm)
    if (pmBtn) pmBtn.classList.toggle('active', !isAm)
    if (hEl)   hEl.textContent  = String(h12).padStart(2, '0')
    if (mEl)   mEl.textContent  = String(alarmMin).padStart(2, '0')
  },

  _calMove(delta) {
    calMonth += delta
    if (calMonth < 0)  { calMonth = 11; calYear-- }
    if (calMonth > 11) { calMonth = 0;  calYear++ }
    this._renderCalGrid()
  },

  _renderCalGrid() {
    const monthLabel = document.getElementById('cal-month-label')
    if (monthLabel) monthLabel.textContent = `${calYear}년 ${calMonth+1}월`

    const grid = document.getElementById('cal-days-grid')
    if (!grid) return

    const today = new Date(); today.setHours(0,0,0,0)
    const selected = new Date(alarmDate); selected.setHours(0,0,0,0)
    const firstDay = new Date(calYear, calMonth, 1).getDay()  // 0=일
    const lastDate = new Date(calYear, calMonth+1, 0).getDate()

    let html = ''
    // 첫 주 빈칸
    for (let i = 0; i < firstDay; i++) {
      html += '<div></div>'
    }
    // 날짜 셀
    for (let d = 1; d <= lastDate; d++) {
      const thisDate = new Date(calYear, calMonth, d)
      thisDate.setHours(0,0,0,0)
      const isPast     = thisDate < today
      const isToday    = thisDate.getTime() === today.getTime()
      const isSelected = thisDate.getTime() === selected.getTime()
      const dow        = thisDate.getDay()
      const isSun      = dow === 0
      const isSat      = dow === 6

      let bg    = 'transparent'
      let color = isPast ? 'var(--text3)' : isSun ? '#FF6B6B' : isSat ? '#6B9FFF' : 'var(--text)'
      let fw    = '400'
      let border = 'none'

      if (isSelected) { bg = 'var(--primary)'; color = '#fff'; fw = '700' }
      else if (isToday) { border = '2px solid var(--primary)'; fw = '700' }

      const click = isPast ? '' : `onclick="App._pickCalDate(${calYear},${calMonth},${d})"`
      html += `<div ${click} style="
        text-align:center;padding:7px 2px;border-radius:50%;font-size:14px;
        background:${bg};color:${color};font-weight:${fw};
        border:${border};cursor:${isPast?'default':'pointer'};
        opacity:${isPast?'0.35':'1'};
      ">${d}</div>`
    }
    grid.innerHTML = html
  },

  _pickCalDate(y, m, d) {
    alarmDate = new Date(y, m, d)
    calYear   = y
    calMonth  = m
    this._renderCalGrid()   // 선택 표시 갱신 (팝업 유지)
  },

  _renderDateLabel() {
    const el = document.getElementById('alarm-date-label')
    if (!el) return
    const today = new Date(); today.setHours(0,0,0,0)
    const d = new Date(alarmDate); d.setHours(0,0,0,0)
    const dayNames = ['일','월','화','수','목','금','토']
    const isToday = d.getTime() === today.getTime()
    const isTomorrow = d.getTime() === today.getTime() + 86400000
    let label = ''
    if (isToday) label = '오늘'
    else if (isTomorrow) label = '내일'
    else label = dayNames[d.getDay()]
    el.textContent = `${alarmDate.getMonth()+1}월 ${alarmDate.getDate()}일 (${label})`
  },

  _renderTimeLabel() {
    const el = document.getElementById('alarm-time-label')
    if (!el) return
    const isAm = alarmHour < 12
    const h12  = alarmHour % 12 === 0 ? 12 : alarmHour % 12
    const ampm = isAm ? '오전' : '오후'
    el.textContent = `${ampm} ${String(h12).padStart(2,'0')}:${String(alarmMin).padStart(2,'0')}`
  },

  // 구 달력 함수 (호환성 유지)
  dateMove(delta) {
    const d = new Date(alarmDate)
    d.setDate(d.getDate() + delta)
    const today = new Date(); today.setHours(0,0,0,0)
    if (d < today) { toast('오늘 이후 날짜를 선택하세요'); return }
    alarmDate = d
    this._renderDateLabel()
  },
  openDatePicker() { this.openDateTimePicker() },
  closeDatePicker() { this.closeDateTimePicker() },
  calMove(delta) { this._calMove(delta) },
  _renderCal() { this._renderDateLabel() },
  selectDate(y, m, d) {
    alarmDate = new Date(y, m, d)
    this._renderDateLabel()
  },
  changeHour(delta) {
    alarmHour = (alarmHour + delta + 24) % 24
    this._renderTimeLabel()
  },
  changeMin(delta) {
    alarmMin = (alarmMin + delta + 60) % 60
    this._renderTimeLabel()
  },
  _renderTime() { this._renderTimeLabel() },

  // ── 알람 저장 ─────────────────────────
  async saveAlarmSetting() {
    if (!alarmDate) { toast('날짜를 선택하세요'); return }
    const dt = new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate(), alarmHour, alarmMin)
    if (dt <= new Date()) { toast('현재 시각 이후를 선택하세요', 2500); return }

    // 채널당 알람 3개 제한 사전 체크
    try {
      const alarmListRes = await API.get('/alarms?channel_id=' + currentAlarmChId)
      const currentAlarms = (alarmListRes.data?.data || []).filter(a => a.status === 'pending')
      if (currentAlarms.length >= 3) {
        toast('채널당 최대 3개까지 알람을 예약할 수 있습니다. 기존 알람을 삭제 후 다시 시도해 주세요.', 3500)
        return
      }
    } catch (_) {}

    // URL 입력값 또는 파일 선택 여부로 소스 자동 판단
    const urlInputVal = document.getElementById('alarm-youtube-url')?.value.trim() || ''
    const hasFile = !!window._selectedAlarmFile

    let srcValue = ''
    if (hasFile && (alarmMsgSrc === 'audio' || alarmMsgSrc === 'video' || alarmMsgSrc === 'file')) {
      // 파일 선택된 경우
      srcValue = window._selectedAlarmFile
    } else if (urlInputVal) {
      // URL 입력된 경우 → YouTube로 처리
      alarmMsgSrc = 'youtube'
      srcValue = urlInputVal
      // 유튜브 URL 형식 검증
      if (!srcValue.includes('youtube.com') && !srcValue.includes('youtu.be')) {
        toast('올바른 YouTube URL을 입력하세요'); return
      }
    } else {
      // 아무것도 없는 경우
      toast('YouTube URL을 입력하거나 파일을 선택하세요'); return
    }

    const pad = n => String(n).padStart(2,'0')
    // UTC ISO 문자열로 변환 (서버는 UTC 기준으로 비교하므로 반드시 UTC로 전송)
    const scheduledAt = dt.toISOString().slice(0, 19) + 'Z'

    const userId = Store.getUserId()
    if (!userId) { toast('로그인이 필요합니다'); return }

    // 로딩 표시
    const doneBtn = document.querySelector('.btn-alarm-done')
    if (doneBtn) { doneBtn.disabled = true; doneBtn.textContent = '저장 중...' }

    try {
      const res = await API.post('/alarms', {
        channel_id:   parseInt(currentAlarmChId, 10) || currentAlarmChId,
        created_by:   userId,
        scheduled_at: scheduledAt,
        msg_type:     alarmMsgSrc,
        msg_value:    srcValue,
        link_url:     document.getElementById('alarm-link-url')?.value.trim() || null
      })

      if (res.data?.success) {
        Store.setAlarm(currentAlarmChId, true)
        const dateStr = dt.toLocaleDateString('ko-KR', { month:'long', day:'numeric' })
        const timeStr = `${pad(alarmHour)}:${pad(alarmMin)}`
        const srcLabel = { youtube:'YouTube', audio:'오디오', video:'비디오', file:'파일' }[alarmMsgSrc]
        const targets = res.data.data?.total_targets || 0
        toast(`⏰ 알람 설정 완료 · ${dateStr} ${timeStr} · ${srcLabel} · 대상 ${targets}명`, 3500)

        // 홈 + 발신함 캐시 무효화 (알람 설정 시 발신함 목록도 변경됨)
        Cache.del('home_' + Store.getUserId())
        this._invalidateOutboxCache()

        // ownedChannels 배열 서버에서 재조회 후 내 채널 전체보기로 이동
        this.closeModal('modal-alarm')
        this.closeModal('modal-channel-detail')
        try {
          const oRes = await API.get('/channels?owner_id=' + Store.getUserId())
          ownedChannels = oRes.data?.data || ownedChannels
        } catch (_) {}
        this.goto('owned-all')
      } else {
        toast(res.data?.error || '알람 저장 실패', 3000)
      }
    } catch (e) {
      console.error('[알람 저장 오류]', e)
      toast('오류: ' + (e.response?.data?.error || e.message), 3000)
    } finally {
      if (doneBtn) { doneBtn.disabled = false; doneBtn.textContent = '확인' }
    }
  },

  // 알람 버튼 색상 즉시 갱신
  _refreshAlarmBtn(chId) {
    document.querySelectorAll('.btn-alarm').forEach(btn => {
      const oc = btn.getAttribute('onclick') || ''
      if (oc.includes('openAlarmModal(' + chId + ',') || oc.includes('openAlarmModal(' + chId + ')')) {
        const hasAlarm = Store.getAlarm(chId)
        btn.classList.toggle('has-alarm', !!hasAlarm)
      }
    })
  },

  // ── 초대코드 모달 ────────────────────────
  async openInviteModal(chId, name) {
    currentInviteCode = ''
    document.getElementById('invite-channel-name-label').textContent = `"${name}" 채널의 초대 링크`
    document.getElementById('invite-code-box').textContent = '초대 링크를 불러오는 중...'
    this.openModal('modal-invite')
    try {
      const userId = Store.getUserId()
      // 활성 초대 링크 조회
      const res  = await API.get('/invites?channel_id=' + chId)
      const list = res.data?.data || []
      const active = list.find(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date()))
      if (active) {
        const url = location.origin + '/join/' + active.invite_token
        currentInviteCode = url
        document.getElementById('invite-code-box').textContent = url
      } else {
        // 새 초대 링크 생성
        const cr = await API.post('/invites', { channel_id: chId, created_by: userId })
        if (cr.data?.data?.invite_token) {
          const url = location.origin + '/join/' + cr.data.data.invite_token
          currentInviteCode = url
          document.getElementById('invite-code-box').textContent = url
        } else {
          document.getElementById('invite-code-box').textContent = '초대 링크를 생성할 수 없습니다.'
        }
      }
    } catch (e) {
      document.getElementById('invite-code-box').textContent = '오류: ' + e.message
    }
  },

  copyInviteCode() {
    if (!currentInviteCode) { toast('복사할 링크가 없습니다'); return }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentInviteCode).then(() => toast('클립보드에 복사됐습니다!'))
    } else {
      const ta = document.createElement('textarea')
      ta.value = currentInviteCode; document.body.appendChild(ta)
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      toast('복사됐습니다')
    }
  },

  // ── 채널 참여 ──────────────────────────
  // ── 서비스 이용약관 ──────────────────────────────────
  async openTerms() {
    const el = document.getElementById('modal-terms')
    const contentEl = document.getElementById('terms-content')
    if (!el) return
    el.classList.add('active')
    const cached = Cache.get('terms')
    if (cached) { contentEl.textContent = cached; return }
    contentEl.textContent = '불러오는 중...'
    try {
      const res = await API.get('/settings/terms')
      const val = res.data?.data?.value || '이용약관 내용이 없습니다.'
      Cache.set('terms', val)
      contentEl.textContent = val
    } catch(e) {
      contentEl.textContent = '이용약관을 불러오지 못했습니다.'
    }
  },

  closeTerms() {
    const el = document.getElementById('modal-terms')
    if (el) el.classList.remove('active')
  },

  // ── 개인정보보호정책 ──────────────────────────────
  async openPrivacy() {
    const el = document.getElementById('modal-privacy')
    const contentEl = document.getElementById('privacy-content')
    if (!el) return
    el.classList.add('active')
    const cached = Cache.get('privacy')
    if (cached) { contentEl.textContent = cached; return }
    contentEl.textContent = '불러오는 중...'
    try {
      const res = await API.get('/settings/privacy')
      const val = res.data?.data?.value || '개인정보보호정책 내용이 없습니다.'
      Cache.set('privacy', val)
      contentEl.textContent = val
    } catch(e) {
      contentEl.textContent = '개인정보보호정책를 불러오지 못했습니다.'
    }
  },

  closePrivacy() {
    const el = document.getElementById('modal-privacy')
    if (el) el.classList.remove('active')
  },

  openJoinChannel() {
    document.getElementById('join-token').value = ''
    document.getElementById('join-password').value = ''
    document.getElementById('join-password-wrap').style.display = 'none'
    this.openModal('modal-join')
  },

  async joinChannel() {
    let input = document.getElementById('join-token').value.trim()
    if (!input) { toast('초대 코드를 입력하세요'); return }
    let token = input
    if (input.includes('/join/')) token = input.split('/join/').pop()
    else if (input.startsWith('http')) {
      try { token = new URL(input).pathname.split('/').pop() } catch {}
    }
    const uid = Store.getUserId()
    if (!uid) { toast('로그인이 필요합니다'); return }

    // 비밀채널 여부 확인 (invites/verify)
    try {
      const verifyRes = await API.get('/invites/verify/' + token)
      const channelId = verifyRes.data?.data?.channel_id
      if (channelId) {
        // 채널 정보로 비밀번호 여부 확인
        const chRes = await API.get('/channels/' + channelId)
        const ch = chRes.data?.data
        if (ch?.is_secret) {
          // 비밀번호 입력창 표시
          const pwWrap = document.getElementById('join-password-wrap')
          pwWrap.style.display = 'block'
          const pw = document.getElementById('join-password').value.trim()
          if (!pw) { toast('비밀번호를 입력하세요'); document.getElementById('join-password').focus(); return }
          // 비밀번호 검증
          try {
            await API.post('/channels/' + channelId + '/verify-password', { password: pw })
          } catch (e) {
            toast(e.response?.data?.error || '비밀번호가 올바르지 않습니다', 3000); return
          }
        }
      }
    } catch {}

    try {
      // Flutter에 FCM 토큰 직접 요청 (타이밍 문제 방지)
      const fcmInfo = await Store.getFlutterFcmToken()
      const res = await API.post('/invites/join', {
        invite_token: token,
        user_id:   uid,
        fcm_token: fcmInfo.fcm_token,
        platform:  fcmInfo.platform
      })
      if (res.data?.success) {
        toast('채널에 참여했습니다!')
        this.closeModal('modal-join')
        Store.addNotif({ title:'채널 참여 완료', body:'새 채널에 성공적으로 참여했습니다.', channel_name: res.data?.data?.channel_name || '채널', content_type:'default' })
        // 구독 채널 목록 캐시 무효화
        this._invalidateAllFeedCache()
        await this.loadHome()
        this.goto('joined-all')
      } else {
        toast(res.data?.error || '참여 실패', 3000)
      }
    } catch (e) { toast('오류: ' + (e.response?.data?.error || e.message), 3000) }
  },

  // ── 채널 상세 ──────────────────────────
  _renderChannelDetail(container, ch) {
    const color = avatarColor(ch.name)
    const init  = (ch.name || '?')[0].toUpperCase()
    const uid   = Store.getUserId()
    const isOwner  = ch.owner_id === uid
    const isJoined = joinedChannels.some(s => (s.channel_id || s.id) === ch.id)
    const avHtml = ch.image_url
      ? '<img src="' + ch.image_url + '" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="App.showImageViewer(\'' + ch.image_url + '\', null, null)">'
      : '<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;background:' + color + ';cursor:pointer;" onclick="App.showImageViewer(null, \'' + init + '\', \'' + color + '\')">' + init + '</span>'
    const hasAlarmDetail  = (ch.pending_alarm_count || 0) > 0
    const alarmCountDetail = ch.pending_alarm_count || 0
    const alarmCls        = hasAlarmDetail ? 'ch-action-btn btn-alarm has-alarm' : 'ch-action-btn btn-alarm'
    const alarmBadgeDetail = alarmCountDetail > 0
      ? `<span style="position:absolute;top:-4px;right:-4px;background:#FF3B30;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;line-height:1;pointer-events:none;">${alarmCountDetail}</span>`
      : ''
    let btns = ''
    if (isOwner) {
      btns =
        '<div style="position:relative;display:inline-block;"><button class="' + alarmCls + '" onclick="App.openAlarmModal(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="알람설정"><i class="fas fa-clock"></i></button>' + alarmBadgeDetail + '</div>' +
        '<button class="ch-action-btn btn-invite" onclick="App.openInviteModal(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="공유"><i class="fas fa-share-alt"></i></button>' +
        '<button class="ch-action-btn btn-setting" onclick="App.openEditChannel(' + ch.id + ')" title="채널설정"><i class="fas fa-pencil-alt"></i></button>' +
        '<button class="ch-action-btn" style="background:rgba(239,68,68,0.15);color:var(--danger);" onclick="App._deleteChannelFromDetail(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="채널삭제"><i class="fas fa-trash-alt"></i></button>'
    } else if (isJoined) {
      btns =
        '<button class="ch-action-btn btn-invite" onclick="App.openInviteModal(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="공유"><i class="fas fa-share-alt"></i></button>' +
        '<button class="ch-action-btn" style="background:rgba(239,68,68,0.15);color:var(--danger);" onclick="App._leaveChannelConfirm(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="채널나가기"><i class="fas fa-sign-out-alt"></i></button>'
    } else {
      btns =
        '<button class="ch-action-btn btn-invite" onclick="App.openInviteModal(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="공유"><i class="fas fa-share-alt"></i></button>' +
        '<button class="ch-detail-btn-join" onclick="App._joinFromDetail(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')"><i class="fas fa-plus"></i> 채널 참여</button>'
    }
    let hpHtml = ''
    if (ch.homepage_url) {
      const hpUrl = ch.homepage_url.startsWith('http') ? ch.homepage_url : 'https://' + ch.homepage_url
      let hpDomain = ''
      try { hpDomain = new URL(hpUrl).hostname } catch(e) { hpDomain = ch.homepage_url }
      hpHtml =
        '<div class="ch-detail-section">' +
          '<div class="ch-detail-section-title"><i class="fas fa-globe" style="color:var(--teal);"></i> 홈페이지</div>' +
          '<div class="ch-detail-link" style="cursor:pointer;" onclick="App.openExternalUrl(\'' + hpUrl.replace(/'/g,"\\'") + '\')" ontouchstart="window._hpTimer=setTimeout(()=>{navigator.clipboard.writeText(\'' + hpUrl.replace(/'/g,"\\'") + '\').then(()=>toast(\'주소가 복사됐습니다\'))},600)" ontouchend="clearTimeout(window._hpTimer)">' +
            '<i class="fas fa-external-link-alt" style="color:var(--teal);"></i>' +
            '<span>' + hpDomain + '</span>' +
          '</div>' +
        '</div>'
    }
    container.innerHTML =
      '<div class="ch-detail-hero">' +
        '<div class="ch-detail-avatar" style="background:' + color + '22;color:' + color + ';">' + avHtml + '</div>' +
        '<div class="ch-detail-info">' +
          '<div class="ch-detail-name">' + (ch.name||'채널').replace(/</g,'&lt;') + '</div>' +
          '<div class="ch-detail-owner"><i class="fas fa-user-tie" style="font-size:11px;"></i><span>' + (ch.owner_id||'') + '</span></div>' +
          '<div class="ch-detail-stats"><div class="ch-detail-badge"><i class="fas fa-users" style="color:var(--primary);"></i>' + (ch.subscriber_count||0) + '명</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="ch-detail-action-bar">' + btns + '</div>' +
      '<div class="ch-detail-section">' +
        '<div class="ch-detail-section-title"><i class="fas fa-info-circle" style="color:var(--primary);"></i> 채널 소개</div>' +
        '<div class="ch-detail-section-body">' + (ch.description||'채널 소개가 없습니다.').replace(/</g,'&lt;') + '</div>' +
      '</div>' +
      hpHtml +
      '<div style="height:24px;"></div>'
  },

  async openChannelDetail(chId, name) {
    const container = document.getElementById('modal-channel-detail')

    // 헤더 고정 + 스크롤 영역
    container.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:0 16px;height:56px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;">' +
        '<button onclick="App.closeModal(\'modal-channel-detail\')" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:6px;margin-right:4px;"><i class="fas fa-arrow-left"></i></button>' +
        '<span style="font-size:17px;font-weight:700;flex:1;">채널 소개</span>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;" id="ch-detail-scroll"></div>'

    // 항상 서버에서 최신 데이터 조회 (알람 아이콘 등 실시간 반영을 위해 캐시 미사용)
    const cacheKey = 'ch_detail_' + chId
    Cache.del(cacheKey)
    this.openModal('modal-channel-detail')

    try {
      const res = await API.get('/channels/' + chId)
      const ch  = res.data?.data
      if (!ch) {
        document.getElementById('ch-detail-scroll').innerHTML = '<div class="empty-box">채널 정보를 불러올 수 없습니다.</div>'
        return
      }
      Cache.set(cacheKey, ch)
      this._renderChannelDetail(document.getElementById('ch-detail-scroll'), ch)
    } catch (e) {
      const sc = document.getElementById('ch-detail-scroll')
      if (sc) sc.innerHTML = '<div class="empty-box">오류: ' + e.message + '</div>'
    }
  },

  // ── 채널 나가기 (확인 팝업 → API 호출) ────────────
  _leaveChannelConfirm(chId, name) {
    if (!confirm('"' + name + '" 채널에서 나가시겠습니까?\n나가면 더 이상 알림을 받을 수 없습니다.')) return
    this._leaveChannel(chId, name)
  },

  async _leaveChannel(chId, name) {
    try {
      const uid = Store.getUserId()
      if (!uid) { toast('로그인이 필요합니다'); return }
      const res = await API.delete('/subscribers/leave?user_id=' + encodeURIComponent(uid) + '&channel_id=' + chId)
      if (res.data?.success) {
        toast('"' + name + '" 채널에서 나갔습니다.')
        // 채널 나가기 시 관련 캐시 무효화
        this._invalidateAllFeedCache()
        this.closeModal('modal-channel-detail')
        this.goto('joined-all')
      } else {
        toast(res.data?.error || '채널 나가기 실패', 3000)
      }
    } catch (e) {
      toast('오류: ' + (e.response?.data?.error || e.message), 3000)
    }
  },

  // 채널 공유 (초대링크 복사)
  async _shareChannel(chId, name) {
    try {
      const userId = Store.getUserId()
      const res    = await API.get('/invites?channel_id=' + chId)
      const list   = res.data?.data || []
      const active = list.find(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date()))
      let url
      if (active) {
        url = location.origin + '/join/' + active.invite_token
      } else {
        const cr = await API.post('/invites', { channel_id: chId, created_by: userId })
        url = cr.data?.data?.invite_token ? location.origin + '/join/' + cr.data.data.invite_token : null
      }
      if (!url) { toast('초대 링크를 만들 수 없습니다', 3000); return }
      if (navigator.share) {
        navigator.share({ title: name + ' 채널 초대', url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast('초대 링크가 복사됐습니다!')
      } else {
        const ta = document.createElement('textarea')
        ta.value = url; document.body.appendChild(ta); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
        toast('복사됐습니다')
      }
    } catch (e) { toast('오류: ' + e.message, 3000) }
  },

  // 상세화면에서 채널 참여
  async _joinFromDetail(chId, name) {
    try {
      // 비밀채널 확인
      const chRes = await API.get('/channels/' + chId)
      const ch = chRes.data?.data
      if (ch?.is_secret) {
        let pw
        try {
          pw = await this.promptSecretPassword()
        } catch (_) { return }  // 취소
        if (!pw) return
        try {
          await API.post('/channels/' + chId + '/verify-password', { password: pw })
        } catch (e) {
          toast(e.response?.data?.error || '비밀번호가 올바르지 않습니다', 3000); return
        }
      }

      // 활성 초대 토큰 조회
      const res  = await API.get('/invites?channel_id=' + chId)
      const list = res.data?.data || []
      const active = list.find(l => l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date()))
      let token
      if (active) {
        token = active.invite_token
      } else {
        const cr = await API.post('/invites', { channel_id: chId, created_by: Store.getUserId() })
        token    = cr.data?.data?.invite_token
      }
      if (!token) { toast('참여 링크를 만들 수 없습니다', 3000); return }

      // Flutter에 FCM 토큰 직접 요청 (타이밍 문제 방지)
      const fcmInfo = await Store.getFlutterFcmToken()
      const join = await API.post('/invites/join', {
        invite_token: token,
        user_id:   Store.getUserId(),
        fcm_token: fcmInfo.fcm_token,
        platform:  fcmInfo.platform
      })
      if (join.data?.success) {
        toast(name + ' 채널에 참여했습니다! 🎉')
        // 채널 가입 시 joined 목록 + inbox 캐시 무효화
        this._invalidateAllFeedCache()
        this.closeModal('modal-channel-detail')
        await this.loadHome()
        this.goto('joined-all')
      } else {
        toast(join.data?.error || '참여 실패', 3000)
      }
    } catch (e) { toast('오류: ' + e.message, 3000) }
  },

  // ── 이미지 선택 ──────────────────────────
  openImagePicker(mode) {
    imgPickerMode = mode || 'create'
    this.openModal('modal-img-src')
  },
  pickImageFrom(source) {
    this.closeModal('modal-img-src')
    // Flutter 앱 환경: FlutterBridge로 네이티브 이미지 피커 호출
    // (Android WebView file input.click()은 보안 정책으로 동작 불안정)
    if (window.FlutterBridge) {
      setTimeout(() => {
        FlutterBridge.postMessage(JSON.stringify({ action: 'pick_image', source: source }))
      }, 200)
    } else {
      // 웹 브라우저 fallback: file input 사용
      setTimeout(() => {
        document.getElementById(source === 'camera' ? 'camera-input' : 'file-input').click()
      }, 300)
    }
  },
  onFileSelected(input) {
    const file = input.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      // ── 이미지 리사이즈 + 압축 (SQLITE_TOOBIG 방지) ──
      const img = new Image()
      img.onload = () => {
        const MAX = 600  // 최대 600×600
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else       { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // JPEG quality 0.7 → 보통 30~80KB 수준
        selectedImg = canvas.toDataURL('image/jpeg', 0.85)
        const thumbId = imgPickerMode === 'edit' ? 'edit-img-thumb' : 'create-img-thumb'
        document.getElementById(thumbId).innerHTML = `<img src="${selectedImg}" style="width:100%;height:100%;object-fit:cover;">`
        if (imgPickerMode === 'create') {
          const picker = document.getElementById('create-img-picker')
          if (picker) picker.classList.add('has-image')
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file); input.value = ''
  },

  // ── 모달 ────────────────────────────────
  openModal(id)  { document.getElementById(id)?.classList.add('active') },
  closeModal(id) { document.getElementById(id)?.classList.remove('active') },

  // ── 비밀채널 비밀번호 모달 ──────────────────────────────────────
  _secretPwResolve: null,
  _secretPwReject: null,

  promptSecretPassword() {
    return new Promise((resolve, reject) => {
      this._secretPwResolve = resolve
      this._secretPwReject  = reject
      const input = document.getElementById('secret-pw-input')
      const errEl = document.getElementById('secret-pw-error')
      if (input) { input.value = ''; }
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      this.openModal('modal-secret-pw')
      setTimeout(() => input?.focus(), 150)
    })
  },

  confirmSecretPw() {
    const pw = document.getElementById('secret-pw-input')?.value.trim() || ''
    if (!pw) {
      const errEl = document.getElementById('secret-pw-error')
      if (errEl) { errEl.textContent = '비밀번호를 입력하세요'; errEl.style.display = 'block'; }
      return
    }
    this.closeModal('modal-secret-pw')
    if (this._secretPwResolve) { this._secretPwResolve(pw); this._secretPwResolve = null; }
  },

  cancelSecretPw() {
    this.closeModal('modal-secret-pw')
    if (this._secretPwReject) { this._secretPwReject(null); this._secretPwReject = null; }
  },

  // 이미지 뷰어 팝업
  showImageViewer(imageUrl, initial, bgColor) {
    const existing = document.getElementById('image-viewer-overlay')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'image-viewer-overlay'
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;'
    overlay.onclick = (e) => { if (e.target === overlay) App.closeImageViewer() }

    let innerHtml = ''
    if (imageUrl) {
      // 이미지 있는 경우: 원본 이미지 표시
      innerHtml = '<img src="' + imageUrl + '" style="width:260px;height:260px;border-radius:24px;object-fit:cover;">'
    } else {
      // 이미지 없는 경우: 첫글자 아바타를 크게 표시
      innerHtml = '<div style="width:260px;height:260px;border-radius:24px;background:' + bgColor + ';display:flex;align-items:center;justify-content:center;"><span style="font-size:120px;font-weight:700;color:#fff;">' + initial + '</span></div>'
    }

    overlay.innerHTML =
      '<div style="position:relative;display:flex;align-items:center;justify-content:center;">' +
        innerHtml +
        '<button onclick="App.closeImageViewer()" style="position:absolute;top:-16px;right:-16px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>' +
      '</div>'

    document.body.appendChild(overlay)
  },

  closeImageViewer() {
    const el = document.getElementById('image-viewer-overlay')
    if (el) el.remove()
  },
}

// 모달 외부 클릭 닫기
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) App.closeModal(el.id) })
})


// ─────────────────────────────────────────────────────
// Flutter Bridge 콜백 함수들
// Flutter에서 파일 선택/취소/오류 결과를 웹으로 전달
// ─────────────────────────────────────────────────────
window._flutterFileCallback = async function(data) {
  // data: { type, name, path, size, url(Firebase URL), base64(구버전 호환) }
  const { type, name, path, size, url, base64 } = data

  // 오디오 녹음 완료 시 버튼 상태 리셋
  if (type === 'audio' && App._audioRecording) {
    App._audioRecording = false
    const btn = document.getElementById('record-audio-btn')
    if (btn) {
      btn.innerHTML = '<i class="fas fa-microphone mr-1"></i>직접 녹음'
      btn.classList.remove('bg-red-500', 'hover:bg-red-600')
      btn.classList.add('bg-teal-500', 'hover:bg-teal-600')
    }
  }

  const isAudio = ['mp3','m4a','wav','aac','ogg','flac','wma'].some(e => name.toLowerCase().endsWith('.'+e))
  const isVideo = ['mp4','mov','mkv','avi','wmv','m4v','webm'].some(e => name.toLowerCase().endsWith('.'+e))
  alarmMsgSrc = isAudio ? 'audio' : (isVideo ? 'video' : type)

  const icon = isAudio ? '🎵' : (isVideo ? '🎬' : '📎')
  const sizeStr = size > 1024*1024 ? (size/1024/1024).toFixed(2) + ' MB' : Math.round(size/1024) + ' KB'
  const label = document.getElementById('alarm-file-label')
  const clearBtn = document.getElementById('alarm-file-clear')
  if (clearBtn) clearBtn.style.display = 'inline-flex'
  App._clearYoutubeUrl()

  // ── 신규: Flutter가 Firebase Storage URL을 직접 전달한 경우 ──
  if (url && url.startsWith('http')) {
    window._selectedAlarmFile = url
    window._selectedAlarmPath = path
    if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
    toast('✅ 업로드 완료: ' + name, 2000)
    return
  }

  // ── 구버전 APK 호환: base64가 있으면 Cloudflare 경유 업로드 ──
  if (base64) {
    if (label) { label.textContent = icon + ' ' + name + ' (업로드 중...)'; label.style.color = 'var(--text3)' }
    try {
      const res64 = await fetch(base64)
      const blob = await res64.blob()
      const file = new File([blob], name, { type: blob.type })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('session_token', Store.getSessionToken() || '')
      const res = await fetch('/api/uploads/alarm-file', { method: 'POST', body: formData })
      const result = await res.json()
      if (result.success && result.url) {
        window._selectedAlarmFile = result.url
        window._selectedAlarmPath = path
        if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
        toast('✅ 파일 업로드 완료: ' + name, 2000)
      } else {
        throw new Error(result.error || '업로드 실패')
      }
    } catch (e) {
      window._selectedAlarmFile = name
      window._selectedAlarmPath = path
      if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
      toast('⚠️ 업로드 실패: ' + e.message, 3000)
    }
  } else {
    // base64도 url도 없음 (구버전) → 파일명만 저장
    window._selectedAlarmFile = name
    window._selectedAlarmPath = path
    if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
    toast('✅ 파일 선택 완료: ' + name, 2000)
  }
}

// 압축/업로드 진행 상태 표시
window._flutterUploadProgress = function(data) {
  const label = document.getElementById('alarm-file-label')
  if (!label) return
  if (data?.status === 'compressing') {
    label.textContent = '⏳ 영상 압축 중...'
    label.style.color = 'var(--text3)'
  } else if (data?.status === 'uploading') {
    label.textContent = '⬆️ 업로드 중...'
    label.style.color = 'var(--text3)'
  }
}

window._flutterFileCancelled = function(data) {
  // 오디오 녹음 취소 시 버튼 상태 리셋
  if (data?.type === 'audio' && App._audioRecording) {
    App._audioRecording = false
    const btn = document.getElementById('record-audio-btn')
    if (btn) {
      btn.innerHTML = '<i class="fas fa-microphone mr-1"></i>직접 녹음'
      btn.classList.remove('bg-red-500', 'hover:bg-red-600')
      btn.classList.add('bg-teal-500', 'hover:bg-teal-600')
    }
  }
  // 녹음/녹화 앱 실행 후 취소 or 앱이 열린 경우 안내
  if (data?.message) {
    toast('📱 ' + data.message, 5000)
  }
}

window._flutterFileError = function(data) {
  // 오디오 녹음 오류 시 버튼 상태 리셋
  if (data?.type === 'audio' && App._audioRecording) {
    App._audioRecording = false
    const btn = document.getElementById('record-audio-btn')
    if (btn) {
      btn.innerHTML = '<i class="fas fa-microphone mr-1"></i>직접 녹음'
      btn.classList.remove('bg-red-500', 'hover:bg-red-600')
      btn.classList.add('bg-teal-500', 'hover:bg-teal-600')
    }
  }
  toast('파일 선택 오류: ' + (data?.error || '알 수 없는 오류'), 3000)
}

// ── Flutter 이미지 피커 콜백 (채널 대표이미지) ──────────────
window._flutterImageCallback = function(data) {
  // Flutter ImagePicker가 base64로 이미지를 전달
  if (!data?.base64) return
  selectedImg = data.base64
  const thumbId = imgPickerMode === 'edit' ? 'edit-img-thumb' : 'create-img-thumb'
  const thumb = document.getElementById(thumbId)
  if (thumb) {
    thumb.innerHTML = `<img src="${selectedImg}" style="width:100%;height:100%;object-fit:cover;">`
  }
  if (imgPickerMode === 'create') {
    const picker = document.getElementById('create-img-picker')
    if (picker) picker.classList.add('has-image')
  }
  toast('✅ 이미지 선택 완료', 2000)
}

window._flutterImageCancelled = function() {
  // 취소 시: create 모드이고 selectedImg 없으면 빈 상태 복원
  if (imgPickerMode === 'create' && !selectedImg) {
    const thumb = document.getElementById('create-img-thumb')
    if (thumb) thumb.innerHTML = '<div class="img-thumb-empty"><i class="fas fa-camera"></i><span>IMAGE</span></div>'
    const picker = document.getElementById('create-img-picker')
    if (picker) picker.classList.remove('has-image')
  }
}

window._flutterImageError = function(data) {
  toast('이미지 선택 오류: ' + (data?.error || '알 수 없는 오류'), 3000)
}

// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// 알람 폴링: 1분마다 서버에 trigger 요청
// 시간이 된 알람 → 구독자에게 통화형 알람 자동 발송
// Flutter 앱에서는 가상통화 화면 표시
// ─────────────────────────────────────────────────────
async function pollAlarmTrigger() {
  try {
    const res = await API.post('/alarms/trigger')
    if (res.data?.triggered > 0) {
      console.log('[Alarm] triggered:', res.data.triggered, res.data.results)
      res.data.results?.forEach(alarm => {
        // 수신함에 알림 추가
        Store.addNotif({
          title: `⏰ [${alarm.channel_name}] 알람 발송`,
          body: `${alarm.total_targets}명에게 통화 알람이 발송됐습니다 (${alarm.msg_type})`,
          channel_name: alarm.channel_name,
          content_type: 'alarm'
        })

        // ── Flutter 앱에서 가상통화 화면 표시 ──
        // FlutterBridge가 있으면 (APK 환경) 가상통화 화면을 Flutter에서 띄움
        if (window.FlutterBridge) {
          window.FlutterBridge.postMessage(JSON.stringify({
            action: 'show_fake_call',
            channel_name: alarm.channel_name,
            msg_type: alarm.msg_type,
            msg_value: alarm.msg_value || '',
            alarm_id: alarm.alarm_id,
            content_url: alarm.content_url || '',
            link_url: alarm.link_url || ''
          }))
        }
      })
    }
  } catch(e) {
    // 조용히 실패 무시
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  // localStorage 알림 3일 초과 항목 자동 삭제
  ;(function cleanOldNotifs() {
    try {
      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000
      const list = Store.getNotifs().filter(n => n.id && n.id >= cutoff)
      localStorage.setItem('notifications', JSON.stringify(list))
    } catch(e) {}
  })()

  // 저장된 테마 적용 (기본값: light)
  const savedTheme = localStorage.getItem('theme') || 'light'
  App.applyTheme(savedTheme)

  // 드로어 사용자 이메일 표시
  const drawerEmail = document.getElementById('drawer-user-email')
  if (drawerEmail) drawerEmail.textContent = Store.getEmail() || Store.getDisplayName() || '로그인 중...'

  // ── 세션 확인: 로그인 상태 → 앱, 미로그인 → 대기 ──
  // Flutter WebView에서는 DOMContentLoaded 직후 토큰이 아직 주입 전일 수 있음
  // 토큰이 있으면 바로 진행, 없으면 300ms 대기 후 재확인
  if (Store.isLoggedIn()) {
    _doLogin()
  } else {
    // Flutter WebView가 onPageFinished에서 토큰을 주입하므로 짧게 대기
    setTimeout(() => {
      if (Store.isLoggedIn()) {
        _doLogin()
      } else {
        Auth.show()  // 로그인 화면 표시
      }
    }, 400)
  }

  // 샘플 알림 (첫 방문)
  if (!Store.get('sample_added')) {
    Store.addNotif({ title:'힐링 뮤직 채널 새 음악', body:'오늘의 힐링 음악이 업로드됐습니다.', channel_name:'힐링 뮤직', content_type:'audio' })
    Store.addNotif({ title:'명상 가이드 새 영상', body:'명상 가이드 채널에 새 영상이 추가됐습니다.', channel_name:'명상 가이드', content_type:'video' })
    Store.set('sample_added', '1')
  }

  // Enter 키 로그인/회원가입 지원
  document.getElementById('login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login() })
  document.getElementById('signup-pw2')?.addEventListener('keydown', e => { if (e.key === 'Enter') Auth.signup() })
})

function _doLogin() {
  Auth.hide()
  document.getElementById('auth-screen').classList.add('hidden')
  App.goto('home')
  pollAlarmTrigger()
  setInterval(pollAlarmTrigger, 60 * 1000)

  // ── 항목 6: channel_created 이벤트 리스너 등록 (중복 방지) ──
  if (!window._channelEventsBound) {
    window._channelEventsBound = true
    document.addEventListener('channel_created', (e) => {
      console.log('[channel_created] 이벤트 수신, 리스트 갱신', e.detail)
      App.fetchMyChannels()
    })
  }

  // ── 항목 10: 하단 탭 백그라운드 preload ──────────────────
  // 홈 로딩 후 1초 뒤, 수신함·발신함·채널 탭 데이터를 캐시에 미리 채움
  // → 탭 첫 진입 시 스피너 없이 즉시 표시
  if (!window._preloadDone) {
    window._preloadDone = true
    setTimeout(() => {
      if (!Store.isLoggedIn()) return
      console.log('[Preload] 수신함·발신함·채널·내채널 백그라운드 preload 시작')
      // 수신함 preload (loadInbox는 stale-while-revalidate 패턴이므로 직접 API 호출)
      const uid = Store.getUserId()
      Promise.allSettled([
        // 수신함 채널 목록 + 첫 페이지
        API.get('/alarms/inbox?limit=20&offset=0').then(r => {
          if (r.data?.data) {
            const items = r.data.data
            const channels = [...new Map(items.map(i => [i.channel_id, { id: i.channel_id, name: i.channel_name }])).values()]
            Cache.set('inbox_channels_' + uid, channels)
            Cache.set('inbox_items_' + uid, { items, hasMore: items.length === 20, nextOffset: 20 })
            console.log('[Preload] inbox done, items:', items.length)
          }
        }),
        // 발신함 채널 목록 + 첫 페이지
        API.get('/alarms/outbox?limit=20&offset=0').then(r => {
          if (r.data?.data) {
            const items = r.data.data
            const channels = [...new Map(items.map(i => [i.channel_id, { id: i.channel_id, name: i.channel_name }])).values()]
            Cache.set('outbox_channels_' + uid, channels)
            Cache.set('outbox_items_' + uid, { items, hasMore: items.length === 20, nextOffset: 20 })
            console.log('[Preload] outbox done, items:', items.length)
          }
        }),
        // 채널 탐색 탭 (인기/추천 채널)
        App.loadChannel && App._preloadChannels ? App._preloadChannels() : Promise.resolve(),
      ]).then(() => console.log('[Preload] 전체 완료'))
    }, 1200)
  }

  // join_token URL 파라미터 처리 - 해당 채널 소개 페이지 열기
  const urlParams = new URLSearchParams(window.location.search)
  const joinToken = urlParams.get('join_token')
  if (joinToken) {
    setTimeout(async () => {
      try {
        const res = await API.get('/invites/verify/' + joinToken)
        const data = res.data
        if (data?.success && data?.valid && data?.data?.channel_id) {
          const chId = data.data.channel_id
          const chName = data.data.channel_name || '채널'
          App.openChannelDetail(chId, chName)
        }
      } catch(e) {
        console.error('[join_token] 채널 조회 실패:', e)
      }
    }, 500)
  }
}

// ── Flutter에서 호출하는 세션 주입 함수 ──────────────────────
// Flutter onPageFinished에서 runJavaScript로 호출
// flutterSetSession(token, userId, email, displayName)
window.flutterSetSession = function(token, userId, email, displayName) {
  Store.set('session_token', token)
  Store.set('user_id',       userId)
  Store.set('email',         email)
  Store.set('display_name',  displayName)
  // 로그인 화면 숨기고 홈으로 이동
  const authScreen = document.getElementById('auth-screen')
  if (authScreen) authScreen.classList.add('hidden')
  Auth.hide()
  App.goto('home')
  // 드로어 이메일 갱신
  const drawerEmail = document.getElementById('drawer-user-email')
  if (drawerEmail) drawerEmail.textContent = email || displayName || ''
  // 앱 버전 라벨 갱신
  const appVer = localStorage.getItem('app_version')
  const versionEl = document.getElementById('app-version-label')
  if (versionEl && appVer) versionEl.textContent = 'v' + appVer
  // 알람 폴링 시작 (중복 방지)
  if (!window._pollStarted) {
    window._pollStarted = true
    if (typeof pollAlarmTrigger === 'function') {
      pollAlarmTrigger()
      setInterval(pollAlarmTrigger, 60 * 1000)
    }
  }
  // ── 항목 6: channel_created 이벤트 리스너 등록 (중복 방지) ──
  if (!window._channelEventsBound) {
    window._channelEventsBound = true
    document.addEventListener('channel_created', (e) => {
      console.log('[channel_created] 이벤트 수신, 리스트 갱신', e.detail)
      App.fetchMyChannels()
    })
  }
  // ── 항목 10: 하단 탭 백그라운드 preload (Flutter 앱 경로) ──
  if (!window._preloadDone) {
    window._preloadDone = true
    setTimeout(() => {
      if (!Store.isLoggedIn()) return
      console.log('[Preload] Flutter 경로 - 수신함·발신함·채널 preload 시작')
      const uid = Store.getUserId()
      Promise.allSettled([
        API.get('/alarms/inbox?limit=20&offset=0').then(r => {
          if (r.data?.data) {
            const items = r.data.data
            const channels = [...new Map(items.map(i => [i.channel_id, { id: i.channel_id, name: i.channel_name }])).values()]
            Cache.set('inbox_channels_' + uid, channels)
            Cache.set('inbox_items_' + uid, { items, hasMore: items.length === 20, nextOffset: 20 })
          }
        }),
        API.get('/alarms/outbox?limit=20&offset=0').then(r => {
          if (r.data?.data) {
            const items = r.data.data
            const channels = [...new Map(items.map(i => [i.channel_id, { id: i.channel_id, name: i.channel_name }])).values()]
            Cache.set('outbox_channels_' + uid, channels)
            Cache.set('outbox_items_' + uid, { items, hasMore: items.length === 20, nextOffset: 20 })
          }
        }),
        App._preloadChannels(),
      ]).then(() => console.log('[Preload] Flutter 경로 완료'))
    }, 1200)
  }
}
