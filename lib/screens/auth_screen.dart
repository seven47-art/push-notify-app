// lib/screens/auth_screen.dart  v3 - Android AccountManager 기반 자동 로그인
// OAuth/SHA-1 설정 불필요 - 기기에 등록된 Google 계정을 직접 조회
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

// ── Android AccountManager MethodChannel ──
const _platform = MethodChannel('com.pushnotify/accounts');

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool           _isLoading  = false;
  String         _statusMsg  = '';
  bool           _hasError   = false;
  List<String>   _accounts   = [];   // 기기 Google 계정 목록
  bool           _showList   = false; // 계정 목록 표시 여부

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAccounts());
  }

  // ── 기기 Google 계정 목록 불러오기 ──
  Future<void> _loadAccounts() async {
    setState(() { _isLoading = true; _statusMsg = '계정 정보를 불러오는 중...'; _hasError = false; });

    try {
      final List<dynamic> result =
          await _platform.invokeMethod('getGoogleAccounts');
      final accounts = result.cast<String>();

      if (accounts.isEmpty) {
        // 계정 없음 → 시스템 선택창 바로 열기
        setState(() { _isLoading = false; _statusMsg = '기기에 Google 계정이 없습니다.\n설정에서 Google 계정을 추가해주세요.'; _hasError = true; });
        return;
      }

      if (accounts.length == 1) {
        // 계정 1개면 바로 로그인
        await _loginWithEmail(accounts[0]);
      } else {
        // 2개 이상이면 선택 목록 표시
        setState(() {
          _isLoading   = false;
          _accounts    = accounts;
          _showList    = true;
          _statusMsg   = '';
        });
      }
    } on PlatformException catch (e) {
      debugPrint('[Auth] AccountManager 오류: ${e.message}');
      setState(() {
        _isLoading = false;
        _statusMsg = '계정을 불러올 수 없습니다.\n(${e.message})';
        _hasError  = true;
      });
    } catch (e) {
      debugPrint('[Auth] 오류: $e');
      setState(() {
        _isLoading = false;
        _statusMsg = '오류가 발생했습니다. 다시 시도해주세요.';
        _hasError  = true;
      });
    }
  }

  // ── 서버에 이메일 로그인 요청 ──
  Future<void> _loginWithEmail(String email) async {
    setState(() {
      _isLoading = true;
      _showList  = false;
      _statusMsg = '$email\n로그인 중...';
      _hasError  = false;
    });

    try {
      final res = await http.post(
        Uri.parse('${kBaseUrl}/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email':        email,
          'display_name': email.split('@')[0],
          'google_id':    email, // OAuth ID 없이 이메일 사용
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;

      if (body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;

        // 토큰 영구 저장
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_email',    email);
        await prefs.setString('display_name',  data['display_name'] as String? ?? email.split('@')[0]);

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
      debugPrint('[Auth] 서버 오류: $e');
      setState(() {
        _isLoading = false;
        _statusMsg = '서버 연결 실패\n인터넷 연결을 확인해주세요.\n($e)';
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
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 40),

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
                    boxShadow: [BoxShadow(
                      color: const Color(0xFF6C63FF).withOpacity(0.5),
                      blurRadius: 30, offset: const Offset(0, 10),
                    )],
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

                const SizedBox(height: 48),

                // ── 로딩 ──
                if (_isLoading) ...[
                  const SizedBox(
                    width: 44, height: 44,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF6C63FF)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(_statusMsg,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 15, height: 1.6)),
                ]

                // ── 계정 목록 ──
                else if (_showList) ...[
                  const Text('계정을 선택하세요',
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  const Text('아래 계정으로 별도 회원가입 없이 로그인됩니다',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                  const SizedBox(height: 24),

                  // 계정 카드 목록
                  ...(_accounts.map((email) => _AccountCard(
                    email: email,
                    onTap: () => _loginWithEmail(email),
                  ))),
                ]

                // ── 오류/재시도 ──
                else ...[
                  if (_statusMsg.isNotEmpty)
                    _StatusBox(msg: _statusMsg, isError: _hasError),
                  const SizedBox(height: 20),
                  _RetryButton(onTap: _loadAccounts),
                ],

                const SizedBox(height: 40),

                const Text(
                  '기기에 로그인된 Google 계정을 사용합니다.\n별도 비밀번호가 필요 없습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF64748B), fontSize: 12, height: 1.7),
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── 계정 선택 카드 ──
class _AccountCard extends StatelessWidget {
  final String email;
  final VoidCallback onTap;
  const _AccountCard({required this.email, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = email.split('@')[0];
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1B4B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.3)),
        ),
        child: Row(
          children: [
            // 아바타
            Container(
              width: 46, height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                ),
              ),
              child: Center(
                child: Text(
                  name.substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text(email,
                    style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFF6C63FF)),
          ],
        ),
      ),
    );
  }
}

// ── 상태 메시지 박스 ──
class _StatusBox extends StatelessWidget {
  final String msg;
  final bool isError;
  const _StatusBox({required this.msg, required this.isError});

  @override
  Widget build(BuildContext context) {
    final color = isError ? const Color(0xFFEF4444) : const Color(0xFF22C55E);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(isError ? Icons.error_outline : Icons.check_circle_outline, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(msg,
              style: TextStyle(color: color, fontSize: 14, height: 1.5)),
          ),
        ],
      ),
    );
  }
}

// ── 재시도 버튼 ──
class _RetryButton extends StatelessWidget {
  final VoidCallback onTap;
  const _RetryButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
          ),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(
            color: const Color(0xFF6C63FF).withOpacity(0.4),
            blurRadius: 16, offset: const Offset(0, 6),
          )],
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.refresh, color: Colors.white, size: 20),
            SizedBox(width: 10),
            Text('다시 시도하기',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
