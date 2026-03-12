// lib/screens/notification_screen.dart
// 수신함 / 발신함 – 실제 서버 API 연동
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // ── 수신함 ──
  List<Map<String, dynamic>> _inboxChannels = [];
  bool _inboxLoading = true;
  String? _inboxError;

  // ── 발신함 ──
  List<Map<String, dynamic>> _outboxChannels = [];
  bool _outboxLoading = true;
  String? _outboxError;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 0 && !_tabController.indexIsChanging) {
        _loadInbox();
      } else if (_tabController.index == 1 && !_tabController.indexIsChanging) {
        _loadOutbox();
      }
    });
    _loadInbox();
    _loadOutbox();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ── 세션 토큰 가져오기 ──
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('session_token');
  }

  // ── 수신함 로드 ──
  Future<void> _loadInbox() async {
    setState(() { _inboxLoading = true; _inboxError = null; });
    try {
      final token = await _getToken();
      if (token == null || token.isEmpty) {
        setState(() { _inboxLoading = false; _inboxError = '로그인이 필요합니다'; });
        return;
      }
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/alarms/inbox'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final data = List<Map<String, dynamic>>.from(
            (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))
          );
          setState(() { _inboxChannels = data; _inboxLoading = false; });
        } else {
          setState(() { _inboxLoading = false; _inboxError = body['error']?.toString() ?? '불러오기 실패'; });
        }
      } else if (res.statusCode == 401) {
        setState(() { _inboxLoading = false; _inboxError = '인증이 만료됐습니다. 재로그인 해주세요.'; });
      } else {
        setState(() { _inboxLoading = false; _inboxError = '서버 오류 (${res.statusCode})'; });
      }
    } catch (e) {
      setState(() { _inboxLoading = false; _inboxError = '연결 실패: $e'; });
    }
  }

  // ── 발신함 로드 ──
  Future<void> _loadOutbox() async {
    setState(() { _outboxLoading = true; _outboxError = null; });
    try {
      final token = await _getToken();
      if (token == null || token.isEmpty) {
        setState(() { _outboxLoading = false; _outboxError = '로그인이 필요합니다'; });
        return;
      }
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/alarms/outbox'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final data = List<Map<String, dynamic>>.from(
            (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))
          );
          setState(() { _outboxChannels = data; _outboxLoading = false; });
        } else {
          setState(() { _outboxLoading = false; _outboxError = body['error']?.toString() ?? '불러오기 실패'; });
        }
      } else {
        setState(() { _outboxLoading = false; _outboxError = '서버 오류 (${res.statusCode})'; });
      }
    } catch (e) {
      setState(() { _outboxLoading = false; _outboxError = '연결 실패: $e'; });
    }
  }

  // ── 컨텐츠 재생 (msg_value URL 열기) ──
  Future<void> _openContent(String? url) async {
    if (url == null || url.isEmpty) return;
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('링크를 열 수 없습니다: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1035),
        title: const Text(
          '알람 목록',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF6C63FF),
          labelColor: const Color(0xFF6C63FF),
          unselectedLabelColor: Colors.grey,
          tabs: const [
            Tab(text: '📥  수신함'),
            Tab(text: '📤  발신함'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildInboxTab(),
          _buildOutboxTab(),
        ],
      ),
    );
  }

  // ═══════════════════════════════════
  //  수신함 탭
  // ═══════════════════════════════════
  Widget _buildInboxTab() {
    if (_inboxLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
      );
    }
    if (_inboxError != null) {
      return _buildErrorState(_inboxError!, _loadInbox);
    }
    if (_inboxChannels.isEmpty) {
      return _buildEmptyState('수신된 알람이 없습니다', Icons.inbox_outlined);
    }

    return RefreshIndicator(
      onRefresh: _loadInbox,
      color: const Color(0xFF6C63FF),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _inboxChannels.length,
        itemBuilder: (context, idx) {
          final group = _inboxChannels[idx];
          final items = List<Map<String, dynamic>>.from(
            (group['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))
          );
          return _buildInboxChannelCard(group, items);
        },
      ),
    );
  }

  Widget _buildInboxChannelCard(Map<String, dynamic> group, List<Map<String, dynamic>> items) {
    final channelName = group['channel_name']?.toString() ?? '채널';
    final unread      = group['unread'] as int? ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF3A3A55), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 채널 헤더
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C63FF).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.notifications_active, color: Color(0xFF6C63FF), size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    channelName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                ),
                if (unread > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '$unread',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(color: Color(0xFF2A2A3E), height: 1),
          // 알람 목록
          ...items.map((item) => _buildInboxItem(item)),
        ],
      ),
    );
  }

  Widget _buildInboxItem(Map<String, dynamic> item) {
    final msgType    = item['msg_type']?.toString() ?? 'youtube';
    final msgValue   = item['msg_value']?.toString();
    final channelName = item['channel_name']?.toString() ?? '';
    final receivedAt = _formatDateTime(item['received_at']?.toString());

    return InkWell(
      onTap: () => _openContent(msgValue),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFF2A2A3E))),
        ),
        child: Row(
          children: [
            // 타입 아이콘
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A3E),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(_getMsgTypeIcon(msgType), color: _getMsgTypeColor(msgType), size: 18),
            ),
            const SizedBox(width: 12),
            // 내용 (영상종류 / 채널명 / 알람시간)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _getMsgTypeLabel(msgType),
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  if (channelName.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      channelName,
                      style: const TextStyle(color: Color(0xFF6C63FF), fontSize: 12),
                    ),
                  ],
                  const SizedBox(height: 2),
                  Text(
                    receivedAt,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
            ),
            // 재생 아이콘
            const Icon(Icons.play_circle_outline, color: Color(0xFF6C63FF), size: 22),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════
  //  발신함 탭
  // ═══════════════════════════════════
  Widget _buildOutboxTab() {
    if (_outboxLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
      );
    }
    if (_outboxError != null) {
      return _buildErrorState(_outboxError!, _loadOutbox);
    }
    if (_outboxChannels.isEmpty) {
      return _buildEmptyState('발송된 알람이 없습니다', Icons.outbox_outlined);
    }

    return RefreshIndicator(
      onRefresh: _loadOutbox,
      color: const Color(0xFF6C63FF),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _outboxChannels.length,
        itemBuilder: (context, idx) {
          final group = _outboxChannels[idx];
          final items = List<Map<String, dynamic>>.from(
            (group['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))
          );
          return _buildOutboxChannelCard(group, items);
        },
      ),
    );
  }

  Widget _buildOutboxChannelCard(Map<String, dynamic> group, List<Map<String, dynamic>> items) {
    final channelName = group['channel_name']?.toString() ?? '채널';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF3A3A55), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 채널 헤더
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1DE9B6).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.send, color: Color(0xFF1DE9B6), size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    channelName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                ),
                Text(
                  '${items.length}건',
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
              ],
            ),
          ),
          const Divider(color: Color(0xFF2A2A3E), height: 1),
          ...items.map((item) => _buildOutboxItem(item)),
        ],
      ),
    );
  }

  Widget _buildOutboxItem(Map<String, dynamic> item) {
    final msgType     = item['msg_type']?.toString() ?? 'youtube';
    final msgValue    = item['msg_value']?.toString();
    final channelName = item['channel_name']?.toString() ?? '';
    final scheduledAt = _formatDateTime(item['scheduled_at']?.toString());

    return InkWell(
      onTap: () => _openContent(msgValue),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0xFF2A2A3E))),
        ),
        child: Row(
          children: [
            // 타입 아이콘
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A3E),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(_getMsgTypeIcon(msgType), color: _getMsgTypeColor(msgType), size: 18),
            ),
            const SizedBox(width: 12),
            // 내용 (영상종류 / 채널명 / 알람시간)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _getMsgTypeLabel(msgType),
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  if (channelName.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      channelName,
                      style: const TextStyle(color: Color(0xFF1DE9B6), fontSize: 12),
                    ),
                  ],
                  const SizedBox(height: 2),
                  Text(
                    scheduledAt,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  ),
                ],
              ),
            ),
            // 재생 아이콘
            const Icon(Icons.play_circle_outline, color: Color(0xFF1DE9B6), size: 22),
          ],
        ),
      ),
    );
  }

  // ── 공통 위젯 ──
  Widget _buildEmptyState(String msg, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 72, color: Colors.grey.withOpacity(0.3)),
          const SizedBox(height: 16),
          Text(msg, style: const TextStyle(color: Colors.grey, fontSize: 15)),
        ],
      ),
    );
  }

  Widget _buildErrorState(String error, VoidCallback retry) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 56, color: Color(0xFFEF4444)),
          const SizedBox(height: 12),
          Text(error, style: const TextStyle(color: Colors.grey, fontSize: 14), textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.refresh),
            label: const Text('다시 시도'),
            onPressed: retry,
          ),
        ],
      ),
    );
  }

  // ── 헬퍼 함수 ──
  IconData _getMsgTypeIcon(String type) {
    switch (type) {
      case 'youtube': return Icons.play_circle_fill;
      case 'video':   return Icons.videocam;
      case 'audio':   return Icons.audiotrack;
      default:        return Icons.attach_file;
    }
  }

  Color _getMsgTypeColor(String type) {
    switch (type) {
      case 'youtube': return Colors.red;
      case 'video':   return Colors.blue;
      case 'audio':   return Colors.green;
      default:        return Colors.grey;
    }
  }

  String _getMsgTypeLabel(String type) {
    switch (type) {
      case 'youtube': return '📺 YouTube';
      case 'video':   return '🎬 비디오';
      case 'audio':   return '🎵 오디오';
      default:        return '📎 파일';
    }
  }

  String _formatDateTime(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1)  return '방금 전';
      if (diff.inMinutes < 60) return '${diff.inMinutes}분 전';
      if (diff.inHours < 24)   return '${diff.inHours}시간 전';
      if (diff.inDays < 7)     return '${diff.inDays}일 전';
      return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
    } catch (_) {
      return raw;
    }
  }
}
