// public/static/mobile-app.js  v3
// PushNotify 모바일 웹 앱

const API = axios.create({ baseURL: '/api' })
const MAX_PREVIEW = 3   // 홈화면 최대 미리보기 개수

// ─────────────────────────────────────────────
// 스토어
// ─────────────────────────────────────────────
const Store = {
  get(k)    { return localStorage.getItem(k) },
  set(k, v) { localStorage.setItem(k, v) },
  del(k)    { localStorage.removeItem(k) },
  getUserId() {
    let id = this.get('user_id')
    if (!id) { id = 'user_' + Date.now(); this.set('user_id', id) }
    return id
  },
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
    document.getElementById('owned-list').innerHTML  = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    document.getElementById('joined-list').innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    document.getElementById('owned-more').style.display  = 'none'
    document.getElementById('joined-more').style.display = 'none'

    try {
      const [oRes, jRes] = await Promise.all([
        API.get('/channels?owner_id=' + uid).catch(() => ({ data: { data: [] } })),
        API.get('/subscribers?user_id=' + uid).catch(() => ({ data: { data: [] } }))
      ])
      ownedChannels  = oRes.data?.data || []
      joinedChannels = jRes.data?.data || []
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
    const name = ch.name || '채널'
    const cnt  = ch.subscriber_count || 0
    const id   = ch.id
    return `<div class="channel-tile">
      ${avatar(name, ch.image_url, 44)}
      <div class="info" onclick="App.openEditChannel(${id})">
        <div class="ch-name">${name} (${cnt})</div>
        <div class="ch-sub">${ch.description || '채널 운영자'}</div>
      </div>
      <div class="ch-actions">
        <button class="ch-action-btn btn-alarm"   onclick="App.openAlarmModal(${id},'${name}')"  title="알람설정"><i class="fas fa-play"></i></button>
        <button class="ch-action-btn btn-invite"  onclick="App.openInviteModal(${id},'${name}')" title="초대코드"><i class="fas fa-share-alt"></i></button>
        <button class="ch-action-btn btn-setting" onclick="App.openEditChannel(${id})"           title="설정"><i class="fas fa-cog"></i></button>
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
    try {
      const res  = await API.get('/subscribers?user_id=' + Store.getUserId())
      const list = res.data?.data || []
      if (!list.length) { el.innerHTML = '<div class="empty-box">구독 중인 채널이 없습니다.</div>'; return }
      el.innerHTML = list.map(ch => {
        const name = ch.channel_name || '채널'
        return `<div class="joined-tile" onclick="App.openChannelDetail(${ch.channel_id},'${name}')">
          ${avatar(name, ch.image_url, 44)}
          <div class="info">
            <div class="ch-name">${name}</div>
            <div class="ch-sub">${ch.platform || 'web'} · 구독 중</div>
          </div>
          <i class="fas fa-chevron-right chevron"></i>
        </div>`
      }).join('')
    } catch { el.innerHTML = '<div class="empty-box">불러올 수 없습니다.</div>' }
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
      toast('오류: ' + (e.response?.data?.error || e.message), 3500)
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
    } catch (e) { toast('수정 실패: ' + (e.response?.data?.error || e.message), 3000) }
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
    document.getElementById('alarm-modal-title').textContent = name + ' · 알람 설정'
    const btn = document.getElementById('alarm-toggle')
    if (Store.getAlarm(chId)) btn.classList.add('on'); else btn.classList.remove('on')
    this.openModal('modal-alarm')
  },
  toggleAlarmInModal(btn) {
    const on = btn.classList.toggle('on')
    Store.setAlarm(currentAlarmChId, on)
    toast(on ? '알림을 켰습니다' : '알림을 껐습니다')
  },

  // ── 초대코드 모달 ────────────────────────
  async openInviteModal(chId, name) {
    currentInviteCode = ''
    document.getElementById('invite-channel-name-label').textContent = `"${name}" 채널의 초대 링크`
    document.getElementById('invite-code-box').textContent = '초대 링크를 불러오는 중...'
    this.openModal('modal-invite')
    try {
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
        const cr = await API.post('/invites', { channel_id: chId })
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
    try {
      const res = await API.post('/invites/join', {
        invite_token: token,
        user_id:   Store.getUserId(),
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
  openChannelDetail(chId, name) {
    toast(`"${name}" 채널 상세 (준비 중)`, 2000)
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
      selectedImg = e.target.result
      const thumbId = imgPickerMode === 'edit' ? 'edit-img-thumb' : 'create-img-thumb'
      document.getElementById(thumbId).innerHTML = `<img src="${selectedImg}" style="width:100%;height:100%;object-fit:cover;">`
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
  App.goto('home')
  // 샘플 알림 (첫 방문)
  if (!Store.get('sample_added')) {
    Store.addNotif({ title:'힐링 뮤직 채널 새 음악', body:'오늘의 힐링 음악이 업로드됐습니다.', channel_name:'힐링 뮤직', content_type:'audio' })
    Store.addNotif({ title:'명상 가이드 새 영상', body:'명상 가이드 채널에 새 영상이 추가됐습니다.', channel_name:'명상 가이드', content_type:'video' })
    Store.set('sample_added', '1')
  }
})
