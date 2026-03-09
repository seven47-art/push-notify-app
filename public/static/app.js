// public/static/app.js - v2 (폐쇄형 채널 + 초대 링크 관리)

const API = axios.create({ baseURL: '/api' })
let channels = []
let allLogs = []
let dailyChartInstance = null
let acceptChartInstance = null
let currentPage = 'dashboard'

// =============================================
// 유틸리티
// =============================================
function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} mr-2"></i>${msg}`
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

function formatDate(d) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

function formatDuration(s) {
  if (!s) return ''
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

function getIcon(type) { return { audio: '🎵', video: '🎬', youtube: '📺' }[type] || '📄' }

function typeBadge(type) {
  return `<span class="badge badge-${type}">${getIcon(type)} ${type.toUpperCase()}</span>`
}

function statusBadge(status) {
  const labels = { completed: '완료', processing: '처리중', pending: '대기', failed: '실패', sent: '발송됨', accepted: '수락', rejected: '거절' }
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`
}

function platformIcon(p) {
  return { android: '<i class="fab fa-android text-emerald-400"></i>', ios: '<i class="fab fa-apple text-slate-300"></i>', web: '<i class="fas fa-globe text-blue-400"></i>' }[p] || p
}

function acceptRate(acc, sent) {
  if (!sent) return '0%'
  return `${Math.round(acc / sent * 100)}%`
}

function closeModal(id) { document.getElementById(id).classList.add('hidden') }
function openModal(id) { document.getElementById(id).classList.remove('hidden') }

// 클립보드 복사
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text)
    if (btn) {
      btn.classList.add('copied')
      const orig = btn.innerHTML
      btn.innerHTML = '<i class="fas fa-check mr-1"></i>복사됨'
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig }, 2000)
    }
    showToast('클립보드에 복사되었습니다')
  } catch { showToast('복사 실패', 'error') }
}

// 초대 링크 상태 계산
function getInviteStatus(link) {
  if (!link.is_active) return { label: '비활성', cls: 'badge-inactive' }
  if (link.expires_at && new Date(link.expires_at) < new Date()) return { label: '만료됨', cls: 'badge-expired' }
  if (link.max_uses !== null && link.use_count >= link.max_uses) return { label: '한도초과', cls: 'badge-full' }
  return { label: '활성', cls: 'badge-active' }
}

// =============================================
// 페이지 라우팅
// =============================================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + page)?.classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelector(`.nav-item[onclick="showPage('${page}')"]`)?.classList.add('active')

  const titles = {
    dashboard: '대시보드', channels: '채널 관리', invites: '초대 링크 관리',
    contents: '콘텐츠 관리', subscribers: '구독자 관리',
    notifications: '알림 발송', notices: '공지사항 관리',
    logs: '발송 로그', members: '회원 관리'
  }
  document.getElementById('pageTitle').textContent = titles[page] || page
  currentPage = page

  if (page === 'dashboard') loadDashboard()
  else if (page === 'channels') loadChannels()
  else if (page === 'invites') loadInvites()
  else if (page === 'contents') loadContents()
  else if (page === 'subscribers') loadSubscribers()
  else if (page === 'notifications') loadNotifPage()
  else if (page === 'notices') loadNoticesAdmin()
  else if (page === 'alarms') loadAlarmManagement()
  else if (page === 'logs') loadLogBatches()
  else if (page === 'members') loadMembers()
}

function refreshCurrentPage() { showPage(currentPage) }
function onChannelChange() { refreshCurrentPage() }

// =============================================
// 전역 채널 로드
// =============================================
async function loadGlobalChannels() {
  try {
    const { data } = await API.get('/channels')
    channels = data.data || []

    const selectors = ['globalChannelSelect', 'inviteChannelFilter', 'contentChannelFilter',
      'subscriberChannelFilter', 'contentChannelId', 'notifChannel', 'inviteChannelId']

    selectors.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const hasAll = id !== 'contentChannelId' && id !== 'inviteChannelId'
      const placeholder = id === 'notifChannel' || id === 'inviteChannelId' || id === 'contentChannelId'
        ? '<option value="">채널 선택...</option>'
        : '<option value="">전체 채널</option>'
      el.innerHTML = hasAll || id === 'notifChannel' || id === 'inviteChannelId' || id === 'contentChannelId'
        ? placeholder : ''
      channels.forEach(ch => el.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
    })
  } catch (e) { console.error(e) }
}

// =============================================
// 대시보드
// =============================================
async function loadDashboard() {
  try {
    const channelId = document.getElementById('globalChannelSelect').value
    const q = channelId ? `?channel_id=${channelId}` : ''

    const [chRes, subRes, ctRes, statsRes, batchRes] = await Promise.all([
      API.get('/channels'), API.get('/subscribers' + q), API.get('/contents' + q),
      API.get('/notifications/stats' + q), API.get('/notifications/batches' + q)
    ])

    // 활성 초대링크 수 계산
    let inviteCount = 0
    if (channelId) {
      try {
        const invRes = await API.get(`/invites?channel_id=${channelId}`)
        inviteCount = (invRes.data.data || []).filter(l => getInviteStatus(l).label === '활성').length
      } catch {}
    } else {
      let total = 0
      await Promise.all(chRes.data.data.map(async ch => {
        try {
          const r = await API.get(`/invites?channel_id=${ch.id}`)
          total += (r.data.data || []).filter(l => getInviteStatus(l).label === '활성').length
        } catch {}
      }))
      inviteCount = total
    }

    const stats = statsRes.data.data.summary || {}
    const daily = statsRes.data.data.daily || []
    const batches = batchRes.data.data || []

    document.getElementById('stat-channels').textContent = chRes.data.data.length
    document.getElementById('stat-invites').textContent = inviteCount
    document.getElementById('stat-subscribers').textContent = (subRes.data.data || []).length
    document.getElementById('stat-sent').textContent = (stats.total_sent || 0).toLocaleString()
    document.getElementById('acceptRate').textContent = `${stats.accept_rate || 0}% 수락률`

    const accepted = stats.total_accepted || 0, rejected = stats.total_rejected || 0
    const noResp = Math.max(0, (stats.total_sent || 0) - accepted - rejected)
    document.getElementById('acceptCount').textContent = accepted.toLocaleString()
    document.getElementById('rejectCount').textContent = rejected.toLocaleString()
    document.getElementById('noResponseCount').textContent = noResp.toLocaleString()

    renderDailyChart(daily)
    renderAcceptChart(accepted, rejected, noResp)
    renderRecentBatches(batches.slice(0, 8))
  } catch (e) { showToast('데이터 로드 오류: ' + e.message, 'error') }
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('dailyChart').getContext('2d')
  if (dailyChartInstance) dailyChartInstance.destroy()
  dailyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date).reverse(),
      datasets: [
        { label: '발송', data: daily.map(d => d.sent_count || 0).reverse(), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6 },
        { label: '수락', data: daily.map(d => d.accepted_count || 0).reverse(), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b' } }
      }
    }
  })
}

function renderAcceptChart(acc, rej, noResp) {
  const ctx = document.getElementById('acceptChart').getContext('2d')
  if (acceptChartInstance) acceptChartInstance.destroy()
  if (acc + rej + noResp === 0) return
  acceptChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['수락', '거절', '미응답'],
      datasets: [{ data: [acc, rej, noResp], backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)', 'rgba(100,116,139,0.5)'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: '75%' }
  })
}

function renderRecentBatches(batches) {
  const tbody = document.getElementById('recentBatchesTable')
  if (!batches.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">발송 이력이 없습니다</td></tr>'; return }
  tbody.innerHTML = batches.map(b => `
    <tr class="table-row border-b border-slate-700/50">
      <td class="px-5 py-3 text-slate-300 text-xs">${b.channel_name}</td>
      <td class="px-5 py-3">${typeBadge(b.content_type)}</td>
      <td class="px-5 py-3 text-white text-xs max-w-40 truncate">${b.title}</td>
      <td class="px-5 py-3 text-center text-slate-300">${b.total_targets}</td>
      <td class="px-5 py-3 text-center text-blue-400">${b.sent_count}</td>
      <td class="px-5 py-3 text-center text-emerald-400 font-semibold">${acceptRate(b.accepted_count, b.sent_count)}</td>
      <td class="px-5 py-3 text-center">${statusBadge(b.status)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(b.created_at)}</td>
    </tr>`).join('')
}

// =============================================
// 채널 관리
// =============================================
async function loadChannels() {
  try {
    const { data } = await API.get('/channels')
    const list = data.data || []
    const tbody = document.getElementById('channelsList')

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-500 py-12">
        <i class="fas fa-layer-group text-4xl mb-3 block text-slate-700"></i>채널이 없습니다</td></tr>`
      return
    }

    tbody.innerHTML = list.map(ch => `
      <tr class="table-row border-b border-slate-700/50">
        <td class="px-4 py-3">
          <input type="checkbox" class="ch-check w-4 h-4 accent-indigo-500 cursor-pointer" data-id="${ch.id}" onchange="onChCheck(this)">
        </td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg overflow-hidden bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
              ${ch.image_url
                ? `<img src="${ch.image_url}" class="w-full h-full object-cover">`
                : `<i class="fas fa-layer-group text-indigo-400 text-sm"></i>`}
            </div>
            <div>
              <div class="text-white text-sm font-medium">${ch.name}</div>
              <div class="text-slate-500 text-xs">${ch.description || '설명 없음'}</div>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-center text-emerald-400 font-semibold">${ch.subscriber_count || 0}</td>
        <td class="px-5 py-3 text-center text-amber-400 font-semibold">${ch.invite_link_count || 0}</td>
        <td class="px-5 py-3 text-center text-blue-400 font-semibold">${ch.content_count || 0}</td>
        <td class="px-5 py-3 text-slate-400 text-xs">${ch.owner_email || ch.owner_id}</td>
        <td class="px-5 py-3 text-center">
          <span class="${ch.is_active ? 'badge-completed' : 'badge-failed'} badge">${ch.is_active ? '활성' : '비활성'}</span>
          ${Number(ch.is_secret) === 1 ? '<span class="badge ml-1" style="background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.3);font-size:10px;padding:1px 5px;border-radius:4px;"><i class="fas fa-lock mr-1"></i>비밀</span>' : ''}
        </td>
        <td class="px-5 py-3 text-center">
          <div class="flex items-center justify-center gap-2 flex-wrap">
            <button onclick="togglePopularChannel(${ch.id}, ${Number(ch.is_popular)})" title="${Number(ch.is_popular) === 1 ? '인기채널 해제' : '인기채널 지정'}"
              class="px-2 py-1 rounded text-xs font-semibold transition-colors ${Number(ch.is_popular) === 1 ? 'bg-yellow-500/20 hover:bg-yellow-500/30' : 'bg-slate-700 hover:bg-slate-600'}">
              <i class="fas fa-star" style="color:${Number(ch.is_popular) === 1 ? '#F59E0B' : '#64748B'};"></i>
            </button>
            <button onclick="openInviteModalForChannel(${ch.id})"
              class="btn-warning text-white px-2 py-1 rounded text-xs">
              <i class="fas fa-link mr-1"></i>초대링크
            </button>
            <button onclick="openChannelModal(${ch.id})"
              class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded text-xs">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteChannel(${ch.id})"
              class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-2 py-1 rounded text-xs">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`).join('')
  } catch (e) { showToast('채널 로드 오류: ' + e.message, 'error') }
}

