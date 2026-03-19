// lib/screens/channel_explore_screen.dart
// Phase 6-1: 채널 탐색 화면 — 인기채널 / 베스트채널 / 전체검색
// API: GET /api/channels/popular, /api/channels/best, /api/channels?search=
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'channel_detail_screen.dart';

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

// 아바타 배경 색상 풀
const _avatarColors = [
  Color(0xFF6C63FF), Color(0xFF1DE9B6), Color(0xFFF59E0B),
  Color(0xFFEF4444), Color(0xFF3B82F6), Color(0xFF10B981),
];

class ChannelExploreScreen extends StatefulWidget {
  const ChannelExploreScreen({super.key});

  @override
  State<ChannelExploreScreen> createState() => _ChannelExploreScreenState();
}

class _ChannelExploreScreenState extends State<ChannelExploreScreen> {
  List<Map<String, dynamic>> _popular  = [];
  List<Map<String, dynamic>> _best     = [];
  List<Map<String, dynamic>> _search   = [];

  bool   _loading       = true;
  bool   _searching     = false;
  String _searchQuery   = '';
  String? _error;

  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _loadChannels();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
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
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChannelDetailScreen(
        channelId:   ch['id'] as int,
        channelName: ch['name']?.toString() ?? '채널',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final isSearching = _searchQuery.isNotEmpty;
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg2,
        title: const Text('채널 탐색',
            style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: TextField(
              controller: _searchCtrl,
              focusNode: _searchFocus,
              style: const TextStyle(color: _text),
              decoration: InputDecoration(
                hintText: '채널 이름 검색',
                hintStyle: const TextStyle(color: _text3),
                prefixIcon: const Icon(Icons.search, color: _text3),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: _text3),
                        onPressed: () {
                          _searchCtrl.clear();
                          _doSearch('');
                        },
                      )
                    : null,
                filled: true,
                fillColor: _bg3,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
              onChanged: _doSearch,
              textInputAction: TextInputAction.search,
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
        padding: const EdgeInsets.all(16),
        children: [
          // 인기 채널
          _sectionHeader('🔥 인기 채널', '많이 구독된 채널'),
          if (_popular.isEmpty)
            _emptyBox('인기 채널이 없습니다')
          else
            ..._popular.map((ch) => _buildChannelTile(ch)),

          const SizedBox(height: 20),

          // 베스트 채널
          _sectionHeader('⭐ 베스트 채널', '구독자가 많은 채널'),
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
            const Icon(Icons.search_off, size: 64, color: _text3),
            const SizedBox(height: 12),
            Text('"$_searchQuery" 검색 결과 없음',
                style: const TextStyle(color: _text3, fontSize: 15)),
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
              style: const TextStyle(color: _text3, fontSize: 13)),
        ),
        ..._search.map((ch) => _buildChannelTile(ch)),
      ],
    );
  }

  Widget _sectionHeader(String title, String sub) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Text(title,
              style: const TextStyle(
                  color: _text, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(sub, style: const TextStyle(color: _text3, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildChannelTile(Map<String, dynamic> ch) {
    final name     = ch['name']?.toString() ?? '채널';
    final imageUrl = ch['image_url']?.toString() ?? '';
    final subCnt   = ch['subscriber_count'] ?? 0;
    final desc     = ch['description']?.toString() ?? '';
    final isSecret = ch['is_secret'] == true || ch['is_secret'] == 1;

    return GestureDetector(
      onTap: () => _openDetail(ch),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: Row(
          children: [
            _avatar(name, imageUrl, 44),
            const SizedBox(width: 12),
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
                        const SizedBox(width: 6),
                        const Icon(Icons.lock, color: _red, size: 13),
                      ],
                    ],
                  ),
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(desc,
                        style: const TextStyle(color: _text3, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Row(
              children: [
                const Icon(Icons.people_outline, color: _text3, size: 14),
                const SizedBox(width: 3),
                Text('$subCnt', style: const TextStyle(color: _text3, fontSize: 12)),
              ],
            ),
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
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border)),
      child: Center(
        child: Text(msg, style: const TextStyle(color: _text3, fontSize: 14)),
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
