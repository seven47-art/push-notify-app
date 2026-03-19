// lib/screens/my_channels_screen.dart
// 스크린샷 기준: ← 내 채널 제목 + + 채널 만들기 버튼 + 채널 목록
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
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
  bool _loading = true;
  String? _error;
  String _token = '';

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
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/channels?owner_id=$userId'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          if (mounted) {
            setState(() {
              _channels = List<Map<String, dynamic>>.from(
                (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
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
                child: Row(
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
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator(color: _primary)),
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
            else if (_channels.isEmpty)
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
                    if (index >= _channels.length) return null;
                    return _ChannelListTile(
                      channel: _channels[index],
                      colorIndex: index % _avatarColors.length,
                      onTap: () => _openChannel(_channels[index]),
                    );
                  },
                  childCount: _channels.length,
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
    final name       = channel['name']?.toString() ?? '';
    final desc       = channel['description']?.toString() ?? '';
    final imageUrl   = channel['image_url']?.toString();
    final memberCount = channel['member_count'] ?? channel['subscriber_count'] ?? 0;
    final isPrivate  = channel['is_private'] == true || channel['is_private'] == 1;
    final avatarColor = _avatarColors[colorIndex];
    final initial    = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: _border, width: 0.5)),
        ),
        child: Row(
          children: [
            // 아바타
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: imageUrl == null ? avatarColor : null,
                borderRadius: BorderRadius.circular(12),
                image: imageUrl != null
                    ? DecorationImage(image: NetworkImage(imageUrl), fit: BoxFit.cover)
                    : null,
              ),
              child: imageUrl == null
                  ? Center(
                      child: Text(
                        initial,
                        style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    )
                  : null,
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
                        const Text('🔒', style: TextStyle(fontSize: 13)),
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
