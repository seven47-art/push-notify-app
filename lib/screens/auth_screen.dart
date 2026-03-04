// lib/screens/auth_screen.dart  v7
// Android MethodChannel → GET_ACCOUNTS 런타임 권한 요청 → Google 계정 목록 표시
// 권한 거부 시 이메일 직접 입력 폴백
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
  bool         _isLoadingAccounts = true;
  bool         _isLoggingIn       = false;
  List<String> _accounts          = [];
  String?      _selectedEmail;
  String       _msg               = '';
  bool         _isError           = false;

  // 수동 입력 폴백
  bool _showManualInput   = false;
  final _emailCtrl        = TextEditingController();
  bool _manualInputLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAccounts());
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  // ── 1. 기기 Google 계정 조회 (런타임 권한 요청 포함) ──
  Future<void> _loadAccounts() async {
    setState(() {
      _isLoadingAccounts = true;
      _msg               = '';
      _isError           = false;
      _showManualInput   = false;
    });

    try {
      // MainActivity에서 GET_ACCOUNTS 권한 요청 후 계정 목록 반환
      final raw = await _platform.invokeMethod<List<dynamic>>('getGoogleAccounts');
      final emails = raw?.cast<String>() ?? [];

      setState(() {
        _accounts          = emails;
        _isLoadingAccounts = false;
      });

      if (emails.isEmpty) {
        // 권한 거부됐거나 계정이 없음 → 수동 입력 폴백
        setState(() {
          _showManualInput = true;
          _msg             = '기기 Google 계정을 불러오지 못했습니다.\n이메일 주소를 직접 입력해주세요.';
          _isError         = false;
        });
      }
    } on PlatformException catch (e) {
      debugPrint('[Auth] PlatformException: ${e.code} / ${e.message}');
      setState(() {
        _isLoadingAccounts = false;
        _showManualInput   = true;
        _msg               = '계정을 불러오지 못했습니다.\n이메일 주소를 직접 입력해주세요.';
        _isError           = false;
      });
    } catch (e) {
      debugPrint('[Auth] 예외: $e');
      setState(() {
        _isLoadingAccounts = false;
        _showManualInput   = true;
        _msg               = '계정을 불러오지 못했습니다.\n이메일 주소를 직접 입력해주세요.';
        _isError           = false;
      });
    }
  }

  // ── 2. 계정 선택 or 수동 입력 → 서버 로그인 ──
  Future<void> _loginWithEmail(String email) async {
    final trimmed = email.trim().toLowerCase();
    if (trimmed.isEmpty || !trimmed.contains('@')) {
      setState(() { _msg = '올바른 이메일 주소를 입력해주세요.'; _isError = true; });
      return;
    }

    setState(() {
      _selectedEmail      = trimmed;
      _isLoggingIn        = true;
      _manualInputLoading = true;
      _msg                = '$trimmed\n로그인 중...';
      _isError            = false;
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
        final data = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_email',    trimmed);
        await prefs.setString('display_name',  trimmed.split('@')[0]);

        if (mounted) Navigator.of(context).pushReplacementNamed('/main');
      } else {
        setState(() {
          _isLoggingIn        = false;
          _manualInputLoading = false;
          _selectedEmail      = null;
          _msg     = body['error'] as String? ?? '로그인 실패. 다시 시도해주세요.';
          _isError = true;
        });
      }
    } catch (e) {
      debugPrint('[Auth] 서버 오류: $e');
      setState(() {
        _isLoggingIn        = false;
        _manualInputLoading = false;
        _selectedEmail      = null;
        _msg     = '서버 연결 실패.\n인터넷 연결을 확인해주세요.';
        _isError = true;
      });
    }
  }

  // ── UI ──
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
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
                const SizedBox(height: 40),

                // ─── 본문 ───
                if (_isLoadingAccounts)
                  _buildLoading('Google 계정 조회 중...')
                else if (_isLoggingIn)
                  _buildLoading('$_selectedEmail\n로그인 중...')
                else ...[
                  if (_msg.isNotEmpty) _buildMessage(),

                  // 계정 목록
                  if (_accounts.isNotEmpty) ...[
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Google 계정을 선택하세요',
                          style: TextStyle(
                              color: Color(0xFFCBD5E1),
                              fontSize: 15,
                              fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(height: 12),
                    ..._accounts.map((e) => _buildAccountCard(e)),
                    const SizedBox(height: 16),
                    // 수동 입력으로 전환 버튼
                    TextButton(
                      onPressed: () => setState(() {
                        _showManualInput = !_showManualInput;
                      }),
                      child: Text(
                        _showManualInput ? '계정 목록으로 돌아가기' : '이메일 직접 입력하기',
                        style: const TextStyle(
                            color: Color(0xFF6C63FF), fontSize: 13),
                      ),
                    ),
                  ],

                  // 수동 이메일 입력 폼
                  if (_showManualInput || _accounts.isEmpty)
                    _buildManualInput(),

                  const SizedBox(height: 12),

                  // 재조회 버튼
                  if (_accounts.isEmpty)
                    TextButton.icon(
                      onPressed: _loadAccounts,
                      icon: const Icon(Icons.refresh,
                          color: Color(0xFF6C63FF), size: 18),
                      label: const Text('계정 다시 조회',
                          style: TextStyle(
                              color: Color(0xFF6C63FF), fontSize: 13)),
                    ),
                ],

                const SizedBox(height: 28),
                const Text(
                  '기기에 등록된 Google 계정이 표시됩니다.\n계정 선택만으로 회원가입 없이 시작할 수 있습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Color(0xFF4B5563), fontSize: 12, height: 1.7),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── 로딩 ──
  Widget _buildLoading(String label) {
    return Column(children: [
      const SizedBox(
        width: 42, height: 42,
        child: CircularProgressIndicator(
            strokeWidth: 3,
            valueColor: AlwaysStoppedAnimation(Color(0xFF6C63FF))),
      ),
      const SizedBox(height: 16),
      Text(label,
          textAlign: TextAlign.center,
          style: const TextStyle(
              color: Color(0xFFCBD5E1), fontSize: 14, height: 1.6)),
      const SizedBox(height: 20),
    ]);
  }

  // ── 메시지 박스 ──
  Widget _buildMessage() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (_isError ? const Color(0xFFEF4444) : const Color(0xFF3B82F6))
            .withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: (_isError
                ? const Color(0xFFEF4444)
                : const Color(0xFF3B82F6)).withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            _isError ? Icons.error_outline : Icons.info_outline,
            color: _isError
                ? const Color(0xFFEF4444)
                : const Color(0xFF3B82F6),
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_msg,
                style: TextStyle(
                    color: _isError
                        ? const Color(0xFFEF4444)
                        : const Color(0xFF93C5FD),
                    fontSize: 13,
                    height: 1.5)),
          ),
        ],
      ),
    );
  }

  // ── 계정 카드 ──
  Widget _buildAccountCard(String email) {
    return GestureDetector(
      onTap: () => _loginWithEmail(email),
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1B4B),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: const Color(0xFF3730A3).withOpacity(0.5)),
          boxShadow: [BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 8, offset: const Offset(0, 3))],
        ),
        child: Row(children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(21)),
            child: Center(child: _GoogleIcon()),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(email.split('@')[0],
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(email,
                  style: const TextStyle(
                      color: Color(0xFF94A3B8), fontSize: 13)),
            ],
          )),
          const Icon(Icons.chevron_right,
              color: Color(0xFF6C63FF), size: 22),
        ]),
      ),
    );
  }

  // ── 수동 이메일 입력 폼 ──
  Widget _buildManualInput() {
    return Column(children: [
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1B4B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: const Color(0xFF3730A3).withOpacity(0.4)),
        ),
        child: Column(children: [
          const Text('이메일 주소 입력',
              style: TextStyle(
                  color: Color(0xFFCBD5E1),
                  fontSize: 14,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              hintText: 'example@gmail.com',
              hintStyle: const TextStyle(
                  color: Color(0xFF4B5563), fontSize: 14),
              filled: true,
              fillColor: const Color(0xFF0F0C29),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(
                    color: Color(0xFF3730A3), width: 1),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(
                    color: const Color(0xFF3730A3).withOpacity(0.5),
                    width: 1),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(
                    color: Color(0xFF6C63FF), width: 1.5),
              ),
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
              onPressed: _manualInputLoading
                  ? null
                  : () => _loginWithEmail(_emailCtrl.text),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              child: _manualInputLoading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white))
                  : const Text('시작하기',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700)),
            ),
          ),
        ]),
      ),
    ]);
  }
}

// ── 구글 G 아이콘 ──
class _GoogleIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 22, height: 22,
      child: CustomPaint(painter: _GIconPainter()),
    );
  }
}

class _GIconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2 - 1;
    const sw = 3.5;

    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -1.57, 1.57, false,
        Paint()..color = const Color(0xFFEA4335)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 0, 1.57, false,
        Paint()..color = const Color(0xFFFBBC05)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 1.57, 1.57, false,
        Paint()..color = const Color(0xFF34A853)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), 3.14, 1.0, false,
        Paint()..color = const Color(0xFF4285F4)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawLine(Offset(c.dx, c.dy), Offset(size.width - 1, c.dy),
        Paint()..color = const Color(0xFF4285F4)..strokeWidth = sw);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
