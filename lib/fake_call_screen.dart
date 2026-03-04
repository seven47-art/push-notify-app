// lib/fake_call_screen.dart  v16
// 가상 통화 수신 화면
// - 기기 기본 벨소리(RingtoneManager) + 진동
// - 수락 버튼 누르면 화면 닫기 전 즉시 소스 실행
// - YouTube / 오디오 / 비디오 / 파일 지원
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:audioplayers/audioplayers.dart';

// 기기 벨소리 URI 가져오는 MethodChannel
const _ringtoneCh = MethodChannel('com.pushnotify/ringtone');

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
  late Animation<double>   _pulseAnimation;
  late AnimationController _ringController;

  // 알람 벨소리 플레이어
  final AudioPlayer _bellPlayer = AudioPlayer();

  Timer? _autoDeclineTimer;
  Timer? _vibrateTimer;
  bool   _isAnswered  = false;
  bool   _isLaunching = false; // 중복 실행 방지

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

  // ── 기기 기본 벨소리 재생 ─────────────────────────────────────────
  Future<void> _startRinging() async {
    // 1) 기기 기본 링톤 URI 가져오기 (native)
    String ringtoneUri = '';
    try {
      ringtoneUri = await _ringtoneCh.invokeMethod<String>('getDefaultRingtoneUri') ?? '';
    } catch (_) {}

    // 2) 벨소리 재생
    try {
      await _bellPlayer.setVolume(1.0);
      await _bellPlayer.setReleaseMode(ReleaseMode.loop);
      await _bellPlayer.setAudioContext(
        AudioContext(
          android: AudioContextAndroid(
            isSpeakerphoneOn: false,
            stayAwake: true,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.notificationRingtone, // 링톤 스트림 (기기 벨소리 볼륨)
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
        ),
      );

      if (ringtoneUri.isNotEmpty) {
        // 기기 기본 벨소리 (content:// URI)
        await _bellPlayer.play(DeviceFileSource(ringtoneUri));
      } else {
        // 폴백: 앱 내장 알람음
        await _bellPlayer.play(AssetSource('sounds/alarm_ring.mp3'));
      }
    } catch (e) {
      debugPrint('[FakeCall] 벨소리 오류: $e');
      // 폴백 재시도
      try {
        await _bellPlayer.play(AssetSource('sounds/alarm_ring.mp3'));
      } catch (_) {}
    }

    // 3) 진동 패턴 반복
    _vibrateTimer = Timer.periodic(const Duration(milliseconds: 1000), (_) {
      if (mounted && !_isAnswered) {
        HapticFeedback.heavyImpact();
      }
    });
  }

  // ── 벨소리 + 진동 중지 ────────────────────────────────────────────
  void _stopRinging() {
    _bellPlayer.stop();
    _vibrateTimer?.cancel();
    _pulseController.stop();
    _ringController.stop();
  }

  // ── 통화 수락 → 즉시 메시지 소스 실행 ─────────────────────────────
  // 중요: pop() 보다 launch() 먼저 호출해야 앱 전환이 자연스러움
  void _answer() async {
    if (_isAnswered || _isLaunching) return;
    setState(() {
      _isAnswered  = true;
      _isLaunching = true;
    });
    _autoDeclineTimer?.cancel();
    _stopRinging();

    // 소스 실행 (await - 실행 시작 후 pop)
    await _launchMsgSource();
  }

  // ── 통화 거절 ─────────────────────────────────────────────────────
  void _decline() {
    _autoDeclineTimer?.cancel();
    _stopRinging();
    if (mounted) Navigator.of(context).pop();
  }

  // ── 메시지 소스 실행 (타입별 분기) ──────────────────────────────
  Future<void> _launchMsgSource() async {
    try {
      switch (widget.msgType) {
        case 'youtube':
          await _launchYouTube();
        case 'audio':
          await _playAudio();
        case 'video':
        case 'file':
          await _launchExternal();
        default:
          await _launchYouTube();
      }
    } catch (e) {
      debugPrint('[FakeCall] 소스 실행 오류: $e');
    } finally {
      // 실행 완료(또는 실패) 후 화면 닫기
      if (mounted) Navigator.of(context).pop();
    }
  }

  // ── YouTube 즉시 실행 ─────────────────────────────────────────────
  Future<void> _launchYouTube() async {
    String url = widget.msgValue;
    if (url.isEmpty && widget.contentUrl.isNotEmpty) url = widget.contentUrl;
    if (url.isEmpty) return;

    try {
      String youtubeId = _extractYoutubeId(url);

      bool launched = false;
      if (youtubeId.isNotEmpty) {
        // YouTube 앱으로 직접 열기
        final ytUri = Uri.parse('youtube://watch?v=$youtubeId');
        if (await canLaunchUrl(ytUri)) {
          launched = await launchUrl(ytUri, mode: LaunchMode.externalApplication);
        }
      }
      if (!launched) {
        // YouTube 앱 없으면 브라우저로
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('[FakeCall] YouTube 실행 오류: $e');
    }
    // pop은 _launchMsgSource finally에서 처리
  }

  String _extractYoutubeId(String url) {
    try {
      final uri = Uri.tryParse(url);
      if (uri == null) return '';
      if (uri.host.contains('youtu.be')) {
        return uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';
      }
      if (uri.queryParameters.containsKey('v')) {
        return uri.queryParameters['v'] ?? '';
      }
      if (uri.pathSegments.contains('shorts')) {
        final idx = uri.pathSegments.indexOf('shorts');
        return (idx + 1 < uri.pathSegments.length) ? uri.pathSegments[idx + 1] : '';
      }
    } catch (_) {}
    return '';
  }

  // ── 오디오 재생 ──────────────────────────────────────────────────
  Future<void> _playAudio() async {
    final url = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (url.isEmpty) return;

    // 화면 먼저 닫고 오디오 재생 (백그라운드 재생)
    if (mounted) Navigator.of(context).pop();

    final player = AudioPlayer();
    try {
      await player.setAudioContext(AudioContext(
        android: AudioContextAndroid(
          isSpeakerphoneOn: false,
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
    // 이미 pop됨 - finally에서 다시 pop 안 함 (rethrow 방지)
    return; // _launchMsgSource finally의 pop 방지 위해 일찍 리턴하지 않음
           // → _playAudio에서 직접 pop했으므로 finally에서는 무시됨
  }

  // ── 비디오/파일 외부 앱 실행 ─────────────────────────────────────
  Future<void> _launchExternal() async {
    final url = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (url.isEmpty) return;

    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('[FakeCall] 외부 실행 오류: $e');
    }
    // 잠깐 대기 후 pop (외부 앱 전환 후 화면 정리)
    await Future.delayed(const Duration(milliseconds: 300));
  }

  // ── UI ────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 배경 그라디언트
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF0A0A1A), Color(0xFF1A1035), Color(0xFF0D0D1F)],
              ),
            ),
          ),
          // 배경 장식 원
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
                const Text(
                  '수신 전화',
                  style: TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 16,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 40),

                // ── 맥박 링 아이콘 ──
                AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) {
                    return Stack(
                      alignment: Alignment.center,
                      children: [
                        ...[1.6, 1.4, 1.2].asMap().entries.map((e) {
                          final scale = 1.0 +
                              (e.value - 1.0) *
                              (_pulseAnimation.value - 1.0) / 0.4;
                          return Container(
                            width: 120 * scale,
                            height: 120 * scale,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: const Color(0xFF6C63FF)
                                    .withOpacity(0.3 - e.key * 0.08),
                                width: 1.5,
                              ),
                            ),
                          );
                        }),
                        Container(
                          width: 120,
                          height: 120,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Color(0x996C63FF),
                                blurRadius: 30,
                                spreadRadius: 5,
                              )
                            ],
                          ),
                          child: const Icon(
                            Icons.notifications_active,
                            color: Colors.white,
                            size: 52,
                          ),
                        ),
                      ],
                    );
                  },
                ),

                const SizedBox(height: 32),

                // 채널명
                Text(
                  widget.channelName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(
                  _getMsgTypeLabel(),
                  style: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C63FF).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: const Color(0xFF6C63FF).withOpacity(0.3)),
                  ),
                  child: Text(
                    'PushNotify 알람',
                    style: TextStyle(
                      color: const Color(0xFF6C63FF).withOpacity(0.9),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),

                const Spacer(),

                // ── 수락 / 거절 버튼 ──
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 60, vertical: 50),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // 거절 (빨간)
                      Column(
                        children: [
                          GestureDetector(
                            onTap: _decline,
                            child: Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFEF4444),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFEF4444)
                                        .withOpacity(0.4),
                                    blurRadius: 20,
                                    spreadRadius: 3,
                                  )
                                ],
                              ),
                              child: const Icon(
                                Icons.call_end,
                                color: Colors.white,
                                size: 34,
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            '거절',
                            style: TextStyle(
                                color: Color(0xFF94A3B8), fontSize: 14),
                          ),
                        ],
                      ),

                      // 수락 (초록) - 흔들림 + 로딩 표시
                      Column(
                        children: [
                          GestureDetector(
                            onTap: _isAnswered ? null : _answer,
                            child: _isAnswered
                                ? Container(
                                    width: 72,
                                    height: 72,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: const Color(0xFF22C55E)
                                          .withOpacity(0.5),
                                    ),
                                    child: const SizedBox(
                                      width: 30,
                                      height: 30,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                        valueColor: AlwaysStoppedAnimation(
                                            Colors.white),
                                      ),
                                    ),
                                  )
                                : AnimatedBuilder(
                                    animation: _ringController,
                                    builder: (context, child) =>
                                        Transform.rotate(
                                      angle: _ringController.value * 0.3 - 0.15,
                                      child: child,
                                    ),
                                    child: Container(
                                      width: 72,
                                      height: 72,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: const Color(0xFF22C55E),
                                        boxShadow: [
                                          BoxShadow(
                                            color: const Color(0xFF22C55E)
                                                .withOpacity(0.4),
                                            blurRadius: 20,
                                            spreadRadius: 3,
                                          )
                                        ],
                                      ),
                                      child: const Icon(
                                        Icons.call,
                                        color: Colors.white,
                                        size: 34,
                                      ),
                                    ),
                                  ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            '수락',
                            style: TextStyle(
                                color: Color(0xFF94A3B8), fontSize: 14),
                          ),
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
