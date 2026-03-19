// lib/main.dart  – Phase 7: WebView 완전 제거
// 알람 처리: Kotlin (AlarmPollingService + RinGoFCMService)
// Flutter: FCM 초기화, 로컬 알림, 라우팅, 세션 검사
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:video_compress/video_compress.dart';
import 'config.dart';
import 'screens/auth_screen.dart';
import 'screens/permission_screen.dart';
import 'screens/terms_screen.dart';
import 'screens/main_screen.dart';

// ── 서버 URL (config.dart) ────────────────────────
const String _baseUrl = kBaseUrl;

// ── 전역 알림 플러그인 ────────────────────────────
final FlutterLocalNotificationsPlugin _notificationsPlugin =
    FlutterLocalNotificationsPlugin();

// ── 앱 전역 네비게이터 키 ──────────────────────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// ─────────────────────────────────────────────────
// FCM 백그라운드 핸들러 (앱 종료 시)
// 실제 처리는 Kotlin RinGoFCMService가 담당
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

  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );

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
      debugPrint('[Notification] tapped: ${res.payload}');
    },
  );

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
  }
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
      home: const _StartGate(),
      routes: {
        '/auth':        (_) => const AuthScreen(),
        '/permissions': (_) => const PermissionScreen(),
        '/terms':       (_) => const TermsScreen(),
        '/main':        (_) => const MainScreen(),
      },
    );
  }
}

