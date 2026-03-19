// lib/screens/content_player_screen.dart
// Phase 7: WebView 완전 제거 — YouTube는 외부 앱(youtube_launcher) 또는 url_launcher로 처리
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';

// ── 색상 상수 ──────────────────────────────────────────────
const _cpBg      = Color(0xFF000000);
const _cpPrimary = Color(0xFF6C63FF);
const _cpTeal    = Color(0xFF1DE9B6);
const _cpRed     = Color(0xFFEF4444);
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
  bool _launching = false;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    // 수신함 열람 시 status 'accepted' 처리
    if (widget.source == 'inbox' && widget.logId > 0) {
      _markInboxAccepted();
    }
    // YouTube는 초기화 시 바로 외부 앱 열기 시도
    if (widget.msgType == 'youtube') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _launchYouTube();
      });
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
      // 열람 상태 업데이트 실패해도 재생 계속 진행
    }
  }

  // ── YouTube: 외부 앱(YouTube 앱 또는 브라우저)으로 열기 ──
  Future<void> _launchYouTube() async {
    if (_launching) return;
    setState(() => _launching = true);
    final url = widget.msgValue;
    try {
      final uri = Uri.parse(url);
      // YouTube 앱 deep link 시도
      final youtubeApp = Uri.parse('vnd.youtube:${_extractVideoId(url)}');
      if (await canLaunchUrl(youtubeApp)) {
        await launchUrl(youtubeApp);
      } else if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
    if (mounted) setState(() => _launching = false);
  }

  String _extractVideoId(String url) {
    try {
      final uri = Uri.parse(url);
      if (uri.host.contains('youtu.be')) return uri.pathSegments.first;
      if (uri.queryParameters.containsKey('v')) return uri.queryParameters['v']!;
      if (uri.pathSegments.contains('shorts')) return uri.pathSegments.last;
    } catch (_) {}
    return '';
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
      case 'youtube': return _buildYouTubeView();
      case 'video':   return _buildVideoView();
      case 'audio':   return _buildAudioView();
      default:        return _buildFileView();
    }
  }

  // ── YouTube — 외부 앱 열기 유도 UI ─────────────────────
  Widget _buildYouTubeView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFFFF0000).withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.smart_display_rounded,
                color: Color(0xFFFF0000), size: 80),
          ),
          const SizedBox(height: 24),
          const Text('YouTube 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          if (_launching)
            const CircularProgressIndicator(color: Color(0xFFFF0000))
          else
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF0000),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                    horizontal: 28, vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('YouTube에서 보기',
                  style: TextStyle(fontWeight: FontWeight.bold)),
              onPressed: _launchYouTube,
            ),
        ],
      ),
    );
  }

  // ── 비디오 ─────────────────────────────────────────────
  Widget _buildVideoView() {
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
            child: const Icon(Icons.movie_rounded,
                color: Colors.blue, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('비디오 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(
                  horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('외부 앱으로 재생',
                style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri,
                    mode: LaunchMode.externalApplication);
              }
            },
          ),
        ],
      ),
    );
  }

  // ── 오디오 ─────────────────────────────────────────────
  Widget _buildAudioView() {
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
            child: Icon(Icons.music_note_rounded,
                color: _cpTeal, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('오디오 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: _cpTeal,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(
                  horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.headset_rounded),
            label: const Text('외부 앱으로 재생',
                style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri,
                    mode: LaunchMode.externalApplication);
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
            child: const Icon(Icons.attach_file_rounded,
                color: Colors.orange, size: 80),
          ),
          const SizedBox(height: 24),
          const Text('파일 콘텐츠',
              style: TextStyle(color: _cpText, fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(widget.channelName,
              style: const TextStyle(color: _cpText2, fontSize: 14)),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(
                  horizontal: 28, vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('파일 열기',
                style: TextStyle(fontWeight: FontWeight.bold)),
            onPressed: () async {
              final uri = Uri.parse(widget.msgValue);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri,
                    mode: LaunchMode.externalApplication);
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
                  color: _cpText,
                  fontSize: 15,
                  fontWeight: FontWeight.w600),
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
                decoration: const BoxDecoration(
                    color: _cpPrimary, shape: BoxShape.circle),
                child: const Icon(Icons.link_rounded,
                    color: Colors.white, size: 20),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChannelAvatar() {
    final colors = [
      _cpPrimary, Colors.pink, Colors.green, Colors.blue, Colors.orange
    ];
    final color = widget.channelName.isNotEmpty
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
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                        fontSize: 18))))
          : Center(
              child: Text(initial,
                  style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.bold,
                      fontSize: 18))),
    );
  }
}
