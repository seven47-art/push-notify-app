// lib/main.dart  – WebView 래퍼 앱 + FlutterBridge + 가상통화 알람
// 백그라운드/잠금화면 알람: Kotlin (AlarmPollingService + RinGoFCMService) 처리
// 포그라운드 알람: Flutter _pollAlarms() + FakeCallScreen 처리
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
// android_intent_plus: 미사용 (record_audio/video가 MethodChannel/ImagePicker로 대체됨)
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'config.dart';
import 'fake_call_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/permission_screen.dart';

// ── 서버 URL (config.dart에서 관리) ──────────────
const String _appUrl  = kAppUrl;
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF0F0C29),
      ),
      home: const SplashScreen(),
      routes: {
        '/auth':        (_) => const AuthScreen(),
        '/permissions': (_) => const PermissionScreen(),
        '/main':        (_) => const WebViewScreen(),
      },
    );
  }
}

// ═══════════════════════════════════════════════
//  스플래시 화면 – 세션 유효성 확인 후 분기
// ═══════════════════════════════════════════════
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    await Future.delayed(const Duration(milliseconds: 1200));
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('session_token') ?? '';

    // 토큰 없으면 → 로그인 화면
    if (token.isEmpty) { _goAuth(); return; }

    // 로그인 되어 있지만 권한 설정을 아직 안 했으면 → 권한 화면
    final permDone = prefs.getBool('permissions_setup_done') ?? false;
    if (!permDone) { _goPermissions(); return; }

    // 토큰 있으면 → 서버 확인 시도 (실패해도 메인으로)
    // 핵심: 네트워크 오류/서버 오류는 무시하고 저장된 토큰으로 자동 로그인
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          // 세션 유효 → 메인
          _goMain();
          return;
        }
        // 401/403: 서버가 명시적으로 세션 만료 → 재로그인
        if (res.statusCode == 401 || res.statusCode == 403) {
          await prefs.remove('session_token');
          _goAuth();
          return;
        }
      }

      // 500 등 서버 오류 → 토큰 유지하고 메인으로 (오프라인 허용)
      _goMain();
    } catch (_) {
      // 네트워크 없음 / 타임아웃 → 토큰 유지하고 메인으로
      _goMain();
    }
  }

  void _goAuth()        { if (mounted) Navigator.of(context).pushReplacementNamed('/auth'); }
  void _goPermissions() { if (mounted) Navigator.of(context).pushReplacementNamed('/permissions'); }
  void _goMain()        { if (mounted) Navigator.of(context).pushReplacementNamed('/main'); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 90, height: 90,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6C63FF).withOpacity(0.5),
                    blurRadius: 30, offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: const Icon(Icons.notifications_active, color: Colors.white, size: 48),
            ),
            const SizedBox(height: 18),
            const Text('RinGo',
              style: TextStyle(color: Colors.white, fontSize: 28,
                fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            const SizedBox(height: 40),
            const SizedBox(
              width: 28, height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF6C63FF)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════
//  WebView 메인 화면 + 알람 폴링 + 가상통화 처리
// ═══════════════════════════════════════════════
class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});
  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> with WidgetsBindingObserver {
  late final WebViewController _controller;
  bool  _loading = true;
  bool  _hasError = false;
  int   _loadingProgress = 0;

  // ── 오디오 녹음 상태 (Kotlin MethodChannel 방식) ──
  static const _audioChannel = MethodChannel('com.pushnotify.push_notify_app/audio_recorder');
  bool _isAudioRecording = false;
  String? _pendingAudioPath;
  int? _pendingAudioTimestamp;

  // ── 알람 폴링 ──
  Timer? _alarmPollTimer;
  bool   _isFakeCallShowing = false;
  // 이미 처리한 alarm_id 목록 (중복 수신 방지 - FCM + 폴링 동시 수신 케이스)
  final Set<int> _handledAlarmIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initWebView();
    _startAlarmPolling();          // v1.0.43: 비활성화됨 (Kotlin AlarmPollingService가 처리)
    _initFCM();                     // FCM 초기화 + 토큰 서버 등록
    _schedulePendingAlarms();       // v1.0.76: 앱 시작 시 pending 알람 AlarmManager 즉시 예약
    // v1.0.43: _pendingAlarmData 처리 제거 - Kotlin FakeCallActivity가 단독 처리
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _alarmPollTimer?.cancel();
    super.dispose();
  }

  // ── 세션 토큰 웹뷰 localStorage 주입 (재시도 포함) ──
  Future<void> _injectSession() async {
    final prefs       = await SharedPreferences.getInstance();
    final token       = prefs.getString('session_token') ?? '';
    if (token.isEmpty) return;

    final userId      = prefs.getString('user_id')      ?? '';
    final email       = prefs.getString('email')        ?? prefs.getString('user_email') ?? '';
    final displayName = prefs.getString('display_name') ?? '';
    final fcmToken    = prefs.getString('fcm_token')    ?? '';  // Android FCM 토큰

    final t = token.replaceAll("'", "\\'");
    final u = userId.replaceAll("'", "\\'");
    final e = email.replaceAll("'", "\\'");
    final d = displayName.replaceAll("'", "\\'");
    final f = fcmToken.replaceAll("'", "\\'");  // FCM 토큰 이스케이프

    // JS 함수 존재 여부와 무관하게 localStorage에 직접 주입 후
    // flutterSetSession이 있으면 호출, 없으면 Auth/App 직접 제어
    final js = """
(function() {
  localStorage.setItem('session_token', '$t');
  localStorage.setItem('user_id', '$u');
  localStorage.setItem('email', '$e');
  localStorage.setItem('display_name', '$d');
  if ('$f' !== '') {
    localStorage.setItem('flutter_fcm_token', '$f');
  }
  if (typeof window.flutterSetSession === 'function') {
    window.flutterSetSession('$t', '$u', '$e', '$d');
  } else {
    if (typeof Auth !== 'undefined' && typeof Auth.hide === 'function') {
      Auth.hide();
    }
    if (typeof App !== 'undefined' && typeof App.goto === 'function') {
      App.goto('home');
    }
  }
})();
""";
    await _controller.runJavaScript(js);

    // 500ms 후 한 번 더 시도 (DOMContentLoaded 타이밍 이슈 대비)
    await Future.delayed(const Duration(milliseconds: 500));
    if (mounted) {
      await _controller.runJavaScript(js);
    }
  }

  void _initWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF121212))
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (JavaScriptMessage msg) {
          _handleBridgeMessage(msg.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() { _loading = true; _hasError = false; }),
          onProgress:    (p) => setState(() => _loadingProgress = p),
          onPageFinished: (_) async {
            setState(() => _loading = false);
            // ── Flutter 세션 토큰을 웹뷰 localStorage에 주입 ──
            await _injectSession();
          },
          onWebResourceError: (err) {
            if (err.isForMainFrame == true) setState(() { _hasError = true; _loading = false; });
          },
          onNavigationRequest: (NavigationRequest req) {
            final uri = Uri.tryParse(req.url);
            if (uri != null && uri.scheme == 'pushapp') {
              _handleDeepLink(uri);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(_appUrl));
  }

  // ── 앱 포그라운드/백그라운드 감지 ──
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // v1.0.43: Flutter 폴링 제거 - Kotlin AlarmPollingService가 처리
      debugPrint('[Lifecycle] 포그라운드 복귀 (Flutter 폴링 없음)');
    }
  }

  // ── FCM 초기화 + 토큰 서버 등록 ──────────────────────
  Future<void> _initFCM() async {
    try {
      final messaging = FirebaseMessaging.instance;

      // Android 13+ 알림 권한 요청
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      // FCM 토큰 획득 + 서버 등록
      final fcmToken = await messaging.getToken();
      if (fcmToken != null) {
        debugPrint('[FCM] 토큰: $fcmToken');
        await _registerFcmToken(fcmToken);
      }

      // 토큰 갱신 시 서버 재등록
      messaging.onTokenRefresh.listen((newToken) {
        debugPrint('[FCM] 토큰 갱신: $newToken');
        _registerFcmToken(newToken);
      });

      // v1.0.43: 포그라운드 FCM 알람은 Kotlin RinGoFCMService가 단독 처리
      // Flutter onMessage에서 FakeCallScreen을 띄우면 FakeCallActivity(새 UI)와 이중으로 뜨는 문제 발생
      // → Flutter에서는 로그만 남기고 알람 표시는 Kotlin에 완전 위임
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('[FCM] 포그라운드 메시지 수신 (Kotlin에서 처리): ${message.data}');
        // 알람 처리는 Kotlin RinGoFCMService → AlarmPollingService.triggerAlarm → FakeCallActivity
        // 여기서 _showFakeCall() 호출하면 Flutter FakeCallScreen(구 UI)이 이중으로 뜸 → 절대 호출 금지
      });

      // v1.0.43: 알림 탭 재개 시에도 Kotlin FakeCallActivity가 이미 처리했으므로 Flutter에서 추가 표시 불필요
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('[FCM] 알림 탭으로 앱 재개 (처리 불필요): ${message.data}');
        // Kotlin FakeCallActivity에서 이미 표시됨 → 추가 처리 없음
      });

      // v1.0.43: FakeCallActivity 수락 후 ContentPlayerActivity로 이동은 Kotlin에서 처리
      // Flutter _showFakeCall()은 더 이상 사용하지 않음
      const alarmDataCh = MethodChannel('com.pushnotify/alarm_data');
      alarmDataCh.setMethodCallHandler((call) async {
        debugPrint('[AlarmData] 수신 (v1.0.43 이후 미사용): ${call.method}');
        // FakeCallActivity 수락 → ContentPlayerActivity 전환은 Kotlin에서 직접 처리
      });

    } catch (e) {
      debugPrint('[FCM] 초기화 실패: $e');
    }
  }

  // ── FCM 토큰을 서버에 등록 ──────────────────────
  Future<void> _registerFcmToken(String fcmToken) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sessionToken = prefs.getString('session_token') ?? '';
      if (sessionToken.isEmpty) return;

      final res = await http.post(
        Uri.parse('$_baseUrl/api/fcm/register'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $sessionToken',
        },
        body: jsonEncode({'fcm_token': fcmToken}),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        debugPrint('[FCM] 토큰 서버 등록 성공');
        // 로컬에도 저장
        await prefs.setString('fcm_token', fcmToken);
        // 웹뷰에도 즉시 주입 (onPageFinished보다 늦게 완료될 수 있으므로 별도 주입)
        final f = fcmToken.replaceAll("'", "\\'");
        try {
          await _controller.runJavaScript(
            "localStorage.setItem('flutter_fcm_token', '$f');"
          );
          debugPrint('[FCM] 웹뷰 flutter_fcm_token 주입 완료');
        } catch (e) {
          debugPrint('[FCM] 웹뷰 주입 오류: $e');
        }
      } else {
        debugPrint('[FCM] 토큰 서버 등록 실패: ${res.statusCode}');
      }
    } catch (e) {
      debugPrint('[FCM] 토큰 등록 오류: $e');
    }
  }

  // ── 앱 포그라운드 폴링 비활성화 (v1.0.43)
  // Kotlin AlarmPollingService가 1분 주기로 동일한 /api/alarms/trigger를 호출함
  // Flutter에서도 호출하면 두 경로가 동시에 알람을 트리거 → 이중 알람 발생
  // → Flutter 폴링 완전 제거, Kotlin 단독 처리
  void _startAlarmPolling() {
    debugPrint('[AlarmPoll] Flutter 폴링 비활성화 (Kotlin AlarmPollingService가 처리)');
    // 폴링 타이머 시작하지 않음
  }

  // ── v1.0.76: 앱 시작 시 pending 알람 AlarmManager 즉시 예약 ──
  // FCM alarm_schedule 신호를 못 받은 경우(신규 설치, 재설치 등)에도
  // 앱 시작 시 서버에서 내 채널의 pending 알람을 조회해 AlarmManager에 예약
  Future<void> _schedulePendingAlarms() async {
    try {
      // 세션 토큰 + user_id 확인
      final prefs = await SharedPreferences.getInstance();
      final sessionToken = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      if (sessionToken.isEmpty || userId.isEmpty) {
        debugPrint('[PendingAlarm] 세션 없음 - 건너뜀');
        return;
      }

      // 서버에서 내 채널의 pending 알람 조회
      final res = await http.get(
        Uri.parse('$_baseUrl/api/alarms/pending?user_id=$userId'),
        headers: {'Authorization': 'Bearer $sessionToken'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode != 200) return;

      final body = jsonDecode(res.body);
      final alarms = body['data'] as List<dynamic>?;
      if (alarms == null || alarms.isEmpty) {
        debugPrint('[PendingAlarm] 예약할 알람 없음');
        return;
      }

      // 각 알람을 Kotlin AlarmScheduler에 예약
      const platform = MethodChannel('com.pushnotify.push_notify_app/alarm');
      int scheduled = 0;
      for (final alarm in alarms) {
        final scheduledAt = alarm['scheduled_at'] as String?;
        if (scheduledAt == null) continue;
        final scheduledMs = DateTime.tryParse(scheduledAt)?.toUtc().millisecondsSinceEpoch;
        if (scheduledMs == null) continue;

        try {
          await platform.invokeMethod('scheduleAlarm', {
            'alarm_id':          alarm['id'] ?? 0,
            'scheduled_ms':      scheduledMs,
            'channel_name':      alarm['channel_name'] ?? '',
            'channel_public_id': alarm['channel_public_id'] ?? '',
            'msg_type':          alarm['msg_type'] ?? 'youtube',
            'msg_value':         alarm['msg_value'] ?? '',
            'content_url':       alarm['msg_value'] ?? '',
            'homepage_url':      alarm['channel_homepage_url'] ?? '',
          });
          scheduled++;
        } catch (e) {
          debugPrint('[PendingAlarm] scheduleAlarm error: $e');
        }
      }
      debugPrint('[PendingAlarm] $scheduled개 알람 AlarmManager 예약 완료');
    } catch (e) {
      debugPrint('[PendingAlarm] 오류: $e');
    }
  }

  // ── 포그라운드 알람 폴링 (비활성화됨 - v1.0.43) ──
  Future<void> _pollAlarms() async {
    // v1.0.43: Flutter 폴링 비활성화 - Kotlin AlarmPollingService 단독 처리
    debugPrint('[AlarmPoll] Flutter 폴링 호출 무시 (Kotlin에서 처리)');
  }

  // ── [v1.0.43 DEPRECATED] 가상통화 화면 표시 ──
  // 모든 알람 표시는 Kotlin FakeCallActivity에서 처리
  // 이 함수는 더 이상 호출되지 않음 (컴파일 오류 방지용으로 유지)
  // ignore: unused_element
  void _showFakeCall({
    required String channelName,
    required String msgType,
    required String msgValue,
    required int    alarmId,
    String contentUrl = '',
  }) {
    // v1.0.43: 호출 금지 - Kotlin FakeCallActivity가 단독 처리
    debugPrint('[DEPRECATED] _showFakeCall 호출됨 (무시): $channelName (id=$alarmId)');
  }

  // ── FlutterBridge 메시지 처리 ──────────────────────
  void _handleBridgeMessage(String message) async {
    try {
      final data = jsonDecode(message) as Map<String, dynamic>;
      final action = data['action'] as String? ?? '';

      switch (action) {
        case 'record_audio':
          await _launchAudioRecorder();
          break;
        case 'stop_audio_record':
          await _stopAudioRecorder();
          break;
        case 'record_video':
          await _launchVideoRecorder();
          break;
        case 'pick_file':
          await _launchFilePicker();
          break;
        case 'pick_audio_file':
          await _pickAudioFile();
          break;
        case 'pick_video_file':
          await _pickVideoFile();
          break;
        case 'pick_image':
          // v1.0.50: 채널 대표이미지 선택 - Flutter ImagePicker로 처리 (WebView file input 우회)
          final imgSource = data['source'] as String? ?? 'gallery';
          await _pickChannelImage(imgSource);
          break;
        case 'show_fake_call':
          // v1.0.43: FlutterBridge에서 show_fake_call 요청도 Kotlin으로 전달 안 함
          // 웹에서 직접 알람을 띄우는 경우는 없어야 하므로 로그만 남김
          debugPrint('[FlutterBridge] show_fake_call 무시 (Kotlin FakeCallActivity가 처리)');
          break;
        case 'launch_youtube':
          final url = data['url'] as String? ?? '';
          if (url.isNotEmpty) {
            final uri = Uri.parse(url);
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
          break;
        case 'get_fcm_token':
          // 웹뷰에서 FCM 토큰 요청 → SharedPreferences에서 읽어서 콜백으로 전달
          final callback = data['callback'] as String? ?? '';
          if (callback.isNotEmpty) {
            final prefs2 = await SharedPreferences.getInstance();
            final token2 = prefs2.getString('fcm_token') ?? '';
            _sendToWeb(callback, {'fcm_token': token2, 'platform': token2.isNotEmpty ? 'android' : 'web'});
            debugPrint('[FlutterBridge] get_fcm_token → ${token2.isNotEmpty ? "토큰 전달" : "토큰 없음"}');
          }
          break;
        case 'logout':
          // 웹뷰에서 로그아웃 요청 → 세션 삭제 + 로그인 화면으로 이동
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('session_token');
          await prefs.remove('user_id');
          await prefs.remove('email');
          await prefs.remove('user_email');
          await prefs.remove('display_name');
          await prefs.remove('fcm_token');
          await prefs.remove('permissions_setup_done');
          debugPrint('[FlutterBridge] 로그아웃 완료 → /auth 이동');
          if (mounted) {
            Navigator.of(context).pushNamedAndRemoveUntil('/auth', (route) => false);
          }
          break;
      }
    } catch (e) {
      debugPrint('[FlutterBridge] error: $e');
    }
  }

  void _sendToWeb(String callbackFn, Map<String, dynamic> result) {
    final json = jsonEncode(result);
    _controller.runJavaScript('if(typeof $callbackFn==="function")$callbackFn($json)');
  }

  Future<void> _launchAudioRecorder() async {
    try {
      final dir = await getTemporaryDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final filePath = '${dir.path}/recording_$timestamp.m4a';

      // Kotlin MediaRecorder 시작
      final result = await _audioChannel.invokeMethod('startRecording', {'path': filePath});
      if (result == true) {
        _isAudioRecording = true;
        _pendingAudioPath = filePath;
        _pendingAudioTimestamp = timestamp;
        _controller.runJavaScript(
          'if (typeof showToast === "function") showToast("🎙️ 녹음 중... 완료하려면 다시 누르세요");'
        );
      } else {
        _sendToWeb('window._flutterFileError', {'type': 'audio', 'error': '녹음 시작 실패'});
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'audio', 'error': e.toString()});
    }
  }

  // 녹음 중지 및 파일 반환
  Future<void> _stopAudioRecorder() async {
    if (!_isAudioRecording) return;
    try {
      // Kotlin MediaRecorder 중지
      await _audioChannel.invokeMethod('stopRecording');
      _isAudioRecording = false;

      final path = _pendingAudioPath;
      final timestamp = _pendingAudioTimestamp;
      _pendingAudioPath = null;
      _pendingAudioTimestamp = null;

      if (path != null) {
        final file = File(path);
        if (await file.exists()) {
          final fileSize = await file.length();
          final fileName = 'recording_${timestamp ?? DateTime.now().millisecondsSinceEpoch}.m4a';
          _sendToWeb('window._flutterFileCallback', {
            'type': 'audio',
            'name': fileName,
            'path': path,
            'size': fileSize,
            'base64': ''
          });
        } else {
          _sendToWeb('window._flutterFileCancelled', {'type': 'audio'});
        }
      } else {
        _sendToWeb('window._flutterFileCancelled', {'type': 'audio'});
      }
    } catch (e) {
      _isAudioRecording = false;
      _sendToWeb('window._flutterFileError', {'type': 'audio', 'error': e.toString()});
    }
  }

  Future<void> _launchVideoRecorder() async {
    try {
      // ImagePicker 카메라 모드로 녹화 → 완료 후 파일 자동 첨부
      final picker = ImagePicker();
      final XFile? video = await picker.pickVideo(
        source: ImageSource.camera,
        maxDuration: const Duration(minutes: 10),
      );
      if (video != null) {
        final file = File(video.path);
        final fileSize = await file.length();
        final fileName = video.path.split('/').last;
        _sendToWeb('window._flutterFileCallback', {
          'type': 'video',
          'name': fileName,
          'path': video.path,
          'size': fileSize,
          'base64': ''
        });
      } else {
        _sendToWeb('window._flutterFileCancelled', {'type': 'video'});
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'video', 'error': e.toString()});
    }
  }

  Future<void> _pickAudioFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(type: FileType.audio, withData: false, withReadStream: false);
      if (result != null && result.files.isNotEmpty) {
        final f = result.files.first;
        _sendToWeb('window._flutterFileCallback', {'type': 'audio', 'name': f.name, 'path': f.path ?? '', 'size': f.size, 'base64': ''});
      } else {
        _sendToWeb('window._flutterFileCancelled', {'type': 'audio'});
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'audio', 'error': e.toString()});
    }
  }

  Future<void> _pickVideoFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(type: FileType.video, withData: false, withReadStream: false);
      if (result != null && result.files.isNotEmpty) {
        final f = result.files.first;
        _sendToWeb('window._flutterFileCallback', {'type': 'video', 'name': f.name, 'path': f.path ?? '', 'size': f.size, 'base64': ''});
      } else {
        _sendToWeb('window._flutterFileCancelled', {'type': 'video'});
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'video', 'error': e.toString()});
    }
  }

  // v1.0.50: 채널 대표이미지 선택 - Flutter ImagePicker 사용 (WebView file input 우회)
  // base64로 인코딩해서 웹뷰로 전달
  Future<void> _pickChannelImage(String source) async {
    try {
      final picker = ImagePicker();
      final XFile? image = await picker.pickImage(
        source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 300,
        maxHeight: 300,
        imageQuality: 70,
      );
      if (image == null) {
        _sendToWeb('window._flutterImageCancelled', {});
        return;
      }
      final bytes = await image.readAsBytes();
      final base64Str = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      _sendToWeb('window._flutterImageCallback', {
        'base64': base64Str,
        'name': image.name,
      });
    } catch (e) {
      _sendToWeb('window._flutterImageError', {'error': e.toString()});
    }
  }

  Future<void> _launchFilePicker() async {
    try {
      final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: false, withReadStream: false);
      if (result != null && result.files.isNotEmpty) {
        final f = result.files.first;
        _sendToWeb('window._flutterFileCallback', {'type': 'file', 'name': f.name, 'path': f.path ?? '', 'size': f.size, 'base64': ''});
      } else {
        _sendToWeb('window._flutterFileCancelled', {'type': 'file'});
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'file', 'error': e.toString()});
    }
  }

  void _handleDeepLink(Uri uri) {
    if (uri.host == 'join') {
      final token = uri.queryParameters['token'] ?? '';
      if (token.isNotEmpty) _showJoinDialog(token);
    }
  }

  void _showJoinDialog(String token) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1B4B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Icon(Icons.notifications_active, color: Color(0xFF6C63FF)),
            SizedBox(width: 10),
            Text('채널 초대', style: TextStyle(color: Colors.white, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '초대 링크를 통해 채널에 참여하시겠습니까?\n참여 후 새 콘텐츠 알림을 받을 수 있습니다.',
              style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 14, height: 1.6),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF0F0C29),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.3)),
              ),
              child: Text(token,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Color(0xFFA5B4FC))),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('취소', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _controller.loadRequest(Uri.parse('$_appUrl?join_token=$token'));
            },
            child: const Text('참여하기', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Future<bool> _onWillPop() async {
    // 1. 웹뷰 JS에 goBack() 요청 → 웹에서 처리하면 false(앱 유지)
    try {
      final result = await _controller.runJavaScriptReturningResult(
        'App && typeof App.goBack === "function" ? App.goBack() : true'
      );
      // JS가 false 반환 → 웹에서 처리 완료, 앱 유지
      if (result.toString() == 'false' || result.toString() == 'null') {
        return false;
      }
    } catch (_) {}

    // 2. WebView 히스토리가 있으면 뒤로
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }

    // 3. 홈 탭 상태 → 앱 종료
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: _onWillPop,
      child: Scaffold(
        backgroundColor: const Color(0xFF121212),
        body: SafeArea(
          child: Stack(
            children: [
              _hasError ? _buildErrorView() : WebViewWidget(controller: _controller),
              if (_loading)
                Positioned(
                  top: 0, left: 0, right: 0,
                  child: LinearProgressIndicator(
                    value: _loadingProgress / 100,
                    minHeight: 3,
                    backgroundColor: Colors.transparent,
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF6C63FF)),
                  ),
                ),
              if (_loading && _loadingProgress < 10)
                Container(
                  color: const Color(0xFF121212),
                  child: const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _AppLogo(),
                        SizedBox(height: 24),
                        SizedBox(
                          width: 32, height: 32,
                          child: CircularProgressIndicator(
                            strokeWidth: 3, color: Color(0xFF6C63FF),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _AppLogo(),
            const SizedBox(height: 32),
            const Icon(Icons.wifi_off_rounded, color: Color(0xFF6C63FF), size: 56),
            const SizedBox(height: 16),
            const Text('서버에 연결할 수 없습니다',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('인터넷 연결을 확인하고 다시 시도해 주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[400], fontSize: 14, height: 1.5)),
            const SizedBox(height: 28),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('다시 시도', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              onPressed: () {
                setState(() { _hasError = false; _loading = true; });
                _controller.reload();
              },
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
