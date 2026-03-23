// lib/screens/home_screen_main.dart
// 스크린샷 기준: 배너(그라데이션) + "자주쓰는 메뉴" + 8개 메뉴카드 + "순서 변경" 버튼
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:reorderable_grid_view/reorderable_grid_view.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import 'notices_screen.dart';
import 'settings_screen.dart';
import 'join_channel_screen.dart';
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

const _defaultMenuItems = <_MenuItem>[
  _MenuItem(key: 'search',   label: '채널검색',      subLabel: '채널 찾기',        icon: Icons.search,            iconBg: Color(0x1F4A6FA5), iconColor: Color(0xFF4A6FA5)),
  _MenuItem(key: 'my',       label: '내 채널',       subLabel: '운영 채널 관리',   icon: Icons.wifi_tethering,    iconBg: Color(0x1F3A8F7D), iconColor: Color(0xFF3A8F7D)),
  _MenuItem(key: 'sub',      label: '구독 채널',     subLabel: '가입한 채널',       icon: Icons.list_alt_outlined, iconBg: Color(0x1F7B5EA7), iconColor: Color(0xFF7B5EA7)),
  _MenuItem(key: 'notice',   label: '공지사항',      subLabel: '공지 확인',         icon: Icons.campaign_outlined, iconBg: Color(0x1FD4763B), iconColor: Color(0xFFD4763B)),
  _MenuItem(key: 'inbox',    label: '수신함',        subLabel: '받은 메시지',       icon: Icons.inbox_outlined,    iconBg: Color(0x1F3A7D44), iconColor: Color(0xFF3A7D44)),
  _MenuItem(key: 'outbox',   label: '발신함',        subLabel: '보낸 메시지',       icon: Icons.send_outlined,     iconBg: Color(0x1F2C6E9E), iconColor: Color(0xFF2C6E9E)),
  _MenuItem(key: 'join',     label: '초대코드 가입', subLabel: '코드로 채널 참여',  icon: Icons.qr_code_scanner,   iconBg: Color(0x1FA0527A), iconColor: Color(0xFFA0527A)),
  _MenuItem(key: 'settings', label: '설정',          subLabel: '앱 환경설정',       icon: Icons.settings_outlined, iconBg: Color(0x1F5A6472), iconColor: Color(0xFF5A6472)),
];

class HomeScreenMain extends StatefulWidget {
  const HomeScreenMain({super.key});

  @override
  State<HomeScreenMain> createState() => _HomeScreenMainState();
}

class _HomeScreenMainState extends State<HomeScreenMain> {
  Map<String, dynamic>? _banner;
  bool _bannerLoading = true;
  List<_MenuItem> _menuItems = List.from(_defaultMenuItems);
  bool _editMode = false;

  @override
  void initState() {
    super.initState();
    _loadMenuOrder();
    _load();
  }

