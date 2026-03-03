// public/static/mobile-app.js  v7
// PushNotify 모바일 웹 앱

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
    let t = this.get('fcm_token')
    if (!t) { t = 'fcm_' + Date.now() + '_web'; this.set('fcm_token', t) }
    return t
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
        onerror="this.parentNode.innerHTML='<span style=font-size:${size*.38}px;font-weight:700;color:${c};>${init}</span>'">
    </div>`
  }
  return `<div style="${s}background:${c}22;color:${c};font-size:${size*.38}px;font-weight:700;">${init}</div>`
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
    if (tab === 'home')     this.loadHome()
    else if (tab === 'channel')  this.loadChannel()
    else if (tab === 'inbox')    this.loadInbox()
    else if (tab === 'send')     this.loadSend()
    else if (tab === 'settings') this.loadSettings()
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
      more.innerHTML = `<div class="more-btn" onclick="App._showAllOwned()">
        <i class="fas fa-plus-circle" style="color:var(--primary);"></i>
        + 더보기 (${ownedChannels.length - MAX_PREVIEW}개 더)
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

  _ownedTileHtml(ch) {
    const name     = ch.name || '채널'
    const cnt      = ch.subscriber_count || 0
    const id       = ch.id
    const hasAlarm = Store.getAlarm(id)
    const alarmCls = hasAlarm ? 'ch-action-btn btn-alarm has-alarm' : 'ch-action-btn btn-alarm'
    return `<div class="channel-tile">
      <div onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        ${avatar(name, ch.image_url, 44)}
      </div>
      <div class="info" onclick="App.openChannelDetail(${id},'${name.replace(/'/g,"\\'")}')">
        <div class="ch-name">${name} (${cnt})</div>
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
      more.innerHTML = `<div class="more-btn" onclick="App._showAllJoined()">
        <i class="fas fa-plus-circle" style="color:var(--primary);"></i>
        + 더보기 (${joinedChannels.length - MAX_PREVIEW}개 더)
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
    return `<div class="joined-tile" onclick="App.openChannelDetail(${chId},'${name}')">
      ${avatar(name, ch.image_url, 44)}
      <div class="info">
        <div class="ch-name">${name}</div>
        <div class="ch-sub">구독 중</div>
      </div>
      <i class="fas fa-chevron-right chevron"></i>
    </div>`
  },

  // ── 채널 탭 ──────────────────────────────
  async loadChannel() {
    const el = document.getElementById('channel-list-all')
    el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'

    // 검색창 초기화
    const inp = document.getElementById('channel-search-input')
    const clr = document.getElementById('channel-search-clear')
    if (inp) inp.value = ''
    if (clr) clr.style.display = 'none'

    try {
      // 전체 채널 목록 로드
      const res  = await API.get('/channels')
      const list = res.data?.data || []

      // 전역 캐시에 저장 (검색 필터링에 재사용)
      window._allChannelList = list
      this._renderChannelList(list)
    } catch {
      el.innerHTML = '<div class="empty-box">채널 목록을 불러올 수 없습니다.</div>'
    }
  },

  // 채널 목록 렌더링 (검색 결과 포함)
  _renderChannelList(list) {
    const el  = document.getElementById('channel-list-all')
    const uid = Store.getUserId()

    if (!list.length) {
      el.innerHTML = '<div class="empty-box">채널이 없습니다.</div>'
      return
    }

    el.innerHTML = list.map(ch => {
      const name     = ch.name || '채널'
      const isJoined = joinedChannels.some(s => (s.channel_id || s.id) === ch.id)
      const isOwner  = ch.owner_id === uid
      const subLabel = isOwner  ? '<span style="color:var(--primary);font-weight:600;">운영 중</span>'
                     : isJoined ? '<span style="color:var(--teal);font-weight:600;">구독 중</span>'
                     : '<span style="color:var(--text3);">참여 가능</span>'
      const subCnt   = ch.subscriber_count || 0
      return `<div class="ch-all-tile" onclick="App.openChannelDetail(${ch.id},'${name.replace(/'/g,"\\'")}')">
        ${avatar(name, ch.image_url, 44)}
        <div class="info">
          <div class="ch-name">${name.replace(/</g,'&lt;')}</div>
          <div class="ch-sub">${subLabel} · <i class="fas fa-users" style="font-size:10px;"></i> ${subCnt}명</div>
        </div>
        <i class="fas fa-chevron-right chevron"></i>
      </div>`
    }).join('')
  },

  // 검색 입력 핸들러 (실시간 필터링)
  onChannelSearch(value) {
    const clr  = document.getElementById('channel-search-clear')
    if (clr) clr.style.display = value ? 'block' : 'none'

    const list = window._allChannelList || []
    const q    = value.trim().toLowerCase()
    if (!q) {
      this._renderChannelList(list)
      return
    }
    const filtered = list.filter(ch => (ch.name || '').toLowerCase().includes(q))
    this._renderChannelList(filtered)
  },

  // 검색창 초기화 버튼
  clearChannelSearch() {
    const inp = document.getElementById('channel-search-input')
    const clr = document.getElementById('channel-search-clear')
    if (inp) { inp.value = ''; inp.focus() }
    if (clr) clr.style.display = 'none'
    this._renderChannelList(window._allChannelList || [])
  },

  // ── 수신함 ──────────────────────────────
  loadInbox() {
    const list = Store.getNotifs()
    const el   = document.getElementById('inbox-list')
    if (!list.length) { el.innerHTML = '<div class="empty-box">받은 알림이 없습니다.</div>'; return }
    const icons = { audio:'fa-music', video:'fa-video', youtube:'fa-play-circle', default:'fa-bell' }
    el.innerHTML = list.map(n => {
      const icon = icons[n.content_type] || icons.default
      const badge = n.status === 'accepted'
        ? '<span class="status-badge badge-accepted"><i class="fas fa-check"></i> 수락됨</span>'
        : n.status === 'rejected'
        ? '<span class="status-badge badge-rejected"><i class="fas fa-times"></i> 거절됨</span>'
        : '<span class="status-badge badge-pending"><i class="fas fa-bell"></i> 미처리</span>'
      return `<div class="notif-card" id="notif-${n.id}">
        <div class="notif-header">
          <div class="notif-icon-wrap"><i class="fas ${icon}" style="color:var(--primary);"></i></div>
          <div class="notif-meta">
            <div class="notif-title">${n.title || '알림'}</div>
            <div class="notif-channel">${n.channel_name || ''}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
            <div class="notif-time">${n.time || ''}</div>${badge}
          </div>
        </div>
        <div class="notif-body">${n.body || ''}</div>
        ${n.status === 'received' ? `<div class="notif-actions">
          <button class="btn-reject" onclick="App.notifAction(${n.id},'rejected')"><i class="fas fa-times"></i> 거절</button>
          <button class="btn-accept" onclick="App.notifAction(${n.id},'accepted')"><i class="fas fa-play"></i> 수락</button>
        </div>` : ''}
      </div>`
    }).join('')
  },

  notifAction(id, status) {
    Store.updateNotif(id, status); this.loadInbox()
    toast(status === 'accepted' ? '수락했습니다' : '거절했습니다')
  },
  clearInbox() {
    if (!confirm('알림을 모두 지우시겠습니까?')) return
    Store.clearNotifs(); this.loadInbox()
  },

  // ── 발신함 ──────────────────────────────
  loadSend() {
    document.getElementById('send-list').innerHTML =
      '<div class="empty-box">발신 내역이 없습니다.<br>채널을 만들고 메시지를 발송해보세요.</div>'
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

    // 드로어 이메일 업데이트
    const drawerEmail = document.getElementById('drawer-user-email')
    if (drawerEmail) drawerEmail.textContent = Store.getEmail() || Store.getDisplayName() || '로그인 중...'
  },

  async logout() {
    if (!confirm('로그아웃 하시겠습니까?')) return
    try {
      await API.post('/auth/logout')
    } catch {}
    Store.clearSession()
    toast('로그아웃 됐습니다')
    setTimeout(() => Auth.show(), 500)
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
    document.getElementById('create-name-cnt').textContent = '0/10'
    document.getElementById('create-desc-cnt').textContent = '0/50'
    document.getElementById('create-img-thumb').innerHTML =
      '<i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>'
    this.openModal('modal-create')
    setTimeout(() => document.getElementById('create-name').focus(), 300)
  },

  async createChannel() {
    const name = document.getElementById('create-name').value.trim()
    const desc = document.getElementById('create-desc').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }
    if (!desc) { toast('채널 소개를 입력하세요'); return }

    try {
      const res = await API.post('/channels', {
        name, description: desc,
        phone_number:  document.getElementById('create-phone').value.trim() || null,
        homepage_url:  document.getElementById('create-homepage').value.trim() || null,
        image_url:     selectedImg || null,
        owner_id:      Store.getUserId()
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

    const thumb = document.getElementById('edit-img-thumb')
    thumb.innerHTML = ch.image_url
      ? `<img src="${ch.image_url}" style="width:100%;height:100%;object-fit:cover;">`
      : '<i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>'
    this.openModal('modal-edit')
  },

  async saveEditChannel() {
    const id   = document.getElementById('edit-channel-id').value
    const name = document.getElementById('edit-name').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }

    try {
      await API.put('/channels/' + id, {
        name,
        description:   document.getElementById('edit-desc').value.trim(),
        homepage_url:  document.getElementById('edit-homepage').value.trim(),
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
  openAlarmModal(chId, name) {
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

    // 소스 기본값
    this.selectMsgSrc('youtube')

    // 입력 초기화
    const ytUrl = document.getElementById('alarm-youtube-url')
    if (ytUrl) ytUrl.value = ''
    const fpEl = document.getElementById('alarm-file-preview')
    if (fpEl) { fpEl.style.display = 'none'; fpEl.textContent = '' }

    this._renderCal()
    this._renderTime()
    this.openModal('modal-alarm')
  },
  toggleAlarmInModal(btn) {
    const on = btn.classList.toggle('on')
    Store.setAlarm(currentAlarmChId, on)
    toast(on ? '알림을 켰습니다' : '알림을 껐습니다')
  },

  // ── 메시지 소스 선택 ──────────────────
  selectMsgSrc(src) {
    alarmMsgSrc = src
    ;['youtube','audio','video','file'].forEach(s => {
      document.getElementById('src-' + s)?.classList.toggle('selected', s === src)
    })
    // 입력 UI 전환
    const ytEl   = document.getElementById('alarm-youtube-url')
    const hints  = { youtube:'YouTube 동영상 URL을 붙여넣으세요', audio:'오디오 파일을 선택합니다', video:'비디오 파일을 선택합니다', file:'첨부 파일을 선택합니다' }
    const hintEl = document.getElementById('alarm-src-hint')
    ytEl.style.display = src === 'youtube' ? 'block' : 'none'
    hintEl.style.display = src !== 'youtube' ? 'block' : 'none'
    hintEl.textContent   = hints[src] || ''

    if (src !== 'youtube') {
      const inputId = { audio:'alarm-audio-file', video:'alarm-video-file', file:'alarm-attach-file' }[src]
      document.getElementById(inputId)?.click()
    }
  },
  onAlarmFileSelected(input, type) {
    const file = input.files?.[0]; if (!file) return
    const preview = document.getElementById('alarm-file-preview')
    preview.style.display = 'block'
    const icons = { audio:'🎵', video:'🎬', file:'📎' }
    preview.textContent = (icons[type] || '📎') + ' ' + file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)'
    input.value = ''
  },

  // ── 달력 ─────────────────────────────
  calMove(delta) {
    calMonth += delta
    if (calMonth > 11) { calMonth = 0; calYear++ }
    if (calMonth < 0)  { calMonth = 11; calYear-- }
    this._renderCal()
  },
  _renderCal() {
    const label = document.getElementById('cal-month-label')
    if (label) label.textContent = calYear + '년 ' + (calMonth + 1) + '월'
    const grid = document.getElementById('cal-days')
    if (!grid) return
    const today = new Date(); today.setHours(0,0,0,0)
    const sel = alarmDate ? new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate()) : null
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const lastDate = new Date(calYear, calMonth + 1, 0).getDate()
    let html = ''
    let day = 1 - firstDay
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++, day++) {
        const d = new Date(calYear, calMonth, day)
        const isThisMonth = d.getMonth() === calMonth
        const isSel = sel && d.getTime() === sel.getTime()
        const isToday = d.getTime() === today.getTime()
        const cls = ['cal-day', !isThisMonth ? 'other-month' : '', isSel ? 'selected' : '', isToday && !isSel ? 'today' : ''].filter(Boolean).join(' ')
        html += `<div class="${cls}" onclick="App.selectDate(${d.getFullYear()},${d.getMonth()},${d.getDate()})">${d.getDate()}</div>`
      }
      if (day > lastDate + 1) break
    }
    grid.innerHTML = html
  },
  selectDate(y, m, d) {
    alarmDate = new Date(y, m, d)
    calYear = y; calMonth = m
    this._renderCal()
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
  _renderTime() {
    const h = document.getElementById('time-hour')
    const m = document.getElementById('time-min')
    if (h) h.textContent = String(alarmHour).padStart(2, '0')
    if (m) m.textContent = String(alarmMin).padStart(2, '0')
  },

  // ── 알람 저장 ─────────────────────────
  saveAlarmSetting() {
    if (!alarmDate) { toast('날짜를 선택하세요'); return }
    const dt = new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate(), alarmHour, alarmMin)
    if (dt <= new Date()) { toast('현재 시각 이후를 선택하세요', 2500); return }

    let srcValue = ''
    if (alarmMsgSrc === 'youtube') {
      srcValue = document.getElementById('alarm-youtube-url').value.trim()
      if (!srcValue) { toast('YouTube URL을 입력하세요'); return }
    }

    Store.setAlarm(currentAlarmChId, true)

    const dateStr = dt.toLocaleDateString('ko-KR', { month:'long', day:'numeric' })
    const timeStr = String(alarmHour).padStart(2,'0') + ':' + String(alarmMin).padStart(2,'0')
    const srcLabel = { youtube:'YouTube URL', audio:'오디오', video:'비디오', file:'파일' }[alarmMsgSrc]

    toast(`알람 설정 완료 · ${dateStr} ${timeStr} · ${srcLabel}`, 3000)
    this.closeModal('modal-alarm')
    // 알람 버튼 색상 즉시 반영
    this._refreshAlarmBtn(currentAlarmChId)
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
    try {
      const res = await API.post('/invites/join', {
        invite_token: token,
        user_id:   uid,
        fcm_token: Store.getFcmToken(),
        platform:  'web'
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
        : '<span style="font-size:26px;font-weight:700;color:' + color + ';">' + init + '</span>'

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

      const join = await API.post('/invites/join', {
        invite_token: token,
        user_id:   Store.getUserId(),
        fcm_token: Store.getFcmToken(),
        platform:  'web'
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
    document.getElementById(source === 'camera' ? 'camera-input' : 'file-input').click()
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

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  // 드로어 사용자 이메일 표시
  const drawerEmail = document.getElementById('drawer-user-email')
  if (drawerEmail) drawerEmail.textContent = Store.getEmail() || Store.getDisplayName() || '로그인 중...'

  // ── 세션 확인: 로그인 상태 → 앱, 미로그인 → 로그인 화면 ──
  if (Store.isLoggedIn()) {
    Auth.hide()        // 앱바/네비/wrap 보이기
    document.getElementById('auth-screen').classList.add('hidden')
    App.goto('home')
  } else {
    Auth.show()        // 로그인 화면 표시
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
