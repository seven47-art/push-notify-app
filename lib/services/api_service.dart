// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class ApiService {
  // config.dart에서 중앙 관리 - 서버 URL 변경 시 config.dart만 수정
  static const String _baseUrl = kBaseUrl;
  
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

  // 채널 생성 (운영자용)
  static Future<Map<String, dynamic>> createChannel({
    required String channelName,
    String? phoneNumber,
    String? description,
    String? imageUrl,
    String? homepageUrl,
  }) async {
    try {
      final userId = await getUserId();
      final response = await http.post(
        Uri.parse('$_baseUrl/api/channels'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': channelName,
          'owner_id': userId,
          'phone_number': phoneNumber ?? '',
          'description': description ?? '',
          'image_url': imageUrl ?? '',
          'homepage_url': homepageUrl ?? '',
        }),
      ).timeout(const Duration(seconds: 10));

      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // 내가 운영하는 채널 목록
  static Future<List<Map<String, dynamic>>> getMyOwnedChannels() async {
    try {
      final userId = await getUserId();
      final response = await http.get(
        Uri.parse('$_baseUrl/api/channels?owner_id=$userId'),
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

  // 채널 삭제
  static Future<bool> deleteChannel(int channelId) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/api/channels/$channelId'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      final data = json.decode(response.body);
      return data['success'] == true;
    } catch (e) {
      return false;
    }
  }

  // 채널 수정
  static Future<Map<String, dynamic>> updateChannel({
    required int channelId,
    required String name,
    String? description,
    String? imageUrl,
    String? homepageUrl,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/api/channels/$channelId'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'name': name,
          if (description != null) 'description': description,
          if (imageUrl != null) 'image_url': imageUrl,
          if (homepageUrl != null) 'homepage_url': homepageUrl,
        }),
      ).timeout(const Duration(seconds: 10));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // 초대링크 목록 조회
  static Future<List<Map<String, dynamic>>> getInviteLinks(int channelId) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/invites?channel_id=$channelId'),
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

  // 초대링크 생성
  static Future<Map<String, dynamic>> createInviteLink(int channelId) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/invites'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'channel_id': channelId}),
      ).timeout(const Duration(seconds: 10));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // 활성 초대링크 가져오기 (없으면 생성)
  static Future<String?> getOrCreateInviteUrl(int channelId) async {
    try {
      final baseOrigin = _baseUrl;
      final links = await getInviteLinks(channelId);
      final now = DateTime.now();
      final active = links.firstWhere(
        (l) =>
          l['is_active'] == 1 &&
          (l['expires_at'] == null ||
           DateTime.tryParse(l['expires_at'] ?? '')?.isAfter(now) == true),
        orElse: () => {},
      );
      if (active.isNotEmpty && active['invite_token'] != null) {
        return '$baseOrigin/join/${active['invite_token']}';
      }
      final created = await createInviteLink(channelId);
      final token = created['data']?['invite_token'];
      if (token != null) return '$baseOrigin/join/$token';
      return null;
    } catch (e) {
      return null;
    }
  }
}