// 인기채널 지정/해제 토글
async function togglePopularChannel(id, current) {
  try {
    // current 숫자 강제변환 후 정확한 비교
    const newVal = Number(current) === 1 ? 0 : 1
    await API.patch(`/channels/${id}/popular`, { is_popular: newVal })
    showToast(newVal ? '⭐ 인기채널로 지정되었습니다' : '인기채널 지정이 해제되었습니다')
    loadChannels()
  } catch (e) { showToast('오류: ' + e.message, 'error') }
}

async function openChannelModal(id) {
  document.getElementById('channelId').value = ''
  document.getElementById('channelName').value = ''
  document.getElementById('channelDescription').value = ''
  document.getElementById('channelImageUrl').value = ''
  document.getElementById('channelOwnerId').value = 'admin'
  document.getElementById('channelModalTitle').textContent = '채널 추가'

  if (id) {
    try {
      const { data } = await API.get(`/channels/${id}`)
      const ch = data.data
      document.getElementById('channelId').value = ch.id
      document.getElementById('channelName').value = ch.name
      document.getElementById('channelDescription').value = ch.description || ''
      document.getElementById('channelImageUrl').value = ch.image_url || ''
      document.getElementById('channelOwnerId').value = ch.owner_id
      document.getElementById('channelModalTitle').textContent = '채널 수정'
    } catch { showToast('채널 정보 로드 오류', 'error'); return }
  }
  openModal('channelModal')
}

async function saveChannel() {
  const id = document.getElementById('channelId').value
  const payload = {
    name: document.getElementById('channelName').value.trim(),
    description: document.getElementById('channelDescription').value.trim(),
    image_url: document.getElementById('channelImageUrl').value.trim(),
    owner_id: document.getElementById('channelOwnerId').value.trim()
  }
  if (!payload.name || !payload.owner_id) { showToast('채널명과 Owner ID는 필수입니다', 'error'); return }
  try {
    if (id) await API.put(`/channels/${id}`, payload)
    else await API.post('/channels', payload)
    closeModal('channelModal')
    showToast(id ? '채널이 수정되었습니다' : '채널이 추가되었습니다')
    await loadGlobalChannels()
    loadChannels()
  } catch (e) { showToast('저장 오류: ' + e.message, 'error') }
}

async function deleteChannel(id) {
  if (!confirm('채널을 삭제하면 초대링크, 구독자, 콘텐츠가 모두 삭제됩니다. 계속할까요?')) return
  try {
    await API.delete(`/channels/${id}`)
    showToast('채널이 삭제되었습니다')
    await loadGlobalChannels()
    loadChannels()
  } catch (e) { showToast('삭제 오류: ' + e.message, 'error') }
}

