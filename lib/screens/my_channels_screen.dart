// lib/screens/my_channels_screen.dart
// 스크린샷 기준: ← 내 채널 제목 + + 채널 만들기 버튼 + 채널 목록
// 알람 배지: 알람 예약이 있는 채널에 빨간 카운트 배지 표시
// 필터: 전체 / 알람설정 탭
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
  State<MyChannelsScreen> createState() => _MyChannelsScreenState();
}

class _MyChannelsScreenState extends State<MyChannelsScreen> {
  List<Map<String, dynamic>> _channels = [];
  Map<String, int> _alarmCounts = {}; // channelId → 알람 개수
  bool _loading = true;
  String? _error;
  String _token = '';
  bool _showAlarmOnly = false; // 알람설정된 채널만 보기

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
                  final data = ab['data'] as Map<String, dynamic>;
                  data.forEach((k, v) {
                    alarmCounts[k] = (v as num).toInt();
                  });
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

  List<Map<String, dynamic>> get _filtered {
    if (!_showAlarmOnly) return _channels;
    return _channels.where((ch) {
      final id = ch['id']?.toString() ?? '';
      return (_alarmCounts[id] ?? 0) > 0;
    }).toList();
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
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ChannelDetailScreen(channelId: channelId, isOwner: true),
              ),
            );
            _load();
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
                          OutlinedButton.icon(
                            onPressed: _openCreateChannel,
                            icon: const Icon(Icons.add, size: 16),
                            label: const Text('채널 만들기', style: TextStyle(fontSize: 13)),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _primary,
                              side: const BorderSide(color: _primary),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              fixedSize: const Size.fromHeight(32),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    // 필터 탭: 전체 / 알람설정
                    Row(
                      children: [
                        _FilterChip(
                          label: '전체',
                          selected: !_showAlarmOnly,
                          onTap: () => setState(() => _showAlarmOnly = false),
                        ),
                        const SizedBox(width: 8),
                        _FilterChip(
                          label: '알람설정',
                          selected: _showAlarmOnly,
                          onTap: () => setState(() => _showAlarmOnly = true),
                          icon: Icons.alarm,
                        ),
                      ],
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
            else if (displayList.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _showAlarmOnly ? Icons.alarm_off : Icons.wifi_tethering,
                        size: 56, color: Colors.grey[300]),
                      const SizedBox(height: 12),
                      Text(
                        _showAlarmOnly ? '알람이 설정된 채널이 없습니다.' : '운영 중인 채널이 없습니다.',
                        style: const TextStyle(color: _text2),
                      ),
                      if (!_showAlarmOnly) ...[
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

// 필터 칩 위젯
class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  const _FilterChip({required this.label, required this.selected, required this.onTap, this.icon});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? _primary : Colors.transparent,
          border: Border.all(color: selected ? _primary : _border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 13, color: selected ? Colors.white : _text2),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: selected ? Colors.white : _text2,
              ),
            ),
          ],
        ),
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
  const _ChannelListTile({
    required this.channel,
    required this.colorIndex,
    required this.onTap,
    this.alarmCount = 0,
    this.onLongPress,
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
            // 아바타 + 알람 배지
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
                    top: -4,
                    right: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFF4444),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                      child: Center(
                        child: Text(
                          '$alarmCount',
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
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
            const Icon(Icons.chevron_right, color: _text2, size: 20),
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
