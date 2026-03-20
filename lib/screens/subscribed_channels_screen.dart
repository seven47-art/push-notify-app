// lib/screens/subscribed_channels_screen.dart
// 스크린샷 기준: ← 구독 채널 제목 + 채널 목록 (채널이미지/이름/잠금아이콘/구독자수/채널소개)
// 탭 버튼이 눌리면 채널 상세(구독자 뷰)로 이동
// 알람 배지: 알람 예약이 있는 채널에 빨간 카운트 배지 표시
// 필터: 전체 (알람설정 필터 제거됨)
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/toast_helper.dart';
import '../utils/image_helper.dart';
import 'channel_detail_screen.dart';

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

class SubscribedChannelsScreen extends StatefulWidget {
  const SubscribedChannelsScreen({super.key});

  @override
  State<SubscribedChannelsScreen> createState() => SubscribedChannelsScreenState();
}

class SubscribedChannelsScreenState extends State<SubscribedChannelsScreen> {
  List<Map<String, dynamic>> _channels = [];
  bool _loading = true;
  String? _error;
  String _token = '';

  // 외부에서 reload 호출 가능하도록 public 메서드
  void reload() => _load();

  // 검색
  String _searchQuery = '';
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/subscribers?user_id=$userId'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          // subscribers API는 channel_name, image_url, owner_id 등 포함
          // 내가 만든 채널(owner_id == userId)은 구독채널 목록에서 제외
          final all = List<Map<String, dynamic>>.from(
            (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
          final channels = userId.isEmpty
              ? all
              : all.where((ch) => ch['owner_id']?.toString() != userId).toList();

          if (mounted) {
            setState(() {
              _channels = channels;
              _loading = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '구독 채널을 불러올 수 없습니다.'; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  // 길게 눌렀을 때 팝업 메뉴
  void _showLongPressMenu(Map<String, dynamic> channel) {
    final channelId   = (channel['channel_id'] ?? channel['id'])?.toString() ?? '';
    final channelName = (channel['channel_name'] ?? channel['name'])?.toString() ?? '';

    showDialog(
      context: context,
      barrierColor: Colors.black54,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 40),
        child: _ChannelPopupMenu(
          channelName: channelName,
          items: [
            _PopupItem(icon: Icons.link, label: '초대코드', onTap: () async {
              Navigator.pop(context);
              await _showInviteCode(channelId, channelName);
            }),
            _PopupItem(icon: Icons.flag_outlined, label: '채널신고', onTap: () {
              Navigator.pop(context);
              _openReport(channelId, channelName);
            }),
            _PopupItem(
              icon: Icons.exit_to_app_outlined,
              label: '채널나가기',
              color: const Color(0xFFFF4444),
              onTap: () async {
                Navigator.pop(context);
                await _leaveChannel(channelId, channelName);
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

  // 채널 신고
  void _openReport(String channelId, String channelName) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ChannelDetailScreen(
        channelId: channelId,
        isOwner: false,
        isSubscribed: true,
      ),
    );
  }

  // 채널 나가기
  Future<void> _leaveChannel(String channelId, String channelName) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('채널 나가기',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF222222))),
        content: Text('"$channelName" 채널에서 나가시겠습니까?',
            style: const TextStyle(fontSize: 13, color: Color(0xFF444444))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소', style: TextStyle(fontSize: 13, color: Color(0xFF888888))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('나가기', style: TextStyle(fontSize: 13, color: Color(0xFFFF4444))),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      final res = await http.delete(
        Uri.parse('$kBaseUrl/api/subscribers/leave?user_id=${Uri.encodeComponent(userId)}&channel_id=$channelId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (mounted) {
        if (body['success'] == true) {
          showCenterToast(context, '"$channelName" 채널에서 나갔습니다.');
          _load();
        } else {
          showCenterToast(context, body['error']?.toString() ?? '채널 나가기에 실패했습니다');
        }
      }
    } catch (e) {
      if (mounted) {
        showCenterToast(context, '오류: $e');
      }
    }
  }

  List<Map<String, dynamic>> get _filtered {
    var list = _channels;
    // 검색
    if (_searchQuery.isNotEmpty) {
      list = list.where((ch) {
        final name = (ch['channel_name'] ?? ch['name'])?.toString().toLowerCase() ?? '';
        return name.contains(_searchQuery.toLowerCase());
      }).toList();
    }
    return list;
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
                            '구독 채널',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),

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
                      Icon(Icons.list_alt, size: 56, color: Colors.grey[300]),
                      const SizedBox(height: 12),
                      Text(
                        _searchQuery.isNotEmpty ? '검색 결과가 없습니다.' : '구독 중인 채널이 없습니다.',
                        style: const TextStyle(color: _text2),
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
                    return _ChannelListTile(
                      channel: ch,
                      colorIndex: index % _avatarColors.length,
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ChannelDetailScreen(
                              channelId: (displayList[index]['channel_id'] ?? displayList[index]['id'])?.toString() ?? '',
                              isOwner: false,
                              isSubscribed: true, // 구독 중인 채널
                            ),
                          ),
                        );
                        _load();
                      },
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

class _ChannelListTile extends StatelessWidget {
  final Map<String, dynamic> channel;
  final int colorIndex;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  const _ChannelListTile({
    required this.channel,
    required this.colorIndex,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final name        = (channel['channel_name'] ?? channel['name'])?.toString() ?? '';
    final desc        = (channel['channel_description'] ?? channel['description'])?.toString() ?? '';
    final imageUrl    = channel['image_url']?.toString();
    final memberCount = channel['member_count'] ?? channel['subscriber_count'] ?? 0;
    final isPrivate   = channel['is_secret'] == true || channel['is_secret'] == 1 || channel['is_private'] == true || channel['is_private'] == 1;
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
            // 아바타
            channelAvatar(
              imageUrl: imageUrl,
              name: name,
              size: 46,
              bgColor: avatarColor,
              borderRadius: 12,
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
