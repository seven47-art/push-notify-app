// lib/screens/auth_screen.dart  v10
// 앱 시작 시 자동으로 커스텀 계정 선택 다이얼로그 표시
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
  String  _statusMsg       = '';
  // 오류 상태
  String  _errorMsg        = '';
  // 수동 입력 폴백
  bool    _showManualInput = false;
  // 계정 없음 상태 (재시도 버튼 표시용)
  bool    _noAccounts      = false;
  final   _emailCtrl       = TextEditingController();

  @override
  void initState() {
    super.initState();
    // 화면 빌드 완료 후 자동으로 계정 선택 다이얼로그 표시
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _openAccountPicker();
    });
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  // ══════════════════════════════════════════════════
  //  Step 1: 커스텀 계정 선택 다이얼로그 열기
  // ══════════════════════════════════════════════════
  Future<void> _openAccountPicker() async {
    setState(() { _errorMsg = ''; _showManualInput = false; _noAccounts = false; });

    try {
      // 기기에서 Google 계정 목록 가져오기 (런타임 권한 요청 포함)
      final accounts = await _platform.invokeMethod<List>('getGoogleAccounts');
      final emailList = accounts?.cast<String>() ?? [];

      if (emailList.isEmpty) {
        // 계정이 없거나 권한 거절 → 수동입력 폼 대신 재시도 안내
        setState(() { _noAccounts = true; });
        return;
      }

      if (!mounted) return;

      // 커스텀 다이얼로그 표시
      final selectedEmail = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => _AccountPickerDialog(accounts: emailList),
      );

      if (selectedEmail != null && selectedEmail.isNotEmpty) {
        await _loginWithEmail(selectedEmail);
      }

    } on PlatformException {
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

      if (body['success'] == true) {
        final data  = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_id',       data['user_id']       as String? ?? '');
        await prefs.setString('email',         trimmed);
        await prefs.setString('display_name',  trimmed.split('@')[0]);
        await prefs.setString('user_email',    trimmed);

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
      backgroundColor: const Color(0xFF0F0C29),
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

                  // ── 수동 입력 폴백 ──
                  if (_showManualInput) ...[
                    _ManualEmailForm(
                      controller: _emailCtrl,
                      onSubmit:   () => _loginWithEmail(_emailCtrl.text),
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: () => _openAccountPicker(),
                      child: const Text('Google 계정 선택으로 돌아가기',
                          style: TextStyle(
                              color: Color(0xFF6B7280), fontSize: 13)),
                    ),
                  ] else if (_noAccounts) ...[
                    // ── 계정 없음 / 권한 거절 안내 ──
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1B4B),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF3730A3).withOpacity(0.4)),
                      ),
                      child: Column(children: [
                        const Icon(Icons.account_circle_outlined,
                            color: Color(0xFF6C63FF), size: 40),
                        const SizedBox(height: 12),
                        const Text(
                          'Google 계정을 불러올 수 없습니다.\n계정 접근 권한을 허용하거나\n아래 버튼을 눌러 다시 시도해 주세요.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13, height: 1.6),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _openAccountPicker,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF6C63FF),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                            ),
                            child: const Text('다시 시도',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                          ),
                        ),
                      ]),
                    ),
                  ] else if (!_isLoggingIn) ...[
                    // ── 계정 선택 버튼 (다이얼로그 닫힌 후 재시도용) ──
                    _GoogleSignInButton(onTap: _openAccountPicker),
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
            fillColor: const Color(0xFF0F0C29),
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

// ══════════════════════════════════════════════════
//  커스텀 계정 선택 다이얼로그
// ══════════════════════════════════════════════════
class _AccountPickerDialog extends StatefulWidget {
  final List<String> accounts;
  const _AccountPickerDialog({required this.accounts});

  @override
  State<_AccountPickerDialog> createState() => _AccountPickerDialogState();
}

class _AccountPickerDialogState extends State<_AccountPickerDialog> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 제목
            const Text(
              '계정 선택',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 16),

            // 계정 목록 (계정 추가 없이 순수 계정만)
            ...widget.accounts.map((email) => InkWell(
              onTap: () => setState(() => _selected = email),
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                child: Row(
                  children: [
                    Radio<String>(
                      value: email,
                      groupValue: _selected,
                      onChanged: (v) => setState(() => _selected = v),
                      activeColor: const Color(0xFF6C63FF),
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        email,
                        style: const TextStyle(
                          fontSize: 15,
                          color: Color(0xFF111827),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )),

            const SizedBox(height: 24),

            // 버튼 행 - 취소 / 확인 (간격 넓게)
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, null),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text(
                      '취소',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _selected == null
                        ? null
                        : () => Navigator.pop(context, _selected),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF6C63FF),
                      disabledBackgroundColor: const Color(0xFFD1D5DB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    child: const Text(
                      '확인',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
