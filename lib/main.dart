// lib/main.dart  – WebView 래퍼 앱 + FlutterBridge + 가상통화 알람 v19
// FCM(Firebase Cloud Messaging) 방식 - 상단 알림 없이 FakeCallActivity 직접 실행
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:android_intent_plus/android_intent.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:audioplayers/audioplayers.dart';
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
// FCM 백그라운드 메시지 핸들러 (앱이 완전히 꺼진 상태에서도 호출됨)
// ※ 반드시 최상위 함수여야 함 (클래스 밖)
// ─────────────────────────────────────────────────
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // 백그라운드에서는 Kotlin RinGoFCMService.onMessageReceived()가 처리
  // (data-only 메시지는 Android 네이티브에서 직접 FakeCallActivity 실행)
  debugPrint('[FCM-BG] 백그라운드 메시지 수신: ${message.data}');
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
      // 알림 탭 시 앱 포그라운드로 가져옴
      debugPrint('[Notification] tapped: ${res.payload}');
      if (res.payload != null) {
        try {
          final data = jsonDecode(res.payload!) as Map<String, dynamic>;
          _pendingAlarmData = data;
          // 앱이 열려있으면 즉시 가상통화 표시
          final ctx = navigatorKey.currentContext;
          if (ctx != null) {
            _showFakeCallFromData(ctx, data);
          }
        } catch (e) {
          debugPrint('[Notification] payload parse error: $e');
        }
      }
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
// 알람 알림 표시 (벨소리 + 진동 + 풀스크린)
// ─────────────────────────────────────────────────
Future<void> _showAlarmNotification({
  required String channelName,
  required String msgType,
  required String msgValue,
  required int alarmId,
  String? contentUrl,
}) async {
  final payload = jsonEncode({
    'channel_name': channelName,
    'msg_type': msgType,
    'msg_value': msgValue,
    'alarm_id': alarmId,
    'content_url': contentUrl ?? '',
  });

  final androidDetails = AndroidNotificationDetails(
    'alarm_channel',
    'RinGo 알람',
    channelDescription: '채널 알람 수신',
    importance: Importance.max,
    priority: Priority.max,
    playSound: true,
    enableVibration: true,
    vibrationPattern: Int64List.fromList([0, 500, 300, 500, 300, 500]),
    fullScreenIntent: true,    // 잠금화면 위에 표시
    category: AndroidNotificationCategory.call,
    ongoing: false,
    autoCancel: true,
    styleInformation: BigTextStyleInformation(
      '$channelName 채널에서 알람이 도착했습니다.',
      summaryText: 'RinGo 알람',
    ),
  );

  await _notificationsPlugin.show(
    alarmId,
    '📞 $channelName',
    '알람이 도착했습니다. 탭하여 확인하세요.',
    NotificationDetails(android: androidDetails),
    payload: payload,
  );
}

