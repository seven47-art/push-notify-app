// public/static/mobile-app.js  v19
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
    const navBtn = document.getElementById('nav-' + tab)
    if (screen) screen.classList.add('active')
    if (navBtn) navBtn.classList.add('active')
    currentTab = tab
    if (tab === 'home')          this.loadHome()
    else if (tab === 'channel')  this.loadChannel()
    else if (tab === 'inbox')    this.loadInbox()
    else if (tab === 'send')     this.loadSend()
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
    // 앱 로드 시 공지 뱃지 체크
    this.checkNoticesBadge()
    const uid = Store.getUserId()
    if (!uid) {
      document.getElementById('owned-list').innerHTML  = '<div class="empty-box">로그인이 필요합니다.</div>'
      document.getElementById('joined-list').innerHTML = ''
      return
    }

    // 헤더 사용자 이름 표시
    const nameEl = document.getElementById('home-username')
    if (nameEl) nameEl.textContent = Store.getDisplayName() || Store.getEmail() || '사용자'

    // 캐시 확인 → 있으면 즉시 표시 후 백그라운드 갱신
    const cacheKey = 'home_' + uid
    const cached = Cache.get(cacheKey)
    if (cached) {
      ownedChannels  = cached.owned
      joinedChannels = cached.joined
      this._renderOwned()
      this._renderJoined()
    } else {
      document.getElementById('owned-more').style.display  = 'none'
      document.getElementById('joined-more').style.display = 'none'
    }

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

    this._renderOwned()
    this._renderJoined()
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
  loadOwnedAll() {
    const el = document.getElementById('owned-all-list')
    if (!el) return
    if (!ownedChannels.length) {
      el.innerHTML = '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
      return
    }
    el.innerHTML = `<div class="channel-list-wrap">${ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')}</div>`
  },

  // ── 나의 가입채널 전체 페이지 ──────────────────────────
  loadJoinedAll() {
    const el = document.getElementById('joined-all-list')
    if (!el) return
    if (!joinedChannels.length) {
      el.innerHTML = '<div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div>'
      return
    }
    el.innerHTML = `<div class="joined-list-wrap">${joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')}</div>`
  },

  // ── 공지사항 전체 페이지 ──────────────────────────
  async loadNotices() {
    const el = document.getElementById('notices-list')
    if (!el) return
    el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    try {
      const res = await API.get('/notices')
      const list = res.data?.data || []
      if (!list.length) {
        el.innerHTML = '<div class="empty-box">등록된 공지사항이 없습니다.</div>'
        return
      }
      const seen = JSON.parse(localStorage.getItem('seen_notices') || '[]')
      el.innerHTML = list.map(n => {
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
    } catch (e) {
      el.innerHTML = '<div class="empty-box">공지사항을 불러올 수 없습니다.</div>'
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
    const cnt      = ch.subscriber_count || 0
    const id       = ch.id
    const hasAlarm = (ch.pending_alarm_count || 0) > 0
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:13px;color:#EF4444;margin-left:4px;"></i>' : ''
    return `<div class="channel-tile">
      <div onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        ${avatar(name, ch.image_url, 44)}
      </div>
      <div class="info" onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        <div class="ch-name" style="display:flex;align-items:center;flex-wrap:nowrap;overflow:hidden;">${name} ${lockIcon} <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px;white-space:nowrap;"><i class="fas fa-user" style="font-size:10px;"></i> ${cnt}</span></div>
        <div class="ch-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ch.description || '채널 운영자'}</div>
      </div>
      ${hasAlarm ? `<div class="ch-actions"><button class="ch-action-btn btn-alarm has-alarm" onclick="App.openAlarmModal(${id},'${name.replace(/'/g,"\\'")}');" title="예약알람 보기"><i class="fas fa-clock"></i></button></div>` : ''}
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
  _renderChannelList(list) {
    const el = document.getElementById('channel-list-search')
    if (!el) return
    if (!list.length) {
      el.innerHTML = '<div class="empty-box">검색 결과가 없습니다.</div>'
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

    const list     = window._allChannelList || []
    const q        = value.trim().toLowerCase()
    const filtered = list.filter(ch => (ch.name || '').toLowerCase().includes(q))
    this._renderChannelList(filtered)
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

  // ── 수신함 ──────────────────────────────
  async loadInbox(channelId = '') {
    const channelEl = document.getElementById('inbox-channel-list')
    const detailView = document.getElementById('inbox-detail-view')
    if (!channelEl) return
    channelEl.style.display = 'block'
    if (detailView) detailView.style.display = 'none'

    // 캐시 확인 (채널 필터 없을 때만 캐시 사용)
    const cacheKey = 'inbox_' + (channelId || 'all')
    const cached = Cache.get(cacheKey)
    if (cached) {
      channelEl.innerHTML = cached
    } else {
      channelEl.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    }

    try {
      const url = channelId ? `/alarms/inbox?channel_id=${channelId}` : '/alarms/inbox'
      const res = await apiWithTimeout(API.get(url))
      const resData = res.data
      if (!resData.success) throw new Error()
      const filterHtml = this._buildChannelFilter(resData.channels || [], channelId, 'App.loadInbox')
      if (!resData.data || !resData.data.length) {
        channelEl.innerHTML = filterHtml + '<div class="empty-box">받은 알람이 없습니다.</div>'
        return
      }
      const iconMap = {
        youtube: '<i class="fab fa-youtube" style="color:#FF0000;font-size:20px;"></i>',
        audio:   '<i class="fas fa-music"   style="color:#4FC3F7;font-size:20px;"></i>',
        video:   '<i class="fas fa-video"   style="color:#66BB6A;font-size:20px;"></i>',
        file:    '<i class="fas fa-file"    style="color:#90A4AE;font-size:20px;"></i>'
      }
      const statusMap = { pending:'대기', received:'확인중', accepted:'수락', rejected:'거절', timeout:'미수신', failed:'미수신' }
      const statusColor = { pending:'#90A4AE', received:'#4FC3F7', accepted:'#66BB6A', rejected:'#FF5252', timeout:'#FFA726', failed:'#FFA726' }
      const items = resData.data.map(item => {
        const typeIcon = iconMap[item.msg_type] || '<i class="fas fa-bell" style="color:#90A4AE;font-size:20px;"></i>'
        const timeStr = this._fmtAlarmTime(item.scheduled_at || item.received_at)
        const stLabel = statusMap[item.status] || item.status
        const stColor = statusColor[item.status] || '#90A4AE'
        const chImg = item.channel_image
          ? `<img src="${item.channel_image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
          : `<span style="font-size:11px;font-weight:700;">${(item.channel_name||'?').charAt(0).toUpperCase()}</span>`
        return `<div class="alarm-list-row" style="cursor:pointer;" onclick="App.openAlarmContent(${item.id},${item.channel_id},'${(item.channel_name||'').replace(/'/g,"&#39;")}','${item.msg_type||''}','${(item.msg_value||'').replace(/'/g,"&#39;")}','${(item.link_url||'').replace(/'/g,"&#39;")}','inbox')">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">${chImg}</div>
          <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${typeIcon}</div>
          <span class="alarm-list-channel">${item.channel_name}</span>
          <span class="alarm-list-time">${timeStr}</span>
          <span class="alarm-list-status" style="color:${stColor};">${stLabel}</span>
        </div>`
      }).join('')
      const html = filterHtml + items
      channelEl.innerHTML = html
      Cache.set(cacheKey, html)
    } catch(e) {
      if (!cached) channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
      if (e.message === 'timeout') App.showToast('네트워크가 느립니다. 다시 시도해주세요.', 'error')
    }
  },

  inboxOpenChannel(group) {},

  inboxBack() {
    document.getElementById('inbox-channel-list').style.display = 'block'
    const dv = document.getElementById('inbox-detail-view')
    if (dv) dv.style.display = 'none'
  },

  // ── 발신함 ──────────────────────────────
  async loadSend(channelId = '') {
    const channelEl = document.getElementById('outbox-channel-list')
    const detailView = document.getElementById('outbox-detail-view')
    if (!channelEl) return
    channelEl.style.display = 'block'
    if (detailView) detailView.style.display = 'none'

    // 캐시 확인
    const cacheKey = 'outbox_' + (channelId || 'all')
    const cached = Cache.get(cacheKey)
    if (cached) {
      channelEl.innerHTML = cached
    } else {
      channelEl.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    }

    try {
      const url = channelId ? `/alarms/outbox?channel_id=${channelId}` : '/alarms/outbox'
      const res = await apiWithTimeout(API.get(url))
      const resData = res.data
      if (!resData.success) throw new Error()
      const filterHtml = this._buildChannelFilter(resData.channels || [], channelId, 'App.loadSend')
      if (!resData.data || !resData.data.length) {
        channelEl.innerHTML = filterHtml + '<div class="empty-box">발신한 알람이 없습니다.</div>'
        return
      }
      const iconMap = {
        youtube: '<i class="fab fa-youtube" style="color:#FF0000;font-size:20px;"></i>',
        audio:   '<i class="fas fa-music"   style="color:#4FC3F7;font-size:20px;"></i>',
        video:   '<i class="fas fa-video"   style="color:#66BB6A;font-size:20px;"></i>',
        file:    '<i class="fas fa-file"    style="color:#90A4AE;font-size:20px;"></i>'
      }
      const statusMap = { pending:'대기', received:'확인중', accepted:'수락', rejected:'거절', timeout:'미수신', failed:'미수신' }
      const statusColor = { pending:'#90A4AE', received:'#4FC3F7', accepted:'#66BB6A', rejected:'#FF5252', timeout:'#FFA726', failed:'#FFA726' }
      const seenIds = new Set()
      const dedupedData = resData.data.filter(item => {
        const key = item.alarm_id || ('log_' + item.id)
        if (seenIds.has(key)) return false
        seenIds.add(key)
        return true
      })
      const items = dedupedData.map(item => {
        const typeIcon = iconMap[item.msg_type] || '<i class="fas fa-bell" style="color:#90A4AE;font-size:20px;"></i>'
        const timeStr = this._fmtAlarmTime(item.scheduled_at || item.received_at)
        const stLabel = statusMap[item.status] || item.status
        const stColor = statusColor[item.status] || '#90A4AE'
        const chImg = item.channel_image
          ? `<img src="${item.channel_image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
          : `<span style="font-size:11px;font-weight:700;">${(item.channel_name||'?').charAt(0).toUpperCase()}</span>`
        return `<div class="alarm-list-row" style="cursor:pointer;" onclick="App.openAlarmContent(${item.id},${item.channel_id},'${(item.channel_name||'').replace(/'/g,"&#39;")}','${item.msg_type||''}','${(item.msg_value||'').replace(/'/g,"&#39;")}','${(item.link_url||'').replace(/'/g,"&#39;")}','outbox')">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">${chImg}</div>
          <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${typeIcon}</div>
          <span class="alarm-list-channel">${item.channel_name}</span>
          <span class="alarm-list-time">${timeStr}</span>
          <span class="alarm-list-status" style="color:${stColor};">${stLabel}</span>
        </div>`
      }).join('')
      const html = filterHtml + items
      channelEl.innerHTML = html
      Cache.set(cacheKey, html)
    } catch(e) {
      if (!cached) channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
      if (e.message === 'timeout') App.showToast('네트워크가 느립니다. 다시 시도해주세요.', 'error')
    }
  },

  outboxOpenChannel(group) {},

  outboxBack() {
    document.getElementById('outbox-channel-list').style.display = 'block'
    const dv = document.getElementById('outbox-detail-view')
    if (dv) dv.style.display = 'none'
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

    // 2. 상태 업데이트 (수신함만)
    if (logId && source === 'inbox') {
      try { await API.post(`/alarms/inbox/${logId}/status`, { status: 'accepted' }) } catch(e) {}
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
    } else if ((msgType === 'video' || msgType === 'file') && msgValue) {
      // file 타입도 확장자로 오디오/비디오 판단
      const isAudioFile = ['mp3','m4a','wav','aac','ogg','flac','wma'].some(e => msgValue.toLowerCase().includes('.'+e))
      if (isAudioFile) {
        if (audioEl && audioWrap) { audioEl.src = msgValue; audioWrap.classList.add('active'); audioEl.play?.().catch(()=>{}) }
      } else {
        if (videoEl) { videoEl.src = msgValue; videoEl.style.display = 'block'; videoEl.play?.().catch(()=>{}) }
      }
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

    // 돌아갈 탭 새로고침
    const source = screen.dataset.source
    if (source === 'inbox') this.loadInbox()
    else if (source === 'outbox') this.loadSend()
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
        Cache.del('home_' + Store.getUserId())
        Cache.del('channels')
        this.closeModal('modal-create')
        this.loadHome()
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

  // 알람 목록 로드 및 표시
  async _loadAlarmList(chId) {
    const section   = document.getElementById('alarm-list-section')
    const body      = document.getElementById('alarm-list-body')
    const addArea   = document.getElementById('alarm-add-area')
    if (!section || !body) return
    try {
      const res  = await API.get('/alarms?channel_id=' + chId)
      // 서버에서 이미 지난 알람을 자동 삭제해서 반환하지만,
      // 혹시 남아있는 경우를 대비해 프론트에서도 과거 알람 필터링
      const now  = new Date()
      const list = (res.data?.data || []).filter(a => {
        if (a.status !== 'pending' && a.status !== 'triggered') return false
        // 이미 지난 알람: 클라이언트에서 즉시 삭제 요청 (fire-and-forget)
        if (new Date(a.scheduled_at) < now) {
          API.delete('/alarms/' + a.id).catch(() => {})
          return false
        }
        return true
      })

      // ⚠️ 채널당 알람 1개 제한
      if (addArea) {
        if (list.length >= 1) {
          addArea.style.opacity = '0.35'
          addArea.style.pointerEvents = 'none'
          if (!addArea.querySelector('.alarm-limit-msg')) {
            const msg = document.createElement('div')
            msg.className = 'alarm-limit-msg'
            msg.style.cssText = 'font-size:12px;color:#FF9800;padding:4px 0 10px;'
            msg.innerHTML = '<i class="fas fa-exclamation-circle"></i> 채널당 알람은 1개만 설정 가능합니다. 기존 알람을 삭제하세요.'
            addArea.prepend(msg)
          }
        } else {
          addArea.style.opacity = '1'
          addArea.style.pointerEvents = ''
          addArea.querySelector('.alarm-limit-msg')?.remove()
        }
      }

      if (list.length === 0) {
        section.style.display = 'none'
        return
      }
      section.style.display = 'block'
      const srcLabel = { youtube:'YouTube', audio:'오디오', video:'비디오', file:'파일' }
      body.innerHTML = list.map(alarm => {
        const dt = new Date(alarm.scheduled_at)
        const dateStr = dt.toLocaleDateString('ko-KR', { month:'long', day:'numeric' })
        const timeStr = dt.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);">⏰ ${dateStr} ${timeStr}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">${srcLabel[alarm.msg_type] || alarm.msg_type} · 대상 ${alarm.total_targets}명</div>
          </div>
          <button onclick="App._cancelAlarm(${alarm.id})" style="background:rgba(255,59,48,0.15);border:none;border-radius:8px;padding:6px 12px;color:#FF3B30;font-size:12px;cursor:pointer;">
            <i class="fas fa-trash"></i> 삭제
          </button>
        </div>`
      }).join('')
    } catch(e) {
      section.style.display = 'none'
    }
  },

  // 알람 취소
  async _cancelAlarm(alarmId) {
    if (!confirm('이 알람을 삭제하시겠습니까?')) return
    try {
      await API.delete('/alarms/' + alarmId)
      toast('알람이 삭제됐습니다')
      this._loadAlarmList(currentAlarmChId)
    } catch(e) {
      toast('삭제 실패: ' + e.message, 3000)
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

  // 파일 업로드 후 미디어 미리보기 (오디오/비디오 플레이어)
  _showMediaPreview(mediaType, url, fileName) {
    const preview = document.getElementById('alarm-file-preview')
    if (!preview) return
    preview.style.display = 'block'
    if (mediaType === 'audio') {
      preview.innerHTML = `
        <div style="width:100%;padding:8px 0;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">🎵 미리보기: ${fileName}</div>
          <audio controls style="width:100%;height:36px;" src="${url}">
            브라우저가 오디오 재생을 지원하지 않습니다.
          </audio>
        </div>
      `
    } else {
      preview.innerHTML = `
        <div style="width:100%;padding:8px 0;">
          <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">🎬 미리보기: ${fileName}</div>
          <video controls playsinline style="width:100%;max-height:200px;border-radius:8px;background:#000;" src="${url}">
            브라우저가 비디오 재생을 지원하지 않습니다.
          </video>
        </div>
      `
    }
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
    window._selectedAlarmFileName = null
    alarmMsgSrc = ''
    const label = document.getElementById('alarm-file-label')
    if (label) { label.textContent = '파일을 선택하세요 (오디오/비디오)'; label.style.color = 'var(--text3)' }
    const clearBtn = document.getElementById('alarm-file-clear')
    if (clearBtn) clearBtn.style.display = 'none'
    const input = document.getElementById('alarm-attach-file')
    if (input) input.value = ''
    // 미디어 프리뷰 숨김
    const preview = document.getElementById('alarm-file-preview')
    if (preview) { preview.style.display = 'none'; preview.innerHTML = '' }
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
        this._refreshAlarmBtn(currentAlarmChId)
        // 알람 목록 갱신 후 모달 닫기
        await this._loadAlarmList(currentAlarmChId)
        this.closeModal('modal-alarm')
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
    const hasAlarmDetail = (ch.pending_alarm_count || 0) > 0
    const alarmCls = hasAlarmDetail ? 'ch-action-btn btn-alarm has-alarm' : 'ch-action-btn btn-alarm'
    let btns = ''
    if (isOwner) {
      btns =
        '<button class="' + alarmCls + '" onclick="App.openAlarmModal(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')" title="알람설정"><i class="fas fa-clock"></i></button>' +
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

    // 1) 캐시 있으면 즉시 표시
    const cacheKey = 'ch_detail_' + chId
    const cached = Cache.get(cacheKey)
    if (cached) {
      this._renderChannelDetail(document.getElementById('ch-detail-scroll'), cached)
    }
    this.openModal('modal-channel-detail')

    // 2) API 조회 (캐시 갱신)
    try {
      const res = await API.get('/channels/' + chId)
      const ch  = res.data?.data
      if (!ch) {
        if (!cached) document.getElementById('ch-detail-scroll').innerHTML = '<div class="empty-box">채널 정보를 불러올 수 없습니다.</div>'
        return
      }
      Cache.set(cacheKey, ch)
      this._renderChannelDetail(document.getElementById('ch-detail-scroll'), ch)
    } catch (e) {
      if (!cached) {
        const sc = document.getElementById('ch-detail-scroll')
        if (sc) sc.innerHTML = '<div class="empty-box">오류: ' + e.message + '</div>'
      }
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
        this.closeModal('modal-channel-detail')
        this.loadHome()
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
        const MAX = 300  // 최대 300×300
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else       { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // JPEG quality 0.7 → 보통 30~80KB 수준
        selectedImg = canvas.toDataURL('image/jpeg', 0.7)
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
  // data: { type:'audio'|'video'|'file', name:'xxx.mp3', path:'/storage/...', size:12345, base64:'data:...' }
  const { type, name, path, size, base64 } = data

  // 오디오 녹음 완료 시 버튼 상태 리셋 (하위 호환)
  if (type === 'audio' && App._audioRecording) {
    App._audioRecording = false
    const btn = document.getElementById('record-audio-btn')
    if (btn) {
      btn.innerHTML = '<i class="fas fa-microphone mr-1"></i>직접 녹음'
      btn.classList.remove('bg-red-500', 'hover:bg-red-600')
      btn.classList.add('bg-teal-500', 'hover:bg-teal-600')
    }
  }

  // alarmMsgSrc 자동 판단
  const isAudio = ['mp3','m4a','wav','aac','ogg','flac','wma'].some(e => name.toLowerCase().endsWith('.'+e))
  const isVideo = ['mp4','mov','mkv','avi','wmv','m4v','webm'].some(e => name.toLowerCase().endsWith('.'+e))
  alarmMsgSrc = isAudio ? 'audio' : (isVideo ? 'video' : type)

  // UI 업데이트 - 업로드 중 표시
  const icon = isAudio ? '🎵' : (isVideo ? '🎬' : '📎')
  const sizeStr = size > 1024*1024 ? (size/1024/1024).toFixed(2) + ' MB' : Math.round(size/1024) + ' KB'
  const label = document.getElementById('alarm-file-label')
  if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ') 업로드 중...'; label.style.color = 'var(--text3)' }

  // YouTube URL 초기화
  App._clearYoutubeUrl()

  // base64가 있으면 Firebase Storage에 업로드
  if (base64 && base64.startsWith('data:')) {
    try {
      // base64 → Blob 변환
      const byteStr = atob(base64.split(',')[1])
      const mimeType = base64.split(',')[0].split(':')[1].split(';')[0]
      const byteArr = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) byteArr[i] = byteStr.charCodeAt(i)
      const blob = new Blob([byteArr], { type: mimeType })
      const file = new File([blob], name, { type: mimeType })

      // FormData 생성
      const formData = new FormData()
      formData.append('file', file)
      formData.append('session_token', Store.getToken() || '')

      // 서버 업로드 API 호출
      const res = await fetch('/api/uploads/alarm-file', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      if (result.success && result.url) {
        // 업로드 성공 → URL을 msg_value로 사용
        window._selectedAlarmFile = result.url     // Firebase Storage URL
        window._selectedAlarmPath = result.filePath || path
        window._selectedAlarmFileName = name       // 원본 파일명 (표시용)

        if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ')'; label.style.color = 'var(--text)' }
        const clearBtn = document.getElementById('alarm-file-clear')
        if (clearBtn) clearBtn.style.display = 'inline-flex'

        // 미리보기 재생
        App._showMediaPreview(isAudio ? 'audio' : 'video', result.url, name)        toast('✅ 파일 업로드 완료: ' + name, 2000)
      } else {
        if (label) { label.textContent = '❌ 업로드 실패'; label.style.color = '#ef4444' }
        window._selectedAlarmFile = null
        toast('파일 업로드 실패: ' + (result.error || '알 수 없는 오류'), 3000)
      }
    } catch(e) {
      if (label) { label.textContent = '❌ 업로드 오류'; label.style.color = '#ef4444' }
      window._selectedAlarmFile = null
      toast('업로드 오류: ' + e.message, 3000)
    }
  } else {
    // base64 없음 (구버전 APK) - 파일명만 저장 (업로드 불가)
    window._selectedAlarmFile = null
    window._selectedAlarmFileName = name
    if (label) { label.textContent = icon + ' ' + name + ' (' + sizeStr + ') ⚠️ 최신 앱 설치 필요'; label.style.color = '#f59e0b' }
    const clearBtn = document.getElementById('alarm-file-clear')
    if (clearBtn) clearBtn.style.display = 'inline-flex'
    toast('⚠️ 파일 업로드는 최신 앱에서 가능합니다', 3000)
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
  // 저장된 테마 적용 (기본값: light)
  const savedTheme = localStorage.getItem('theme') || 'light'
  App.applyTheme(savedTheme)

  // 드로어 사용자 이메일 표시
  const drawerEmail = document.getElementById('drawer-user-email')
  if (drawerEmail) drawerEmail.textContent = Store.getEmail() || Store.getDisplayName() || '로그인 중...'

  // ── Flutter WebView 전용: JS는 판단하지 않고 Flutter 신호만 대기 ──
  // flutterSetSession() → 홈으로 이동
  // flutterNeedLogin()  → 로그인 화면 (이메일 선택은 Flutter 네이티브에서 처리)
  // 웹 브라우저 직접 접속 시에만 기존 방식으로 처리
  if (window.FlutterBridge) {
    // Flutter 앱 내: 로딩 스피너만 표시하고 Flutter 신호 대기
    // _injectSession() 또는 flutterNeedLogin() 이 호출될 때까지 대기
    // (아무것도 하지 않음 - flutterSetSession/flutterNeedLogin 이 알아서 처리)
  } else {
    // 웹 브라우저 직접 접속: 기존 방식 유지
    if (Store.isLoggedIn()) {
      _doLogin()
    } else {
      Auth.show()
    }
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
}

// Flutter에서 세션 없음 신호 수신 시 호출 (현재는 사용 안 함 - Flutter 네이티브에서 처리)
// 혹시 모를 예외 상황 대비용
window.flutterNeedLogin = function() {
  // Flutter 앱에서는 로그인을 Flutter 네이티브(AuthScreen)에서 처리하므로
  // 이 함수는 호출되지 않아야 정상. 만약 호출되면 로딩 상태만 유지.
  console.log('[flutterNeedLogin] Flutter 네이티브에서 처리됨')
}
