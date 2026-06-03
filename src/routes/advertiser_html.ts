// src/routes/advertiser_html.ts
// 광고주 전용 포털 PC 페이지 (다크 테마, Tailwind CDN)
// 단일 HTML — 로그인 게이트 + 대시보드(SPA 스타일)

export function advertiserPortalHTML(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1024">
<title>RinGo 광고주 포털</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="icon" href="/static/ringo-icon.png">
<style>
  body { background:#0f172a; color:#e2e8f0; font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif; }
  .input-field { background:#1e293b; border:1px solid #334155; border-radius:.75rem; padding:.65rem .9rem; color:#e2e8f0; width:100%; outline:none; transition:.15s; }
  .input-field:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,.2); }
  .btn-primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); transition:.15s; }
  .btn-primary:hover { filter:brightness(1.1); }
  .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:1rem; }
  .stat-card { background:linear-gradient(135deg,#1e293b,#172033); border:1px solid #334155; border-radius:1rem; }
  .badge { font-size:.7rem; padding:.15rem .55rem; border-radius:9999px; font-weight:600; }
  .badge-draft  { background:#374151; color:#cbd5e1; }
  .badge-active { background:#065f46; color:#6ee7b7; }
  .badge-paused { background:#7c2d12; color:#fdba74; }
  .hidden-imp { display:none !important; }
  table th, table td { padding:.6rem .75rem; text-align:left; font-size:.85rem; }
  table th { color:#94a3b8; font-weight:600; border-bottom:1px solid #334155; }
  table tr { border-bottom:1px solid #1f2937; }
  .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); padding:.75rem 1.25rem; border-radius:.75rem; font-size:.9rem; z-index:50; opacity:0; transition:.25s; }
  .toast.show { opacity:1; }
  .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:40; }
</style>
</head>
<body class="min-h-screen">

<!-- ══ 로그인 게이트 ══ -->
<div id="login-view" class="min-h-screen flex items-center justify-center px-4">
  <div class="card w-full max-w-md p-8">
    <div class="text-center mb-7">
      <img src="/static/ringo-logo-color.png" alt="RinGo" class="h-10 mx-auto mb-3" onerror="this.style.display='none'">
      <h1 class="text-2xl font-bold text-white">광고주 포털</h1>
      <p class="text-slate-400 text-sm mt-1">이메일과 지갑주소로 로그인하세요</p>
    </div>
    <form id="login-form" class="space-y-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">이메일</label>
        <input id="login-email" type="email" class="input-field" placeholder="advertiser@example.com" autocomplete="username" required>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">지갑주소</label>
        <input id="login-wallet" type="text" class="input-field" placeholder="0x... 또는 등록된 지갑주소" autocomplete="off" required>
      </div>
      <p id="login-error" class="text-red-400 text-sm hidden-imp"></p>
      <button type="submit" id="login-btn" class="btn-primary w-full text-white font-semibold py-2.5 rounded-xl">로그인</button>
    </form>
    <p class="text-center text-slate-500 text-xs mt-6">계정 문의는 RinGo 운영팀에 연락하세요.</p>
  </div>
</div>

<!-- ══ 대시보드 ══ -->
<div id="app-view" class="hidden-imp">
  <!-- 헤더 -->
  <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
    <div class="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img src="/static/ringo-logo-color.png" class="h-7" onerror="this.style.display='none'">
        <span class="font-bold text-white">광고주 포털</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-right">
          <div id="hdr-name" class="text-sm font-semibold text-white">-</div>
          <div class="text-xs text-slate-400">잔액 <span id="hdr-balance" class="text-indigo-300 font-semibold">0</span> QKEY</div>
        </div>
        <button onclick="doLogout()" class="text-sm text-slate-400 hover:text-white border border-slate-600 px-3 py-1.5 rounded-lg">로그아웃</button>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-8">
    <!-- 요약 통계 -->
    <section class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      <div class="stat-card p-4"><div class="text-slate-400 text-xs mb-1">캠페인</div><div id="sum-campaigns" class="text-2xl font-bold text-white">0</div></div>
      <div class="stat-card p-4"><div class="text-slate-400 text-xs mb-1">발송 수</div><div id="sum-sent" class="text-2xl font-bold text-sky-300">0</div></div>
      <div class="stat-card p-4"><div class="text-slate-400 text-xs mb-1">영상 시청</div><div id="sum-view" class="text-2xl font-bold text-violet-300">0</div></div>
      <div class="stat-card p-4"><div class="text-slate-400 text-xs mb-1">링크 클릭</div><div id="sum-click" class="text-2xl font-bold text-amber-300">0</div></div>
      <div class="stat-card p-4"><div class="text-slate-400 text-xs mb-1">지급 QKEY</div><div id="sum-paid" class="text-2xl font-bold text-emerald-300">0</div></div>
    </section>

    <!-- 탭 -->
    <div class="flex gap-1 border-b border-slate-700 mb-6">
      <button id="tab-campaigns" onclick="showTab('campaigns')" class="px-4 py-2.5 text-sm font-semibold text-white border-b-2 border-indigo-500 -mb-px">내 캠페인</button>
      <button id="tab-ledger" onclick="showTab('ledger')" class="px-4 py-2.5 text-sm font-semibold text-slate-400 border-b-2 border-transparent -mb-px hover:text-white">정산 내역</button>
    </div>

    <!-- 캠페인 탭 -->
    <section id="panel-campaigns">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-white">내 캠페인</h2>
        <button onclick="openCampaignModal()" class="btn-primary text-white text-sm font-semibold px-4 py-2 rounded-xl">+ 새 캠페인</button>
      </div>
      <div id="campaign-list" class="space-y-3">
        <div class="text-slate-500 text-sm py-8 text-center">불러오는 중...</div>
      </div>
    </section>

    <!-- 정산 탭 -->
    <section id="panel-ledger" class="hidden-imp">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-white">정산 내역</h2>
        <div class="text-sm text-slate-400">현재 잔액 <span id="ledger-balance" class="text-indigo-300 font-bold">0</span> QKEY</div>
      </div>
      <div class="card overflow-hidden">
        <table class="w-full">
          <thead><tr><th>일시</th><th>구분</th><th>금액</th><th>잔액</th><th>메모</th></tr></thead>
          <tbody id="ledger-body"><tr><td colspan="5" class="text-center text-slate-500 py-8">불러오는 중...</td></tr></tbody>
        </table>
      </div>
      <p class="text-slate-500 text-xs mt-3">※ QKEY 충전은 RinGo 운영팀을 통해 진행됩니다.</p>
    </section>
  </main>
</div>

<!-- 캠페인 생성/수정 모달 -->
<div id="campaign-modal" class="modal-bg hidden-imp">
  <div class="card w-full max-w-lg p-6 mx-4 max-h-[90vh] overflow-y-auto">
    <h3 id="modal-title" class="text-lg font-bold text-white mb-5">새 캠페인</h3>
    <form id="campaign-form" class="space-y-4">
      <input type="hidden" id="cf-id">
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">캠페인명 *</label>
        <input id="cf-title" class="input-field" placeholder="예: 신제품 출시 이벤트" required>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">영상 유형</label>
        <select id="cf-videotype" class="input-field">
          <option value="youtube">유튜브</option>
          <option value="video">동영상(mp4 등)</option>
          <option value="audio">오디오</option>
          <option value="file">파일</option>
        </select>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">광고 영상 URL *</label>
        <input id="cf-videourl" class="input-field" placeholder="https://..." required>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">광고주 링크 URL *</label>
        <input id="cf-linkurl" class="input-field" placeholder="https://..." required>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1.5">지급 QKEY (1회 수락 시) *</label>
        <input id="cf-reward" type="number" min="1" class="input-field" placeholder="예: 10" required>
      </div>
      <p id="modal-error" class="text-red-400 text-sm hidden-imp"></p>
      <p class="text-slate-500 text-xs">신규/수정된 캠페인은 <b>초안(draft)</b> 상태로 저장되며, 실제 발송은 RinGo 운영팀 승인 후 진행됩니다.</p>
      <div class="flex gap-3 pt-2">
        <button type="button" onclick="closeCampaignModal()" class="flex-1 border border-slate-600 text-slate-300 py-2.5 rounded-xl hover:bg-slate-800">취소</button>
        <button type="submit" id="cf-submit" class="btn-primary flex-1 text-white font-semibold py-2.5 rounded-xl">저장</button>
      </div>
    </form>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
const $ = (id) => document.getElementById(id);
function toast(msg, ok=true){ const t=$('toast'); t.textContent=msg; t.style.background=ok?'#065f46':'#7f1d1d'; t.style.color=ok?'#d1fae5':'#fee2e2'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmt(n){ return Number(n||0).toLocaleString('ko-KR'); }

async function api(path, opts={}){
  const res = await fetch('/advertiser/api'+path, { headers:{'Content-Type':'application/json'}, credentials:'same-origin', ...opts });
  let j={}; try{ j=await res.json(); }catch(e){}
  return { ok: res.ok, status: res.status, ...j };
}

// ── 로그인 ──
$('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email=$('login-email').value.trim(), wallet=$('login-wallet').value.trim();
  const err=$('login-error'); err.classList.add('hidden-imp');
  $('login-btn').disabled=true; $('login-btn').textContent='로그인 중...';
  const r = await api('/login', { method:'POST', body: JSON.stringify({ email, walletAddress: wallet }) });
  $('login-btn').disabled=false; $('login-btn').textContent='로그인';
  if(r.success){ enterApp(); }
  else { err.textContent = r.error || '로그인 실패'; err.classList.remove('hidden-imp'); }
});

async function doLogout(){
  await api('/logout', { method:'POST' });
  location.reload();
}

function showTab(t){
  $('tab-campaigns').className = 'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ' + (t==='campaigns'?'text-white border-indigo-500':'text-slate-400 border-transparent hover:text-white');
  $('tab-ledger').className    = 'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ' + (t==='ledger'?'text-white border-indigo-500':'text-slate-400 border-transparent hover:text-white');
  $('panel-campaigns').classList.toggle('hidden-imp', t!=='campaigns');
  $('panel-ledger').classList.toggle('hidden-imp', t!=='ledger');
  if(t==='ledger') loadLedger();
}

// ── 앱 진입 ──
async function enterApp(){
  const me = await api('/me');
  if(!me.success){ $('login-view').classList.remove('hidden-imp'); $('app-view').classList.add('hidden-imp'); return; }
  $('login-view').classList.add('hidden-imp');
  $('app-view').classList.remove('hidden-imp');
  $('hdr-name').textContent = me.data.name || me.data.email;
  $('hdr-balance').textContent = fmt(me.data.balanceQkey);
  await Promise.all([ loadSummary(), loadCampaigns() ]);
}

async function loadSummary(){
  const r = await api('/summary');
  if(!r.success) return;
  $('sum-campaigns').textContent = fmt(r.data.campaigns);
  $('sum-sent').textContent  = fmt(r.data.sentCount);
  $('sum-view').textContent  = fmt(r.data.viewCount);
  $('sum-click').textContent = fmt(r.data.clickCount);
  $('sum-paid').textContent  = fmt(r.data.paidQkey);
}

function badge(status){
  const s = status||'draft';
  const cls = s==='active'?'badge-active':(s==='paused'?'badge-paused':'badge-draft');
  const label = s==='active'?'발송중':(s==='paused'?'일시정지':'초안');
  return '<span class="badge '+cls+'">'+label+'</span>';
}

async function loadCampaigns(){
  const r = await api('/campaigns');
  const box = $('campaign-list');
  if(!r.success){ box.innerHTML='<div class="text-red-400 text-sm py-8 text-center">'+esc(r.error||'불러오기 실패')+'</div>'; return; }
  if(!r.data.length){ box.innerHTML='<div class="text-slate-500 text-sm py-12 text-center">아직 캠페인이 없습니다. "새 캠페인"으로 등록하세요.</div>'; return; }
  box.innerHTML = r.data.map(c=>{
    const s = c._stat||{};
    return '<div class="card p-5">'
      + '<div class="flex justify-between items-start mb-3">'
      +   '<div><div class="flex items-center gap-2"><h3 class="font-semibold text-white">'+esc(c.title)+'</h3>'+badge(c.status)+'</div>'
      +   '<div class="text-xs text-slate-500 mt-1">지급 '+fmt(c.rewardQkey)+' QKEY / 영상 '+esc(c.videoType||'youtube')+'</div></div>'
      +   '<button onclick=\\'editCampaign('+JSON.stringify(JSON.stringify(c))+')\\' class="text-xs text-indigo-300 hover:text-indigo-200 border border-slate-600 px-2.5 py-1 rounded-lg">수정</button>'
      + '</div>'
      + '<div class="grid grid-cols-5 gap-2 text-center mt-3">'
      +   statCell('발송', s.sentCount) + statCell('수락', s.claimCount) + statCell('시청', s.viewCount) + statCell('클릭', s.clickCount) + statCell('지급QKEY', s.paidQkey)
      + '</div>'
      + '<div class="flex gap-3 mt-3 text-xs text-slate-500 truncate">'
      +   '<a href="'+esc(c.videoUrl)+'" target="_blank" class="hover:text-indigo-300 truncate">▶ 영상</a>'
      +   '<a href="'+esc(c.linkUrl)+'" target="_blank" class="hover:text-indigo-300 truncate">🔗 링크</a>'
      + '</div>'
      + '</div>';
  }).join('');
}
function statCell(label, v){ return '<div class="bg-slate-800/60 rounded-lg py-2"><div class="text-xs text-slate-500">'+label+'</div><div class="text-sm font-bold text-white">'+fmt(v)+'</div></div>'; }

async function loadLedger(){
  const r = await api('/ledger');
  const body = $('ledger-body');
  $('ledger-balance').textContent = fmt(r.balanceQkey);
  if(!r.success){ body.innerHTML='<tr><td colspan="5" class="text-center text-red-400 py-8">'+esc(r.error||'불러오기 실패')+'</td></tr>'; return; }
  if(!r.data || !r.data.length){ body.innerHTML='<tr><td colspan="5" class="text-center text-slate-500 py-8">정산 내역이 없습니다.</td></tr>'; return; }
  body.innerHTML = r.data.map(x=>{
    const amt = Number(x.amount||0);
    const sign = amt>=0?'+':'';
    const color = amt>=0?'text-emerald-300':'text-red-300';
    return '<tr><td class="text-slate-400">'+esc((x.createdAt||'').replace('T',' ').slice(0,16))+'</td>'
      + '<td>'+esc(x.type||'-')+'</td>'
      + '<td class="'+color+' font-semibold">'+sign+fmt(amt)+'</td>'
      + '<td class="text-slate-300">'+fmt(x.balanceAfter)+'</td>'
      + '<td class="text-slate-400">'+esc(x.memo||x.description||'')+'</td></tr>';
  }).join('');
}

// ── 캠페인 모달 ──
function openCampaignModal(){
  $('modal-title').textContent='새 캠페인';
  $('cf-id').value=''; $('cf-title').value=''; $('cf-videotype').value='youtube';
  $('cf-videourl').value=''; $('cf-linkurl').value=''; $('cf-reward').value='';
  $('modal-error').classList.add('hidden-imp');
  $('campaign-modal').classList.remove('hidden-imp');
}
function closeCampaignModal(){ $('campaign-modal').classList.add('hidden-imp'); }
function editCampaign(jsonStr){
  const c = JSON.parse(jsonStr);
  $('modal-title').textContent='캠페인 수정';
  $('cf-id').value=c.campaignId||c._id; $('cf-title').value=c.title||'';
  $('cf-videotype').value=c.videoType||'youtube';
  $('cf-videourl').value=c.videoUrl||''; $('cf-linkurl').value=c.linkUrl||'';
  $('cf-reward').value=c.rewardQkey||'';
  $('modal-error').classList.add('hidden-imp');
  $('campaign-modal').classList.remove('hidden-imp');
}
$('campaign-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id=$('cf-id').value;
  const payload = {
    title:$('cf-title').value.trim(), videoType:$('cf-videotype').value,
    videoUrl:$('cf-videourl').value.trim(), linkUrl:$('cf-linkurl').value.trim(),
    rewardQkey: Number($('cf-reward').value)
  };
  const err=$('modal-error'); err.classList.add('hidden-imp');
  $('cf-submit').disabled=true; $('cf-submit').textContent='저장 중...';
  const r = id
    ? await api('/campaigns/'+id, { method:'PUT', body: JSON.stringify(payload) })
    : await api('/campaigns',     { method:'POST', body: JSON.stringify(payload) });
  $('cf-submit').disabled=false; $('cf-submit').textContent='저장';
  if(r.success){ closeCampaignModal(); toast('저장되었습니다.'); await Promise.all([loadSummary(), loadCampaigns()]); }
  else { err.textContent=r.error||'저장 실패'; err.classList.remove('hidden-imp'); }
});

// 초기: 세션 있으면 자동 진입
enterApp();
</script>
</body>
</html>`;
}
