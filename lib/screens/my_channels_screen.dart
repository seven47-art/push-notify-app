// lib/screens/my_channels_screen.dart
// 스크린샷 기준: ← 내 채널 제목 + + 채널 만들기 버튼 + 채널 목록
// 알람 배지: 알람 예약이 있는 채널에 빨간 카운트 배지 표시
// 필터: 전체 / 예약알람 탭
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/toast_helper.dart';
import '../utils/image_helper.dart';
import 'alarm_schedule_screen.dart';
import 'channel_detail_screen.dart';
import 'create_channel_screen.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _bg      = Color(0xFFFFFFFF);

// 아바타 배경색 팔레트
const List<Color> _avatarColors = [
  Color(0xFF9C27B0), Color(0xFF3F51B5), Color(0xFFE91E63),
  Color(0xFF009688), Color(0xFFFF5722), Color(0xFF795548),
  Color(0xFF607D8B), Color(0xFF4CAF50), Color(0xFF2196F3),
];

class MyChannelsScreen extends StatefulWidget {
  const MyChannelsScreen({super.key});

  @override
  State<MyChannelsScreen> createState() => MyChannelsScreenState();
}

// 퍼블릭 State - 외부(MainScreenState)에서 GlobalKey로 reload() 호출 가능
class MyChannelsScreenState extends State<MyChannelsScreen> {
  List<Map<String, dynamic>> _channels = [];
  Map<String, int> _alarmCounts = {}; // channelId → 알람 개수
  bool _loading = true;
  String? _error;
  String _token = '';

  // 외부에서 reload 호출 가능하도록 public 메서드
  void reload() => _load();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';

      // 채널 목록 + 알람 카운트 병렬 로드
      final channelRes = await http.get(
        Uri.parse('$kBaseUrl/api/channels?owner_id=$userId'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));

