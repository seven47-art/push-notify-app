// src/appHtml.ts - /app 라우트 HTML (자동 생성, 수정 금지)
export const APP_HTML = String.raw`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>RinGo</title>
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
  --appbar-bg: #000000;
  --input-focus-bg: #1f1f30;
  --input-done-border: #5a54cc;
  --input-readonly-bg: #1a1a28; --input-readonly-border: #2E2E42; --input-readonly-text: #555568;
}
[data-theme="light"] {
  --bg: #FFFFFF; --bg2: #FFFFFF; --bg3: #F2F2F7;
  --primary: #6C63FF; --primary-dim: rgba(108,99,255,0.12);
  --teal: #26D0CE; --text: #1C1C1E; --text2: #3A3A3C;
  --text3: #8E8E93; --border: #D1D1D6;
  --danger: #EF4444; --success: #4CAF50; --nav-h: 62px;
  --appbar-bg: #FFFFFF;
  --input-focus-bg: #FAFAFF;
  --input-done-border: #7c75e8;
  --input-readonly-bg: #E8E8EE; --input-readonly-border: #C8C8D0; --input-readonly-text: #AAAABC;
}
body { background:var(--bg); color:var(--text); font-family:-apple-system,'Noto Sans KR',sans-serif; height:100dvh; overflow:hidden; display:flex; flex-direction:column; }

/* ── 앱바 ── */
.appbar { height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 16px; background:var(--appbar-bg); flex-shrink:0; transition:background 0.3s; }
.appbar-left { display:flex; align-items:center; gap:10px; }
.appbar-icon { border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.appbar-title { font-size:20px; font-weight:700; color:#fff; }
.appbar-menu { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:6px; }
[data-theme="light"] .appbar-menu { color:#000000; }
[data-theme="light"] .appbar-back { color:#000000; }

/* ── 하단 네비 ── */
.bottom-nav { height:var(--nav-h); display:flex; background:var(--bg2); border-top:1px solid var(--border); flex-shrink:0; }
.nav-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; background:none; border:none; color:var(--text3); cursor:pointer; font-size:10px; transition:color 0.15s; padding:4px 0; }
.nav-btn i { font-size:20px; }
.nav-btn.active { color:var(--primary); }
[data-theme="light"] .nav-btn { color:#BBBBBB; }
[data-theme="light"] .nav-btn.active { color:#333333; }

/* ── 화면 ── */
#screen-wrap { flex:1; overflow:hidden; position:relative; }
.screen { display:none; position:absolute; inset:0; overflow-y:auto; flex-direction:column; }
.screen.active { display:flex; }

/* ── 섹션 헤더 ── */
.section-header { display:flex; align-items:center; justify-content:space-between; padding:16px 16px 8px; }
.section-title { font-size:16px; font-weight:700; }
.section-btn { background:var(--bg3); border:1px solid rgba(108,99,255,0.4); color:var(--primary); font-size:12px; font-weight:600; padding:6px 12px; border-radius:20px; cursor:pointer; display:flex; align-items:center; gap:5px; }
.back-btn { background:none; border:none; color:var(--text2); font-size:18px; cursor:pointer; padding:4px 8px 4px 0; display:flex; align-items:center; }

/* ── 채널 타일 (운영) ── */
.channel-list-wrap { margin:0 14px; background:var(--bg); border-radius:12px; border:none; overflow:hidden; }
.channel-tile { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border); }
.channel-tile:last-child { border-bottom:none; }
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
.joined-list-wrap { margin:0 14px; background:var(--bg); border-radius:12px; border:none; overflow:hidden; }
.joined-tile { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.12s; }
.joined-tile:last-child { border-bottom:none; }
.joined-tile:active { background:var(--bg3); }
.joined-tile .info { flex:1; min-width:0; }
.joined-tile .chevron { color:var(--text3); font-size:13px; }
.joined-tile .ch-name { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.joined-tile .ch-sub  { font-size:11px; color:var(--text3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ── 아바타 ── */
.avatar { border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; }
.avatar img { width:100%; height:100%; object-fit:cover; }

/* ── 더보기 버튼 ── */
.more-btn { display:flex; align-items:center; justify-content:center; gap:6px; margin:6px 14px 2px; padding:10px; background:var(--bg); border:none; border-radius:10px; color:var(--text3); font-size:13px; cursor:pointer; }
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
.ch-all-list-wrap { margin:4px 14px; background:var(--bg); border-radius:12px; border:none; overflow:hidden; }
.ch-all-tile { display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.12s; }
.ch-all-tile:last-child { border-bottom:none; }
.ch-all-tile:active { background:var(--bg3); }
.ch-all-tile .info { flex:1; min-width:0; }
.ch-all-tile .ch-name { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ch-all-tile .ch-sub  { font-size:11px; color:var(--text3); margin-top:2px; }
.ch-section-title { font-size:13px; font-weight:700; color:var(--text2); padding:10px 16px 4px; letter-spacing:0.3px; }

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
.drawer-logo { height:34px; display:flex; align-items:center; justify-content:center; }
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
.modal-body { padding:8px 16px 12px; }
.form-label { font-size:12px; color:var(--text2); font-weight:600; margin-bottom:5px; margin-top:0; display:block; }
.form-input { width:100%; background:var(--bg3); border:1.5px solid var(--border); color:var(--text); border-radius:10px; padding:9px 12px; font-size:14px; outline:none; font-family:inherit; resize:none; transition:border-color 0.18s, background 0.18s; }
.form-input:focus { border-color:var(--primary); background:var(--input-focus-bg); }
.form-input:not(:placeholder-shown):not(:focus):not([readonly]):not([disabled]) { border-color:var(--input-done-border); }
.form-input[readonly], .form-input[disabled], .form-input.readonly { background:var(--input-readonly-bg) !important; border-color:var(--input-readonly-border) !important; color:var(--input-readonly-text) !important; cursor:default; }
.form-textarea { min-height:64px; }
.char-count { font-size:11px; color:var(--text3); text-align:right; margin-top:2px; margin-bottom:0; }
.field-notice { font-size:11px; font-weight:600; margin-top:1px; margin-bottom:0; }
.section-gap { height:20px; }
.img-picker { display:flex; align-items:center; gap:14px; background:var(--bg3); border:1.5px dashed var(--border); border-radius:12px; padding:12px 14px; cursor:pointer; margin-top:6px; transition:border-color 0.18s; }
.img-picker:active { border-color:var(--primary); }
.img-picker.has-image { border-style:solid; border-color:var(--input-done-border); }
.img-thumb { width:56px; height:56px; border-radius:10px; background:var(--bg2); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }
.img-thumb img { width:100%; height:100%; object-fit:cover; }
.img-thumb-empty { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
.img-thumb-empty i { font-size:20px; color:var(--text3); }
.img-thumb-empty span { font-size:9px; font-weight:700; color:var(--text3); letter-spacing:0.5px; }
.img-hint { font-size:12px; color:var(--text3); line-height:1.5; }
/* ── 자물쇠 비밀채널 토글 ── */
.lock-toggle { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:12px; border:1.5px solid var(--border); background:var(--bg3); cursor:pointer; margin-top:6px; transition:border-color 0.2s, background 0.2s; user-select:none; }
.lock-toggle.locked { border-color:var(--primary); background:var(--input-focus-bg); }
.lock-icon { font-size:22px; width:28px; text-align:center; transition:color 0.2s; }
.lock-icon.unlocked { color:var(--text3); }
.lock-icon.locked   { color:var(--primary); }
.lock-label { font-size:13px; font-weight:600; flex:1; transition:color 0.2s; }
.lock-label.unlocked { color:var(--text3); }
.lock-label.locked   { color:var(--primary); }
.lock-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; transition:all 0.2s; }
.lock-badge.unlocked { background:var(--bg2); color:var(--text3); border:1px solid var(--border); }
.lock-badge.locked   { background:var(--primary); color:#fff; border:1px solid var(--primary); }
.btn-teal { width:100%; background:var(--teal); color:#fff; font-size:14px; font-weight:700; padding:11px; border:none; border-radius:12px; cursor:pointer; margin-top:0; }
.btn-ghost { width:100%; background:transparent; border:1px solid var(--border); color:var(--text2); font-size:14px; padding:11px; border-radius:12px; cursor:pointer; margin-top:0; }
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
.ch-tab-wrap { display:flex; gap:8px; padding:10px 16px 6px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.ch-tab-wrap::-webkit-scrollbar { display:none; }
.ch-tab-btn { flex-shrink:0; padding:6px 14px; border-radius:20px; border:1px solid var(--border); background:var(--bg2); color:var(--text3); font-size:13px; cursor:pointer; white-space:nowrap; }
.ch-tab-active { background:var(--primary); color:#fff; border-color:var(--primary); font-weight:600; }
.alarm-list-row { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--border); }
.alarm-list-row:active { background:var(--bg3); }
.alarm-list-icon { font-size:20px; flex-shrink:0; width:28px; text-align:center; }
#screen-content-player { display:none; }
#screen-content-player.active { display:flex !important; }
#cp-audio-wrap { display:none; }
#cp-audio-wrap.active { display:flex !important; }
#cp-link-btn { display:none; }
#cp-link-btn.active { display:flex !important; }
.alarm-list-channel { flex:1; font-size:14px; color:var(--text); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.alarm-list-time { font-size:12px; color:var(--text3); flex-shrink:0; }
.alarm-list-status { font-size:11px; font-weight:600; flex-shrink:0; min-width:32px; text-align:right; }
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
/* ── 테마 토글 스위치 ── */
.theme-toggle-wrap { margin-left:auto; display:flex; align-items:center; gap:8px; }
.theme-toggle-label { font-size:12px; color:var(--text3); }
.toggle-switch { position:relative; width:48px; height:26px; }
.toggle-switch input { opacity:0; width:0; height:0; }
.toggle-slider { position:absolute; inset:0; background:var(--bg3); border-radius:13px; cursor:pointer; transition:background 0.3s; border:1px solid var(--border); }
.toggle-slider:before { content:''; position:absolute; width:20px; height:20px; left:2px; top:2px; background:#fff; border-radius:50%; transition:transform 0.3s; box-shadow:0 1px 3px rgba(0,0,0,0.3); }
.toggle-switch input:checked + .toggle-slider { background:var(--primary); border-color:var(--primary); }
.toggle-switch input:checked + .toggle-slider:before { transform:translateX(22px); }
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
  overflow:hidden;
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
.alarm-section-card { margin:8px 14px; background:var(--bg2); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
.alarm-section-title { font-size:14px; font-weight:700; color:var(--text); padding:14px 16px 10px; }
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
/* ── 날짜/시간 통합 행 ── */
.alarm-datetime-row { display:flex; align-items:center; gap:10px; padding:0 14px 14px 14px; cursor:pointer; transition:background 0.15s; }
.alarm-datetime-row:active { background:var(--bg3); }
.alarm-datetime-icon { width:44px; height:44px; border-radius:12px; background:#9C27B0; display:flex; align-items:center; justify-content:center; font-size:20px; color:#fff; flex-shrink:0; border:none; cursor:pointer; }
.alarm-datetime-text { flex:1; display:flex; align-items:center; gap:8px; }
.alarm-datetime-date { font-size:15px; font-weight:600; color:var(--text); }
.alarm-datetime-sep { font-size:15px; font-weight:600; color:var(--text3); }
.alarm-datetime-time { font-size:15px; font-weight:700; color:var(--primary); }
/* ── 날짜/시간 통합 팝업 ── */
.dt-picker-section { padding:16px; border-bottom:1px solid var(--border); }
.dt-picker-section-title { font-size:13px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; }
.dt-time-row { display:flex; align-items:center; justify-content:center; gap:8px; }
.dt-ampm-btn { padding:10px 16px; border-radius:10px; border:1px solid var(--border); background:var(--bg3); color:var(--text2); font-size:15px; font-weight:600; cursor:pointer; }
.dt-ampm-btn.active { background:var(--primary); color:#fff; border-color:var(--primary); }
.dt-time-col { display:flex; flex-direction:column; align-items:center; gap:4px; }
.dt-time-spin { background:none; border:none; color:var(--text2); font-size:20px; cursor:pointer; padding:4px 12px; border-radius:8px; }
.dt-time-spin:active { background:var(--bg3); }
.dt-time-val { font-size:30px; font-weight:700; min-width:52px; text-align:center; background:var(--bg3); border-radius:10px; padding:8px 4px; color:var(--text); }
/* ── 알람 하단 버튼 ── */
.alarm-bottom-btns { display:flex; gap:10px; padding:12px 14px 16px; background:var(--bg); }
.btn-alarm-done { flex:1; background:var(--teal); color:#fff; font-size:14px; font-weight:700; padding:9px; border:none; border-radius:12px; cursor:pointer; }
.btn-alarm-cancel { flex:1; background:var(--bg3); border:1px solid var(--border); color:var(--text2); font-size:14px; font-weight:600; padding:9px; border-radius:12px; cursor:pointer; }
/* ── 알람 미디어 버튼 ── */
.alarm-media-launch-btn { display:flex; align-items:center; gap:14px; width:100%; background:var(--bg3); border:1.5px solid var(--border); border-radius:12px; padding:14px 16px; cursor:pointer; color:var(--text); text-align:left; transition:border-color 0.15s; }
.alarm-media-launch-btn:active { border-color:var(--primary); background:var(--primary-dim); }
.alarm-file-select-btn { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:none; border:1px dashed var(--border); border-radius:10px; padding:10px; cursor:pointer; color:var(--text3); font-size:13px; margin-top:4px; }
.alarm-file-select-btn:active { background:var(--bg3); }
.alarm-media-preview { padding:10px 12px; background:var(--bg); border:1px solid var(--teal); border-radius:10px; font-size:13px; color:var(--teal); margin-top:8px; display:flex; align-items:center; gap:4px; }
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
.ch-detail-section-body { font-size:14px; color:var(--text2); line-height:1.65; background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:13px 14px; white-space:pre-wrap; word-break:break-word; }
.ch-detail-link { font-size:14px; color:var(--primary); background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:13px 14px; display:flex; align-items:center; gap:8px; cursor:pointer; text-decoration:none; }
.ch-detail-link:active { background:var(--bg3); }
.ch-detail-action-bar { padding:14px 16px; display:flex; gap:10px; justify-content:flex-end; align-items:center; }
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
      <img src="/static/ringo-icon.png" style="width:80px;height:80px;border-radius:22px;object-fit:cover;display:block;">
    </div>
    <div class="auth-app-title">RinGo</div>
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
    <img id="appbar-logo" src="/static/ringo-logo.png" style="height:34px;object-fit:contain;display:block;">
  </div>
  <div style="display:flex;align-items:center;gap:2px;">
    <button class="appbar-menu" onclick="App.goto('channel')" title="채널 검색">
      <i class="fas fa-search"></i>
    </button>
    <button class="appbar-menu" onclick="App.goto('settings')" title="설정">
      <i class="fas fa-cog"></i>
    </button>
    <button class="appbar-menu" onclick="App.openDrawer()" style="position:relative;">
      <i class="fas fa-bars"></i>
      <span id="appbar-notice-badge" style="display:none;position:absolute;top:4px;right:4px;width:8px;height:8px;background:#EF4444;border-radius:50%;pointer-events:none;"></span>
    </button>
  </div>
</div>

<!-- ══ 화면 영역 ══ -->
<div id="screen-wrap" style="display:none;">

  <!-- 홈 화면 -->
  <div class="screen active" id="screen-home">
    <!-- 나의 운영채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">내 채널</span>
      <button class="section-btn" onclick="App.openCreateChannel()"><i class="fas fa-plus"></i> 채널 만들기</button>
    </div>
    <div id="owned-list"></div>
    <div id="owned-more" style="display:none;"></div>

    <!-- 나의 가입채널 -->
    <div class="section-header" style="margin-top:8px;">
      <span class="section-title">구독 채널</span>
    </div>
    <div id="joined-list"></div>
    <div id="joined-more" style="display:none;"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 나의 운영채널 전체 페이지 -->
  <!-- 공지사항 전체 페이지 -->
  <div class="screen" id="screen-notices">
    <div class="section-header" style="margin-top:8px;">
      <button class="back-btn" onclick="App.gotoBack()"><i class="fas fa-arrow-left"></i></button>
      <span class="section-title" style="flex:1;">공지사항</span>
    </div>
    <div id="notices-list" style="padding:8px 16px;"></div>
  </div>

  <div class="screen" id="screen-owned-all">
    <div class="section-header" style="margin-top:8px;">
      <button class="back-btn" onclick="App.gotoBack()"><i class="fas fa-arrow-left"></i></button>
      <span class="section-title" style="flex:1;">내 채널</span>
      <button class="section-btn" onclick="App.openCreateChannel()"><i class="fas fa-plus"></i> 채널 만들기</button>
    </div>
    <div id="owned-all-list"></div>
    <div style="height:12px;"></div>
  </div>

  <!-- 나의 가입채널 전체 페이지 -->
  <div class="screen" id="screen-joined-all">
    <div class="section-header" style="margin-top:8px;">
      <button class="back-btn" onclick="App.gotoBack()"><i class="fas fa-arrow-left"></i></button>
      <span class="section-title" style="flex:1;">구독 채널</span>
    </div>
    <div id="joined-all-list"></div>
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
    <!-- 코드로 채널 참여하기 버튼 -->
    <div style="padding:0 14px 10px;">
      <button onclick="App.openJoinChannel()" style="width:100%;padding:11px;background:var(--bg3);border:1.5px dashed rgba(108,99,255,0.5);border-radius:12px;color:var(--primary);font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        <i class="fas fa-plus-circle"></i> 코드로 채널 참여하기
      </button>
    </div>
    <!-- 검색 결과 (검색 중일 때만 표시) -->
    <div id="channel-list-search" style="display:none;"></div>
    <!-- 인기 채널 섹션 -->
    <div id="channel-section-popular">
      <div class="ch-section-title"><i class="fas fa-star" style="color:#F59E0B;margin-right:6px;"></i>인기 채널</div>
      <div id="channel-list-popular"></div>
    </div>
    <!-- 베스트 채널 섹션 -->
    <div id="channel-section-best">
      <div class="ch-section-title" style="margin-top:8px;"><i class="fas fa-trophy" style="color:#10B981;margin-right:6px;"></i>베스트 채널</div>
      <div id="channel-list-best"></div>
    </div>
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

  <!-- 컨텐츠 재생 전용 페이지 -->
  <div class="screen" id="screen-content-player" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; z-index:999; background:#000; flex-direction:column;">
    <!-- 컨텐츠 영역 (전체화면) -->
    <div id="cp-content-area" style="flex:1; width:100%; position:relative; overflow:hidden; background:#000;">
      <!-- 유튜브 iframe -->
      <iframe id="cp-youtube-frame" style="display:none; width:100%; height:100%; border:none;" allowfullscreen allow="autoplay; encrypted-media"></iframe>
      <!-- 비디오 플레이어 -->
      <video id="cp-video-player" style="display:none; width:100%; height:100%; object-fit:contain;" controls playsinline></video>
      <!-- 오디오 플레이어 -->
      <div id="cp-audio-wrap" style="display:none; flex-direction:column; align-items:center; justify-content:center; height:100%;">
        <i class="fas fa-music" style="font-size:80px; color:#4FC3F7; margin-bottom:32px; opacity:0.8;"></i>
        <audio id="cp-audio-player" controls style="width:85%;"></audio>
      </div>
    </div>
    <!-- 하단 바 -->
    <div id="cp-bottom-bar" style="position:absolute; bottom:0; left:0; right:0; padding:16px 20px; display:flex; align-items:center; gap:12px; background:linear-gradient(transparent, rgba(0,0,0,0.8));">
      <!-- 채널 아바타 -->
      <div id="cp-channel-avatar" style="width:44px; height:44px; border-radius:12px; background:rgba(108,99,255,0.3); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; color:#6C63FF; flex-shrink:0;"></div>
      <!-- 채널명 -->
      <span id="cp-channel-name" style="flex:1; color:#fff; font-size:15px; font-weight:600;"></span>
      <!-- 링크 버튼 -->
      <button id="cp-link-btn" onclick="App.cpOpenLink()" style="width:44px; height:44px; border-radius:50%; background:#6C63FF; border:none; color:#fff; font-size:18px; cursor:pointer; display:none; align-items:center; justify-content:center;">
        <i class="fas fa-link"></i>
      </button>
      <!-- 닫기 버튼 -->
      <button onclick="App.closeContentPlayer()" style="width:44px; height:44px; border-radius:50%; background:#EF5350; border:none; color:#fff; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>

  <!-- 설정 화면 -->
  <div class="screen" id="screen-settings">
    <div class="section-header">
      <span class="section-title">설정</span>
    </div>
    <div class="settings-menu-label">메뉴</div>
    <!-- 다크/라이트 모드 토글 -->
    <div class="settings-menu-item" style="cursor:default;">
      <i class="fas fa-moon"></i> 모드 선택
      <div class="theme-toggle-wrap">
        <span style="font-size:13px;color:var(--text2);">라이트</span>
        <label class="toggle-switch" style="margin:0 4px;">
          <input type="checkbox" id="theme-toggle" onchange="App.toggleTheme(this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:13px;color:var(--text2);">다크</span>
      </div>
    </div>

    <div class="settings-menu-item" onclick="App.openPrivacy()">
      <i class="fas fa-shield-alt"></i> 개인정보보호정책
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="App.openTerms()">
      <i class="fas fa-file-alt"></i> 서비스 이용약관
      <i class="fas fa-chevron-right menu-arrow"></i>
    </div>
    <div class="settings-menu-item" onclick="toast('v' + (localStorage.getItem('app_version') || '?'))">
      <i class="fas fa-info-circle"></i> 버전
      <span style="margin-left:auto;font-size:13px;color:var(--text3);" id="app-version-label">v...</span>
    </div>

    <button class="btn-danger-outline" style="margin:12px 14px 6px;width:calc(100% - 28px);" onclick="App.logout()">
      <i class="fas fa-sign-out-alt"></i> 로그아웃
    </button>
    <button class="btn-danger-outline" style="margin:4px 14px 6px;width:calc(100% - 28px);opacity:0.7;" onclick="App.deleteAccount()">
      <i class="fas fa-user-times"></i> 회원탈퇴
    </button>

    <div style="height:20px;"></div>
  </div>

</div><!-- /screen-wrap -->

<!-- ══ 하단 네비 ══ -->
<div class="bottom-nav" style="display:none;">
  <button class="nav-btn active" id="nav-home" onclick="App.goto('home')">
    <i class="fas fa-home"></i><span>홈</span>
  </button>
  <button class="nav-btn" id="nav-owned-all" onclick="App.goto('owned-all')">
    <i class="fas fa-satellite-dish"></i><span>내 채널</span>
  </button>
  <button class="nav-btn" id="nav-joined-all" onclick="App.goto('joined-all')">
    <i class="fas fa-list"></i><span>구독 채널</span>
  </button>
  <button class="nav-btn" id="nav-inbox" onclick="App.goto('inbox')">
    <i class="fas fa-inbox"></i><span>수신함</span>
  </button>
  <button class="nav-btn" id="nav-send" onclick="App.goto('send')">
    <i class="fas fa-paper-plane"></i><span>발신함</span>
  </button>
  <button class="nav-btn" id="nav-settings" onclick="App.goto('settings')" style="display:none;">
    <i class="fas fa-cog"></i><span>설정</span>
  </button>
</div>

<!-- ══ 사이드 드로어 ══ -->
<div class="drawer-overlay" id="drawer-overlay" onclick="App.closeDrawer()"></div>
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <div class="drawer-logo"><img id="drawer-logo" src="/static/ringo-logo.png" style="height:34px;object-fit:contain;display:block;"></div>
    <div style="flex:1;min-width:0;">
      <div class="drawer-app-name" style="display:none;">RinGo</div>
      <div style="font-size:12px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="drawer-user-email">로그인 중...</div>
    </div>
  </div>
  <div class="drawer-menu-label">메뉴</div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('notices')" style="display:flex;align-items:center;gap:12px;">
    <i class="fas fa-bullhorn" style="width:20px;text-align:center;color:var(--text3);font-size:15px;"></i>
    <span style="display:flex;align-items:center;gap:4px;">공지사항<span id="notice-badge" style="display:none;width:8px;height:8px;background:#EF4444;border-radius:50%;flex-shrink:0;"></span></span>
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('owned-all')">
    <i class="fas fa-satellite-dish"></i> 내채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('joined-all')">
    <i class="fas fa-list"></i> 구독채널
  </div>
  <div class="drawer-menu-item" onclick="App.closeDrawer();App.goto('settings')">
    <i class="fas fa-cog"></i> 설정
  </div>
  <div class="drawer-version">RinGo Web v1.0.48</div>
</div>

<!-- ══ 모달: 채널 만들기 ══ -->
<div class="modal-overlay" id="modal-create">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 만들기</div>
    <div class="modal-body">

      <!-- 채널명 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
        <label class="form-label" style="margin-bottom:0;">채널명 (필수)</label>
        <span style="font-size:10px;font-weight:600;color:#FF6B6B;">* 변경 불가</span>
      </div>
      <input class="form-input" id="create-name" placeholder="10자 내로 적어주세요" maxlength="10"
        oninput="this.value=this.value.replace(/[!@#$%^&*()+={}\[\]|\\/<>?~\`&quot;';:]/g,''); document.getElementById('create-name-cnt').textContent=this.value.length+'/10'">
      <div class="char-count" id="create-name-cnt">0/10</div>

      <!-- 채널 소개 -->
      <div style="height:16px;"></div>
      <label class="form-label">채널 소개 (필수)</label>
      <textarea class="form-input form-textarea" id="create-desc" placeholder="50자 내로 적어주세요" rows="3" maxlength="50"
        oninput="document.getElementById('create-desc-cnt').textContent=this.value.length+'/50'"></textarea>
      <div class="char-count" id="create-desc-cnt">0/50</div>

      <!-- 채널 홈페이지 -->
      <div style="height:16px;"></div>
      <label class="form-label">채널 홈페이지</label>
      <input class="form-input" id="create-homepage" type="url" placeholder="https://">

      <!-- 채널 대표이미지 -->
      <div style="height:20px;"></div>
      <label class="form-label">채널 대표이미지 선택</label>
      <div class="img-picker" id="create-img-picker" onclick="App.openImagePicker('create')">
        <div class="img-thumb" id="create-img-thumb">
          <div class="img-thumb-empty">
            <i class="fas fa-camera"></i>
            <span>IMAGE</span>
          </div>
        </div>
        <div>
          <span class="img-hint">탭하여 이미지 선택</span><br>
          <span style="font-size:11px;color:var(--text3);">미선택시 기본 이미지 적용</span>
        </div>
      </div>

      <!-- 비밀번호 -->
      <div style="height:20px;"></div>
      <label class="form-label">비밀번호</label>
      <div class="lock-toggle" id="create-lock-toggle" onclick="App.toggleSecretCreate(!document.getElementById('create-is-secret').checked)">
        <i class="fas fa-lock-open lock-icon unlocked" id="create-lock-icon"></i>
        <span class="lock-label unlocked" id="create-lock-label">비밀채널 미설정</span>
        <span class="lock-badge unlocked" id="create-lock-badge">OFF</span>
      </div>
      <input type="hidden" id="create-is-secret" value="0">
      <div id="create-secret-wrap" style="display:none;margin-top:8px;">
        <input class="form-input" id="create-password" type="password" placeholder="비밀번호를 입력하세요" autocomplete="new-password">
      </div>

      <!-- 버튼 -->
      <div style="height:28px;"></div>
      <div style="display:flex;gap:10px;">
        <button class="btn-teal" onclick="App.createChannel()" style="flex:1;">확인</button>
        <button class="btn-ghost" onclick="App.closeModal('modal-create')" style="flex:1;">취소</button>
      </div>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>


<!-- ══ 모달: 채널 수정 ══ -->
<div class="modal-overlay" id="modal-edit" style="z-index:400;">
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">채널 설정</div>
    <div class="modal-body">
      <input type="hidden" id="edit-channel-id">

      <!-- 채널명 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
        <label class="form-label" style="margin-bottom:0;">채널명</label>
        <span style="font-size:10px;font-weight:600;color:#FF6B6B;">* 변경 불가</span>
      </div>
      <input class="form-input readonly" id="edit-name" maxlength="10" style="pointer-events:none;">

      <!-- 채널 소개 -->
      <div style="height:16px;"></div>
      <label class="form-label">채널 소개</label>
      <textarea class="form-input form-textarea" id="edit-desc" maxlength="50" rows="3"></textarea>

      <!-- 채널 홈페이지 -->
      <div style="height:16px;"></div>
      <label class="form-label">채널 홈페이지</label>
      <div style="position:relative;display:flex;align-items:center;">
        <input class="form-input" id="edit-homepage" type="text" placeholder="https://"
               style="padding-right:36px;">
        <button id="edit-homepage-clear" onclick="App._clearEditHomepage()"
                style="position:absolute;right:8px;background:none;border:none;cursor:pointer;padding:4px;color:var(--text3);font-size:16px;">✕</button>
      </div>

      <!-- 채널 대표이미지 -->
      <div style="height:20px;"></div>
      <label class="form-label">채널 대표이미지</label>
      <div class="img-picker" onclick="App.openImagePicker('edit')">
        <div class="img-thumb" id="edit-img-thumb">
          <i class="fas fa-microphone" style="color:var(--primary);font-size:26px;"></i>
        </div>
        <span class="img-hint">탭하여 변경</span>
      </div>

      <!-- 비밀번호 -->
      <div style="height:20px;"></div>
      <label class="form-label">비밀번호 설정</label>
      <div class="lock-toggle" id="edit-lock-toggle" onclick="App.toggleSecretEdit(!document.getElementById('edit-is-secret').checked)">
        <i class="fas fa-lock-open lock-icon unlocked" id="edit-lock-icon"></i>
        <span class="lock-label unlocked" id="edit-lock-label">비밀채널 미설정</span>
        <span class="lock-badge unlocked" id="edit-lock-badge">OFF</span>
      </div>
      <input type="hidden" id="edit-is-secret" value="0">
      <div id="edit-secret-wrap" style="display:none;margin-top:8px;">
        <input class="form-input" id="edit-password" type="password" placeholder="새 비밀번호 (변경 시에만 입력)" autocomplete="new-password">
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">비워두면 기존 비밀번호 유지</div>
      </div>

      <!-- 버튼 -->
      <div style="height:28px;"></div>
      <div style="display:flex;gap:10px;">
        <button class="btn-teal" onclick="App.saveEditChannel()" style="flex:1;">저장</button>
        <button class="btn-ghost" onclick="App.closeModal('modal-edit')" style="flex:1;">취소</button>
      </div>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 알람 설정 전체화면 ══ -->
<div class="modal-overlay" id="modal-alarm" style="z-index:400;">
  <div class="modal-sheet" style="max-height:92vh;display:flex;flex-direction:column;padding:0;">
    <div class="modal-handle"></div>
    <!-- 헤더 -->
    <div style="display:flex;align-items:center;gap:6px;padding:4px 16px 12px;flex-shrink:0;">
      <button onclick="App.closeModal('modal-alarm')" style="background:none;border:none;color:var(--text);font-size:20px;cursor:pointer;padding:6px;margin-right:4px;"><i class="fas fa-arrow-left"></i></button>
      <span id="alarm-modal-title" style="font-size:17px;font-weight:700;flex:1;">알람 설정</span>
    </div>

  <!-- 스크롤 영역 -->
  <div style="flex:1;overflow-y:auto;padding-bottom:8px;">

    <!-- 기존 알람 목록 -->
    <div class="alarm-section-card" id="alarm-list-section" style="display:none;">
      <div class="alarm-section-title">설정된 알람</div>
      <div id="alarm-list-body" style="padding:0 14px 14px;"></div>
    </div>

    <!-- 콘텐츠 선택 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">콘텐츠 선택</div>
      <div style="padding:0 14px 14px;display:flex;flex-direction:column;gap:10px;">

      <!-- YouTube 행 -->
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="App.selectMsgSrc('youtube')" title="YouTube 앱 열기"
          style="flex-shrink:0;width:44px;height:44px;border:none;border-radius:12px;
                 background:#FF0000;color:#fff;font-size:20px;cursor:pointer;
                 display:flex;align-items:center;justify-content:center;">
          <i class="fab fa-youtube"></i>
        </button>
        <div style="flex:1;position:relative;display:flex;align-items:center;">
          <input id="alarm-youtube-url" type="text"
            placeholder="YouTube URL 붙여넣기 (https://youtube.com/...)"
            class="form-input" style="margin:0;width:100%;padding-right:36px;
            direction:rtl;text-align:left;unicode-bidi:plaintext;"
            oninput="App._onYoutubeUrlInput()">
          <button id="alarm-youtube-clear" onclick="App._clearYoutubeUrl()"
            style="display:none;position:absolute;right:8px;width:22px;height:22px;border:none;
                   border-radius:50%;background:rgba(255,59,48,0.18);color:#FF3B30;
                   font-size:13px;font-weight:bold;cursor:pointer;
                   align-items:center;justify-content:center;">✕</button>
        </div>
      </div>

      <!-- 파일 행: label for="alarm-attach-file" 로 직접 연결 (웹 환경), Flutter는 FlutterBridge로 처리 -->
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="App.selectMsgSrc('file')" title="파일 선택"
          style="flex-shrink:0;width:44px;height:44px;border:none;border-radius:12px;
                 background:#2196F3;color:#fff;font-size:20px;cursor:pointer;
                 display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-folder-open"></i>
        </button>
        <div id="alarm-file-display"
          style="flex:1;height:44px;border-radius:10px;background:var(--card2);
                 border:1px solid var(--border);display:flex;align-items:center;
                 padding:0 10px;gap:8px;color:var(--text3);font-size:13px;">
          <span id="alarm-file-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            파일을 선택하세요 (오디오/비디오)
          </span>
          <button id="alarm-file-clear" onclick="App._clearFilePreview('alarm-file-preview','file')"
            style="display:none;flex-shrink:0;width:22px;height:22px;border:none;
                   border-radius:50%;background:rgba(255,59,48,0.18);color:#FF3B30;
                   font-size:13px;font-weight:bold;cursor:pointer;
                   align-items:center;justify-content:center;">✕</button>
        </div>
        <input id="alarm-attach-file" type="file"
          accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.wma,.mp4,.mov,.mkv,.avi,.wmv,.m4v,.webm"
          style="display:none;" onchange="App.onAlarmFileSelected(this,'file')">
      </div><!-- /파일 행 -->
      </div><!-- /padding wrapper -->

      <!-- 하위 호환용 숨김 영역 -->
      <div id="alarm-area-youtube" style="display:none;"></div>
      <div id="alarm-area-file"    style="display:none;">
        <div id="alarm-file-preview" class="alarm-media-preview" style="display:none;"></div>
      </div>
      <div id="alarm-area-audio" style="display:none;">
        <input id="alarm-audio-file" type="file" accept="audio/*" style="display:none;" onchange="App.onAlarmFileSelected(this,'audio')">
        <div id="alarm-audio-preview" class="alarm-media-preview" style="display:none;"></div>
      </div>
      <div id="alarm-area-video" style="display:none;">
        <input id="alarm-video-file" type="file" accept="video/*" style="display:none;" onchange="App.onAlarmFileSelected(this,'video')">
        <div id="alarm-video-preview" class="alarm-media-preview" style="display:none;"></div>
      </div>

    </div>

    <!-- 연결 URL 섹션 -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">연결 URL</div>
      <div style="padding:0 14px 14px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex-shrink:0;width:44px;height:44px;border-radius:12px;background:#FF6B35;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-link"></i>
          </div>
          <div style="flex:1;position:relative;display:flex;align-items:center;">
            <input id="alarm-link-url" type="url"
              placeholder="https://"
              class="form-input" style="margin:0;width:100%;padding-right:36px;
              direction:rtl;text-align:left;unicode-bidi:plaintext;"
              oninput="App._onAlarmLinkUrlInput()">
            <button id="alarm-link-clear" onclick="App._clearAlarmLinkUrl()"
              style="display:none;position:absolute;right:8px;width:22px;height:22px;border:none;
                     border-radius:50%;background:rgba(255,59,48,0.18);color:#FF3B30;
                     font-size:13px;font-weight:bold;cursor:pointer;
                     align-items:center;justify-content:center;">✕</button>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text2);padding-left:4px;">
          <input type="checkbox" id="alarm-link-same-as-homepage"
            style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;"
            onchange="App._onAlarmLinkHomepageCheck(this)">
          홈페이지와 동일
        </label>
      </div>
    </div>

    <!-- 날짜/시간 통합 선택 (한 줄) -->
    <div class="alarm-section-card">
      <div class="alarm-section-title">날짜 / 시간 선택</div>
      <div class="alarm-datetime-row" onclick="App.openDateTimePicker()">
        <div class="alarm-datetime-icon"><i class="fas fa-clock"></i></div>
        <div class="alarm-datetime-text">
          <span class="alarm-datetime-date" id="alarm-date-label">날짜 선택</span>
          <span class="alarm-datetime-sep">·</span>
          <span class="alarm-datetime-time" id="alarm-time-label">오전 09:00</span>
        </div>
        <div style="font-size:16px;color:var(--text3);flex-shrink:0;"><i class="fas fa-chevron-down"></i></div>
      </div>
    </div>

  </div><!-- /스크롤 -->

  <!-- 날짜/시간 통합 팝업 (modal-alarm 내부, 절대위치) -->
  <div id="modal-date-picker"
    style="display:none;position:absolute;inset:0;z-index:100;
           background:rgba(0,0,0,0.75);align-items:center;justify-content:center;overflow-y:auto;">
    <div style="background:var(--bg);border-radius:20px;width:320px;max-width:92vw;max-height:90vh;overflow-y:auto;margin:auto;">
      <!-- 팝업 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--border);">
        <span style="font-size:17px;font-weight:700;color:var(--text);">날짜 / 시간 선택</span>
        <button onclick="App.closeDateTimePicker()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer;line-height:1;">×</button>
      </div>

      <!-- 달력 섹션 -->
      <div class="dt-picker-section">
        <div class="dt-picker-section-title">날짜</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <button onclick="App._calMove(-1)" class="cal-nav-btn"><i class="fas fa-chevron-left"></i></button>
          <span id="cal-month-label" style="font-size:15px;font-weight:700;color:var(--text);"></span>
          <button onclick="App._calMove(1)" class="cal-nav-btn"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-bottom:4px;">
          <div style="font-size:11px;font-weight:600;color:#FF6B6B;padding:4px 0;">일</div>
          <div style="font-size:11px;font-weight:600;color:var(--text3);padding:4px 0;">월</div>
          <div style="font-size:11px;font-weight:600;color:var(--text3);padding:4px 0;">화</div>
          <div style="font-size:11px;font-weight:600;color:var(--text3);padding:4px 0;">수</div>
          <div style="font-size:11px;font-weight:600;color:var(--text3);padding:4px 0;">목</div>
          <div style="font-size:11px;font-weight:600;color:var(--text3);padding:4px 0;">금</div>
          <div style="font-size:11px;font-weight:600;color:#6B9FFF;padding:4px 0;">토</div>
        </div>
        <div id="cal-days-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;"></div>
      </div>

      <!-- 시간 섹션 -->
      <div class="dt-picker-section">
        <div class="dt-picker-section-title">시간</div>
        <div class="dt-time-row">
          <!-- 오전/오후 -->
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button id="dt-btn-am" class="dt-ampm-btn active" onclick="App._setAmPm('am')">오전</button>
            <button id="dt-btn-pm" class="dt-ampm-btn" onclick="App._setAmPm('pm')">오후</button>
          </div>
          <!-- 시 -->
          <div class="dt-time-col">
            <button class="dt-time-spin" onclick="App._dtChangeHour(1)"><i class="fas fa-chevron-up"></i></button>
            <div class="dt-time-val" id="dt-hour" onclick="App._dtInputHour()" style="cursor:pointer;" title="클릭하여 직접 입력">09</div>
            <button class="dt-time-spin" onclick="App._dtChangeHour(-1)"><i class="fas fa-chevron-down"></i></button>
          </div>
          <div style="font-size:26px;font-weight:700;color:var(--text2);padding-bottom:6px;">:</div>
          <!-- 분 -->
          <div class="dt-time-col">
            <button class="dt-time-spin" onclick="App._dtChangeMin(5)"><i class="fas fa-chevron-up"></i></button>
            <div class="dt-time-val" id="dt-min" onclick="App._dtInputMin()" style="cursor:pointer;" title="클릭하여 직접 입력">00</div>
            <button class="dt-time-spin" onclick="App._dtChangeMin(-5)"><i class="fas fa-chevron-down"></i></button>
          </div>
        </div>
      </div>

      <!-- 확인/취소 버튼 -->
      <div style="display:flex;gap:10px;padding:16px;">
        <button onclick="App.closeDateTimePicker()" style="flex:1;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--bg3);color:var(--text2);font-size:15px;font-weight:600;cursor:pointer;">취소</button>
        <button onclick="App.confirmDateTime()" style="flex:2;padding:13px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-size:15px;font-weight:700;cursor:pointer;">확인</button>
      </div>
    </div>
  </div>

  <!-- 하단 고정 버튼 -->
  <div class="alarm-bottom-btns" style="flex-shrink:0;">
    <button class="btn-alarm-cancel" onclick="App.closeModal('modal-alarm')">취소</button>
    <button class="btn-alarm-done"   onclick="App.saveAlarmSetting()">확인</button>
  </div>
  </div>
</div>

<!-- ══ 풀스크린: 개인정보보호정책 ══ -->
<div class="fullscreen-overlay" id="modal-privacy">
  <div class="appbar" style="display:flex;">
    <div class="appbar-left">
      <button class="appbar-back" onclick="App.closePrivacy()"><i class="fas fa-arrow-left"></i></button>
    </div>
    <span style="font-size:17px;font-weight:700;color:#fff;flex:1;text-align:center;">개인정보보호정책</span>
    <div style="width:38px;"></div>
  </div>
  <div style="flex:1;overflow-y:auto;padding:20px 16px;">
    <div id="privacy-content" style="font-size:14px;color:var(--text2);line-height:1.8;white-space:pre-wrap;">불러오는 중...</div>
  </div>
</div>

<!-- ══ 풀스크린: 서비스 이용약관 ══ -->
<div class="fullscreen-overlay" id="modal-terms">
  <div class="appbar" style="display:flex;">
    <div class="appbar-left">
      <button class="appbar-back" onclick="App.closeTerms()"><i class="fas fa-arrow-left"></i></button>
    </div>
    <span style="font-size:17px;font-weight:700;color:#fff;flex:1;text-align:center;">서비스 이용약관</span>
    <div style="width:38px;"></div>
  </div>
  <div style="flex:1;overflow-y:auto;padding:20px 16px;">
    <div id="terms-content" style="font-size:14px;color:var(--text2);line-height:1.8;white-space:pre-wrap;">불러오는 중...</div>
  </div>
</div>

<!-- ══ 모달: 초대코드 ══ -->
<div class="modal-overlay" id="modal-invite" style="z-index:400;">
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
      <div id="join-password-wrap" style="display:none;">
        <label class="form-label" style="margin-top:8px;">🔒 비밀번호</label>
        <input class="form-input" id="join-password" type="password" placeholder="채널 비밀번호를 입력하세요">
      </div>
      <button class="btn-teal" onclick="App.joinChannel()">참여하기</button>
      <button class="btn-ghost" onclick="App.closeModal('modal-join')">취소</button>
      <div style="height:8px;"></div>
    </div>
  </div>
</div>

<!-- ══ 모달: 이미지 소스 선택 ══ -->
<div class="modal-overlay" id="modal-img-src" style="z-index:600;">
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
<div class="fullscreen-overlay" id="modal-channel-detail" style="z-index:350;"></div>

<!-- 비밀채널 비밀번호 입력 모달 -->
<div class="modal-overlay" id="modal-secret-pw" style="align-items:center;z-index:500;">
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px 20px;width:calc(100% - 48px);max-width:360px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <span style="font-size:20px;">🔒</span>
      <span style="font-weight:700;font-size:16px;color:var(--text);">비밀번호 확인</span>
    </div>
    <p style="color:var(--text-sub);font-size:13px;margin-bottom:14px;">비밀채널에 참여하려면 비밀번호를 입력하세요.</p>
    <input id="secret-pw-input" type="password" placeholder="비밀번호를 입력하세요"
      style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--text);font-size:15px;box-sizing:border-box;outline:none;"
      onkeydown="if(event.key==='Enter')App.confirmSecretPw()" />
    <p id="secret-pw-error" style="color:#EF4444;font-size:12px;margin-top:8px;display:none;"></p>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button onclick="App.cancelSecretPw()"
        style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text-sub);font-size:14px;cursor:pointer;">취소</button>
      <button onclick="App.confirmSecretPw()"
        style="flex:1;padding:11px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:600;font-size:14px;cursor:pointer;">확인</button>
    </div>
  </div>
</div>

<script src="/static/mobile-app.js?v=202603142000"></script>
</body>
</html>`;
