// lib/screens/home_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import 'create_channel_screen.dart';
import 'join_channel_screen.dart';
import 'channel_detail_screen.dart';
import '../utils/toast_helper.dart';

const _bg       = Color(0xFF121212);
const _bg2      = Color(0xFF1E1E2E);
const _bg3      = Color(0xFF2A2A3E);
const _primary  = Color(0xFF6C63FF);
const _teal     = Color(0xFF1DE9B6);
const _text     = Colors.white;
const _text2    = Color(0xFFB0B0C8);
const _border   = Color(0xFF3A3A55);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Map<String, dynamic>> _owned  = [];
  List<Map<String, dynamic>> _joined = [];
  bool _loading = true;
  bool _showAllOwned  = false;
  bool _showAllJoined = false;

  static const int _previewCount = 3;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final owned  = await ApiService.getMyOwnedChannels();
    final joined = await ApiService.getMyChannels();
    if (!mounted) return;
    setState(() {
      _owned  = owned;
      _joined = joined;
      _loading = false;
    });
  }

  // ─── 채널 만들기 ───────────────────────────────
  void _goCreate() async {
    final ok = await Navigator.push<bool>(
      context, MaterialPageRoute(builder: (_) => const CreateChannelScreen()));
    if (ok == true) _load();
  }

  // ─── 채널 참여 바텀시트 ──────────────────────
  void _showJoinDialog() {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            decoration: const BoxDecoration(
              color: Color(0xFF1E1E2E),
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 핸들바
                Center(
                  child: Container(
                    width: 36, height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[600],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // 타이틀
                const Text('채널 참여',
                    style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                // 라벨
                Text('초대 코드 또는 초대 링크',
                    style: TextStyle(color: _text2, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                // 입력창
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '코드 또는 URL 붙여넣기',
                    hintStyle: TextStyle(color: Colors.grey[500]),
                    filled: true,
                    fillColor: const Color(0xFF2A2A3E),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                // 참여하기 버튼
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF6C63FF),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    onPressed: () {
                      final input = ctrl.text.trim();
                      if (input.isEmpty) return;
                      String token = input;
                      if (input.contains('/join/')) token = input.split('/join/').last.split('?').first;
                      else if (input.startsWith('http')) token = Uri.parse(input).pathSegments.last;
                      Navigator.pop(ctx);
                      Navigator.push(context,
                        MaterialPageRoute(builder: (_) => JoinChannelScreen(inviteToken: token)),
                      ).then((_) => _load());
                    },
                    child: const Text('참여하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: 10),
                // 취소 버튼
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: _text2,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: BorderSide(color: Colors.grey[700]!),
                      ),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('취소', style: TextStyle(fontSize: 15)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // ─── 드로어 ────────────────────────────────────
  void _openDrawer(BuildContext ctx) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _DrawerSheet(
        onCreateChannel: () { Navigator.pop(ctx); _goCreate(); },
        onJoinChannel:   () { Navigator.pop(ctx); _showJoinDialog(); },
        onRefresh:       () { Navigator.pop(ctx); _load(); },
      ),
    );
  }

  // ─── 알람 설정 시트 ────────────────────────────
  void _openAlarmSheet(Map<String, dynamic> ch) {
    final chId = ch['id'];
    showModalBottomSheet(
      context: context,
      backgroundColor: _bg2,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AlarmSheet(channelId: chId, channelName: ch['name'] ?? '채널'),
    );
  }

  // ─── 초대코드 시트 ─────────────────────────────
  void _openInviteSheet(Map<String, dynamic> ch) {
    final chId = ch['id'] as int;
    showModalBottomSheet(
      context: context,
      backgroundColor: _bg2,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _InviteSheet(channelId: chId, channelName: ch['name'] ?? '채널'),
    );
  }

  // ─── 채널 설정 시트 ────────────────────────────
  void _openSettingSheet(Map<String, dynamic> ch) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: _bg2,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ChannelSettingSheet(
        channel: ch,
        onSaved: () { Navigator.pop(context); _load(); },
        onDeleted: () { Navigator.pop(context); _load(); },
      ),
    );
  }

  // ─── 빌드 ──────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _primary,
        elevation: 0,
        title: Row(children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.notifications_active, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Text('RinGo',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.menu, color: Colors.white, size: 26),
            onPressed: () => _openDrawer(context),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : RefreshIndicator(
              onRefresh: _load,
              color: _primary,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ─ 나의 운영채널 ─
                    _sectionHeader('나의 운영채널', '+ 채널 만들기', _goCreate),
                    if (_owned.isEmpty)
                      _emptyBox('운영 중인 채널이 없습니다.\n채널을 만들어 보세요!')
                    else ...[
                      ...(_showAllOwned ? _owned : _owned.take(_previewCount))
                          .map((ch) => _ownedTile(ch)),
                      if (_owned.length > _previewCount)
                        _moreBtn(
                          show: _showAllOwned,
                          count: _owned.length - _previewCount,
                          onTap: () => setState(() => _showAllOwned = !_showAllOwned),
                        ),
                    ],

                    const SizedBox(height: 8),
                    Divider(color: _border, thickness: 1, indent: 16, endIndent: 16),

                    // ─ 나의 가입채널 ─
                    _sectionHeader('나의 가입채널', '+ 채널 참여', _showJoinDialog),
                    if (_joined.isEmpty)
                      _emptyBox('가입한 채널이 없습니다.\n초대 링크로 참여해 보세요!')
                    else ...[
                      ...(_showAllJoined ? _joined : _joined.take(_previewCount))
                          .map((ch) => _joinedTile(ch)),
                      if (_joined.length > _previewCount)
                        _moreBtn(
                          show: _showAllJoined,
                          count: _joined.length - _previewCount,
                          onTap: () => setState(() => _showAllJoined = !_showAllJoined),
                        ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
    );
  }

  // ── 섹션 헤더 ──
  Widget _sectionHeader(String title, String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title,
              style: const TextStyle(
                  color: _text, fontSize: 16, fontWeight: FontWeight.bold)),
          GestureDetector(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                  color: _bg3,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _primary.withOpacity(0.5))),
              child: Text(label,
                  style: const TextStyle(
                      color: _primary, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  // ── 빈 박스 ──
  Widget _emptyBox(String msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(12)),
        child: Text(msg,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[500], fontSize: 13, height: 1.5)),
      ),
    );
  }

  // ── 더보기 버튼 ──
  Widget _moreBtn({required bool show, required int count, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
            color: _bg2,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _border)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(show ? Icons.expand_less : Icons.add_circle_outline,
                color: _primary, size: 18),
            const SizedBox(width: 6),
            Text(
              show ? '접기' : '+ 더보기 (${count}개 더)',
              style: const TextStyle(
                  color: _primary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  // ── 운영채널 타일 (▶ < ⚙) ──
  Widget _ownedTile(Map<String, dynamic> ch) {
    final name            = ch['name'] ?? '채널';
    final subCnt          = ch['subscriber_count'] ?? 0;
    final desc            = ch['description'] ?? '';
    final chId            = ch['id'];
    final pendingAlarms   = (ch['pending_alarm_count'] ?? 0) as num;
    final hasAlarm        = pendingAlarms > 0;
    final alarmColor      = hasAlarm ? _teal : Colors.grey;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Container(
        decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            // 아바타
            Padding(
              padding: const EdgeInsets.all(12),
              child: _avatar(name, ch['image_url'], 44),
            ),
            // 채널명 + 구독수
            Expanded(
              child: GestureDetector(
                onTap: () {
                  if (chId != null) {
                    Navigator.push(context,
                      MaterialPageRoute(builder: (_) =>
                        ChannelDetailScreen(channelId: chId?.toString() ?? '', isOwner: true)));
                  }
                },
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$name ($subCnt)',
                        style: const TextStyle(
                            color: _text, fontWeight: FontWeight.w600, fontSize: 14)),
                    if (desc.isNotEmpty)
                      Text(desc,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: _text2, fontSize: 12)),
                  ],
                ),
              ),
            ),
            // ▶ 알람설정 (알람 있으면 teal, 없으면 grey)
            _actionBtn(
              icon: Icons.alarm_rounded,
              color: alarmColor,
              onTap: () => _openAlarmSheet(ch),
            ),
            // < 초대코드
            _actionBtn(
              icon: Icons.share_rounded,
              color: const Color(0xFF9C27B0),
              onTap: () => _openInviteSheet(ch),
            ),
            // ⚙ 설정
            _actionBtn(
              icon: Icons.settings_rounded,
              color: Colors.grey,
              onTap: () => _openSettingSheet(ch),
            ),
            const SizedBox(width: 6),
          ],
        ),
      ),
    );
  }

  Widget _actionBtn({required IconData icon, required Color color, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34, height: 34,
        margin: const EdgeInsets.only(left: 4),
        decoration: BoxDecoration(
            color: color.withOpacity(0.15),
            borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, color: color, size: 18),
      ),
    );
  }

  // ── 가입채널 타일 ──
  Widget _joinedTile(Map<String, dynamic> ch) {
    final name  = ch['channel_name'] ?? ch['name'] ?? '채널';
    final chId  = ch['channel_id'] ?? ch['id'];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: GestureDetector(
        onTap: () {
          if (chId != null) {
            Navigator.push(context,
              MaterialPageRoute(builder: (_) =>
                ChannelDetailScreen(channelId: chId?.toString() ?? '', isOwner: false)));
          }
        },
        child: Container(
          decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(12)),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
            leading: _avatar(name, ch['image_url'], 44),
            title: Text(name,
                style: const TextStyle(color: _text, fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: const Text('구독 중', style: TextStyle(color: _text2, fontSize: 12)),
            trailing: const Icon(Icons.chevron_right, color: _text2),
          ),
        ),
      ),
    );
  }

  // ── 아바타 ──
  Widget _avatar(String name, String? imageUrl, double size) {
    final colors = [_primary, const Color(0xFFE91E63), const Color(0xFF4CAF50),
                    const Color(0xFF2196F3), const Color(0xFFFF9800), const Color(0xFF9C27B0)];
    final c = colors[name.codeUnitAt(0) % colors.length];
    final init = name.isNotEmpty ? name.substring(0, 1).toUpperCase() : 'C';
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
          color: c.withOpacity(0.2), borderRadius: BorderRadius.circular(size * 0.25)),
      clipBehavior: Clip.antiAlias,
      child: imageUrl != null && imageUrl.isNotEmpty
          ? Image.network(imageUrl, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Center(
                child: Text(init, style: TextStyle(color: c, fontWeight: FontWeight.bold, fontSize: size * 0.42))))
          : Center(
              child: Text(init, style: TextStyle(color: c, fontWeight: FontWeight.bold, fontSize: size * 0.42))),
    );
  }
}