// ═══════════════════════════════════════════════
//  시작 게이트 – UI 없이 즉시 라우팅
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
    // 세션 유효성 서버 검사
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
      // 네트워크 오류 시 오프라인 허용
    }
    final permDone = prefs.getBool('permissions_setup_done') ?? false;
    if (!mounted) return;
    if (!permDone) {
      Navigator.of(context).pushReplacementNamed('/permissions');
      return;
    }
    final termsAccepted = prefs.getBool('termsAccepted') ?? false;
    if (!mounted) return;
    if (!termsAccepted) {
      Navigator.of(context).pushReplacementNamed('/terms');
      return;
    }
    // FCM 초기화 + Pending 알람 예약 (MainScreen 로드 후 비동기)
    _initFCMAndPendingAlarms();
    Navigator.of(context).pushReplacementNamed('/main');
  }

  // ── FCM 초기화 + 토큰 등록 + pending 알람 예약 ────────────
  Future<void> _initFCMAndPendingAlarms() async {
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final fcmToken = await messaging.getToken();
      if (fcmToken != null) {
        debugPrint('[FCM] 토큰: $fcmToken');
        await _registerFcmToken(fcmToken);
      }

      messaging.onTokenRefresh.listen((newToken) {
        debugPrint('[FCM] 토큰 갱신: $newToken');
        _registerFcmToken(newToken);
      });

      // 포그라운드 메시지: force_logout 처리
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('[FCM] 포그라운드 메시지: ${message.data}');
        final action = message.data['action'] ?? '';
        if (action == 'force_logout') {
          _handleForceLogout(message.data['reason'] ?? 'deleted');
        }
      });

      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('[FCM] 알림 탭으로 앱 재개: ${message.data}');
      });

      // AlarmData MethodChannel (Kotlin → Flutter)
      const alarmDataCh = MethodChannel('com.pushnotify/alarm_data');
      alarmDataCh.setMethodCallHandler((call) async {
        debugPrint('[AlarmData] 수신: ${call.method}');
      });

      // Pending 알람 예약
      await _schedulePendingAlarms();

      // DeepLink 채널
      _initDeepLink();
    } catch (e) {
      debugPrint('[FCM] 초기화 실패: $e');
    }
  }

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
        await prefs.setString('fcm_token', fcmToken);
        debugPrint('[FCM] 토큰 등록 성공');
      }
    } catch (e) {
      debugPrint('[FCM] 토큰 등록 오류: $e');
    }
  }

  Future<void> _schedulePendingAlarms() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final sessionToken = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      if (sessionToken.isEmpty || userId.isEmpty) return;

      final res = await http.get(
        Uri.parse('$_baseUrl/api/alarms/pending?user_id=$userId'),
        headers: {'Authorization': 'Bearer $sessionToken'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode != 200) return;

      final body = jsonDecode(res.body);
      final alarms = body['data'] as List<dynamic>?;
      if (alarms == null || alarms.isEmpty) return;

      const platform = MethodChannel('com.pushnotify.push_notify_app/alarm');
      int scheduled = 0;
      for (final alarm in alarms) {
        final scheduledAt = alarm['scheduled_at'] as String?;
        if (scheduledAt == null) continue;
        final scheduledMs =
            DateTime.tryParse(scheduledAt)?.toUtc().millisecondsSinceEpoch;
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
      debugPrint('[PendingAlarm] $scheduled개 AlarmManager 예약 완료');
    } catch (e) {
      debugPrint('[PendingAlarm] 오류: $e');
    }
  }

  void _initDeepLink() {
    const deepLinkCh = MethodChannel('com.pushnotify.push_notify_app/deeplink');
    deepLinkCh.setMethodCallHandler((call) async {
      if (call.method == 'onDeepLink') {
        final token = call.arguments as String?;
        if (token != null && token.isNotEmpty) {
          debugPrint('[DeepLink] onDeepLink: $token');
          await Future.delayed(const Duration(milliseconds: 800));
          if (mounted) _showChannelJoinFlow(token);
        }
      }
    });

    Future.delayed(const Duration(milliseconds: 1000), () async {
      try {
        final token = await deepLinkCh.invokeMethod<String?>('getInitialToken');
        if (token != null && token.isNotEmpty) {
          if (mounted) _showChannelJoinFlow(token);
        }
      } catch (_) {}
    });
  }

  // ── force_logout 처리 ─────────────────────────────────
  Future<void> _handleForceLogout(String reason) async {
    final ctx = navigatorKey.currentContext;
    if (ctx == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('session_token');
    await prefs.remove('user_id');
    await prefs.remove('email');
    await prefs.remove('user_email');
    await prefs.remove('display_name');

    final isDeleted = reason == 'deleted';
    await showDialog(
      context: ctx,
      barrierDismissible: false,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          Icon(
            isDeleted ? Icons.person_remove : Icons.block,
            color: isDeleted
                ? const Color(0xFFF59E0B)
                : const Color(0xFFEF4444),
            size: 22,
          ),
          const SizedBox(width: 8),
          Text(
            isDeleted ? '계정 삭제됨' : '계정 사용 불가',
            style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold),
          ),
        ]),
        content: Text(
          isDeleted
              ? '관리자에 의해 계정이 삭제되었습니다.\n다시 가입하실 수 있습니다.'
              : '이 계정은 사용할 수 없습니다.\n다른 계정을 선택해주세요.',
          style: const TextStyle(
              color: Color(0xFF94A3B8), fontSize: 14, height: 1.6),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('확인',
                style: TextStyle(
                    color: Color(0xFF6366F1),
                    fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    navigatorKey.currentState
        ?.pushNamedAndRemoveUntil('/auth', (route) => false);
  }

  // ── 채널 가입 딥링크 flow ───────────────────────────────
  Future<void> _showChannelJoinFlow(String token) async {
    final ctx = navigatorKey.currentContext ?? context;
    // 로딩 다이얼로그
    showDialog(
      context: ctx,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF6C63FF)),
        ),
      ),
    );

    Map<String, dynamic>? channelData;
    try {
      final res = await http
          .get(Uri.parse('$_baseUrl/api/invites/verify/$token'))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && body['valid'] == true) {
          channelData = body['data'] as Map<String, dynamic>?;
        }
      }
    } catch (_) {}

    if (mounted) Navigator.of(ctx).pop();
    if (!mounted) return;

    final channelId = channelData?['channel_id'];
    final channelName =
        channelData?['channel_name'] as String? ?? '채널 초대';

    if (channelId != null) {
      // Navigate to channel detail in the main screen
      navigatorKey.currentState?.pushNamedAndRemoveUntil(
        '/main',
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) =>
      const ColoredBox(color: Color(0xFF000000));
}

// ═══════════════════════════════════════════════════
// 파일 업로드 유틸리티 (send_screen 등에서 사용)
// Kotlin → FlutterBridge 브릿지가 없어진 대신
// Flutter 화면에서 직접 호출 가능하도록 top-level 함수로 노출
// ═══════════════════════════════════════════════════

