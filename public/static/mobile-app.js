// public/static/mobile-app.js
// PushNotify 모바일 웹 앱 - Flutter 앱과 동일한 UX

const API = axios.create({ baseURL: '/api' })

// ─────────────────────────────────────────────
// 로컬 스토리지 헬퍼
// ─────────────────────────────────────────────
const Store = {
  get(k) { return localStorage.getItem(k) },
  set(k, v) { localStorage.setItem(k, v) },
  del(k) { localStorage.removeItem(k) },

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
  getNotifEnabled() { return this.get('notif_enabled') !== 'false' },
  setNotifEnabled(v) { this.set('notif_enabled', v ? 'true' : 'false') },

  // 로컬 알림 목록 (서버 미구현 대체)
  getNotifications() { try { return JSON.parse(this.get('notifications') || '[]') } catch { return [] } },
  addNotification(n) {
    const list = this.getNotifications()
    list.unshift({ ...n, id: Date.now(), time: new Date().toLocaleString('ko-KR'), status: 'received' })
    this.set('notifications', JSON.stringify(list.slice(0, 50)))
  },
  updateNotifStatus(id, status) {
    const list = this.getNotifications().map(n => n.id === id ? { ...n, status } : n)
    this.set('notifications', JSON.stringify(list))
  },
  clearNotifications() { this.del('notifications') },
}

// ─────────────────────────────────────────────
// 전역 상태
// ─────────────────────────────────────────────
let currentTab = 'home'
let ownedChannels = []
let joinedChannels = []
let currentEditMode = 'create' // 'create' | 'edit'
let selectedImageDataUrl = null

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), duration)
}

function avatarColors(ch) {
  const palette = ['#6C63FF','#E91E63','#4CAF50','#2196F3','#FF9800','#9C27B0']
  return palette[(ch || 'A').charCodeAt(0) % palette.length]
}

function buildAvatar(name, imageUrl, size = 44) {
  const initial = (name || '?')[0].toUpperCase()
  const color = avatarColors(name)
  if (imageUrl) {
    return `<div class="avatar" style="width:${size}px;height:${size}px;background:${color}22;">
      <img src="${imageUrl}" onerror="this.parentNode.innerHTML='<span style=color:${color};font-size:${size*0.4}px;font-weight:700;>${initial}</span>'">
    </div>`
  }
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${color}22;color:${color};font-size:${size*0.4}px;">${initial}</div>`
}