// ══════════════════════════════════════════════
// 드로어 시트
// ══════════════════════════════════════════════
class _DrawerSheet extends StatelessWidget {
  final VoidCallback onCreateChannel;
  final VoidCallback onJoinChannel;
  final VoidCallback onRefresh;

  const _DrawerSheet({
    required this.onCreateChannel,
    required this.onJoinChannel,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      _DrawerItem(icon: Icons.campaign_rounded,      label: '나의 운영채널', onTap: onRefresh),
      _DrawerItem(icon: Icons.add_circle_outline,    label: '채널 만들기',   onTap: onCreateChannel),
      _DrawerItem(icon: Icons.subscriptions_outlined, label: '나의 가입채널', onTap: onRefresh),
      _DrawerItem(icon: Icons.group_add_outlined,    label: '채널 참여',     onTap: onJoinChannel),
      _DrawerItem(icon: Icons.privacy_tip_outlined,  label: '개인정보보호정책',
          onTap: () { Navigator.pop(context); }),
      _DrawerItem(icon: Icons.info_outline,          label: '버전 v1.0.49',
          onTap: () { Navigator.pop(context); }),
    ];

    return Container(
      decoration: const BoxDecoration(
        color: _bg2,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4,
              decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Row(children: [
              const Icon(Icons.notifications_active, color: _primary, size: 22),
              const SizedBox(width: 10),
              const Text('RinGo',
                  style: TextStyle(color: _text, fontSize: 18, fontWeight: FontWeight.bold)),
            ]),
          ),
          const Divider(color: _border, height: 1),
          ...items.map((item) => ListTile(
            leading: Icon(item.icon, color: _text2, size: 22),
            title: Text(item.label,
                style: const TextStyle(color: _text, fontSize: 15)),
            trailing: const Icon(Icons.chevron_right, color: _border, size: 18),
            onTap: item.onTap,
          )),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _DrawerItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _DrawerItem({required this.icon, required this.label, required this.onTap});
}

// ══════════════════════════════════════════════
// 알람 설정 시트
// ══════════════════════════════════════════════
class _AlarmSheet extends StatefulWidget {
  final int channelId;
  final String channelName;
  const _AlarmSheet({required this.channelId, required this.channelName});

  @override
  State<_AlarmSheet> createState() => _AlarmSheetState();
}

class _AlarmSheetState extends State<_AlarmSheet> {
  bool _alarmOn = true;
  String _selectedSrc = 'youtube';
  DateTime _selectedDate = DateTime.now();
  int _hour = 9, _min = 0;
  final _urlCtrl = TextEditingController();

  // ── 파일 첨부 관련 상태 ──
  File?   _pickedFile;        // 선택된 파일
  String? _pickedFileName;    // 파일명 표시용
  int?    _uploadedFileId;    // 업로드 후 받은 file_id
  String? _processedUrl;      // 변환 완료 URL (알람에 저장할 값)
  String  _uploadStatus = ''; // UI 상태 메시지
  bool    _isUploading  = false;

  // 허용 확장자
  static const _allowedVideoExts = ['mp4', 'mov'];
  static const _allowedAudioExts = ['mp3', 'm4a', 'wav'];
  static const _maxFileSizeBytes = 10 * 1024 * 1024; // 10MB

  final _sources = [
    {'id': 'youtube', 'label': 'YouTube URL',  'icon': Icons.play_circle_fill, 'color': Color(0xFFFF0000)},
    {'id': 'audio',   'label': '오디오 파일',    'icon': Icons.headset,          'color': Color(0xFF4CAF50)},
    {'id': 'video',   'label': '비디오 파일',    'icon': Icons.movie,            'color': Color(0xFF2196F3)},
  ];

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedDate = DateTime(now.year, now.month, now.day);
    _hour = now.hour;
    _min  = ((now.minute ~/ 5) + 1) * 5 % 60;
  }

  @override
  void dispose() { _urlCtrl.dispose(); super.dispose(); }

  // ── 파일 선택 ─────────────────────────────────────────────────
  Future<void> _pickFile() async {
    // FileType.any 로 열고 앱 코드에서 확장자 직접 검사
    // FileType.custom + allowedExtensions 는 삼성 등 일부 Android 기기에서
    // m4a 파일 선택을 OS 레벨에서 차단하는 버그가 있음
    final result = await FilePicker.platform.pickFiles(
      type:          FileType.any,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;

    final pf  = result.files.first;
    final ext = (pf.name.split('.').last).toLowerCase();
    final size = pf.size;

    // 디버그 로그 — m4a 가 어떤 타입으로 들어오는지 확인
    debugPrint('[_pickFile] name=${pf.name}  ext=$ext  extension=${pf.extension}  size=$size  path=${pf.path}');

    // 확장자 검증 (앱 코드에서 직접)
    final allExts = [..._allowedVideoExts, ..._allowedAudioExts];
    if (!allExts.contains(ext)) {
      if (mounted) {
        showCenterToast(context, '허용되지 않는 형식입니다. (mp4, mov, mp3, m4a, wav)\n선택한 파일: ${pf.name}');
      }
      return;
    }

    // 파일 크기 검증
    if (size > _maxFileSizeBytes) {
      if (mounted) {
        showCenterToast(context, '파일 크기가 10MB를 초과합니다 (${(size / 1024 / 1024).toStringAsFixed(1)}MB)');
      }
      return;
    }

    setState(() {
      _pickedFile     = File(pf.path!);
      _pickedFileName = pf.name;
      _uploadedFileId = null;
      _processedUrl   = null;
      _uploadStatus   = '파일 선택됨';
      _isUploading    = false;
    });
  }

  // ── Firebase Storage 직접 업로드 + 변환 대기 ─────────────────
  Future<void> _uploadFile() async {
    if (_pickedFile == null || _pickedFileName == null) return;

    final prefs        = await SharedPreferences.getInstance();
    final sessionToken = prefs.getString('session_token') ?? '';
    if (sessionToken.isEmpty) {
      if (mounted) showCenterToast(context, '로그인이 필요합니다');
      return;
    }

    setState(() { _isUploading = true; _uploadStatus = '[1/4] 업로드 준비 중...'; });

    try {
      final fileSize = await _pickedFile!.length();
      print('[_uploadFile] 시작: fileName=$_pickedFileName fileSize=$fileSize');

      // ── 1단계: 서버에서 Upload URL + file_id 발급 ──────────────
      if (mounted) setState(() => _uploadStatus = '[1/4] 서버에서 업로드 URL 발급 중...');
      final prepareResult = await ApiService.prepareFileUpload(
        sessionToken: sessionToken,
        fileName:     _pickedFileName!,
        fileSize:     fileSize,
      );
      print('[_uploadFile] 1단계 결과: $prepareResult');
      if (prepareResult['success'] != true) {
        throw Exception('[1단계 실패] ${prepareResult['error'] ?? '업로드 준비 실패'}');
      }

      final fileId      = prepareResult['file_id']       as int;
      final uploadUrl   = prepareResult['upload_url']    as String;
      final contentType = prepareResult['content_type']  as String;
      final bucket      = prepareResult['bucket']        as String;
      final origPath    = prepareResult['original_path'] as String;
      print('[_uploadFile] fileId=$fileId bucket=$bucket origPath=$origPath');

      // ── 2단계: Firebase Storage 직접 PUT 업로드 ────────────────
      if (mounted) setState(() => _uploadStatus = '[2/4] Firebase Storage 업로드 중...');
      final uploadOk = await ApiService.uploadFileToStorage(
        uploadUrl:   uploadUrl,
        file:        _pickedFile!,
        contentType: contentType,
      );
      print('[_uploadFile] 2단계 결과: uploadOk=$uploadOk');
      if (!uploadOk) {
        throw Exception('[2단계 실패] Firebase Storage 업로드 실패\n(contentType=$contentType)');
      }

      // ── 3단계: 서버에 완료 신호 전송 → status=processing ───────
      if (mounted) setState(() => _uploadStatus = '[3/4] 서버에 업로드 완료 신호 전송 중...');
      final encodedPath = Uri.encodeComponent(origPath);
      final originalUrl = 'https://firebasestorage.googleapis.com/v0/b/$bucket/o/$encodedPath?alt=media';
      print('[_uploadFile] 3단계 originalUrl=$originalUrl');

      final completeResult = await ApiService.completeFileUpload(
        sessionToken: sessionToken,
        fileId:       fileId,
        originalUrl:  originalUrl,
      );
      print('[_uploadFile] 3단계 결과: $completeResult');
      if (completeResult['success'] != true) {
        throw Exception('[3단계 실패] ${completeResult['error'] ?? '완료 신호 전송 실패'}');
      }

      if (mounted) setState(() {
        _uploadedFileId = fileId;
        _uploadStatus   = '[4/4] ffmpeg 변환 중... (최대 1~2분 소요)';
      });

      // ── 4단계: 변환 완료까지 폴링 (최대 120초) ──────────────────
      final finalStatus = await ApiService.waitForFileReady(
        sessionToken:   sessionToken,
        fileId:         fileId,
        timeoutSec:     120,
        onStatusChange: (s) {
          print('[_uploadFile] 4단계 폴링 status=$s');
          if (mounted) setState(() {
            _uploadStatus = switch (s) {
              'processing' => '[4/4] ffmpeg 변환 중...',
              'ready'      => '[4/4] 변환 완료!',
              'failed'     => '[4/4] 변환 실패',
              _            => '[4/4] $s',
            };
          });
        },
      );

      print('[_uploadFile] 최종 상태: $finalStatus');
      if (finalStatus == null) {
        throw Exception('[4단계 실패] 변환 시간 초과 (120초). 잠시 후 다시 시도해 주세요.');
      }
      if (finalStatus.isFailed) {
        throw Exception('[4단계 실패] ${finalStatus.errorMessage ?? '파일 변환 실패'}');
      }

      // ── 완료 ────────────────────────────────────────────────────
      print('[_uploadFile] 완료! processedUrl=${finalStatus.processedUrl}');
      if (mounted) setState(() {
        _processedUrl = finalStatus.processedUrl;
        _uploadStatus = '✅ 변환 완료 (${finalStatus.durationSec?.toStringAsFixed(1) ?? '?'}초)';
        _isUploading  = false;
      });

    } catch (e) {
      print('[_uploadFile] 오류: $e');
      if (mounted) {
        setState(() {
          _uploadStatus = '❌ $e';
          _isUploading  = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // 앱바
            Container(
              color: _primary,
              padding: const EdgeInsets.fromLTRB(4, 12, 16, 12),
              child: Row(children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
                Expanded(
                  child: Text('${widget.channelName} · 알람 설정',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                // ON/OFF 토글
                GestureDetector(
                  onTap: () => setState(() => _alarmOn = !_alarmOn),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 48, height: 26,
                    decoration: BoxDecoration(
                      color: _alarmOn ? _teal : _border,
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: AnimatedAlign(
                      duration: const Duration(milliseconds: 200),
                      alignment: _alarmOn ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        width: 20, height: 20,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                ),
              ]),
            ),

            Expanded(
              child: ListView(
                controller: ctrl,
                padding: const EdgeInsets.all(0),
                children: [
                  // ─ 메시지 소스 ─
                  _card(
                    title: '메시지 소스',
                    child: Column(children: [
                      GridView.count(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        crossAxisCount: 2,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.6,
                        padding: const EdgeInsets.all(14),
                        children: _sources.map((s) {
                          final sel = _selectedSrc == s['id'];
                          return GestureDetector(
                            onTap: () => setState(() => _selectedSrc = s['id'] as String),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              decoration: BoxDecoration(
                                color: sel ? (s['color'] as Color).withOpacity(0.15) : _bg3,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: sel ? (s['color'] as Color) : _border,
                                  width: sel ? 1.5 : 1,
                                ),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(s['icon'] as IconData,
                                      color: s['color'] as Color, size: 28),
                                  const SizedBox(height: 6),
                                  Text(s['label'] as String,
                                      style: TextStyle(
                                          color: sel ? (s['color'] as Color) : _text2,
                                          fontSize: 12, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      if (_selectedSrc == 'youtube')
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                          child: TextField(
                            controller: _urlCtrl,
                            style: const TextStyle(color: _text, fontSize: 13),
                            decoration: InputDecoration(
                              hintText: 'YouTube URL 붙여넣기',
                              hintStyle: const TextStyle(color: _text2, fontSize: 13),
                              filled: true, fillColor: _bg3,
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: const BorderSide(color: _border)),
                              focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: const BorderSide(color: _primary)),
                              prefixIcon: const Icon(Icons.link, color: _primary, size: 18),
                              contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                            ),
                          ),
                        ),
                      // ── 오디오/비디오 파일 첨부 UI ──
                      if (_selectedSrc == 'audio' || _selectedSrc == 'video')
                        _buildFileUploadWidget(),
                    ]),
                  ),

                  // ─ 날짜 선택 ─
                  _card(
                    title: '날짜 선택',
                    child: _DatePickerRow(
                      selected: _selectedDate,
                      onSelect: (d) => setState(() => _selectedDate = d),
                    ),
                  ),

                  // ─ 시간 선택 ─
                  _card(
                    title: '시간 선택',
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _timeSpin(
                            value: _hour,
                            onUp:   () => setState(() => _hour = (_hour + 1) % 24),
                            onDown: () => setState(() => _hour = (_hour - 1 + 24) % 24),
                            label: '시 (0 ~ 23)',
                            min: 0,
                            max: 23,
                            onInput: (v) => setState(() => _hour = v),
                          ),
                          const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: Text(' : ',
                                style: TextStyle(color: _text, fontSize: 32, fontWeight: FontWeight.bold)),
                          ),
                          _timeSpin(
                            value: _min,
                            onUp:   () => setState(() => _min = (_min + 5) % 60),
                            onDown: () => setState(() => _min = (_min - 5 + 60) % 60),
                            label: '분 (0 ~ 59)',
                            min: 0,
                            max: 59,
                            onInput: (v) => setState(() => _min = v),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),
                ],
              ),
            ),

            // 하단 버튼
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                          foregroundColor: _text2,
                          side: const BorderSide(color: _border),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      onPressed: () => Navigator.pop(context),
                      child: const Text('취소', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: _teal,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      onPressed: (_isSaving || _isUploading) ? null : _save,
                      child: _isSaving
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black54),
                            )
                          : const Text('확인', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isSaving = false;

  Future<void> _save() async {
    if (_isSaving) return;

    final dt = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, _hour, _min);
    if (dt.isBefore(DateTime.now())) {
      showCenterToast(context, '현재 시각 이후를 선택하세요');
      return;
    }
    if (_selectedSrc == 'youtube' && _urlCtrl.text.trim().isEmpty) {
      showCenterToast(context, 'YouTube URL을 입력하세요');
      return;
    }
    // YouTube URL https 검증
    final inputUrl = _urlCtrl.text.trim();
    if (_selectedSrc == 'youtube' && inputUrl.isNotEmpty && !inputUrl.startsWith('https://')) {
      showCenterToast(context, '등록이 불가능한 URL 주소입니다. https:// 로 시작하는 주소만 사용할 수 있습니다.');
      return;
    }

    // 파일 타입 검증 — 변환 완료된 URL이 있어야 저장 가능
    if ((_selectedSrc == 'audio' || _selectedSrc == 'video') && _processedUrl == null) {
      showCenterToast(context, _pickedFile == null
              ? '파일을 선택하고 업로드해 주세요'
              : _isUploading
                  ? '변환 처리 중입니다. 잠시 기다려 주세요.'
                  : '파일 업로드 후 변환이 완료되면 저장할 수 있습니다');
      return;
    }

    // msg_value 결정
    final msgValue = (_selectedSrc == 'audio' || _selectedSrc == 'video')
        ? (_processedUrl ?? '')
        : inputUrl;

    // 세션 토큰 확인
    final prefs        = await SharedPreferences.getInstance();
    final sessionToken = prefs.getString('session_token') ?? '';
    if (sessionToken.isEmpty) {
      if (mounted) showCenterToast(context, '로그인이 필요합니다');
      return;
    }

    // 5분 이내 중복 예약 방지 — 기존 pending 알람과 시간 비교
    try {
      final listRes = await http.get(
        Uri.parse('$kBaseUrl/api/alarms?channel_id=${widget.channelId}'),
        headers: {'Authorization': 'Bearer $sessionToken'},
      ).timeout(const Duration(seconds: 8));
      if (listRes.statusCode == 200) {
        final listBody = jsonDecode(listRes.body) as Map<String, dynamic>;
        final alarms = (listBody['data'] as List<dynamic>? ?? [])
            .where((a) => a['status'] == 'pending')
            .toList();
        final newDt = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, _hour, _min);
        for (final a in alarms) {
          final existing = DateTime.tryParse(a['scheduled_at']?.toString() ?? '');
          if (existing != null && existing.difference(newDt).abs() < const Duration(minutes: 5)) {
            final label = '${existing.toLocal().month}/${existing.toLocal().day} '
                '${existing.toLocal().hour.toString().padLeft(2,'0')}:'
                '${existing.toLocal().minute.toString().padLeft(2,'0')}';
            if (mounted) showCenterToast(context, '이미 근접한 시간($label)에 예약된 알람이 있습니다. 5분 이상 간격으로 예약해 주세요.');
            return;
          }
        }
      }
    } catch (_) {} // 사전 체크 실패 시 서버 검증에 위임

    // 저장 중 표시
    setState(() => _isSaving = true);

    try {
      // UTC ISO8601 문자열 변환
      final scheduledAt = dt.toUtc().toIso8601String();

      final result = await ApiService.createAlarm(
        sessionToken: sessionToken,
        channelId:    widget.channelId,
        scheduledAt:  scheduledAt,
        msgType:      _selectedSrc,   // 'youtube' | 'audio' | 'video'
        msgValue:     msgValue,
      );

      if (!mounted) return;

      if (result['success'] == true) {
        Navigator.pop(context);
        showCenterToast(context, '알람 설정 완료 · ${_selectedDate.month}/${_selectedDate.day} '
              '${_hour.toString().padLeft(2,'0')}:${_min.toString().padLeft(2,'0')}');
      } else {
        final errMsg = result['error'] as String? ?? '알람 저장에 실패했습니다';
        showCenterToast(context, errMsg);
      }
    } catch (e) {
      if (mounted) {
        showCenterToast(context, '오류: $e');
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  // ── 파일 업로드 UI 위젯 ─────────────────────────────────────
  Widget _buildFileUploadWidget() {
    final isAudio    = _selectedSrc == 'audio';
    final typeLabel  = isAudio ? '오디오' : '비디오';
    final allowedExt = isAudio
        ? 'mp3, m4a, wav'
        : 'mp4, mov';
    final typeColor  = isAudio ? const Color(0xFF4CAF50) : const Color(0xFF2196F3);

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 허용 형식 안내
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: typeColor.withOpacity(0.08),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: typeColor.withOpacity(0.3)),
            ),
            child: Row(children: [
              Icon(Icons.info_outline, color: typeColor, size: 14),
              const SizedBox(width: 6),
              Expanded(child: Text(
                '허용: $allowedExt  |  최대 10MB  |  최대 30초',
                style: TextStyle(color: typeColor, fontSize: 11),
              )),
            ]),
          ),
          const SizedBox(height: 10),

          // 파일 선택 버튼
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: typeColor,
                  side: BorderSide(color: typeColor.withOpacity(0.6)),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.folder_open, size: 18),
                label: Text(
                  _pickedFileName ?? '$typeLabel 파일 선택',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13),
                ),
                onPressed: _isUploading ? null : _pickFile,
              ),
            ),
            // 파일 선택 후 업로드 버튼 표시
            if (_pickedFile != null && _processedUrl == null && !_isUploading) ...[
              const SizedBox(width: 8),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: typeColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.upload, size: 18),
                label: const Text('업로드', style: TextStyle(fontSize: 13)),
                onPressed: _uploadFile,
              ),
            ],
          ]),

          // 상태 표시
          if (_uploadStatus.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(children: [
              if (_isUploading)
                const SizedBox(
                  width: 14, height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: _primary),
                ),
              if (_isUploading) const SizedBox(width: 8),
              Expanded(child: Text(
                _uploadStatus,
                style: TextStyle(
                  color: _uploadStatus.startsWith('✅')
                      ? _teal
                      : _uploadStatus.startsWith('❌')
                          ? Colors.red
                          : _text2,
                  fontSize: 12,
                ),
              )),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _card({required String title, required Widget child}) {
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 14, 14, 0),
      decoration: BoxDecoration(color: _bg2, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Text(title,
                style: const TextStyle(color: _text, fontSize: 16, fontWeight: FontWeight.bold)),
          ),
          child,
        ],
      ),
    );
  }

  // 숫자 탭 → 직접 입력 다이얼로그
  void _showTimeInputDialog({
    required String label,
    required int current,
    required int min,
    required int max,
    required ValueChanged<int> onConfirm,
  }) {
    final ctrl = TextEditingController(text: current.toString().padLeft(2, '0'));
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1B4B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(label,
            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 2,
          style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
          decoration: InputDecoration(
            counterText: '',
            filled: true,
            fillColor: const Color(0xFF0F0C29),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF6C63FF)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 2),
            ),
            hintText: '$min ~ $max',
            hintStyle: const TextStyle(color: Color(0xFF4B5563), fontSize: 14),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('취소', style: TextStyle(color: Color(0xFF6B7280))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              final v = int.tryParse(ctrl.text) ?? current;
              if (v < min || v > max) {
                showCenterToast(context, '$min ~ $max 사이 값을 입력하세요'),
                      backgroundColor: const Color(0xFFEF4444);
                return;
              }
              onConfirm(v);
              Navigator.pop(ctx);
            },
            child: const Text('확인', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _timeSpin({
    required int value,
    required VoidCallback onUp,
    required VoidCallback onDown,
    required String label,
    required int min,
    required int max,
    required ValueChanged<int> onInput,
  }) {
    return Column(children: [
      IconButton(
        icon: const Icon(Icons.keyboard_arrow_up, color: _text2, size: 28),
        onPressed: onUp,
      ),
      GestureDetector(
        onTap: () => _showTimeInputDialog(
          label: label,
          current: value,
          min: min,
          max: max,
          onConfirm: onInput,
        ),
        child: Container(
          width: 64, height: 56,
          decoration: BoxDecoration(
            color: _bg3,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.4), width: 1),
          ),
          alignment: Alignment.center,
          child: Text(
            value.toString().padLeft(2, '0'),
            style: const TextStyle(color: _text, fontSize: 30, fontWeight: FontWeight.bold),
          ),
        ),
      ),
      IconButton(
        icon: const Icon(Icons.keyboard_arrow_down, color: _text2, size: 28),
        onPressed: onDown,
      ),
    ]);
  }
}

// ── 캘린더 위젯 ──
// ══════════════════════════════════════════════
// 날짜 선택 위젯 - < 3월 5일 (목) > 방식
// ══════════════════════════════════════════════
class _DatePickerRow extends StatelessWidget {
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;
  const _DatePickerRow({required this.selected, required this.onSelect});