// ─────────────────────────────────────────────────
// 가상통화 화면 표시 (전역)
// ─────────────────────────────────────────────────
void _showFakeCallFromData(BuildContext context, Map<String, dynamic> data) {
  Navigator.of(context).push(
    PageRouteBuilder(
      pageBuilder: (_, __, ___) => FakeCallScreen(
        channelName: data['channel_name'] as String? ?? '알람',
        msgType:     data['msg_type']     as String? ?? 'youtube',
        msgValue:    data['msg_value']    as String? ?? '',
        alarmId:     (data['alarm_id']   as int?) ?? 0,
        contentUrl:  data['content_url'] as String? ?? '',
      ),
      transitionDuration: const Duration(milliseconds: 300),
      transitionsBuilder: (_, anim, __, child) {
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 1),
            end: Offset.zero,
          ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
          child: child,
        );
      },
      fullscreenDialog: true,
    ),
  );
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

  // ── 알람 폴링 ──
  Timer? _alarmPollTimer;
  bool   _isFakeCallShowing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initWebView();
    _startAlarmPolling();          // 포그라운드 폴링 (앱 열려있을 때)
    _initFCM();                     // FCM 초기화 + 토큰 서버 등록

    // 앱 시작 시 대기 중인 알람 데이터 확인 (FakeCallActivity → Flutter)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_pendingAlarmData != null) {
        final data = _pendingAlarmData!;
        _pendingAlarmData = null;
        _showFakeCall(
          channelName: data['channel_name'] as String? ?? '알람',
          msgType:     data['msg_type']     as String? ?? 'youtube',
          msgValue:    data['msg_value']    as String? ?? '',
          alarmId:     (data['alarm_id']   as int?) ?? 0,
          contentUrl:  data['content_url'] as String? ?? '',
        );
      }
    });
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

    final t = token.replaceAll("'", "\\'");
    final u = userId.replaceAll("'", "\\'");
    final e = email.replaceAll("'", "\\'");
    final d = displayName.replaceAll("'", "\\'");

    // JS 함수 존재 여부와 무관하게 localStorage에 직접 주입 후
    // flutterSetSession이 있으면 호출, 없으면 Auth/App 직접 제어
    final js = """
(function() {
  localStorage.setItem('session_token', '$t');
  localStorage.setItem('user_id', '$u');
  localStorage.setItem('email', '$e');
  localStorage.setItem('display_name', '$d');
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
      // 포그라운드로 복귀 시 즉시 폴링
      _pollAlarms();
      // 대기 중인 알람 데이터 처리
      if (_pendingAlarmData != null) {
        final data = _pendingAlarmData!;
        _pendingAlarmData = null;
        _showFakeCall(
          channelName: data['channel_name'] as String? ?? '알람',
          msgType:     data['msg_type']     as String? ?? 'youtube',
          msgValue:    data['msg_value']    as String? ?? '',
          alarmId:     (data['alarm_id']   as int?) ?? 0,
          contentUrl:  data['content_url'] as String? ?? '',
        );
      }
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

      // 앱이 포그라운드일 때 FCM 메시지 수신
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('[FCM] 포그라운드 메시지: ${message.data}');
        final data = message.data;
        if (data['type'] == 'alarm' && mounted) {
          // 포그라운드: Kotlin에서 발송한 Notification을 즉시 취소
          // (Flutter에서 직접 FakeCall 다이얼로그로 처리하므로 중복 방지)
          _notificationsPlugin.cancel(9999);

          _showFakeCall(
            channelName: data['channel_name'] ?? '알람',
            msgType:     data['msg_type']     ?? 'youtube',
            msgValue:    data['msg_value']    ?? '',
            alarmId:     int.tryParse(data['alarm_id'] ?? '0') ?? 0,
            contentUrl:  data['content_url'] ?? '',
          );
        }
      });

      // 앱이 백그라운드에서 알림 탭으로 재개될 때
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('[FCM] 알림 탭으로 앱 재개: ${message.data}');
        final data = message.data;
        if (data['type'] == 'alarm' && mounted) {
          _showFakeCall(
            channelName: data['channel_name'] ?? '알람',
            msgType:     data['msg_type']     ?? 'youtube',
            msgValue:    data['msg_value']    ?? '',
            alarmId:     int.tryParse(data['alarm_id'] ?? '0') ?? 0,
            contentUrl:  data['content_url'] ?? '',
          );
        }
      });

      // FakeCallActivity 수락 후 Flutter로 전달되는 채널 수신
      const alarmDataCh = MethodChannel('com.pushnotify/alarm_data');
      alarmDataCh.setMethodCallHandler((call) async {
        if (call.method == 'onAlarmAnswered') {
          final data = Map<String, dynamic>.from(call.arguments as Map);
          debugPrint('[AlarmData] 수락 데이터 수신: $data');
          if (mounted) {
            _showFakeCall(
              channelName: data['channel_name'] as String? ?? '알람',
              msgType:     data['msg_type']     as String? ?? 'youtube',
              msgValue:    data['msg_value']    as String? ?? '',
              alarmId:     (data['alarm_id']   as int?) ?? 0,
              contentUrl:  data['content_url'] as String? ?? '',
            );
          }
        }
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
      } else {
        debugPrint('[FCM] 토큰 서버 등록 실패: ${res.statusCode}');
      }
    } catch (e) {
      debugPrint('[FCM] 토큰 등록 오류: $e');
    }
  }

  // ── 앱 포그라운드 폴링 (1분 주기) ──
  void _startAlarmPolling() {
    // 10초 후 첫 체크 (앱 오픈 시)
    Future.delayed(const Duration(seconds: 10), () {
      if (mounted) _pollAlarms();
    });
    // 1분마다 반복
    _alarmPollTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) _pollAlarms();
    });
  }

  // ── 서버에서 알람 확인 ──
  Future<void> _pollAlarms() async {
    if (_isFakeCallShowing) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      if (token.isEmpty) return;

      final res = await http.post(
        Uri.parse('$_baseUrl/api/alarms/trigger'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        if (data['triggered'] != null && (data['triggered'] as int) > 0) {
          final results = data['results'] as List<dynamic>? ?? [];
          if (results.isNotEmpty) {
            final alarm = results[0] as Map<String, dynamic>;
            final channelName = alarm['channel_name'] as String? ?? '알람';
            final msgType     = alarm['msg_type']     as String? ?? 'youtube';
            final msgValue    = alarm['msg_value']    as String? ?? '';
            final alarmId     = (alarm['alarm_id']   as int?) ?? 0;
            final contentUrl  = alarm['content_url'] as String? ?? '';

            if (mounted) {
              // 앱이 포그라운드면 즉시 가상통화 화면 표시
              _showFakeCall(
                channelName: channelName,
                msgType: msgType,
                msgValue: msgValue,
                alarmId: alarmId,
                contentUrl: contentUrl,
              );
            } else {
              // 앱이 백그라운드면 알림 표시 (탭하면 앱 열림)
              await _showAlarmNotification(
                channelName: channelName,
                msgType: msgType,
                msgValue: msgValue,
                alarmId: alarmId,
                contentUrl: contentUrl,
              );
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[AlarmPoll] 오류: $e');
    }
  }

  // ── 가상통화 화면 표시 ──
  void _showFakeCall({
    required String channelName,
    required String msgType,
    required String msgValue,
    required int    alarmId,
    String contentUrl = '',
  }) {
    if (_isFakeCallShowing) return;
    setState(() => _isFakeCallShowing = true);

    // 진동 (알람 패턴)
    HapticFeedback.heavyImpact();

    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => FakeCallScreen(
          channelName: channelName,
          msgType:     msgType,
          msgValue:    msgValue,
          alarmId:     alarmId,
          contentUrl:  contentUrl,
        ),
        transitionDuration: const Duration(milliseconds: 300),
        transitionsBuilder: (_, anim, __, child) {
          return SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 1),
              end: Offset.zero,
            ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
            child: child,
          );
        },
        fullscreenDialog: true,
      ),
    ).then((_) {
      setState(() => _isFakeCallShowing = false);
    });
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
        case 'show_fake_call':
          _showFakeCall(
            channelName: data['channel_name'] as String? ?? '알람',
            msgType:     data['msg_type']     as String? ?? 'youtube',
            msgValue:    data['msg_value']    as String? ?? '',
            alarmId:     (data['alarm_id']   as int?) ?? 0,
            contentUrl:  data['content_url'] as String? ?? '',
          );
          break;
        case 'launch_youtube':
          final url = data['url'] as String? ?? '';
          if (url.isNotEmpty) {
            final uri = Uri.parse(url);
            await launchUrl(uri, mode: LaunchMode.externalApplication);
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
      if (Platform.isAndroid) {
        const intent = AndroidIntent(
          action: 'android.provider.MediaStore.action.AUDIO_CAPTURE',
        );
        await intent.launch();
        _sendToWeb('window._flutterFileCancelled', {
          'type': 'audio',
          'message': '녹음 앱이 실행됐습니다. 녹음 후 저장하고 아래 "파일 선택" 버튼으로 파일을 선택하세요.',
        });
      } else {
        final result = await FilePicker.platform.pickFiles(type: FileType.audio, withData: false, withReadStream: false);
        if (result != null && result.files.isNotEmpty) {
          final f = result.files.first;
          _sendToWeb('window._flutterFileCallback', {'type': 'audio', 'name': f.name, 'path': f.path ?? '', 'size': f.size, 'base64': ''});
        } else {
          _sendToWeb('window._flutterFileCancelled', {'type': 'audio'});
        }
      }
    } catch (e) {
      _sendToWeb('window._flutterFileError', {'type': 'audio', 'error': e.toString()});
    }
  }

  Future<void> _launchVideoRecorder() async {
    try {
      if (Platform.isAndroid) {
        const intent = AndroidIntent(action: 'android.media.action.VIDEO_CAPTURE');
        await intent.launch();
        _sendToWeb('window._flutterFileCancelled', {
          'type': 'video',
          'message': '카메라 앱이 실행됐습니다. 녹화 후 저장하고 아래 "파일 선택" 버튼으로 파일을 선택하세요.',
        });
      } else {
        final result = await FilePicker.platform.pickFiles(type: FileType.video, withData: false, withReadStream: false);
        if (result != null && result.files.isNotEmpty) {
          final f = result.files.first;
          _sendToWeb('window._flutterFileCallback', {'type': 'video', 'name': f.name, 'path': f.path ?? '', 'size': f.size, 'base64': ''});
        } else {
          _sendToWeb('window._flutterFileCancelled', {'type': 'video'});
        }
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
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
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
