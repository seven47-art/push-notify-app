// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'create_channel_screen.dart';
import 'join_channel_screen.dart';
import 'channel_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Map<String, dynamic>> _ownedChannels = [];   // 나의 운영채널
  List<Map<String, dynamic>> _joinedChannels = [];  // 나의 가입채널
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final owned = await ApiService.getMyOwnedChannels();
    final joined = await ApiService.getMyChannels();
    if (mounted) {
      setState(() {
        _ownedChannels = owned;
        _joinedChannels = joined;
        _isLoading = false;
      });
    }
  }

  // 채널 만들기
  void _goCreateChannel() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CreateChannelScreen()),
    );
    if (result == true) _loadData();
  }

  // 채널 참여
  void _showJoinDialog() {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E2E),
        title: const Text(
          '채널 참여',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '채널 운영자에게 받은 초대 링크 또는\n초대 코드를 입력하세요.',
              style: TextStyle(fontSize: 13, color: Colors.grey[400]),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'inv_xxxx_xxxxxx 또는 전체 URL',
                hintStyle: TextStyle(color: Colors.grey[600]),
                filled: true,
                fillColor: const Color(0xFF2A2A3E),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
                prefixIcon: const Icon(Icons.link, color: Color(0xFF6C63FF)),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('취소', style: TextStyle(color: Colors.grey[400])),
          ),
          ElevatedButton(
            onPressed: () {
              final input = controller.text.trim();
              if (input.isEmpty) return;
              String token = input;
              if (input.contains('/join/')) {
                token = input.split('/join/').last;
              } else if (input.startsWith('http')) {
                token = Uri.parse(input).pathSegments.last;
              }
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => JoinChannelScreen(inviteToken: token),
                ),
              ).then((_) => _loadData());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
            ),
            child: const Text('확인'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      appBar: AppBar(
        backgroundColor: const Color(0xFF6C63FF),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.notifications_active, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            const Text(
              'PushNotify',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 20,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
            )
          : RefreshIndicator(
              onRefresh: _loadData,
              color: const Color(0xFF6C63FF),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ────── 나의 운영채널 섹션 ──────
                    _buildSectionHeader(
                      title: '나의 운영채널',
                      actionLabel: '⊕ 채널 만들기',
                      onAction: _goCreateChannel,
                    ),
                    if (_ownedChannels.isEmpty)
                      _buildEmptySection('운영 중인 채널이 없습니다.\n채널을 만들어 보세요!')
                    else
                      ..._ownedChannels.map((ch) => _buildOwnedChannelTile(ch)),

                    const SizedBox(height: 8),
                    Divider(color: Colors.grey[800], thickness: 1),

                    // ────── 나의 가입채널 섹션 ──────
                    _buildSectionHeader(
                      title: '나의 가입채널',
                      actionLabel: '⊕ 채널 참여',
                      onAction: _showJoinDialog,
                    ),
                    if (_joinedChannels.isEmpty)
                      _buildEmptySection('가입한 채널이 없습니다.\n초대 링크로 참여해 보세요!')
                    else
                      ..._joinedChannels.map((ch) => _buildJoinedChannelTile(ch)),

                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),
    );
  }

  // 섹션 헤더 (제목 + 액션 버튼)
  Widget _buildSectionHeader({
    required String title,
    required String actionLabel,
    required VoidCallback onAction,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          GestureDetector(
            onTap: onAction,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A3E),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.5)),
              ),
              child: Text(
                actionLabel,
                style: const TextStyle(
                  color: Color(0xFF6C63FF),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // 빈 상태 위젯
  Widget _buildEmptySection(String message) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E2E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.grey[500],
            fontSize: 13,
            height: 1.5,
          ),
        ),
      ),
    );
  }

  // 운영채널 타일 (삭제 아이콘 포함)
  Widget _buildOwnedChannelTile(Map<String, dynamic> channel) {
    final name = channel['channel_name'] ?? '채널';
    final subCount = channel['subscriber_count'] ?? 0;
    final initial = name.isNotEmpty ? name.substring(0, 1) : 'C';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E2E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          leading: _buildChannelAvatar(initial, channel['image_url']),
          title: Text(
            '$name ($subCount)',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          trailing: IconButton(
            icon: const Icon(Icons.close, color: Colors.grey, size: 20),
            onPressed: () => _confirmDeleteChannel(channel),
          ),
          onTap: () {
            final channelId = channel['id'] ?? channel['channel_id'];
            if (channelId != null) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChannelDetailScreen(
                    channelId: channelId,
                    channelName: name,
                  ),
                ),
              );
            }
          },
        ),
      ),
    );
  }

  // 가입채널 타일
  Widget _buildJoinedChannelTile(Map<String, dynamic> channel) {
    final name = channel['channel_name'] ?? '채널';
    final initial = name.isNotEmpty ? name.substring(0, 1) : 'C';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E2E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          leading: _buildChannelAvatar(initial, channel['image_url']),
          title: Text(
            name,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
          trailing: const Icon(Icons.chevron_right, color: Colors.grey),
          onTap: () {
            final channelId = channel['channel_id'] ?? channel['id'];
            if (channelId != null) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChannelDetailScreen(
                    channelId: channelId,
                    channelName: name,
                  ),
                ),
              );
            }
          },
        ),
      ),
    );
  }

  // 채널 아바타
  Widget _buildChannelAvatar(String initial, String? imageUrl) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: const Color(0xFF2A2A3E),
      ),
      clipBehavior: Clip.antiAlias,
      child: imageUrl != null && imageUrl.isNotEmpty
          ? Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _buildInitialAvatar(initial),
            )
          : _buildInitialAvatar(initial),
    );
  }

  Widget _buildInitialAvatar(String initial) {
    // 첫 글자에 따라 색상 결정
    final colors = [
      const Color(0xFF6C63FF),
      const Color(0xFFE91E63),
      const Color(0xFF4CAF50),
      const Color(0xFF2196F3),
      const Color(0xFFFF9800),
    ];
    final colorIdx = initial.codeUnitAt(0) % colors.length;
    return Container(
      color: colors[colorIdx].withOpacity(0.2),
      child: Center(
        child: Text(
          initial,
          style: TextStyle(
            color: colors[colorIdx],
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
    );
  }

  // 채널 삭제 확인
  void _confirmDeleteChannel(Map<String, dynamic> channel) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E2E),
        title: const Text('채널 삭제', style: TextStyle(color: Colors.white)),
        content: Text(
          '"${channel['channel_name']}" 채널을 삭제하시겠습니까?',
          style: TextStyle(color: Colors.grey[300]),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('취소', style: TextStyle(color: Colors.grey[400])),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final id = channel['id'] ?? channel['channel_id'];
              if (id != null) {
                await ApiService.deleteChannel(id);
                _loadData();
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('삭제', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
