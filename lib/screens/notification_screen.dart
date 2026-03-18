// lib/screens/notification_screen.dart
// 수신함 / 발신함 — WebView screen-inbox / screen-send 대체
// API: GET /api/alarms/inbox, GET /api/alarms/outbox
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'content_player_screen.dart';

// ── 색상 상수 ──────────────────────────────────────────────
const _bg      = Color(0xFF121212);
const _bg2     = Color(0xFF1E1E2E);
const _bg3     = Color(0xFF2A2A3E);
const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF1DE9B6);
const _text    = Colors.white;
const _text2   = Color(0xFFB0B0C8);
const _text3   = Color(0xFF64748B);
const _border  = Color(0xFF3A3A55);
const _red     = Color(0xFFEF4444);

// ── 탭 인덱스 (외부에서 특정 탭으로 열 때 사용) ──────────────
class NotificationScreen extends StatefulWidget {
  final int initialTab; // 0: 수신함, 1: 발신함
  const NotificationScreen({super.key, this.initialTab = 0});

  @override
  State<NotificationScreen> createState() => NotificationScreenState();
}

// State를 public으로 선언해 MainScreen에서 GlobalKey로 접근 가능하게 함
class NotificationScreenState extends State<NotificationScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // ── 수신함 state ──────────────────────────────────────
  List<Map<String, dynamic>> _inboxItems    = [];
  List<Map<String, dynamic>> _inboxChannels = []; // 필터용 채널 목록
  int?   _inboxChannelFilter;                     // 선택된 채널 ID
  bool   _inboxLoading  = true;
  bool   _inboxHasMore  = false;
  int    _inboxOffset   = 0;
  String? _inboxError;
  bool   _inboxEditMode = false;
  final Set<int> _inboxSelected = {};

  // ── 발신함 state ──────────────────────────────────────
  List<Map<String, dynamic>> _outboxItems    = [];
  List<Map<String, dynamic>> _outboxChannels = [];
  int?   _outboxChannelFilter;
  bool   _outboxLoading  = true;
  bool   _outboxHasMore  = false;
  int    _outboxOffset   = 0;
  String? _outboxError;
  bool   _outboxEditMode = false;
  final Set<int> _outboxSelected = {};

  static const int _limit = 20;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
        length: 2, vsync: this, initialIndex: widget.initialTab);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        if (_tabController.index == 0 && _inboxItems.isEmpty) _loadInbox();
        if (_tabController.index == 1 && _outboxItems.isEmpty) _loadOutbox();
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

  // ── 외부에서 탭 재방문 시 호출하는 새로고침 메서드 ──────────
  void refresh() {
    _loadInbox();
    _loadOutbox();
  }

  // ── 토큰 ─────────────────────────────────────────────
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('session_token');
  }

  // ════════════════════════════════════════════════════
  // 수신함 API
  // ════════════════════════════════════════════════════
  Future<void> _loadInbox({bool refresh = true}) async {
    if (refresh) {
      setState(() {
        _inboxLoading = true; _inboxError = null;
        _inboxOffset = 0; _inboxItems = [];
      });
    }
    try {
      final token = await _getToken();
      if (token == null || token.isEmpty) {
        setState(() { _inboxLoading = false; _inboxError = '로그인이 필요합니다'; });
        return;
      }
      final offset = refresh ? 0 : _inboxOffset;
      final params = StringBuffer('limit=$_limit&offset=$offset');
      if (_inboxChannelFilter != null) params.write('&channel_id=$_inboxChannelFilter');

      final res = await http.get(
        Uri.parse('$kBaseUrl/api/alarms/inbox?$params'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));

      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final newItems = List<Map<String, dynamic>>.from(
              (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
          final channels = body['channels'] != null
              ? List<Map<String, dynamic>>.from(
                  (body['channels'] as List).map((e) => Map<String, dynamic>.from(e)))
              : <Map<String, dynamic>>[];
          setState(() {
            if (refresh) {
              _inboxItems = newItems;
              if (channels.isNotEmpty) _inboxChannels = channels;
            } else {
              _inboxItems = [..._inboxItems, ...newItems];
            }
            _inboxHasMore = body['hasMore'] == true;
            _inboxOffset  = _inboxItems.length;
            _inboxLoading = false;
          });
        } else {
          setState(() { _inboxLoading = false; _inboxError = body['error']?.toString(); });
        }
      } else if (res.statusCode == 401) {
        setState(() { _inboxLoading = false; _inboxError = '인증이 만료됐습니다'; });
      } else {
        setState(() { _inboxLoading = false; _inboxError = '서버 오류 (${res.statusCode})'; });
      }
    } catch (e) {
      if (mounted) setState(() { _inboxLoading = false; _inboxError = '연결 실패'; });
    }
  }

  Future<void> _deleteInboxSelected() async {
    if (_inboxSelected.isEmpty) return;
    final token = await _getToken();
    if (token == null) return;
    try {
      await http.post(
        Uri.parse('$kBaseUrl/api/alarms/inbox/bulk-delete'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({'log_ids': _inboxSelected.toList()}),
      ).timeout(const Duration(seconds: 15));
      setState(() { _inboxSelected.clear(); _inboxEditMode = false; });
      _loadInbox();
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════
  // 발신함 API
  // ════════════════════════════════════════════════════
  Future<void> _loadOutbox({bool refresh = true}) async {
    if (refresh) {
      setState(() {
        _outboxLoading = true; _outboxError = null;
        _outboxOffset = 0; _outboxItems = [];
      });
    }
    try {
      final token = await _getToken();
      if (token == null || token.isEmpty) {
        setState(() { _outboxLoading = false; _outboxError = '로그인이 필요합니다'; });
        return;
      }
      final offset = refresh ? 0 : _outboxOffset;
      final params = StringBuffer('limit=$_limit&offset=$offset');
      if (_outboxChannelFilter != null) params.write('&channel_id=$_outboxChannelFilter');

      final res = await http.get(
        Uri.parse('$kBaseUrl/api/alarms/outbox?$params'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));

      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final newItems = List<Map<String, dynamic>>.from(
              (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
          final channels = body['channels'] != null
              ? List<Map<String, dynamic>>.from(
                  (body['channels'] as List).map((e) => Map<String, dynamic>.from(e)))
              : <Map<String, dynamic>>[];
          // alarm_id 기준 중복 제거
          final seen = <dynamic>{};
          final deduped = newItems.where((item) {
            final key = (item['alarm_id'] != null && item['alarm_id'] != 0)
                ? item['alarm_id']
                : 'log_${item['id']}';
            return seen.add(key);
          }).toList();
          setState(() {
            if (refresh) {
              _outboxItems = deduped;
              if (channels.isNotEmpty) _outboxChannels = channels;
            } else {
              _outboxItems = [..._outboxItems, ...deduped];
            }
            _outboxHasMore = body['hasMore'] == true;
            _outboxOffset  = _outboxItems.length;
            _outboxLoading = false;
          });
        } else {
          setState(() { _outboxLoading = false; _outboxError = body['error']?.toString(); });
        }
      } else {
        setState(() { _outboxLoading = false; _outboxError = '서버 오류 (${res.statusCode})'; });
      }
    } catch (e) {
      if (mounted) setState(() { _outboxLoading = false; _outboxError = '연결 실패'; });
    }
  }

  Future<void> _deleteOutboxSelected() async {
    if (_outboxSelected.isEmpty) return;
    final token = await _getToken();
    if (token == null) return;
    try {
      await http.post(
        Uri.parse('$kBaseUrl/api/alarms/outbox/bulk-delete'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({'log_ids': _outboxSelected.toList()}),
      ).timeout(const Duration(seconds: 15));
      setState(() { _outboxSelected.clear(); _outboxEditMode = false; });
      _loadOutbox();
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════
  // 콘텐츠 재생 (수신함은 열람 시 status 'accepted' 처리)
  // ════════════════════════════════════════════════════
  void _openContent(Map<String, dynamic> item, String source) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ContentPlayerScreen(
        logId:        item['id'] as int? ?? 0,
        channelId:    item['channel_id'] as int? ?? 0,
        channelName:  item['channel_name']?.toString() ?? '',
        channelImage: item['channel_image']?.toString() ?? '',
        msgType:      item['msg_type']?.toString() ?? '',
        msgValue:     item['msg_value']?.toString() ?? '',
        linkUrl:      item['link_url']?.toString() ?? '',
        source:       source,
      ),
    )).then((_) {
      // ContentPlayerScreen 닫힌 후 해당 탭 새로고침
      if (!mounted) return;
      if (source == 'inbox') _loadInbox();
      else _loadOutbox();
    });
  }

  // ════════════════════════════════════════════════════
  // BUILD
  // ════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildInboxTab(),
                _buildOutboxTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── 탭 헤더 (수신함/발신함 + 편집 버튼) ──────────────────
  Widget _buildTabHeader() {
    final isInbox = _tabController.index == 0;
    final editMode = isInbox ? _inboxEditMode : _outboxEditMode;
    final selected = isInbox ? _inboxSelected : _outboxSelected;

    return AnimatedBuilder(
      animation: _tabController,
      builder: (_, __) {
        final isInboxNow = _tabController.index == 0;
        final editModeNow = isInboxNow ? _inboxEditMode : _outboxEditMode;
        final selectedNow = isInboxNow ? _inboxSelected : _outboxSelected;

        return Container(
          color: _bg2,
          child: SafeArea(
            bottom: false,
            child: Column(
              children: [
                // 헤더 바
                SizedBox(
                  height: 52,
                  child: editModeNow
                      ? _buildEditBar(isInboxNow, selectedNow)
                      : _buildNormalBar(isInboxNow),
                ),
                // 탭바
                TabBar(
                  controller: _tabController,
                  indicatorColor: _primary,
                  indicatorWeight: 2,
                  labelColor: _primary,
                  unselectedLabelColor: _text3,
                  labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  tabs: const [
                    Tab(text: '수신함'),
                    Tab(text: '발신함'),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildNormalBar(bool isInbox) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Text(isInbox ? '수신함' : '발신함',
              style: const TextStyle(
                  color: _text, fontSize: 18, fontWeight: FontWeight.bold)),
          const Spacer(),
          GestureDetector(
            onTap: () => setState(() {
              if (isInbox) {
                _inboxEditMode = !_inboxEditMode;
                _inboxSelected.clear();
              } else {
                _outboxEditMode = !_outboxEditMode;
                _outboxSelected.clear();
              }
            }),
            child: Icon(Icons.remove_circle_outline,
                color: _text3, size: 22),
          ),
        ],
      ),
    );
  }

  Widget _buildEditBar(bool isInbox, Set<int> selected) {
    final items = isInbox ? _inboxItems : _outboxItems;
    final allSelected = items.isNotEmpty && selected.length == items.length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => setState(() {
              if (allSelected) {
                selected.clear();
              } else {
                selected.addAll(items.map((e) => e['id'] as int? ?? 0));
              }
            }),
            child: Row(
              children: [
                Icon(allSelected ? Icons.check_box : Icons.check_box_outline_blank,
                    color: _primary, size: 20),
                const SizedBox(width: 6),
                Text('전체선택',
                    style: TextStyle(
                        color: _text2, fontSize: 13)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text('${selected.length}개 선택',
              style: const TextStyle(color: _text3, fontSize: 13)),
          const Spacer(),
          if (selected.isNotEmpty)
            GestureDetector(
              onTap: isInbox ? _deleteInboxSelected : _deleteOutboxSelected,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                    color: _red, borderRadius: BorderRadius.circular(8)),
                child: const Text('삭제',
                    style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => setState(() {
              if (isInbox) { _inboxEditMode = false; _inboxSelected.clear(); }
              else { _outboxEditMode = false; _outboxSelected.clear(); }
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                  color: _bg3, borderRadius: BorderRadius.circular(8)),
              child: const Text('취소', style: TextStyle(color: _text, fontSize: 13)),
            ),
          ),
        ],
      ),
    );
  }

  // ════════════════════════════════════════════════════
  // 수신함 탭
  // ════════════════════════════════════════════════════
  Widget _buildInboxTab() {
    if (_inboxLoading) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
    if (_inboxError != null) {
      return _buildError(_inboxError!, _loadInbox);
    }
    return Column(
      children: [
        // 채널 필터
        if (_inboxChannels.isNotEmpty)
          _buildChannelFilter(
            channels: _inboxChannels,
            selected: _inboxChannelFilter,
            onSelect: (id) {
              setState(() { _inboxChannelFilter = id; });
              _loadInbox();
            },
          ),
        // 목록
        Expanded(
          child: _inboxItems.isEmpty
              ? _buildEmpty('수신된 알람이 없습니다', Icons.inbox_outlined)
              : RefreshIndicator(
                  onRefresh: _loadInbox,
                  color: _primary,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: _inboxItems.length + (_inboxHasMore ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i == _inboxItems.length) {
                        return _buildMoreBtn(() => _loadInbox(refresh: false));
                      }
                      return _buildAlarmItem(
                        item: _inboxItems[i],
                        source: 'inbox',
                        isSelected: _inboxSelected.contains(_inboxItems[i]['id']),
                        editMode: _inboxEditMode,
                        onTap: () => _openContent(_inboxItems[i], 'inbox'),
                        onSelect: (v) => setState(() {
                          final id = _inboxItems[i]['id'] as int? ?? 0;
                          v ? _inboxSelected.add(id) : _inboxSelected.remove(id);
                        }),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  // ════════════════════════════════════════════════════
  // 발신함 탭
  // ════════════════════════════════════════════════════
  Widget _buildOutboxTab() {
    if (_outboxLoading) {
      return const Center(child: CircularProgressIndicator(color: _primary));
    }
    if (_outboxError != null) {
      return _buildError(_outboxError!, _loadOutbox);
    }
    return Column(
      children: [
        if (_outboxChannels.isNotEmpty)
          _buildChannelFilter(
            channels: _outboxChannels,
            selected: _outboxChannelFilter,
            onSelect: (id) {
              setState(() { _outboxChannelFilter = id; });
              _loadOutbox();
            },
          ),
        Expanded(
          child: _outboxItems.isEmpty
              ? _buildEmpty('발송된 알람이 없습니다', Icons.outbox_outlined)
              : RefreshIndicator(
                  onRefresh: _loadOutbox,
                  color: _primary,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: _outboxItems.length + (_outboxHasMore ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i == _outboxItems.length) {
                        return _buildMoreBtn(() => _loadOutbox(refresh: false));
                      }
                      return _buildAlarmItem(
                        item: _outboxItems[i],
                        source: 'send',
                        isSelected: _outboxSelected.contains(_outboxItems[i]['id']),
                        editMode: _outboxEditMode,
                        onTap: () => _openContent(_outboxItems[i], 'send'),
                        onSelect: (v) => setState(() {
                          final id = _outboxItems[i]['id'] as int? ?? 0;
                          v ? _outboxSelected.add(id) : _outboxSelected.remove(id);
                        }),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  // ════════════════════════════════════════════════════
  // 공통 위젯
  // ════════════════════════════════════════════════════

  // 채널 필터 가로 스크롤
  Widget _buildChannelFilter({
    required List<Map<String, dynamic>> channels,
    required int? selected,
    required ValueChanged<int?> onSelect,
  }) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          // 전체
          _filterChip(label: '전체', selected: selected == null,
              onTap: () => onSelect(null)),
          ...channels.map((ch) => _filterChip(
              label: ch['name']?.toString() ?? '',
              selected: selected == ch['id'],
              onTap: () => onSelect(ch['id'] as int?))),
        ],
      ),
    );
  }

  Widget _filterChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? _primary.withOpacity(0.2) : _bg3,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? _primary : _border, width: 1),
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? _primary : _text2,
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.normal)),
      ),
    );
  }

  // 알람 아이템 (수신함/발신함 공용)
  Widget _buildAlarmItem({
    required Map<String, dynamic> item,
    required String source,
    required bool isSelected,
    required bool editMode,
    required VoidCallback onTap,
    required ValueChanged<bool> onSelect,
  }) {
    final msgType     = item['msg_type']?.toString() ?? '';
    final channelName = item['channel_name']?.toString() ?? '채널';
    final channelImage = item['channel_image']?.toString() ?? '';
    final timeStr     = source == 'inbox'
        ? _formatTime(item['received_at']?.toString())
        : _formatTime(item['scheduled_at']?.toString());

    return GestureDetector(
      onTap: editMode ? null : onTap,
      onLongPress: () => setState(() {
        if (source == 'inbox') _inboxEditMode = true;
        else _outboxEditMode = true;
      }),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? _primary.withOpacity(0.1) : _bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? _primary : _border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            // 편집모드 체크박스
            if (editMode) ...[
              GestureDetector(
                onTap: () => onSelect(!isSelected),
                child: Icon(
                  isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: isSelected ? _primary : _text3,
                  size: 22,
                ),
              ),
              const SizedBox(width: 10),
            ],
            // 채널 아바타
            _buildAvatar(channelName, channelImage,
                source == 'inbox' ? _primary : _teal),
            const SizedBox(width: 12),
            // 내용
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _msgTypeIcon(msgType),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(channelName,
                            style: const TextStyle(
                                color: _text,
                                fontSize: 14,
                                fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(timeStr,
                      style: const TextStyle(color: _text3, fontSize: 12)),
                ],
              ),
            ),
            // 재생 아이콘
            if (!editMode)
              Icon(Icons.play_circle_outline,
                  color: source == 'inbox' ? _primary : _teal, size: 24),
          ],
        ),
      ),
    );
  }

  Widget _msgTypeIcon(String type) {
    IconData icon;
    Color color;
    switch (type) {
      case 'youtube': icon = Icons.play_circle_fill; color = Colors.red; break;
      case 'video':   icon = Icons.movie;            color = Colors.blue; break;
      case 'audio':   icon = Icons.headset;          color = Colors.green; break;
      default:        icon = Icons.attach_file;      color = Colors.orange; break;
    }
    return Icon(icon, color: color, size: 16);
  }

  Widget _buildAvatar(String name, String imageUrl, Color fallbackColor) {
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'C';
    return Container(
      width: 40, height: 40,
      decoration: BoxDecoration(
        color: fallbackColor.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: imageUrl.isNotEmpty
          ? Image.network(imageUrl, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Center(
                child: Text(initial,
                    style: TextStyle(color: fallbackColor,
                        fontWeight: FontWeight.bold, fontSize: 16))))
          : Center(
              child: Text(initial,
                  style: TextStyle(color: fallbackColor,
                      fontWeight: FontWeight.bold, fontSize: 16))),
    );
  }

  Widget _buildMoreBtn(VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_circle_outline, color: _primary, size: 18),
            SizedBox(width: 6),
            Text('더보기', style: TextStyle(color: _primary,
                fontSize: 14, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(String msg, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 72, color: _text3.withOpacity(0.4)),
          const SizedBox(height: 16),
          Text(msg, style: const TextStyle(color: _text3, fontSize: 15)),
        ],
      ),
    );
  }

  Widget _buildError(String error, VoidCallback retry) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 56, color: _red),
          const SizedBox(height: 12),
          Text(error,
              style: const TextStyle(color: _text2, fontSize: 14),
              textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
                backgroundColor: _primary, foregroundColor: Colors.white),
            icon: const Icon(Icons.refresh),
            label: const Text('다시 시도'),
            onPressed: retry,
          ),
        ],
      ),
    );
  }

  // ── 시간 포맷 ─────────────────────────────────────────
  String _formatTime(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt   = DateTime.parse(raw).toLocal();
      final now  = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1)  return '방금 전';
      if (diff.inMinutes < 60) return '${diff.inMinutes}분 전';
      if (diff.inHours < 24)   return '${diff.inHours}시간 전';
      if (diff.inDays < 7)     return '${diff.inDays}일 전';
      return '${dt.month}/${dt.day} '
          '${dt.hour.toString().padLeft(2, '0')}:'
          '${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw;
    }
  }
}
