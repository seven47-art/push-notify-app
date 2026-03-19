// lib/screens/main_screen.dart
// Phase 2~6: 수신함/발신함/홈/내채널/설정 탭 모두 연결
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ── 탭 화면 import ──────────────────────────────────────
import 'new_home_screen.dart';       // 탭 0: 홈 (Phase 4)
import 'home_screen.dart';           // 탭 1: 내 채널 (Phase 5)
import 'notification_screen.dart';  // 탭 2: 수신함, 탭 3: 발신함
import 'settings_screen.dart';      // 탭 4: 설정 (Phase 3)

// ── 색상 상수 ──────────────────────────────────────────────
const _bg      = Color(0xFF121212);
const _bg2     = Color(0xFF1E1E2E);
const _primary = Color(0xFF6C63FF);
const _text2   = Color(0xFFB0B0C8);
const _border  = Color(0xFF3A3A55);

// ── 탭 인덱스 상수 ────────────────────────────────────────
class TabIndex {
  static const int home      = 0;
  static const int myChannel = 1;
  static const int inbox     = 2;
  static const int outbox    = 3;
  static const int settings  = 4;
}

// ══════════════════════════════════════════════════════════
// MainScreen — 앱 전체 탭 뼈대
// ══════════════════════════════════════════════════════════
class MainScreen extends StatefulWidget {
  final int initialTab;
  const MainScreen({super.key, this.initialTab = TabIndex.home});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  late int _currentIndex;

  // 수신함/발신함 GlobalKey — 탭 전환·재탭 시 refresh() 호출용
  final _inboxKey  = GlobalKey<NotificationScreenState>();
  final _outboxKey = GlobalKey<NotificationScreenState>();

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTab;
    _screens = [
      NewHomeScreen(onTabSwitch: _onTabTapped),          // 탭 0: 홈
      const HomeScreen(),                                  // 탭 1: 내 채널
      NotificationScreen(key: _inboxKey,  initialTab: 0), // 탭 2: 수신함
      NotificationScreen(key: _outboxKey, initialTab: 1), // 탭 3: 발신함
      const SettingsScreen(),                              // 탭 4: 설정
    ];
  }

  void _onTabTapped(int index) {
    if (_currentIndex == index) {
      _refreshTab(index);
      return;
    }
    setState(() => _currentIndex = index);
    _refreshTab(index);
  }

  void _refreshTab(int index) {
    if (index == TabIndex.inbox)  _inboxKey.currentState?.refresh();
    if (index == TabIndex.outbox) _outboxKey.currentState?.refresh();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: _bg,
        body: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
        bottomNavigationBar: _buildBottomNav(),
      ),
    );
  }

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: _bg2,
        border: Border(top: BorderSide(color: _border, width: 1)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: [
              _navItem(index: TabIndex.home,      icon: Icons.home_rounded,          label: '홈'),
              _navItem(index: TabIndex.myChannel, icon: Icons.satellite_alt_rounded, label: '내 채널'),
              _navItem(index: TabIndex.inbox,     icon: Icons.notifications_rounded, label: '수신함'),
              _navItem(index: TabIndex.outbox,    icon: Icons.send_rounded,          label: '발신함'),
              _navItem(index: TabIndex.settings,  icon: Icons.settings_rounded,      label: '설정'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _navItem({
    required int index,
    required IconData icon,
    required String label,
  }) {
    final isSelected = _currentIndex == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => _onTabTapped(index),
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isSelected ? _primary.withOpacity(0.15) : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon,
                  color: isSelected ? _primary : _text2, size: 22),
            ),
            const SizedBox(height: 2),
            Text(label,
                style: TextStyle(
                    color: isSelected ? _primary : _text2,
                    fontSize: 10,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.normal)),
          ],
        ),
      ),
    );
  }
}
