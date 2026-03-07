// src/appHtml.ts - /app 라우트 HTML (자동 생성, 수정 금지)
export const APP_HTML = String.raw`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>PushNotify</title>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --bg: #121212; --bg2: #1E1E2E; --bg3: #2A2A3E;
  --primary: #6C63FF; --primary-dim: rgba(108,99,255,0.15);
  --teal: #26D0CE; --text: #FFFFFF; --text2: #B0B0C0;
  --text3: #707080; --border: #2E2E42;
  --danger: #EF4444; --success: #4CAF50; --nav-h: 62px;
}
body { background:var(--bg); color:var(--text); font-family:-apple-system,'Noto Sans KR',sans-serif; height:100dvh; overflow:hidden; display:flex; flex-direction:column; }

/* ── 앱바 ── */
.appbar { height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 16px; background:var(--primary); flex-shrink:0; }
.appbar-left { display:flex; align-items:center; gap:10px; }
.appbar-icon { background:rgba(255,255,255,0.2); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; }
.appbar-title { font-size:20px; font-weight:700; color:#fff; }
.appbar-menu { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:6px; }

/* ── 하단 네비 ── */
.bottom-nav { height:var(--nav-h); display:flex; background:var(--bg2); border-top:1px solid var(--border); flex-shrink:0; }
.nav-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; background:none; border:none; color:var(--text3); cursor:pointer; font-size:10px; transition:color 0.15s; padding:4px 0; }
.nav-btn i { font-size:20px; }
.nav-btn.active { color:var(--primary); }

/* ── 화면 ── */
#screen-wrap { flex:1; overflow:hidden; position:relative; }
.screen { display:none; position:absolute; inset:0; overflow-y:auto; flex-direction:column; }
.screen.active { display:flex; }

/* ── 섹션 헤더 ── */
.section-header { display:flex; align-items:center; justify-content:space-between; padding:16px 16px 8px; }
.section-title { font-size:16px; font-weight:700; }
.section-btn { background:var(--bg3); border:1px solid rgba(108,99,255,0.4); color:var(--primary); font-size:12px; font-weight:600; padding:6px 12px; border-radius:20px; cursor:pointer; display:flex; align-items:center; gap:5px; }

/* ── 채널 타일 (운영) ── */
.channel-tile { display:flex; align-items:center; gap:10px; background:var(--bg2); margin:3px 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--border); }
.channel-tile .info { flex:1; min-width:0; }
.channel-tile .ch-name { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.channel-tile .ch-sub { font-size:11px; color:var(--text3); margin-top:2px; }

/* 운영 채널 액션 버튼 3개 */
.ch-actions { display:flex; gap:4px; flex-shrink:0; }
.ch-action-btn { width:34px; height:34px; border-radius:8px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; transition:opacity 0.15s; }
.ch-action-btn:active { opacity:0.7; }
.btn-alarm         { background:rgba(112,112,128,0.18); color:var(--text3); }
.btn-alarm.has-alarm { background:rgba(38,208,206,0.22); color:var(--teal); box-shadow:0 0 0 1.5px rgba(38,208,206,0.45); }
.btn-invite { background:rgba(108,99,255,0.15); color:var(--primary); }
.btn-setting{ background:rgba(112,112,128,0.2); color:var(--text2); }

/* ── 가입 채널 타일 ── */
.joined-tile { display:flex; align-items:center; gap:10px; background:var(--bg2); margin:3px 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--border); cursor:pointer; }
.joined-tile:active { background:var(--bg3); }
.joined-tile .info { flex:1; min-width:0; }
.joined-tile .chevron { color:var(--text3); font-size:13px; }

/* ── 아바타 ── */
.avatar { border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; }
.avatar img { width:100%; height:100%; object-fit:cover; }

/* ── 더보기 버튼 ── */
.more-btn { display:flex; align-items:center; justify-content:center; gap:6px; margin:6px 14px 2px; padding:10px; background:var(--bg2); border:1px dashed var(--border); border-radius:10px; color:var(--text3); font-size:13px; cursor:pointer; }
.more-btn:active { background:var(--bg3); }

/* ── 채널 검색창 ── */
.ch-search-wrap { position:relative; margin:4px 14px 10px; }
.ch-search-icon { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--text3); font-size:14px; pointer-events:none; }
.ch-search-input { width:100%; background:var(--bg2); border:1.5px solid var(--border); color:var(--text); border-radius:12px; padding:11px 38px 11px 38px; font-size:14px; outline:none; font-family:inherit; box-sizing:border-box; transition:border-color 0.2s; }
.ch-search-input:focus { border-color:var(--primary); }
.ch-search-input::placeholder { color:var(--text3); }
.ch-search-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text3); font-size:14px; cursor:pointer; padding:4px 6px; border-radius:6px; }
.ch-search-clear:active { background:var(--bg3); }

/* ── 채널 리스트 아이템 (전체채널) ── */
.ch-all-tile { display:flex; align-items:center; gap:10px; background:var(--bg2); margin:3px 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--border); cursor:pointer; transition:background 0.12s; }
.ch-all-tile:active { background:var(--bg3); }
.ch-all-tile .info { flex:1; min-width:0; }
.ch-all-tile .ch-name { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-all-tile .ch-sub  { font-size:11px; color:var(--text3); margin-top:2px; }

/* ── 빈 상태 ── */
.empty-box { margin:12px 14px; padding:20px; background:var(--bg2); border-radius:12px; text-align:center; color:var(--text3); font-size:13px; line-height:1.6; }

/* ── 로딩 ── */
.loading { padding:24px; text-align:center; color:var(--text3); }
@keyframes spin { to { transform:rotate(360deg); } }
.spin { animation:spin 0.8s linear infinite; display:inline-block; }

/* ── 사이드 드로어 ── */
.drawer-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:200; opacity:0; pointer-events:none; transition:opacity 0.25s; }
.drawer-overlay.open { opacity:1; pointer-events:all; }
.drawer { position:fixed; top:0; right:0; bottom:0; width:72vw; max-width:280px; background:var(--bg2); z-index:201; transform:translateX(100%); transition:transform 0.25s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; }
.drawer.open { transform:translateX(0); }
.drawer-header { padding:20px 16px 12px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
.drawer-logo { width:36px; height:36px; background:var(--primary); border-radius:10px; display:flex; align-items:center; justify-content:center; }
.drawer-app-name { font-size:17px; font-weight:700; }
.drawer-menu-label { font-size:11px; color:var(--text3); font-weight:600; letter-spacing:0.05em; padding:14px 16px 4px; text-transform:uppercase; }
.drawer-menu-item { display:flex; align-items:center; gap:12px; padding:13px 16px; cursor:pointer; color:var(--text2); font-size:14px; font-weight:500; transition:background 0.15s; }
.drawer-menu-item:active { background:var(--bg3); }
.drawer-menu-item i { width:20px; text-align:center; color:var(--text3); font-size:15px; }
.drawer-version { margin-top:auto; padding:12px 16px; font-size:11px; color:var(--text3); border-top:1px solid var(--border); }

/* ── 모달 ── */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:300; display:none; align-items:flex-end; justify-content:center; }
.modal-overlay.active { display:flex; }
.modal-sheet { background:var(--bg2); border-radius:20px 20px 0 0; width:100%; max-height:88vh; overflow-y:auto; padding-bottom:env(safe-area-inset-bottom,16px); }
.modal-handle { width:36px; height:4px; background:var(--border); border-radius:2px; margin:10px auto 4px; }
.modal-title { font-size:17px; font-weight:700; padding:8px 16px 12px; }
.modal-body { padding:0 16px 12px; }
.form-label { font-size:12px; color:var(--text2); font-weight:600; margin-bottom:5px; margin-top:12px; display:block; }
.form-input { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:11px 13px; font-size:14px; outline:none; font-family:inherit; resize:none; }
.form-input:focus { border-color:var(--primary); }
.form-textarea { min-height:80px; }
.char-count { font-size:11px; color:var(--text3); text-align:right; margin-top:3px; }
.img-picker { display:flex; align-items:center; gap:12px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px 14px; cursor:pointer; margin-top:4px; }
.img-thumb { width:52px; height:52px; border-radius:8px; background:var(--bg2); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }
.img-thumb img { width:100%; height:100%; object-fit:cover; }
.img-hint { font-size:12px; color:var(--text3); }
.btn-teal { width:100%; background:var(--teal); color:#fff; font-size:16px; font-weight:700; padding:15px; border:none; border-radius:12px; cursor:pointer; margin-top:14px; }
.btn-ghost { width:100%; background:transparent; border:1px solid var(--border); color:var(--text2); font-size:14px; padding:12px; border-radius:12px; cursor:pointer; margin-top:8px; }
.btn-danger-outline { width:100%; background:transparent; border:1px solid rgba(239,68,68,0.4); color:var(--danger); font-size:14px; padding:12px; border-radius:12px; cursor:pointer; margin-top:8px; }
.img-src-btn { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:1px solid var(--border); cursor:pointer; color:var(--text); font-size:14px; }
.img-src-btn:last-child { border-bottom:none; }
.img-src-btn i { width:28px; text-align:center; color:var(--primary); font-size:18px; }

/* ── 수신함/발신함 ── */
.notif-card { background:var(--bg2); margin:4px 14px; padding:13px; border-radius:12px; border:1px solid var(--border); }
.notif-header { display:flex; align-items:flex-start; gap:10px; margin-bottom:6px; }
.notif-icon-wrap { width:36px; height:36px; background:var(--primary-dim); border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.notif-meta { flex:1; min-width:0; }
.notif-title { font-size:14px; font-weight:600; }
.notif-channel { font-size:11px; color:var(--text3); margin-top:2px; }
.notif-time { font-size:11px; color:var(--text3); white-space:nowrap; }
.notif-body { font-size:13px; color:var(--text2); line-height:1.5; }
.notif-actions { display:flex; gap:8px; margin-top:10px; }
/* 채널 그룹 카드 */
.ch-group-card { display:flex; align-items:center; gap:12px; background:var(--bg2); margin:4px 14px; padding:14px; border-radius:12px; border:1px solid var(--border); cursor:pointer; }
.ch-group-card:active { opacity:0.7; }
.ch-group-avatar { width:44px; height:44px; border-radius:12px; background:var(--primary-dim); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; color:var(--primary); flex-shrink:0; }
.ch-group-info { flex:1; min-width:0; }
.ch-group-name { font-size:15px; font-weight:600; }
.ch-group-last { font-size:12px; color:var(--text3); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-group-meta { display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.ch-group-time { font-size:11px; color:var(--text3); }
.ch-group-badge { background:var(--primary); color:#fff; font-size:11px; font-weight:700; border-radius:10px; padding:2px 7px; min-width:20px; text-align:center; }
/* 상세 뷰 헤더 */
.sub-header { display:flex; align-items:center; gap:10px; padding:12px 14px 8px; border-bottom:1px solid var(--border); }
.back-btn { background:none; border:none; color:var(--text); font-size:18px; cursor:pointer; padding:4px 8px; }
.sub-title { font-size:15px; font-weight:700; }
/* 발신함 카드 */
.send-card { background:var(--bg2); margin:4px 14px; padding:13px; border-radius:12px; border:1px solid var(--border); }
.send-card-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.send-type-badge { font-size:11px; background:var(--primary-dim); color:var(--primary); border-radius:6px; padding:2px 8px; font-weight:600; }
.send-status-badge { font-size:11px; border-radius:6px; padding:2px 8px; font-weight:600; margin-left:auto; }
.send-status-triggered { background:rgba(16,185,129,0.15); color:#10b981; }
.send-status-pending   { background:rgba(245,158,11,0.15);  color:#f59e0b; }
.send-status-cancelled { background:rgba(239,68,68,0.15);   color:#ef4444; }
.send-card-time { font-size:12px; color:var(--text3); margin-bottom:4px; }
.send-card-stats { font-size:12px; color:var(--text3); }
.btn-accept { flex:1; background:rgba(76,175,80,0.15); border:1px solid rgba(76,175,80,0.4); color:var(--success); padding:9px; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.btn-reject { flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:var(--danger); padding:9px; border-radius:8px; font-size:13px; cursor:pointer; font-weight:600; }
.status-badge { display:inline-flex; align-items:center; gap:4px; font-size:10px; padding:3px 7px; border-radius:20px; font-weight:600; margin-top:4px; }
.badge-accepted { background:rgba(76,175,80,0.15); color:var(--success); }
.badge-rejected { background:rgba(239,68,68,0.1); color:var(--danger); }
.badge-pending { background:rgba(108,99,255,0.15); color:var(--primary); }

/* ── 설정 화면 ── */
.settings-menu-label { font-size:12px; color:var(--text3); font-weight:600; letter-spacing:0.05em; padding:16px 16px 6px; text-transform:uppercase; }
.settings-menu-item { display:flex; align-items:center; gap:14px; padding:15px 16px; cursor:pointer; color:var(--text); font-size:15px; transition:background 0.15s; border-bottom:1px solid var(--border); }
.settings-menu-item:active { background:var(--bg3); }
.settings-menu-item i { width:22px; text-align:center; color:var(--primary); font-size:16px; }
.settings-menu-item .menu-arrow { margin-left:auto; color:var(--text3); font-size:12px; }
.settings-info-card { margin:12px 14px; background:var(--bg2); border-radius:12px; border:1px solid var(--border); overflow:hidden; }
.settings-info-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
.settings-info-row:last-child { border-bottom:none; }
.settings-info-label { font-size:12px; color:var(--text3); }
.settings-info-value { font-size:12px; color:var(--text2); font-family:monospace; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ── 토스트 ── */
#toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(20px); background:rgba(40,40,60,0.95); color:#fff; padding:10px 20px; border-radius:20px; font-size:13px; font-weight:500; opacity:0; transition:all 0.25s; pointer-events:none; white-space:nowrap; z-index:999; }
#toast.show { opacity:1; transform:translateX(-50%) translateY(0); }

/* ── 로그인/회원가입 풀스크린 ── */
#auth-screen {
  position:fixed; inset:0; z-index:1000;
  background:linear-gradient(160deg,#0D0D1A 0%,#1A1028 50%,#0D0D1A 100%);
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0 28px; overflow-y:auto;
}
#auth-screen.hidden { display:none; }

.auth-logo-wrap {
  display:flex; flex-direction:column; align-items:center; gap:10px; margin-bottom:32px;
}
.auth-logo-icon {
  width:80px; height:80px; border-radius:22px;
  background:linear-gradient(135deg,#FF6B6B,#FF8E53);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 8px 32px rgba(255,107,107,0.35);
}
.auth-app-title { font-size:26px; font-weight:800; color:#fff; letter-spacing:-0.3px; }
.auth-app-sub { font-size:13px; color:#8888AA; margin-top:-4px; }

/* 탭 전환 */
.auth-tab-bar {
  display:flex; width:100%; background:#1E1E2E; border-radius:14px;
  padding:4px; gap:4px; margin-bottom:24px;
}
.auth-tab {
  flex:1; padding:11px 0; border:none; border-radius:10px;
  font-size:15px; font-weight:600; cursor:pointer;
  background:transparent; color:#6B6B8A; transition:all 0.2s;
}
.auth-tab.active { background:var(--primary); color:#fff; box-shadow:0 2px 12px rgba(108,99,255,0.35); }

/* 입력 폼 */
.auth-form { width:100%; display:flex; flex-direction:column; gap:14px; }
.auth-input-wrap {
  display:flex; align-items:center; gap:10px;
  background:#1E1E2E; border:1.5px solid #2A2A42;
  border-radius:12px; padding:14px 14px;
  transition:border-color 0.2s;
}
.auth-input-wrap:focus-within { border-color:var(--primary); }
.auth-input-wrap i { color:#5555AA; font-size:15px; width:16px; text-align:center; flex-shrink:0; }
.auth-input-wrap input {
  flex:1; background:transparent; border:none; outline:none;
  color:#fff; font-size:15px; font-family:inherit;
}
.auth-input-wrap input::placeholder { color:#4A4A6A; }
.auth-eye-btn { background:none; border:none; color:#5555AA; cursor:pointer; padding:0 2px; font-size:15px; }

.auth-submit-btn {
  width:100%; padding:16px; border:none; border-radius:14px;
  font-size:16px; font-weight:700; cursor:pointer; color:#fff;
  background:linear-gradient(135deg,#7C3AED,#6C63FF);
  box-shadow:0 4px 24px rgba(108,99,255,0.5);
  margin-top:6px; transition:opacity 0.2s; letter-spacing:0.3px;
}
.auth-submit-btn:active { opacity:0.85; }
.auth-submit-btn:disabled { opacity:0.5; cursor:not-allowed; }
/* 회원가입 탭일 때 버튼은 더 밝은 보라 */
#signup-btn {
  background:linear-gradient(135deg,#8B5CF6,#6C63FF);
  box-shadow:0 4px 24px rgba(139,92,246,0.5);
}

.auth-error {
  background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3);
  color:#FF7070; font-size:13px; padding:10px 14px; border-radius:10px;
  text-align:center; display:none;
}
.auth-error.show { display:block; }

/* ── 토글 버튼 ── */
.toggle-btn { width:48px; height:26px; background:var(--border); border:none; border-radius:13px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
.toggle-btn span { position:absolute; top:3px; left:3px; width:20px; height:20px; background:#fff; border-radius:50%; transition:transform 0.2s; }
.toggle-btn.on { background:var(--primary); }
.toggle-btn.on span { transform:translateX(22px); }
/* ── 알람 설정 전체화면 ── */
.alarm-section-card { margin:10px 14px; background:var(--bg2); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
.alarm-section-title { font-size:18px; font-weight:700; color:var(--text); padding:18px 16px 14px; }
.alarm-section-row { display:flex; align-items:center; justify-content:space-between; padding:16px; border-top:1px solid var(--border); cursor:pointer; transition:background 0.15s; }
.alarm-section-row:active { background:var(--bg3); }
.alarm-section-row-label { font-size:16px; font-weight:600; color:var(--text); }
.alarm-section-row-value { font-size:13px; color:var(--primary); max-width:55%; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.msg-type-row { display:flex; flex-direction:row; gap:8px; padding:12px 14px; }
.msg-type-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; background:var(--bg3); border:2px solid var(--border); border-radius:12px; padding:10px 6px; cursor:pointer; transition:all 0.15s; flex:1; }
.msg-type-btn.selected { border-color:var(--primary); background:var(--primary-dim); }
.msg-type-btn:active { opacity:0.8; }
.msg-type-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; }
.msg-type-label { font-size:11px; font-weight:600; color:var(--text2); white-space:nowrap; }
.msg-type-btn.selected .msg-type-label { color:var(--primary); }
.msg-input-area { padding:0 14px 14px; display:flex; flex-direction:column; gap:8px; }
.msg-input-area input, .msg-input-area textarea { width:100%; background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:11px 13px; font-size:14px; outline:none; font-family:inherit; resize:none; }
.msg-input-area input:focus, .msg-input-area textarea:focus { border-color:var(--primary); }
/* ── 달력 ── */
.calendar-wrap { padding:10px 14px; }
.cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.cal-nav-btn { background:none; border:none; color:var(--text2); font-size:18px; cursor:pointer; padding:4px 12px; border-radius:8px; }
.cal-nav-btn:active { background:var(--bg3); }
.cal-month { font-size:16px; font-weight:700; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
.cal-dow { text-align:center; font-size:11px; color:var(--text3); padding:4px 0; font-weight:600; }
.cal-day { text-align:center; padding:8px 2px; border-radius:8px; cursor:pointer; font-size:14px; transition:background 0.1s; }
.cal-day:hover { background:var(--bg3); }
.cal-day.today { color:var(--teal); font-weight:700; }
.cal-day.selected { background:var(--primary) !important; color:#fff; font-weight:700; border-radius:50%; }
.cal-day.other-month { color:var(--text3); opacity:0.4; }
/* ── 시간 피커 ── */
.time-picker { display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; }
.time-col { display:flex; flex-direction:column; align-items:center; gap:4px; }
.time-spin { background:none; border:none; color:var(--text2); font-size:20px; cursor:pointer; padding:4px 14px; border-radius:8px; }
.time-spin:active { background:var(--bg3); }
.time-val { font-size:32px; font-weight:700; min-width:56px; text-align:center; background:var(--bg3); border-radius:10px; padding:10px 4px; }
.time-sep { font-size:28px; font-weight:700; color:var(--text2); padding-bottom:8px; }
/* ── 알람 하단 버튼 ── */
.alarm-bottom-btns { display:flex; gap:10px; padding:14px 14px 24px; position:sticky; bottom:0; background:var(--bg); }
.btn-alarm-done { flex:1; background:var(--teal); color:#fff; font-size:17px; font-weight:700; padding:16px; border:none; border-radius:14px; cursor:pointer; }
.btn-alarm-cancel { flex:1; background:var(--bg3); border:1px solid var(--border); color:var(--text2); font-size:17px; font-weight:600; padding:16px; border-radius:14px; cursor:pointer; }
/* ── 알람 미디어 버튼 ── */
.alarm-media-launch-btn { display:flex; align-items:center; gap:14px; width:100%; background:var(--bg3); border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; color:var(--text); text-align:left; transition:border-color 0.15s; }
.alarm-media-launch-btn:active { border-color:var(--primary); background:var(--primary-dim); }
.alarm-file-select-btn { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:none; border:1px dashed var(--border); border-radius:10px; padding:10px; cursor:pointer; color:var(--text3); font-size:13px; margin-top:4px; }
.alarm-file-select-btn:active { background:var(--bg3); }
.alarm-media-preview { padding:10px 12px; background:var(--bg); border:1px solid var(--teal); border-radius:10px; font-size:13px; color:var(--teal); margin-top:4px; }
/* ── 서브화면 앱바 ── */
.appbar-back { background:none; border:none; color:#fff; font-size:20px; cursor:pointer; padding:6px 8px 6px 0; }
/* ── 전체화면 오버레이 ── */
.fullscreen-overlay { display:none; position:fixed; inset:0; background:var(--bg); z-index:300; flex-direction:column; }
.fullscreen-overlay.active { display:flex; }
/* ── 채널 소개 화면 ── */
.ch-detail-hero { display:flex; align-items:center; gap:14px; padding:18px 16px 16px; background:var(--bg2); border-bottom:1px solid var(--border); }
.ch-detail-avatar { width:64px; height:64px; border-radius:16px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:700; }
.ch-detail-info { flex:1; min-width:0; }
.ch-detail-name { font-size:18px; font-weight:800; color:var(--text); }
.ch-detail-owner { font-size:12px; color:var(--text3); margin-top:3px; display:flex; align-items:center; gap:4px; }
.ch-detail-stats { display:flex; align-items:center; gap:6px; margin-top:6px; }
.ch-detail-badge { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--text2); background:var(--bg3); padding:4px 10px; border-radius:20px; }
.ch-detail-section { padding:16px 16px 0; }
.ch-detail-section-title { font-size:12px; font-weight:700; color:var(--text3); letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.ch-detail-section-body { font-size:14px; color:var(--text2); line-height:1.65; background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:13px 14px; }
.ch-detail-link { font-size:14px; color:var(--primary); background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:13px 14px; display:flex; align-items:center; gap:8px; cursor:pointer; text-decoration:none; }
.ch-detail-link:active { background:var(--bg3); }
.ch-detail-action-bar { padding:14px 16px; display:flex; gap:10px; }
.ch-detail-btn-share { flex:1; background:var(--bg2); border:1px solid var(--border); color:var(--text2); font-size:14px; font-weight:600; padding:12px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.ch-detail-btn-join { flex:2; background:var(--primary); border:none; color:#fff; font-size:14px; font-weight:700; padding:12px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.ch-detail-btn-leave { flex:2; background:var(--danger); border:none; color:#fff; font-size:14px; font-weight:700; padding:12px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
</style>
</head>
<body>

<!-- ══ 로그인 / 회원가입 화면 ══ -->
<div id="auth-screen">
  <!-- 로고 -->
  <div class="auth-logo-wrap">
    <div class="auth-logo-icon">
      <i class="fas fa-clock" style="color:#fff;font-size:34px;"></i>
    </div>
    <div class="auth-app-title">PushNotify</div>
    <div class="auth-app-sub">채널 알림 구독 서비스</div>
  </div>

  <!-- 탭 -->
  <div class="auth-tab-bar">
    <button class="auth-tab active" id="tab-login"  onclick="Auth.switchTab('login')">로그인</button>
    <button class="auth-tab"        id="tab-signup" onclick="Auth.switchTab('signup')">회원가입</button>
  </div>

  <!-- 로그인 폼 -->
  <div class="auth-form" id="form-login">
    <div class="auth-input-wrap">
      <i class="fas fa-envelope"></i>
      <input type="email" id="login-email" placeholder="example@email.com" autocomplete="email">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="login-pw" placeholder="비밀번호 입력" autocomplete="current-password">
      <button class="auth-eye-btn" onclick="Auth.togglePw('login-pw',this)"><i class="fas fa-eye-slash"></i></button>
    </div>
    <div class="auth-error" id="login-error"></div>
    <button class="auth-submit-btn" id="login-btn" onclick="Auth.login()">로그인</button>
  </div>

  <!-- 회원가입 폼 -->
  <div class="auth-form" id="form-signup" style="display:none;">
    <div style="font-size:12px;color:var(--text3);margin-bottom:-4px;">닉네임 <span style="color:var(--danger);">*</span></div>
    <div class="auth-input-wrap">
      <i class="fas fa-user"></i>
      <input type="text" id="signup-name" placeholder="표시될 이름" autocomplete="nickname">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-envelope"></i>
      <input type="email" id="signup-email" placeholder="example@email.com" autocomplete="email">
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="signup-pw" placeholder="비밀번호 (6자 이상)" autocomplete="new-password">
      <button class="auth-eye-btn" onclick="Auth.togglePw('signup-pw',this)"><i class="fas fa-eye-slash"></i></button>
    </div>
    <div class="auth-input-wrap">
      <i class="fas fa-lock"></i>
      <input type="password" id="signup-pw2" placeholder="비밀번호 확인" autocomplete="new-password">
    </div>
    <div class="auth-error" id="signup-error"></div>
    <button class="auth-submit-btn" id="signup-btn" onclick="Auth.signup()">회원가입</button>
  </div>

  <div style="height:40px;"></div>
</div>

<!-- ══ 앱바 ══ -->
<div class="appbar" id="appbar" style="display:none;">
  <div class="appbar-left">
    <div class="appbar-icon"><i class="fas fa-bell" style="color:#fff;font-size:16px;"></i></div>
    <span class="appbar-title">PushNotify</span>
  </div>
  <button class="appbar-menu" onclick="App.openDrawer()"><i class="fas fa-bars"></i></button>
</div>

<!-- ══ 화면 영역 ══ -->
<div id="screen-wrap" style="display:none;">

  <!-- 홈 화면 -->
  <div class="screen active" id="screen-home">
    <!-- 사용자 환영 카드 -->
    <div style="margin:12px 14px 4px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;gap:10px;">
      <div style="width:38px;height:38px;border-radius:10px;background:var(--primary-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <i class="fas fa-user" style="color:var(--primary);font-size:16px;"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:var(--text3);">안녕하세요 👋</div>
        <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="home-username">-</div>
      </div>
    </div>
    <!-- 나의 운영채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">나의 운영채널</span>
      <button class="section-btn" onclick="App.openCreateChannel()"><i class="fas fa-plus"></i> 채널 만들기</button>
    </div>
    <div id="owned-list"></div>
    <div id="owned-more" style="display:none;"></div>

    <!-- 나의 가입채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">나의 가입채널</span>
      <button class="section-btn" onclick="App.openJoinChannel()"><i class="fas fa-plus"></i> 채널 참여</button>
    </div>
    <div id="joined-list"></div>
    <div id="joined-more" style="display:none;"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 채널 탭 -->
  <div class="screen" id="screen-channel">
    <div class="section-header">
      <span class="section-title">채널</span>
    </div>
    <!-- 검색창 -->
    <div class="ch-search-wrap">
      <i class="fas fa-search ch-search-icon"></i>
      <input id="channel-search-input" class="ch-search-input"
             type="text" placeholder="채널명으로 검색..."
             oninput="App.onChannelSearch(this.value)">
      <button id="channel-search-clear" class="ch-search-clear" onclick="App.clearChannelSearch()" style="display:none;">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div id="channel-list-all"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 수신함 -->
  <div class="screen" id="screen-inbox">
    <div class="section-header">
      <span class="section-title">수신함</span>
    </div>
    <!-- 채널 목록 뷰 -->
    <div id="inbox-channel-list"></div>
    <!-- 채널 상세 뷰 (뒤로가기 포함) -->
    <div id="inbox-detail-view" style="display:none; flex-direction:column; flex:1;">
      <div class="sub-header">
        <button class="back-btn" onclick="App.inboxBack()"><i class="fas fa-arrow-left"></i></button>
        <span id="inbox-detail-title" class="sub-title"></span>
      </div>
      <div id="inbox-detail-list"></div>
    </div>
    <div style="height:12px;"></div>
  </div>

  <!-- 발신함 -->
  <div class="screen" id="screen-send">
    <div class="section-header">
      <span class="section-title">발신함</span>
    </div>
    <!-- 채널 목록 뷰 -->
    <div id="outbox-channel-list"></div>
    <!-- 채널 상세 뷰 -->
    <div id="outbox-detail-view" style="display:none; flex-direction:column; flex:1;">
      <div class="sub-header">
        <button class="back-btn" onclick="App.outboxBack()"><i class="fas fa-arrow-left"></i></button>
        <span id="outbox-detail-title" class="sub-title"></span>
      </div>
      <div id="outbox-detail-list"></div>
    </div>
    <div style="height:12px;"></div>
  </div>

  <!-- 설정 화면 -->
  <div class="screen" id="screen-settings">
    <div class="section-header">
      <span class="section-title">설정</span>
    </div>
    <div class="settings-menu-label">메뉴</div>
    <div class="settings-menu-item" onclick="App.goto('home')">
      <i class="fas fa-satellite-dish"></i> 나의 운영 채널
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.openCreateChannel()">
      <i class="fas fa-plus-circle"></i> 채널 만들기
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.goto('channel')">
      <i class="fas fa-list"></i> 나의 가입 채널
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.openJoinChannel()">
      <i class="fas fa-door-open"></i> 채널 참여
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="toast('준비 중입니다')">
      <i class="fas fa-shield-alt"></i> 개인정보보호정책
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="toast('v1.0.48 (web)')">
      <i class="fas fa-info-circle"></i> 버전
      <span style="margin-left:auto;font-size:13px;color:var(--text3);">v1.0.48</span>
    </div>

    <div class="settings-menu-label" style="margin-top:8px;">계정 정보</div>
    <div class="settings-info-card">
      <div class="settings-info-row">
        <span class="settings-info-label">이름</span>
        <span class="settings-info-value" id="settings-display-name">-</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">이메일</span>
        <span class="settings-info-value" id="settings-email">-</span>
      </div>
      <div class="settings-info-row">
        <span class="settings-info-label">사용자 ID</span>
        <span class="settings-info-value" id="settings-user-id">-</span>
      </div>
      <div class="settings-info-row" onclick="App.showFcmToken()" style="cursor:pointer;">
        <span class="settings-info-label">FCM 토큰</span>
        <span class="settings-info-value" id="settings-fcm-token">-</span>
      </div>
      <div class="settings-info-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding-bottom:10px;">
        <span class="settings-info-label" style="margin-bottom:2px;"><i class="fas fa-phone" style="color:var(--primary);margin-right:4px;"></i>통화 알람 수신 번호</span>
        <div style="display:flex;gap:6px;width:100%;">
          <input id="settings-phone" type="tel" placeholder="+821012345678  (국제형식)" 
            style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text1);"
            onkeydown="if(event.key==='Enter')App.savePhone()">
          <button onclick="App.savePhone()" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;">저장</button>
        </div>
        <span style="font-size:11px;color:var(--text3);">Twilio 통화 알람 수신에 사용됩니다. 국제 형식(+82...)으로 입력하세요.</span>
      </div>
    </div>
    <button class="btn-danger-outline" style="margin:12px 14px 6px;width:calc(100% - 28px);" onclick="App.logout()">
      <i class="fas fa-sign-out-alt"></i> 로그아웃
    </button>
    <button class="btn-ghost" style="margin:0 14px 12px;width:calc(100% - 28px);" onclick="App.resetDevice()">
      <i class="fas fa-trash-restore"></i> 기기 초기화
    </button>
    <div style="height:20px;"></div>
  </div>

</div><!-- /screen-wrap -->

<!-- ══ 하단 네비 ══ -->
<div class="bottom-nav" style="display:none;">
  <button class="nav-btn active" id="nav-home" onclick="App.goto('home')">
    <i class="fas fa-home"></i><span>홈</span>
  </button>
  <button class="nav-btn" id="nav-channel" onclick="App.goto('channel')">
    <i class="fas fa-layer-group"></i><span>채널</span>
  </button>
  <button class="nav-btn" id="nav-inbox" onclick="App.goto('inbox')">
    <i class="fas fa-inbox"></i><span>수신함</span>
  </button>
  <button class="nav-btn" id="nav-send" onclick="App.goto('send')">
    <i class="fas fa-paper-plane"></i><span>발신함</span>
  </button>
  <button class="nav-btn" id="nav-settings" onclick="App.goto('settings')">
    <i class="fas fa-cog"></i><span>설정</span>
  </button>
</div>

<!-- ══ 사이드 드로어 ══ -->
<div class="drawer-overlay" id="drawer-overlay" onclick="App.closeDrawer()"></div>
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <div class="drawer-logo"><i class="fas fa-bell" style="color:#fff;font-size:18px;"></i></div>
    <div style="flex:1;min-width:0;">
      <div class="drawer-app-name">PushNotify</div>
      <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="drawer-user-email">로그인 중...</div>
    </div>
  </div>
  <div class="drawer-menu-label">메뉴</div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('home')">
    <i class="fas fa-satellite-dish"></i> 나의 운영 채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.openCreateChannel()">
    <i class="fas fa-plus-circle"></i> 채널 만들기
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('channel')">
    <i class="fas fa-list"></i> 나의 가입 채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.openJoinChannel()">
    <i class="fas fa-door-open"></i> 채널 참여
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();toast('준비 중입니다')">
    <i class="fas fa-shield-alt"></i> 개인정보보호정책
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();toast('v1.0.48 (web)')">
    <i class="fas fa-info-circle"></i> 버전
    <span style="margin-left:auto;font-size:12px;color:var(--text3);">v1.0.48</span>
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.logout()" style="color:var(--danger);">
    <i class="fas fa-sign-out-alt" style="color:var(--danger);"></i> 로그아웃
  </div>
  <div class="drawer-version">RinGo Web v1.0.48</div>
</div>

<!-- ══ 모달: 채널 만들기 ══ -->
<div class="modal-overlay" id="modal-create">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 만들기</div>
    <div class="modal-body">
      <label class="form-label">채널명 *</label>
      <input class="form-input" id="create-name" placeholder="10자 내로 적어주세요" maxlength="10"
        oninput="document.getElementById('create-name-cnt').textContent=this.value.length+'/10'">
      <div class="char-count" id="create-name-cnt">0/10</div>

      <label class="form-label">채널 전화번호</label>
      <input class="form-input" id="create-phone" type="tel" placeholder="010-0000-0000">

      <label class="form-label">채널 소개 *</label>
      <textarea class="form-input form-textarea" id="create-desc" placeholder="50자 내로 적어주세요" rows="3" maxlength="50"
        oninput="document.getElementById('create-desc-cnt').textContent=this.value.length+'/50'"></textarea>
      <div class="char-count" id="create-desc-cnt">0/50</div>

      <label class="form-label">채널 대표이미지 선택</label>
      <div class="img-picker" onclick="App.openImagePicker('create')">
        <div class="img-thumb" id="create-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">미선택시 기본 이미지 적용</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="create-homepage" type="url" placeholder="https://">

      <button class="btn-teal" onclick="App.createChannel()">확인</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-create')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 채널 수정 ══ -->
<div class="modal-overlay" id="modal-edit">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 설정</div>
    <div class="modal-body">
      <input type="hidden" id="edit-channel-id">
      <label class="form-label">채널명</label>
      <input class="form-input" id="edit-name" maxlength="10">

      <label class="form-label">채널 소개</label>
      <textarea class="form-input form-textarea" id="edit-desc" maxlength="50" rows="3"></textarea>

      <label class="form-label">채널 대표이미지</label>
      <div class="img-picker" onclick="App.openImagePicker('edit')">
        <div class="img-thumb" id="edit-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">탭하여 변경</span>
      </div>

      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="edit-homepage" type="url" placeholder="https://">

      <button class="btn-teal" onclick="App.saveEditChannel()">저장</button>
      <button class="btn-danger-outline" onclick="App.confirmDeleteChannelFromEdit()">채널 삭제</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-edit')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 알람 설정 전체화면 ══ -->
<div class="fullscreen-overlay" id="modal-alarm">
  <!-- 앱바 -->
  <div class="app-bar" style="display:flex;align-items:center;gap:6px;padding:0 16px;">
    <button class="appbar-back" onclick="App.closeModal('modal-alarm')">
      <i class="fas fa-arrow-left"></i>
    </button>
    <span id="alarm-modal-title" style="font-size:17px;font-weight:700;flex:1;">알람 설정</span>
  </div>

  <!-- 스크롤 영역 -->
  <div style="flex:1;overflow-y:auto;padding-bottom:90px;">

    <!-- 기존 알람 목록 -->
    <div class="alarm-section-card" id="alarm-list-section" style="display:none;">
      <div class="alarm-section-title">설정된 알람</div>
      <div id="alarm-list-body" style="padding:0 14px 14px;"></div>
    </div>

    <!-- 새 알람 추가 구분선 -->
    <div id="alarm-add-area" style="padding:8px 14px 0;font-size:13px;font-weight:700;color:var(--text2);">
      <i class="fas fa-plus-circle" style="color:var(--primary);"></i> 새 알람 추가
    </div>

    <!-- 메시지 소스 선택 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">메시지 소스</div>
      <div class="msg-type-row">
        <div class="msg-type-btn selected" id="src-youtube"  onclick="App.selectMsgSrc('youtube')">
          <div class="msg-type-icon" style="background:#FF0000;"><i class="fab fa-youtube" style="color:#fff;"></i></div>
          <span class="msg-type-label">YouTube</span>
        </div>
        <div class="msg-type-btn" id="src-audio" onclick="App.selectMsgSrc('audio')">
          <div class="msg-type-icon" style="background:#4CAF50;"><i class="fas fa-microphone" style="color:#fff;"></i></div>
          <span class="msg-type-label">오디오</span>
        </div>
        <div class="msg-type-btn" id="src-video" onclick="App.selectMsgSrc('video')">
          <div class="msg-type-icon" style="background:#2196F3;"><i class="fas fa-video" style="color:#fff;"></i></div>
          <span class="msg-type-label">비디오</span>
        </div>
        <div class="msg-type-btn" id="src-file" onclick="App.selectMsgSrc('file')">
          <div class="msg-type-icon" style="background:#9C27B0;"><i class="fas fa-paperclip" style="color:#fff;"></i></div>
          <span class="msg-type-label">파일</span>
        </div>
      </div>
      <!-- 소스별 입력 영역 -->
      <div class="msg-input-area" id="alarm-input-area">

        <!-- YouTube: URL 입력 -->
        <div id="alarm-area-youtube" style="display:block;">
          <input id="alarm-youtube-url" type="url"
            placeholder="YouTube URL 붙여넣기 (https://youtube.com/...)"
            class="form-input" style="margin:0;">
        </div>

        <!-- 오디오: 녹음 앱 실행 버튼 -->
        <div id="alarm-area-audio" style="display:none;">
          <button class="alarm-media-launch-btn" onclick="App.launchRecorder('audio')">
            <i class="fas fa-microphone" style="font-size:22px;color:#4CAF50;"></i>
            <div>
              <div style="font-weight:700;font-size:14px;">녹음 앱 실행</div>
              <div style="font-size:11px;color:var(--text3);">Android 녹음 앱을 열어 녹음 후 파일을 선택하세요</div>
            </div>
          </button>
          <input id="alarm-audio-file" type="file" accept="audio/mpeg,.mp3"
            style="display:none;" onchange="App.onAlarmFileSelected(this,'audio')">
          <button class="alarm-file-select-btn" onclick="App.pickAudioFile()">
            <i class="fas fa-folder-open"></i> 저장된 오디오 파일 선택
          </button>
          <div id="alarm-audio-preview" class="alarm-media-preview" style="display:none;"></div>
        </div>

        <!-- 비디오: 녹화 앱 실행 버튼 -->
        <div id="alarm-area-video" style="display:none;">
          <button class="alarm-media-launch-btn" onclick="App.launchRecorder('video')">
            <i class="fas fa-video" style="font-size:22px;color:#2196F3;"></i>
            <div>
              <div style="font-weight:700;font-size:14px;">카메라(녹화) 앱 실행</div>
              <div style="font-size:11px;color:var(--text3);">Android 카메라 앱을 열어 녹화 후 파일을 선택하세요</div>
            </div>
          </button>
          <input id="alarm-video-file" type="file" accept="video/mp4,.mp4"
            style="display:none;" onchange="App.onAlarmFileSelected(this,'video')">
          <button class="alarm-file-select-btn" onclick="App.pickVideoFile()">
            <i class="fas fa-folder-open"></i> 저장된 비디오 파일 선택
          </button>
          <div id="alarm-video-preview" class="alarm-media-preview" style="display:none;"></div>
        </div>

        <!-- 파일: 사용할 앱 선택 (Android 공유 시트) -->
        <div id="alarm-area-file" style="display:none;">
          <button class="alarm-media-launch-btn" onclick="App.launchFilePicker()">
            <i class="fas fa-share-alt" style="font-size:22px;color:#9C27B0;"></i>
            <div>
              <div style="font-weight:700;font-size:14px;">파일 선택 (앱 선택)</div>
              <div style="font-size:11px;color:var(--text3);">mp3, mp4 파일만 선택 가능합니다</div>
            </div>
          </button>
          <input id="alarm-attach-file" type="file" accept="audio/mpeg,video/mp4,.mp3,.mp4"
            style="display:none;" onchange="App.onAlarmFileSelected(this,'file')">
          <div id="alarm-file-preview" class="alarm-media-preview" style="display:none;"></div>
        </div>

      </div>
    </div>

    <!-- 날짜 선택 (화살표 방식) -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">날짜 선택</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:12px 0;">
        <button class="cal-nav-btn" onclick="App.dateMove(-1)"><i class="fas fa-chevron-left"></i></button>
        <div id="alarm-date-label" style="font-size:18px;font-weight:700;color:var(--text);min-width:160px;text-align:center;"></div>
        <button class="cal-nav-btn" onclick="App.dateMove(1)"><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>

    <!-- 시간 선택 (직접 입력 가능) -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">시간 선택 <span style="font-size:11px;color:var(--text3);font-weight:400;">(숫자 클릭 시 직접 입력)</span></div>
      <div class="time-picker">
        <div class="time-col">
          <button class="time-spin" onclick="App.changeHour(1)"><i class="fas fa-chevron-up"></i></button>
          <div class="time-val" id="time-hour" onclick="App.inputTime('hour')" style="cursor:pointer;">09</div>
          <button class="time-spin" onclick="App.changeHour(-1)"><i class="fas fa-chevron-down"></i></button>
        </div>
        <div class="time-sep">:</div>
        <div class="time-col">
          <button class="time-spin" onclick="App.changeMin(5)"><i class="fas fa-chevron-up"></i></button>
          <div class="time-val" id="time-min" onclick="App.inputTime('min')" style="cursor:pointer;">00</div>
          <button class="time-spin" onclick="App.changeMin(-5)"><i class="fas fa-chevron-down"></i></button>
        </div>
      </div>
    </div>

  </div><!-- /스크롤 -->

  <!-- 하단 고정 버튼 -->
  <div class="alarm-bottom-btns">
    <button class="btn-alarm-cancel" onclick="App.closeModal('modal-alarm')">취소</button>
    <button class="btn-alarm-done"   onclick="App.saveAlarmSetting()">확인</button>
  </div>
</div>

<!-- ══ 모달: 초대코드 ══ -->
<div class="modal-overlay" id="modal-invite">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">초대 코드</div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text2);margin-bottom:10px;" id="invite-channel-name-label"></p>
      <div id="invite-code-box" style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;font-family:monospace;font-size:13px;color:var(--primary);word-break:break-all;line-height:1.6;">
        초대 링크를 불러오는 중...
      </div>
      <button class="btn-teal" onclick="App.copyInviteCode()" style="margin-top:12px;">
        <i class="fas fa-copy"></i> 복사
      </button>
      <button class="btn-ghost" onclick="App.closeModal('modal-invite')">닫기</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 채널 참여 ══ -->
<div class="modal-overlay" id="modal-join">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 참여</div>
    <div class="modal-body">
      <label class="form-label">초대 코드 또는 초대 링크</label>
      <input class="form-input" id="join-token" placeholder="코드 또는 URL 붙여넣기">
      <button class="btn-teal" onclick="App.joinChannel()">참여하기</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-join')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 이미지 소스 선택 ══ -->
<div class="modal-overlay" id="modal-img-src">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">이미지 선택</div>
    <div class="modal-body">
      <div class="img-src-btn" onclick="App.pickImageFrom('camera')">
        <i class="fas fa-camera"></i> 카메라
      </div>
      <div class="img-src-btn" onclick="App.pickImageFrom('gallery')">
        <i class="fas fa-images"></i> 갤러리
      </div>
      <div class="img-src-btn" onclick="App.closeModal('modal-img-src')">
        <i class="fas fa-times"></i> 취소
      </div>
    </div>
  </div>
</div>

<!-- 파일 인풋 (hidden) -->
<input type="file" id="file-input" accept="image/*" style="display:none" onchange="App.onFileSelected(this)">
<input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none" onchange="App.onFileSelected(this)">

<!-- 토스트 -->
<div id="toast"></div>

<!-- ══ 채널 소개 풀스크린 (JS에서 동적 생성) ══ -->
<div class="fullscreen-overlay" id="modal-channel-detail"></div>

<script src="/static/mobile-app.js?v=202603071500"></script>
</body>
</html>`;
