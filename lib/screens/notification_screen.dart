// lib/screens/notification_screen.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  // 시뮬레이션 데이터 (실제 FCM push 수신 전까지)
  final List<Map<String, dynamic>> _notifications = [
    {
      'id': 1,
      'title': '새 콘텐츠 알림',
      'body': '힐링 뮤직 채널에 새 음악이 업로드되었습니다.',
      'channel_name': '힐링 뮤직 채널',
      'content_type': 'audio',
      'time': '10분 전',
      'status': 'received',
    },
    {
      'id': 2,
      'title': '새 영상 알림',
      'body': '명상 가이드 채널에 새 영상이 추가되었습니다.',
      'channel_name': '명상 가이드',
      'content_type': 'video',
      'time': '1시간 전',
      'status': 'accepted',
    },
    {
      'id': 3,
      'title': '라이브 방송 알림',
      'body': '오늘 저녁 8시 라이브 방송이 시작됩니다.',
      'channel_name': '라이브 스트리밍',
      'content_type': 'youtube',
      'time': '3시간 전',
      'status': 'rejected',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FE),
      appBar: AppBar(
        title: const Text('알림'),
        actions: [
          TextButton(
            onPressed: () {
              setState(() => _notifications.clear());
            },
            child: const Text(
              '모두 지우기',
              style: TextStyle(color: Color(0xFF6C63FF)),
            ),
          ),
        ],
      ),
      body: _notifications.isEmpty
          ? _buildEmptyState()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _notifications.length,
              itemBuilder: (context, index) {
                return _buildNotificationCard(_notifications[index], index);
              },
            ),
    );
  }

  Widget _buildNotificationCard(Map<String, dynamic> notif, int index) {
    final status = notif['status'] as String;
    final contentType = notif['content_type'] as String?;

    Color statusColor;
    String statusText;
    IconData statusIcon;

    switch (status) {
      case 'accepted':
        statusColor = const Color(0xFF4CAF50);
        statusText = '수락됨';
        statusIcon = Icons.check_circle;
        break;
      case 'rejected':
        statusColor = Colors.red;
        statusText = '거절됨';
        statusIcon = Icons.cancel;
        break;
      default:
        statusColor = const Color(0xFF6C63FF);
        statusText = '미처리';
        statusIcon = Icons.notifications;
    }

    return Dismissible(
      key: Key(notif['id'].toString()),
      onDismissed: (_) {
        setState(() => _notifications.removeAt(index));
      },
      background: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.2),
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.delete, color: Colors.red),
      ),
      child: Container(
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
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C63FF).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      _getContentIcon(contentType),
                      color: const Color(0xFF6C63FF),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          notif['title'] ?? '알림',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          notif['channel_name'] ?? '',
                          style: const TextStyle(
                            color: Colors.grey,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        notif['time'] ?? '',
                        style: const TextStyle(color: Colors.grey, fontSize: 11),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(statusIcon, size: 10, color: statusColor),
                            const SizedBox(width: 3),
                            Text(
                              statusText,
                              style: TextStyle(
                                fontSize: 10,
                                color: statusColor,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                notif['body'] ?? '',
                style: const TextStyle(color: Colors.grey, fontSize: 13),
              ),
              
              // 미처리 알림은 수락/거절 버튼 표시
              if (status == 'received') ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          setState(() {
                            _notifications[index]['status'] = 'rejected';
                          });
                        },
                        icon: const Icon(Icons.close, size: 16),
                        label: const Text('거절'),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.red),
                          foregroundColor: Colors.red,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          setState(() {
                            _notifications[index]['status'] = 'accepted';
                          });
                        },
                        icon: const Icon(Icons.play_arrow, size: 16),
                        label: const Text('수락'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6C63FF),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
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
        return Icons.notifications;
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.notifications_off_outlined,
            size: 80,
            color: Colors.grey.withOpacity(0.4),
          ),
          const SizedBox(height: 16),
          const Text(
            '알림이 없습니다',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}
