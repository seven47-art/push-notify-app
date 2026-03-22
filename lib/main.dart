// lib/main.dart  – 네이티브 Flutter 앱 + 가상통화 알람
// 백그라운드/잠금화면 알람: Kotlin (AlarmPollingService + RinGoFCMService) 처리
// 포그라운드 알람: Flutter _pollAlarms() + FakeCallScreen 처리
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
// android_intent_plus: 미사용 (record_audio/video가 MethodChannel/ImagePicker로 대체됨)
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:video_compress/video_compress.dart';
import 'config.dart';
import 'fake_call_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/permission_screen.dart';
import 'screens/terms_screen.dart';
import 'screens/main_screen.dart';

// ── 서버 URL (config.dart에서 관리) ──────────────
const String _baseUrl = kBaseUrl;

// ── 전역 알림 플러그인 ────────────────────────────
final FlutterLocalNotificationsPlugin _notificationsPlugin =
    FlutterLocalNotificationsPlugin();

// ── 앱 전역 네비게이터 키 ──────────────────────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// ── 백그라운드 알람 데이터 임시 저장 ──────────────
Map<String, dynamic>? _pendingAlarmData;

// ─────────────────────────────────────────────────
// FCM 백그라운드 핸들러 (앱 종료 시)
// 실제 처리는 Kotlin RinGoFCMService.onMessageReceived()가 담당
// ─────────────────────────────────────────────────
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('[FCM-BG] 백그라운드 메시지 수신 (Kotlin에서 처리): ${message.data}');
}

// ─────────────────────────────────────────────────
// 앱 시작점
// ─────────────────────────────────────────────────
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase 초기화
  await Firebase.initializeApp();

  // FCM 백그라운드 핸들러 등록
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // 상태바 투명
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  // 로컬 알림 초기화 (인앱 알림용)
  await _initLocalNotifications();

  runApp(const RinGoApp());
}

// ─────────────────────────────────────────────────
// 로컬 알림 초기화
// ─────────────────────────────────────────────────
Future<void> _initLocalNotifications() async {
  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  const initSettings = InitializationSettings(android: androidInit);

  await _notificationsPlugin.initialize(
    initSettings,
    onDidReceiveNotificationResponse: (NotificationResponse res) {
      // v1.0.43: 로컬 알림 탭 핸들러 - FakeCallScreen 표시 제거
      // 알람은 Kotlin FakeCallActivity에서 이미 처리됨 → Flutter에서 추가 표시 불필요
      debugPrint('[Notification] tapped (v1.0.43: 추가 처리 없음): ${res.payload}');
    },
  );

  // Android 알림 채널 설정 (벨소리 + 진동)
  // ※ 권한 요청(requestNotificationsPermission, requestExactAlarmsPermission)은
  //    permission_screen.dart에서 단계적으로 처리함
  //    여기서 요청하면 Flutter 초기화 도중 팝업이 떠서 흰화면 먹통 발생!
  if (Platform.isAndroid) {
    const channel = AndroidNotificationChannel(
      'alarm_channel',
      'RinGo 알람',
      description: '채널 알람 수신 알림',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      enableLights: true,
      ledColor: Color(0xFF6C63FF),
    );
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    // 알림 권한 요청은 permission_screen에서 처리 (여기서 하면 흰화면 크래시)
  }
}

// ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────
// [v1.0.43 DEPRECATED] _showFakeCallFromData
// 모든 알람 표시는 Kotlin FakeCallActivity에서 처리
// 이 함수는 더 이상 호출되지 않음 (컴파일 오류 방지용으로 유지)
// ─────────────────────────────────────────────────
// ignore: unused_element
void _showFakeCallFromData(BuildContext context, Map<String, dynamic> data) {
  // v1.0.43: 호출 금지 - Kotlin FakeCallActivity가 단독 처리
  debugPrint('[DEPRECATED] _showFakeCallFromData 호출됨 (무시)');
}

// ─────────────────────────────────────────────────
// RinGo 앱
// ─────────────────────────────────────────────────
class RinGoApp extends StatelessWidget {
  const RinGoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RinGo',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('ko', 'KR'),
        Locale('en', 'US'),
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF0F0C29),
      ),
      home: const _StartGate(),
      routes: {
        '/auth':        (_) => const AuthScreen(),
        '/permissions': (_) => const PermissionScreen(),
        '/terms':       (_) => const TermsScreen(),
        '/native_main': (_) => const MainScreen(),
      },
    );
  }
}

// ═══════════════════════════════════════════════
//  시작 게이트 – UI 없이 즉시 라우팅
//  Android native splash가 이 구간을 커버함
// ═══════════════════════════════════════════════
class _StartGate extends StatefulWidget {
  const _StartGate();
  @override
  State<_StartGate> createState() => _StartGateState();
}

class _StartGateState extends State<_StartGate> {
  @override
  void initState() {
    super.initState();
    _route();
  }

  Future<void> _route() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('session_token') ?? '';
    if (!mounted) return;
    if (token.isEmpty) {
      Navigator.of(context).pushReplacementNamed('/auth');
      return;
    }
    // 앱 재시작 시 서버에서 세션 유효성 확인 (차단된 계정 즉시 차단)
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 8));
      if (res.statusCode == 401 || res.statusCode == 403) {
        await prefs.remove('session_token');
        await prefs.remove('user_id');
        await prefs.remove('email');
        await prefs.remove('user_email');
        await prefs.remove('display_name');
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/auth');
        return;
      }
    } catch (_) {
      // 네트워크 오류 시 오프라인 허용 (기존 token으로 진입)
    }
    final permDone = prefs.getBool('permissions_setup_done') ?? false;
    if (!mounted) return;
    if (!permDone) {
      Navigator.of(context).pushReplacementNamed('/permissions');
      return;
    }
    // terms 동의 여부와 무관하게 홈으로 이동 (동의창은 MainScreen에서 팝업으로 표시)
    Navigator.of(context).pushReplacementNamed('/native_main');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF000000),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // AuthScreen과 동일한 로고
            ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: Image.asset(
                'assets/images/ringo_icon.png',
                width: 96, height: 96, fit: BoxFit.cover,
              ),
            ),
            const SizedBox(height: 20),
            const Text('RinGo',
                style: TextStyle(color: Colors.white, fontSize: 30,
                    fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            const SizedBox(height: 6),
            const Text('채널 알람 구독 서비스',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
            const SizedBox(height: 48),
            // 로딩 스피너
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Color(0xFF6C63FF),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── 앱 로고 위젯 ──────────────────────────────
class _AppLogo extends StatelessWidget {
  const _AppLogo();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6C63FF).withOpacity(0.4),
                blurRadius: 20, offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(Icons.notifications_active, color: Colors.white, size: 40),
        ),
        const SizedBox(height: 14),
        const Text('RinGo',
          style: TextStyle(
            color: Colors.white, fontSize: 22,
            fontWeight: FontWeight.bold, letterSpacing: 0.5,
          )),
      ],
    );
  }
}
