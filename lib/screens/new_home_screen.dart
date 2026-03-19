// lib/screens/new_home_screen.dart
// Phase 4: 신홈 화면 — 배너 + 메뉴 카드 그리드 + 공지 미열람 배지
// API: GET /api/settings/banner, GET /api/notices
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import 'notices_screen.dart';
import 'channel_explore_screen.dart';

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

// ══════════════════════════════════════════════════════════
// NewHomeScreen
// ══════════════════════════════════════════════════════════
class NewHomeScreen extends StatefulWidget {
  /// 외부에서 탭 전환을 요청할 때 사용
  final void Function(int tabIndex)? onTabSwitch;

  const NewHomeScreen({super.key, this.onTabSwitch});

  @override
  State<NewHomeScreen> createState() => _NewHomeScreenState();
}

class _NewHomeScreenState extends State<NewHomeScreen> {
  // 배너
  Map<String, dynamic>? _banner;
  bool _bannerLoading = true;

  // 공지 미열람 배지
  bool _hasUnreadNotice = false;

  // 수신함 미열람 카운트 (배지용 — 추후 추가 가능)
  String _displayName = '';

  @override
  void initState() {
    super.initState();
    _loadBanner();
    _checkUnreadNotices();
    _loadUserName();
  }

  Future<void> _loadUserName() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _displayName = prefs.getString('display_name') ??
          prefs.getString('email') ?? 'RinGo';
    });
  }

  Future<void> _loadBanner() async {
    try {
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/settings/banner'))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final raw = body['data']?['value'];
        if (raw != null && raw.toString().isNotEmpty) {
          final bannerData = raw is String ? jsonDecode(raw) : raw;
          if (mounted) setState(() { _banner = bannerData; });
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _bannerLoading = false);
  }

  Future<void> _checkUnreadNotices() async {
    try {
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/notices?limit=20&offset=0'))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (body['data'] as List? ?? []).map((e) => e as Map<String, dynamic>).toList();
        if (list.isNotEmpty) {
          final prefs = await SharedPreferences.getInstance();
          final seen = prefs.getStringList('seen_notices') ?? [];
          final seenSet = seen.toSet();
          final hasUnread = list.any((n) => !seenSet.contains(n['id']?.toString() ?? ''));
          if (mounted) setState(() => _hasUnreadNotice = hasUnread);
        }
      }
    } catch (_) {}
  }

  Future<void> _openBannerLink() async {
    final url = _banner?['link_url']?.toString() ?? '';
    if (url.isEmpty) return;
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
  }

  void _switchTab(int index) {
    widget.onTabSwitch?.call(index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await _loadBanner();
            await _checkUnreadNotices();
          },
          color: _primary,
          child: CustomScrollView(
            slivers: [
              // ── 앱바 ────────────────────────────────────
              SliverAppBar(
                backgroundColor: _bg2,
                floating: true,
                elevation: 0,
                automaticallyImplyLeading: false,
                title: Row(
                  children: [
                    Container(
                      width: 30, height: 30,
                      decoration: BoxDecoration(
                        color: _primary.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.notifications_active,
                          color: _primary, size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Text('RinGo',
                        style: TextStyle(
                            color: _text,
                            fontWeight: FontWeight.bold,
                            fontSize: 20)),
                  ],
                ),
              ),

              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── 인사말 ──────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                      child: Text(
                        '안녕하세요, $_displayName 님 👋',
                        style: const TextStyle(
                            color: _text2, fontSize: 14),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── 배너 ────────────────────────────────
                    if (!_bannerLoading &&
                        _banner != null &&
                        _banner!['enabled'] == true)
                      _buildBanner(),

                    const SizedBox(height: 20),

                    // ── 메뉴 카드 그리드 ─────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildMenuGrid(),
                    ),

                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── 배너 ───────────────────────────────────────────────
  Widget _buildBanner() {
    final imageUrl = _banner?['image_url']?.toString() ?? '';
    return GestureDetector(
      onTap: _openBannerLink,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        height: 120,
        decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _border),
        ),
        clipBehavior: Clip.antiAlias,
        child: imageUrl.isNotEmpty
            ? Image.network(
                imageUrl,
                fit: BoxFit.cover,
                width: double.infinity,
                errorBuilder: (_, __, ___) => _bannerFallback(),
              )
            : _bannerFallback(),
      ),
    );
  }

  Widget _bannerFallback() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF6C63FF), Color(0xFF1DE9B6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Text('RinGo',
            style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.bold)),
      ),
    );
  }

  // ── 메뉴 카드 그리드 ──────────────────────────────────
  Widget _buildMenuGrid() {
    final items = [
      _MenuItem(
        icon: Icons.satellite_alt_rounded,
        label: '내 채널',
        color: _primary,
        onTap: () => _switchTab(1), // 탭 1: 내 채널
      ),
      _MenuItem(
        icon: Icons.explore_rounded,
        label: '채널 탐색',
        color: _teal,
        onTap: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const ChannelExploreScreen(),
          ));
        },
      ),
      _MenuItem(
        icon: Icons.notifications_rounded,
        label: '수신함',
        color: const Color(0xFF818CF8),
        onTap: () => _switchTab(2), // 탭 2: 수신함
      ),
      _MenuItem(
        icon: Icons.send_rounded,
        label: '발신함',
        color: const Color(0xFF34D399),
        onTap: () => _switchTab(3), // 탭 3: 발신함
      ),
      _MenuItem(
        icon: Icons.campaign_rounded,
        label: '공지사항',
        color: const Color(0xFFFBBF24),
        badge: _hasUnreadNotice,
        onTap: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const NoticesScreen(),
          )).then((_) => _checkUnreadNotices());
        },
      ),
      _MenuItem(
        icon: Icons.settings_rounded,
        label: '설정',
        color: _text3,
        onTap: () => _switchTab(4), // 탭 4: 설정
      ),
    ];

    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.0,
      children: items.map(_buildMenuCard).toList(),
    );
  }

  Widget _buildMenuCard(_MenuItem item) {
    return GestureDetector(
      onTap: item.onTap,
      child: Container(
        decoration: BoxDecoration(
          color: _bg2,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: item.color.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(item.icon, color: item.color, size: 24),
                ),
                if (item.badge)
                  Positioned(
                    top: -2, right: -2,
                    child: Container(
                      width: 12, height: 12,
                      decoration: const BoxDecoration(
                          color: _red, shape: BoxShape.circle),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(item.label,
                style: const TextStyle(
                    color: _text,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// ── 메뉴 아이템 모델 ──────────────────────────────────────
class _MenuItem {
  final IconData icon;
  final String   label;
  final Color    color;
  final bool     badge;
  final VoidCallback onTap;

  const _MenuItem({
    required this.icon,
    required this.label,
    required this.color,
    this.badge = false,
    required this.onTap,
  });
}
