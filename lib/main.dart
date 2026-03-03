// lib/main.dart  – WebView 래퍼 앱 + FlutterBridge + 가상통화 알람 v15
// 앱 꺼져도 알람 동작: flutter_local_notifications 백그라운드 서비스
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
// wakelock_plus 제거
import 'config.dart';
import 'fake_call_screen.dart';
import 'screens/auth_screen.dart';

// ── 서버 URL (config.dart에서 관리) ──────────────
const String _appUrl  = kAppUrl;
const String _baseUrl = kBaseUrl;

// ── 전역 알림 플러그인 ────────────────────────────
final FlutterLocalNotificationsPlugin _notificationsPlugin =
    FlutterLocalNotificationsPlugin();

// ── 전역 오디오 플레이어 (알람 벨소리) ────────────
final AudioPlayer _alarmAudioPlayer = AudioPlayer();

// ── 앱 전역 네비게이터 키 ──────────────────────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// ── 백그라운드 알람 데이터 임시 저장 ──────────────
Map<String, dynamic>? _pendingAlarmData;

// ─────────────────────────────────────────────────
// 앱 시작점
// ─────────────────────────────────────────────────
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 상태바 투명
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  // 로컬 알림 초기화
  await _initLocalNotifications();

  runApp(const PushNotifyApp());
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
  if (Platform.isAndroid) {
    const channel = AndroidNotificationChannel(
      'alarm_channel',
      'PushNotify 알람',
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

    // 알림 권한 요청
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();

    // 정확한 알람 권한 요청
    await _notificationsPlugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestExactAlarmsPermission();
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
    'PushNotify 알람',
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
      summaryText: 'PushNotify 알람',
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
// PushNotify 앱
// ─────────────────────────────────────────────────
class PushNotifyApp extends StatelessWidget {
  const PushNotifyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PushNotify',
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
        '/auth': (_) => const AuthScreen(),
        '/main': (_) => const WebViewScreen(),
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
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      if (token.isEmpty) { _goAuth(); return; }
      final res = await http.get(
        Uri.parse('$_baseUrl/api/auth/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) { _goMain(); return; }
      }
      await prefs.remove('session_token');
      _goAuth();
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      if (token.isNotEmpty) _goMain(); else _goAuth();
    }
  }

  void _goAuth() { if (mounted) Navigator.of(context).pushReplacementNamed('/auth'); }
  void _goMain() { if (mounted) Navigator.of(context).pushReplacementNamed('/main'); }

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
            const Text('PushNotify',
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
    _startAlarmPolling();

    // 앱 시작 시 대기 중인 알람 데이터 확인
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
          onPageFinished: (_) => setState(() => _loading = false),
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

  // ── 알람 폴링 시작 ──
  void _startAlarmPolling() {
    // 15초 후 첫 체크
    Future.delayed(const Duration(seconds: 15), () {
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
        const Text('PushNotify',
          style: TextStyle(
            color: Colors.white, fontSize: 22,
            fontWeight: FontWeight.bold, letterSpacing: 0.5,
          )),
      ],
    );
  }
}
