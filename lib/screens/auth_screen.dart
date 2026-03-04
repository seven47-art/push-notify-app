// lib/screens/auth_screen.dart  v8
// AccountManager.newChooseAccountIntent() → 시스템 Google 계정 선택 팝업
// GET_ACCOUNTS/OAuth 불필요, 선택한 이메일만 아이디로 사용
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const _platform = MethodChannel('com.pushnotify/accounts');

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool    _isLoggingIn    = false;
  bool    _showManualInput = false;
  String  _msg            = '';
  bool    _isError        = false;
  String? _pickedEmail;

  final _emailCtrl = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  // ── 1. Account Picker 팝업 호출 ────────────────────────────────
  Future<void> _openAccountPicker() async {
    setState(() { _msg = ''; _isError = false; });

    try {
      // 시스템 계정 선택 팝업 → 선택된 이메일 반환
      final email = await _platform.invokeMethod<String>('showAccountPicker');

      if (email != null && email.isNotEmpty) {
        await _loginWithEmail(email);
      }
    } on PlatformException catch (e) {
      if (e.code == 'CANCELLED') {
        // 사용자 취소 → 아무것도 안 함
        return;
      }
      // 팝업 자체를 열 수 없는 경우 → 수동 입력 폴백
      debugPrint('[Auth] Account Picker 오류: ${e.code} / ${e.message}');
      setState(() {
        _showManualInput = true;
        _msg     = '계정 선택창을 열 수 없습니다.\n이메일을 직접 입력해주세요.';
        _isError = false;
      });
    } catch (e) {
      debugPrint('[Auth] 예외: $e');
      setState(() {
        _showManualInput = true;
        _msg     = '오류가 발생했습니다. 이메일을 직접 입력해주세요.';
        _isError = false;
      });
    }
  }

  // ── 2. 이메일 → 서버 로그인 ────────────────────────────────────
  Future<void> _loginWithEmail(String email) async {
    final trimmed = email.trim().toLowerCase();
    if (trimmed.isEmpty || !trimmed.contains('@')) {
      setState(() { _msg = '올바른 이메일 주소를 입력해주세요.'; _isError = true; });
      return;
    }

    setState(() {
      _pickedEmail = trimmed;
      _isLoggingIn = true;
      _msg         = '';
      _isError     = false;
    });

    try {
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email':        trimmed,
          'display_name': trimmed.split('@')[0],
          'google_id':    trimmed,
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;

      if (body['success'] == true) {
        final data  = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_email',    trimmed);
        await prefs.setString('display_name',  trimmed.split('@')[0]);

        if (mounted) Navigator.of(context).pushReplacementNamed('/main');
      } else {
        setState(() {
          _isLoggingIn = false;
          _pickedEmail = null;
          _msg         = body['error'] as String? ?? '로그인 실패. 다시 시도해주세요.';
          _isError     = true;
        });
      }
    } catch (e) {
      debugPrint('[Auth] 서버 오류: $e');
      setState(() {
        _isLoggingIn = false;
        _pickedEmail = null;
        _msg         = '서버 연결 실패.\n인터넷 연결을 확인해주세요.';
        _isError     = true;
      });
    }
  }

  // ── UI ──────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 앱 로고
                Container(
                  width: 90, height: 90,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(26),
                    boxShadow: [BoxShadow(
                      color: const Color(0xFF6C63FF).withOpacity(0.5),
                      blurRadius: 30, offset: const Offset(0, 10),
                    )],
                  ),
                  child: const Icon(Icons.notifications_active,
                      color: Colors.white, size: 48),
                ),
                const SizedBox(height: 18),
                const Text('PushNotify',
                    style: TextStyle(color: Colors.white, fontSize: 28,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                const Text('채널 알람 구독 서비스',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
                const SizedBox(height: 52),

                // ─── 로그인 중 ───
                if (_isLoggingIn) ...[
                  const SizedBox(
                    width: 44, height: 44,
                    child: CircularProgressIndicator(
                        strokeWidth: 3,
                        valueColor: AlwaysStoppedAnimation(Color(0xFF6C63FF))),
                  ),
                  const SizedBox(height: 20),
                  Text('${_pickedEmail ?? ''}\n로그인 중...',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Color(0xFFCBD5E1), fontSize: 14, height: 1.6)),
                ] else ...[
                  // 오류 메시지
                  if (_msg.isNotEmpty) _buildMessage(),

                  // ─── Google 계정 선택 버튼 ───
                  if (!_showManualInput) ...[
                    _buildGoogleButton(),
                    const SizedBox(height: 16),
                    // 직접 입력으로 전환
                    TextButton(
                      onPressed: () =>
                          setState(() => _showManualInput = true),
                      child: const Text(
                        '이메일 직접 입력하기',
                        style: TextStyle(
                            color: Color(0xFF6B7280), fontSize: 13),
                      ),
                    ),
                  ] else ...[
                    // ─── 이메일 직접 입력 폼 ───
                    _buildManualInput(),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () =>
                          setState(() { _showManualInput = false; _msg = ''; }),
                      child: const Text(
                        'Google 계정 선택으로 돌아가기',
                        style: TextStyle(
                            color: Color(0xFF6B7280), fontSize: 13),
                      ),
                    ),
                  ],
                ],

                const SizedBox(height: 40),
                const Text(
                  '기기의 Google 계정을 선택하거나\n이메일을 직접 입력해 시작하세요.\n별도 회원가입이 필요 없습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Color(0xFF374151), fontSize: 12, height: 1.7),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Google 계정 선택 버튼 ──
  Widget _buildGoogleButton() {
    return GestureDetector(
      onTap: _openAccountPicker,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 17),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(
            color: Colors.black.withOpacity(0.18),
            blurRadius: 14, offset: const Offset(0, 5),
          )],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _GoogleIcon(),
            const SizedBox(width: 12),
            const Text(
              'Google 계정으로 시작하기',
              style: TextStyle(
                color: Color(0xFF111827),
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── 메시지 박스 ──
  Widget _buildMessage() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 18),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: (_isError ? const Color(0xFFEF4444) : const Color(0xFF3B82F6))
            .withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: (_isError
                    ? const Color(0xFFEF4444)
                    : const Color(0xFF3B82F6))
                .withOpacity(0.35)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(
          _isError ? Icons.error_outline : Icons.info_outline,
          color: _isError
              ? const Color(0xFFEF4444)
              : const Color(0xFF60A5FA),
          size: 18,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(_msg,
              style: TextStyle(
                  color: _isError
                      ? const Color(0xFFEF4444)
                      : const Color(0xFF93C5FD),
                  fontSize: 13, height: 1.5)),
        ),
      ]),
    );
  }

  // ── 이메일 직접 입력 폼 ──
  Widget _buildManualInput() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: const Color(0xFF3730A3).withOpacity(0.45)),
      ),
      child: Column(children: [
        const Text('이메일 주소 직접 입력',
            style: TextStyle(
                color: Color(0xFFCBD5E1),
                fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: 'example@gmail.com',
            hintStyle:
                const TextStyle(color: Color(0xFF4B5563), fontSize: 14),
            filled: true,
            fillColor: const Color(0xFF0F0C29),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(
                    color: Color(0xFF3730A3))),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(
                    color: const Color(0xFF3730A3).withOpacity(0.5))),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(
                    color: Color(0xFF6C63FF), width: 1.5)),
            prefixIcon: const Icon(Icons.email_outlined,
                color: Color(0xFF6C63FF), size: 20),
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 14),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => _loginWithEmail(_emailCtrl.text),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('시작하기',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700)),
          ),
        ),
      ]),
    );
  }
}

// ── 구글 G 아이콘 ──
class _GoogleIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      SizedBox(width: 22, height: 22,
          child: CustomPaint(painter: _GIconPainter()));
}

class _GIconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c  = Offset(size.width / 2, size.height / 2);
    final r  = size.width / 2 - 1;
    const sw = 3.5;
    final stroke = (Color color) =>
        Paint()..color = color..strokeWidth = sw..style = PaintingStyle.stroke;

    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -1.57, 1.57, false,
        stroke(const Color(0xFFEA4335)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r),  0,    1.57, false,
        stroke(const Color(0xFFFBBC05)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r),  1.57, 1.57, false,
        stroke(const Color(0xFF34A853)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r),  3.14, 1.0,  false,
        stroke(const Color(0xFF4285F4)));
    canvas.drawLine(Offset(c.dx, c.dy), Offset(size.width - 1, c.dy),
        stroke(const Color(0xFF4285F4)));
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
