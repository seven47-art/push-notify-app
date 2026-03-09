// public/static/mobile-app.js  v17
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
let alarmMsgSrc  = 'youtube'  // 'youtube'|'audio'|'video'|'file'
let alarmDate    = null        // Date 객체
let alarmHour    = 9
let alarmMin     = 0
let calYear      = 0
let calMonth     = 0           // 0-based

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
  // 이미지 없을 때 RinGo 아이콘 기본 표시
  return `<div style="${s}background:transparent;">
    <img src="/static/ringo-icon.png" style="width:100%;height:100%;object-fit:cover;">
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
  },

  // 뒤로가기 (전체 페이지에서 홈으로)
  gotoBack() {
    if (currentTab === 'owned-all' || currentTab === 'joined-all') {
      this.goto('home')
    }
  },

  // ── 뒤로가기 (Android 하단 뒤로가기 버튼) ─────────────
  // Flutter에서 호출 → true 반환 시 Flutter가 앱 종료 처리
  goBack() {
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
    // 3. 모달이 열려있으면 닫기
    const openModal = document.querySelector('.fullscreen-overlay.active')
    if (openModal) {
      openModal.classList.remove('active'); return false
    }
    // 4. 드로어가 열려있으면 닫기
    const drawer = document.getElementById('drawer')
    if (drawer && drawer.classList.contains('open')) {
      this.closeDrawer(); return false
    }
    // 5. 전체 페이지(운영/가입채널)에서 홈으로
    if (currentTab === 'owned-all' || currentTab === 'joined-all') {
      this.goto('home'); return false
    }
    // 6. 홈이 아닌 탭이면 홈으로
    if (currentTab !== 'home') {
      this.goto('home'); return false
    }
    // 7. 홈 탭이면 Flutter에서 앱 종료 처리
    return true
  },

  // ── 드로어 ───────────────────────────────
  openDrawer()  {
    document.getElementById('drawer-overlay').classList.add('open')
    document.getElementById('drawer').classList.add('open')
  },
  closeDrawer() {
    document.getElementById('drawer-overlay').classList.remove('open')
    document.getElementById('drawer').classList.remove('open')
  },

  // ── 홈 화면 ──────────────────────────────
  async loadHome() {
    const uid = Store.getUserId()
    if (!uid) {
      document.getElementById('owned-list').innerHTML  = '<div class="empty-box">로그인이 필요합니다.</div>'
      document.getElementById('joined-list').innerHTML = ''
      return
    }

    // 헤더 사용자 이름 표시
    const nameEl = document.getElementById('home-username')
    if (nameEl) nameEl.textContent = Store.getDisplayName() || Store.getEmail() || '사용자'

    document.getElementById('owned-list').innerHTML  = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    document.getElementById('joined-list').innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    document.getElementById('owned-more').style.display  = 'none'
    document.getElementById('joined-more').style.display = 'none'

    try {
      const [oRes, jRes] = await Promise.all([
        API.get('/channels?owner_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } })),
        API.get('/subscribers?user_id=' + encodeURIComponent(uid)).catch(() => ({ data: { data: [] } }))
      ])
      ownedChannels  = oRes.data?.data || []
      // 내가 운영하는 채널은 가입채널에서 제외
      const ownedIds = new Set(ownedChannels.map(c => c.id))
      joinedChannels = (jRes.data?.data || []).filter(s => !ownedIds.has(s.channel_id))
    } catch { ownedChannels = []; joinedChannels = [] }

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
    el.innerHTML = preview.map(ch => this._ownedTileHtml(ch)).join('')

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
    el.innerHTML = ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')
    document.getElementById('owned-more').style.display = 'none'
  },

  // ── 나의 운영채널 전체 페이지 ──────────────────────────
  loadOwnedAll() {
    const el = document.getElementById('owned-all-list')
    if (!el) return
    if (!ownedChannels.length) {
      el.innerHTML = '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
      return
    }
    el.innerHTML = ownedChannels.map(ch => this._ownedTileHtml(ch)).join('')
  },

  // ── 나의 가입채널 전체 페이지 ──────────────────────────
  loadJoinedAll() {
    const el = document.getElementById('joined-all-list')
    if (!el) return
    if (!joinedChannels.length) {
      el.innerHTML = '<div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div>'
      return
    }
    el.innerHTML = joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')
  },

  _ownedTileHtml(ch) {
    const name     = ch.name || '채널'
    const cnt      = ch.subscriber_count || 0
    const id       = ch.id
    const hasAlarm = (ch.pending_alarm_count || 0) > 0
    const alarmCls = hasAlarm ? 'ch-action-btn btn-alarm has-alarm' : 'ch-action-btn btn-alarm'
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:10px;color:var(--text3);margin-left:3px;"></i>' : ''
    return `<div class="channel-tile">
      <div onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        ${avatar(name, ch.image_url, 44)}
      </div>
      <div class="info" onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        <div class="ch-name">${name} (${cnt}) ${lockIcon}</div>
        <div class="ch-sub">${ch.description || '채널 운영자'}</div>
      </div>
      <div class="ch-actions">
        <button class="${alarmCls}"        onclick="App.openAlarmModal(${id},'${name.replace(/'/g,"\\'")}');" title="알람설정"><i class="fas fa-clock"></i></button>
        <button class="ch-action-btn btn-invite"  onclick="App.openInviteModal(${id},'${name.replace(/'/g,"\\'")}');" title="초대코드"><i class="fas fa-share-alt"></i></button>
        <button class="ch-action-btn btn-setting" onclick="App.openEditChannel(${id});"                               title="설정"><i class="fas fa-cog"></i></button>
      </div>
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
    el.innerHTML = preview.map(ch => this._joinedTileHtml(ch)).join('')

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
    el.innerHTML = joinedChannels.map(ch => this._joinedTileHtml(ch)).join('')
    document.getElementById('joined-more').style.display = 'none'
  },

  _joinedTileHtml(ch) {
    const name = ch.channel_name || ch.name || '채널'
    const chId = ch.channel_id || ch.id
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:10px;color:var(--text3);margin-left:3px;"></i>' : ''
    return `<div class="joined-tile" onclick="App.openChannelDetail(${chId},'${name}')">
      ${avatar(name, ch.image_url, 44)}
      <div class="info">
        <div class="ch-name">${name} ${lockIcon}</div>
        <div class="ch-sub">구독 중</div>
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

    // 인기채널 · 베스트채널 동시 로드
    const popularEl = document.getElementById('channel-list-popular')
    const bestEl    = document.getElementById('channel-list-best')
    const spinner   = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    if (popularEl) popularEl.innerHTML = spinner
    if (bestEl)    bestEl.innerHTML    = spinner

    try {
      const [popRes, bestRes, allRes] = await Promise.all([
        API.get('/channels/popular'),
        API.get('/channels/best'),
        API.get('/channels')
      ])
      const popList  = popRes.data?.data  || []
      const bestList = bestRes.data?.data || []

      // 전역 캐시 (검색용 — 전체 채널)
      window._allChannelList = allRes.data?.data || []

      if (popularEl) {
        popularEl.innerHTML = popList.length
          ? popList.map(ch => this._channelTileHtml(ch)).join('')
          : '<div class="empty-box" style="margin:4px 14px;">인기 채널이 없습니다.</div>'
      }
      if (bestEl) {
        bestEl.innerHTML = bestList.length
          ? bestList.map(ch => this._channelTileHtml(ch)).join('')
          : '<div class="empty-box" style="margin:4px 14px;">베스트 채널이 없습니다.</div>'
      }
    } catch {
      if (popularEl) popularEl.innerHTML = '<div class="empty-box">채널 목록을 불러올 수 없습니다.</div>'
      if (bestEl)    bestEl.innerHTML    = ''
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
    const lockIcon = ch.is_secret ? '<i class="fas fa-lock" style="font-size:10px;color:var(--text3);margin-left:3px;"></i>' : ''
    return `<div class="ch-all-tile" onclick="App.openChannelDetail(${ch.id},'${name.replace(/'/g,"\'")}')">
      ${avatar(name, ch.image_url, 44)}
      <div class="info">
        <div class="ch-name">${name.replace(/</g,'&lt;')} ${lockIcon}</div>
        <div class="ch-sub">${subLabel} · <i class="fas fa-users" style="font-size:10px;"></i> ${subCnt}명</div>
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
    el.innerHTML = list.map(ch => this._channelTileHtml(ch)).join('')
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
  async loadInbox() {
    const channelEl = document.getElementById('inbox-channel-list')
    const detailView = document.getElementById('inbox-detail-view')
    if (!channelEl) return
    // 채널 목록 뷰로 초기화
    channelEl.style.display = 'block'
    detailView.style.display = 'none'
    channelEl.innerHTML = '<div class="empty-box" style="padding:30px 0;"><i class="fas fa-spinner fa-spin"></i></div>'
    try {
      const res = await API.get('/alarms/inbox')
      if (!res.success || !res.data.length) {
        channelEl.innerHTML = '<div class="empty-box">받은 알람이 없습니다.</div>'
        return
      }
      const icons = { audio:'🎵', video:'🎬', youtube:'📺', file:'📎' }
      channelEl.innerHTML = res.data.map(g => {
        const first = g.items[0]
        const typeLabel = icons[first?.msg_type] || '🔔'
        const timeStr = first ? this._fmtTime(first.received_at) : ''
        const initial = (g.channel_name || '?')[0].toUpperCase()
        const badge = g.unread > 0 ? `<div class="ch-group-badge">${g.unread}</div>` : ''
        return `<div class="ch-group-card" onclick="App.inboxOpenChannel(${JSON.stringify(g).replace(/"/g,'&quot;')})">
          <div class="ch-group-avatar">${initial}</div>
          <div class="ch-group-info">
            <div class="ch-group-name">${g.channel_name}</div>
            <div class="ch-group-last">${typeLabel} ${this._msgLabel(first?.msg_type)} &nbsp;·&nbsp; ${g.items.length}개</div>
          </div>
          <div class="ch-group-meta">
            <div class="ch-group-time">${timeStr}</div>
            ${badge}
          </div>
        </div>`
      }).join('')
    } catch(e) {
      channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
    }
  },

  inboxOpenChannel(group) {
    const channelEl = document.getElementById('inbox-channel-list')
    const detailView = document.getElementById('inbox-detail-view')
    const titleEl = document.getElementById('inbox-detail-title')
    const listEl  = document.getElementById('inbox-detail-list')
    channelEl.style.display = 'none'
    detailView.style.display = 'flex'
    titleEl.textContent = group.channel_name
    const icons = { audio:'🎵', video:'🎬', youtube:'📺', file:'📎' }
    listEl.innerHTML = group.items.map(item => {
      const typeIcon = icons[item.msg_type] || '🔔'
      const timeStr  = this._fmtTime(item.received_at)
      const statusBadge = item.status === 'accepted'
        ? '<span class="status-badge badge-accepted">✔ 수락</span>'
        : item.status === 'rejected'
        ? '<span class="status-badge badge-rejected">✕ 거절</span>'
        : ''
      return `<div class="notif-card">
        <div class="notif-header">
          <div class="notif-icon-wrap" style="font-size:18px;">${typeIcon}</div>
          <div class="notif-meta">
            <div class="notif-title">${this._msgLabel(item.msg_type)}</div>
            <div class="notif-channel">${group.channel_name}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <div class="notif-time">${timeStr}</div>
            ${statusBadge}
          </div>
        </div>
      </div>`
    }).join('')
  },

  inboxBack() {
    document.getElementById('inbox-channel-list').style.display = 'block'
    document.getElementById('inbox-detail-view').style.display  = 'none'
  },

  // ── 발신함 ──────────────────────────────
  async loadSend() {
    const channelEl = document.getElementById('outbox-channel-list')
    const detailView = document.getElementById('outbox-detail-view')
    if (!channelEl) return
    channelEl.style.display = 'block'
    detailView.style.display = 'none'
    channelEl.innerHTML = '<div class="empty-box" style="padding:30px 0;"><i class="fas fa-spinner fa-spin"></i></div>'
    try {
      const res = await API.get('/alarms/outbox')
      if (!res.success || !res.data.length) {
        channelEl.innerHTML = '<div class="empty-box">발신한 알람이 없습니다.</div>'
        return
      }
      const icons = { audio:'🎵', video:'🎬', youtube:'📺', file:'📎' }
      channelEl.innerHTML = res.data.map(g => {
        const first = g.items[0]
        const timeStr = first ? this._fmtTime(first.scheduled_at) : ''
        const initial = (g.channel_name || '?')[0].toUpperCase()
        return `<div class="ch-group-card" onclick="App.outboxOpenChannel(${JSON.stringify(g).replace(/"/g,'&quot;')})">
          <div class="ch-group-avatar">${initial}</div>
          <div class="ch-group-info">
            <div class="ch-group-name">${g.channel_name}</div>
            <div class="ch-group-last">${g.items.length}건 발신</div>
          </div>
          <div class="ch-group-meta">
            <div class="ch-group-time">${timeStr}</div>
          </div>
        </div>`
      }).join('')
    } catch(e) {
      channelEl.innerHTML = '<div class="empty-box">불러오기 실패</div>'
    }
  },

  outboxOpenChannel(group) {
    const channelEl = document.getElementById('outbox-channel-list')
    const detailView = document.getElementById('outbox-detail-view')
    const titleEl = document.getElementById('outbox-detail-title')
    const listEl  = document.getElementById('outbox-detail-list')
    channelEl.style.display = 'none'
    detailView.style.display = 'flex'
    titleEl.textContent = group.channel_name
    const icons = { audio:'🎵', video:'🎬', youtube:'📺', file:'📎' }
    const statusMap = { triggered:'send-status-triggered', pending:'send-status-pending', cancelled:'send-status-cancelled' }
    const statusLabel = { triggered:'발송완료', pending:'대기중', cancelled:'취소됨' }
    listEl.innerHTML = group.items.map(item => {
      const typeIcon = icons[item.msg_type] || '🔔'
      const timeStr  = this._fmtTime(item.scheduled_at)
      const stCls    = statusMap[item.status] || 'send-status-pending'
      const stLabel  = statusLabel[item.status] || item.status
      return `<div class="send-card">
        <div class="send-card-header">
          <span style="font-size:16px;">${typeIcon}</span>
          <span class="send-type-badge">${this._msgLabel(item.msg_type)}</span>
          <span class="send-status-badge ${stCls}">${stLabel}</span>
        </div>
        <div class="send-card-time"><i class="fas fa-clock" style="margin-right:4px;"></i>${timeStr}</div>
        <div class="send-card-stats"><i class="fas fa-users" style="margin-right:4px;"></i>대상 ${item.total_targets || 0}명 · 발송 ${item.sent_count || 0}명</div>
      </div>`
    }).join('')
  },

  outboxBack() {
    document.getElementById('outbox-channel-list').style.display = 'block'
    document.getElementById('outbox-detail-view').style.display  = 'none'
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

  // ── 설정 ────────────────────────────────
  loadSettings() {
    document.getElementById('settings-user-id').textContent  = Store.getUserId()
    const tok = Store.getFcmToken()
    document.getElementById('settings-fcm-token').textContent = tok.substring(0, 20) + '...'

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
    // Flutter 앱에 로그아웃 알림 → 네이티브 로그인 화면으로 이동
    if (window.FlutterBridge) {
      window.FlutterBridge.postMessage(JSON.stringify({ action: 'logout' }))
    } else {
      // 웹 브라우저 환경 fallback
      toast('로그아웃 됐습니다')
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
  openCreateChannel() {
    selectedImg = null
    document.getElementById('create-name').value     = ''
    document.getElementById('create-phone').value    = ''
    document.getElementById('create-desc').value     = ''
    document.getElementById('create-homepage').value = ''
    document.getElementById('create-password').value = ''
    document.getElementById('create-is-secret').checked = false
    document.getElementById('create-secret-wrap').style.display = 'none'
    document.getElementById('create-name-cnt').textContent = '0/10'
    document.getElementById('create-desc-cnt').textContent = '0/50'
    document.getElementById('create-img-thumb').innerHTML =
      '<img src="/static/ringo-icon.png" style="width:100%;height:100%;object-fit:cover;">'
    this.openModal('modal-create')
    setTimeout(() => document.getElementById('create-name').focus(), 300)
  },

  toggleSecretCreate(checked) {
    document.getElementById('create-secret-wrap').style.display = checked ? 'block' : 'none'
    if (!checked) document.getElementById('create-password').value = ''
  },

  toggleSecretEdit(checked) {
    document.getElementById('edit-secret-wrap').style.display = checked ? 'block' : 'none'
    if (!checked) document.getElementById('edit-password').value = ''
  },

  async createChannel() {
    const name = document.getElementById('create-name').value.trim()
    const desc = document.getElementById('create-desc').value.trim()
    const isSecret = document.getElementById('create-is-secret').checked
    const password = document.getElementById('create-password').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }
    if (!desc) { toast('채널 소개를 입력하세요'); return }
    if (isSecret && !password) { toast('비밀채널은 비밀번호를 입력하세요'); return }

    try {
      const res = await API.post('/channels', {
        name, description: desc,
        phone_number:  document.getElementById('create-phone').value.trim() || null,
        homepage_url:  document.getElementById('create-homepage').value.trim() || null,
        image_url:     selectedImg || null,
        owner_id:      Store.getUserId(),
        is_secret:     isSecret ? 1 : 0,
        password:      isSecret ? password : null
      })
      if (res.data?.success || res.data?.data) {
        toast('채널이 생성되었습니다!')
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
    document.getElementById('edit-name').value         = ch.name || ''
    document.getElementById('edit-desc').value         = ch.description || ''
    document.getElementById('edit-homepage').value     = ch.homepage_url || ''
    document.getElementById('edit-password').value     = ''
    document.getElementById('edit-is-secret').checked  = !!ch.is_secret
    document.getElementById('edit-secret-wrap').style.display = ch.is_secret ? 'block' : 'none'

    const thumb = document.getElementById('edit-img-thumb')
    thumb.innerHTML = ch.image_url
      ? `<img src="${ch.image_url}" style="width:100%;height:100%;object-fit:cover;">`
      : '<img src="/static/ringo-icon.png" style="width:100%;height:100%;object-fit:cover;">'
    this.openModal('modal-edit')
  },

  async saveEditChannel() {
    const id       = document.getElementById('edit-channel-id').value
    const name     = document.getElementById('edit-name').value.trim()
    const isSecret = document.getElementById('edit-is-secret').checked
    const password = document.getElementById('edit-password').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }

    try {
      await API.put('/channels/' + id, {
        name,
        description:   document.getElementById('edit-desc').value.trim(),
        homepage_url:  document.getElementById('edit-homepage').value.trim(),
        is_secret:     isSecret ? 1 : 0,
        ...(isSecret && password ? { password } : {}),
        ...(!isSecret ? { remove_password: true } : {}),
        ...(selectedImg ? { image_url: selectedImg } : {})
      })
      toast('채널이 수정됐습니다')
      this.closeModal('modal-edit')
      this.loadHome()
    } catch (e) {
      const msg = e.response?.data?.error || e.message
      if (e.response?.status === 409) {
        toast('이미 사용 중인 채널명입니다', 3500)
      } else {
        toast('수정 실패: ' + msg, 3000)
      }
    }
  },

  confirmDeleteChannelFromEdit() {
    const id   = document.getElementById('edit-channel-id').value
    const name = document.getElementById('edit-name').value.trim()
    if (!confirm(`"${name}" 채널을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    API.delete('/channels/' + id)
      .then(() => { toast('삭제됐습니다'); this.closeModal('modal-edit'); this.loadHome() })
      .catch(e => toast('삭제 실패: ' + e.message, 3000))
  },

  // ── 알람 설정 모달 ──────────────────────
  async openAlarmModal(chId, name) {
    currentAlarmChId = chId
    const titleEl = document.getElementById('alarm-modal-title')
    if (titleEl) titleEl.textContent = name + ' · 알람 설정'

    // 기본값 설정: 현재 시각 + 10분
    const now = new Date()
    alarmDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    calYear   = alarmDate.getFullYear()
    calMonth  = alarmDate.getMonth()
    alarmHour = now.getHours()
    alarmMin  = Math.ceil(now.getMinutes() / 5) * 5
    if (alarmMin >= 60) { alarmMin = 0; alarmHour = (alarmHour + 1) % 24 }

    // 소스 기본값 초기화 (youtube로 리셋)
    alarmMsgSrc = 'youtube'
    window._selectedAlarmFile = null
    this.selectMsgSrc('youtube')

    // 입력 초기화
    const ytUrl = document.getElementById('alarm-youtube-url')
    if (ytUrl) ytUrl.value = ''
    // 모든 프리뷰 숨김
    ;['alarm-audio-preview','alarm-video-preview','alarm-file-preview'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.style.display = 'none'; el.textContent = '' }
    })

    this._renderDateLabel()
    this._renderTime()
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
    alarmMsgSrc = src
    window._selectedAlarmFile = null  // 소스 변경 시 파일 초기화

    // 버튼 선택 표시 (youtube, audio, video 3개)
    ;['youtube','audio','video'].forEach(s => {
      document.getElementById('src-' + s)?.classList.toggle('selected', s === src)
    })
    // 영역 전환: 각 소스별 div 표시/숨김
    ;['youtube','audio','video','file'].forEach(s => {
      const area = document.getElementById('alarm-area-' + s)
      if (area) area.style.display = s === src ? 'block' : 'none'
    })
    // 이전 프리뷰 초기화
    ;['alarm-audio-preview','alarm-video-preview','alarm-file-preview'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.style.display = 'none'; el.textContent = '' }
    })
  },
  onAlarmFileSelected(input, type) {
    const file = input.files?.[0]; if (!file) return

    // 타입별 허용 검증 (오디오: audio/* / 비디오: video/*)
    const isAudio = file.type.startsWith('audio/') || ['.mp3','.m4a','.wav','.aac','.ogg','.flac','.wma'].some(e => file.name.toLowerCase().endsWith(e))
    const isVideo = file.type.startsWith('video/') || ['.mp4','.mov','.mkv','.avi','.wmv','.m4v','.webm'].some(e => file.name.toLowerCase().endsWith(e))
    if (type === 'audio' && !isAudio) { toast('오디오 파일을 선택해 주세요'); input.value = ''; return }
    if (type === 'video' && !isVideo) { toast('비디오 파일을 선택해 주세요'); input.value = ''; return }

    // 프리뷰 표시 (파일명 + 용량 + X 버튼)
    const previewId = { audio:'alarm-audio-preview', video:'alarm-video-preview', file:'alarm-file-preview' }[type] || 'alarm-file-preview'
    const icons = { audio:'🎵', video:'🎬', file:'📎' }
    const sizeStr = file.size > 1024*1024 ? (file.size/1024/1024).toFixed(2) + ' MB' : Math.round(file.size/1024) + ' KB'
    App._showFilePreview(previewId, (icons[type] || '📎') + ' ' + file.name + ' (' + sizeStr + ')', type)

    // FileReader로 base64 변환 후 저장 (서버 전송용)
    const reader = new FileReader()
    reader.onload = e => {
      window._selectedAlarmFile = e.target.result  // base64 data URL
    }
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
    const preview = document.getElementById(previewId)
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none' }
    window._selectedAlarmFile = null
    window._selectedAlarmPath = null
    // 파일 input 초기화 (재선택 가능하도록)
    const inputId = { audio:'alarm-audio-file', video:'alarm-video-file', file:'alarm-attach-file' }[type]
    const input = document.getElementById(inputId)
    if (input) input.value = ''
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
  dateMove(delta) {
    const d = new Date(alarmDate)
    d.setDate(d.getDate() + delta)
    const today = new Date(); today.setHours(0,0,0,0)
    if (d < today) { toast('오늘 이후 날짜를 선택하세요'); return }
    alarmDate = d
    this._renderDateLabel()
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
  // 구 달력 함수 (호환성 유지)
  calMove(delta) { this.dateMove(delta) },
  _renderCal() { this._renderDateLabel() },
  selectDate(y, m, d) {
    alarmDate = new Date(y, m, d)
    this._renderDateLabel()
  },

  // ── 시간 피커 ─────────────────────────
  changeHour(delta) {
    alarmHour = (alarmHour + delta + 24) % 24
    this._renderTime()
  },
  changeMin(delta) {
    alarmMin = (alarmMin + delta + 60) % 60
    this._renderTime()
  },
  // 시간 직접 입력
  inputTime(type) {
    const isHour = type === 'hour'
    const cur = isHour ? alarmHour : alarmMin
    const max = isHour ? 23 : 59
    const label = isHour ? '시 (0~23)' : '분 (0~59)'
    const val = prompt(`${label}\n현재: ${String(cur).padStart(2,'0')}`, String(cur))
    if (val === null) return
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0 || n > max) { toast(`0~${max} 사이 숫자를 입력하세요`); return }
    if (isHour) alarmHour = n; else alarmMin = n
    this._renderTime()
  },
  _renderTime() {
    const h = document.getElementById('time-hour')
    const m = document.getElementById('time-min')
    if (h) h.textContent = String(alarmHour).padStart(2, '0')
    if (m) m.textContent = String(alarmMin).padStart(2, '0')
  },

  // ── 알람 저장 ─────────────────────────
  async saveAlarmSetting() {
    if (!alarmDate) { toast('날짜를 선택하세요'); return }
    const dt = new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate(), alarmHour, alarmMin)
    if (dt <= new Date()) { toast('현재 시각 이후를 선택하세요', 2500); return }

    let srcValue = ''
    if (alarmMsgSrc === 'youtube') {
      srcValue = document.getElementById('alarm-youtube-url')?.value.trim() || ''
      if (!srcValue) { toast('YouTube URL을 입력하세요'); return }
      // 유튜브 URL 형식 검증
      if (!srcValue.includes('youtube.com') && !srcValue.includes('youtu.be')) {
        toast('올바른 YouTube URL을 입력하세요'); return
      }
    } else if (alarmMsgSrc === 'audio') {
      srcValue = window._selectedAlarmFile || ''  // 파일명
      if (!srcValue) { toast('오디오 파일을 선택하세요'); return }
    } else if (alarmMsgSrc === 'video') {
      srcValue = window._selectedAlarmFile || ''  // 파일명
      if (!srcValue) { toast('비디오 파일을 선택하세요'); return }
    } else if (alarmMsgSrc === 'file') {
      srcValue = window._selectedAlarmFile || ''  // 파일명
      if (!srcValue) { toast('파일을 선택하세요'); return }
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
        msg_value:    srcValue
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
        this.loadHome()
      } else {
        toast(res.data?.error || '참여 실패', 3000)
      }
    } catch (e) { toast('오류: ' + (e.response?.data?.error || e.message), 3000) }
  },

  // ── 채널 상세 ──────────────────────────
  async openChannelDetail(chId, name) {
    const container = document.getElementById('modal-channel-detail')
    const safeName  = (name || '채널').replace(/</g,'&lt;').replace(/>/g,'&gt;')

    // 1) 로딩 HTML 즉시 삽입 후 화면 열기
    container.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:0 16px;height:56px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;">' +
        '<button onclick="App.closeModal(\'modal-channel-detail\')" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:6px;margin-right:4px;"><i class="fas fa-arrow-left"></i></button>' +
        '<span style="font-size:17px;font-weight:700;flex:1;">채널 소개</span>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;" id="ch-detail-scroll">' +
        '<div class="loading" style="padding:48px;text-align:center;"><i class="fas fa-spinner spin"></i></div>' +
      '</div>'
    this.openModal('modal-channel-detail')

    // 2) API 조회
    try {
      const res = await API.get('/channels/' + chId)
      const ch  = res.data?.data
      if (!ch) { document.getElementById('ch-detail-scroll').innerHTML = '<div class="empty-box">채널 정보를 불러올 수 없습니다.</div>'; return }

      const color = avatarColor(ch.name)
      const init  = (ch.name || '?')[0].toUpperCase()
      const uid   = Store.getUserId()
      const isOwner  = ch.owner_id === uid
      const isJoined = joinedChannels.some(s => (s.channel_id || s.id) === ch.id)

      // 아바타 HTML
      const avHtml = ch.image_url
        ? '<img src="' + ch.image_url + '" style="width:100%;height:100%;object-fit:cover;">'
        : '<img src="/static/ringo-icon.png" style="width:100%;height:100%;object-fit:cover;">'

      // 액션 버튼
      let btns = '<button class="ch-detail-btn-share" onclick="App._shareChannel(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')"><i class="fas fa-share-alt"></i> 공유</button>'
      if (isOwner) {
        btns += '<button class="ch-detail-btn-join" onclick="App.closeModal(\'modal-channel-detail\');App.openEditChannel(' + ch.id + ')"><i class="fas fa-cog"></i> 채널 설정</button>'
      } else if (isJoined) {
        // 가입채널: 알림설정 버튼 없음 (공유만)
      } else {
        btns += '<button class="ch-detail-btn-join" onclick="App._joinFromDetail(' + ch.id + ',\'' + (ch.name||'').replace(/'/g,"\\'") + '\')"><i class="fas fa-plus"></i> 채널 참여</button>'
      }

      // 가입채널일 때만 하단 '채널 나가기' 버튼 (운영자는 제외)
      const leaveBarHtml = (!isOwner && isJoined)
        ? '<div style="padding:16px 16px 32px;flex-shrink:0;">' +
            '<button class="ch-detail-btn-leave" style="width:100%;font-size:16px;padding:16px;" ' +
              'onclick="App._leaveChannelConfirm(' + ch.id + ',\'' + (ch.name||'채널').replace(/'/g,"\\'") + '\')">' +
              '<i class="fas fa-sign-out-alt"></i> 채널 나가기' +
            '</button>' +
          '</div>'
        : '<div style="height:24px;"></div>'

      // 홈페이지 섹션
      let hpHtml = ''
      if (ch.homepage_url) {
        const hpUrl = ch.homepage_url.startsWith('http') ? ch.homepage_url : 'https://' + ch.homepage_url
        hpHtml =
          '<div class="ch-detail-section">' +
            '<div class="ch-detail-section-title"><i class="fas fa-globe" style="color:var(--teal);"></i> 홈페이지</div>' +
            '<a class="ch-detail-link" href="' + hpUrl + '" target="_blank"><i class="fas fa-external-link-alt" style="color:var(--teal);"></i><span>' + ch.homepage_url + '</span></a>' +
          '</div>'
      }

      // 전체 스크롤 영역 HTML
      document.getElementById('ch-detail-scroll').innerHTML =
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
        leaveBarHtml

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
        const pw = prompt('🔒 비밀번호를 입력하세요')
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
        this.loadHome()
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
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file); input.value = ''
  },

  // ── 모달 ────────────────────────────────
  openModal(id)  { document.getElementById(id)?.classList.add('active') },
  closeModal(id) { document.getElementById(id)?.classList.remove('active') },
}

// 모달 외부 클릭 닫기
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) App.closeModal(el.id) })
})


// ─────────────────────────────────────────────────────
// Flutter Bridge 콜백 함수들
// Flutter에서 파일 선택/취소/오류 결과를 웹으로 전달
// ─────────────────────────────────────────────────────
window._flutterFileCallback = function(data) {
  // data: { type:'audio'|'video'|'file', name:'xxx.mp3', path:'/storage/...', size:12345, base64:'' }
  // ⚠️ base64는 비어 있음 - SQLITE_TOOBIG 방지, 파일명/경로만 저장
  const { type, name, path, size } = data

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

  // 파일명을 msg_value로 사용 (DB 저장용)
  window._selectedAlarmFile = name  // 파일명만 저장
  window._selectedAlarmPath = path  // 로컬 경로 (참고용)

  // 프리뷰 표시 (파일명 + 용량 + X 버튼)
  const previewId = { audio:'alarm-audio-preview', video:'alarm-video-preview', file:'alarm-file-preview' }[type] || 'alarm-file-preview'
  const icons = { audio:'🎵', video:'🎬', file:'📎' }
  const sizeStr = size > 1024*1024 ? (size/1024/1024).toFixed(2) + ' MB' : Math.round(size/1024) + ' KB'
  App._showFilePreview(previewId, (icons[type] || '📎') + ' ' + name + ' (' + sizeStr + ')', type)
  toast('✅ 파일 선택 완료: ' + name, 2000)
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
  toast('✅ 이미지 선택 완료', 2000)
}

window._flutterImageCancelled = function() {
  // 취소 시 아무것도 안 함
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
            content_url: alarm.content_url || ''
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
  // 알람 폴링 시작 (중복 방지)
  if (!window._pollStarted) {
    window._pollStarted = true
    if (typeof pollAlarmTrigger === 'function') {
      pollAlarmTrigger()
      setInterval(pollAlarmTrigger, 60 * 1000)
    }
  }
}
