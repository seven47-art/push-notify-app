// lib/screens/notification_screen.dart
// 스크린샷 기준: 라이트 테마, 채널 필터 탭(가로스크롤) + 알람 목록 + 선택/삭제 모드
// 수신함(inbox): 수신함 제목 + minus 아이콘 / 발신함(outbox): 발신함 제목 + minus 아이콘
// 알람 아이템: [채널아바타] [컨텐츠타입아이콘] [채널명] [날짜/시간]
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

class NotificationScreen extends StatefulWidget {
  final NotificationMode mode;
  const NotificationScreen({super.key, required this.mode});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  List<Map<String, dynamic>> _items    = [];
  bool _loading  = true;
  String? _error;
  String _token  = '';

  // 채널 필터
  List<String> _channelNames = [];
  String _selectedChannel    = '전체';

  // 선택 모드
  bool _selectMode          = false;
  Set<String> _selectedIds  = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; _selectMode = false; _selectedIds = {}; });
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';

      final url = widget.mode == NotificationMode.inbox
          ? '$kBaseUrl/api/alarms/inbox'
          : '$kBaseUrl/api/alarms/outbox';

      final res = await http.get(
        Uri.parse(url),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final rawData = body['data'];
          List<Map<String, dynamic>> flatItems = [];

          if (rawData is List) {
            for (final item in rawData) {
              final m = Map<String, dynamic>.from(item as Map);
              if (m.containsKey('items') && m['items'] is List) {
                for (final sub in m['items'] as List) {
                  final s = Map<String, dynamic>.from(sub as Map);
                  s['channel_name'] ??= m['channel_name'];
                  s['channel_image'] ??= m['channel_image'];
                  flatItems.add(s);
                }
              } else {
                flatItems.add(m);
              }
            }
          }

          // 발신함 중복 제거
          if (widget.mode == NotificationMode.outbox) {
            final seen = <dynamic>{};
            flatItems = flatItems.where((item) {
              final key = item['alarm_id'] ?? 'log_${item['id']}';
              if (seen.contains(key)) return false;
              seen.add(key);
              return true;
            }).toList();
          }

          // 채널 필터 목록
          final names = <String>{'전체'};
          for (final item in flatItems) {
            final ch = item['channel_name']?.toString();
            if (ch != null && ch.isNotEmpty) names.add(ch);
          }

          if (mounted) {
            setState(() {
              _items = flatItems;
              _channelNames = names.toList();
              if (!_channelNames.contains(_selectedChannel)) _selectedChannel = '전체';
              _loading = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '목록을 불러올 수 없습니다.'; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_selectedChannel == '전체') return _items;
    return _items.where((i) => i['channel_name']?.toString() == _selectedChannel).toList();
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final itemDay = DateTime(dt.year, dt.month, dt.day);
      final hm = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      if (itemDay == today) return '오늘 $hm';
      if (today.difference(itemDay).inDays == 1) return '어제 $hm';
      return '${dt.month}/${dt.day} $hm';
    } catch (_) {
      return raw.toString();
    }
  }

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
      _load();
    }
  }

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
    // 콘텐츠 플레이어 열기
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ContentPlayerScreen(alarm: item),
      ),
    );
  }

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
                        value: _filtered.isNotEmpty &&
                            _filtered.every((i) => _selectedIds.contains(i['id']?.toString() ?? '')),
                        onChanged: (v) {
                          setState(() {
                            if (v == true) {
                              _selectedIds = _filtered.map((i) => i['id']?.toString() ?? '').toSet();
                            } else {
                              _selectedIds.clear();
                            }
                          });
                        },
                        activeColor: _primary,
                      ),
                      Text('${_selectedIds.length}개 선택', style: const TextStyle(color: _text, fontSize: 14)),
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
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.remove_circle_outline, color: _text2, size: 22),
                        onPressed: () => setState(() { _selectMode = true; _selectedIds.clear(); }),
                      ),
                    ],
                  ),
          ),
          // ── 채널 필터 탭 ──
          if (_channelNames.length > 1)
            SizedBox(
              height: 36,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: _channelNames.length,
                itemBuilder: (context, i) {
                  final name = _channelNames[i];
                  final selected = name == _selectedChannel;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => setState(() => _selectedChannel = name),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: selected ? _primary : Colors.transparent,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: selected ? _primary : _border,
                            width: 1,
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
          const SizedBox(height: 4),
          // ── 목록 ──
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _primary))
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.error_outline, size: 48, color: Colors.grey[300]),
                          const SizedBox(height: 12),
                          Text(_error!, style: const TextStyle(color: _text2)),
                          const SizedBox(height: 12),
                          TextButton(onPressed: _load, child: const Text('다시 시도')),
                        ],
                      ))
                    : _filtered.isEmpty
                        ? Center(child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                widget.mode == NotificationMode.inbox ? Icons.inbox : Icons.send,
                                size: 56, color: Colors.grey[300],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                widget.mode == NotificationMode.inbox
                                    ? '받은 알람이 없습니다.' : '보낸 알람이 없습니다.',
                                style: const TextStyle(color: _text2),
                              ),
                            ],
                          ))
                        : RefreshIndicator(
                            color: _primary,
                            onRefresh: _load,
                            child: ListView.builder(
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) {
                                final item = _filtered[index];
                                return _AlarmListTile(
                                  item: item,
                                  colorIndex: index % _avatarColors.length,
                                  selectMode: _selectMode,
                                  selected: _selectedIds.contains(item['id']?.toString() ?? ''),
                                  onTap: () => _onItemTap(item),
                                  formatDate: _formatDate,
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
    final scheduledAt  = item['scheduled_at'] ?? item['created_at'];
    final avatarColor  = _avatarColors[colorIndex];
    final initial      = channelName.isNotEmpty ? channelName[0].toUpperCase() : '?';

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
            if (selectMode)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Container(
                  width: 20, height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: selected ? _primary : _border, width: 1.5),
                    color: selected ? _primary : Colors.transparent,
                  ),
                  child: selected
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : null,
                ),
              ),
            // 채널 아바타
            channelAvatar(
              imageUrl: channelImage,
              name: channelName,
              size: 42,
              bgColor: avatarColor,
              borderRadius: 10,
            ),
            const SizedBox(width: 10),
            // 콘텐츠 타입 아이콘
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: _typeColor(contentType).withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(
                _typeIcon(contentType),
                size: 16,
                color: _typeColor(contentType),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                channelName.isEmpty ? '(채널 없음)' : channelName,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: _text),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
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
