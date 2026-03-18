// lib/screens/main_screen.dart
// Phase 1: WebView 대체 Flutter 네이티브 메인 화면
// BottomNavigationBar 5탭 뼈대 — 각 탭은 Phase별로 실제 화면으로 교체
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ── 탭 화면 import (Phase 진행에 따라 실제 화면으로 교체) ──
import 'home_screen.dart';          // Phase 4에서 완성
import 'notification_screen.dart';  // Phase 2에서 완성
import 'settings_screen.dart';      // Phase 3에서 완성

// ── 색상 상수 ──────────────────────────────────────────────
const _bg       = Color(0xFF121212);
const _bg2      = Color(0xFF1E1E2E);
const _primary  = Color(0xFF6C63FF);
const _teal     = Color(0xFF1DE9B6);
const _text     = Colors.white;
const _text2    = Color(0xFFB0B0C8);
const _border   = Color(0xFF3A3A55);

// ── 탭 인덱스 상수 ────────────────────────────────────────
class TabIndex {
  static const int home     = 0;
  static const int myChannel = 1;
  static const int inbox    = 2;
  static const int outbox   = 3;
  static const int settings = 4;
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

  // 각 탭 화면 — Phase 진행에 따라 실제 구현 화면으로 교체
  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialTab;
    _screens = [
      const HomeScreen(),           // 탭 0: 홈 (Phase 4)
      const _PlaceholderScreen(     // 탭 1: 내 채널 (Phase 5)
        icon: Icons.satellite_alt_rounded,
        label: '내 채널',
        sub: 'Phase 5에서 구현 예정',
      ),
      const NotificationScreen(),   // 탭 2: 수신함/발신함 (Phase 2)
      const _PlaceholderScreen(     // 탭 3: 발신함 (Phase 2 - NotificationScreen 탭으로 통합)
        icon: Icons.send_rounded,
        label: '발신함',
        sub: 'Phase 2에서 구현 예정',
      ),
      const SettingsScreen(),        // 탭 4: 설정 (Phase 3)
    ];
  }

  void _onTabTapped(int index) {
    if (_currentIndex == index) return;
    setState(() => _currentIndex = index);
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
        border: Border(
          top: BorderSide(color: _border, width: 1),
        ),
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
              _navItem(index: TabIndex.home,      icon: Icons.home_rounded,           label: '홈'),
              _navItem(index: TabIndex.myChannel, icon: Icons.satellite_alt_rounded,  label: '내 채널'),
              _navItem(index: TabIndex.inbox,     icon: Icons.notifications_rounded,  label: '수신함'),
              _navItem(index: TabIndex.outbox,    icon: Icons.send_rounded,           label: '발신함'),
              _navItem(index: TabIndex.settings,  icon: Icons.settings_rounded,       label: '설정'),
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
              child: Icon(
                icon,
                color: isSelected ? _primary : _text2,
                size: 22,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? _primary : _text2,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════
// PlaceholderScreen — 아직 구현되지 않은 탭용 임시 화면
// ══════════════════════════════════════════════════════════
class _PlaceholderScreen extends StatelessWidget {
  final IconData icon;
  final String label;
  final String sub;

  const _PlaceholderScreen({
    required this.icon,
    required this.label,
    required this.sub,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg2,
        title: Text(label,
            style: const TextStyle(color: _text, fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: _text2.withOpacity(0.4)),
            const SizedBox(height: 16),
            Text(label,
                style: const TextStyle(
                    color: _text, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(sub,
                style: TextStyle(color: _text2.withOpacity(0.6), fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
