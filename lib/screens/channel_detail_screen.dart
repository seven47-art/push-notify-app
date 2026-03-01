// lib/screens/channel_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

class ChannelDetailScreen extends StatefulWidget {
  final int channelId;
  final String channelName;

  const ChannelDetailScreen({
    super.key,
    required this.channelId,
    required this.channelName,
  });

  @override
  State<ChannelDetailScreen> createState() => _ChannelDetailScreenState();
}

class _ChannelDetailScreenState extends State<ChannelDetailScreen> {
  List<Map<String, dynamic>> _contents = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadContents();
  }

  Future<void> _loadContents() async {
    setState(() => _isLoading = true);
    _contents = await ApiService.getChannelContents(widget.channelId);
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _openContent(Map<String, dynamic> content) async {
    final url = content['content_url'] as String?;
    if (url == null || url.isEmpty) return;

    try {
      if (await canLaunchUrl(Uri.parse(url))) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('링크를 열 수 없습니다: $e')),
        );
      }
    }
  }

  IconData _getContentIcon(String? type) {
    switch (type) {
      case 'youtube':
        return Icons.play_circle_fill;
      case 'video':
        return Icons.videocam;
      case 'audio':
        return Icons.audiotrack;
      default:
        return Icons.article;
    }
  }

  Color _getContentColor(String? type) {
    switch (type) {
      case 'youtube':
        return Colors.red;
      case 'video':
        return Colors.blue;
      case 'audio':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FE),
      appBar: AppBar(
        title: Text(widget.channelName),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _contents.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.inbox, size: 60, color: Colors.grey),
                      SizedBox(height: 16),
                      Text('등록된 콘텐츠가 없습니다', style: TextStyle(color: Colors.grey)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _contents.length,
                  itemBuilder: (context, index) {
                    final content = _contents[index];
                    final contentType = content['content_type'] as String?;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        leading: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: _getContentColor(contentType).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            _getContentIcon(contentType),
                            color: _getContentColor(contentType),
                            size: 28,
                          ),
                        ),
                        title: Text(
                          content['title'] ?? '콘텐츠',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (content['description'] != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                content['description'],
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: _getContentColor(contentType).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                contentType?.toUpperCase() ?? 'CONTENT',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: _getContentColor(contentType),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        trailing: content['content_url'] != null
                            ? IconButton(
                                icon: const Icon(Icons.open_in_new, color: Color(0xFF6C63FF)),
                                onPressed: () => _openContent(content),
                              )
                            : null,
                      ),
                    );
                  },
                ),
    );
  }
}
