// lib/screens/auth_screen.dart
// 이메일 기반 회원가입 / 로그인 화면
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const String _baseUrl =
    'https://3000-innmpvejrl9mjla0aavux-c07dda5e.sandbox.novita.ai';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // 로그인 컨트롤러
  final _loginEmailCtrl    = TextEditingController();
  final _loginPassCtrl     = TextEditingController();

  // 회원가입 컨트롤러
  final _regEmailCtrl      = TextEditingController();
  final _regPassCtrl       = TextEditingController();
  final _regPassConfirmCtrl= TextEditingController();
  final _regNameCtrl       = TextEditingController();

  bool _loginPassHide  = true;
  bool _regPassHide    = true;
  bool _regPass2Hide   = true;
  bool _loading        = false;
  String _error        = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() => setState(() => _error = ''));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _loginEmailCtrl.dispose();
    _loginPassCtrl.dispose();
    _regEmailCtrl.dispose();
    _regPassCtrl.dispose();
    _regPassConfirmCtrl.dispose();
    _regNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _loginEmailCtrl.text.trim();
    final pass  = _loginPassCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = '이메일과 비밀번호를 입력해주세요');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': pass}),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200 && body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token']);
        await prefs.setString('user_id',       data['user_id']);
        await prefs.setString('email',          data['email']);
        await prefs.setString('display_name',   data['display_name'] ?? '');
        if (mounted) {
          Navigator.of(context).pushReplacementNamed('/main');
        }
      } else {
        setState(() => _error = body['error'] ?? '로그인에 실패했습니다');
      }
    } catch (e) {
      setState(() => _error = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _register() async {
    final email = _regEmailCtrl.text.trim();
    final pass  = _regPassCtrl.text;
    final pass2 = _regPassConfirmCtrl.text;
    final name  = _regNameCtrl.text.trim();

    if (email.isEmpty || pass.isEmpty) {
      setState(() => _error = '이메일과 비밀번호를 입력해주세요');
      return;
    }
    if (pass != pass2) {
      setState(() => _error = '비밀번호가 일치하지 않습니다');
      return;
    }
    if (pass.length < 6) {
      setState(() => _error = '비밀번호는 6자 이상이어야 합니다');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email,
          'password': pass,
          'display_name': name.isEmpty ? null : name,
        }),
      ).timeout(const Duration(seconds: 15));

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if ((res.statusCode == 200 || res.statusCode == 201) && body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_token', data['session_token']);
        await prefs.setString('user_id',       data['user_id']);
        await prefs.setString('email',          data['email']);
        await prefs.setString('display_name',   data['display_name'] ?? '');
        if (mounted) {
          Navigator.of(context).pushReplacementNamed('/main');
        }
      } else {
        setState(() => _error = body['error'] ?? '회원가입에 실패했습니다');
      }
    } catch (e) {
      setState(() => _error = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
            child: Column(
              children: [
                const SizedBox(height: 20),
                // ── 앱 로고 ──
                _buildLogo(),
                const SizedBox(height: 36),
                // ── 탭 바 ──
                _buildTabBar(),
                const SizedBox(height: 24),
                // ── 에러 메시지 ──
                if (_error.isNotEmpty) _buildError(),
                // ── 탭 콘텐츠 ──
                SizedBox(
                  height: 420,
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildLoginForm(),
                      _buildRegisterForm(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Column(
      children: [
        Container(
          width: 80, height: 80,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFFF6B35), Color(0xFFFF2D92)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFF6B35).withOpacity(0.45),
                blurRadius: 24, offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(Icons.alarm, color: Colors.white, size: 42),
        ),
        const SizedBox(height: 14),
        const Text('PushNotify',
          style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
        const SizedBox(height: 4),
        const Text('채널 알림 구독 서비스',
          style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
      ],
    );
  }

  Widget _buildTabBar() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1E1B4B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.2)),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        labelColor: Colors.white,
        unselectedLabelColor: const Color(0xFF94A3B8),
        labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        dividerColor: Colors.transparent,
        tabs: const [
          Tab(text: '로그인'),
          Tab(text: '회원가입'),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF450A0A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Color(0xFFF87171), size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(_error,
            style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13))),
        ],
      ),
    );
  }

  Widget _buildLoginForm() {
    return Column(
      children: [
        _buildTextField(
          controller: _loginEmailCtrl,
          label: '이메일',
          hint: 'example@email.com',
          icon: Icons.email_outlined,
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 14),
        _buildTextField(
          controller: _loginPassCtrl,
          label: '비밀번호',
          hint: '비밀번호 입력',
          icon: Icons.lock_outline,
          obscure: _loginPassHide,
          suffixIcon: IconButton(
            icon: Icon(_loginPassHide ? Icons.visibility_off_outlined : Icons.visibility_outlined,
              color: const Color(0xFF64748B), size: 20),
            onPressed: () => setState(() => _loginPassHide = !_loginPassHide),
          ),
        ),
        const SizedBox(height: 28),
        _buildSubmitButton(label: '로그인', onTap: _login),
      ],
    );
  }

  Widget _buildRegisterForm() {
    return Column(
      children: [
        _buildTextField(
          controller: _regNameCtrl,
          label: '닉네임 (선택)',
          hint: '표시될 이름',
          icon: Icons.person_outline,
        ),
        const SizedBox(height: 12),
        _buildTextField(
          controller: _regEmailCtrl,
          label: '이메일',
          hint: 'example@email.com',
          icon: Icons.email_outlined,
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 12),
        _buildTextField(
          controller: _regPassCtrl,
          label: '비밀번호 (6자 이상)',
          hint: '비밀번호 입력',
          icon: Icons.lock_outline,
          obscure: _regPassHide,
          suffixIcon: IconButton(
            icon: Icon(_regPassHide ? Icons.visibility_off_outlined : Icons.visibility_outlined,
              color: const Color(0xFF64748B), size: 20),
            onPressed: () => setState(() => _regPassHide = !_regPassHide),
          ),
        ),
        const SizedBox(height: 12),
        _buildTextField(
          controller: _regPassConfirmCtrl,
          label: '비밀번호 확인',
          hint: '비밀번호 재입력',
          icon: Icons.lock_outline,
          obscure: _regPass2Hide,
          suffixIcon: IconButton(
            icon: Icon(_regPass2Hide ? Icons.visibility_off_outlined : Icons.visibility_outlined,
              color: const Color(0xFF64748B), size: 20),
            onPressed: () => setState(() => _regPass2Hide = !_regPass2Hide),
          ),
        ),
        const SizedBox(height: 20),
        _buildSubmitButton(label: '회원가입', onTap: _register),
      ],
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool obscure = false,
    Widget? suffixIcon,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(
          color: Color(0xFFCBD5E1), fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1E1B4B),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF6366F1).withOpacity(0.2)),
          ),
          child: TextField(
            controller: controller,
            obscureText: obscure,
            keyboardType: keyboardType,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 14),
              prefixIcon: Icon(icon, color: const Color(0xFF6366F1), size: 20),
              suffixIcon: suffixIcon,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
            onSubmitted: (_) {
              if (_tabController.index == 0) _login();
              else _register();
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSubmitButton({required String label, required VoidCallback onTap}) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: ElevatedButton(
        onPressed: _loading ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          padding: EdgeInsets.zero,
        ),
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFFF6B35), Color(0xFFFF2D92)],
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFFFF6B35).withOpacity(0.4),
                blurRadius: 16, offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Center(
            child: _loading
              ? const SizedBox(width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
              : Text(label,
                  style: const TextStyle(color: Colors.white, fontSize: 16,
                    fontWeight: FontWeight.w800, letterSpacing: 0.3)),
          ),
        ),
      ),
    );
  }
}
