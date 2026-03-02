// lib/main.dart  – WebView 래퍼 앱
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

// ── 서버 URL (배포 후 교체 가능) ──────────────────
const String _appUrl =
    'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai/app';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // 상태바 투명 처리
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const PushNotifyApp());
}

class PushNotifyApp extends StatelessWidget {
  const PushNotifyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PushNotify',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6C63FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF121212),
      ),
      home: const WebViewScreen(),
    );
  }
}

// ═══════════════════════════════════════════════
//  WebView 메인 화면
// ═══════════════════════════════════════════════
class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  bool  _loading = true;
  bool  _hasError = false;
  int   _loadingProgress = 0;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF121212))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            setState(() { _loading = true; _hasError = false; });
          },
          onProgress: (p) {
            setState(() => _loadingProgress = p);
          },
          onPageFinished: (_) {
            setState(() => _loading = false);
          },
          onWebResourceError: (err) {
            if (err.isForMainFrame == true) {
              setState(() { _hasError = true; _loading = false; });
            }
          },
          // ── 딥링크 가로채기: pushapp://join?token=XXX ──
          onNavigationRequest: (NavigationRequest request) {
            final uri = Uri.tryParse(request.url);
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

  // 딥링크 처리: pushapp://join?token=XXX → /app#join?token=XXX 로 이동
  void _handleDeepLink(Uri uri) {
    if (uri.host == 'join') {
      final token = uri.queryParameters['token'] ?? '';
      if (token.isNotEmpty) {
        // 웹앱 /join/:token 페이지로 이동 (웹에서 가입 처리)
        final joinUrl = _appUrl.replaceFirst('/app', '/join/$token');
        // 실제로는 앱 내부에서 채널 가입 다이얼로그 표시
        _showJoinDialog(token);
      }
    }
  }

  // 채널 가입 확인 다이얼로그
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
              child: Text(
                token,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Color(0xFFA5B4FC)),
              ),
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
              // 웹뷰를 join 페이지로 이동 → 웹앱 JS가 가입 처리
              _controller.loadRequest(
                Uri.parse('$_appUrl?join_token=$token'),
              );
            },
            child: const Text('참여하기', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  // 뒤로가기 처리 (WebView 내부 히스토리 우선)
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
              // ── WebView ──
              _hasError ? _buildErrorView() : WebViewWidget(controller: _controller),

              // ── 로딩 바 ──
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

              // ── 첫 로딩 스플래시 ──
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
                            strokeWidth: 3,
                            color: Color(0xFF6C63FF),
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
            const Text(
              '서버에 연결할 수 없습니다',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              '인터넷 연결을 확인하고 다시 시도해 주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[400], fontSize: 14, height: 1.5),
            ),
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
        const Text(
          'PushNotify',
          style: TextStyle(
            color: Colors.white,
            fontSize: 22,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}
