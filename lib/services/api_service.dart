// lib/services/api_service.dart
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

// =============================================
// 파일 업로드 상태 모델
// =============================================
class UploadedFileStatus {
  final int fileId;
  final String fileType;      // 'video' | 'audio'
  final String status;        // 'uploading' | 'processing' | 'ready' | 'failed'
  final String? processedUrl; // ready 상태일 때만 값 존재
  final double? durationSec;
  final String? errorMessage;

  const UploadedFileStatus({
    required this.fileId,
    required this.fileType,
    required this.status,
    this.processedUrl,
    this.durationSec,
    this.errorMessage,
  });

  bool get isReady   => status == 'ready';
  bool get isFailed  => status == 'failed';
  bool get isPending => status == 'uploading' || status == 'processing';

  factory UploadedFileStatus.fromJson(Map<String, dynamic> json) {
    return UploadedFileStatus(
      fileId:       json['file_id'] as int,
      fileType:     json['file_type'] as String? ?? 'audio',
      status:       json['status']   as String? ?? 'uploading',
      processedUrl: json['processed_url'] as String?,
      durationSec:  (json['duration_sec'] as num?)?.toDouble(),
      errorMessage: json['error_message'] as String?,
    );
  }
}

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

  // FCM 토큰 반환 (main.dart _registerFcmToken()이 저장한 실제 Firebase 토큰 사용)
  // 토큰이 없으면 빈 문자열 반환 → 채널 가입 시 서버가 users 테이블에서 보완
  static Future<String> getFcmToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_fcmTokenKey) ?? '';
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

  // =============================================
  // 파일 업로드 — 업로드 준비 (Signed URL 발급)
  // 반환: { file_id, upload_url, original_path, bucket, content_type }
  // =============================================
  static Future<Map<String, dynamic>> prepareFileUpload({
    required String sessionToken,
    required String fileName,
    required int fileSize,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/uploads/prepare'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'session_token': sessionToken,
          'file_name':     fileName,
          'file_size':     fileSize,
        }),
      ).timeout(const Duration(seconds: 15));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // =============================================
  // 파일 업로드 — Firebase Storage 직접 PUT 업로드
  // uploadUrl: prepareFileUpload에서 받은 Resumable Upload URL
  // =============================================
  static Future<bool> uploadFileToStorage({
    required String uploadUrl,
    required File file,
    required String contentType,
    void Function(double progress)? onProgress,
  }) async {
    try {
      final fileBytes = await file.readAsBytes();
      final request   = http.Request('PUT', Uri.parse(uploadUrl));
      request.headers['Content-Type']   = contentType;
      request.headers['Content-Length'] = '${fileBytes.length}';
      request.bodyBytes = fileBytes;

      final streamedResponse = await request.send().timeout(const Duration(minutes: 2));
      return streamedResponse.statusCode >= 200 && streamedResponse.statusCode < 300;
    } catch (e) {
      return false;
    }
  }

  // =============================================
  // 파일 업로드 — 업로드 완료 신호 (processing 상태로 변경)
  // =============================================
  static Future<Map<String, dynamic>> completeFileUpload({
    required String sessionToken,
    required int fileId,
    required String originalUrl,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/api/uploads/complete'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'session_token': sessionToken,
          'file_id':       fileId,
          'original_url':  originalUrl,
        }),
      ).timeout(const Duration(seconds: 10));
      return json.decode(response.body);
    } catch (e) {
      return {'success': false, 'error': '서버 연결 실패: $e'};
    }
  }

  // =============================================
  // 파일 업로드 — 변환 상태 폴링
  // status: 'uploading' | 'processing' | 'ready' | 'failed'
  // =============================================
  static Future<UploadedFileStatus?> pollFileStatus({
    required String sessionToken,
    required int fileId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/api/uploads/$fileId?session_token=${Uri.encodeComponent(sessionToken)}'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          return UploadedFileStatus.fromJson(data);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // =============================================
  // 파일 업로드 — ready 될 때까지 폴링 (최대 timeoutSec 초)
  // 2초 간격으로 폴링, ready or failed 또는 타임아웃 시 반환
  // =============================================
  static Future<UploadedFileStatus?> waitForFileReady({
    required String sessionToken,
    required int fileId,
    int timeoutSec = 120,
    void Function(String status)? onStatusChange,
  }) async {
    final deadline = DateTime.now().add(Duration(seconds: timeoutSec));
    String? lastStatus;

    while (DateTime.now().isBefore(deadline)) {
      final status = await pollFileStatus(
        sessionToken: sessionToken,
        fileId:       fileId,
      );

      if (status != null) {
        if (status.status != lastStatus) {
          lastStatus = status.status;
          onStatusChange?.call(status.status);
        }
        if (status.isReady || status.isFailed) return status;
      }

      await Future.delayed(const Duration(seconds: 2));
    }

    // 타임아웃
    return null;
  }
}
