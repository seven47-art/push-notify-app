// lib/screens/channel_explore_screen.dart
// 스크린샷 기준: 흰 배경 / 검색바 / 인기채널 / 베스트채널 섹션
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/image_helper.dart';
import 'channel_detail_screen.dart';
import 'main_screen.dart';

const _bg       = Color(0xFFFFFFFF);
const _bg2      = Color(0xFFF9F9F9);
const _primary  = Color(0xFF6C63FF);
const _text     = Color(0xFF222222);
const _text2    = Color(0xFF888888);
const _border   = Color(0xFFEEEEEE);
const _red      = Color(0xFFFF4444);
const _teal     = Color(0xFF00BCD4);

const _avatarColors = [
  Color(0xFF6C63FF), Color(0xFF00BCD4), Color(0xFFF59E0B),
  Color(0xFFEF4444), Color(0xFF3B82F6), Color(0xFF10B981),
];

// 캐시 키
const _cacheKeyPopular = 'cache_explore_popular';
const _cacheKeyBest    = 'cache_explore_best';

class ChannelExploreScreen extends StatefulWidget {
  const ChannelExploreScreen({super.key});

  @override
  State<ChannelExploreScreen> createState() => _ChannelExploreScreenState();
}

class _ChannelExploreScreenState extends State<ChannelExploreScreen> {
  List<Map<String, dynamic>> _popular = [];
  List<Map<String, dynamic>> _best    = [];
  List<Map<String, dynamic>> _search  = [];
  Set<String> _subscribedIds = {};

  bool   _loading     = true;
  bool   _searching   = false;
  String _searchQuery = '';
  String? _error;
  String _myUserId    = '';

  final _searchCtrl  = TextEditingController();
  final _searchFocus = FocusNode();
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _loadCacheThenFetch();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  // 캐시 먼저 표시 → 백그라운드 API 갱신
  Future<void> _loadCacheThenFetch() async {
    final prefs = await SharedPreferences.getInstance();
    _myUserId = prefs.getString('user_id') ?? '';
    final cachedPop = prefs.getString(_cacheKeyPopular);
    final cachedBest = prefs.getString(_cacheKeyBest);
    if (cachedPop != null && cachedPop.isNotEmpty) {
      try {
        final pop = (jsonDecode(cachedPop) as List).map((e) => Map<String, dynamic>.from(e)).toList();
        final best = cachedBest != null && cachedBest.isNotEmpty
            ? (jsonDecode(cachedBest) as List).map((e) => Map<String, dynamic>.from(e)).toList()
            : <Map<String, dynamic>>[];
        if (mounted) {
          setState(() {
            _popular = pop;
            _best = best;
            _loading = false;
          });
        }
      } catch (_) {}
    }
    await Future.wait([_loadChannels(), _loadSubscribedIds()]);
  }