      if (channelRes.statusCode == 200) {
        final body = jsonDecode(channelRes.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final channels = List<Map<String, dynamic>>.from(
            (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));

          // 알람 카운트 조회
          Map<String, int> alarmCounts = {};
          if (channels.isNotEmpty) {
            try {
              final ids = channels.map((c) => c['id']?.toString() ?? '').where((id) => id.isNotEmpty).join(',');
              final alarmRes = await http.get(
                Uri.parse('$kBaseUrl/api/alarms/count?channel_ids=$ids'),
                headers: {'Authorization': 'Bearer $_token'},
              ).timeout(const Duration(seconds: 10));
              if (alarmRes.statusCode == 200) {
                final ab = jsonDecode(alarmRes.body) as Map<String, dynamic>;
                if (ab['success'] == true && ab['data'] != null) {
                  final raw = ab['data'];
                  // data가 Map<channelId, count> 형태인 경우
                  if (raw is Map) {
                    raw.forEach((k, v) {
                      final cnt = v is num ? v.toInt() : int.tryParse(v.toString()) ?? 0;
                      if (cnt > 0) alarmCounts[k.toString()] = cnt;
                    });
                  }
                  // data가 List [{channel_id, count}] 형태인 경우
                  else if (raw is List) {
                    for (final item in raw) {
                      if (item is Map) {
                        final cid = item['channel_id']?.toString() ?? item['channelId']?.toString() ?? '';
                        final cnt = (item['count'] ?? item['alarm_count'] ?? 0);
                        final n = cnt is num ? cnt.toInt() : int.tryParse(cnt.toString()) ?? 0;
                        if (cid.isNotEmpty && n > 0) alarmCounts[cid] = n;
                      }
                    }
                  }
                }
              }
            } catch (_) {}
          }

          if (mounted) {
            setState(() {
              _channels = channels;
              _alarmCounts = alarmCounts;
              _loading = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '채널 목록을 불러올 수 없습니다.'; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  // 채널 목록
  List<Map<String, dynamic>> get _filtered => _channels;

  /// 상단 예약알람 버튼 → _AlarmListSheet 바텀시트 오픈
  Future<void> _openAlarmListSheet() async {
    if (_channels.isEmpty) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.88,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, scrollController) => _AlarmListSheet(
          channels: _channels,
          token: _token,
          scrollController: scrollController,
        ),
      ),
    );
    // 시트 닫힌 후 알람 카운트 갱신
    _load();
  }

  /// teal 알람 버튼 클릭 시 AlarmScheduleSheet 직접 열기
  Future<void> _openAlarmSheet(Map<String, dynamic> channel) async {
    final channelId   = channel['id']?.toString() ?? '';
    final channelName = channel['name']?.toString() ?? '';
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AlarmScheduleSheet(channelId: channelId, channelName: channelName),
    );
    _load();
  }

  Future<void> _openChannel(Map<String, dynamic> channel) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChannelDetailScreen(
          channelId: channel['id']?.toString() ?? '',
          isOwner: true,
        ),
      ),
    );
    _load();
  }

  // 길게 눌렀을 때 팝업 메뉴
  void _showLongPressMenu(Map<String, dynamic> channel) {
    final channelId   = channel['id']?.toString() ?? '';
    final channelName = channel['name']?.toString() ?? '';

    showDialog(
      context: context,
      barrierColor: Colors.black54,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 40),
        child: _ChannelPopupMenu(
        channelName: channelName,
        items: [
          _PopupItem(icon: Icons.alarm_outlined, label: '알람예약', onTap: () async {
            Navigator.pop(context);
            await showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => AlarmScheduleSheet(channelId: channelId, channelName: channelName),
            );
            _load();
          }),
          _PopupItem(icon: Icons.link, label: '초대코드', onTap: () async {
            Navigator.pop(context);
            await _showInviteCode(channelId, channelName);
          }),
          _PopupItem(icon: Icons.edit_outlined, label: '채널수정', onTap: () async {
            Navigator.pop(context);
            await _openChannelSettings(channelId);
          }),
          _PopupItem(
            icon: Icons.delete_outline,
            label: '채널삭제',
            color: const Color(0xFFFF4444),
            onTap: () async {
              Navigator.pop(context);
              await _deleteChannel(channelId, channelName);
            },
          ),
        ],
      ),
      ),
    );
  }

  // 채널수정 → 채널 설정 바텀시트 직접 오픈
  Future<void> _openChannelSettings(String channelId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';

      // 채널 상세 정보 로드
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/channels/$channelId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (!mounted) return;

      if (res.statusCode != 200) {
        showCenterToast(context, '채널 정보를 불러올 수 없습니다.');
        return;
      }

      final body    = jsonDecode(res.body) as Map<String, dynamic>;
      final channel = (body['data'] ?? body) as Map<String, dynamic>;

      await showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => ChannelSettingsSheet(
          channel: channel,
          token: token,
          onSaved: _load,
        ),
      );
      _load();
    } catch (e) {
      if (mounted) showCenterToast(context, '오류가 발생했습니다.');
    }
  }

  // 초대코드 바텀시트
  Future<void> _showInviteCode(String channelId, String channelName) async {
    try {
      // 활성 초대 링크 조회 또는 생성
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';

      final invRes = await http.get(
        Uri.parse('$kBaseUrl/api/invites?channel_id=$channelId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      final invBody = jsonDecode(invRes.body) as Map<String, dynamic>;
      final list = (invBody['data'] as List? ?? []);
      final now = DateTime.now();
      Map<String, dynamic>? active;
      for (final inv in list) {
        final isActive   = inv['is_active'] == true || inv['is_active'] == 1;
        final expiresAt  = inv['expires_at'];
        final notExpired = expiresAt == null ||
            DateTime.tryParse(expiresAt.toString())?.isAfter(now) == true;
        if (isActive && notExpired) { active = inv as Map<String, dynamic>; break; }
      }

      String? inviteToken = active?['invite_token']?.toString();
      if (inviteToken == null || inviteToken.isEmpty) {
        final crRes = await http.post(
          Uri.parse('$kBaseUrl/api/invites'),
          headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
          body: jsonEncode({'channel_id': channelId, 'created_by': userId}),
        ).timeout(const Duration(seconds: 10));
        final crBody = jsonDecode(crRes.body) as Map<String, dynamic>;
        inviteToken = crBody['data']?['invite_token']?.toString();
      }

      final inviteLink = inviteToken != null
          ? 'https://ringo.run/join/$inviteToken'
          : 'https://ringo.run/join/$channelId';

      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        isScrollControlled: true,
        builder: (_) => _InviteCodeSheet(channelName: channelName, inviteLink: inviteLink),
      );
    } catch (e) {
      if (mounted) {
        showCenterToast(context, '초대 링크를 불러올 수 없습니다: $e');
      }
    }
  }

  // 채널 삭제
  Future<void> _deleteChannel(String channelId, String channelName) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('채널 삭제',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF222222))),
        content: Text('"$channelName" 채널을 삭제하면 복구할 수 없습니다.\n정말 삭제하시겠습니까?',
            style: const TextStyle(fontSize: 13, color: Color(0xFF444444))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소', style: TextStyle(fontSize: 13, color: Color(0xFF888888))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('삭제', style: TextStyle(fontSize: 13, color: Color(0xFFFF4444))),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await http.delete(
        Uri.parse('$kBaseUrl/api/channels/$channelId'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));
      if (mounted) {
        showCenterToast(context, '채널이 삭제되었습니다.');
        _load();
      }
    } catch (e) {
      if (mounted) {
        showCenterToast(context, '삭제 실패: $e');
      }
    }
  }

  Future<void> _openCreateChannel() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const CreateChannelSheet(),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final displayList = _filtered;
    return Scaffold(
      backgroundColor: _bg,
      body: RefreshIndicator(
        color: _primary,
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 36,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Text(
                            '내 채널',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: _text,
                            ),
                          ),
                          const Spacer(),
                          // 예약알람 버튼 → 바텀시트 오픈
                          _AlarmToggleButton(
                            onTap: _openAlarmListSheet,
                            hasAlarm: _alarmCounts.values.any((c) => c > 0),
                          ),
                          const SizedBox(width: 8),
                          // +채널 버튼
                          OutlinedButton(
                            onPressed: _openCreateChannel,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _primary,
                              side: const BorderSide(color: _primary),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              fixedSize: const Size.fromHeight(32),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.add, size: 16),
                                SizedBox(width: 2),
                                Text('채널', style: TextStyle(fontSize: 13)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: SizedBox.shrink(),
              )
            else if (_error != null)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline, size: 48, color: Colors.grey[300]),
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: _text2)),
                      const SizedBox(height: 12),
                      TextButton(onPressed: _load, child: const Text('다시 시도')),
                    ],
                  ),
                ),
              )
            // ── 채널 목록 ──────────────────────────────────────────────────
            else if (displayList.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.wifi_tethering, size: 56, color: Colors.grey[300]),
                      const SizedBox(height: 12),
                      const Text('운영 중인 채널이 없습니다.', style: TextStyle(color: _text2)),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: _openCreateChannel,
                        icon: const Icon(Icons.add),
                        label: const Text('채널 만들기'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    if (index >= displayList.length) return null;
                    final ch = displayList[index];
                    final id = ch['id']?.toString() ?? '';
                    final alarmCount = _alarmCounts[id] ?? 0;
                    return _ChannelListTile(
                      channel: ch,
                      colorIndex: index % _avatarColors.length,
                      alarmCount: alarmCount,
                      onTap: () => _openChannel(ch),
                      onLongPress: () => _showLongPressMenu(ch),
                      onAlarmTap: alarmCount > 0
                          ? () => _openAlarmSheet(ch)
                          : null,
                    );
                  },
                  childCount: displayList.length,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// 예약알람 버튼 (상단 헤더용, 탭 → 바텀시트)
