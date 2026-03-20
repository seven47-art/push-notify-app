// lib/screens/join_channel_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import 'channel_detail_screen.dart';

class JoinChannelScreen extends StatefulWidget {
  final String? inviteToken;
  const JoinChannelScreen({super.key, this.inviteToken});

  @override
  State<JoinChannelScreen> createState() => _JoinChannelScreenState();
}

class _JoinChannelScreenState extends State<JoinChannelScreen> {
  bool _isVerifying = false;
  bool _isJoining = false;
  Map<String, dynamic>? _channelData;
  String? _errorMessage;
  bool _joined = false;

  @override
  void initState() {
    super.initState();
    if (widget.inviteToken != null && widget.inviteToken!.isNotEmpty) {
      _verifyToken(widget.inviteToken!);
    }
  }

  Future<void> _verifyToken(String token) async {
    setState(() {
      _isVerifying = true;
      _errorMessage = null;
      _channelData = null;
    });

    final result = await ApiService.verifyInvite(token);

    if (mounted) {
      setState(() {
        _isVerifying = false;
        if (result['success'] == true && result['valid'] == true) {
          _channelData = result['data'];
        } else {
          _errorMessage = result['error'] ?? '유효하지 않은 초대 링크입니다';
        }
      });
    }
  }

  Future<void> _joinChannel() async {
    if (widget.inviteToken == null) return;
    setState(() => _isJoining = true);

    final result = await ApiService.joinChannel(widget.inviteToken!);

    if (mounted) {
      setState(() {
        _isJoining = false;
        if (result['success'] == true) {
          _joined = true;
          // 가입 응답에서 pending 알람 꺼내서 AlarmManager 즉시 예약
          _scheduleAlarmsFromResponse(result);
        } else {
          _errorMessage = result['error'] ?? '채널 참여에 실패했습니다';
        }
      });
    }
  }