// =============================================
// 초대 링크 관리 (핵심 기능)
// =============================================
async function loadInvites() {
  const channelId = document.getElementById('inviteChannelFilter')?.value
  const container = document.getElementById('invitesList')

  if (!channelId) {
    container.innerHTML = `
      <div class="text-center py-16">
        <div class="w-16 h-16 bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-link text-amber-400 text-2xl"></i>
        </div>
        <p class="text-slate-400 text-sm">채널을 선택하면 초대 링크 목록이 표시됩니다</p>
      </div>`
    document.getElementById('inviteLinkCount').textContent = ''
    return
  }

  try {
    const { data } = await API.get(`/invites?channel_id=${channelId}`)
    const links = data.data || []
    document.getElementById('inviteLinkCount').textContent = `총 ${links.length}개`

    if (!links.length) {
      container.innerHTML = `
        <div class="text-center py-12">
          <p class="text-slate-500 text-sm mb-4">아직 초대 링크가 없습니다</p>
          <button onclick="openInviteModalForChannel(${channelId})" class="btn-primary text-white px-4 py-2 rounded-lg text-sm">
            <i class="fas fa-plus mr-2"></i>첫 초대 링크 생성
          </button>
        </div>`
      return
    }

    const baseUrl = window.location.origin
    container.innerHTML = links.map(link => {
      const st = getInviteStatus(link)
      const joinUrl = `${baseUrl}/join/${link.invite_token}`
      const usagePercent = link.max_uses ? Math.round(link.use_count / link.max_uses * 100) : 0

      return `
        <div class="link-card p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <!-- 링크 이름 + 상태 -->
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <span class="text-white font-semibold text-sm">${link.label || '초대 링크'}</span>
                <span class="badge ${st.cls}">${st.label}</span>
                ${link.expires_at && new Date(link.expires_at) > new Date() ? `
                  <span class="text-slate-500 text-xs">~ ${new Date(link.expires_at).toLocaleDateString('ko-KR')}</span>` : ''}
              </div>

              <!-- 초대 URL -->
              <div class="flex items-center gap-2 mb-3">
                <code class="invite-token flex-1 truncate">${joinUrl}</code>
                <button onclick="copyToClipboard('${joinUrl}', this)"
                  class="copy-btn flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
                  <i class="fas fa-copy mr-1"></i>복사
                </button>
              </div>

              <!-- 사용 현황 -->
              <div class="grid grid-cols-3 gap-3 mb-3">
                <div class="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div class="text-white font-bold text-sm">${link.use_count}</div>
                  <div class="text-slate-500 text-xs">사용 횟수</div>
                </div>
                <div class="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div class="text-white font-bold text-sm">${link.max_uses !== null ? link.max_uses : '∞'}</div>
                  <div class="text-slate-500 text-xs">최대 사용</div>
                </div>
                <div class="bg-slate-900/50 rounded-lg p-2 text-center">
                  <div class="text-emerald-400 font-bold text-sm">${link.joined_count || 0}</div>
                  <div class="text-slate-500 text-xs">참여자 수</div>
                </div>
              </div>

              ${link.max_uses ? `
              <div class="mb-2">
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>사용률</span><span>${usagePercent}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill ${usagePercent >= 100 ? 'bg-red-500' : usagePercent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}"
                    style="width:${Math.min(usagePercent,100)}%"></div>
                </div>
              </div>` : ''}

              <div class="text-slate-600 text-xs">생성: ${formatDate(link.created_at)}</div>
            </div>

            <!-- 액션 버튼 -->
            <div class="flex flex-col gap-2 flex-shrink-0">
              <button onclick="toggleInviteLink(${link.id}, ${link.is_active ? 0 : 1})"
                class="${link.is_active ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'btn-success text-white'} px-3 py-1.5 rounded-lg text-xs whitespace-nowrap">
                <i class="fas fa-${link.is_active ? 'pause' : 'play'} mr-1"></i>${link.is_active ? '비활성화' : '활성화'}
              </button>
              <button onclick="deleteInviteLink(${link.id})"
                class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg text-xs">
                <i class="fas fa-trash mr-1"></i>삭제
              </button>
            </div>
          </div>
        </div>`
    }).join('')
  } catch (e) { showToast('초대 링크 로드 오류: ' + e.message, 'error') }
}

function openInviteModal() {
  document.getElementById('inviteChannelId').value = document.getElementById('inviteChannelFilter')?.value || ''
  document.getElementById('inviteLabel').value = ''
  document.getElementById('inviteMaxUses').value = ''
  document.getElementById('inviteExpiresDays').value = ''
  openModal('inviteModal')
}

function openInviteModalForChannel(channelId) {
  document.getElementById('inviteChannelId').value = channelId
  document.getElementById('inviteLabel').value = ''
  document.getElementById('inviteMaxUses').value = ''
  document.getElementById('inviteExpiresDays').value = ''
  openModal('inviteModal')
}

async function saveInvite() {
  const channelId = document.getElementById('inviteChannelId').value
  const label = document.getElementById('inviteLabel').value.trim()
  const maxUses = document.getElementById('inviteMaxUses').value
  const expiresDays = document.getElementById('inviteExpiresDays').value

  if (!channelId) { showToast('채널을 선택하세요', 'error'); return }

  try {
    const { data } = await API.post('/invites', {
      channel_id: parseInt(channelId),
      label: label || undefined,
      max_uses: maxUses ? parseInt(maxUses) : undefined,
      expires_days: expiresDays ? parseInt(expiresDays) : undefined,
      created_by: 'admin'
    })

    closeModal('inviteModal')
    showToast('초대 링크가 생성되었습니다!')

    // 생성된 링크를 즉시 복사 안내
    const joinUrl = `${window.location.origin}${data.data.join_url}`
    if (confirm(`초대 링크가 생성되었습니다!\n\n${joinUrl}\n\n클립보드에 복사할까요?`)) {
      await navigator.clipboard.writeText(joinUrl).catch(() => {})
    }

    await loadGlobalChannels()

    // 채널 필터 동기화
    if (document.getElementById('inviteChannelFilter')) {
      document.getElementById('inviteChannelFilter').value = channelId
    }
    loadInvites()
  } catch (e) { showToast('링크 생성 오류: ' + e.message, 'error') }
}

async function toggleInviteLink(id, isActive) {
  try {
    await API.put(`/invites/${id}`, { is_active: isActive })
    showToast(isActive ? '초대 링크가 활성화되었습니다' : '초대 링크가 비활성화되었습니다')
    loadInvites()
  } catch (e) { showToast('오류: ' + e.message, 'error') }
}

async function deleteInviteLink(id) {
  if (!confirm('초대 링크를 삭제하시겠습니까? 이 링크로 가입한 기존 구독자는 유지됩니다.')) return
  try {
    await API.delete(`/invites/${id}`)
    showToast('초대 링크가 삭제되었습니다')
    loadInvites()
  } catch (e) { showToast('삭제 오류: ' + e.message, 'error') }
}

// =============================================
// 콘텐츠 관리
// =============================================
async function loadContents() {
  try {
    const channelId = document.getElementById('contentChannelFilter')?.value || ''
    const typeFilter = document.getElementById('contentTypeFilter')?.value || ''
    const url = channelId ? `/contents?channel_id=${channelId}` : '/contents'

    const { data } = await API.get(url)
    let list = data.data || []
    if (typeFilter) list = list.filter(c => c.content_type === typeFilter)

    const container = document.getElementById('contentsList')
    if (!list.length) {
      container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-12">
        <i class="fas fa-photo-film text-4xl mb-3 block text-slate-700"></i>콘텐츠가 없습니다</div>`
      return
    }

    container.innerHTML = list.map(ct => `
      <div class="card overflow-hidden hover:border-indigo-500/50 transition-colors">
        <div class="relative h-32 bg-slate-900 overflow-hidden">
          ${ct.thumbnail_url ? `<img src="${ct.thumbnail_url}" class="w-full h-full object-cover opacity-80">` :
            `<div class="w-full h-full flex items-center justify-center text-4xl">${getIcon(ct.content_type)}</div>`}
          <div class="absolute bottom-2 left-2">${typeBadge(ct.content_type)}</div>
          ${ct.duration_seconds ? `<div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">${formatDuration(ct.duration_seconds)}</div>` : ''}
        </div>
        <div class="p-4">
          <div class="text-xs text-indigo-400 mb-1">${ct.channel_name}</div>
          <h4 class="text-white font-semibold text-sm mb-1 line-clamp-2">${ct.title}</h4>
          <p class="text-slate-400 text-xs mb-3 line-clamp-2">${ct.description || '설명 없음'}</p>
          <div class="flex items-center justify-between">
            <span class="text-slate-500 text-xs">${formatDate(ct.created_at)}</span>
            <div class="flex gap-2">
              <button onclick="sendNotifForContent(${ct.id}, ${ct.channel_id}, '${ct.title.replace(/'/g,"\\'")}' )"
                class="bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 px-2 py-1 rounded text-xs">
                <i class="fas fa-bell mr-1"></i>발송
              </button>
              <button onclick="deleteContent(${ct.id})"
                class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-2 py-1.5 rounded text-xs">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`).join('')
  } catch (e) { showToast('콘텐츠 로드 오류: ' + e.message, 'error') }
}

