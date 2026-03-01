// public/static/app.js
// Push Notification Admin Dashboard - Frontend Logic

const API = axios.create({ baseURL: '/api' })
let channels = []
let allLogs = []
let dailyChartInstance = null
let acceptChartInstance = null
let currentPage = 'dashboard'

// =============================================
// 유틸리티 함수
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

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return dateStr }
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

function getContentTypeIcon(type) {
  const icons = { audio: '🎵', video: '🎬', youtube: '📺' }
  return icons[type] || '📄'
}

function getContentTypeBadge(type) {
  return `<span class="badge badge-${type}">${getContentTypeIcon(type)} ${type.toUpperCase()}</span>`
}

function getStatusBadge(status) {
  const labels = { completed: '완료', processing: '처리중', pending: '대기', failed: '실패', sent: '발송됨', accepted: '수락', rejected: '거절' }
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`
}

function getPlatformIcon(platform) {
  const icons = { android: '<i class="fab fa-android text-emerald-400"></i>', ios: '<i class="fab fa-apple text-slate-300"></i>', web: '<i class="fas fa-globe text-blue-400"></i>' }
  return icons[platform] || platform
}

function calcAcceptRate(accepted, sent) {
  if (!sent || sent === 0) return '0%'
  return `${Math.round(accepted / sent * 100)}%`
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden')
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden')
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const navItem = document.querySelector(`.nav-item[onclick="showPage('${page}')"]`)
  if (navItem) navItem.classList.add('active')
  
  const titles = {
    dashboard: '대시보드', channels: '채널 관리',
    contents: '콘텐츠 관리', subscribers: '구독자 관리',
    notifications: '알림 발송', logs: '발송 로그'
  }
  document.getElementById('pageTitle').textContent = titles[page] || page
  currentPage = page
  
  if (page === 'dashboard') loadDashboard()
  else if (page === 'channels') loadChannels()
  else if (page === 'contents') loadContents()
  else if (page === 'subscribers') loadSubscribers()
  else if (page === 'notifications') { loadNotifPage() }
  else if (page === 'logs') loadLogBatches()
}

function refreshCurrentPage() { showPage(currentPage) }

// =============================================
// 채널 셀렉트 초기화
// =============================================
async function loadGlobalChannels() {
  try {
    const { data } = await API.get('/channels')
    channels = data.data || []
    
    // 사이드바 채널 선택
    const sel = document.getElementById('globalChannelSelect')
    sel.innerHTML = '<option value="">전체 채널</option>'
    channels.forEach(ch => {
      sel.innerHTML += `<option value="${ch.id}">${ch.name}</option>`
    })
    
    // 콘텐츠 필터
    const ctFilter = document.getElementById('contentChannelFilter')
    if (ctFilter) {
      ctFilter.innerHTML = '<option value="">전체 채널</option>'
      channels.forEach(ch => ctFilter.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
    }
    
    // 구독자 필터
    const subFilter = document.getElementById('subscriberChannelFilter')
    if (subFilter) {
      subFilter.innerHTML = '<option value="">전체 채널</option>'
      channels.forEach(ch => subFilter.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
    }
    
    // 콘텐츠 모달 채널 선택
    const ctModal = document.getElementById('contentChannelId')
    if (ctModal) {
      ctModal.innerHTML = '<option value="">채널 선택...</option>'
      channels.forEach(ch => ctModal.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
    }
    
    // 알림 발송 채널 선택
    const notifCh = document.getElementById('notifChannel')
    if (notifCh) {
      notifCh.innerHTML = '<option value="">채널 선택...</option>'
      channels.forEach(ch => notifCh.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
    }
  } catch (e) {
    console.error('채널 로드 오류:', e)
  }
}

function onChannelChange() {
  refreshCurrentPage()
}

// =============================================
// 대시보드
// =============================================
async function loadDashboard() {
  try {
    const channelId = document.getElementById('globalChannelSelect').value
    const [chRes, subRes, ctRes, statsRes, batchRes] = await Promise.all([
      API.get('/channels'),
      API.get('/subscribers' + (channelId ? `?channel_id=${channelId}` : '')),
      API.get('/contents' + (channelId ? `?channel_id=${channelId}` : '')),
      API.get('/notifications/stats' + (channelId ? `?channel_id=${channelId}` : '')),
      API.get('/notifications/batches' + (channelId ? `?channel_id=${channelId}` : ''))
    ])
    
    const stats = statsRes.data.data.summary || {}
    const daily = statsRes.data.data.daily || []
    const batches = batchRes.data.data || []
    
    document.getElementById('stat-channels').textContent = chRes.data.data.length
    document.getElementById('stat-subscribers').textContent = (subRes.data.data || []).length
    document.getElementById('stat-contents').textContent = (ctRes.data.data || []).length
    document.getElementById('stat-sent').textContent = (stats.total_sent || 0).toLocaleString()
    document.getElementById('acceptRate').textContent = `${stats.accept_rate || 0}% 수락률`
    
    // 수락/거절 통계
    const accepted = stats.total_accepted || 0
    const rejected = stats.total_rejected || 0
    const noResponse = (stats.total_sent || 0) - accepted - rejected
    document.getElementById('acceptCount').textContent = accepted.toLocaleString()
    document.getElementById('rejectCount').textContent = rejected.toLocaleString()
    document.getElementById('noResponseCount').textContent = Math.max(0, noResponse).toLocaleString()
    
    // 일별 차트
    renderDailyChart(daily)
    // 수락률 도넛 차트
    renderAcceptChart(accepted, rejected, Math.max(0, noResponse))
    // 최근 배치 테이블
    renderRecentBatches(batches.slice(0, 8))
  } catch (e) {
    console.error('대시보드 로드 오류:', e)
    showToast('데이터 로드 오류: ' + e.message, 'error')
  }
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('dailyChart').getContext('2d')
  if (dailyChartInstance) dailyChartInstance.destroy()
  
  const labels = daily.map(d => d.date).reverse()
  const sentData = daily.map(d => d.sent_count || 0).reverse()
  const acceptedData = daily.map(d => d.accepted_count || 0).reverse()
  
  dailyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '발송', data: sentData, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6 },
        { label: '수락', data: acceptedData, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 }
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

function renderAcceptChart(accepted, rejected, noResponse) {
  const ctx = document.getElementById('acceptChart').getContext('2d')
  if (acceptChartInstance) acceptChartInstance.destroy()
  
  const total = accepted + rejected + noResponse
  if (total === 0) return
  
  acceptChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['수락', '거절', '미응답'],
      datasets: [{
        data: [accepted, rejected, noResponse],
        backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)', 'rgba(100,116,139,0.5)'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      cutout: '75%'
    }
  })
}

function renderRecentBatches(batches) {
  const tbody = document.getElementById('recentBatchesTable')
  if (!batches.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-500 py-8">발송 이력이 없습니다</td></tr>'
    return
  }
  tbody.innerHTML = batches.map(b => `
    <tr class="table-row border-b border-slate-700/50">
      <td class="px-5 py-3 text-slate-300 text-xs">${b.channel_name}</td>
      <td class="px-5 py-3">${getContentTypeBadge(b.content_type)}</td>
      <td class="px-5 py-3 text-white text-xs max-w-40 truncate">${b.title}</td>
      <td class="px-5 py-3 text-center text-slate-300">${b.total_targets}</td>
      <td class="px-5 py-3 text-center text-blue-400">${b.sent_count}</td>
      <td class="px-5 py-3 text-center">
        <span class="text-emerald-400 font-semibold">${calcAcceptRate(b.accepted_count, b.sent_count)}</span>
      </td>
      <td class="px-5 py-3 text-center">${getStatusBadge(b.status)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(b.created_at)}</td>
    </tr>
  `).join('')
}

// =============================================
// 채널 관리
// =============================================
async function loadChannels() {
  try {
    const { data } = await API.get('/channels')
    const list = data.data || []
    const container = document.getElementById('channelsList')
    
    if (!list.length) {
      container.innerHTML = '<div class="col-span-3 text-center text-slate-500 py-12"><i class="fas fa-layer-group text-4xl mb-3 block text-slate-700"></i>채널이 없습니다. 채널을 추가해보세요.</div>'
      return
    }
    
    container.innerHTML = list.map(ch => `
      <div class="card overflow-hidden hover:border-indigo-500/50 transition-colors">
        <div class="h-24 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 relative overflow-hidden">
          ${ch.image_url ? `<img src="${ch.image_url}" class="w-full h-full object-cover opacity-30">` : ''}
          <div class="absolute inset-0 flex items-center justify-center">
            <i class="fas fa-layer-group text-4xl text-indigo-400/50"></i>
          </div>
          <div class="absolute top-2 right-2 flex gap-1">
            <span class="${ch.is_active ? 'bg-emerald-500/30 text-emerald-400' : 'bg-red-500/30 text-red-400'} badge text-xs">
              ${ch.is_active ? '활성' : '비활성'}
            </span>
          </div>
        </div>
        <div class="p-4">
          <h4 class="text-white font-semibold mb-1">${ch.name}</h4>
          <p class="text-slate-400 text-xs mb-3 line-clamp-2">${ch.description || '설명 없음'}</p>
          <div class="grid grid-cols-3 gap-2 mb-3 text-center">
            <div class="bg-slate-900 rounded-lg p-2">
              <div class="text-indigo-400 font-bold text-sm">${ch.subscriber_count || 0}</div>
              <div class="text-slate-500 text-xs">구독자</div>
            </div>
            <div class="bg-slate-900 rounded-lg p-2">
              <div class="text-blue-400 font-bold text-sm">${ch.content_count || 0}</div>
              <div class="text-slate-500 text-xs">콘텐츠</div>
            </div>
            <div class="bg-slate-900 rounded-lg p-2">
              <div class="text-amber-400 font-bold text-sm">${ch.batch_count || 0}</div>
              <div class="text-slate-500 text-xs">발송</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="openChannelModal(${ch.id})" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 rounded-lg text-xs">
              <i class="fas fa-edit mr-1"></i>수정
            </button>
            <button onclick="deleteChannel(${ch.id})" class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg text-xs">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('')
  } catch (e) {
    showToast('채널 로드 오류: ' + e.message, 'error')
  }
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
    } catch (e) { showToast('채널 정보 로드 오류', 'error'); return }
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
  if (!confirm('채널을 삭제하면 관련 콘텐츠와 구독자 데이터도 모두 삭제됩니다. 계속할까요?')) return
  try {
    await API.delete(`/channels/${id}`)
    showToast('채널이 삭제되었습니다')
    await loadGlobalChannels()
    loadChannels()
  } catch (e) { showToast('삭제 오류: ' + e.message, 'error') }
}