  // 서버 응답의 pending_alarms를 Kotlin AlarmScheduler에 예약
  void _scheduleAlarmsFromResponse(Map<String, dynamic> result) {
    try {
      final data = result['data'];
      if (data == null) return;
      final pendingAlarms = data['pending_alarms'] as List<dynamic>?;
      if (pendingAlarms == null || pendingAlarms.isEmpty) return;

      const platform = MethodChannel('com.pushnotify.push_notify_app/alarm');
      for (final alarm in pendingAlarms) {
        final scheduledAt = alarm['scheduled_at'] as String?;
        if (scheduledAt == null) continue;
        final scheduledMs = DateTime.tryParse(scheduledAt)?.toUtc().millisecondsSinceEpoch;
        if (scheduledMs == null) continue;

        platform.invokeMethod('scheduleAlarm', {
          'alarm_id':           alarm['id'] ?? 0,
          'scheduled_ms':       scheduledMs,
          'channel_name':       alarm['channel_name'] ?? '',
          'channel_public_id':  alarm['channel_public_id'] ?? '',
          'msg_type':           alarm['msg_type'] ?? 'youtube',
          'msg_value':          alarm['msg_value'] ?? '',
          'content_url':        alarm['msg_value'] ?? '',
          'homepage_url':       alarm['channel_homepage_url'] ?? '',
        }).catchError((e) {
          debugPrint('[JoinChannel] scheduleAlarm error: $e');
        });
      }
      debugPrint('[JoinChannel] ${pendingAlarms.length}개 알람 AlarmManager 예약 완료');
    } catch (e) {
      debugPrint('[JoinChannel] _scheduleAlarmsFromResponse error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FE),
      appBar: AppBar(
        title: const Text('채널 참여'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            if (_isVerifying) ...[
              const SizedBox(height: 80),
              const CircularProgressIndicator(color: Color(0xFF6C63FF)),
              const SizedBox(height: 20),
              const Text('초대 링크 확인 중...', style: TextStyle(color: Colors.grey)),
            ] else if (_joined) ...[
              _buildSuccessView(),
            ] else if (_channelData != null) ...[
              _buildChannelPreview(),
            ] else if (_errorMessage != null) ...[
              _buildErrorView(),
            ] else ...[
              _buildInputView(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildInputView() {
    final controller = TextEditingController();
    return Column(
      children: [
        const SizedBox(height: 40),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF6C63FF).withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.link,
            size: 60,
            color: Color(0xFF6C63FF),
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          '초대 코드 입력',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          '채널 운영자에게 받은 초대 코드를 입력하세요',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey),
        ),
        const SizedBox(height: 32),
        TextField(
          controller: controller,
          decoration: InputDecoration(
            hintText: 'inv_xxxx_xxxxxx',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            filled: true,
            fillColor: Colors.white,
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                _verifyToken(controller.text.trim());
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('확인', style: TextStyle(fontSize: 16)),
          ),
        ),
      ],
    );
  }

  Widget _buildChannelPreview() {
    final channel = _channelData!;
    final remaining = channel['remaining_uses'];
    
    return Column(
      children: [
        const SizedBox(height: 20),
        // 채널 이미지
        if (channel['channel_image_url'] != null)
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              image: DecorationImage(
                image: NetworkImage(channel['channel_image_url']),
                fit: BoxFit.cover,
              ),
            ),
          )
        else
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: const Color(0xFF6C63FF).withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.campaign, size: 50, color: Color(0xFF6C63FF)),
          ),
        const SizedBox(height: 20),
        
        // 채널 이름
        Text(
          channel['channel_name'] ?? '채널',
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: Color(0xFF1A1A2E),
          ),
        ),
        const SizedBox(height: 8),
        
        // 초대 라벨
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF6C63FF).withOpacity(0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock, size: 14, color: Color(0xFF6C63FF)),
              const SizedBox(width: 4),
              const Text(
                '초대 전용 채널',
                style: TextStyle(
                  color: Color(0xFF6C63FF),
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        
        // 설명
        if (channel['channel_description'] != null) ...[
          Text(
            channel['channel_description'],
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.grey, fontSize: 14),
          ),
          const SizedBox(height: 16),
        ],
        
        // 잔여 참여 가능
        if (remaining != null)
          Text(
            '잔여 참여 가능: $remaining명',
            style: const TextStyle(color: Colors.grey, fontSize: 13),
          ),
        
        const SizedBox(height: 32),
        
        // 참여 버튼
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isJoining ? null : _joinChannel,
            icon: _isJoining
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(Icons.check_circle),
            label: Text(
              _isJoining ? '참여 중...' : '채널 참여하기',
              style: const TextStyle(fontSize: 16),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        
        if (_errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            _errorMessage!,
            style: const TextStyle(color: Colors.red, fontSize: 13),
          ),
        ],
      ],
    );
  }

  Widget _buildSuccessView() {
    return Column(
      children: [
        const SizedBox(height: 60),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF4CAF50).withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check_circle,
            size: 80,
            color: Color(0xFF4CAF50),
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          '채널 참여 완료!',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: Color(0xFF1A1A2E),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '${_channelData?['channel_name'] ?? '채널'}에 참여되었습니다.\n이제 알림을 받을 수 있습니다!',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.grey, fontSize: 15),
        ),
        const SizedBox(height: 40),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {
              final channelId = _channelData?['channel_id']?.toString() ?? '';
              if (channelId.isNotEmpty) {
                // 현재 화면 닫고 채널 상세로 이동
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ChannelDetailScreen(channelId: channelId, isOwner: false),
                  ),
                );
              } else {
                Navigator.pop(context);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('채널 보러가기', style: TextStyle(fontSize: 16)),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorView() {
    return Column(
      children: [
        const SizedBox(height: 60),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.red.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.error_outline, size: 80, color: Colors.red),
        ),
        const SizedBox(height: 24),
        const Text(
          '유효하지 않은 링크',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: Color(0xFF1A1A2E),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _errorMessage ?? '초대 링크가 유효하지 않습니다',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.grey, fontSize: 14),
        ),
        const SizedBox(height: 40),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () {
              setState(() {
                _errorMessage = null;
                _channelData = null;
              });
            },
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFF6C63FF)),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              '다시 시도',
              style: TextStyle(color: Color(0xFF6C63FF), fontSize: 16),
            ),
          ),
        ),
      ],
    );
  }
}
