// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  // 실제 배포 후 URL 변경 필요
  static const String _baseUrl = 'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai';
  
  // SharedPreferences key
  static const String _userIdKey = 'user_id';
  static const String _fcmTokenKey = 'fcm_token';

  // 사용자 ID 가져오기 (없으면 생성)
  static Future<String> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    String? userId = prefs.getString(_userIdKey);
    if (userId == null) {
      userId = 'user_${DateTime.now().millisecondsSinceEpoch}';
      await prefs.setString(_userIdKey, userId);
    }
    return userId;
  }

  // FCM 토큰 저장 (시뮬레이션)
  static Future<String> getFcmToken() async {
    final prefs = await SharedPreferences.getInstance();
    String? token = prefs.getString(_fcmTokenKey);
    if (token == null) {
      token = 'fcm_${DateTime.now().millisecondsSinceEpoch}_android';
      await prefs.setString(_fcmTokenKey, token);
    }
    return token;
  }

  // 초대 링크 검증
  static Future<Map<String, dynamic>> verifyInvite(String token) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/invites/verify/$token'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        final body = json.decode(response.body);
        return {'success': false, 'error': body['error'] ?? '알 수 없는 오류'};
      }
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // 채널 참여 (초대 링크로)
  static Future<Map<String, dynamic>> joinChannel(String inviteToken) async {
    try {
      final userId = await getUserId();
      final fcmToken = await getFcmToken();
      
      final response = await http.post(
        Uri.parse('$_baseUrl/api/invites/join'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'invite_token': inviteToken,
          'user_id': userId,
          'fcm_token': fcmToken,
          'platform': 'android',
        }),
      ).timeout(const Duration(seconds: 10));

      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // 내 구독 채널 목록
  static Future<List<Map<String, dynamic>>> getMyChannels() async {
    try {
      final userId = await getUserId();
      final response = await http.get(
        Uri.parse('$_baseUrl/api/subscribers?user_id=$userId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          return List<Map<String, dynamic>>.from(data['data'] ?? []);
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  // 알림 액션 기록 (수락/거절)
  static Future<bool> recordAction({
    required int batchId,
    required int subscriberId,
    required String action, // 'accepted' or 'rejected'
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/subscribers/action'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'batch_id': batchId,
          'subscriber_id': subscriberId,
          'action': action,
        }),
      ).timeout(const Duration(seconds: 10));

      final data = json.decode(response.body);
      return data['success'] == true;
    } catch (e) {
      return false;
    }
  }

  // 채널 콘텐츠 목록
  static Future<List<Map<String, dynamic>>> getChannelContents(int channelId) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/contents?channel_id=$channelId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          return List<Map<String, dynamic>>.from(data['data'] ?? []);
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  // 알림 로그 (내가 받은 알림)
  static Future<List<Map<String, dynamic>>> getNotificationLogs() async {
    try {
      final userId = await getUserId();
      final response = await http.get(
        Uri.parse('$_baseUrl/api/notifications/logs?user_id=$userId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          return List<Map<String, dynamic>>.from(data['data'] ?? []);
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