  static const _weekDay = ['일', '월', '화', '수', '목', '금', '토'];

  void _prev() {
    final d = selected.subtract(const Duration(days: 1));
    // 오늘 이전 날짜는 선택 불가
    if (d.isBefore(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day))) return;
    onSelect(d);
  }

  void _next() => onSelect(selected.add(const Duration(days: 1)));

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final isToday = selected.year == today.year &&
                    selected.month == today.month &&
                    selected.day == today.day;
    final dayLabel = isToday ? '오늘' : _weekDay[selected.weekday % 7];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // ◀ 이전날
          IconButton(
            icon: const Icon(Icons.chevron_left, color: _text2, size: 28),
            onPressed: _prev,
          ),
          const SizedBox(width: 8),
          // 날짜 표시
          GestureDetector(
            onTap: () async {
              // 탭하면 달력 팝업
              final picked = await showDatePicker(
                context: context,
                initialDate: selected,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
                builder: (ctx, child) => Theme(
                  data: Theme.of(ctx).copyWith(
                    colorScheme: const ColorScheme.dark(
                      primary: _primary,
                      surface: _bg2,
                    ),
                  ),
                  child: child!,
                ),
              );
              if (picked != null) onSelect(picked);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: _bg3,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _primary.withOpacity(0.4)),
              ),
              child: Column(
                children: [
                  Text(
                    '${selected.year}년 ${selected.month}월 ${selected.day}일',
                    style: const TextStyle(
                      color: _text,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    dayLabel,
                    style: TextStyle(
                      color: isToday ? _teal : _text2,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          // ▶ 다음날
          IconButton(
            icon: const Icon(Icons.chevron_right, color: _text2, size: 28),
            onPressed: _next,
          ),
        ],
      ),
    );
  }
}


// ══════════════════════════════════════════════
// 초대코드 시트
// ══════════════════════════════════════════════
class _InviteSheet extends StatefulWidget {
  final int channelId;
  final String channelName;
  const _InviteSheet({required this.channelId, required this.channelName});

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  String? _url;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    final url = await ApiService.getOrCreateInviteUrl(widget.channelId);
    if (!mounted) return;
    setState(() { _url = url; _loading = false; });
  }