// =============================================
// 콘텐츠 관리
// =============================================
async function loadContents() {
  try {
    const channelId = document.getElementById('contentChannelFilter')?.value || ''
    const typeFilter = document.getElementById('contentTypeFilter')?.value || ''
    let url = '/contents'
    if (channelId) url += `?channel_id=${channelId}`
    
    const { data } = await API.get(url)
    let list = data.data || []
    if (typeFilter) list = list.filter(c => c.content_type === typeFilter)
    
    const container = document.getElementById('contentsList')
    if (!list.length) {
      container.innerHTML = '<div class="col-span-3 text-center text-slate-500 py-12"><i class="fas fa-photo-film text-4xl mb-3 block text-slate-700"></i>콘텐츠가 없습니다. 첫 콘텐츠를 등록해보세요.</div>'
      return
    }
    
    container.innerHTML = list.map(ct => `
      <div class="card overflow-hidden hover:border-indigo-500/50 transition-colors">
        <div class="relative h-32 bg-slate-900 overflow-hidden">
          ${ct.thumbnail_url ? `<img src="${ct.thumbnail_url}" class="w-full h-full object-cover opacity-80">` : `<div class="w-full h-full flex items-center justify-center text-4xl">${getContentTypeIcon(ct.content_type)}</div>`}
          <div class="absolute bottom-2 left-2">${getContentTypeBadge(ct.content_type)}</div>
          ${ct.duration_seconds ? `<div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">${formatDuration(ct.duration_seconds)}</div>` : ''}
        </div>
        <div class="p-4">
          <div class="text-xs text-indigo-400 mb-1">${ct.channel_name}</div>
          <h4 class="text-white font-semibold text-sm mb-1 line-clamp-2">${ct.title}</h4>
          <p class="text-slate-400 text-xs mb-3 line-clamp-2">${ct.description || '설명 없음'}</p>
          <div class="flex items-center justify-between">
            <span class="text-slate-500 text-xs">${formatDate(ct.created_at)}</span>
            <div class="flex gap-2">
              <button onclick="sendNotifForContent(${ct.id}, ${ct.channel_id}, '${ct.title.replace(/'/g,'\\\'')}')" 
                class="bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 px-2 py-1 rounded text-xs">
                <i class="fas fa-bell mr-1"></i>발송
              </button>
              <button onclick="deleteContent(${ct.id})" class="bg-red-900/30 hover:bg-red-900/50 text-red-400 px-2 py-1.5 rounded text-xs">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('')
  } catch (e) { showToast('콘텐츠 로드 오류: ' + e.message, 'error') }
}

function openContentModal() {
  document.getElementById('contentChannelId').value = ''
  document.getElementById('contentType').value = 'audio'
  document.getElementById('contentTitle').value = ''
  document.getElementById('contentDescription').value = ''
  document.getElementById('contentUrl').value = ''
  document.getElementById('contentThumbnail').value = ''
  document.getElementById('contentDuration').value = ''
  document.getElementById('sendAfterCreate').checked = false
  document.getElementById('notifSettingsDiv').classList.add('hidden')
  document.getElementById('autoNotifTitle').value = ''
  document.getElementById('autoNotifBody').value = ''
  
  // 채널 옵션 갱신
  const ctModal = document.getElementById('contentChannelId')
  ctModal.innerHTML = '<option value="">채널 선택...</option>'
  channels.forEach(ch => ctModal.innerHTML += `<option value="${ch.id}">${ch.name}</option>`)
  
  openModal('contentModal')
}

function onContentTypeChange() {
  const type = document.getElementById('contentType').value
  const label = document.getElementById('contentUrlLabel')
  const urlInput = document.getElementById('contentUrl')
  if (type === 'youtube') {
    label.textContent = 'YouTube URL *'
    urlInput.placeholder = 'https://youtube.com/watch?v=...'
  } else if (type === 'video') {
    label.textContent = '동영상 URL *'
    urlInput.placeholder = 'https://example.com/video.mp4'
  } else {
    label.textContent = '오디오 URL *'
    urlInput.placeholder = 'https://example.com/audio.mp3'
  }
}

document.getElementById('sendAfterCreate').addEventListener('change', function() {
  const div = document.getElementById('notifSettingsDiv')
  if (this.checked) {
    div.classList.remove('hidden')
    // 제목 자동 채우기
    const title = document.getElementById('contentTitle').value
    if (title && !document.getElementById('autoNotifTitle').value) {
      document.getElementById('autoNotifTitle').value = `새 콘텐츠가 등록되었습니다 ${getContentTypeIcon(document.getElementById('contentType').value)}`
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
  
  if (!payload.channel_id || !payload.title || !payload.content_url) {
    showToast('채널, 제목, URL은 필수입니다', 'error'); return
  }
  
  try {
    const { data } = await API.post('/contents', payload)
    const contentId = data.data.id
    
    // 즉시 발송 옵션
    const sendAfter = document.getElementById('sendAfterCreate').checked
    if (sendAfter) {
      const notifTitle = document.getElementById('autoNotifTitle').value.trim()
      const notifBody = document.getElementById('autoNotifBody').value.trim()
      if (notifTitle && notifBody) {
        await API.post('/notifications/send', {
          channel_id: payload.channel_id,
          content_id: contentId,
          title: notifTitle,
          body: notifBody,
          created_by: 'admin'
        })
        showToast('콘텐츠 등록 및 푸시 알림 발송 완료!')
      } else {
        showToast('콘텐츠가 등록되었습니다 (알림 제목/내용 없어 발송 생략)')
      }
    } else {
      showToast('콘텐츠가 등록되었습니다')
    }
    
    closeModal('contentModal')
    loadContents()
  } catch (e) { showToast('저장 오류: ' + e.message, 'error') }
}

async function deleteContent(id) {
  if (!confirm('콘텐츠를 삭제하시겠습니까?')) return
  try {
    await API.delete(`/contents/${id}`)
    showToast('콘텐츠가 삭제되었습니다')
    loadContents()
  } catch (e) { showToast('삭제 오류: ' + e.message, 'error') }
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
    let url = '/subscribers'
    if (channelId) url += `?channel_id=${channelId}`
    
    const { data } = await API.get(url)
    let list = data.data || []
    if (platform) list = list.filter(s => s.platform === platform)
    
    document.getElementById('subscriberCount').textContent = `${list.length}명 구독 중`
    const tbody = document.getElementById('subscribersTable')
    
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-8">구독자가 없습니다</td></tr>'
      return
    }
    
    tbody.innerHTML = list.map(s => `
      <tr class="table-row border-b border-slate-700/50">
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-indigo-600/30 rounded-full flex items-center justify-center text-xs text-indigo-400 font-bold">
              ${(s.display_name || s.user_id).charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="text-white text-sm font-medium">${s.display_name || s.user_id}</div>
              <div class="text-slate-500 text-xs">${s.user_id}</div>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-slate-300 text-xs">${s.channel_name}</td>
        <td class="px-5 py-3 text-center">${getPlatformIcon(s.platform)}</td>
        <td class="px-5 py-3 text-center">
          <span class="text-emerald-400 font-semibold">${s.accepted_count}</span>
        </td>
        <td class="px-5 py-3 text-center">
          <span class="text-red-400 font-semibold">${s.rejected_count}</span>
        </td>
        <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(s.subscribed_at)}</td>
        <td class="px-5 py-3 text-center">
          <span class="${s.is_active ? 'badge-completed' : 'badge-failed'} badge">
            ${s.is_active ? '활성' : '비활성'}
          </span>
        </td>
      </tr>
    `).join('')
  } catch (e) { showToast('구독자 로드 오류: ' + e.message, 'error') }
}

// =============================================
// 알림 발송
// =============================================
async function loadNotifPage() {
  // 채널 옵션 갱신
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
    list.forEach(ct => {
      sel.innerHTML += `<option value="${ct.id}" data-type="${ct.content_type}" data-url="${ct.content_url}" data-thumb="${ct.thumbnail_url || ''}" data-duration="${ct.duration_seconds || ''}">${getContentTypeIcon(ct.content_type)} ${ct.title}</option>`
    })
    
    // 구독자 수 미리보기
    const subRes = await API.get(`/subscribers?channel_id=${channelId}`)
    const activeSubs = (subRes.data.data || []).filter(s => s.is_active)
    document.getElementById('targetCount').textContent = activeSubs.length
    document.getElementById('subscriberPreview').classList.remove('hidden')
  } catch (e) { console.error(e) }
}

function onContentSelect() {
  const sel = document.getElementById('notifContent')
  const opt = sel.options[sel.selectedIndex]
  if (!opt.value) { document.getElementById('contentPreview').classList.add('hidden'); return }
  
  document.getElementById('previewThumbnail').src = opt.getAttribute('data-thumb') || ''
  document.getElementById('previewTitle').textContent = opt.text.substring(2)
  document.getElementById('previewType').textContent = opt.getAttribute('data-type').toUpperCase()
  const dur = opt.getAttribute('data-duration')
  document.getElementById('previewDuration').textContent = dur ? `재생시간: ${formatDuration(parseInt(dur))}` : ''
  document.getElementById('contentPreview').classList.remove('hidden')
}

async function sendNotification() {
  const channelId = document.getElementById('notifChannel').value
  const contentId = document.getElementById('notifContent').value
  const title = document.getElementById('notifTitle').value.trim()
  const body = document.getElementById('notifBody').value.trim()
  
  if (!channelId || !contentId || !title || !body) {
    showToast('채널, 콘텐츠, 제목, 내용은 모두 필수입니다', 'error'); return
  }
  
  const btn = document.getElementById('sendBtn')
  const btnText = document.getElementById('sendBtnText')
  btn.disabled = true
  btnText.innerHTML = '<i class="fas fa-spinner spinner mr-2"></i>발송 중...'
  
  try {
    const { data } = await API.post('/notifications/send', {
      channel_id: parseInt(channelId),
      content_id: parseInt(contentId),
      title, body,
      created_by: 'admin'
    })
    
    const result = data.data
    const modeTag = result.mode === 'simulation' ? ' (시뮬레이션)' : ''
    showToast(`✅ 발송 완료${modeTag}: ${result.sent_count}/${result.total_targets}명`)
    
    // 폼 초기화
    document.getElementById('notifTitle').value = ''
    document.getElementById('notifBody').value = ''
    document.getElementById('notifContent').value = ''
    document.getElementById('contentPreview').classList.add('hidden')
    
    loadBatches()
  } catch (e) {
    showToast('발송 오류: ' + (e.response?.data?.error || e.message), 'error')
  } finally {
    btn.disabled = false
    btnText.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>푸시 알림 발송'
  }
}

async function loadBatches() {
  try {
    const channelId = document.getElementById('globalChannelSelect')?.value || ''
    let url = '/notifications/batches'
    if (channelId) url += `?channel_id=${channelId}`
    
    const { data } = await API.get(url)
    const batches = data.data || []
    const tbody = document.getElementById('batchesTable')
    
    // 로그 페이지의 배치 선택 박스도 갱신
    const logBatch = document.getElementById('logBatchFilter')
    if (logBatch) {
      logBatch.innerHTML = '<option value="">배치 선택 (최근 발송 이력)</option>'
      batches.forEach(b => {
        logBatch.innerHTML += `<option value="${b.id}">[${b.channel_name}] ${b.title} (${formatDate(b.created_at)})</option>`
      })
    }
    
    if (!batches.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">발송 이력이 없습니다</td></tr>'
      return
    }
    
    tbody.innerHTML = batches.map(b => `
      <tr class="table-row border-b border-slate-700/50 cursor-pointer" onclick="viewBatchLogs(${b.id})">
        <td class="px-4 py-3">
          <div class="text-white text-xs font-medium line-clamp-1">${b.title}</div>
          <div class="text-slate-500 text-xs">${b.content_title || ''}</div>
        </td>
        <td class="px-4 py-3 text-center text-slate-300 text-sm">${b.total_targets}</td>
        <td class="px-4 py-3 text-center text-blue-400 text-sm">${b.sent_count}</td>
        <td class="px-4 py-3 text-center">
          <span class="text-emerald-400 font-semibold text-sm">${calcAcceptRate(b.accepted_count, b.sent_count)}</span>
        </td>
        <td class="px-4 py-3 text-center">${getStatusBadge(b.status)}</td>
        <td class="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(b.created_at)}</td>
      </tr>
    `).join('')
  } catch (e) { console.error('배치 로드 오류:', e) }
}

// =============================================
// 발송 로그
// =============================================
async function loadLogBatches() {
  try {
    const { data } = await API.get('/notifications/batches')
    const batches = data.data || []
    const logBatch = document.getElementById('logBatchFilter')
    logBatch.innerHTML = '<option value="">배치 선택 (최근 발송 이력)</option>'
    batches.forEach(b => {
      logBatch.innerHTML += `<option value="${b.id}">[${b.channel_name}] ${b.title} (${formatDate(b.created_at)})</option>`
    })
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
    
    // 통계 표시
    document.getElementById('batchStats').classList.remove('hidden')
    document.getElementById('logStatTotal').textContent = batch.total_targets
    document.getElementById('logStatSent').textContent = batch.sent_count
    document.getElementById('logStatAccepted').textContent = batch.accepted_count
    document.getElementById('logStatRejected').textContent = batch.rejected_count
    
    filterLogs()
  } catch (e) { showToast('로그 로드 오류: ' + e.message, 'error') }
}

function filterLogs() {
  const statusFilter = document.getElementById('logStatusFilter').value
  let logs = allLogs
  if (statusFilter) logs = logs.filter(l => l.status === statusFilter)
  
  const tbody = document.getElementById('logsTable')
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">로그가 없습니다</td></tr>'
    return
  }
  
  tbody.innerHTML = logs.map(l => `
    <tr class="table-row border-b border-slate-700/50">
      <td class="px-5 py-3">
        <div class="text-white text-sm">${l.display_name || l.subscriber_id}</div>
      </td>
      <td class="px-5 py-3 text-center">${getPlatformIcon(l.platform)}</td>
      <td class="px-5 py-3">
        <code class="text-slate-400 text-xs">${l.fcm_token ? l.fcm_token.substring(0, 20) + '...' : '-'}</code>
      </td>
      <td class="px-5 py-3 text-center">${getStatusBadge(l.status)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(l.sent_at)}</td>
      <td class="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">${formatDate(l.action_at)}</td>
    </tr>
  `).join('')
}

function viewBatchLogs(batchId) {
  showPage('logs')
  setTimeout(() => {
    document.getElementById('logBatchFilter').value = batchId
    loadLogs()
  }, 100)
}

// =============================================
// 초기화
// =============================================
async function init() {
  try {
    await loadGlobalChannels()
    loadDashboard()
    
    // FCM 상태 확인
    try {
      const { data } = await API.get('/health')
      console.log('API 연결:', data)
    } catch (e) { console.warn('Health check failed:', e) }
  } catch (e) {
    console.error('초기화 오류:', e)
    showToast('초기화 오류가 발생했습니다', 'error')
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init)
