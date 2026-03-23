// lib/screens/join_channel_screen.dart
// 웹뷰 modal-join 과 동일한 바텀시트 스타일
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'channel_detail_screen.dart';

const _primary = Color(0xFF6C63FF);
const _bg      = Color(0xFFFFFFFF);
const _bg3     = Color(0xFFF4F4F8);
const _border  = Color(0xFFEEEEEE);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);

// ── 외부에서 바텀시트로 표시하는 함수 ──────────────────
Future<void> showJoinChannelSheet(BuildContext context, {String? inviteToken}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => JoinChannelSheet(inviteToken: inviteToken),
  );
}

// ── 바텀시트 위젯 ───────────────────────────────────────
class JoinChannelSheet extends StatefulWidget {
  final String? inviteToken;
  const JoinChannelSheet({super.key, this.inviteToken});

  @override
  State<JoinChannelSheet> createState() => _JoinChannelSheetState();
}

class _JoinChannelSheetState extends State<JoinChannelSheet> {
  final _controller = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    // 딥링크로 토큰이 전달된 경우 입력창에 미리 채움
    if (widget.inviteToken != null && widget.inviteToken!.isNotEmpty) {
      _controller.text = widget.inviteToken!;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // URL에서 토큰 추출: https://ringo.run/join/inv_xxx → inv_xxx
  String _extractToken(String input) {
    final trimmed = input.trim();
    // URL 형태인 경우 마지막 경로 추출
    if (trimmed.contains('/join/')) {
      final parts = trimmed.split('/join/');
      if (parts.length > 1) return parts.last.trim();
    }
    if (trimmed.contains('/')) {
      return trimmed.split('/').last.trim();
    }
    return trimmed;
  }

  Future<void> _onJoin() async {
    final input = _controller.text.trim();
    if (input.isEmpty) {
      setState(() => _errorMessage = '초대 코드 또는 링크를 입력하세요');
      return;
    }

    final token = _extractToken(input);
    if (token.isEmpty) {
      setState(() => _errorMessage = '유효하지 않은 입력입니다');
      return;
    }

    setState(() { _isLoading = true; _errorMessage = null; });

    try {
      final prefs        = await SharedPreferences.getInstance();
      final sessionToken = prefs.getString('session_token') ?? '';
      final userId       = prefs.getString('user_id') ?? '';
      final fcmToken     = prefs.getString('fcm_token') ?? '';

      if (userId.isEmpty || sessionToken.isEmpty) {
        setState(() { _isLoading = false; _errorMessage = '로그인이 필요합니다'; });
        return;
      }

      // 1) 초대링크 검증
      final verifyRes = await http.get(
        Uri.parse('$kBaseUrl/api/invites/verify/$token'),
      ).timeout(const Duration(seconds: 8));

      if (verifyRes.statusCode != 200) {
        setState(() { _isLoading = false; _errorMessage = '유효하지 않은 초대 링크입니다'; });
        return;
      }

      final verifyBody = jsonDecode(verifyRes.body) as Map<String, dynamic>;
      if (verifyBody['success'] != true || verifyBody['valid'] != true) {
        setState(() {
          _isLoading = false;
          _errorMessage = verifyBody['message'] as String? ?? '유효하지 않은 초대 링크입니다';
        });
        return;
      }

      final channelData = verifyBody['data'] as Map<String, dynamic>;
      final channelId   = channelData['channel_id']?.toString() ?? '';
      final channelName = channelData['channel_name'] as String? ?? '채널';

      // 2) 채널 가입
      final joinRes = await http.post(
        Uri.parse('$kBaseUrl/api/invites/join'),
        headers: {
          'Authorization': 'Bearer $sessionToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'invite_token': token,
          'user_id':      userId,
          'fcm_token':    fcmToken,
        }),
      ).timeout(const Duration(seconds: 10));

      final joinBody = jsonDecode(joinRes.body) as Map<String, dynamic>;
      final alreadyJoined = joinRes.statusCode == 409;

      if (joinRes.statusCode != 200 && !alreadyJoined) {
        setState(() {
          _isLoading = false;
          _errorMessage = joinBody['message'] as String? ?? '채널 참여에 실패했습니다';
        });
        return;
      }

      if (!mounted) return;
      Navigator.pop(context); // 바텀시트 닫기

      // 3) 스낵바 메시지
      final msg = alreadyJoined ? '이미 가입된 채널입니다' : '$channelName 채널에 가입되었습니다';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: alreadyJoined ? Colors.orange : const Color(0xFF6C63FF),
          duration: const Duration(seconds: 2),
        ),
      );

      // 4) 채널 소개 페이지로 이동
      if (channelId.isNotEmpty) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ChannelDetailScreen(
              channelId: channelId,
              isOwner: false,
              isSubscribed: true,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() { _isLoading = false; _errorMessage = '네트워크 오류가 발생했습니다'; });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(bottom: bottomInset + bottomPadding),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 핸들 바 ──
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              decoration: BoxDecoration(
                color: _border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // ── 타이틀 ──
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Text(
              '채널 참여',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: _text,
              ),
            ),
          ),

          // ── 바디 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 라벨
                const Text(
                  '초대 코드 또는 초대 링크',
                  style: TextStyle(
                    fontSize: 12,
                    color: _text2,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),

                // 입력창
                TextField(
                  controller: _controller,
                  autofocus: true,
                  style: const TextStyle(fontSize: 14, color: _text),
                  decoration: InputDecoration(
                    hintText: '코드 또는 URL 붙여넣기',
                    hintStyle: const TextStyle(color: _text2, fontSize: 14),
                    filled: true,
                    fillColor: _bg3,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 11),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: _border, width: 1.5),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: _border, width: 1.5),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: _primary, width: 1.5),
                    ),
                    errorText: _errorMessage,
                    errorStyle: const TextStyle(fontSize: 12),
                  ),
                  onSubmitted: (_) => _onJoin(),
                ),

                const SizedBox(height: 12),

                // 참여하기 버튼
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _onJoin,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _primary,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: _primary.withOpacity(0.6),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            '참여하기',
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700),
                          ),
                  ),
                ),

                const SizedBox(height: 8),

                // 취소 버튼
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _text2,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      side: const BorderSide(color: _border),
                    ),
                    child: const Text(
                      '취소',
                      style: TextStyle(fontSize: 14),
                    ),
                  ),
                ),

                const SizedBox(height: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── 기존 코드 호환용 (Navigator.push 방식으로 호출하는 곳 대응) ──
class JoinChannelScreen extends StatelessWidget {
  final String? inviteToken;
  const JoinChannelScreen({super.key, this.inviteToken});

  @override
  Widget build(BuildContext context) {
    // 화면이 빌드되자마자 바텀시트로 전환 후 이전 화면으로 복귀
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Navigator.pop(context);
      showJoinChannelSheet(context, inviteToken: inviteToken);
    });
    return const SizedBox.shrink();
  }
}
