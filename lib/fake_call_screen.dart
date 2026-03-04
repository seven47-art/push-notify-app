// lib/fake_call_screen.dart  v16
// 가상 통화 수신 화면 - SAYTODO 스타일
// - 벨소리 + 진동 (기기 벨소리 레벨)
// - 수락 즉시 메시지 소스 실행
// - YouTube: 유튜브 앱 직접 실행
// - 오디오: audioplayers로 재생
// - 비디오/파일: 앱 내 WebView로 열기 (외부 브라우저 X)
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:webview_flutter/webview_flutter.dart';

class FakeCallScreen extends StatefulWidget {
  final String channelName;
  final String msgType;       // youtube | audio | video | file
  final String msgValue;      // URL 또는 파일명
  final int    alarmId;
  final String contentUrl;    // 서버 콘텐츠 직접 URL

  const FakeCallScreen({
    super.key,
    required this.channelName,
    required this.msgType,
    required this.msgValue,
    required this.alarmId,
    this.contentUrl = '',
  });

  @override
  State<FakeCallScreen> createState() => _FakeCallScreenState();
}

class _FakeCallScreenState extends State<FakeCallScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late AnimationController _ringController;

  // 알람 벨소리 플레이어
  final AudioPlayer _bellPlayer = AudioPlayer();

  Timer? _autoDeclineTimer;
  Timer? _vibrateTimer;
  bool _isAnswered = false;

  @override
  void initState() {
    super.initState();

    // 잠금화면 위 표시
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    // 맥박 링 애니메이션
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.4).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeOut),
    );

    // 전화벨 흔들림 애니메이션
    _ringController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    )..repeat(reverse: true);

    // 벨소리 + 진동 시작
    _startRinging();

    // 30초 후 자동 거절
    _autoDeclineTimer = Timer(const Duration(seconds: 30), () {
      if (mounted && !_isAnswered) _decline();
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _ringController.dispose();
    _autoDeclineTimer?.cancel();
    _vibrateTimer?.cancel();
    _bellPlayer.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  // 벨소리 + 진동 시작 (기기 링 볼륨 스트림 사용)
  void _startRinging() async {
    try {
      // RING 스트림 = 기기 볼륨 설정을 그대로 따름
      await _bellPlayer.setVolume(1.0);
      await _bellPlayer.setReleaseMode(ReleaseMode.loop);
      await _bellPlayer.setAudioContext(
        AudioContext(
          android: AudioContextAndroid(
            isSpeakerphoneOn: true,
            stayAwake: true,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.notificationRingtone, // 🔔 링톤 스트림
            audioFocus: AndroidAudioFocus.gain,
          ),
        ),
      );
      await _bellPlayer.play(AssetSource('sounds/alarm_ring.mp3'));
    } catch (e) {
      debugPrint('[FakeCall] 벨소리 오류: $e');
    }

    // 진동 패턴 반복
    _vibrateTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      if (mounted && !_isAnswered) HapticFeedback.heavyImpact();
    });
  }

  // 벨소리 + 진동 중지
  void _stopRinging() {
    _bellPlayer.stop();
    _vibrateTimer?.cancel();
    _pulseController.stop();
    _ringController.stop();
  }

  // 통화 수락 → 즉시 메시지 소스 실행
  void _answer() async {
    if (_isAnswered) return;
    setState(() => _isAnswered = true);
    _autoDeclineTimer?.cancel();
    _stopRinging();
    await _launchMsgSource();
  }

  // 통화 거절
  void _decline() {
    _autoDeclineTimer?.cancel();
    _stopRinging();
    if (mounted) Navigator.of(context).pop();
  }

  // 메시지 소스 실행
  Future<void> _launchMsgSource() async {
    try {
      switch (widget.msgType) {
        case 'youtube':
          await _launchYouTube();
          break;
        case 'audio':
          await _playAudio();
          break;
        case 'video':
        case 'file':
          await _launchExternal();
          break;
        default:
          await _launchYouTube();
      }
    } catch (e) {
      debugPrint('[FakeCall] 소스 실행 오류: $e');
      if (mounted) Navigator.of(context).pop();
    }
  }

  // YouTube 즉시 실행
  Future<void> _launchYouTube() async {
    String url = widget.msgValue;
    if (url.isEmpty && widget.contentUrl.isNotEmpty) url = widget.contentUrl;
    if (url.isEmpty) { if (mounted) Navigator.of(context).pop(); return; }

    try {
      // YouTube 앱 스킴 시도
      String youtubeId = '';
      final uri = Uri.tryParse(url);
      if (uri != null) {
        if (uri.host.contains('youtu.be')) {
          youtubeId = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';
        } else if (uri.queryParameters.containsKey('v')) {
          youtubeId = uri.queryParameters['v'] ?? '';
        } else if (uri.pathSegments.contains('shorts')) {
          final idx = uri.pathSegments.indexOf('shorts');
          youtubeId = (idx + 1 < uri.pathSegments.length) ? uri.pathSegments[idx + 1] : '';
        }
      }

      bool launched = false;
      if (youtubeId.isNotEmpty) {
        final ytUri = Uri.parse('youtube://watch?v=$youtubeId');
        if (await canLaunchUrl(ytUri)) {
          launched = await launchUrl(ytUri, mode: LaunchMode.externalApplication);
        }
      }
      if (!launched) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('[FakeCall] YouTube 실행 오류: $e');
    }

    await Future.delayed(const Duration(milliseconds: 500));
    if (mounted) Navigator.of(context).pop();
  }

  // 오디오 재생
  Future<void> _playAudio() async {
    final url = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (url.isEmpty) { if (mounted) Navigator.of(context).pop(); return; }

    final player = AudioPlayer();
    try {
      await player.setAudioContext(AudioContext(
        android: AudioContextAndroid(
          isSpeakerphoneOn: true,
          stayAwake: true,
          contentType: AndroidContentType.music,
          usageType: AndroidUsageType.media,
          audioFocus: AndroidAudioFocus.gain,
        ),
      ));
      await player.setVolume(1.0);
      if (url.startsWith('http')) {
        await player.play(UrlSource(url));
      } else {
        await player.play(DeviceFileSource(url));
      }
      await player.onPlayerComplete.first.timeout(
        const Duration(minutes: 10),
        onTimeout: () {},
      );
    } catch (e) {
      debugPrint('[FakeCall] 오디오 재생 오류: $e');
    } finally {
      await player.dispose();
    }
    if (mounted) Navigator.of(context).pop();
  }

  // 비디오/파일 – 앱 내 WebView로 열기 (외부 브라우저 금지)
  Future<void> _launchExternal() async {
    final rawUrl = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (rawUrl.isEmpty) { if (mounted) Navigator.of(context).pop(); return; }

    // 유효한 HTTP URL인지 확인
    final uri = Uri.tryParse(rawUrl);
    if (uri == null || !uri.hasScheme) {
      debugPrint('[FakeCall] 유효하지 않은 URL: $rawUrl');
      if (mounted) Navigator.of(context).pop();
      return;
    }

    // 앱 내 WebView로 열기
    if (mounted) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _ContentViewerScreen(
            url: rawUrl,
            title: widget.channelName,
          ),
        ),
      );
      if (mounted) Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF0A0A1A), Color(0xFF1A1035), Color(0xFF0D0D1F)],
              ),
            ),
          ),
          Positioned(
            top: -80, right: -80,
            child: Container(
              width: 300, height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF6C63FF).withOpacity(0.05),
              ),
            ),
          ),
          Positioned(
            bottom: 100, left: -60,
            child: Container(
              width: 200, height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF4F46E5).withOpacity(0.05),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 60),
                const Text('수신 전화',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 16, letterSpacing: 2)),
                const SizedBox(height: 40),

                // 맥박 링 아이콘
                AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) {
                    return Stack(
                      alignment: Alignment.center,
                      children: [
                        ...[1.6, 1.4, 1.2].asMap().entries.map((e) {
                          final scale = 1.0 + (e.value - 1.0) * (_pulseAnimation.value - 1.0) / 0.4;
                          return Container(
                            width: 120 * scale, height: 120 * scale,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: const Color(0xFF6C63FF).withOpacity(0.3 - e.key * 0.08),
                                width: 1.5,
                              ),
                            ),
                          );
                        }),
                        Container(
                          width: 120, height: 120,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                            ),
                            boxShadow: [BoxShadow(color: Color(0x996C63FF), blurRadius: 30, spreadRadius: 5)],
                          ),
                          child: const Icon(Icons.notifications_active, color: Colors.white, size: 52),
                        ),
                      ],
                    );
                  },
                ),

                const SizedBox(height: 32),
                Text(
                  widget.channelName,
                  style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(_getMsgTypeLabel(),
                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 16)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C63FF).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.3)),
                  ),
                  child: Text('PushNotify 알람',
                    style: TextStyle(color: const Color(0xFF6C63FF).withOpacity(0.9),
                      fontSize: 13, fontWeight: FontWeight.w500)),
                ),

                const Spacer(),

                // 수락/거절 버튼
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 60, vertical: 50),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // 거절 (빨간)
                      Column(
                        children: [
                          GestureDetector(
                            onTap: _decline,
                            child: Container(
                              width: 72, height: 72,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFEF4444),
                                boxShadow: [BoxShadow(
                                  color: const Color(0xFFEF4444).withOpacity(0.4),
                                  blurRadius: 20, spreadRadius: 3)],
                              ),
                              child: const Icon(Icons.call_end, color: Colors.white, size: 34),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text('거절', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
                        ],
                      ),
                      // 수락 (초록) - 흔들림
                      Column(
                        children: [
                          GestureDetector(
                            onTap: _answer,
                            child: AnimatedBuilder(
                              animation: _ringController,
                              builder: (context, child) => Transform.rotate(
                                angle: _ringController.value * 0.3 - 0.15,
                                child: child,
                              ),
                              child: Container(
                                width: 72, height: 72,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFF22C55E),
                                  boxShadow: [BoxShadow(
                                    color: const Color(0xFF22C55E).withOpacity(0.4),
                                    blurRadius: 20, spreadRadius: 3)],
                                ),
                                child: const Icon(Icons.call, color: Colors.white, size: 34),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text('수락', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _getMsgTypeLabel() {
    switch (widget.msgType) {
      case 'youtube': return '📺 YouTube 알람';
      case 'audio':   return '🎵 오디오 알람';
      case 'video':   return '🎬 비디오 알람';
      default:        return '📎 파일 알람';
    }
  }
}

// ══════════════════════════════════════════════════
// 앱 내 콘텐츠 뷰어 (비디오/파일/오디오 URL 재생)
// 외부 브라우저 대신 앱 내 WebView로 표시
// ══════════════════════════════════════════════════
class _ContentViewerScreen extends StatefulWidget {
  final String url;
  final String title;
  const _ContentViewerScreen({required this.url, required this.title});
  @override
  State<_ContentViewerScreen> createState() => _ContentViewerScreenState();
}

class _ContentViewerScreenState extends State<_ContentViewerScreen> {
  late final WebViewController _wvc;
  bool _loading = true;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _wvc = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() { _loading = true; _hasError = false; }),
        onPageFinished: (_) => setState(() => _loading = false),
        onWebResourceError: (e) {
          if (e.isForMainFrame == true) {
            setState(() { _hasError = true; _loading = false; });
          }
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1035),
        foregroundColor: Colors.white,
        title: Text(widget.title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_browser_rounded),
            tooltip: '브라우저에서 열기',
            onPressed: () async {
              final uri = Uri.tryParse(widget.url);
              if (uri != null) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_hasError)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 48),
                  const SizedBox(height: 12),
                  const Text('콘텐츠를 불러올 수 없습니다.',
                      style: TextStyle(color: Colors.white70, fontSize: 15)),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: () async {
                      final uri = Uri.tryParse(widget.url);
                      if (uri != null) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      }
                    },
                    icon: const Icon(Icons.open_in_browser_rounded),
                    label: const Text('브라우저로 열기'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF6C63FF),
                    ),
                  ),
                ],
              ),
            )
          else
            WebViewWidget(controller: _wvc),

          if (_loading)
            const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation(Color(0xFF6C63FF)),
              ),
            ),
        ],
      ),
    );
  }
}