  // 캐시 저장
  Future<void> _saveCache() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      await prefs.setString(_cacheKeyPopular, jsonEncode(_popular));
      await prefs.setString(_cacheKeyBest, jsonEncode(_best));
    } catch (_) {}
  }

  Future<void> _loadSubscribedIds() async {
    if (_myUserId.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final res = await http
          .get(
            Uri.parse('$kBaseUrl/api/subscribers?user_id=$_myUserId'),
            headers: {'Authorization': 'Bearer $token'},
          )
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final list = List<Map<String, dynamic>>.from(body['data'] ?? []);
      if (mounted) {
        setState(() {
          _subscribedIds = list
              .map((ch) => ch['channel_id']?.toString() ?? ch['id']?.toString() ?? '')
              .where((id) => id.isNotEmpty)
              .toSet();
        });
      }
    } catch (_) {}
  }

  Future<void> _loadChannels() async {
    if (_popular.isEmpty && _best.isEmpty) {
      setState(() { _loading = true; _error = null; });
    } else {
      setState(() { _error = null; });
    }
    try {
      final results = await Future.wait([
        http.get(Uri.parse('$kBaseUrl/api/channels/popular'))
            .timeout(const Duration(seconds: 15)),
        http.get(Uri.parse('$kBaseUrl/api/channels/best'))
            .timeout(const Duration(seconds: 15)),
      ]);
      if (!mounted) return;
      final popBody  = jsonDecode(results[0].body) as Map<String, dynamic>;
      final bestBody = jsonDecode(results[1].body) as Map<String, dynamic>;
      setState(() {
        _popular = List<Map<String, dynamic>>.from(popBody['data'] ?? []);
        _best    = List<Map<String, dynamic>>.from(bestBody['data'] ?? []);
        _loading = false;
      });
      _saveCache();
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '채널 목록을 불러올 수 없습니다'; });
    }
  }

  // debounce 적용 검색
  void _onSearchChanged(String query) {
    final q = query.trim();
    setState(() { _searchQuery = q; });
    if (q.isEmpty) {
      _debounceTimer?.cancel();
      setState(() { _search = []; _searching = false; });
      return;
    }
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      _doSearch(q);
    });
  }

  Future<void> _doSearch(String q) async {
    if (!mounted) return;
    setState(() { _searching = true; });
    try {
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/channels?search=${Uri.encodeComponent(q)}'))
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      setState(() {
        _search    = List<Map<String, dynamic>>.from(body['data'] ?? []);
        _searching = false;
      });
    } catch (_) {
      if (mounted) setState(() { _searching = false; });
    }
  }

  void _openDetail(Map<String, dynamic> ch) {
    final ownerId = ch['owner_id']?.toString() ?? '';
    final isOwner = _myUserId.isNotEmpty && ownerId == _myUserId;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChannelDetailScreen(
        channelId: ch['id']?.toString() ?? '',
        isOwner: isOwner,
        isSubscribed: false,
      ),
    )).then((result) {
      // 채널 가입 완료 시 구독채널 탭(인덱스 2)으로 이동
      if (result == 'joined' && mounted) {
        final mainState = context.findAncestorStateOfType<MainScreenState>();
        mainState?.navigateToTab(2);
      }
    });
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Container(
        decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: TextField(
          controller: _searchCtrl,
          focusNode: _searchFocus,
          style: const TextStyle(color: _text, fontSize: 14),
          decoration: InputDecoration(
            hintText: '채널명으로 검색...',
            hintStyle: const TextStyle(color: _text2, fontSize: 14),
            prefixIcon: const Icon(Icons.search, color: _text2, size: 20),
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear, color: _text2, size: 18),
                    onPressed: () { _searchCtrl.clear(); _onSearchChanged(''); },
                  )
                : null,
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
          ),
          onChanged: _onSearchChanged,
          textInputAction: TextInputAction.search,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSearching = _searchQuery.isNotEmpty;
    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          _buildSearchBar(),
          Expanded(
            child: _loading
                ? ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    children: [
                      _sectionHeader('\u2B50 인기 채널'),
                      ...List.generate(3, (_) => const _ExploreSkeletonTile()),
                      const SizedBox(height: 16),
                      _sectionHeader('\uD83C\uDFC6 베스트 채널'),
                      ...List.generate(3, (_) => const _ExploreSkeletonTile()),
                    ],
                  )
                : _error != null
                    ? _buildError()
                    : isSearching
                        ? _buildSearchResults()
                        : _buildMain(),
          ),
        ],
      ),
    );
  }

  Widget _buildMain() {
    return RefreshIndicator(
      onRefresh: _loadChannels,
      color: _primary,
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          // 인기 채널
          _sectionHeader('⭐ 인기 채널'),
          if (_popular.isEmpty)
            _emptyBox('인기 채널이 없습니다')
          else
            ..._popular.map((ch) => _buildChannelTile(ch)),

          const SizedBox(height: 16),

          // 베스트 채널
          _sectionHeader('🏆 베스트 채널'),
          if (_best.isEmpty)
            _emptyBox('베스트 채널이 없습니다')
          else
            ..._best.map((ch) => _buildChannelTile(ch)),

          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildSearchResults() {
    if (_searching) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: List.generate(5, (_) => const _ExploreSkeletonTile()),
      );
    }
    if (_search.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.search_off, size: 64, color: _text2),
            const SizedBox(height: 12),
            Text('"$_searchQuery" 검색 결과 없음',
                style: const TextStyle(color: _text2, fontSize: 15)),
          ],
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _search.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('검색 결과 ${_search.length}건',
                style: const TextStyle(color: _text2, fontSize: 13)),
          );
        }
        return _buildChannelTile(_search[index - 1]);
      },
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(title,
          style: const TextStyle(
              color: _text, fontSize: 15, fontWeight: FontWeight.w700)),
    );
  }

  // 스샷 기준: 아바타 + 채널명 + 구독수 + 상태(참여 가능/운영 중/구독중) + > 화살표
  Widget _buildChannelTile(Map<String, dynamic> ch) {
    final name      = ch['name']?.toString() ?? '채널';
    final imageUrl  = ch['image_url']?.toString() ?? '';
    final subCnt    = ch['subscriber_count'] ?? 0;
    final isSecret  = ch['is_secret'] == true || ch['is_secret'] == 1;
    final ownerId   = ch['owner_id']?.toString() ?? '';
    final channelId = ch['id']?.toString() ?? '';
    final isOwner      = _myUserId.isNotEmpty && ownerId == _myUserId;
    final isSubscribed = _subscribedIds.contains(channelId);

    // 상태 텍스트: 운영자 > 구독중 > 참여 가능
    final String statusText;
    final Color  statusColor;
    if (isOwner) {
      statusText  = '운영 중';
      statusColor = _primary;
    } else if (isSubscribed) {
      statusText  = '구독중';
      statusColor = const Color(0xFF10B981); // 초록
    } else {
      statusText  = '참여 가능';
      statusColor = _text2;
    }

    return GestureDetector(
      onTap: () => _openDetail(ch),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: _bg,
          border: Border(bottom: BorderSide(color: _border)),
        ),
        child: Row(
          children: [
            // 아바타
            _avatar(name, imageUrl, 44),
            const SizedBox(width: 12),
            // 채널명 + 상태
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(name,
                            style: const TextStyle(
                                color: _text,
                                fontSize: 15,
                                fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (isSecret) ...[ 
                        const SizedBox(width: 4),
                        const Icon(Icons.lock, color: _red, size: 13),
                      ],
                      const SizedBox(width: 6),
                      Text('👥 $subCnt',
                          style: const TextStyle(color: _text2, fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(statusText,
                      style: TextStyle(color: statusColor, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: _text2, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _avatar(String name, String imageUrl, double size) {
    final color = _avatarColors[name.isNotEmpty ? name.codeUnitAt(0) % _avatarColors.length : 0];
    return channelAvatar(
      imageUrl: imageUrl.isNotEmpty ? imageUrl : null,
      name: name,
      size: size,
      bgColor: color,
      borderRadius: 10,
    );
  }

  Widget _emptyBox(String msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: Text(msg, style: const TextStyle(color: _text2, fontSize: 14)),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 56, color: _red),
          const SizedBox(height: 12),
          Text(_error ?? '', style: const TextStyle(color: _text2)),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
                backgroundColor: _primary, foregroundColor: Colors.white),
            icon: const Icon(Icons.refresh),
            label: const Text('다시 시도'),
            onPressed: _loadChannels,
          ),
        ],
      ),
    );
  }
}

// ── 스켈레톤 로딩 타일 ─────────────────────────────────────────────────
class _ExploreSkeletonTile extends StatelessWidget {
  const _ExploreSkeletonTile();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _border)),
      ),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 120, height: 14,
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  width: 80, height: 11,
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 20, height: 20,
            decoration: BoxDecoration(
              color: Colors.grey[100],
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
