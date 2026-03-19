// lib/screens/channel_explore_screen.dart
// 스크린샷 기준: 흰 배경 / 검색바 / 인기채널 / 베스트채널 섹션
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'channel_detail_screen.dart';

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

class ChannelExploreScreen extends StatefulWidget {
  const ChannelExploreScreen({super.key});

  @override
  State<ChannelExploreScreen> createState() => _ChannelExploreScreenState();
}

class _ChannelExploreScreenState extends State<ChannelExploreScreen> {
  List<Map<String, dynamic>> _popular = [];
  List<Map<String, dynamic>> _best    = [];
  List<Map<String, dynamic>> _search  = [];

  bool   _loading     = true;
  bool   _searching   = false;
  String _searchQuery = '';
  String? _error;
  String _myUserId    = '';

  final _searchCtrl  = TextEditingController();
  final _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    final prefs = await SharedPreferences.getInstance();
    _myUserId = prefs.getString('user_id') ?? '';
    await _loadChannels();
  }

  Future<void> _loadChannels() async {
    setState(() { _loading = true; _error = null; });
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
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '채널 목록을 불러올 수 없습니다'; });
    }
  }

  Future<void> _doSearch(String query) async {
    final q = query.trim();
    setState(() { _searchQuery = q; });
    if (q.isEmpty) {
      setState(() { _search = []; _searching = false; });
      return;
    }
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
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final isSearching = _searchQuery.isNotEmpty;
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('RinGo',
            style: TextStyle(color: _primary, fontWeight: FontWeight.bold, fontSize: 20)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
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
                          onPressed: () { _searchCtrl.clear(); _doSearch(''); },
                        )
                      : null,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onChanged: _doSearch,
                textInputAction: TextInputAction.search,
              ),
            ),
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? _buildError()
              : isSearching
                  ? _buildSearchResults()
                  : _buildMain(),
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
      return const Center(child: CircularProgressIndicator(color: _primary));
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
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text('검색 결과 ${_search.length}건',
              style: const TextStyle(color: _text2, fontSize: 13)),
        ),
        ..._search.map((ch) => _buildChannelTile(ch)),
      ],
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

  // 스샷 기준: 아바타 + 채널명 + 구독수 + 상태(참여 가능/운영 중) + > 화살표
  Widget _buildChannelTile(Map<String, dynamic> ch) {
    final name      = ch['name']?.toString() ?? '채널';
    final imageUrl  = ch['image_url']?.toString() ?? '';
    final subCnt    = ch['subscriber_count'] ?? 0;
    final isSecret  = ch['is_secret'] == true || ch['is_secret'] == 1;
    final ownerId   = ch['owner_id']?.toString() ?? '';
    final isOwner   = _myUserId.isNotEmpty && ownerId == _myUserId;

    // 상태 텍스트: 내가 운영자면 "운영 중", 아니면 "참여 가능"
    final statusText  = isOwner ? '운영 중' : '참여 가능';
    final statusColor = isOwner ? _primary : _text2;

    return GestureDetector(
      onTap: () => _openDetail(ch),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: _bg,
          border: Border(bottom: BorderSide(color: _border)),
        ),
        child: Row(
          children: [
            // 아바타
            _avatar(name, imageUrl, 46),
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
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'C';
    final color   = _avatarColors[name.codeUnitAt(0) % _avatarColors.length];
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: imageUrl.isNotEmpty
          ? Image.network(imageUrl, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Center(
                child: Text(initial,
                    style: TextStyle(color: color,
                        fontWeight: FontWeight.bold, fontSize: size * 0.4))))
          : Center(
              child: Text(initial,
                  style: TextStyle(color: color,
                      fontWeight: FontWeight.bold, fontSize: size * 0.4))),
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
