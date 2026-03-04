// lib/screens/auth_screen.dart  v6
// Android MethodChannel → GET_ACCOUNTS → Gmail 계정 목록 표시 → 선택 → 서버 로그인
// OAuth / Firebase / GCP 설정 불필요
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

// Android 네이티브 MethodChannel
const _platform = MethodChannel('com.pushnotify/accounts');

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  // 상태
  bool          _isLoadingAccounts = true;  // 계정 목록 로딩 중
  bool          _isLoggingIn       = false; // 서버 로그인 중
  List<String>  _accounts          = [];    // 기기 Google 계정 이메일 목록
  String?       _selectedEmail;             // 현재 선택된 이메일
  String        _msg               = '';
  bool          _isError           = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAccounts());
  }

  // ── 1. 기기 Google 계정 목록 조회 ──────────────────────────────
  Future<void> _loadAccounts() async {
    setState(() { _isLoadingAccounts = true; _msg = ''; _isError = false; });

    try {
      // Android 네이티브에서 Google 계정 목록 가져오기
      final raw = await _platform.invokeMethod<List<dynamic>>('getGoogleAccounts');
      final emails = raw?.cast<String>() ?? [];

      // Gmail 계정만 필터링 (선택 사항)
      // final gmailOnly = emails.where((e) => e.endsWith('@gmail.com')).toList();

      setState(() {
        _accounts          = emails;
        _isLoadingAccounts = false;
      });

      // 계정이 없으면 안내 메시지
      if (emails.isEmpty) {
        setState(() {
          _msg     = '기기에 Google 계정이 없습니다.\n설정 > 계정에서 Google 계정을 추가해주세요.';
          _isError = true;
        });
      }
    } on PlatformException catch (e) {
      debugPrint('[Auth] 계정 조회 오류: ${e.code} / ${e.message}');
      setState(() {
        _isLoadingAccounts = false;
        _msg     = '계정을 불러오지 못했습니다.\n(${e.message ?? e.code})\n다시 시도해주세요.';
        _isError = true;
      });
    } catch (e) {
      debugPrint('[Auth] 예외: $e');
      setState(() {
        _isLoadingAccounts = false;
        _msg     = '계정을 불러오지 못했습니다.\n다시 시도해주세요.';
        _isError = true;
      });
    }
  }

  // ── 2. 계정 선택 → 서버 로그인 ────────────────────────────────
  Future<void> _selectAccount(String email) async {
    setState(() {
      _selectedEmail = email;
      _isLoggingIn   = true;
      _msg           = '$email 로그인 중...';
      _isError       = false;
    });

    try {
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email':        email.toLowerCase(),
          'display_name': email.split('@')[0],
          'google_id':    email.toLowerCase(),
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;

      if (body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_email',    email.toLowerCase());
        await prefs.setString('display_name',  email.split('@')[0]);

        if (mounted) Navigator.of(context).pushReplacementNamed('/main');
      } else {
        setState(() {
          _isLoggingIn   = false;
          _selectedEmail = null;
          _msg     = body['error'] as String? ?? '로그인 실패. 다시 시도해주세요.';
          _isError = true;
        });
      }
    } catch (e) {
      debugPrint('[Auth] 서버 오류: $e');
      setState(() {
        _isLoggingIn   = false;
        _selectedEmail = null;
        _msg     = '서버 연결 실패.\n인터넷 연결을 확인해주세요.';
        _isError = true;
      });
    }
  }

  // ── UI ────────────────────────────────────────────────────────
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

                // ─── 계정 목록 ───
                if (_isLoadingAccounts)
                  _buildLoading('Google 계정 조회 중...')
                else if (_isLoggingIn)
                  _buildLoading('$_selectedEmail\n로그인 중...')
                else ...[
                  // 상태 메시지 (오류/안내)
                  if (_msg.isNotEmpty) _buildMessage(),

                  if (_accounts.isNotEmpty) ...[
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Google 계정을 선택하세요',
                        style: TextStyle(
                          color: Color(0xFFCBD5E1),
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // 계정 카드 목록
                    ..._accounts.map((email) => _buildAccountCard(email)),

                    const SizedBox(height: 20),
                  ],

                  // 새로고침 버튼 (오류 시 표시)
                  if (_isError || _accounts.isEmpty)
                    TextButton.icon(
                      onPressed: _loadAccounts,
                      icon: const Icon(Icons.refresh, color: Color(0xFF6C63FF)),
                      label: const Text('다시 조회',
                        style: TextStyle(color: Color(0xFF6C63FF), fontSize: 14)),
                    ),
                ],

                const SizedBox(height: 28),

                // 안내문구
                const Text(
                  '기기에 등록된 Google 계정이 표시됩니다.\n계정 선택만으로 회원가입 없이 시작할 수 있습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xFF4B5563),
                    fontSize: 12,
                    height: 1.7,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── 로딩 위젯 ──
  Widget _buildLoading(String label) {
    return Column(
      children: [
        const SizedBox(
          width: 42, height: 42,
          child: CircularProgressIndicator(
            strokeWidth: 3,
            valueColor: AlwaysStoppedAnimation(Color(0xFF6C63FF)),
          ),
        ),
        const SizedBox(height: 16),
        Text(label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Color(0xFFCBD5E1), fontSize: 14, height: 1.6)),
        const SizedBox(height: 20),
      ],
    );
  }

  // ── 오류/안내 메시지 ──
  Widget _buildMessage() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (_isError ? const Color(0xFFEF4444) : const Color(0xFF22C55E))
            .withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: (_isError ? const Color(0xFFEF4444) : const Color(0xFF22C55E))
              .withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            _isError ? Icons.error_outline : Icons.info_outline,
            color: _isError ? const Color(0xFFEF4444) : const Color(0xFF22C55E),
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_msg,
              style: TextStyle(
                color: _isError
                    ? const Color(0xFFEF4444)
                    : const Color(0xFF22C55E),
                fontSize: 13, height: 1.5,
              )),
          ),
        ],
      ),
    );
  }

  // ── 계정 카드 ──
  Widget _buildAccountCard(String email) {
    return GestureDetector(
      onTap: () => _selectAccount(email),
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1B4B),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF3730A3).withOpacity(0.5)),
          boxShadow: [BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 8, offset: const Offset(0, 3),
          )],
        ),
        child: Row(
          children: [
            // Google G 아이콘 배경
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(21),
              ),
              child: Center(child: _GoogleIcon()),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    email.split('@')[0],
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    email,
                    style: const TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFF6C63FF), size: 22),
          ],
        ),
      ),
    );
  }
}

// ── 구글 컬러 G 아이콘 ──
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
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 1;
    const sw = 3.5;

    canvas.drawArc(Rect.fromCircle(center: center, radius: radius),
        -1.57, 1.57, false,
        Paint()..color = const Color(0xFFEA4335)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius),
        0, 1.57, false,
        Paint()..color = const Color(0xFFFBBC05)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius),
        1.57, 1.57, false,
        Paint()..color = const Color(0xFF34A853)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius),
        3.14, 1.0, false,
        Paint()..color = const Color(0xFF4285F4)..strokeWidth = sw..style = PaintingStyle.stroke);
    canvas.drawLine(
      Offset(center.dx, center.dy),
      Offset(size.width - 1, center.dy),
      Paint()..color = const Color(0xFF4285F4)..strokeWidth = sw,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
