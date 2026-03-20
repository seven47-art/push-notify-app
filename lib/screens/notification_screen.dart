// lib/screens/notification_screen.dart
// 수신함(inbox) / 발신함(outbox)
// - API 페이지네이션(limit/offset) 기반 무한스크롤
// - 채널 필터 탭(가로스크롤) + 선택/삭제 모드
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/image_helper.dart';
import '../utils/toast_helper.dart';
import 'content_player_screen.dart';

enum NotificationMode { inbox, outbox }

// ── 색상 ──────────────────────────────────────────
const _bg      = Color(0xFFFFFFFF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _primary = Color(0xFF6C63FF);
const _red     = Color(0xFFFF4444);

// 콘텐츠 타입별 아이콘 색상
Color _typeColor(String type) {
  switch (type) {
    case 'youtube': return Colors.red;
    case 'audio':   return const Color(0xFF2196F3);
    case 'video':   return const Color(0xFF4CAF50);
    default:        return const Color(0xFF9E9E9E);
  }
}

IconData _typeIcon(String type) {
  switch (type) {
    case 'youtube': return Icons.smart_display;
    case 'audio':   return Icons.music_note;
    case 'video':   return Icons.videocam;
    default:        return Icons.notifications;
  }
}

// 아바타 배경색 팔레트
const List<Color> _avatarColors = [
  Color(0xFF9C27B0), Color(0xFF3F51B5), Color(0xFFE91E63),
  Color(0xFF009688), Color(0xFFFF5722), Color(0xFF795548),
  Color(0xFF607D8B), Color(0xFF4CAF50), Color(0xFF2196F3),
];

const int _pageSize = 30;

class NotificationScreen extends StatefulWidget {
  final NotificationMode mode;
  const NotificationScreen({super.key, required this.mode});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading     = true;
  bool _loadingMore = false;
  bool _hasMore     = false;
  int  _offset      = 0;
  String? _error;
  String _token     = '';

  // 채널 필터
  List<Map<String, dynamic>> _channels    = []; // [{id, name, image_url}]
  String _selectedChannel = '전체';             // '전체' 또는 channel_name

  // 선택 모드
  bool _selectMode         = false;
  Set<String> _selectedIds = {};

  // 스크롤 컨트롤러 (무한스크롤)
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(refresh: true);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (!_loadingMore && _hasMore) {
        _loadMore();
      }
    }
  }

  // ── 초기/새로고침 로드 ──────────────────────────────
  Future<void> _load({bool refresh = false}) async {
    if (refresh) {
      setState(() {
        _loading    = true;
        _error      = null;
        _selectMode = false;
        _selectedIds = {};
        _offset     = 0;
        _items      = [];
        _hasMore    = false;
      });
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';

      final result = await _fetchPage(offset: 0);
      if (!mounted) return;

      if (result != null) {
        // 첫 로드 시 채널 필터 목록 갱신 (offset=0일 때만 서버가 channels 반환)
        final newChannels = result['channels'] as List<Map<String, dynamic>>? ?? [];

        setState(() {
          _items    = result['data'] as List<Map<String, dynamic>>;
          _hasMore  = result['hasMore'] as bool;
          _offset   = _items.length;
          _loading  = false;
          if (newChannels.isNotEmpty) {
            _channels = newChannels;
          }
          // 선택 중인 채널이 목록에 없으면 전체로 초기화
          if (_selectedChannel != '전체' &&
              !_channels.any((c) => c['name'] == _selectedChannel)) {
            _selectedChannel = '전체';
          }
        });
      } else {
        setState(() { _loading = false; _error = '목록을 불러올 수 없습니다.'; });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  // ── 추가 페이지 로드 (무한스크롤) ──────────────────
  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);

    try {
      final result = await _fetchPage(offset: _offset);
      if (!mounted) return;

      if (result != null) {
        setState(() {
          _items.addAll(result['data'] as List<Map<String, dynamic>>);
          _hasMore = result['hasMore'] as bool;
          _offset  = _items.length;
          _loadingMore = false;
        });
      } else {
        setState(() => _loadingMore = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  // ── API 호출 공통 로직 ──────────────────────────────
  Future<Map<String, dynamic>?> _fetchPage({required int offset}) async {
    final baseUrl = widget.mode == NotificationMode.inbox
        ? '$kBaseUrl/api/alarms/inbox'
        : '$kBaseUrl/api/alarms/outbox';

    // 채널 필터 적용 시 channel_id 파라미터 추가
    final selectedChannelId = _channels
        .where((c) => c['name'] == _selectedChannel)
        .map((c) => c['id']?.toString() ?? '')
        .firstOrNull ?? '';

    final uri = Uri.parse(baseUrl).replace(queryParameters: {
      'limit':  '$_pageSize',
      'offset': '$offset',
      if (selectedChannelId.isNotEmpty) 'channel_id': selectedChannelId,
    });

    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $_token'},
    ).timeout(const Duration(seconds: 15));

    if (res.statusCode != 200) return null;

    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['success'] != true) return null;

    // data: 플랫 배열
    final rawData = body['data'];
    final List<Map<String, dynamic>> items = [];
    if (rawData is List) {
      for (final item in rawData) {
        items.add(Map<String, dynamic>.from(item as Map));
      }
    }

    // channels: 첫 로드 시만 반환됨
    final rawChannels = body['channels'];
    final List<Map<String, dynamic>> channels = [];
    if (rawChannels is List) {
      for (final ch in rawChannels) {
        channels.add(Map<String, dynamic>.from(ch as Map));
      }
    }

    final total   = (body['total'] as num?)?.toInt() ?? 0;
    final hasMore = body['hasMore'] == true || (offset + items.length) < total;

    return {
      'data':     items,
      'channels': channels,
      'hasMore':  hasMore,
      'total':    total,
    };
  }

  // ── 채널 필터 변경 ──────────────────────────────────
  void _onChannelFilter(String name) {
    if (_selectedChannel == name) return;
    setState(() { _selectedChannel = name; });
    _load(refresh: true);
  }

  // ── 날짜 포맷 ──────────────────────────────────────
  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      final now   = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final day   = DateTime(dt.year, dt.month, dt.day);
      final hm    = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      if (day == today) return '오늘 $hm';
      if (today.difference(day).inDays == 1) return '어제 $hm';
      return '${dt.month}/${dt.day} $hm';
    } catch (_) {
      return raw.toString();
    }
  }

  // ── 선택 삭제 ──────────────────────────────────────
  Future<void> _deleteSelected() async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;

    final endpoint = widget.mode == NotificationMode.inbox
        ? '$kBaseUrl/api/alarms/inbox/bulk-delete'
        : '$kBaseUrl/api/alarms/outbox/bulk-delete';

    try {
      await http.post(
        Uri.parse(endpoint),
        headers: {'Authorization': 'Bearer $_token', 'Content-Type': 'application/json'},
        body: jsonEncode({'log_ids': _selectedIds.toList()}),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}

    if (mounted) {
      showCenterToast(context, '$count개 항목이 삭제되었습니다.');
      _load(refresh: true);
    }
  }

  // ── 아이템 탭 ──────────────────────────────────────
  void _onItemTap(Map<String, dynamic> item) {
    if (_selectMode) {
      final id = item['id']?.toString() ?? '';
      setState(() {
        if (_selectedIds.contains(id)) {
          _selectedIds.remove(id);
        } else {
          _selectedIds.add(id);
        }
      });
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ContentPlayerScreen(alarm: item)),
    );
  }

  // ── 현재 보이는 아이템 목록 (채널 필터는 서버에서 처리) ──
  List<Map<String, dynamic>> get _displayed => _items;

  @override
  Widget build(BuildContext context) {
    final title = widget.mode == NotificationMode.inbox ? '수신함' : '발신함';

    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          // ── 헤더 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
            child: _selectMode
                ? Row(
                    children: [
                      Checkbox(
                        value: _displayed.isNotEmpty &&
                            _displayed.every((i) => _selectedIds.contains(i['id']?.toString() ?? '')),
                        onChanged: (v) {
                          setState(() {
                            if (v == true) {
                              _selectedIds = _displayed.map((i) => i['id']?.toString() ?? '').toSet();
                            } else {
                              _selectedIds.clear();
                            }
                          });
                        },
                        activeColor: _primary,
                      ),
                      Text('${_selectedIds.length}개 선택',
                          style: const TextStyle(color: _text, fontSize: 14)),
                      const Spacer(),
                      ElevatedButton(
                        onPressed: _selectedIds.isNotEmpty ? _deleteSelected : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _red,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(60, 34),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('삭제', style: TextStyle(fontSize: 13)),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () => setState(() { _selectMode = false; _selectedIds.clear(); }),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(50, 34),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          side: const BorderSide(color: _border),
                        ),
                        child: const Text('취소', style: TextStyle(fontSize: 13, color: _text)),
                      ),
                      const SizedBox(width: 8),
                    ],
                  )
                : Row(
                    children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.remove_circle_outline, color: _text2, size: 22),
                        onPressed: () => setState(() { _selectMode = true; _selectedIds.clear(); }),
                      ),
                    ],
                  ),
          ),

          // ── 채널 필터 탭 ──
          if (_channels.isNotEmpty)
            SizedBox(
              height: 36,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: _channels.length + 1, // +1: '전체' 탭
                itemBuilder: (context, i) {
                  final name     = i == 0 ? '전체' : (_channels[i - 1]['name']?.toString() ?? '');
                  final selected = name == _selectedChannel;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => _onChannelFilter(name),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: selected ? _primary : Colors.transparent,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: selected ? _primary : _border,
                          ),
                        ),
                        child: Text(
                          name,
                          style: TextStyle(
                            fontSize: 13,
                            color: selected ? Colors.white : _text2,
                            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

          if (_channels.isNotEmpty) const SizedBox(height: 4),

          // ── 목록 ──
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _primary))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.error_outline, size: 48, color: Colors.grey[300]),
                            const SizedBox(height: 12),
                            Text(_error!, style: const TextStyle(color: _text2)),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: () => _load(refresh: true),
                              child: const Text('다시 시도'),
                            ),
                          ],
                        ),
                      )
                    : _displayed.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  widget.mode == NotificationMode.inbox
                                      ? Icons.inbox
                                      : Icons.send,
                                  size: 56, color: Colors.grey[300],
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  widget.mode == NotificationMode.inbox
                                      ? '받은 알람이 없습니다.'
                                      : '보낸 알람이 없습니다.',
                                  style: const TextStyle(color: _text2),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            color: _primary,
                            onRefresh: () => _load(refresh: true),
                            child: ListView.builder(
                              controller: _scrollController,
                              // hasMore이면 마지막에 로딩 인디케이터 추가
                              itemCount: _displayed.length + (_hasMore ? 1 : 0),
                              itemBuilder: (context, index) {
                                // 맨 마지막 → 로딩 인디케이터
                                if (index == _displayed.length) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 16),
                                    child: Center(
                                      child: CircularProgressIndicator(
                                        color: _primary, strokeWidth: 2,
                                      ),
                                    ),
                                  );
                                }
                                final item = _displayed[index];
                                return _AlarmListTile(
                                  item:        item,
                                  colorIndex:  index % _avatarColors.length,
                                  selectMode:  _selectMode,
                                  selected:    _selectedIds.contains(item['id']?.toString() ?? ''),
                                  onTap:       () => _onItemTap(item),
                                  formatDate:  _formatDate,
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

// ── 알람 아이템 타일 ──────────────────────────────────
class _AlarmListTile extends StatelessWidget {
  final Map<String, dynamic> item;
  final int colorIndex;
  final bool selectMode;
  final bool selected;
  final VoidCallback onTap;
  final String Function(dynamic) formatDate;

  const _AlarmListTile({
    required this.item,
    required this.colorIndex,
    required this.selectMode,
    required this.selected,
    required this.onTap,
    required this.formatDate,
  });

  @override
  Widget build(BuildContext context) {
    final channelName  = item['channel_name']?.toString() ?? '';
    final channelImage = item['channel_image']?.toString();
    final contentType  = item['msg_type']?.toString() ?? item['content_type']?.toString() ?? '';
    final scheduledAt  = item['scheduled_at'] ?? item['received_at'] ?? item['created_at'];
    final avatarColor  = _avatarColors[colorIndex];

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? _primary.withOpacity(0.06) : Colors.transparent,
          border: const Border(bottom: BorderSide(color: _border, width: 0.5)),
        ),
        child: Row(
          children: [
            // 선택 모드 체크 원
            if (selectMode)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Container(
                  width: 20, height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: selected ? _primary : _border, width: 1.5),
                    color: selected ? _primary : Colors.transparent,
                  ),
                  child: selected
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : null,
                ),
              ),
            // 채널 아바타
            channelAvatar(
              imageUrl:     channelImage,
              name:         channelName,
              size:         42,
              bgColor:      avatarColor,
              borderRadius: 10,
            ),
            const SizedBox(width: 10),
            // 콘텐츠 타입 아이콘
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                color: _typeColor(contentType).withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(
                _typeIcon(contentType),
                size:  16,
                color: _typeColor(contentType),
              ),
            ),
            const SizedBox(width: 10),
            // 채널명
            Expanded(
              child: Text(
                channelName.isEmpty ? '(채널 없음)' : channelName,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w500, color: _text),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            // 날짜
            Text(
              formatDate(scheduledAt),
              style: const TextStyle(fontSize: 12, color: _text2),
            ),
          ],
        ),
      ),
    );
  }
}
