// lib/screens/main_screen.dart
// 스크린샷 기준: 하단 탭바 5개 (홈/내채널/구독채널/수신함/발신함)
// 상단 앱바: RinGo 로고 + 검색/설정/햄버거 아이콘
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'home_screen_main.dart';
import 'terms_screen.dart';
import 'my_channels_screen.dart';
import 'subscribed_channels_screen.dart';
import 'notification_screen.dart';
import 'settings_screen.dart';
import 'notices_screen.dart';
import 'channel_explore_screen.dart';
import 'auth_screen.dart';
import 'join_channel_screen.dart';

// ── 색상 상수 ─────────────────────────────────────
const _grey    = Color(0xFF9E9E9E);
const _primary = Color(0xFF6C63FF);
const _bgWhite = Color(0xFFFFFFFF);
const _divider = Color(0xFFEEEEEE);

class MainScreen extends StatefulWidget {
  final int initialTab;
  const MainScreen({super.key, this.initialTab = 0});

  // 탭 인덱스 상수 (외부에서 MainScreen.tabSearch 로 접근 가능)
  static const int tabSearch = 5;

  @override
  State<MainScreen> createState() => MainScreenState();
}

// 퍼블릭 State - 자식 위젯에서 findAncestorStateOfType<MainScreenState>() 로 접근
class MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;
  bool _hasUnreadNotice = false;

  // 각 네이티브 화면 reload를 위한 GlobalKey
  final GlobalKey<SubscribedChannelsScreenState> _subscribedKey  = GlobalKey<SubscribedChannelsScreenState>();
  final GlobalKey<MyChannelsScreenState>         _myChannelsKey  = GlobalKey<MyChannelsScreenState>();
  final GlobalKey<NotificationScreenState>       _inboxKey       = GlobalKey<NotificationScreenState>();
  final GlobalKey<NotificationScreenState>       _outboxKey      = GlobalKey<NotificationScreenState>();

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
      MyChannelsScreen(key: _myChannelsKey),
      SubscribedChannelsScreen(key: _subscribedKey),
      NotificationScreen(key: _inboxKey,  mode: NotificationMode.inbox),
      NotificationScreen(key: _outboxKey, mode: NotificationMode.outbox),
      const ChannelExploreScreen(), // index 5 - 검색 아이콘으로 전환
    ];
    _registerFcmToken();
    _checkUnreadNotices();
    _listenFcmForNative(); // channel_deleted / force_logout FCM 처리
    _initDeepLink();       // 딥링크(초대코드) 수신 처리
    // 빌드 완료 후 terms 체크
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkTerms());
  }

  // ── 네이티브 화면용 FCM 이벤트 처리 ─────────────────────────────
  // lib/main.dart (WebView)의 FCM 핸들러와 별개로 네이티브 화면에서도 처리
  void _listenFcmForNative() {
    // 포그라운드 메시지 처리
    FirebaseMessaging.onMessage.listen((message) async {
      final action = message.data['action'] ?? '';

      // ── channel_deleted: 해당 채널을 내채널/구독채널/수신함/발신함에서 즉시 제거 ──
      if (action == 'channel_deleted') {
        _reloadAllTabs();
        return;
      }

      // ── force_logout: 관리자 삭제/차단 → 세션 초기화 후 로그인 화면으로 ──
      if (action == 'force_logout') {
        final reason = message.data['reason'] ?? 'deleted';
        await _handleForceLogoutNative(reason);
        return;
      }
    });

    // 백그라운드에서 알림 탭해서 앱 재개 시 처리
    FirebaseMessaging.onMessageOpenedApp.listen((message) async {
      final action = message.data['action'] ?? '';
      if (action == 'channel_deleted') {
        _reloadAllTabs();
      } else if (action == 'force_logout') {
        final reason = message.data['reason'] ?? 'deleted';
        await _handleForceLogoutNative(reason);
      }
    });

    // 종료 상태에서 알림 탭해서 앱 실행 시 처리
    FirebaseMessaging.instance.getInitialMessage().then((message) async {
      if (message == null) return;
      final action = message.data['action'] ?? '';
      if (action == 'channel_deleted') {
        // 화면 빌드 완료 후 갱신
        WidgetsBinding.instance.addPostFrameCallback((_) => _reloadAllTabs());
      } else if (action == 'force_logout') {
        final reason = message.data['reason'] ?? 'deleted';
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          await _handleForceLogoutNative(reason);
        });
      }
    });
  }

  // ── 전체 탭 데이터 갱신 ──────────────────────────────────────────
  void _reloadAllTabs() {
    _myChannelsKey.currentState?.reload();
    _subscribedKey.currentState?.reload();
    _inboxKey.currentState?.reload();
    _outboxKey.currentState?.reload();
  }

  // ── 딥링크 초기화: pushapp://join?token=xxx → JoinChannelScreen ──────────
  static const _deepLinkChannel = MethodChannel('com.pushnotify.push_notify_app/deeplink');

  void _initDeepLink() {
    // 앱 실행 중 딥링크 수신 (Kotlin → Flutter)
    _deepLinkChannel.setMethodCallHandler((call) async {
      if (call.method == 'onDeepLink') {
        final token = call.arguments as String?;
        if (token != null && token.isNotEmpty) {
          debugPrint('[DeepLink][Native] onDeepLink 수신: $token');
          await Future.delayed(const Duration(milliseconds: 800));
          if (mounted) _openJoinScreen(token);
        }
      }
    });

    // 콜드스타트: Kotlin에 pending 토큰 요청
    Future.delayed(const Duration(milliseconds: 1000), () async {
      try {
        final token = await _deepLinkChannel.invokeMethod<String?>('getInitialToken');
        if (token != null && token.isNotEmpty) {
          debugPrint('[DeepLink][Native] getInitialToken: $token');
          await Future.delayed(const Duration(milliseconds: 500));
          if (mounted) _openJoinScreen(token);
        }
      } catch (e) {
        debugPrint('[DeepLink][Native] getInitialToken 오류: $e');
      }
    });
  }

  void _openJoinScreen(String token) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => JoinChannelScreen(inviteToken: token),
      ),
    ).then((_) {
      // 채널 참여 완료 후 구독채널 탭 갱신
      _subscribedKey.currentState?.reload();
    });
  }

  Future<void> _handleForceLogoutNative(String reason) async {
    if (!mounted) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_token');
    await prefs.remove('user_id');
    await prefs.remove('email');
    await prefs.remove('user_email');
    await prefs.remove('display_name');
    if (!mounted) return;

    final isDeleted = reason == 'deleted';
    final title   = isDeleted ? '계정 삭제됨' : '계정 사용 불가';
    final content = isDeleted
        ? '관리자에 의해 계정이 삭제되었습니다.\n다시 가입하실 수 있습니다.'
        : '이 계정은 사용할 수 없습니다.\n다른 계정을 선택해주세요.';
    final icon      = isDeleted ? Icons.person_remove : Icons.block;
    final iconColor = isDeleted ? const Color(0xFFF59E0B) : const Color(0xFFEF4444);

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          Icon(icon, color: iconColor, size: 22),
          const SizedBox(width: 8),
          Text(title, style: const TextStyle(
            color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        ]),
        content: Text(
          content,
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14, height: 1.6),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('확인',
              style: TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AuthScreen()),
      (route) => false,
    );
  }

  Future<void> _checkUnreadNotices() async {
    try {
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/notices?limit=20&offset=0'))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final list = (body['data'] as List? ?? [])
            .map((e) => e as Map<String, dynamic>)
            .toList();
        if (list.isNotEmpty) {
          final prefs = await SharedPreferences.getInstance();
          final seen = prefs.getStringList('seen_notice_ids') ?? [];
          final seenSet = seen.toSet();
          final hasUnread = list.any((n) => !seenSet.contains(n['id']?.toString() ?? ''));
          if (mounted) setState(() => _hasUnreadNotice = hasUnread);
        } else {
          if (mounted) setState(() => _hasUnreadNotice = false);
        }
      }
    } catch (_) {}
  }

  Future<void> _checkTerms() async {
    final prefs = await SharedPreferences.getInstance();
    final accepted = prefs.getBool('termsAccepted') ?? false;
    if (!accepted && mounted) {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        barrierColor: Colors.black54,
        builder: (_) => const TermsDialog(),
      );
    }
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
    if (mounted) {
      setState(() => _currentIndex = index);
      // 탭 전환 시 해당 화면 목록 갱신
      if (index == 1) _myChannelsKey.currentState?.reload();
      if (index == 2) _subscribedKey.currentState?.reload();
      if (index == 3) _inboxKey.currentState?.reload();
      if (index == 4) _outboxKey.currentState?.reload();
    }
  }

  void _onTabTapped(int index) {
    setState(() => _currentIndex = index);
  }

  void _openDrawer(BuildContext context) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'drawer',
      barrierColor: Colors.black54,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, anim, secAnim) => _HamburgerDrawer(
        onTabSelect: (index) {
          Navigator.pop(ctx);
          setState(() => _currentIndex = index);
        },
        hasUnreadNotice: _hasUnreadNotice,
        onNoticeRead: _checkUnreadNotices,
      ),
      transitionBuilder: (ctx, anim, secAnim, child) {
        final offset = Tween<Offset>(
          begin: const Offset(1, 0),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut));
        return SlideTransition(position: offset, child: child);
      },
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
          icon: Icon(Icons.search,
              color: _currentIndex == MainScreen.tabSearch ? _primary : const Color(0xFF333333),
              size: 24),
          padding: const EdgeInsets.all(4),
          visualDensity: VisualDensity.compact,
          onPressed: () => setState(() => _currentIndex = MainScreen.tabSearch),
        ),
        IconButton(
          icon: const Icon(Icons.settings_outlined, color: Color(0xFF333333), size: 24),
          padding: const EdgeInsets.all(4),
          visualDensity: VisualDensity.compact,
          onPressed: () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
          },
        ),
        Stack(
          children: [
            IconButton(
              icon: const Icon(Icons.menu, color: Color(0xFF333333), size: 24),
              padding: const EdgeInsets.only(left: 4, right: 12, top: 4, bottom: 4),
              visualDensity: VisualDensity.compact,
              onPressed: () => _openDrawer(context),
            ),
            if (_hasUnreadNotice)
              Positioned(
                top: 8,
                right: 12,
                child: Container(
                  width: 8, height: 8,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
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

// ── RinGo 로고 이미지 ──────────────────────────────
class _RinGoLogo extends StatelessWidget {
  const _RinGoLogo();
  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/ringo_logo_black.png',
      height: 28,
      fit: BoxFit.contain,
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
  final bool hasUnreadNotice;
  final VoidCallback onNoticeRead;
  const _HamburgerDrawer({
    required this.onTabSelect,
    this.hasUnreadNotice = false,
    required this.onNoticeRead,
  });

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
    final topPad = MediaQuery.of(context).padding.top;
    return Material(
      color: Colors.transparent,
      child: GestureDetector(
        // 드로어 바깥(왼쪽 빈 영역) 탭 시 닫기
        onTap: () => Navigator.pop(context),
        behavior: HitTestBehavior.opaque,
        child: Align(
          alignment: Alignment.centerRight,
          child: GestureDetector(
            // 드로어 패널 내부 탭은 닫히지 않도록 이벤트 차단
            onTap: () {},
            child: Container(
              width: MediaQuery.of(context).size.width * 0.72,
              height: double.infinity,
              color: Colors.white,
              padding: EdgeInsets.only(top: topPad),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 헤더
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
                child: Row(
                  children: [
                    Image.asset(
                      'assets/images/ringo_logo_black.png',
                      height: 24,
                      fit: BoxFit.contain,
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
                badge: widget.hasUnreadNotice,
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const NoticesScreen()),
                  ).then((_) => widget.onNoticeRead());
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
        ),      // Container (드로어 패널)
          ),    // GestureDetector (내부 탭 차단)
        ),      // Align
      ),        // GestureDetector (바깥 탭 → 닫기)
    );          // Material
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
