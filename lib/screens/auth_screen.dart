// lib/screens/auth_screen.dart  v4
// 이메일 직접 입력 → 아이디로 사용 (비밀번호 없음)
// 한 번 입력하면 영구 로그인 유지
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _emailCtrl = TextEditingController();
  bool   _isLoading = false;
  String _errorMsg  = '';

  // 힌트 이메일 목록 (Android AccountManager로 시도)
  List<String> _hintEmails = [];

  static const _platform = MethodChannel('com.pushnotify/accounts');

  @override
  void initState() {
    super.initState();
    _tryLoadHints();
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  // 기기 계정 힌트 시도 (실패해도 괜찮음)
  Future<void> _tryLoadHints() async {
    try {
      final List<dynamic> result =
          await _platform.invokeMethod('getGoogleAccounts');
      final emails = result.cast<String>();
      if (emails.isNotEmpty && mounted) {
        setState(() => _hintEmails = emails);
        // 계정이 1개면 자동으로 입력란에 채워줌
        if (emails.length == 1) {
          _emailCtrl.text = emails[0];
        }
      }
    } catch (_) {
      // 읽기 실패해도 무시 - 직접 입력으로 진행
    }
  }

  // 로그인 (이메일 = 아이디, 비밀번호 없음)
  Future<void> _login() async {
    final email = _emailCtrl.text.trim().toLowerCase();
    if (email.isEmpty) {
      setState(() => _errorMsg = '이메일을 입력해주세요');
      return;
    }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _errorMsg = '올바른 이메일 형식이 아닙니다');
      return;
    }

    setState(() { _isLoading = true; _errorMsg = ''; });
    try {
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email':        email,
          'display_name': email.split('@')[0],
          'google_id':    email,
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token'] as String);
        await prefs.setString('user_email', email);
        await prefs.setString('display_name',
            data['display_name'] as String? ?? email.split('@')[0]);
        if (mounted) Navigator.of(context).pushReplacementNamed('/main');
      } else {
        setState(() {
          _isLoading = false;
          _errorMsg  = body['error'] as String? ?? '로그인 실패';
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMsg  = '서버 연결 실패. 인터넷을 확인해주세요.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 60),

              // ── 앱 로고 ──
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 88, height: 88,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                          begin: Alignment.topLeft, end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [BoxShadow(
                          color: const Color(0xFF6C63FF).withOpacity(0.5),
                          blurRadius: 28, offset: const Offset(0, 10),
                        )],
                      ),
                      child: const Icon(Icons.notifications_active,
                          color: Colors.white, size: 46),
                    ),
                    const SizedBox(height: 16),
                    const Text('PushNotify',
                      style: TextStyle(color: Colors.white, fontSize: 28,
                        fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    const Text('채널 알람 구독 서비스',
                      style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14)),
                  ],
                ),
              ),

              const SizedBox(height: 52),

              // ── 안내 텍스트 ──
              const Text('이메일 주소 입력',
                style: TextStyle(color: Colors.white, fontSize: 20,
                  fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              const Text('이메일이 아이디로 사용됩니다.\n비밀번호는 필요하지 않습니다.',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13,
                  height: 1.6)),

              const SizedBox(height: 28),

              // ── 힌트 이메일 칩 (있을 때만) ──
              if (_hintEmails.isNotEmpty) ...[
                const Text('기기 계정',
                  style: TextStyle(color: Color(0xFF6C63FF), fontSize: 12,
                    fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8, runSpacing: 8,
                  children: _hintEmails.map((e) => GestureDetector(
                    onTap: () {
                      _emailCtrl.text = e;
                      _emailCtrl.selection = TextSelection.fromPosition(
                        TextPosition(offset: e.length));
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1B4B),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: const Color(0xFF6C63FF).withOpacity(0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.account_circle_outlined,
                              color: Color(0xFF6C63FF), size: 16),
                          const SizedBox(width: 6),
                          Text(e,
                            style: const TextStyle(
                                color: Colors.white, fontSize: 13)),
                        ],
                      ),
                    ),
                  )).toList(),
                ),
                const SizedBox(height: 20),
              ],

              // ── 이메일 입력란 ──
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1740),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _errorMsg.isNotEmpty
                        ? const Color(0xFFEF4444).withOpacity(0.6)
                        : const Color(0xFF6C63FF).withOpacity(0.3),
                  ),
                ),
                child: TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _login(),
                  autofocus: _hintEmails.isEmpty,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                  decoration: InputDecoration(
                    hintText: 'example@gmail.com',
                    hintStyle: const TextStyle(color: Color(0xFF4B5563)),
                    prefixIcon: const Icon(Icons.email_outlined,
                        color: Color(0xFF6C63FF), size: 22),
                    suffixIcon: _emailCtrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear,
                                color: Color(0xFF6B7280), size: 18),
                            onPressed: () {
                              _emailCtrl.clear();
                              setState(() => _errorMsg = '');
                            },
                          )
                        : null,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 16),
                  ),
                  onChanged: (_) => setState(() => _errorMsg = ''),
                ),
              ),

              // ── 오류 메시지 ──
              if (_errorMsg.isNotEmpty) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: Color(0xFFEF4444), size: 16),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(_errorMsg,
                        style: const TextStyle(
                            color: Color(0xFFEF4444), fontSize: 13)),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 28),

              // ── 시작하기 버튼 ──
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _login,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                    padding: EdgeInsets.zero,
                  ),
                  child: Ink(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Container(
                      alignment: Alignment.center,
                      child: _isLoading
                          ? const SizedBox(
                              width: 22, height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                valueColor: AlwaysStoppedAnimation(Colors.white),
                              ))
                          : const Text('시작하기',
                              style: TextStyle(color: Colors.white,
                                  fontSize: 17, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 32),

              // ── 안내 ──
              Center(
                child: Text(
                  '입력한 이메일이 계정 아이디로 사용됩니다.\n한 번 로그인하면 앱을 다시 열어도 자동으로 로그인됩니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withOpacity(0.3),
                      fontSize: 12, height: 1.7),
                ),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