// ─────────────────────────────────────────────
// App 객체
// ─────────────────────────────────────────────
const App = {

  // ── 탭 이동 ──────────────────────────────
  goto(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
    document.getElementById('screen-' + tab).classList.add('active')
    document.getElementById('nav-' + tab).classList.add('active')
    currentTab = tab

    const appbar = document.getElementById('appbar')
    appbar.className = 'appbar'

    if (tab === 'home') { this.loadHome() }
    else if (tab === 'channel') { this.loadChannelTab() }
    else if (tab === 'inbox') { this.loadInbox() }
    else if (tab === 'send') { this.loadSend() }
    else if (tab === 'settings') { this.loadSettings() }
  },

  refresh() { this.goto(currentTab) },

  // ── 홈 화면 ──────────────────────────────
  async loadHome() {
    const userId = Store.getUserId()
    document.getElementById('owned-list').innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    document.getElementById('joined-list').innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'

    try {
      const [ownedRes, joinedRes] = await Promise.all([
        API.get('/channels?owner_id=' + userId).catch(() => ({ data: { data: [] } })),
        API.get('/subscribers?user_id=' + userId).catch(() => ({ data: { data: [] } }))
      ])
      ownedChannels = ownedRes.data?.data || []
      joinedChannels = joinedRes.data?.data || []
    } catch (e) {
      ownedChannels = []; joinedChannels = []
    }

    this._renderOwned()
    this._renderJoined()
  },

  _renderOwned() {
    const el = document.getElementById('owned-list')
    if (!ownedChannels.length) {
      el.innerHTML = '<div class="empty-box">운영 중인 채널이 없습니다.<br>채널을 만들어 보세요!</div>'
      return
    }
    el.innerHTML = ownedChannels.map(ch => {
      const name = ch.name || ch.channel_name || '채널'
      const cnt = ch.subscriber_count || 0
      return `<div class="channel-tile">
        ${buildAvatar(name, ch.image_url)}
        <div class="info">
          <div class="name">${name} (${cnt})</div>
          <div class="sub">${ch.description || '채널 운영자'}</div>
        </div>
        <button class="close-btn" onclick="event.stopPropagation();App.confirmDeleteChannel(${ch.id},'${name}')">
          <i class="fas fa-times"></i>
        </button>
      </div>`
    }).join('')
  },

  _renderJoined() {
    const el = document.getElementById('joined-list')
    if (!joinedChannels.length) {
      el.innerHTML = '<div class="empty-box">가입한 채널이 없습니다.<br>초대 링크로 참여해 보세요!</div>'
      return
    }
    el.innerHTML = joinedChannels.map(ch => {
      const name = ch.channel_name || ch.name || '채널'
      return `<div class="channel-tile" onclick="App.openChannelDetail(${ch.channel_id || ch.id},'${name}')">
        ${buildAvatar(name, ch.image_url)}
        <div class="info">
          <div class="name">${name}</div>
          <div class="sub">구독 중</div>
        </div>
        <i class="fas fa-chevron-right chevron"></i>
      </div>`
    }).join('')
  },

  // ── 채널 탭 ──────────────────────────────
  async loadChannelTab() {
    const el = document.getElementById('channel-list-all')
    el.innerHTML = '<div class="loading"><i class="fas fa-spinner spin"></i></div>'
    try {
      const res = await API.get('/subscribers?user_id=' + Store.getUserId())
      const list = res.data?.data || []
      if (!list.length) {
        el.innerHTML = '<div class="empty-box">구독 중인 채널이 없습니다.</div>'
        return
      }
      el.innerHTML = list.map(ch => {
        const name = ch.channel_name || '채널'
        return `<div class="channel-tile" onclick="App.openChannelDetail(${ch.channel_id},'${name}')">
          ${buildAvatar(name, ch.image_url)}
          <div class="info">
            <div class="name">${name}</div>
            <div class="sub">${ch.platform || 'web'} · 구독 중</div>
          </div>
          <i class="fas fa-chevron-right chevron"></i>
        </div>`
      }).join('')
    } catch (e) {
      el.innerHTML = '<div class="empty-box">채널 목록을 불러올 수 없습니다.</div>'
    }
  },

  // ── 수신함 ──────────────────────────────
  loadInbox() {
    const list = Store.getNotifications()
    const el = document.getElementById('inbox-list')
    if (!list.length) {
      el.innerHTML = '<div class="empty-box">받은 알림이 없습니다.</div>'
      return
    }

    // 데모용 샘플 알림 (첫 방문 시)
    el.innerHTML = list.map(n => {
      const icons = { audio: 'fa-music', video: 'fa-video', youtube: 'fa-play-circle', default: 'fa-bell' }
      const icon = icons[n.content_type] || icons.default
      const statusHtml = n.status === 'accepted'
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
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <div class="notif-time">${n.time || ''}</div>
            ${statusHtml}
          </div>
        </div>
        <div class="notif-body">${n.body || ''}</div>
        ${n.status === 'received' ? `
        <div class="notif-actions">
          <button class="btn-reject" onclick="App.notifAction(${n.id},'rejected')"><i class="fas fa-times"></i> 거절</button>
          <button class="btn-accept" onclick="App.notifAction(${n.id},'accepted')"><i class="fas fa-play"></i> 수락</button>
        </div>` : ''}
      </div>`
    }).join('')
  },

  notifAction(id, status) {
    Store.updateNotifStatus(id, status)
    this.loadInbox()
    toast(status === 'accepted' ? '수락했습니다' : '거절했습니다')
  },

  clearInbox() {
    if (!confirm('알림을 모두 지우시겠습니까?')) return
    Store.clearNotifications()
    this.loadInbox()
  },

  // ── 발신함 ──────────────────────────────
  async loadSend() {
    const el = document.getElementById('send-list')
    el.innerHTML = '<div class="empty-box">발신 내역이 없습니다.<br>채널을 만들고 메시지를 발송해보세요.</div>'
  },

  // ── 설정 ────────────────────────────────
  loadSettings() {
    const uid = Store.getUserId()
    const tok = Store.getFcmToken()
    document.getElementById('settings-user-id').textContent = uid
    document.getElementById('settings-fcm-token').textContent = tok.substring(0, 24) + '...'
    const toggle = document.getElementById('notif-toggle')
    if (Store.getNotifEnabled()) toggle.classList.add('on'); else toggle.classList.remove('on')
  },

  toggleNotif(btn) {
    const on = btn.classList.toggle('on')
    Store.setNotifEnabled(on)
    toast(on ? '알림을 켰습니다' : '알림을 껐습니다')
  },

  showFcmToken() {
    const tok = Store.getFcmToken()
    if (confirm('FCM 토큰:\n\n' + tok + '\n\n클립보드에 복사할까요?')) {
      navigator.clipboard?.writeText(tok).then(() => toast('복사됐습니다'))
    }
  },

  resetDevice() {
    if (!confirm('모든 구독 정보와 사용자 ID가 초기화됩니다.\n계속하시겠습니까?')) return
    localStorage.clear()
    toast('초기화 완료')
    this.loadSettings()
    this.loadHome()
  },

  // ── 채널 만들기 ──────────────────────────
  openCreateChannel() {
    currentEditMode = 'create'
    selectedImageDataUrl = null
    document.getElementById('create-name').value = ''
    document.getElementById('create-phone').value = ''
    document.getElementById('create-desc').value = ''
    document.getElementById('create-homepage').value = ''
    document.getElementById('create-name-cnt').textContent = '0/10'
    document.getElementById('create-desc-cnt').textContent = '0/50'
    document.getElementById('create-img-thumb').innerHTML = '<i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>'
    this.openModal('modal-create')
  },

  async createChannel() {
    const name = document.getElementById('create-name').value.trim()
    const desc = document.getElementById('create-desc').value.trim()

    // ── 필수 항목 검사 ──
    if (!name) { toast('채널명을 입력하세요'); return }
    if (!desc) { toast('채널 소개를 입력하세요'); return }

    try {
      const res = await API.post('/channels', {
        name,
        description: desc,
        phone_number: document.getElementById('create-phone').value.trim() || null,
        homepage_url: document.getElementById('create-homepage').value.trim() || null,
        image_url: selectedImageDataUrl || null,
        owner_id: Store.getUserId()
      })
      if (res.data?.success || res.data?.data) {
        toast('채널이 생성되었습니다!')
        this.closeModal('modal-create')
        this.loadHome()
      } else {
        // 서버에서 내려온 한국어 오류 메시지 그대로 표시
        toast(res.data?.error || '채널 생성에 실패했습니다', 3500)
      }
    } catch (e) {
      // HTTP 에러 응답 본문에서 메시지 추출
      const errMsg = e.response?.data?.error || e.message || '알 수 없는 오류'
      toast('오류: ' + errMsg, 3500)
    }
  },

  // ── 채널 수정 ──────────────────────────
  openEditChannel(channel) {
    currentEditMode = 'edit'
    selectedImageDataUrl = null
    document.getElementById('edit-channel-id').value = channel.id
    document.getElementById('edit-name').value = channel.name || ''
    document.getElementById('edit-desc').value = channel.description || ''
    document.getElementById('edit-homepage').value = channel.homepage_url || ''
    document.getElementById('edit-pwd-old').value = ''
    document.getElementById('edit-pwd-new').value = ''
    const thumb = document.getElementById('edit-img-thumb')
    if (channel.image_url) {
      thumb.innerHTML = `<img src="${channel.image_url}">`
    } else {
      thumb.innerHTML = '<i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>'
    }
    this.openModal('modal-edit')
  },

  async saveEditChannel() {
    const id = document.getElementById('edit-channel-id').value
    const name = document.getElementById('edit-name').value.trim()
    if (!name) { toast('채널명을 입력하세요'); return }
    try {
      await API.put('/channels/' + id, {
        name,
        description: document.getElementById('edit-desc').value.trim(),
        homepage_url: document.getElementById('edit-homepage').value.trim(),
        image_url: selectedImageDataUrl || undefined
      })
      toast('채널이 수정되었습니다')
      this.closeModal('modal-edit')
      this.loadHome()
    } catch (e) {
      toast('수정 실패: ' + (e.response?.data?.error || e.message), 3000)
    }
  },

  // ── 채널 삭제 ──────────────────────────
  confirmDeleteChannel(id, name) {
    if (!confirm(`"${name}" 채널을 삭제하시겠습니까?`)) return
    API.delete('/channels/' + id)
      .then(() => { toast('삭제됐습니다'); this.loadHome() })
      .catch(e => toast('삭제 실패: ' + e.message, 3000))
  },

  // ── 채널 참여 ──────────────────────────
  openJoinChannel() {
    document.getElementById('join-token').value = ''
    this.openModal('modal-join')
  },

  async joinChannel() {
    let input = document.getElementById('join-token').value.trim()
    if (!input) { toast('초대 코드를 입력하세요'); return }

    // URL에서 토큰 추출
    let token = input
    if (input.includes('/join/')) token = input.split('/join/').pop()
    else if (input.startsWith('http')) {
      try { token = new URL(input).pathname.split('/').pop() } catch {}
    }

    try {
      const res = await API.post('/invites/join', {
        invite_token: token,
        user_id: Store.getUserId(),
        fcm_token: Store.getFcmToken(),
        platform: 'web'
      })
      if (res.data?.success) {
        toast('채널에 참여했습니다!')
        this.closeModal('modal-join')
        this.loadHome()

        // 샘플 알림 추가
        Store.addNotification({
          title: '채널 참여 완료',
          body: '새 채널에 성공적으로 참여했습니다.',
          channel_name: res.data?.data?.channel_name || '채널',
          content_type: 'default'
        })
      } else {
        toast(res.data?.error || '참여 실패', 3000)
      }
    } catch (e) {
      toast('오류: ' + (e.response?.data?.error || e.message), 3000)
    }
  },

  // ── 채널 상세 (간단 alert) ──────────────
  openChannelDetail(channelId, name) {
    toast(`"${name}" 채널 상세 화면 (준비 중)`, 2000)
  },

  // ── 이미지 선택 ──────────────────────────
  openImagePicker(mode) {
    currentEditMode = mode || currentEditMode
    this.openModal('modal-img-src')
  },

  pickImageFrom(source) {
    this.closeModal('modal-img-src')
    if (source === 'camera') {
      document.getElementById('camera-input').click()
    } else {
      document.getElementById('file-input').click()
    }
  },

  onFileSelected(input) {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      selectedImageDataUrl = e.target.result
      // 썸네일 업데이트
      const thumbId = currentEditMode === 'edit' ? 'edit-img-thumb' : 'create-img-thumb'
      document.getElementById(thumbId).innerHTML = `<img src="${selectedImageDataUrl}">`
    }
    reader.readAsDataURL(file)
    input.value = ''
  },

  // ── 모달 관리 ──────────────────────────
  openModal(id) {
    document.getElementById(id).classList.add('active')
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active')
  },
}

// ─────────────────────────────────────────────
// 모달 외부 클릭 닫기
// ─────────────────────────────────────────────
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) App.closeModal(this.id)
  })
})

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.goto('home')

  // 샘플 알림 (처음 방문 시)
  if (!Store.get('sample_added')) {
    Store.addNotification({ title: '힐링 뮤직 채널 새 음악', body: '오늘의 힐링 음악이 업로드되었습니다.', channel_name: '힐링 뮤직', content_type: 'audio' })
    Store.addNotification({ title: '명상 가이드 새 영상', body: '명상 가이드 채널에 새 영상이 추가되었습니다.', channel_name: '명상 가이드', content_type: 'video' })
    Store.set('sample_added', '1')
  }
})
