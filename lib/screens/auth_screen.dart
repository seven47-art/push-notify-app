// lib/screens/auth_screen.dart  v9
// "Google 계정으로 시작하기" → 시스템 계정 선택 팝업 → 확인 즉시 로그인 → 메인화면
// 별도 로그인/회원가입 화면 없음
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
  // 로딩 상태
  bool    _isLoggingIn     = false;
  String  _statusMsg       = '';   // 로그인 중 표시할 이메일 등
  // 오류 상태
  String  _errorMsg        = '';
  // 수동 입력 폴백
  bool    _showManualInput = false;
  final   _emailCtrl       = TextEditingController();

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  // ══════════════════════════════════════════════════
  //  Step 1: 시스템 계정 선택 팝업 열기
  // ══════════════════════════════════════════════════
  Future<void> _openAccountPicker() async {
    setState(() { _errorMsg = ''; });

    try {
      // AccountManager.newChooseAccountIntent() → 선택된 이메일 반환
      final email = await _platform.invokeMethod<String>('showAccountPicker');

      if (email != null && email.isNotEmpty) {
        // 선택 즉시 서버 로그인 (별도 화면 없이)
        await _loginWithEmail(email);
      }
      // email == null 이면 사용자가 취소 → 아무것도 안 함

    } on PlatformException catch (e) {
      if (e.code == 'CANCELLED') return; // 취소는 무시
      // 팝업을 열 수 없는 기기 → 수동 입력 표시
      setState(() { _showManualInput = true; });
    } catch (_) {
      setState(() { _showManualInput = true; });
    }
  }

  // ══════════════════════════════════════════════════
  //  Step 2: 이메일로 서버 자동 가입+로그인
  // ══════════════════════════════════════════════════
  Future<void> _loginWithEmail(String email) async {
    final trimmed = email.trim().toLowerCase();
    if (trimmed.isEmpty || !trimmed.contains('@')) {
      setState(() { _errorMsg = '올바른 이메일 주소를 입력해주세요.'; });
      return;
    }

    setState(() {
      _isLoggingIn  = true;
      _statusMsg    = trimmed;
      _errorMsg     = '';
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

      // ── 차단된 계정 (403) → 에러 메시지 표시 후 이메일 선택창으로 되돌아가기 ──
      if (res.statusCode == 403) {
        final errMsg = body['error'] as String? ?? '사용할 수 없는 계정입니다.';
        setState(() {
          _isLoggingIn = false;
          _errorMsg    = '$errMsg\n다른 계정을 선택해주세요.';
        });
        // 2.5초 후 이메일 선택창 다시 열기
        await Future.delayed(const Duration(milliseconds: 2500));
        if (mounted) {
          setState(() { _errorMsg = ''; });
          _openAccountPicker();
        }
        return;
      }

      if (body['success'] == true) {
        final data  = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        // 웹앱 localStorage와 동일한 키 이름으로 저장
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_id',       data['user_id']       as String? ?? '');
        await prefs.setString('email',         trimmed);          // 웹앱 키: email
        await prefs.setString('display_name',  trimmed.split('@')[0]);
        // 호환용 (기존 코드에서 user_email로 읽는 곳 있음)
        await prefs.setString('user_email',    trimmed);

        // ✅ 로그인 성공 → 권한 설정 화면으로 이동 (최초 1회)
        // 이후 앱 재시작 시에는 splash에서 /main으로 바로 이동
        if (mounted) Navigator.of(context).pushReplacementNamed('/permissions');
      } else {
        setState(() {
          _isLoggingIn = false;
          _errorMsg    = body['error'] as String? ?? '로그인 실패. 다시 시도해주세요.';
        });
      }
    } catch (e) {
      setState(() {
        _isLoggingIn = false;
        _errorMsg    = '서버 연결 실패. 인터넷 연결을 확인해주세요.';
      });
    }
  }

  // ══════════════════════════════════════════════════
  //  UI
  // ══════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF000000),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ── 앱 로고 ──
                ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: Image.asset(
                    'assets/images/ringo_icon.png',
                    width: 96, height: 96, fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 20),
                const Text('RinGo',
                    style: TextStyle(color: Colors.white, fontSize: 30,
                        fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                const Text('채널 알람 구독 서비스',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
                const SizedBox(height: 56),

                // ── 로그인 진행 중 ──
                if (_isLoggingIn) ...[
                  const SizedBox(
                    width: 46, height: 46,
                    child: CircularProgressIndicator(
                        strokeWidth: 3,
                        valueColor: AlwaysStoppedAnimation(Color(0xFF6C63FF))),
                  ),
                  const SizedBox(height: 22),
                  Text(_statusMsg,
                      style: const TextStyle(
                          color: Color(0xFF94A3B8), fontSize: 14)),
                  const SizedBox(height: 8),
                  const Text('로그인 중입니다...',
                      style: TextStyle(
                          color: Color(0xFFCBD5E1), fontSize: 16,
                          fontWeight: FontWeight.w600)),
                ] else ...[
                  // ── 오류 메시지 ──
                  if (_errorMsg.isNotEmpty) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: const Color(0xFFEF4444).withOpacity(0.3)),
                      ),
                      child: Row(children: [
                        const Icon(Icons.error_outline,
                            color: Color(0xFFEF4444), size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_errorMsg,
                              style: const TextStyle(
                                  color: Color(0xFFEF4444),
                                  fontSize: 13, height: 1.4)),
                        ),
                      ]),
                    ),
                  ],

                  // ── Google 계정 선택 버튼 ──
                  if (!_showManualInput) ...[
                    _GoogleSignInButton(onTap: _openAccountPicker),
                  ] else ...[
                    // ── 이메일 직접 입력 폼 ──
                    _ManualEmailForm(
                      controller: _emailCtrl,
                      onSubmit:   () => _loginWithEmail(_emailCtrl.text),
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: () =>
                          setState(() { _showManualInput = false; _errorMsg = ''; }),
                      child: const Text('Google 계정 선택으로 돌아가기',
                          style: TextStyle(
                              color: Color(0xFF6B7280), fontSize: 13)),
                    ),
                  ],
                ],

                const SizedBox(height: 44),
                const Text(
                  '기기의 Google 계정을 선택하면\n별도 회원가입 없이 바로 시작됩니다.',
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
}

