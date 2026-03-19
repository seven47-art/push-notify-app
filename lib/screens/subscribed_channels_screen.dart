// lib/screens/subscribed_channels_screen.dart
// 스크린샷 기준: ← 구독 채널 제목 + 채널 목록 (채널이미지/이름/잠금아이콘/구독자수/채널소개)
// 탭 버튼이 눌리면 채널 상세(구독자 뷰)로 이동
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
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
          if (mounted) {
            setState(() {
              // subscribers API는 channel_name, image_url, owner_id 등 포함
              // 내가 만든 채널(owner_id == userId)은 구독채널 목록에서 제외
              final all = List<Map<String, dynamic>>.from(
                (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
              _channels = userId.isEmpty
                  ? all
                  : all.where((ch) => ch['owner_id']?.toString() != userId).toList();
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

  List<Map<String, dynamic>> get _filtered {
    if (_searchQuery.isEmpty) return _channels;
    return _channels.where((ch) {
      final name = ch['name']?.toString().toLowerCase() ?? '';
      return name.contains(_searchQuery.toLowerCase());
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
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
                child: SizedBox(
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
            else if (_filtered.isEmpty)
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
                    if (index >= _filtered.length) return null;
                    return _ChannelListTile(
                      channel: _filtered[index],
                      colorIndex: index % _avatarColors.length,
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ChannelDetailScreen(
                              channelId: (_filtered[index]['channel_id'] ?? _filtered[index]['id'])?.toString() ?? '',
                              isOwner: false,
                              isSubscribed: true, // 구독 중인 채널
                            ),
                          ),
                        );
                        _load();
                      },
                    );
                  },
                  childCount: _filtered.length,
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
  const _ChannelListTile({required this.channel, required this.colorIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name        = (channel['channel_name'] ?? channel['name'])?.toString() ?? '';
    final desc        = (channel['channel_description'] ?? channel['description'])?.toString() ?? '';
    final imageUrl    = channel['image_url']?.toString();
    final memberCount = channel['member_count'] ?? channel['subscriber_count'] ?? 0;
    final isPrivate   = channel['is_secret'] == true || channel['is_secret'] == 1 || channel['is_private'] == true || channel['is_private'] == 1;
    final avatarColor = _avatarColors[colorIndex];
    final initial     = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: _border, width: 0.5)),
        ),
        child: Row(
          children: [
            // 아바타
            channelAvatar(
              imageUrl: imageUrl,
              name: name,
              size: 40,
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
            const Icon(Icons.chevron_right, color: _text2, size: 20),
          ],
        ),
      ),
    );
  }
}
