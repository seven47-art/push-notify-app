// lib/screens/home_screen_main.dart
// 스크린샷 기준: 배너(그라데이션) + "자주쓰는 메뉴" + 8개 메뉴카드 + "순서 변경" 버튼
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import 'notices_screen.dart';
import 'settings_screen.dart';
import 'join_channel_screen.dart';
import 'channel_explore_screen.dart';
import 'main_screen.dart';

// ── 색상 상수 ─────────────────────────────────────
const _bg      = Color(0xFFFFFFFF);
const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _cardBg  = Color(0xFFF9F9F9);

// 메뉴 아이템 데이터
class _MenuItem {
  final String key;
  final String label;
  final String subLabel;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  const _MenuItem({
    required this.key,
    required this.label,
    required this.subLabel,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
  });
}

const _allMenuItems = <_MenuItem>[
  _MenuItem(key: 'search',   label: '채널검색',   subLabel: '채널 찾기',      icon: Icons.search,            iconBg: Color(0xFFE8F4FD), iconColor: Color(0xFF2196F3)),
  _MenuItem(key: 'my',       label: '내 채널',   subLabel: '운영 채널 관리',   icon: Icons.wifi_tethering,    iconBg: Color(0xFFE8F5E9), iconColor: Color(0xFF4CAF50)),
  _MenuItem(key: 'sub',      label: '구독 채널',  subLabel: '가입한 채널',     icon: Icons.list_alt_outlined, iconBg: Color(0xFFF3E5F5), iconColor: Color(0xFF9C27B0)),
  _MenuItem(key: 'notice',   label: '공지사항',   subLabel: '공지 확인',       icon: Icons.campaign_outlined, iconBg: Color(0xFFFFF3E0), iconColor: Color(0xFFFF9800)),
  _MenuItem(key: 'inbox',    label: '수신함',    subLabel: '받은 메시지',      icon: Icons.inbox_outlined,    iconBg: Color(0xFFE0F7FA), iconColor: Color(0xFF009688)),
  _MenuItem(key: 'outbox',   label: '발신함',    subLabel: '보낸 메시지',      icon: Icons.send_outlined,     iconBg: Color(0xFFE8EAF6), iconColor: Color(0xFF3F51B5)),
  _MenuItem(key: 'join',     label: '초대코드 가입', subLabel: '코드로 채널 참여', icon: Icons.qr_code_scanner,   iconBg: Color(0xFFFCE4EC), iconColor: Color(0xFFE91E63)),
  _MenuItem(key: 'settings', label: '설정',      subLabel: '앱 환경설정',      icon: Icons.settings_outlined, iconBg: Color(0xFFF5F5F5), iconColor: Color(0xFF757575)),
];

class HomeScreenMain extends StatefulWidget {
  const HomeScreenMain({super.key});

  @override
  State<HomeScreenMain> createState() => _HomeScreenMainState();
}

class _HomeScreenMainState extends State<HomeScreenMain> {
  Map<String, dynamic>? _banner;
  bool _bannerLoading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('session_token') ?? '';
    try {
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/settings/banner'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && body['data'] != null) {
          if (mounted) setState(() => _banner = body['data'] as Map<String, dynamic>?);
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _bannerLoading = false);
  }

  Future<void> _openBannerLink(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _onMenuTap(BuildContext context, String key) {
    // 부모 MainScreen의 탭 전환 메서드 찾기
    final mainState = context.findAncestorStateOfType<MainScreenState>();
    switch (key) {
      case 'search':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const ChannelExploreScreen()));
        break;
      case 'my':
        mainState?.navigateToTab(1);
        break;
      case 'sub':
        mainState?.navigateToTab(2);
        break;
      case 'notice':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const NoticesScreen()));
        break;
      case 'inbox':
        mainState?.navigateToTab(3);
        break;
      case 'outbox':
        mainState?.navigateToTab(4);
        break;
      case 'join':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const JoinChannelScreen()));
        break;
      case 'settings':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: _primary,
      onRefresh: () async { await _load(); },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          _buildBanner(),
          const SizedBox(height: 20),
          _buildMenuSection(context),
        ],
      ),
    );
  }

  Widget _buildBanner() {
    final bannerTitle   = _banner?['title'] as String? ?? '전화 방식의 새로운\n알람 앱, RinGo';
    final bannerSubtitle = _banner?['subtitle'] as String? ?? '채널을 만들고, 구독하고\n원하는 시간에 알람을 예약하세요.';
    final bannerTag     = _banner?['tag'] as String? ?? '스마트 알람 플랫폼';
    final bannerLink    = _banner?['link'] as String?;

    return GestureDetector(
      onTap: bannerLink != null ? () => _openBannerLink(bannerLink) : null,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        height: 150,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF2D1B69), Color(0xFF6C63FF)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: 16,
              top: 16,
              bottom: 16,
              child: Opacity(
                opacity: 0.3,
                child: Icon(
                  Icons.notifications_active,
                  size: 80,
                  color: Colors.white,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    bannerTitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    bannerSubtitle,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6, height: 6,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          bannerTag,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuSection(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '자주쓰는 메뉴',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: _text,
                ),
              ),
              OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.swap_vert, size: 14),
                label: const Text('순서 변경', style: TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _text2,
                  side: const BorderSide(color: _border),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 1.0,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: _allMenuItems.length,
            itemBuilder: (context, index) {
              final item = _allMenuItems[index];
              return _MenuCard(
                item: item,
                onTap: () => _onMenuTap(context, item.key),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MenuCard extends StatelessWidget {
  final _MenuItem item;
  final VoidCallback onTap;
  const _MenuCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border, width: 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: item.iconBg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(item.icon, color: item.iconColor, size: 22),
            ),
            const SizedBox(height: 8),
            Text(
              item.label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _text,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 2),
            Text(
              item.subLabel,
              style: const TextStyle(fontSize: 10, color: _text2),
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