class _AlarmToggleButton extends StatelessWidget {
  final VoidCallback onTap;
  final bool hasAlarm;
  const _AlarmToggleButton({required this.onTap, this.hasAlarm = false});

  static const _teal = Color(0xFF00BCD4);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: _teal),
              borderRadius: BorderRadius.circular(20),
            ),
            alignment: Alignment.center,
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.alarm, size: 14, color: _teal),
                SizedBox(width: 4),
                Text(
                  '예약알람',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: _teal,
                  ),
                ),
              ],
            ),
          ),
          if (hasAlarm)
            Positioned(
              top: -3,
              right: -3,
              child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFFFF4444),
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ChannelListTile extends StatelessWidget {
  final Map<String, dynamic> channel;
  final int colorIndex;
  final int alarmCount;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onAlarmTap; // teal 알람 버튼 탭 콜백
  const _ChannelListTile({
    required this.channel,
    required this.colorIndex,
    required this.onTap,
    this.alarmCount = 0,
    this.onLongPress,
    this.onAlarmTap,
  });

  @override
  Widget build(BuildContext context) {
    final name       = channel['name']?.toString() ?? '';
    final desc       = channel['description']?.toString() ?? '';
    final imageUrl   = channel['image_url']?.toString();
    final memberCount = channel['member_count'] ?? channel['subscriber_count'] ?? 0;
    final isPrivate  = channel['is_private'] == true || channel['is_private'] == 1
                    || channel['is_secret'] == true  || channel['is_secret'] == 1;
    final avatarColor = _avatarColors[colorIndex];

    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: _border, width: 0.5)),
        ),
        child: Row(
          children: [
            // 아바타 + 알람 버튼 (teal)
            Stack(
              clipBehavior: Clip.none,
              children: [
                channelAvatar(
                  imageUrl: imageUrl,
                  name: name,
                  size: 46,
                  bgColor: avatarColor,
                  borderRadius: 12,
                ),
                if (alarmCount > 0)
                  Positioned(
                    bottom: -6,
                    right: -6,
                    child: GestureDetector(
                      onTap: onAlarmTap,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(
                              color: const Color(0xFF00BCD4),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.white, width: 2),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.15),
                                  blurRadius: 4,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.alarm, size: 14, color: Colors.white),
                          ),
                          // 알람 카운트 배지
                          Positioned(
                            top: -6,
                            right: -6,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFF4444),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.white, width: 1.5),
                              ),
                              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                              child: Center(
                                child: Text(
                                  '$alarmCount',
                                  style: const TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _text),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isPrivate) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.lock, size: 13, color: Color(0xFFEF4444)),
                      ],
                      const SizedBox(width: 4),
                      Icon(Icons.group, size: 13, color: _text2),
                      const SizedBox(width: 2),
                      Text('$memberCount', style: const TextStyle(fontSize: 12, color: _text2)),
                    ],
                  ),
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      desc,
                      style: const TextStyle(fontSize: 12, color: _text2),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── 롱프레스 팝업 메뉴 ─────────────────────────────────────────────────────