function openContentModal() {
  ['contentChannelId','contentTitle','contentDescription','contentUrl','contentThumbnail','contentDuration','autoNotifTitle','autoNotifBody'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  document.getElementById('contentType').value = 'audio'
  document.getElementById('sendAfterCreate').checked = false
  document.getElementById('notifSettingsDiv').classList.add('hidden')
  const ctModal = document.getElementById('contentChannelId')
  ctModal.innerHTML = '<option value="">채널 선택...</option>'
  channels.forEach(ch => ctModal.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
  openModal('contentModal')
}

function onContentTypeChange() {
  const type = document.getElementById('contentType').value
  const label = document.getElementById('contentUrlLabel')
  const input = document.getElementById('contentUrl')
  if (type === 'youtube') { label.textContent = 'YouTube URL *'; input.placeholder = 'https://youtube.com/watch?v=...' }
  else if (type === 'video') { label.textContent = '동영상 URL *'; input.placeholder = 'https://example.com/video.mp4' }
  else { label.textContent = '오디오 URL *'; input.placeholder = 'https://example.com/audio.mp3' }
}

document.getElementById('sendAfterCreate').addEventListener('change', function() {
  const div = document.getElementById('notifSettingsDiv')
  if (this.checked) {
    div.classList.remove('hidden')
    const title = document.getElementById('contentTitle').value
    if (title) {
      document.getElementById('autoNotifTitle').value = `새 콘텐츠가 등록되었습니다 ${getIcon(document.getElementById('contentType').value)}`
      document.getElementById('autoNotifBody').value = title
    }
  } else div.classList.add('hidden')
})

async function saveContent() {
  const payload = {
    channel_id: parseInt(document.getElementById('contentChannelId').value),
    content_type: document.getElementById('contentType').value,
    title: document.getElementById('contentTitle').value.trim(),
    description: document.getElementById('contentDescription').value.trim(),
    content_url: document.getElementById('contentUrl').value.trim(),
    thumbnail_url: document.getElementById('contentThumbnail').value.trim(),
    duration_seconds: parseInt(document.getElementById('contentDuration').value) || null,
    created_by: 'admin'
  }
  if (!payload.channel_id || !payload.title || !payload.content_url) { showToast('채널, 제목, URL은 필수입니다', 'error'); return }

  try {
    const { data } = await API.post('/contents', payload)
    const contentId = data.data.id
    const sendAfter = document.getElementById('sendAfterCreate').checked
    if (sendAfter) {
      const nt = document.getElementById('autoNotifTitle').value.trim()
      const nb = document.getElementById('autoNotifBody').value.trim()
      if (nt && nb) {
        await API.post('/notifications/send', { channel_id: payload.channel_id, content_id: contentId, title: nt, body: nb, created_by: 'admin' })
        showToast('콘텐츠 등록 및 푸시 알림 발송 완료!')
      }
    } else showToast('콘텐츠가 등록되었습니다')
    closeModal('contentModal')
    loadContents()
  } catch (e) { showToast('저장 오류: ' + e.message, 'error') }
}

async function deleteContent(id) {
  if (!confirm('콘텐츠를 삭제하시겠습니까?')) return
  try { await API.delete(`/contents/${id}`); showToast('삭제되었습니다'); loadContents() }
  catch (e) { showToast('삭제 오류: ' + e.message, 'error') }
}

function sendNotifForContent(contentId, channelId, title) {
  showPage('notifications')
  setTimeout(() => {
    document.getElementById('notifChannel').value = channelId
    loadNotifContents().then(() => {
      document.getElementById('notifContent').value = contentId
      onContentSelect()
      document.getElementById('notifTitle').value = `새 콘텐츠가 등록되었습니다 🎵`
      document.getElementById('notifBody').value = title
    })
  }, 200)
}

// =============================================
// 구독자 관리
// =============================================
async function loadSubscribers() {
  try {
    const channelId = document.getElementById('subscriberChannelFilter')?.value || ''
    const platform = document.getElementById('subscriberPlatformFilter')?.value || ''
    const url = channelId ? `/subscribers?channel_id=${channelId}` : '/subscribers'

    const { data } = await API.get(url)
    let list = data.data || []
    if (platform) list = list.filter(s => s.platform === platform)

    document.getElementById('subscriberCount').textContent = `${list.length}명 구독 중`
    selectedSubIds.clear()
    updateSubBulkBar()
    const tbody = document.getElementById('subscribersTable')
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-slate-500 py-8">구독자가 없습니다</td></tr>'; return }

    tbody.innerHTML = list.map(s => `
      <tr class="table-row border-b border-slate-700/50">
        <td class="px-4 py-3">
          <input type="checkbox" class="sub-check w-4 h-4 accent-indigo-500 cursor-pointer" data-id="${s.id}" onchange="onSubCheck(this)">
        </td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-400 font-bold">
              ${(s.display_name || s.user_id).charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="text-white text-sm font-medium">${s.display_name || s.user_id}</div>
              <div class="text-slate-500 text-xs">${s.email || s.user_id}</div>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-slate-300 text-xs">${s.channel_name}</td>
        <td class="px-5 py-3">
          ${s.invite_label ? `<span class="text-xs bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">
            <i class="fas fa-link mr-1 text-xs"></i>${s.invite_label}</span>` : 
            '<span class="text-slate-600 text-xs">직접</span>'}
        </td>
        <td class="px-5 py-3 text-center">${platformIcon(s.platform)}</td>
        <td class="px-5 py-3 text-center text-emerald-400 font-semibold">${s.accepted_count}</td>
        <td class="px-5 py-3 text-center text-red-400 font-semibold">${s.rejected_count}</td>
        <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(s.subscribed_at)}</td>
        <td class="px-5 py-3 text-center">
          <span class="${s.is_active ? 'badge-completed' : 'badge-failed'} badge">${s.is_active ? '활성' : '비활성'}</span>
        </td>
        <td class="px-5 py-3 text-center">
          <button onclick="deleteSubscriber(${s.id}, '${(s.display_name || s.user_id).replace(/'/g, "\\'")}')"

            class="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded transition text-sm"
            title="삭제"><i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`).join('')
  } catch (e) { showToast('구독자 로드 오류: ' + e.message, 'error') }
}

async function deleteSubscriber(id, name) {
  if (!confirm(`"${name}" 구독자를 삭제하시겠습니까?`)) return
  try {
    const { data: res } = await API.delete(`/subscribers/${id}`)
    if (!res.success) throw new Error(res.error || '삭제 실패')
    showToast('구독자가 삭제되었습니다')
    await loadSubscribers()
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'error')
  }
}

// ── 구독자 선택삭제 ──────────────────────────────────
const selectedSubIds = new Set()

function updateSubBulkBar() {
  const bar = document.getElementById('subBulkDeleteBar')
  const cnt = document.getElementById('subSelectedCount')
  const n   = selectedSubIds.size
  if (!bar) return
  if (n > 0) {
    bar.classList.remove('hidden'); bar.classList.add('flex')
    cnt.textContent = `${n}명 선택됨`
  } else {
    bar.classList.add('hidden'); bar.classList.remove('flex')
  }
}

function toggleSubCheckAll(el) {
  document.querySelectorAll('.sub-check').forEach(cb => {
    cb.checked = el.checked
    const id = Number(cb.dataset.id)
    if (el.checked) selectedSubIds.add(id)
    else selectedSubIds.delete(id)
  })
  updateSubBulkBar()
}

function onSubCheck(cb) {
  const id = Number(cb.dataset.id)
  if (cb.checked) selectedSubIds.add(id)
  else selectedSubIds.delete(id)
  const all     = document.querySelectorAll('.sub-check')
  const checked = document.querySelectorAll('.sub-check:checked')
  const ca      = document.getElementById('subCheckAll')
  if (ca) ca.checked = all.length > 0 && all.length === checked.length
  updateSubBulkBar()
}

function clearSubSelection() {
  selectedSubIds.clear()
  document.querySelectorAll('.sub-check').forEach(cb => cb.checked = false)
  const ca = document.getElementById('subCheckAll')
  if (ca) ca.checked = false
  updateSubBulkBar()
}

async function bulkDeleteSubscribers() {
  if (selectedSubIds.size === 0) return
  if (!confirm(`선택한 ${selectedSubIds.size}명의 구독자를 삭제하시겠습니까?`)) return
  try {
    const res = await API.post('/subscribers/bulk-delete', { ids: [...selectedSubIds] })
    if (res.data?.success) {
      showToast(`${res.data.deleted}명의 구독자가 삭제되었습니다`)
      selectedSubIds.clear()
      loadSubscribers()
    } else {
      showToast('삭제 실패: ' + (res.data?.error || '오류'), 'error')
    }
  } catch(e) { showToast('삭제 오류: ' + e.message, 'error') }
}

// ── 채널 선택 삭제 ──────────────────────────
const selectedChIds = new Set()

function updateChBulkBar() {
  const bar = document.getElementById('chBulkDeleteBar')
  const cnt = document.getElementById('chSelectedCount')
  if (!bar) return
  const n = selectedChIds.size
  if (n > 0) { bar.classList.remove('hidden'); bar.classList.add('flex'); cnt.textContent = `${n}개 선택됨` }
  else        { bar.classList.add('hidden'); bar.classList.remove('flex') }
}

function toggleChCheckAll(el) {
  document.querySelectorAll('.ch-check').forEach(cb => {
    cb.checked = el.checked
    const id = Number(cb.dataset.id)
    if (el.checked) selectedChIds.add(id)
    else selectedChIds.delete(id)
  })
  updateChBulkBar()
}

function onChCheck(cb) {
  const id = Number(cb.dataset.id)
  if (cb.checked) selectedChIds.add(id)
  else selectedChIds.delete(id)
  const all = document.querySelectorAll('.ch-check')
  const checked = document.querySelectorAll('.ch-check:checked')
  const ca = document.getElementById('chCheckAll')
  if (ca) ca.checked = all.length > 0 && all.length === checked.length
  updateChBulkBar()
}

function clearChSelection() {
  selectedChIds.clear()
  document.querySelectorAll('.ch-check').forEach(cb => cb.checked = false)
  const ca = document.getElementById('chCheckAll')
  if (ca) ca.checked = false
  updateChBulkBar()
}

async function bulkDeleteChannels() {
  if (selectedChIds.size === 0) return
  if (!confirm(`선택한 ${selectedChIds.size}개의 채널을 삭제하시겠습니까?\n초대링크, 구독자, 콘텐츠가 모두 삭제됩니다.`)) return
  try {
    const res = await API.post('/channels/bulk-delete', { ids: [...selectedChIds] })
    if (res.data?.success) {
      showToast(`${res.data.deleted}개의 채널이 삭제되었습니다`)
      selectedChIds.clear()
      await loadGlobalChannels()
      loadChannels()
    } else {
      showToast('삭제 실패: ' + (res.data?.error || '오류'), 'error')
    }
  } catch(e) { showToast('삭제 오류: ' + e.message, 'error') }
}

// =============================================
// 알림 발송
// =============================================
async function loadNotifPage() {
  const notifCh = document.getElementById('notifChannel')
  notifCh.innerHTML = '<option value="">채널 선택...</option>'
  channels.forEach(ch => notifCh.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
  loadBatches()
}

async function loadNotifContents() {
  const channelId = document.getElementById('notifChannel').value
  const sel = document.getElementById('notifContent')
  sel.innerHTML = '<option value="">콘텐츠 선택...</option>'
  document.getElementById('contentPreview').classList.add('hidden')
  document.getElementById('subscriberPreview').classList.add('hidden')
  if (!channelId) return

  try {
    const { data } = await API.get(`/contents?channel_id=${channelId}`)
    const list = data.data || []
    list.forEach(ct => sel.innerHTML += `<option value="${ct.id}" data-type="${ct.content_type}" data-thumb="${ct.thumbnail_url || ''}">${getIcon(ct.content_type)} ${ct.title}</option>`)
    const subRes = await API.get(`/subscribers?channel_id=${channelId}`)
    const active = (subRes.data.data || []).filter(s => s.is_active)
    document.getElementById('targetCount').textContent = active.length
    document.getElementById('subscriberPreview').classList.remove('hidden')
  } catch (e) { console.error(e) }
}

function onContentSelect() {
  const sel = document.getElementById('notifContent')
  const opt = sel.options[sel.selectedIndex]
  if (!opt.value) { document.getElementById('contentPreview').classList.add('hidden'); return }
  document.getElementById('previewThumbnail').src = opt.getAttribute('data-thumb') || ''
  document.getElementById('previewTitle').textContent = opt.text.substring(2)
  document.getElementById('previewType').textContent = opt.getAttribute('data-type')?.toUpperCase()
  document.getElementById('contentPreview').classList.remove('hidden')
}

async function sendNotification() {
  const channelId = document.getElementById('notifChannel').value
  const contentId = document.getElementById('notifContent').value
  const title = document.getElementById('notifTitle').value.trim()
  const body = document.getElementById('notifBody').value.trim()
  if (!channelId || !contentId || !title || !body) { showToast('모든 필드를 입력하세요', 'error'); return }

  const btn = document.getElementById('sendBtn')
  btn.disabled = true
  document.getElementById('sendBtnText').innerHTML = '<i class="fas fa-spinner spinner mr-2"></i>발송 중...'

  try {
    const { data } = await API.post('/notifications/send', { channel_id: parseInt(channelId), content_id: parseInt(contentId), title, body, created_by: 'admin' })
    const r = data.data
    showToast(`✅ 발송 완료${r.mode === 'simulation' ? ' (시뮬레이션)' : ''}: ${r.sent_count}/${r.total_targets}명`)
    document.getElementById('notifTitle').value = ''
    document.getElementById('notifBody').value = ''
    loadBatches()
  } catch (e) { showToast('발송 오류: ' + (e.response?.data?.error || e.message), 'error') }
  finally {
    btn.disabled = false
    document.getElementById('sendBtnText').innerHTML = '<i class="fas fa-paper-plane mr-2"></i>푸시 알림 발송'
  }
}

async function loadBatches() {
  try {
    const channelId = document.getElementById('globalChannelSelect')?.value || ''
    const { data } = await API.get('/notifications/batches' + (channelId ? `?channel_id=${channelId}` : ''))
    const batches = data.data || []

    const logBatch = document.getElementById('logBatchFilter')
    if (logBatch) {
      logBatch.innerHTML = '<option value="">배치 선택 (최근 발송 이력)</option>'
      batches.forEach(b => logBatch.innerHTML += `<option value="${b.id}">[${b.channel_name}] ${b.title} (${formatDate(b.created_at)})</option>`)
    }

    const tbody = document.getElementById('batchesTable')
    if (!tbody) return
    if (!batches.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">발송 이력이 없습니다</td></tr>'; return }

    tbody.innerHTML = batches.map(b => `
      <tr class="table-row border-b border-slate-700/50 cursor-pointer" onclick="viewBatchLogs(${b.id})">
        <td class="px-4 py-3">
          <div class="text-white text-xs font-medium line-clamp-1">${b.title}</div>
          <div class="text-slate-500 text-xs">${b.content_title || ''}</div>
        </td>
        <td class="px-4 py-3 text-center text-slate-300">${b.total_targets}</td>
        <td class="px-4 py-3 text-center text-blue-400">${b.sent_count}</td>
        <td class="px-4 py-3 text-center text-emerald-400 font-semibold">${acceptRate(b.accepted_count, b.sent_count)}</td>
        <td class="px-4 py-3 text-center">${statusBadge(b.status)}</td>
        <td class="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(b.created_at)}</td>
      </tr>`).join('')
  } catch (e) { console.error(e) }
}

// =============================================
// 발송 로그
// =============================================
async function loadLogBatches() {
  try {
    const { data } = await API.get('/notifications/batches')
    const batches = data.data || []
    const el = document.getElementById('logBatchFilter')
    el.innerHTML = '<option value="">배치 선택 (최근 발송 이력)</option>'
    batches.forEach(b => el.innerHTML += `<option value="${b.id}">[${b.channel_name}] ${b.title} (${formatDate(b.created_at)})</option>`)
  } catch (e) { console.error(e) }
}

async function loadLogs() {
  const batchId = document.getElementById('logBatchFilter').value
  if (!batchId) {
    document.getElementById('logsTable').innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">배치를 선택하세요</td></tr>'
    document.getElementById('batchStats').classList.add('hidden')
    return
  }
  try {
    const { data } = await API.get(`/notifications/batches/${batchId}`)
    const batch = data.data
    allLogs = batch.logs || []
    document.getElementById('batchStats').classList.remove('hidden')
    document.getElementById('logStatTotal').textContent = batch.total_targets
    document.getElementById('logStatSent').textContent = batch.sent_count
    document.getElementById('logStatAccepted').textContent = batch.accepted_count
    document.getElementById('logStatRejected').textContent = batch.rejected_count
    filterLogs()
  } catch (e) { showToast('로그 로드 오류: ' + e.message, 'error') }
}

function filterLogs() {
  const sf = document.getElementById('logStatusFilter').value
  const logs = sf ? allLogs.filter(l => l.status === sf) : allLogs
  const tbody = document.getElementById('logsTable')
  if (!logs.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">로그가 없습니다</td></tr>'; return }
  tbody.innerHTML = logs.map(l => `
    <tr class="table-row border-b border-slate-700/50">
      <td class="px-5 py-3"><div class="text-white text-sm">${l.display_name || l.subscriber_id}</div></td>
      <td class="px-5 py-3 text-center">${platformIcon(l.platform)}</td>
      <td class="px-5 py-3"><code class="text-slate-400 text-xs">${l.fcm_token ? l.fcm_token.substring(0,20) + '...' : '-'}</code></td>
      <td class="px-5 py-3 text-center">${statusBadge(l.status)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(l.sent_at)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(l.action_at)}</td>
    </tr>`).join('')
}

function viewBatchLogs(batchId) {
  showPage('logs')
  setTimeout(() => { document.getElementById('logBatchFilter').value = batchId; loadLogs() }, 100)
}

// =============================================
// 구독자 목록에서 초대 링크 이름 표시 위해 subscribers.ts 확장 필요
// 여기서는 프론트에서 처리
// =============================================

// =============================================
// 회원 관리
// =============================================
let memberPage = 1
let memberSearchTimer = null
const selectedMemberIds = new Set()

function escHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function debounceSearchMembers() {
  clearTimeout(memberSearchTimer)
  memberSearchTimer = setTimeout(() => { memberPage = 1; selectedMemberIds.clear(); loadMembers() }, 400)
}

function updateBulkBar() {
  const bar   = document.getElementById('bulkDeleteBar')
  const cnt   = document.getElementById('selectedCount')
  const n     = selectedMemberIds.size
  if (!bar) return
  if (n > 0) {
    bar.classList.remove('hidden')
    bar.classList.add('flex')
    cnt.textContent = `${n}명 선택됨`
  } else {
    bar.classList.add('hidden')
    bar.classList.remove('flex')
  }
}

function toggleCheckAll(el) {
  document.querySelectorAll('.member-check').forEach(cb => {
    cb.checked = el.checked
    const uid = cb.dataset.uid
    if (el.checked) selectedMemberIds.add(uid)
    else selectedMemberIds.delete(uid)
  })
  updateBulkBar()
}

function onMemberCheck(cb) {
  const uid = cb.dataset.uid
  if (cb.checked) selectedMemberIds.add(uid)
  else selectedMemberIds.delete(uid)
  // 전체선택 체크박스 동기화
  const all = document.querySelectorAll('.member-check')
  const checked = document.querySelectorAll('.member-check:checked')
  const checkAll = document.getElementById('checkAll')
  if (checkAll) checkAll.checked = all.length > 0 && all.length === checked.length
  updateBulkBar()
}

function clearMemberSelection() {
  selectedMemberIds.clear()
  document.querySelectorAll('.member-check').forEach(cb => cb.checked = false)
  const checkAll = document.getElementById('checkAll')
  if (checkAll) checkAll.checked = false
  updateBulkBar()
}

async function bulkDeleteMembers() {
  if (selectedMemberIds.size === 0) return
  if (!confirm(`선택한 ${selectedMemberIds.size}명을 삭제하시겠습니까?\n\n⚠️ 구독 정보를 포함한 모든 데이터가 삭제됩니다.`)) return
  try {
    const res = await API.post('/users/bulk-delete', { user_ids: [...selectedMemberIds] })
    if (res.data?.success) {
      showToast(`${res.data.deleted}명이 삭제되었습니다`)
      selectedMemberIds.clear()
      loadMembers()
    }
  } catch(e) { console.error(e) }
}

// ──────────────────────────────────────────────
// 알람 관리
// ──────────────────────────────────────────────
let allAlarms = []

async function loadAlarmManagement() {
  try {
    const { data: res } = await API.get('/alarms')
    if (!res.success) throw new Error('알람 로드 실패')
    allAlarms = res.data || []

    // 통계 계산
    const total     = allAlarms.length
    const pending   = allAlarms.filter(a => a.status === 'pending').length
    const triggered = allAlarms.filter(a => a.status === 'triggered').length
    const cancelled = allAlarms.filter(a => a.status === 'cancelled').length

    document.getElementById('alarmStatTotal').textContent     = total
    document.getElementById('alarmStatPending').textContent   = pending
    document.getElementById('alarmStatTriggered').textContent = triggered
    document.getElementById('alarmStatCancelled').textContent = cancelled

    // 채널 필터 옵션 구성
    const channelSel = document.getElementById('alarmFilterChannel')
    const channels   = [...new Set(allAlarms.map(a => a.channel_name).filter(Boolean))]
    const prevVal    = channelSel.value
    channelSel.innerHTML = '<option value="">전체 채널</option>' +
      channels.map(ch => `<option value="${ch}" ${ch === prevVal ? 'selected' : ''}>${ch}</option>`).join('')

    renderAlarmTable()
    selectedAlarmIds.clear()
    updateAlarmBulkBar()
  } catch (e) {
    console.error(e)
    document.getElementById('alarmTableBody').innerHTML =
      '<tr><td colspan="8" class="text-center py-10 text-rose-400">불러오기 실패</td></tr>'
  }
}

function filterAlarms() {
  renderAlarmTable()
}

function renderAlarmTable() {
  const statusFilter  = document.getElementById('alarmFilterStatus')?.value  || ''
  const channelFilter = document.getElementById('alarmFilterChannel')?.value || ''

  let list = allAlarms
  if (statusFilter)  list = list.filter(a => a.status === statusFilter)
  if (channelFilter) list = list.filter(a => a.channel_name === channelFilter)

  // 최신순 정렬
  list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const tbody = document.getElementById('alarmTableBody')
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-500">알람이 없습니다</td></tr>'
    return
  }

  const msgTypeLabel = { youtube:'YouTube', audio:'오디오', video:'비디오', text:'텍스트', image:'이미지' }
  const statusBadge  = {
    pending:   '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400"><i class="fas fa-clock"></i> 대기중</span>',
    triggered: '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400"><i class="fas fa-check"></i> 발송완료</span>',
    cancelled: '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400"><i class="fas fa-ban"></i> 취소됨</span>',
  }

  tbody.innerHTML = list.map(a => {
    const localTime = a.scheduled_at
      ? new Date(a.scheduled_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '-'
    const createdTime = a.created_at
      ? new Date(a.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '-'
    const badge    = statusBadge[a.status] || `<span class="text-slate-400 text-xs">${a.status}</span>`
    const typeLabel = msgTypeLabel[a.msg_type] || a.msg_type || '-'
    const deleteBtn = `<button onclick="deleteAlarm(${a.id})"
      class="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-1 rounded transition text-sm"
      title="삭제">
      <i class="fas fa-trash"></i>
    </button>`

    return `<tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
      <td class="px-4 py-3">
        <input type="checkbox" class="alarm-check w-4 h-4 accent-indigo-500 cursor-pointer" data-id="${a.id}" onchange="onAlarmCheck(this)">
      </td>
      <td class="px-5 py-3 text-slate-200 font-medium">${a.channel_name || '-'}</td>
      <td class="px-5 py-3">
        <span class="inline-flex items-center gap-1.5 text-sm text-slate-300">
          ${a.msg_type === 'youtube' ? '<i class="fab fa-youtube text-rose-400"></i>' :
            a.msg_type === 'audio'   ? '<i class="fas fa-music text-sky-400"></i>' :
            a.msg_type === 'video'   ? '<i class="fas fa-video text-purple-400"></i>' :
            '<i class="fas fa-font text-slate-400"></i>'}
          ${typeLabel}
        </span>
      </td>
      <td class="px-5 py-3 text-slate-300 text-sm">${localTime}</td>
      <td class="px-5 py-3 text-slate-300 text-sm">${a.total_targets ?? 0} / ${a.sent_count ?? 0} 명</td>
      <td class="px-5 py-3">${badge}</td>
      <td class="px-5 py-3 text-slate-400 text-sm">${createdTime}</td>
      <td class="px-5 py-3 text-center">${deleteBtn}</td>
    </tr>`
  }).join('')
}

async function deleteAlarm(id) {
  const alarm = allAlarms.find(a => a.id === id)
  const label = alarm ? `채널 "${alarm.channel_name}" 알람 (${new Date(alarm.scheduled_at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})})` : `알람 #${id}`
  if (!confirm(`${label}\n\n이 알람을 삭제하시겠습니까?`)) return
  try {
    const { data: res } = await API.delete(`/alarms/${id}`)
    if (!res.success) throw new Error(res.error || '삭제 실패')
    showToast('알람이 삭제되었습니다')
    await loadAlarmManagement()
  } catch (e) { showToast('삭제 실패: ' + e.message, 'error') }
}

// ── 알람 선택삭제 ──────────────────────────────────
const selectedAlarmIds = new Set()

function updateAlarmBulkBar() {
  const bar = document.getElementById('alarmBulkDeleteBar')
  const cnt = document.getElementById('alarmSelectedCount')
  const n   = selectedAlarmIds.size
  if (!bar) return
  if (n > 0) {
    bar.classList.remove('hidden'); bar.classList.add('flex')
    cnt.textContent = `${n}개 선택됨`
  } else {
    bar.classList.add('hidden'); bar.classList.remove('flex')
  }
}

function toggleAlarmCheckAll(el) {
  document.querySelectorAll('.alarm-check').forEach(cb => {
    cb.checked = el.checked
    const id = Number(cb.dataset.id)
    if (el.checked) selectedAlarmIds.add(id)
    else selectedAlarmIds.delete(id)
  })
  updateAlarmBulkBar()
}

function onAlarmCheck(cb) {
  const id = Number(cb.dataset.id)
  if (cb.checked) selectedAlarmIds.add(id)
  else selectedAlarmIds.delete(id)
  const all     = document.querySelectorAll('.alarm-check')
  const checked = document.querySelectorAll('.alarm-check:checked')
  const ca      = document.getElementById('alarmCheckAll')
  if (ca) ca.checked = all.length > 0 && all.length === checked.length
  updateAlarmBulkBar()
}

function clearAlarmSelection() {
  selectedAlarmIds.clear()
  document.querySelectorAll('.alarm-check').forEach(cb => cb.checked = false)
  const ca = document.getElementById('alarmCheckAll')
  if (ca) ca.checked = false
  updateAlarmBulkBar()
}

async function bulkDeleteAlarms() {
  if (selectedAlarmIds.size === 0) return
  if (!confirm(`선택한 ${selectedAlarmIds.size}개의 알람을 삭제하시겠습니까?`)) return
  try {
    const res = await API.post('/alarms/bulk-delete', { ids: [...selectedAlarmIds] })
    if (res.data?.success) {
      showToast(`${res.data.deleted}개의 알람이 삭제되었습니다`)
      selectedAlarmIds.clear()
      loadAlarmManagement()
    } else {
      showToast('삭제 실패: ' + (res.data?.error || '오류'), 'error')
    }
  } catch(e) { showToast('삭제 오류: ' + e.message, 'error') }
}

async function loadMembers() {
  const search = document.getElementById('memberSearch')?.value || ''
  try {
    // 통계 로드
    const statsRes = await API.get('/users/stats/summary')
    if (statsRes.data?.success) {
      const s = statsRes.data.data
      document.getElementById('statTotal').textContent  = s.total
      document.getElementById('statActive').textContent = s.active
      document.getElementById('statFcm').textContent    = s.has_fcm
      document.getElementById('statWeek').textContent   = s.week
    }

    // 목록 로드
    const res = await API.get(`/users?search=${encodeURIComponent(search)}&page=${memberPage}&limit=20`)
    if (!res.data?.success) return

    const { data, pagination } = res.data
    const tbody = document.getElementById('membersTable')
    if (!tbody) return

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-500 py-10">등록된 회원이 없습니다</td></tr>`
    } else {
      tbody.innerHTML = data.map(m => {
        const isChecked = selectedMemberIds.has(m.user_id)
        const activeBtn = m.is_active
          ? `bg-emerald-900/50 text-emerald-400 hover:bg-red-900/50 hover:text-red-400`
          : `bg-slate-700 text-slate-400 hover:bg-emerald-900/50 hover:text-emerald-400`
        return `
        <tr class="border-t border-slate-700/50 hover:bg-slate-800/50 ${isChecked ? 'bg-indigo-950/40' : ''}">
          <td class="px-4 py-3 text-center">
            <input type="checkbox" class="member-check w-4 h-4 accent-indigo-500 cursor-pointer"
              data-uid="${m.user_id}" ${isChecked ? 'checked' : ''} onchange="onMemberCheck(this)">
          </td>
          <td class="px-4 py-3">
            <div class="font-medium text-white text-sm">${escHtml(m.display_name || '이름 없음')}</div>
            <div class="text-slate-500 text-xs mt-0.5 font-mono">${escHtml(m.user_id?.substring(0,14))}…</div>
          </td>
          <td class="px-4 py-3 text-slate-300 text-sm">${escHtml(m.email)}</td>
          <td class="px-4 py-3 text-center">
            <span class="bg-indigo-900/50 text-indigo-300 text-xs px-2 py-1 rounded-full">${m.subscribe_count}개</span>
          </td>
          <td class="px-4 py-3 text-center">
            ${m.has_fcm
              ? '<span class="text-emerald-400 text-xs"><i class="fas fa-check-circle"></i> 등록</span>'
              : '<span class="text-slate-500 text-xs"><i class="fas fa-times-circle"></i> 미등록</span>'}
          </td>
          <td class="px-4 py-3 text-center">
            <button onclick="toggleMember('${m.user_id}', ${m.is_active})"
              class="text-xs px-2 py-1 rounded-full font-semibold cursor-pointer ${activeBtn} transition-colors">
              ${m.is_active ? '활성' : '비활성'}
            </button>
          </td>
          <td class="px-4 py-3 text-slate-400 text-xs">${formatDate(m.created_at)}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="viewMember('${m.user_id}')" title="상세보기"
              class="text-indigo-400 hover:text-indigo-300 text-sm mr-2"><i class="fas fa-eye"></i></button>
            <button onclick="deleteMember('${m.user_id}', '${escHtml(m.email)}')" title="삭제"
              class="text-red-400 hover:text-red-300 text-sm"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`
      }).join('')
    }

    // 체크박스 상태 동기화 (페이지 이동 후에도 유지)
    document.querySelectorAll('.member-check').forEach(cb => {
      if (selectedMemberIds.has(cb.dataset.uid)) cb.checked = true
    })
    updateBulkBar()

    // 페이지네이션
    const pag = document.getElementById('memberPagination')
    if (pag && pagination.total > 0) {
      const start = (pagination.page - 1) * pagination.limit + 1
      const end   = Math.min(pagination.page * pagination.limit, pagination.total)
      pag.innerHTML = `
        <span>전체 <strong class="text-white">${pagination.total}</strong>명 중 ${start}~${end}명</span>
        <div class="flex gap-2 items-center">
          <button onclick="changeMemberPage(${pagination.page - 1})" ${pagination.page <= 1 ? 'disabled' : ''}
            class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs">
            <i class="fas fa-chevron-left"></i>
          </button>
          <span>${pagination.page} / ${pagination.pages}</span>
          <button onclick="changeMemberPage(${pagination.page + 1})" ${pagination.page >= pagination.pages ? 'disabled' : ''}
            class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>`
    } else if (pag) {
      pag.innerHTML = ''
    }
  } catch(e) {
    console.error('loadMembers error:', e)
  }
}

function changeMemberPage(page) {
  if (page < 1) return
  memberPage = page
  loadMembers()
}

async function viewMember(userId) {
  try {
    const res = await API.get(`/users/${userId}`)
    if (!res.data?.success) return
    const m = res.data.data

    const subRows = (m.subscriptions || []).length === 0
      ? '<div class="text-slate-500 text-sm py-1">구독 채널 없음</div>'
      : (m.subscriptions || []).map(s => `
          <div class="flex items-center justify-between py-1.5 border-t border-slate-700/50">
            <span class="text-white text-sm">${escHtml(s.channel_name)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700 text-slate-400'}">
              ${s.is_active ? '활성' : '비활성'}
            </span>
          </div>`).join('')

    document.getElementById('memberModalContent').innerHTML = `
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-800 rounded-xl p-3">
            <div class="text-slate-400 text-xs mb-1">이름</div>
            <div class="text-white font-semibold">${escHtml(m.display_name || '-')}</div>
          </div>
          <div class="bg-slate-800 rounded-xl p-3">
            <div class="text-slate-400 text-xs mb-1">상태</div>
            <div class="font-semibold ${m.is_active ? 'text-emerald-400' : 'text-slate-500'}">${m.is_active ? '활성' : '비활성'}</div>
          </div>
        </div>
        <div class="bg-slate-800 rounded-xl p-3">
          <div class="text-slate-400 text-xs mb-1">이메일</div>
          <div class="text-white">${escHtml(m.email)}</div>
        </div>
        <div class="bg-slate-800 rounded-xl p-3">
          <div class="text-slate-400 text-xs mb-1">User ID</div>
          <div class="text-white font-mono text-xs break-all">${escHtml(m.user_id)}</div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-800 rounded-xl p-3">
            <div class="text-slate-400 text-xs mb-1">FCM 토큰</div>
            <div class="${m.has_fcm ? 'text-emerald-400' : 'text-slate-500'} text-sm">${m.has_fcm ? '✅ 등록됨' : '❌ 미등록'}</div>
          </div>
          <div class="bg-slate-800 rounded-xl p-3">
            <div class="text-slate-400 text-xs mb-1">전화번호</div>
            <div class="text-white text-sm">${escHtml(m.phone_number || '-')}</div>
          </div>
        </div>
        <div class="bg-slate-800 rounded-xl p-3">
          <div class="text-slate-400 text-xs mb-2 font-semibold">구독 채널 (${m.subscriptions?.length || 0}개)</div>
          ${subRows}
        </div>
        <div class="bg-slate-800 rounded-xl p-3">
          <div class="text-slate-400 text-xs mb-1">가입일</div>
          <div class="text-white text-sm">${formatDate(m.created_at)}</div>
        </div>
        <div class="flex gap-2 pt-1">
          <button onclick="closeModal('memberModal')"
            class="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm">
            <i class="fas fa-times mr-1"></i>닫기
          </button>
          <button onclick="closeModal('memberModal'); deleteMember('${m.user_id}', '${escHtml(m.email)}')"
            class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm">
            <i class="fas fa-trash mr-1"></i>삭제
          </button>
        </div>
      </div>`
    document.getElementById('memberModal').classList.remove('hidden')
  } catch(e) { console.error(e) }
}

async function toggleMember(userId, currentStatus) {
  if (!confirm(currentStatus ? '회원을 비활성 상태로 변경할까요?' : '회원을 활성 상태로 변경할까요?')) return
  try {
    const res = await API.patch(`/users/${userId}/toggle`)
    if (res.data?.success) { showToast('상태가 변경되었습니다'); loadMembers() }
  } catch(e) { console.error(e) }
}

async function deleteMember(userId, email) {
  if (!confirm(`회원 "${email}"을(를) 삭제하시겠습니까?\n\n⚠️ 구독 정보를 포함한 모든 데이터가 삭제됩니다.`)) return
  try {
    const res = await API.delete(`/users/${userId}`)
    if (res.data?.success) { showToast('회원이 삭제되었습니다'); selectedMemberIds.delete(userId); loadMembers() }
  } catch(e) { console.error(e) }
}

// =============================================
// 초기화
// =============================================
async function init() {
  await loadGlobalChannels()
  loadDashboard()
}

document.addEventListener('DOMContentLoaded', init)

// =============================================
// 공지사항 관리
// =============================================
let editNoticeId = null

async function loadNoticesAdmin() {
  try {
    const { data } = await API.get('/notices?all=1')
    const list = data.data || []
    const tbody = document.getElementById('notices-table-body')
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-slate-500">등록된 공지사항이 없습니다.</td></tr>'
      return
    }
    tbody.innerHTML = list.map(n => `
      <tr class="border-b border-slate-700/30 hover:bg-slate-700/20">
        <td class="px-5 py-3 text-slate-200 font-medium">${n.title}</td>
        <td class="px-5 py-3 text-slate-400 text-sm">${(n.content || '').slice(0, 60)}${n.content?.length > 60 ? '...' : ''}</td>
        <td class="px-5 py-3 text-center">
          <span class="${n.is_active ? 'badge-completed' : 'badge-failed'} badge">${n.is_active ? '활성' : '비활성'}</span>
        </td>
        <td class="px-5 py-3 text-center text-slate-400 text-xs">${(n.created_at || '').slice(0, 10)}</td>
        <td class="px-5 py-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="openNoticeModal(${n.id})" class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded text-xs"><i class="fas fa-edit"></i></button>
            <button onclick="deleteNotice(${n.id})" class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-2 py-1 rounded text-xs"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('')
  } catch (e) { showToast('공지사항 로드 오류: ' + e.message, 'error') }
}

async function openNoticeModal(id = null) {
  editNoticeId = id
  const modal = document.getElementById('modal-notice')
  if (!modal) {
    // 모달 동적 생성
    const div = document.createElement('div')
    div.id = 'modal-notice'
    div.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4'
    div.innerHTML = `
      <div class="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg">
        <h3 class="text-white font-bold text-lg mb-4" id="notice-modal-title">공지사항 추가</h3>
        <div class="space-y-3">
          <div>
            <label class="text-slate-400 text-xs font-semibold uppercase mb-1 block">제목 *</label>
            <input id="notice-title" class="input-field w-full" placeholder="공지사항 제목">
          </div>
          <div>
            <label class="text-slate-400 text-xs font-semibold uppercase mb-1 block">내용 *</label>
            <textarea id="notice-content" class="input-field w-full" rows="6" placeholder="공지사항 내용을 입력하세요"></textarea>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" id="notice-active" checked style="width:16px;height:16px;accent-color:#6366f1;">
            <label for="notice-active" class="text-slate-300 text-sm">활성화</label>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="saveNotice()" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold flex-1">저장</button>
          <button onclick="document.getElementById('modal-notice').remove()" class="bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm flex-1">취소</button>
        </div>
      </div>`
    document.body.appendChild(div)
  }
  document.getElementById('notice-modal-title').textContent = id ? '공지사항 수정' : '공지사항 추가'
  document.getElementById('notice-title').value = ''
  document.getElementById('notice-content').value = ''
  document.getElementById('notice-active').checked = true
  if (id) {
    try {
      const { data } = await API.get('/notices/' + id)
      const n = data.data
      document.getElementById('notice-title').value = n.title || ''
      document.getElementById('notice-content').value = n.content || ''
      document.getElementById('notice-active').checked = !!n.is_active
    } catch (e) { showToast('공지사항 로드 실패', 'error') }
  }
  document.getElementById('modal-notice').style.display = 'flex'
}

async function saveNotice() {
  const title   = document.getElementById('notice-title').value.trim()
  const content = document.getElementById('notice-content').value.trim()
  const isActive = document.getElementById('notice-active').checked ? 1 : 0
  if (!title) { showToast('제목을 입력하세요', 'error'); return }
  if (!content) { showToast('내용을 입력하세요', 'error'); return }
  try {
    if (editNoticeId) {
      await API.put('/notices/' + editNoticeId, { title, content, is_active: isActive })
      showToast('공지사항이 수정되었습니다')
    } else {
      await API.post('/notices', { title, content, is_active: isActive })
      showToast('공지사항이 등록되었습니다')
    }
    document.getElementById('modal-notice')?.remove()
    loadNoticesAdmin()
  } catch (e) { showToast('저장 실패: ' + e.message, 'error') }
}

async function deleteNotice(id) {
  if (!confirm('공지사항을 삭제할까요?')) return
  try {
    await API.delete('/notices/' + id)
    showToast('공지사항이 삭제되었습니다')
    loadNoticesAdmin()
  } catch (e) { showToast('삭제 실패: ' + e.message, 'error') }
}
