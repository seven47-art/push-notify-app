// lib/screens/content_player_screen.dart
// 알람 콘텐츠 재생 화면 — WebView screen-content-player 대체
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../config.dart';

// ── 색상 상수 ──────────────────────────────────────────────
const _cpBg      = Color(0xFF000000);
const _cpPrimary = Color(0xFF6C63FF);
const _cpTeal    = Color(0xFF1DE9B6);
const _cpText    = Colors.white;
const _cpText2   = Color(0xFF94A3B8);

class ContentPlayerScreen extends StatefulWidget {
  final int     logId;
  final int     channelId;
  final String  channelName;
  final String  channelImage;
  final String  msgType;    // 'youtube' | 'video' | 'audio' | 'file'
  final String  msgValue;   // URL
  final String  linkUrl;    // 외부 링크 (선택)
  final String  source;     // 'inbox' | 'send'

  const ContentPlayerScreen({
    super.key,
    required this.logId,
    required this.channelId,
    required this.channelName,
    required this.channelImage,
    required this.msgType,
    required this.msgValue,
    required this.linkUrl,
    required this.source,
  });

  @override
  State<ContentPlayerScreen> createState() => _ContentPlayerScreenState();
}

class _ContentPlayerScreenState extends State<ContentPlayerScreen> {
  WebViewController? _webController;
  bool _webLoading = true;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (widget.msgType == 'youtube') {
      _initYouTubePlayer();
    }
    // 수신함 열람 시 status 'accepted' 처리 (WebView openAlarmContent와 동일)
    if (widget.source == 'inbox' && widget.logId > 0) {
      _markInboxAccepted();
    }
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  // ── 수신함 열람 상태 업데이트 ─────────────────────────────
  Future<void> _markInboxAccepted() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token');
      if (token == null || token.isEmpty) return;
      await http.post(
        Uri.parse('$kBaseUrl/api/alarms/inbox/${widget.logId}/status'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'status': 'accepted'}),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {
      // 열람 상태 업데이트 실패해도 재생은 계속 진행
    }
  }

  void _initYouTubePlayer() {
    final embedUrl = _toYoutubeEmbed(widget.msgValue);
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _webLoading = false);
        },
      ))
      ..loadRequest(Uri.parse(embedUrl));
  }

  String _toYoutubeEmbed(String url) {
    // 다양한 유튜브 URL 형식을 embed URL로 변환
    String videoId = '';
    try {
      final uri = Uri.parse(url);
      if (uri.host.contains('youtu.be')) {
        videoId = uri.pathSegments.first;
      } else if (uri.queryParameters.containsKey('v')) {
        videoId = uri.queryParameters['v']!;
      } else if (uri.pathSegments.contains('shorts')) {
        videoId = uri.pathSegments.last;
      }
    } catch (_) {}
    if (videoId.isEmpty) return url;
    return 'https://www.youtube.com/embed/$videoId?autoplay=1&playsinline=1';
  }

  Future<void> _openExternalLink() async {
    final url = widget.linkUrl.isNotEmpty ? widget.linkUrl : widget.msgValue;
    if (url.isEmpty) return;
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _cpBg,
      body: Stack(
        children: [
          // ── 콘텐츠 영역 ──────────────────────────────
          _buildContentArea(),

          // ── 하단 바 ──────────────────────────────────
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: _buildBottomBar(),
          ),

          // ── 닫기 버튼 (우상단) ────────────────────────
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: SafeArea(
              child: GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.6),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, color: Colors.white, size: 20),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContentArea() {
    switch (widget.msgType) {
      case 'youtube':
        return _buildYouTubePlayer();
      case 'video':
        return _buildVideoPlayer();
      case 'audio':
        return _buildAudioPlayer();
      default:
        return _buildFileView();
    }
  }

  // ── YouTube ────────────────────────────────────────────
  Widget _buildYouTubePlayer() {
    if (_webController == null) return const SizedBox.shrink();
    return Stack(
      children: [
        WebViewWidget(controller: _webController!),
        if (_webLoading)
          const Center(
            child: CircularProgressIndicator(color: _cpPrimary),
          ),
      ],
    );
  }

  // ── 비디오 ─────────────────────────────────────────────
  Widget _buildVideoPlayer() {
    // video_player 패키지 없이 외부 앱으로 재생
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.movie, color: Colors.blue, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('비디오 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.play_arrow),
            label: const Text('외부 앱으로 재생', style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
    );
  }

  // ── 오디오 ─────────────────────────────────────────────
  Widget _buildAudioPlayer() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: _cpTeal.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.music_note, color: _cpTeal, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('오디오 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: _cpTeal,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.headset),
            label: const Text('외부 앱으로 재생', style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
    );
  }

  // ── 파일 ───────────────────────────────────────────────
  Widget _buildFileView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.orange.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.attach_file, color: Colors.orange, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('파일 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.open_in_new),
            label: const Text('파일 열기', style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
    );
  }

  // ── 하단 바 ────────────────────────────────────────────
  Widget _buildBottomBar() {
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Color(0xCC000000)],
        ),
      ),
      child: Row(
        children: [
          // 채널 아바타
          _buildChannelAvatar(),
          const SizedBox(width: 12),
          // 채널명
          Expanded(
            child: Text(
              widget.channelName,
              style: const TextStyle(
                  color: _cpText, fontSize: 15, fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          // 링크 버튼 (linkUrl 있을 때만)
          if (widget.linkUrl.isNotEmpty) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _openExternalLink,
              child: Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                    color: _cpPrimary, shape: BoxShape.circle),
                child: const Icon(Icons.link, color: Colors.white, size: 20),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChannelAvatar() {
    final colors = [_cpPrimary, Colors.pink, Colors.green, Colors.blue, Colors.orange];
    final color  = widget.channelName.isNotEmpty
        ? colors[widget.channelName.codeUnitAt(0) % colors.length]
        : _cpPrimary;
    final initial = widget.channelName.isNotEmpty
        ? widget.channelName[0].toUpperCase()
        : 'C';

    return Container(
      width: 44, height: 44,
      decoration: BoxDecoration(
        color: color.withOpacity(0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: widget.channelImage.isNotEmpty
          ? Image.network(widget.channelImage, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Center(
                child: Text(initial,
                    style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 18))))
          : Center(
              child: Text(initial,
                  style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 18))),
    );
  }
}
