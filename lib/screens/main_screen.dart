// lib/screens/main_screen.dart
// 스크린샷 기준: 하단 탭바 5개 (홈/내채널/구독채널/수신함/발신함)
// 상단 앱바: RinGo 로고 + 검색/설정/햄버거 아이콘
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'home_screen_main.dart';
import 'my_channels_screen.dart';
import 'subscribed_channels_screen.dart';
import 'notification_screen.dart';
import 'settings_screen.dart';
import 'notices_screen.dart';
import 'channel_explore_screen.dart';

// ── 색상 상수 ─────────────────────────────────────
const _grey    = Color(0xFF9E9E9E);
const _primary = Color(0xFF6C63FF);
const _bgWhite = Color(0xFFFFFFFF);
const _divider = Color(0xFFEEEEEE);

class MainScreen extends StatefulWidget {
  final int initialTab;
  const MainScreen({super.key, this.initialTab = 0});

  @override
  State<MainScreen> createState() => MainScreenState();
}

// 퍼블릭 State - 자식 위젯에서 findAncestorStateOfType<MainScreenState>() 로 접근
class MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;

  final List<_TabItem> _tabs = const [
    _TabItem(icon: Icons.home_outlined,      activeIcon: Icons.home,            label: '홈'),
    _TabItem(icon: Icons.wifi_tethering,     activeIcon: Icons.wifi_tethering,  label: '내 채널'),
    _TabItem(icon: Icons.list_alt_outlined,  activeIcon: Icons.list_alt,        label: '구독 채널'),
    _TabItem(icon: Icons.inbox_outlined,     activeIcon: Icons.inbox,           label: '수신함'),
    _TabItem(icon: Icons.send_outlined,      activeIcon: Icons.send,            label: '발신함'),
  ];

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTab;
    _screens = [
      const HomeScreenMain(),
      const MyChannelsScreen(),
      const SubscribedChannelsScreen(),
      const NotificationScreen(mode: NotificationMode.inbox),
      const NotificationScreen(mode: NotificationMode.outbox),
    ];
    _registerFcmToken();
  }

  // ── 네이티브 화면용 FCM 토큰 서버 등록 ──────────────────────
  Future<void> _registerFcmToken() async {
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final fcmToken = await messaging.getToken();
      if (fcmToken == null) return;

      final prefs = await SharedPreferences.getInstance();
      final sessionToken = prefs.getString('session_token') ?? '';
      if (sessionToken.isEmpty) return;

      final res = await http.post(
        Uri.parse('$kBaseUrl/api/fcm/register'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $sessionToken',
        },
        body: jsonEncode({'fcm_token': fcmToken}),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        await prefs.setString('fcm_token', fcmToken);
        debugPrint('[FCM] 네이티브 토큰 서버 등록 성공');
      } else {
        debugPrint('[FCM] 네이티브 토큰 서버 등록 실패: ${res.statusCode}');
      }

      // 토큰 갱신 시 재등록
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
        final p = await SharedPreferences.getInstance();
        final t = p.getString('session_token') ?? '';
        if (t.isEmpty) return;
        await http.post(
          Uri.parse('$kBaseUrl/api/fcm/register'),
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $t'},
          body: jsonEncode({'fcm_token': newToken}),
        ).timeout(const Duration(seconds: 10));
        await p.setString('fcm_token', newToken);
        debugPrint('[FCM] 네이티브 토큰 갱신 등록 성공');
      });
    } catch (e) {
      debugPrint('[FCM] 네이티브 토큰 등록 오류: $e');
    }
  }

  /// 외부에서 탭 전환 가능하도록 퍼블릭 메서드
  void navigateToTab(int index) {
    if (mounted) setState(() => _currentIndex = index);
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
  }

  void _openDrawer(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _HamburgerDrawer(
        onTabSelect: (index) {
          Navigator.pop(context);
          setState(() => _currentIndex = index);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bgWhite,
      appBar: _buildAppBar(context),
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) {
    return AppBar(
      backgroundColor: _bgWhite,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      titleSpacing: 16,
      title: const _RinGoLogo(),
      actions: [
        IconButton(
          icon: const Icon(Icons.search, color: Color(0xFF333333), size: 24),
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChannelExploreScreen())),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined, color: Color(0xFF333333), size: 24),
          onPressed: () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
          },
        ),
        IconButton(
          icon: const Icon(Icons.menu, color: Color(0xFF333333), size: 24),
          onPressed: () => _openDrawer(context),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: const BoxDecoration(
        color: _bgWhite,
        border: Border(top: BorderSide(color: _divider, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: List.generate(_tabs.length, (i) {
              final tab = _tabs[i];
              final selected = _currentIndex == i;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _onTabTapped(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        selected ? tab.activeIcon : tab.icon,
                        color: selected ? _primary : _grey,
                        size: 22,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        tab.label,
                        style: TextStyle(
                          fontSize: 10,
                          color: selected ? _primary : _grey,
                          fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

// ── RinGo 로고 텍스트 ──────────────────────────────
class _RinGoLogo extends StatelessWidget {
  const _RinGoLogo();
  @override
  Widget build(BuildContext context) {
    return const Text(
      'RinGo',
      style: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w800,
        color: Color(0xFF222222),
        letterSpacing: -0.5,
        fontStyle: FontStyle.italic,
      ),
    );
  }
}

// ── 탭 아이템 데이터 ───────────────────────────────
class _TabItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _TabItem({required this.icon, required this.activeIcon, required this.label});
}

// ── 햄버거 드로어 (우측에서) ──────────────────────
class _HamburgerDrawer extends StatefulWidget {
  final void Function(int) onTabSelect;
  const _HamburgerDrawer({required this.onTabSelect});

  @override
  State<_HamburgerDrawer> createState() => _HamburgerDrawerState();
}

class _HamburgerDrawerState extends State<_HamburgerDrawer> {
  String _email = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _email = prefs.getString('email') ?? prefs.getString('user_email') ?? '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        width: MediaQuery.of(context).size.width * 0.72,
        height: double.infinity,
        color: Colors.white,
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 헤더
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                child: Row(
                  children: [
                    const Text(
                      'RinGo',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        fontStyle: FontStyle.italic,
                        color: Color(0xFF222222),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _email,
                        style: const TextStyle(fontSize: 12, color: Color(0xFF888888)),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: Color(0xFFEEEEEE)),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text('메뉴', style: TextStyle(fontSize: 12, color: Color(0xFF888888))),
              ),
              // 메뉴 아이템들
              _DrawerItem(
                icon: Icons.campaign_outlined,
                label: '공지사항',
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const NoticesScreen()));
                },
              ),
              _DrawerItem(
                icon: Icons.wifi_tethering,
                label: '내채널',
                onTap: () => widget.onTabSelect(1),
              ),
              _DrawerItem(
                icon: Icons.list_alt_outlined,
                label: '구독채널',
                onTap: () => widget.onTabSelect(2),
              ),
              _DrawerItem(
                icon: Icons.inbox_outlined,
                label: '수신함',
                onTap: () => widget.onTabSelect(3),
              ),
              _DrawerItem(
                icon: Icons.send_outlined,
                label: '발신함',
                onTap: () => widget.onTabSelect(4),
              ),
              _DrawerItem(
                icon: Icons.settings_outlined,
                label: '설정',
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
                },
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                child: Text(
                  'RinGo v$kAppVersion',
                  style: TextStyle(fontSize: 12, color: Colors.grey[400]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool badge;
  final VoidCallback onTap;
  const _DrawerItem({required this.icon, required this.label, required this.onTap, this.badge = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: const Color(0xFF555555)),
            const SizedBox(width: 14),
            Text(label, style: const TextStyle(fontSize: 15, color: Color(0xFF333333))),
            if (badge) ...[
              const SizedBox(width: 6),
              Container(
                width: 8, height: 8,
                decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
