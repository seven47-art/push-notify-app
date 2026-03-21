// lib/fake_call_screen.dart  v19
// 카카오톡 전화 수신 화면 1:1 복제
// - 배경: 상단 카드(#222222) / 하단 순수블랙(#000000)
// - 프로필: 130dp 원형, 얇은 회색 테두리만 (glow 없음)
// - 하단: 거절(64dp) / 수락(64dp) Material Icons + 라벨 없음
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

  late AnimationController _dotController;

  // 알람 벨소리 플레이어
  final AudioPlayer _bellPlayer = AudioPlayer();

  Timer? _autoDeclineTimer;
  Timer? _vibrateTimer;
  bool   _isAnswered  = false;
  bool   _isLaunching = false;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    // 점 애니메이션용
    _dotController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();

    _startRinging();

    // 30초 후 자동 거절
    _autoDeclineTimer = Timer(const Duration(seconds: 30), () {
      if (mounted && !_isAnswered) _decline();
    });
  }

  @override
  void dispose() {
    _dotController.dispose();
    _autoDeclineTimer?.cancel();
    _vibrateTimer?.cancel();
    _bellPlayer.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  // ── 기기 기본 벨소리 재생 ─────────────────────────────────────────
  Future<void> _startRinging() async {
    String ringtoneUri = '';
    try {
      ringtoneUri = await _ringtoneCh.invokeMethod<String>('getDefaultRingtoneUri') ?? '';
    } catch (_) {}

    try {
      await _bellPlayer.setVolume(1.0);
      await _bellPlayer.setReleaseMode(ReleaseMode.loop);
      await _bellPlayer.setAudioContext(
        AudioContext(
          android: AudioContextAndroid(
            isSpeakerphoneOn: false,
            stayAwake: true,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.notificationRingtone,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
        ),
      );

      if (ringtoneUri.isNotEmpty) {
        await _bellPlayer.play(DeviceFileSource(ringtoneUri));
      } else {
        await _bellPlayer.play(AssetSource('sounds/alarm_ring.mp3'));
      }
    } catch (e) {
      debugPrint('[FakeCall] 벨소리 오류: $e');
      try {
        await _bellPlayer.play(AssetSource('sounds/alarm_ring.mp3'));
      } catch (_) {}
    }

    _vibrateTimer = Timer.periodic(const Duration(milliseconds: 1000), (_) {
      if (mounted && !_isAnswered) {
        HapticFeedback.heavyImpact();
      }
    });
  }

  void _stopRinging() {
    _bellPlayer.stop();
    _vibrateTimer?.cancel();
  }

  // ── 통화 수락 ─────────────────────────────────────────────────────
  void _answer() async {
    if (_isAnswered || _isLaunching) return;
    setState(() {
      _isAnswered  = true;
      _isLaunching = true;
    });
    _autoDeclineTimer?.cancel();
    _stopRinging();
    await _launchMsgSource();
  }

  // ── 통화 거절 ─────────────────────────────────────────────────────
  void _decline() {
    _autoDeclineTimer?.cancel();
    _stopRinging();
    if (mounted) Navigator.of(context).pop();
  }

  // ── 메시지 소스 실행 ──────────────────────────────────────────────
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
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _launchYouTube() async {
    String url = widget.msgValue;
    if (url.isEmpty && widget.contentUrl.isNotEmpty) url = widget.contentUrl;
    if (url.isEmpty) return;
    try {
      String youtubeId = _extractYoutubeId(url);
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
      if (uri.pathSegments.contains('live')) {
        final idx = uri.pathSegments.indexOf('live');
        return (idx + 1 < uri.pathSegments.length) ? uri.pathSegments[idx + 1] : '';
      }
    } catch (_) {}
    return '';
  }

  Future<void> _playAudio() async {
    final url = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (url.isEmpty) return;
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
    return;
  }

  Future<void> _launchExternal() async {
    final url = widget.contentUrl.isNotEmpty ? widget.contentUrl : widget.msgValue;
    if (url.isEmpty) return;
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('[FakeCall] 외부 실행 오류: $e');
    }
    await Future.delayed(const Duration(milliseconds: 300));
  }

  String _getMsgTypeLabel() {
    switch (widget.msgType) {
      case 'youtube': return '📺 YouTube 알람';
      case 'audio':   return '🎵 오디오 알람';
      case 'video':   return '🎬 비디오 알람';
      default:        return '📎 파일 알람';
    }
  }

  // ── UI (카카오톡 전화 수신 화면 1:1 복제) ─────────────────────────
  @override
  Widget build(BuildContext context) {
    const bgDark    = Colors.black;
    const bgCard    = Color(0xFF222222);
    const textWhite = Colors.white;
    const textGray  = Color(0xFFAAAAAA);
    const accentRed   = Color(0xFFFF3B30);
    const accentGreen = Color(0xFF34C759);

    return Scaffold(
      backgroundColor: bgDark,
      body: Column(
        children: [
          // ── 상단 카드 영역 (카카오톡 동일) ──
          Container(
            width: double.infinity,
            decoration: const BoxDecoration(
              color: bgCard,
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(28),
                bottomRight: Radius.circular(28),
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
                child: Column(
                  children: [
                    // 채널명
                    Text(
                      widget.channelName,
                      style: const TextStyle(
                        color: textWhite,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    // "연결 중"
                    const Text(
                      '연결 중',
                      style: TextStyle(color: textGray, fontSize: 14),
                    ),
                    const SizedBox(height: 10),

                    // 연결 중 점 (● ● ●)
                    AnimatedBuilder(
                      animation: _dotController,
                      builder: (context, _) {
                        return Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: List.generate(3, (i) {
                            final progress = (_dotController.value * 3 - i).clamp(0.0, 1.0);
                            final opacity = progress < 0.5
                                ? 0.3 + 0.7 * (progress * 2)
                                : 1.0 - 0.7 * ((progress - 0.5) * 2);
                            return Container(
                              width: 7,
                              height: 7,
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFF5D442).withOpacity(opacity.clamp(0.3, 1.0)),
                              ),
                            );
                          }),
                        );
                      },
                    ),
                    const SizedBox(height: 24),

                    // 프로필 이미지 (130dp, 얇은 테두리만, glow 없음)
                    Container(
                      width: 130,
                      height: 130,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF333333),
                        border: Border.all(
                          color: const Color(0xFF444444),
                          width: 1,
                        ),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Image.asset(
                        'assets/images/ringo_icon.png',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.notifications_active,
                          color: Colors.white70,
                          size: 52,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // 알람 타입 배지 (카카오 통화녹음 스타일 pill)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        _getMsgTypeLabel(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── 하단: 여백 + 버튼 (라벨 없음 - 카카오톡 동일) ──
          const Spacer(),

          // 수락/거절 버튼
          Padding(
            padding: const EdgeInsets.only(bottom: 50),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // 거절 (라벨 없음)
                _buildActionButton(
                  color: accentRed,
                  icon: Icons.call_end_rounded,
                  onTap: _decline,
                ),
                const SizedBox(width: 48),
                // 수락 (라벨 없음)
                _isAnswered
                    ? _buildLoadingButton()
                    : _buildActionButton(
                        color: accentGreen,
                        icon: Icons.call_rounded,
                        onTap: _answer,
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required Color color,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color,
        ),
        child: Icon(icon, color: Colors.white, size: 32),
      ),
    );
  }

  Widget _buildLoadingButton() {
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF34C759).withOpacity(0.5),
      ),
      child: const Center(
        child: SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation(Colors.white),
          ),
        ),
      ),
    );
  }
}
