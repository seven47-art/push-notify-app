// lib/screens/content_player_screen.dart
// 알람 수신 후 콘텐츠 플레이어 화면
// YouTube / 오디오 / 비디오 타입 처리
// YouTube: url_launcher로 외부 앱 실행 (webview_flutter 제거됨)
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _bg      = Color(0xFFFFFFFF);

class ContentPlayerScreen extends StatefulWidget {
  final Map<String, dynamic> alarm;
  const ContentPlayerScreen({super.key, required this.alarm});

  @override
  State<ContentPlayerScreen> createState() => _ContentPlayerScreenState();
}

class _ContentPlayerScreenState extends State<ContentPlayerScreen> {
  String get _contentType {
    return widget.alarm['msg_type']?.toString() ??
           widget.alarm['content_type']?.toString() ??
           widget.alarm['alarm_type']?.toString() ??
           '';
  }

  String get _contentUrl {
    return widget.alarm['msg_value']?.toString() ??
           widget.alarm['content_url']?.toString() ??
           widget.alarm['youtube_url']?.toString() ??
           widget.alarm['file_url']?.toString() ??
           '';
  }

  String get _channelName {
    return widget.alarm['channel_name']?.toString() ?? '';
  }

  String get _linkUrl {
    return widget.alarm['link_url']?.toString() ?? '';
  }

  Future<void> _openLink() async {
    final url = _linkUrl.isNotEmpty ? _linkUrl : _contentUrl;
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  IconData get _typeIcon {
    switch (_contentType) {
      case 'youtube': return Icons.smart_display;
      case 'audio':   return Icons.music_note;
      case 'video':   return Icons.videocam;
      default:        return Icons.notifications;
    }
  }

  Color get _typeColor {
    switch (_contentType) {
      case 'youtube': return Colors.red;
      case 'audio':   return Colors.blue;
      case 'video':   return Colors.green;
      default:        return _primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          _channelName.isNotEmpty ? _channelName : '알람',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text),
        ),
        actions: [
          if (_linkUrl.isNotEmpty || _contentUrl.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.open_in_new, color: _text),
              onPressed: _openLink,
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_contentType == 'youtube' && _contentUrl.isNotEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 120, height: 120,
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.smart_display, size: 60, color: Colors.red),
            ),
            const SizedBox(height: 20),
            Text(
              _channelName,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text('YouTube 알람', style: TextStyle(fontSize: 14, color: _text2)),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _openLink,
              icon: const Icon(Icons.play_arrow),
              label: const Text('YouTube에서 재생'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
                minimumSize: const Size(200, 50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
              ),
            ),
          ],
        ),
      );
    }

    if (_contentType == 'audio') {
      return Column(
        children: [
          const SizedBox(height: 40),
          // 오디오 플레이어 UI
          Center(
            child: Column(
              children: [
                Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.music_note, size: 60, color: Colors.blue),
                ),
                const SizedBox(height: 20),
                Text(
                  _channelName,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text),
                ),
                const SizedBox(height: 8),
                const Text('오디오 알람', style: TextStyle(fontSize: 14, color: _text2)),
                const SizedBox(height: 32),
                if (_contentUrl.isNotEmpty)
                  ElevatedButton.icon(
                    onPressed: _openLink,
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('재생'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(160, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
    }

    // 기본: 알람 정보 표시
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: _typeColor.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(_typeIcon, size: 50, color: _typeColor),
          ),
          const SizedBox(height: 20),
          Text(
            _channelName,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            _contentType.isEmpty ? '알람이 도착했습니다.' : '$_contentType 알람',
            style: const TextStyle(fontSize: 14, color: _text2),
          ),
          if (_linkUrl.isNotEmpty || _contentUrl.isNotEmpty) ...[
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _openLink,
              icon: const Icon(Icons.open_in_new),
              label: const Text('열기'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _primary,
                foregroundColor: Colors.white,
                minimumSize: const Size(160, 50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInfoSection() {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 12),
            if (_channelName.isNotEmpty)
              Text(
                _channelName,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text),
              ),
            if (_linkUrl.isNotEmpty) ...[
              const SizedBox(height: 12),
              GestureDetector(
                onTap: _openLink,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF5F5F5),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.link, size: 18, color: _primary),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          _linkUrl,
                          style: const TextStyle(fontSize: 13, color: _primary, decoration: TextDecoration.underline),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
