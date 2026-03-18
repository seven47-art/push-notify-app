// lib/screens/settings_screen.dart
// Phase 3: 설정 화면 — 다크테마, 로그아웃, 계정탈퇴, 약관/개인정보 연결
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import 'policy_screen.dart';

// ── 색상 상수 ──────────────────────────────────────────────
const _bg      = Color(0xFF121212);
const _bg2     = Color(0xFF1E1E2E);
const _bg3     = Color(0xFF2A2A3E);
const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF1DE9B6);
const _text    = Colors.white;
const _text2   = Color(0xFFB0B0C8);
const _text3   = Color(0xFF64748B);
const _border  = Color(0xFF3A3A55);
const _red     = Color(0xFFEF4444);

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _email       = '';
  String _displayName = '';
  String _userId      = '';
  bool   _isLoading   = true;

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
  }

  Future<void> _loadUserInfo() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _email       = prefs.getString('email') ?? prefs.getString('user_email') ?? '';
      _displayName = prefs.getString('display_name') ?? '';
      _userId      = prefs.getString('user_id') ?? '';
      _isLoading   = false;
    });
  }

  // ── 로그아웃 ──────────────────────────────────────────
  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('로그아웃', style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        content: const Text('로그아웃 하시겠습니까?', style: TextStyle(color: _text2)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('취소', style: TextStyle(color: _text3)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _primary),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('로그아웃', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      if (token.isNotEmpty) {
        await http.post(
          Uri.parse('$kBaseUrl/api/auth/logout'),
          headers: {'Authorization': 'Bearer $token'},
        ).timeout(const Duration(seconds: 10));
      }
    } catch (_) {}

    await _clearSession();
    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/auth', (_) => false);
    }
  }

  // ── 계정 탈퇴 ──────────────────────────────────────────
  Future<void> _deleteAccount() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('계정 탈퇴', style: TextStyle(color: _red, fontWeight: FontWeight.bold)),
        content: const Text(
          '정말 탈퇴하시겠습니까?\n\n내 채널, 구독 채널, 모든 정보가 삭제되며 복구할 수 없습니다.',
          style: TextStyle(color: _text2),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('취소', style: TextStyle(color: _text3)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('탈퇴', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      if (token.isNotEmpty) {
        await http.delete(
          Uri.parse('$kBaseUrl/api/users/me'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({'user_id': _userId, 'session_token': token}),
        ).timeout(const Duration(seconds: 10));
      }
    } catch (_) {}

    await _clearSession();
    if (mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/auth', (_) => false);
    }
  }

  Future<void> _clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  // ── FCM 토큰 복사 ──────────────────────────────────────
  Future<void> _copyUserId() async {
    if (_userId.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: _userId));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('사용자 ID가 복사됐습니다'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  // ── 약관/개인정보 화면 이동 ───────────────────────────
  void _openPolicy(String type) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PolicyScreen(type: type),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: _primary))
            : CustomScrollView(
                slivers: [
                  // ── 앱바 ──────────────────────────────────────
                  SliverAppBar(
                    backgroundColor: _bg2,
                    title: const Text(
                      '설정',
                      style: TextStyle(color: _text, fontWeight: FontWeight.bold),
                    ),
                    floating: true,
                    elevation: 0,
                    automaticallyImplyLeading: false,
                  ),

                  SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ── 계정 정보 카드 ──────────────────────
                        _buildAccountCard(),
                        const SizedBox(height: 20),

                        // ── 앱 정보 섹션 ────────────────────────
                        _sectionLabel('앱 정보'),
                        _buildMenuCard([
                          _menuItem(
                            icon: Icons.info_outline,
                            label: '앱 버전',
                            trailing: const Text('v3.7.0', style: TextStyle(color: _text3, fontSize: 13)),
                          ),
                          _divider(),
                          _menuItem(
                            icon: Icons.cloud_outlined,
                            label: 'API 서버',
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: Colors.green.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text('연결됨',
                                  style: TextStyle(color: Colors.green, fontSize: 12)),
                            ),
                          ),
                        ]),
                        const SizedBox(height: 20),

                        // ── 계정 섹션 ──────────────────────────
                        _sectionLabel('계정'),
                        _buildMenuCard([
                          _menuItem(
                            icon: Icons.badge_outlined,
                            label: '사용자 ID',
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _userId.length > 12
                                      ? '${_userId.substring(0, 12)}…'
                                      : _userId,
                                  style: const TextStyle(color: _text3, fontSize: 12),
                                ),
                                const SizedBox(width: 4),
                                const Icon(Icons.copy, size: 14, color: _text3),
                              ],
                            ),
                            onTap: _copyUserId,
                          ),
                        ]),
                        const SizedBox(height: 20),

                        // ── 약관 섹션 ──────────────────────────
                        _sectionLabel('약관 및 정책'),
                        _buildMenuCard([
                          _menuItem(
                            icon: Icons.description_outlined,
                            label: '서비스 이용약관',
                            onTap: () => _openPolicy('terms'),
                            showArrow: true,
                          ),
                          _divider(),
                          _menuItem(
                            icon: Icons.privacy_tip_outlined,
                            label: '개인정보 처리방침',
                            onTap: () => _openPolicy('privacy'),
                            showArrow: true,
                          ),
                        ]),
                        const SizedBox(height: 20),

                        // ── 로그아웃 / 탈퇴 섹션 ───────────────
                        _sectionLabel('계정 관리'),
                        _buildMenuCard([
                          _menuItem(
                            icon: Icons.logout,
                            label: '로그아웃',
                            labelColor: _primary,
                            onTap: _logout,
                            showArrow: true,
                          ),
                          _divider(),
                          _menuItem(
                            icon: Icons.delete_forever_outlined,
                            label: '계정 탈퇴',
                            labelColor: _red,
                            onTap: _deleteAccount,
                            showArrow: true,
                          ),
                        ]),

                        const SizedBox(height: 40),
                        const Center(
                          child: Text(
                            '© 2026 RinGo\n채널 기반 알람 서비스',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: _text3, fontSize: 12),
                          ),
                        ),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  // ── 계정 카드 ─────────────────────────────────────────
  Widget _buildAccountCard() {
    final initial = _displayName.isNotEmpty
        ? _displayName[0].toUpperCase()
        : (_email.isNotEmpty ? _email[0].toUpperCase() : 'U');

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF6C63FF), Color(0xFF8B7FFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 52, height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.25),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(initial,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _displayName.isNotEmpty ? _displayName : 'RinGo 사용자',
                  style: const TextStyle(
                      color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  _email.isNotEmpty ? _email : '이메일 없음',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── 공통 위젯 ─────────────────────────────────────────
  Widget _sectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 16, 8),
      child: Text(label,
          style: const TextStyle(
              color: _text3, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
    );
  }

  Widget _buildMenuCard(List<Widget> children) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: _bg2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
      ),
      child: Column(children: children),
    );
  }

  Widget _menuItem({
    required IconData icon,
    required String label,
    Color? labelColor,
    Widget? trailing,
    VoidCallback? onTap,
    bool showArrow = false,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: labelColor ?? _text2, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Text(label,
                  style: TextStyle(
                      color: labelColor ?? _text,
                      fontSize: 15,
                      fontWeight: FontWeight.w500)),
            ),
            if (trailing != null) trailing,
            if (showArrow && trailing == null)
              const Icon(Icons.chevron_right, color: _text3, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _divider() => Divider(height: 1, indent: 50, color: _border);
}