  void _copy() {
    if (_url == null) return;
    Clipboard.setData(ClipboardData(text: _url!));
    showCenterToast(context, '클립보드에 복사됐습니다!');
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: Container(width: 40, height: 4,
              decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 18),
          const Text('초대 코드', style: TextStyle(color: _text, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('"${widget.channelName}" 채널의 초대 링크',
              style: const TextStyle(color: _text2, fontSize: 13)),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
                color: _bg3, borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _border)),
            child: _loading
                ? const Center(child: SizedBox(height: 20, width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: _primary)))
                : Text(_url ?? '초대 링크를 생성할 수 없습니다.',
                    style: TextStyle(
                        color: _url != null ? _primary : Colors.red,
                        fontFamily: 'monospace', fontSize: 13)),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('복사'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: _primary, foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: _copy,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기', style: TextStyle(color: _text2)),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════
// 채널 설정 시트
// ══════════════════════════════════════════════
class _ChannelSettingSheet extends StatefulWidget {
  final Map<String, dynamic> channel;
  final VoidCallback onSaved;
  final VoidCallback onDeleted;
  const _ChannelSettingSheet({required this.channel, required this.onSaved, required this.onDeleted});

  @override
  State<_ChannelSettingSheet> createState() => _ChannelSettingSheetState();
}

class _ChannelSettingSheetState extends State<_ChannelSettingSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _descCtrl;
  late final TextEditingController _hpCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.channel['name'] ?? '');
    _descCtrl = TextEditingController(text: widget.channel['description'] ?? '');
    _hpCtrl   = TextEditingController(text: widget.channel['homepage_url'] ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose(); _descCtrl.dispose(); _hpCtrl.dispose();
    super.dispose();
  }