  // 저장된 메뉴 순서 불러오기
  Future<void> _loadMenuOrder() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList('homeMenuOrder');
    if (saved != null && saved.isNotEmpty) {
      final mapped = saved
          .map((id) => _defaultMenuItems.firstWhere((m) => m.key == id,
              orElse: () => _defaultMenuItems.first))
          .where((m) => saved.contains(m.key))
          .toList();
      final extra = _defaultMenuItems.where((m) => !saved.contains(m.key)).toList();
      if (mounted) setState(() => _menuItems = [...mapped, ...extra]);
    }
  }

  // 메뉴 순서 저장
  Future<void> _saveMenuOrder() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('homeMenuOrder', _menuItems.map((m) => m.key).toList());
  }

  // 편집모드 토글
  void _toggleEditMode() {
    if (_editMode) {
      _saveMenuOrder();
    }
    setState(() => _editMode = !_editMode);
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
        // API 응답: { success: true, data: { value: "JSON문자열", updated_at: "..." } }
        // data.value 를 한 번 더 JSON 파싱해야 실제 배너 설정값을 얻을 수 있음
        if (body['success'] == true && body['data'] != null) {
          final raw = body['data'];
          Map<String, dynamic>? parsed;
          if (raw is Map) {
            final valueStr = raw['value']?.toString();
            if (valueStr != null && valueStr.isNotEmpty) {
              try { parsed = jsonDecode(valueStr) as Map<String, dynamic>; } catch (_) {}
            }
          }
          if (mounted) setState(() => _banner = parsed);
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
        mainState?.navigateToTab(MainScreen.tabSearch);
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
        _showJoinBottomSheet(context);
        break;
      case 'settings':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
        break;
    }
  }

  // ─── 채널 참여 바텀시트 ──────────────────────────────
  void _showJoinBottomSheet(BuildContext context) {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom + MediaQuery.of(ctx).padding.bottom),
          child: Container(
            decoration: const BoxDecoration(
              color: Color(0xFF1E1E2E),
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 36, height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[600],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text('채널 참여',
                    style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                Text('초대 코드 또는 초대 링크',
                    style: TextStyle(color: Colors.grey[400], fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '코드 또는 URL 붙여넣기',
                    hintStyle: TextStyle(color: Colors.grey[500]),
                    filled: true,
                    fillColor: const Color(0xFF2A2A3E),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF6C63FF), width: 1.5),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF6C63FF),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    onPressed: () {
                      final input = ctrl.text.trim();
                      if (input.isEmpty) return;
                      String token = input;
                      if (input.contains('/join/')) token = input.split('/join/').last.split('?').first;
                      else if (input.startsWith('http')) token = Uri.parse(input).pathSegments.last;
                      Navigator.pop(ctx);
                      Navigator.push(context,
                        MaterialPageRoute(builder: (_) => JoinChannelScreen(inviteToken: token)),
                      );
                    },
                    child: const Text('참여하기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.grey[400],
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: BorderSide(color: Colors.grey[700]!),
                      ),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('취소', style: TextStyle(fontSize: 15)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
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
    // 로딩 중이면 빈 공간 (레이아웃 튐 방지)
    if (_bannerLoading) return const SizedBox.shrink();

    // 서버에 설정값 없으면 배너 숨김 (하드코딩 기본 배너 표시 안 함)
    if (_banner == null) return const SizedBox.shrink();

    // enabled == false 이면 배너 숨김
    final enabled = _banner!['enabled'] as bool? ?? true;
    if (!enabled) return const SizedBox.shrink();

    final bannerType = _banner?['type'] as String? ?? 'svg';
    final bannerLink = (_banner?['link_url'] as String?)?.isNotEmpty == true
        ? _banner!['link_url'] as String
        : null;

    // ── 이미지 배너 ──
    if (bannerType == 'image') {
      final imageUrl = _banner?['image_url'] as String? ?? '';
      if (imageUrl.isNotEmpty) {
        return GestureDetector(
          onTap: bannerLink != null ? () => _openBannerLink(bannerLink) : null,
          child: Image.network(
            imageUrl,
            width: double.infinity,
            fit: BoxFit.fitWidth,
            errorBuilder: (_, __, ___) => _buildDefaultBanner(bannerLink),
          ),
        );
      }
    }

    // ── 기본 SVG(그라데이션) 배너 ──
    return _buildDefaultBanner(bannerLink);
  }

  Widget _buildDefaultBanner(String? bannerLink) {
    return GestureDetector(
      onTap: bannerLink != null ? () => _openBannerLink(bannerLink) : null,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF2D1B69), Color(0xFF6C63FF)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: Stack(
          children: [
            // 흔들리는 종 애니메이션
            Positioned(
              right: 16,
              top: 0,
              bottom: 0,
              child: Center(
                child: _BellAnimation(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 110, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    '전화 방식의 새로운\n알람 앱, RinGo',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    '채널을 만들고, 구독하고\n원하는 시간에 알람을 예약하세요.',
                    style: TextStyle(
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
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 6, height: 6,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                        SizedBox(width: 6),
                        Text(
                          '스마트 알람 플랫폼',
                          style: TextStyle(
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
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _text),
              ),
              OutlinedButton.icon(
                onPressed: _toggleEditMode,
                icon: Icon(_editMode ? Icons.check : Icons.swap_vert, size: 14),
                label: Text(_editMode ? '완료' : '순서 변경', style: const TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _editMode ? _primary : _text2,
                  side: BorderSide(color: _editMode ? _primary : _border),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _editMode
              ? ReorderableGridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 3,
                  childAspectRatio: 1.0,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  dragStartDelay: Duration.zero,
                  dragWidgetBuilderV2: DragWidgetBuilderV2(
                    isScreenshotDragWidget: false,
                    builder: (index, child, screenshot) {
                      return Material(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(14),
                        child: child,
                      );
                    },
                  ),
                  onReorder: (oldIndex, newIndex) {
                    setState(() {
                      final item = _menuItems.removeAt(oldIndex);
                      _menuItems.insert(newIndex, item);
                    });
                  },
                  children: _menuItems.map((item) => _MenuCard(
                    key: ValueKey(item.key),
                    item: item,
                    editMode: true,
                    onTap: () {},
                  )).toList(),
                )
              : GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 1.0,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: _menuItems.length,
                  itemBuilder: (context, index) {
                    final item = _menuItems[index];
                    return _MenuCard(
                      key: ValueKey(item.key),
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
  final bool editMode;
  const _MenuCard({required super.key, required this.item, required this.onTap, this.editMode = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: editMode ? _primary.withOpacity(0.4) : _border, width: 1),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 4, offset: const Offset(0, 1))],
        ),
        padding: const EdgeInsets.fromLTRB(10, 14, 10, 12),
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 34, height: 34,
                  decoration: BoxDecoration(
                    color: item.iconBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(item.icon, color: item.iconColor, size: 17),
                ),
                const SizedBox(height: 6),
                Text(
                  item.label,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _text, height: 1.3),
                ),
                const SizedBox(height: 2),
                Text(
                  item.subLabel,
                  style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w500, color: _text2),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
            // 편집모드 드래그 핸들
            if (editMode)
              const Positioned(
                top: 0, right: 0,
                child: Icon(Icons.drag_indicator, size: 16, color: _text2),
              ),
          ],
        ),
      ),
    );
  }
}

// ── 종 흔들림 애니메이션 위젯 ──────────────────────────────
class _BellAnimation extends StatefulWidget {
  @override
  State<_BellAnimation> createState() => _BellAnimationState();
}

class _BellAnimationState extends State<_BellAnimation>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _swing;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4000),
    )..repeat();
    _swing = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 0.18), weight: 10),
      TweenSequenceItem(tween: Tween(begin: 0.18, end: -0.18), weight: 20),
      TweenSequenceItem(tween: Tween(begin: -0.18, end: 0.12), weight: 15),
      TweenSequenceItem(tween: Tween(begin: 0.12, end: -0.12), weight: 15),
      TweenSequenceItem(tween: Tween(begin: -0.12, end: 0.0), weight: 10),
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 0.0), weight: 30),
    ]).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _swing,
      builder: (_, __) => Transform.rotate(
        angle: _swing.value,
        alignment: Alignment.topCenter,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // 파동 효과
            Opacity(
              opacity: (0.15 + 0.15 * math.sin(_ctrl.value * 2 * math.pi)).clamp(0.0, 1.0),
              child: Container(
                width: 90, height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
              ),
            ),
            Opacity(
              opacity: (0.1 + 0.1 * math.sin(_ctrl.value * 2 * math.pi + 1.0)).clamp(0.0, 1.0),
              child: Container(
                width: 70, height: 70,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1.0),
                ),
              ),
            ),
            // 종 아이콘
            Container(
              width: 56, height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.15),
              ),
              child: const Icon(Icons.notifications_active, color: Colors.white, size: 32),
            ),
          ],
        ),
      ),
    );
  }
}