// ══════════════════════════════════════════════════
//  Google 계정 선택 버튼 위젯
// ══════════════════════════════════════════════════
class _GoogleSignInButton extends StatelessWidget {
  final VoidCallback onTap;
  const _GoogleSignInButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 17),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 14, offset: const Offset(0, 5),
          )],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 24, height: 24,
              child: CustomPaint(painter: _GIconPainter()),
            ),
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
}

// ══════════════════════════════════════════════════
//  이메일 직접 입력 폼 위젯
// ══════════════════════════════════════════════════
class _ManualEmailForm extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSubmit;
  const _ManualEmailForm({required this.controller, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: const Color(0xFF3730A3).withOpacity(0.4)),
      ),
      child: Column(children: [
        TextField(
          controller: controller,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          decoration: InputDecoration(
            hintText: 'example@gmail.com',
            hintStyle: const TextStyle(color: Color(0xFF4B5563)),
            filled: true,
            fillColor: const Color(0xFF000000),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: Color(0xFF3730A3))),
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
            onPressed: onSubmit,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('시작하기',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          ),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════
//  Google G 아이콘 Painter
// ══════════════════════════════════════════════════
class _GIconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c  = Offset(size.width / 2, size.height / 2);
    final r  = size.width / 2 - 1;
    const sw = 3.5;
    Paint p(Color color) =>
        Paint()..color = color..strokeWidth = sw..style = PaintingStyle.stroke;

    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -1.57, 1.57, false,
        p(const Color(0xFFEA4335)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 0,    1.57, false,
        p(const Color(0xFFFBBC05)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 1.57, 1.57, false,
        p(const Color(0xFF34A853)));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 3.14, 1.0,  false,
        p(const Color(0xFF4285F4)));
    canvas.drawLine(Offset(c.dx, c.dy), Offset(size.width - 1, c.dy),
        p(const Color(0xFF4285F4)));
  }
  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