  InputDecoration _dec(String hint) => InputDecoration(
    hintText: hint, hintStyle: const TextStyle(color: _text2, fontSize: 13),
    filled: true, fillColor: _bg3,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _primary)),
    contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
  );

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      showCenterToast(context, '채널명을 입력하세요');
      return;
    }
    // 홈페이지 URL 정규화 (http(s):// 없으면 https:// 자동 추가) + 형식 검증
    final homepage = _hpCtrl.text.trim();
    if (homepage.isNotEmpty) {
      final normalized = homepage.startsWith('http://') || homepage.startsWith('https://')
          ? homepage : 'https://$homepage';
      final uri = Uri.tryParse(normalized);
      if (uri == null || uri.host.isEmpty || !uri.host.contains('.')) {
        showCenterToast(context, 'URL 형식이 올바르지 않습니다 (예: example.com)');
        return;
      }
      _hpCtrl.text = normalized; // 자동 보정값으로 교체
    }
    setState(() => _saving = true);
    await ApiService.updateChannel(
      channelId:   widget.channel['id'],
      name:        name,
      description: _descCtrl.text.trim(),
      homepageUrl: _hpCtrl.text.trim(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    widget.onSaved();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(child: Container(width: 40, height: 4,
                  decoration: BoxDecoration(color: _border, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 18),
              const Text('채널 설정',
                  style: TextStyle(color: _text, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 18),
              const Text('채널명 *', style: TextStyle(color: _text2, fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(controller: _nameCtrl,
                  style: const TextStyle(color: _text), decoration: _dec('채널명')),
              const SizedBox(height: 14),
              const Text('채널 소개', style: TextStyle(color: _text2, fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(controller: _descCtrl, maxLines: 2,
                  style: const TextStyle(color: _text), decoration: _dec('채널 소개')),
              const SizedBox(height: 14),
              const Text('홈페이지', style: TextStyle(color: _text2, fontSize: 13, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              TextField(controller: _hpCtrl,
                  style: const TextStyle(color: _text), decoration: _dec('https://')),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                      backgroundColor: _primary, foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('저장', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('취소', style: TextStyle(color: _text2)),
                ),
              ),

            ],
          ),
        ),
      ),
    );
  }
}
