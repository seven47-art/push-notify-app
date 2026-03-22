// lib/screens/notification_screen.dart
// 수신함(inbox) / 발신함(outbox)
// - API 페이지네이션(limit/offset) 기반 무한스크롤
// - 채널 필터 탭(가로스크롤) + 선택/삭제 모드
// - 리스트 탭 → 팝업 다이얼로그 (알람재생 / 신고하기 / 삭제하기)
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/image_helper.dart';
import '../utils/toast_helper.dart';

enum NotificationMode { inbox, outbox }

// ── 색상 ──────────────────────────────────────────
const _bg      = Color(0xFFFFFFFF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _primary = Color(0xFF6C63FF);
const _red     = Color(0xFFFF4444);

// ── MethodChannel (Kotlin ContentPlayerActivity 호출) ──
const _scheduleChannel = MethodChannel('com.pushnotify.push_notify_app/alarm');

// 콘텐츠 타입 라벨
String _typeLabel(String type) {
  switch (type) {
    case 'youtube': return 'YouTube';
    case 'audio':   return '오디오';
    case 'video':   return '비디오';
    default:        return '알람';
  }
}

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
  State<NotificationScreen> createState() => NotificationScreenState();
}

// 퍼블릭 State - 외부(MainScreenState)에서 GlobalKey로 reload() 호출 가능
class NotificationScreenState extends State<NotificationScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading     = true;
  bool _loadingMore = false;
  bool _hasMore     = false;
  int  _offset      = 0;
  String? _error;
  String _token     = '';

  // 채널 필터
  List<Map<String, dynamic>> _channels = [];
  String _selectedChannel = '전체';

  // 선택 모드
  bool _selectMode         = false;
  Set<String> _selectedIds = {};

  // 스크롤 컨트롤러 (무한스크롤)
  final ScrollController _scrollController = ScrollController();

  // 캐시 키 (수신함/발신함 별도)
  String get _cacheKey => widget.mode == NotificationMode.inbox
      ? 'cache_notif_inbox' : 'cache_notif_outbox';
  String get _cacheKeyChannels => widget.mode == NotificationMode.inbox
      ? 'cache_notif_inbox_ch' : 'cache_notif_outbox_ch';

  // 외부에서 reload 호출 가능하도록 public 메서드
  void reload() => _load(refresh: true);

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadCacheThenFetch();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  // 캐시 먼저 표시 → 백그라운드 API 갱신
  Future<void> _loadCacheThenFetch() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_cacheKey);
    if (cached != null && cached.isNotEmpty) {
      try {
        final list = (jsonDecode(cached) as List).map((e) => Map<String, dynamic>.from(e)).toList();
        final cachedCh = prefs.getString(_cacheKeyChannels);
        List<Map<String, dynamic>> channels = [];
        if (cachedCh != null && cachedCh.isNotEmpty) {
          channels = (jsonDecode(cachedCh) as List).map((e) => Map<String, dynamic>.from(e)).toList();
        }
        if (mounted && list.isNotEmpty) {
          setState(() {
            _items = list;
            _channels = channels;
            _loading = false;
          });
        }
      } catch (_) {}
    }
    _load(refresh: true);
  }

  // 캐시 저장
  Future<void> _saveCache() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      await prefs.setString(_cacheKey, jsonEncode(_items));
      await prefs.setString(_cacheKeyChannels, jsonEncode(_channels));
    } catch (_) {}
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (!_loadingMore && _hasMore && _selectedChannel == '전체') _loadMore();
    }
  }

  // ── 초기/새로고침 로드 ──────────────────────────────
  Future<void> _load({bool refresh = false}) async {
    if (refresh) {
      // 캐시에 데이터가 있으면 로딩 스피너 표시 안 함
      if (_items.isEmpty) {
        setState(() {
          _loading     = true;
          _error       = null;
          _selectMode  = false;
          _selectedIds = {};
          _offset      = 0;
          _hasMore     = false;
        });
      } else {
        setState(() {
          _error       = null;
          _selectMode  = false;
          _selectedIds = {};
          _offset      = 0;
          _hasMore     = false;
        });
      }
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';

      final result = await _fetchPage(offset: 0);
      if (!mounted) return;

      if (result != null) {
        final newChannels = result['channels'] as List<Map<String, dynamic>>? ?? [];
        setState(() {
          _items   = result['data'] as List<Map<String, dynamic>>;
          _hasMore = result['hasMore'] as bool;
          _offset  = _items.length;
          _loading = false;
          // 채널 목록은 첫 로드(전체 조회)일 때만 갱신 → 필터 선택해도 칩 목록 유지
          if (newChannels.isNotEmpty && _selectedChannel == '전체') {
            _channels = newChannels;
          }
          if (_selectedChannel != '전체' &&
              !_channels.any((c) => c['name'] == _selectedChannel)) {
            _selectedChannel = '전체';
          }
        });
        _saveCache();
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
          _hasMore     = result['hasMore'] as bool;
          _offset      = _items.length;
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

    // 항상 전체 데이터 요청 (필터링은 클라이언트에서 처리)
    final uri = Uri.parse(baseUrl).replace(queryParameters: {
      'limit':  '$_pageSize',
      'offset': '$offset',
    });

    final res = await http.get(
      uri,
      headers: {'Authorization': 'Bearer $_token'},
    ).timeout(const Duration(seconds: 15));

    if (res.statusCode != 200) return null;

    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['success'] != true) return null;

    final rawData = body['data'];
    final List<Map<String, dynamic>> items = [];
    if (rawData is List) {
      for (final item in rawData) {
        items.add(Map<String, dynamic>.from(item as Map));
      }
    }

    final rawChannels = body['channels'];
    final List<Map<String, dynamic>> channels = [];
    if (rawChannels is List) {
      for (final ch in rawChannels) {
        channels.add(Map<String, dynamic>.from(ch as Map));
      }
    }

    final total   = (body['total'] as num?)?.toInt() ?? 0;
    final hasMore = body['hasMore'] == true || (offset + items.length) < total;

    return {'data': items, 'channels': channels, 'hasMore': hasMore, 'total': total};
  }

  // ── 채널 필터 변경 (클라이언트 측 필터링 – 서버 재호출 없음) ──
  void _onChannelFilter(String name) {
    if (_selectedChannel == name) return;
    setState(() => _selectedChannel = name);
    // 필터 결과가 비어있고 서버에 더 있으면 백그라운드 추가 로드
    if (name != '전체' && _hasMore) {
      _ensureFilteredData();
    }
  }

  // ── 필터 결과 부족 시 백그라운드 추가 로드 ──────────────
  Future<void> _ensureFilteredData() async {
    // _displayed가 비어있거나 너무 적으면 서버에서 추가 페이지 가져오기
    while (mounted && _hasMore && _displayed.isEmpty) {
      final result = await _fetchPage(offset: _offset);
      if (!mounted || result == null) break;
      final newData = result['data'] as List<Map<String, dynamic>>;
      if (newData.isEmpty) break;
      setState(() {
        _items.addAll(newData);
        _hasMore = result['hasMore'] as bool;
        _offset  = _items.length;
      });
    }
  }

  // ── 날짜 포맷 ──────────────────────────────────────
  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt    = DateTime.parse(raw.toString()).toLocal();
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

  // ── 선택 삭제 (상단 선택모드) ───────────────────────
  Future<void> _deleteSelected() async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    await _deleteLogIds(_selectedIds.toList());
    if (mounted) {
      showCenterToast(context, '$count개 항목이 삭제되었습니다.');
      _load(refresh: true);
    }
  }

  // ── 단건 삭제 (다이얼로그에서 호출) ────────────────
  Future<void> _deleteSingle(String logId) async {
    await _deleteLogIds([logId]);
    if (mounted) {
      showCenterToast(context, '삭제되었습니다.');
      _load(refresh: true);
    }
  }

  // ── bulk-delete 공통 호출 ──────────────────────────
  Future<void> _deleteLogIds(List<String> ids) async {
    final endpoint = widget.mode == NotificationMode.inbox
        ? '$kBaseUrl/api/alarms/inbox/bulk-delete'
        : '$kBaseUrl/api/alarms/outbox/bulk-delete';
    try {
      await http.post(
        Uri.parse(endpoint),
        headers: {'Authorization': 'Bearer $_token', 'Content-Type': 'application/json'},
        body: jsonEncode({'log_ids': ids}),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
  }

  // ── 알람 재생 (Kotlin ContentPlayerActivity) ───────
  Future<void> _playAlarm(Map<String, dynamic> item) async {
    final msgType     = item['msg_type']?.toString()      ?? '';
    final msgValue    = item['msg_value']?.toString()     ?? '';
    final channelName = item['channel_name']?.toString()  ?? '';
    final channelImg  = item['channel_image']?.toString() ?? '';
    final linkUrl     = item['link_url']?.toString()      ?? '';
    try {
      await _scheduleChannel.invokeMethod('openContentPlayer', {
        'msg_type':      msgType,
        'msg_value':     msgValue,
        'channel_name':  channelName,
        'channel_image': channelImg,
        'link_url':      linkUrl,
      });
    } catch (e) {
      if (mounted) showCenterToast(context, '재생을 시작할 수 없습니다.');
    }
  }

  // ── 신고 다이얼로그 ────────────────────────────────
  void _showReportDialog(Map<String, dynamic> item) {
    final channelId   = item['channel_id']?.toString()   ?? '';
    final channelName = item['channel_name']?.toString() ?? '';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReportSheet(
        channelId:   channelId,
        channelName: channelName,
        token:       _token,
      ),
    );
  }

  // ── 아이템 탭 → 팝업 다이얼로그 ───────────────────
  void _onItemTap(Map<String, dynamic> item, int colorIndex) {
    // 선택 모드 중이면 체크 토글
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

    // 팝업 다이얼로그 표시
    final channelName = item['channel_name']?.toString() ?? '';
    final contentType = item['msg_type']?.toString() ?? '';
    final logId       = item['id']?.toString() ?? '';

    showDialog(
      context: context,
      barrierColor: Colors.black54,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 40),
        child: _AlarmActionMenu(
          channelName:  channelName,
          contentType:  contentType,
          colorIndex:   colorIndex,
          onPlay: () {
            Navigator.pop(context);
            _playAlarm(item);
          },
          onReport: () {
            Navigator.pop(context);
            _showReportDialog(item);
          },
          onDelete: () {
            Navigator.pop(context);
            _deleteSingle(logId);
          },
        ),
      ),
    );
  }

  // 현재 필터에 해당하는 channel_id (캐시)
  String get _filterChannelId {
    if (_selectedChannel == '전체') return '';
    return _channels
        .where((c) => c['name'] == _selectedChannel)
        .map((c) => c['id']?.toString() ?? '')
        .firstOrNull ?? '';
  }

  List<Map<String, dynamic>> get _displayed {
    final fid = _filterChannelId;
    if (fid.isEmpty) return _items;
    return _items.where((item) => item['channel_id']?.toString() == fid).toList();
  }

  // 필터 활성 중에는 _hasMore를 그대로 쓰면 무한 스피너 → 필터 기준으로 판단
  bool get _showLoadMore {
    if (_selectedChannel == '전체') return _hasMore;
    // 필터 중: 서버에 더 있고 + 현재 백그라운드 로딩 중이면 표시
    return _hasMore && _loadingMore;
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
                itemCount: _channels.length + 1,
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
                          border: Border.all(color: selected ? _primary : _border),
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
                ? ListView.builder(
                    itemCount: 8,
                    itemBuilder: (_, __) => const _NotifSkeletonTile(),
                  )
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
                                      ? Icons.inbox : Icons.send,
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
                              itemCount: _displayed.length + (_showLoadMore ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == _displayed.length) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 16),
                                    child: Center(
                                      child: CircularProgressIndicator(
                                          color: _primary, strokeWidth: 2),
                                    ),
                                  );
                                }
                                final item = _displayed[index];
                                final ci   = index % _avatarColors.length;
                                return _AlarmListTile(
                                  item:       item,
                                  colorIndex: ci,
                                  selectMode: _selectMode,
                                  selected:   _selectedIds.contains(item['id']?.toString() ?? ''),
                                  onTap:      () => _onItemTap(item, ci),
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

// ════════════════════════════════════════════════════════
// 알람 액션 팝업 메뉴 (subscribed_channels_screen의 _ChannelPopupMenu 스타일 동일)
// ════════════════════════════════════════════════════════
class _AlarmActionMenu extends StatelessWidget {
  final String      channelName;
  final String      contentType;
  final int         colorIndex;
  final VoidCallback onPlay;
  final VoidCallback onReport;
  final VoidCallback onDelete;

  const _AlarmActionMenu({
    required this.channelName,
    required this.contentType,
    required this.colorIndex,
    required this.onPlay,
    required this.onReport,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final typeLabel = _typeLabel(contentType);
    final typeColor = _typeColor(contentType);
    final typeIco   = _typeIcon(contentType);

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
          // ── 헤더: 채널명 + 콘텐츠 타입 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  channelName.isEmpty ? '(채널 없음)' : channelName,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFF222222)),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: typeColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(typeIco, size: 12, color: typeColor),
                          const SizedBox(width: 4),
                          Text(
                            typeLabel,
                            style: TextStyle(
                                fontSize: 12, color: typeColor, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),

          // ── 알람 재생 ──
          _MenuItem(
            icon:  Icons.play_circle_outline,
            label: '알람 재생',
            onTap: onPlay,
          ),

          // ── 신고하기 ──
          _MenuItem(
            icon:  Icons.flag_outlined,
            label: '신고하기',
            onTap: onReport,
          ),

          // ── 삭제하기 ──
          _MenuItem(
            icon:  Icons.delete_outline,
            label: '삭제하기',
            color: _red,
            onTap: onDelete,
          ),

          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

// 메뉴 항목 위젯
class _MenuItem extends StatelessWidget {
  final IconData   icon;
  final String     label;
  final Color?     color;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFF444444);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        child: Row(
          children: [
            Icon(icon, size: 20, color: c),
            const SizedBox(width: 14),
            Text(
              label,
              style: TextStyle(
                  fontSize: 15, color: color ?? const Color(0xFF222222), fontWeight: FontWeight.w400),
            ),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════
// 신고 바텀시트 (channel_detail_screen의 _ReportSheet 동일 구조)
// ════════════════════════════════════════════════════════
class _ReportSheet extends StatefulWidget {
  final String channelId;
  final String channelName;
  final String token;
  const _ReportSheet({
    required this.channelId,
    required this.channelName,
    required this.token,
  });

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  String? _selectedReason;
  final _detailCtrl = TextEditingController();
  bool _submitting  = false;

  static const _reasons = [
    '불법 광고 / 스팸',
    '사기 / 피싱',
    '음란 / 선정적 콘텐츠',
    '괴롭힘 / 혐오',
    '저작권 / 도용 의심',
    '기타',
  ];

  @override
  void dispose() {
    _detailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedReason == null) {
      showCenterToast(context, '신고 사유를 선택해주세요.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/reports'),
        headers: {
          'Authorization': 'Bearer ${widget.token}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'report_type':  'channel',
          'reason':       _selectedReason,
          'description':  _detailCtrl.text.trim(),
          'channel_id':   int.tryParse(widget.channelId) ?? widget.channelId,
          'channel_name': widget.channelName,
        }),
      ).timeout(const Duration(seconds: 10));

      final resBody = jsonDecode(res.body) as Map<String, dynamic>;
      if (!mounted) return;
      Navigator.pop(context);

      if (resBody['success'] == true) {
        showCenterToast(context, '신고가 접수되었습니다.');
      } else {
        final errMsg  = resBody['error']?.toString() ?? '신고 처리 중 오류가 발생했습니다.';
        final already = errMsg.contains('already') || errMsg.contains('이미') ||
                        errMsg.contains('동일한') || errMsg.contains('duplicate');
        showCenterToast(context, already ? '이미 신고한 채널입니다.' : errMsg);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      showCenterToast(context, '오류가 발생했습니다. 다시 시도해주세요.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(
          20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 핸들
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey[300], borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),

            // 타이틀
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('신고하기',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
                    Text(widget.channelName,
                        style: const TextStyle(fontSize: 13, color: _text2)),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: _text2),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 사유 선택
            const Text('신고 사유 선택',
                style: TextStyle(
                    fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            ..._reasons.map((reason) => RadioListTile<String>(
                  value:      reason,
                  groupValue: _selectedReason,
                  onChanged:  (v) => setState(() => _selectedReason = v),
                  title: Text(reason,
                      style: const TextStyle(fontSize: 14, color: _text)),
                  activeColor:    _primary,
                  contentPadding: EdgeInsets.zero,
                  dense:          true,
                )),
            const SizedBox(height: 12),

            // 상세 내용
            TextField(
              controller: _detailCtrl,
              maxLines:   3,
              maxLength:  200,
              decoration: InputDecoration(
                hintText:    '추가 내용을 입력해주세요 (선택)',
                hintStyle:   const TextStyle(fontSize: 13, color: _text2),
                filled:      true,
                fillColor:   const Color(0xFFF8F8F8),
                border:      OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide:   const BorderSide(color: _border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide:   const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide:   const BorderSide(color: _primary),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
            const SizedBox(height: 16),

            // 신고 버튼
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _primary,
                  foregroundColor: Colors.white,
                  minimumSize:     const Size(double.infinity, 50),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('신고하기',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════
// 알람 아이템 타일
// ════════════════════════════════════════════════════════
class _AlarmListTile extends StatelessWidget {
  final Map<String, dynamic> item;
  final int         colorIndex;
  final bool        selectMode;
  final bool        selected;
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
              child: Icon(_typeIcon(contentType), size: 16, color: _typeColor(contentType)),
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
            Text(formatDate(scheduledAt),
                style: const TextStyle(fontSize: 12, color: _text2)),
          ],
        ),
      ),
    );
  }
}

// ── 스켈레톤 로딩 타일 ─────────────────────────────────────────────────
class _NotifSkeletonTile extends StatelessWidget {
  const _NotifSkeletonTile();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _border, width: 0.5)),
      ),
      child: Row(
        children: [
          // 아바타 스켈레톤
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          const SizedBox(width: 10),
          // 타입 아이콘 스켈레톤
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          const SizedBox(width: 10),
          // 텍스트 스켈레톤
          Expanded(
            child: Container(
              width: 100, height: 14,
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 50, height: 11,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ],
      ),
    );
  }
}