/// Cloudflare Worker에 파일 업로드 → Firebase Storage URL 반환
Future<String> uploadFileToWorker(
    String localPath, String fileName, String contentType) async {
  final prefs = await SharedPreferences.getInstance();
  final sessionToken = prefs.getString('session_token') ?? '';

  final uri = Uri.parse('$_baseUrl/api/uploads/alarm-file');
  final request = http.MultipartRequest('POST', uri);
  request.fields['session_token'] = sessionToken;
  request.files.add(await http.MultipartFile.fromPath(
    'file', localPath,
    filename: fileName,
    contentType: MediaType.parse(contentType),
  ));

  final streamed =
      await request.send().timeout(const Duration(minutes: 3));
  final body = await streamed.stream.bytesToString();

  if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
    try {
      final errJson = jsonDecode(body) as Map<String, dynamic>;
      throw Exception(
          '업로드 실패 (${streamed.statusCode}): ${errJson['error'] ?? body}');
    } catch (parseErr) {
      if (parseErr is Exception &&
          parseErr.toString().startsWith('Exception: 업로드 실패')) {
        rethrow;
      }
      throw Exception('업로드 실패 (${streamed.statusCode}): $body');
    }
  }

  final json = jsonDecode(body) as Map<String, dynamic>;
  if (json['success'] == true && json['url'] != null) {
    return json['url'] as String;
  }
  throw Exception('업로드 실패: ${json['error'] ?? body}');
}

/// 비디오 480p 압축 (실패 시 원본 반환)
Future<String> compressVideoFile(String sourcePath) async {
  try {
    final MediaInfo? info = await VideoCompress.compressVideo(
      sourcePath,
      quality: VideoQuality.MediumQuality,
      deleteOrigin: false,
      includeAudio: true,
      frameRate: 30,
    );
    if (info != null && info.path != null) return info.path!;
  } catch (e) {
    debugPrint('[VideoCompress] 압축 실패, 원본 사용: $e');
  }
  return sourcePath;
}

/// ImagePicker로 채널 이미지 선택 → base64 반환
Future<String?> pickChannelImageBase64({String source = 'gallery'}) async {
  try {
    final picker = ImagePicker();
    final XFile? image = await picker.pickImage(
      source: source == 'camera'
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 300,
      maxHeight: 300,
      imageQuality: 70,
    );
    if (image == null) return null;
    final bytes = await image.readAsBytes();
    return 'data:image/jpeg;base64,${base64Encode(bytes)}';
  } catch (_) {
    return null;
  }
}

/// FilePicker로 오디오 파일 선택 → Worker 업로드 → URL 반환
Future<String?> pickAndUploadAudioFile() async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      withData: false,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return null;
    final f = result.files.first;
    if (f.path == null) return null;

    final ext = f.name.split('.').last.toLowerCase();
    const allowed = ['mp3', 'm4a', 'wav'];
    if (!allowed.contains(ext)) return null;

    final fileSize = await File(f.path!).length();
    if (fileSize > 10 * 1024 * 1024) return null;

    final mime = ext == 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    final fileName =
        '${DateTime.now().millisecondsSinceEpoch}_${f.name}';
    return await uploadFileToWorker(f.path!, fileName, mime);
  } catch (_) {
    return null;
  }
}

/// FilePicker로 비디오 파일 선택 → 압축 → Worker 업로드 → URL 반환
Future<String?> pickAndUploadVideoFile() async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      withData: false,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return null;
    final f = result.files.first;
    if (f.path == null) return null;

    final ext = f.name.split('.').last.toLowerCase();
    const allowed = ['mp4', 'mov'];
    if (!allowed.contains(ext)) return null;

    final fileSize = await File(f.path!).length();
    if (fileSize > 50 * 1024 * 1024) return null;

    final compressed = await compressVideoFile(f.path!);
    final mime = ext == 'mov' ? 'video/quicktime' : 'video/mp4';
    final fileName =
        '${DateTime.now().millisecondsSinceEpoch}_${f.name}';
    return await uploadFileToWorker(compressed, fileName, mime);
  } catch (_) {
    return null;
  }
}

/// ImagePicker로 비디오 녹화 → 압축 → Worker 업로드 → URL 반환
Future<String?> recordAndUploadVideo() async {
  try {
    final picker = ImagePicker();
    final XFile? video = await picker.pickVideo(
      source: ImageSource.camera,
      maxDuration: const Duration(minutes: 10),
    );
    if (video == null) return null;
    final compressed = await compressVideoFile(video.path);
    final fileSize = await File(compressed).length();
    if (fileSize > 10 * 1024 * 1024) return null;
    final fileName =
        '${DateTime.now().millisecondsSinceEpoch}_${compressed.split('/').last}';
    return await uploadFileToWorker(compressed, fileName, 'video/mp4');
  } catch (_) {
    return null;
  }
}

/// 임시 디렉토리에서 오디오 녹음 파일 경로 생성
Future<String> getTempAudioPath() async {
  final dir = await getTemporaryDirectory();
  final ts = DateTime.now().millisecondsSinceEpoch;
  return '${dir.path}/recording_$ts.m4a';
}
