// lib/screens/auth_screen.dart  v2 - 구글 플레이 이메일 자동 로그인
// 앱 설치 후 구글 계정 이메일 목록 표시 → 선택 시 자동 회원가입+로그인
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const String _baseUrl = kBaseUrl;

// ── 구글 로그인 인스턴스 ──
final GoogleSignIn _googleSignIn = GoogleSignIn(
  scopes: ['email', 'profile'],
);

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool   _isLoading   = false;
  String _statusMsg   = '';
  bool   _hasError    = false;

  @override
  void initState() {
    super.initState();
    // 화면 열리자마자 구글 계정 조회 시작
    WidgetsBinding.instance.addPostFrameCallback((_) => _startGoogleLogin());
  }

  // ── 구글 로그인 플로우 ──
  Future<void> _startGoogleLogin() async {
    setState(() { _isLoading = true; _statusMsg = '구글 계정을 확인하는 중...'; _hasError = false; });

    try {
      // 1) 이미 로그인된 구글 계정 먼저 확인 (사일런트)
      GoogleSignInAccount? account = await _googleSignIn.signInSilently();

      // 2) 사일런트 로그인 실패 시 선택 화면 표시
      account ??= await _googleSignIn.signIn();

      if (account == null) {
        // 사용자가 취소
        setState(() { _isLoading = false; _statusMsg = '계정을 선택해주세요'; _hasError = false; });
        return;
      }

      setState(() { _statusMsg = '${account!.email}\n로그인 중...'; });

      // 3) 서버에 이메일로 자동 로그인/회원가입
      await _loginWithEmail(
        email:       account.email,
        displayName: account.displayName ?? account.email.split('@')[0],
        googleId:    account.id,
      );

    } catch (e) {
      debugPrint('[Auth] 구글 로그인 오류: $e');
      setState(() {
        _isLoading  = false;
        _statusMsg  = '로그인 중 오류가 발생했습니다.\n다시 시도해주세요.';
        _hasError   = true;
      });
    }
  }

  // ── 서버에 이메일 로그인 요청 ──
  Future<void> _loginWithEmail({
    required String email,
    required String displayName,
    required String googleId,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email':        email,
          'display_name': displayName,
          'google_id':    googleId,
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;

      if (body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final token = data['session_token'] as String;

        // 토큰 저장 (영구 로그인)
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', token);
        await prefs.setString('user_email',    email);
        await prefs.setString('display_name',  displayName);

        if (mounted) {
          Navigator.of(context).pushReplacementNamed('/main');
        }
      } else {
        setState(() {
          _isLoading = false;
          _statusMsg = body['error'] as String? ?? '로그인에 실패했습니다';
          _hasError  = true;
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _statusMsg = '서버 연결 실패\n인터넷 연결을 확인해주세요';
        _hasError  = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ── 앱 아이콘 ──
                Container(
                  width: 96, height: 96,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6C63FF).withOpacity(0.5),
                        blurRadius: 30, offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.notifications_active, color: Colors.white, size: 52),
                ),
                const SizedBox(height: 20),
                const Text('PushNotify',
                  style: TextStyle(color: Colors.white, fontSize: 30,
                    fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                const Text('채널 알람 구독 서비스',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 15)),

                const SizedBox(height: 56),

                if (_isLoading) ...[
                  // 로딩 중
                  const SizedBox(
                    width: 44, height: 44,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF6C63FF)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    _statusMsg,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 15, height: 1.6),
                  ),
                ] else ...[
                  // 계정 선택 버튼
                  _GoogleSignInButton(
                    onTap: _startGoogleLogin,
                    label: _hasError ? '다시 시도하기' : '구글 계정으로 계속하기',
                  ),

                  if (_statusMsg.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: _hasError
                          ? const Color(0xFFEF4444).withOpacity(0.12)
                          : const Color(0xFF22C55E).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _hasError
                            ? const Color(0xFFEF4444).withOpacity(0.3)
                            : const Color(0xFF22C55E).withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _hasError ? Icons.error_outline : Icons.info_outline,
                            color: _hasError ? const Color(0xFFEF4444) : const Color(0xFF22C55E),
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              _statusMsg,
                              style: TextStyle(
                                color: _hasError ? const Color(0xFFEF4444) : const Color(0xFF22C55E),
                                fontSize: 13, height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],

                const SizedBox(height: 48),

                // 안내 문구
                const Text(
                  '구글 플레이에 등록된 계정을 선택하면\n별도 회원가입 없이 바로 사용할 수 있습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 12, height: 1.7),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── 구글 로그인 버튼 위젯 ──
class _GoogleSignInButton extends StatelessWidget {
  final VoidCallback onTap;
  final String label;
  const _GoogleSignInButton({required this.onTap, required this.label});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 12, offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // 구글 로고 (SVG 대신 텍스트 기반)
            Container(
              width: 24, height: 24,
              decoration: const BoxDecoration(shape: BoxShape.circle),
              child: const Text('G',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700,
                  color: Color(0xFF4285F4),
                  height: 1.3,
                )),
            ),
            const SizedBox(width: 12),
            Text(label,
              style: const TextStyle(
                color: Color(0xFF1F2937),
                fontSize: 16,
                fontWeight: FontWeight.w600,
              )),
          ],
        ),
      ),
    );
  }
}