class _PopupItem {
  final IconData icon;
  final String label;
  final Color? color;
  final VoidCallback onTap;
  const _PopupItem({required this.icon, required this.label, required this.onTap, this.color});
}

class _ChannelPopupMenu extends StatelessWidget {
  final String channelName;
  final List<_PopupItem> items;
  const _ChannelPopupMenu({required this.channelName, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 채널명 (굵게, 좌측 정렬)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
            child: Text(
              channelName,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFF222222)),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),
          ...items.map((item) => InkWell(
            onTap: item.onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
              child: Row(
                children: [
                  Icon(item.icon, size: 20, color: item.color ?? const Color(0xFF444444)),
                  const SizedBox(width: 14),
                  Text(
                    item.label,
                    style: TextStyle(
                      fontSize: 15,
                      color: item.color ?? const Color(0xFF222222),
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          )),
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

// ── 초대코드 바텀시트 ────────────────────────────────────────────────────────
class _InviteCodeSheet extends StatelessWidget {
  final String channelName;
  final String inviteLink;
  const _InviteCodeSheet({required this.channelName, required this.inviteLink});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: Container(width: 40, height: 4,
            decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          Text('$channelName · 초대 링크',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF222222))),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFEEEEEE)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(inviteLink,
                    style: const TextStyle(fontSize: 13, color: Color(0xFF6C63FF)),
                    overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: inviteLink));
                    showCenterToast(context, '초대 링크가 복사되었습니다.');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('복사',
                      style: TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.pop(context),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                side: const BorderSide(color: Color(0xFFEEEEEE)),
              ),
              child: const Text('닫기', style: TextStyle(color: Color(0xFF888888))),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 예약알람 탭: 알람 아이템 위젯 ────────────────────────────────────────────
class _AlarmListTile extends StatelessWidget {
  final Map<String, dynamic> alarm;
  final VoidCallback onDelete;
  const _AlarmListTile({required this.alarm, required this.onDelete});

  String _formatScheduledAt(String? raw) {
    if (raw == null) return '-';
    try {
      final dt   = DateTime.parse(raw).toLocal();
      final ampm = dt.hour < 12 ? '오전' : '오후';
      final h    = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
      final m    = dt.minute.toString().padLeft(2, '0');
      return '${dt.month}월 ${dt.day}일  $ampm $h:$m';
    } catch (_) {
      return raw;
    }
  }

  String _msgTypeLabel(String msgType) {
    switch (msgType) {
      case 'youtube': return 'YouTube';
      case 'video':   return '동영상';
      case 'audio':   return '오디오';
      default:        return msgType.isNotEmpty ? msgType : '파일';
    }
  }

  IconData _msgTypeIcon(String msgType) {
    switch (msgType) {
      case 'youtube': return Icons.smart_display;
      case 'video':   return Icons.videocam_outlined;
      default:        return Icons.music_note_outlined;
    }
  }

  Color _msgTypeColor(String msgType) {
    switch (msgType) {
      case 'youtube': return Colors.red;
      case 'video':   return Colors.blue;
      default:        return const Color(0xFF00BCD4);
    }
  }

  @override
  Widget build(BuildContext context) {
    final channelName     = alarm['_channelName']?.toString() ?? '';
    final imageUrl        = alarm['_channelImageUrl']?.toString();
    final colorIdx        = (alarm['_channelColorIndex'] as int?) ?? 0;
    final scheduledAt     = _formatScheduledAt(alarm['scheduled_at']?.toString());
    final msgType         = alarm['msg_type']?.toString() ?? '';
    final typeLabel       = _msgTypeLabel(msgType);
    final typeIcon        = _msgTypeIcon(msgType);
    final typeColor       = _msgTypeColor(msgType);
    final avatarBg        = _avatarColors[colorIdx % _avatarColors.length];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _border, width: 0.5)),
      ),
      child: Row(
        children: [
          // 채널 아바타
          channelAvatar(
            imageUrl: imageUrl,
            name: channelName,
            size: 46,
            bgColor: avatarBg,
            borderRadius: 12,
          ),
          const SizedBox(width: 12),
          // 채널명 + 날짜/시간 + 콘텐츠 종류
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  channelName,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _text),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  scheduledAt,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _text),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Icon(typeIcon, size: 13, color: typeColor),
                    const SizedBox(width: 4),
                    Text(typeLabel,
                      style: const TextStyle(fontSize: 12, color: _text2)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // 삭제 버튼
          GestureDetector(
            onTap: onDelete,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFFF4444).withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.delete_outline, size: 14, color: Color(0xFFFF4444)),
                  SizedBox(width: 3),
                  Text('삭제',
                    style: TextStyle(fontSize: 12, color: Color(0xFFFF4444), fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 예약알람 바텀시트 ──────────────────────────────────────────────────
class _AlarmListSheet extends StatefulWidget {
  final List<Map<String, dynamic>> channels;
  final String token;
  final ScrollController? scrollController;
  const _AlarmListSheet({
    required this.channels,
    required this.token,
    this.scrollController,
  });

  @override
  State<_AlarmListSheet> createState() => _AlarmListSheetState();
}

class _AlarmListSheetState extends State<_AlarmListSheet> {
  List<Map<String, dynamic>> _alarms = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadAlarms();
  }

  Future<void> _loadAlarms() async {
    setState(() => _loading = true);
    try {
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? widget.token;
      final userId = prefs.getString('user_id') ?? '';

      // 모든 채널 병렬 요청 (Future.wait)
      final futures = <Future<List<Map<String, dynamic>>>>[];
      for (int i = 0; i < widget.channels.length; i++) {
        final ch        = widget.channels[i];
        final channelId = ch['id']?.toString() ?? '';
        if (channelId.isEmpty) continue;
        final idx = i;
        futures.add(() async {
          try {
            final res = await http.get(
              Uri.parse('$kBaseUrl/api/alarms?channel_id=$channelId&user_id=$userId'),
              headers: {'Authorization': 'Bearer $token'},
            ).timeout(const Duration(seconds: 10));
            if (res.statusCode == 200) {
              final body = jsonDecode(res.body) as Map<String, dynamic>;
              if (body['success'] == true) {
                return List<Map<String, dynamic>>.from(
                  (body['data'] as List? ?? []).map((e) => {
                    ...Map<String, dynamic>.from(e),
                    '_channelName'      : ch['name']?.toString() ?? '',
                    '_channelImageUrl'  : ch['image_url']?.toString(),
                    '_channelColorIndex': idx % _avatarColors.length,
                  }),
                );
              }
            }
          } catch (_) {}
          return <Map<String, dynamic>>[];
        }());
      }

      final nested = await Future.wait(futures);
      final result = nested.expand((e) => e).toList();

      // 날짜 오름차순 정렬
      result.sort((a, b) {
        final at = a['scheduled_at']?.toString() ?? '';
        final bt = b['scheduled_at']?.toString() ?? '';
        return at.compareTo(bt);
      });

      if (mounted) setState(() { _alarms = result; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _deleteAlarm(String alarmId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? widget.token;
      final res = await http.delete(
        Uri.parse('$kBaseUrl/api/alarms/$alarmId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200 || res.statusCode == 204) {
        if (mounted) {
          setState(() => _alarms.removeWhere((a) => a['id']?.toString() == alarmId));
          showCenterToast(context, '알람이 삭제되었습니다.');
        }
        return;
      }
    } catch (_) {}
    if (mounted) showCenterToast(context, '알람 삭제에 실패했습니다.');
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // 드래그 핸들
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          // 헤더
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                const Icon(Icons.alarm, size: 18, color: Color(0xFF00BCD4)),
                const SizedBox(width: 8),
                const Text(
                  '예약알람',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20, color: _text2),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1, thickness: 0.5, color: _border),
          // 본문 (스크롤 가능)
          Expanded(
            child: _loading
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(color: _primary),
                  ),
                )
              : _alarms.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.alarm_off_outlined, size: 56, color: Colors.grey[300]),
                          const SizedBox(height: 12),
                          const Text('예약된 알람이 없습니다.', style: TextStyle(color: _text2)),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: widget.scrollController,
                    itemCount: _alarms.length,
                    itemBuilder: (_, i) => _AlarmListTile(
                      alarm: _alarms[i],
                      onDelete: () => _deleteAlarm(_alarms[i]['id']?.toString() ?? ''),
                    ),
                  ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
        ],
      ),
    );
  }
}
