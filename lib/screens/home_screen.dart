// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import 'create_channel_screen.dart';
import 'join_channel_screen.dart';
import 'channel_detail_screen.dart';

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

  // ─── 채널 참여 다이얼로그 ──────────────────────
  void _showJoinDialog() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('채널 참여', style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('초대 링크 또는 초대 코드를 입력하세요.',
                style: TextStyle(fontSize: 13, color: _text2)),
            const SizedBox(height: 14),
            TextField(
              controller: ctrl,
              style: const TextStyle(color: _text),
              decoration: InputDecoration(
                hintText: 'inv_xxxx 또는 전체 URL',
                hintStyle: TextStyle(color: Colors.grey[600]),
                filled: true, fillColor: _bg3,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide.none),
                prefixIcon: const Icon(Icons.link, color: _primary),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text('취소', style: TextStyle(color: Colors.grey[400]))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _primary, foregroundColor: _text),
            onPressed: () {
              final input = ctrl.text.trim();
              if (input.isEmpty) return;
              String token = input;
              if (input.contains('/join/')) token = input.split('/join/').last;
              else if (input.startsWith('http')) token = Uri.parse(input).pathSegments.last;
              Navigator.pop(context);
              Navigator.push(context,
                MaterialPageRoute(builder: (_) => JoinChannelScreen(inviteToken: token)),
              ).then((_) => _load());
            },
            child: const Text('확인'),
          ),
        ],
      ),
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
                        ChannelDetailScreen(channelId: chId, channelName: name)));
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
                ChannelDetailScreen(channelId: chId, channelName: name)));
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
      _DrawerItem(icon: Icons.info_outline,          label: '버전 v1.0.48',
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

  final _sources = [
    {'id': 'youtube', 'label': 'YouTube URL',  'icon': Icons.play_circle_fill, 'color': Color(0xFFFF0000)},
    {'id': 'audio',   'label': '오디오 녹음',    'icon': Icons.mic,              'color': Color(0xFF4CAF50)},
    {'id': 'video',   'label': '비디오 녹음',    'icon': Icons.videocam,         'color': Color(0xFF2196F3)},
    {'id': 'file',    'label': '파일 첨부',      'icon': Icons.attach_file,      'color': Color(0xFF9C27B0)},
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
                      onPressed: _save,
                      child: const Text('확인', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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

  void _save() {
    final dt = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, _hour, _min);
    if (dt.isBefore(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('현재 시각 이후를 선택하세요'), backgroundColor: Colors.red));
      return;
    }
    if (_selectedSrc == 'youtube' && _urlCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('YouTube URL을 입력하세요'), backgroundColor: Colors.red));
      return;
    }
    // 연결 URL https 검증
    final inputUrl = _urlCtrl.text.trim();
    if (_selectedSrc == 'youtube' && inputUrl.isNotEmpty && !inputUrl.startsWith('https://')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('등록이 불가능한 URL 주소입니다. https:// 로 시작하는 주소만 사용할 수 있습니다.'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('알람 설정 완료 · ${_selectedDate.month}/${_selectedDate.day} '
          '${_hour.toString().padLeft(2,'0')}:${_min.toString().padLeft(2,'0')}'),
      backgroundColor: _teal,
    ));
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
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('$min ~ $max 사이 값을 입력하세요'),
                      backgroundColor: const Color(0xFFEF4444)),
                );
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
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('클립보드에 복사됐습니다!'), backgroundColor: _primary));
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('채널명을 입력하세요'), backgroundColor: Colors.red));
      return;
    }
    // 홈페이지 URL https 검증
    final homepage = _hpCtrl.text.trim();
    if (homepage.isNotEmpty && !homepage.startsWith('https://')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('등록이 불가능한 URL 주소입니다. https:// 로 시작하는 주소만 사용할 수 있습니다.'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 3),
        ),
      );
      return;
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

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('채널 삭제', style: TextStyle(color: _text)),
        content: Text('"${widget.channel['name']}" 채널을 삭제하시겠습니까?',
            style: const TextStyle(color: _text2)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false),
              child: const Text('취소', style: TextStyle(color: _text2))),
          ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('삭제', style: TextStyle(color: Colors.white))),
        ],
      ),
    );
    if (ok != true) return;
    await ApiService.deleteChannel(widget.channel['id']);
    if (!mounted) return;
    widget.onDeleted();
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
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  onPressed: _delete,
                  child: const Text('채널 삭제', style: TextStyle(fontSize: 16)),
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
