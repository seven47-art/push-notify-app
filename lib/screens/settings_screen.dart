// lib/screens/settings_screen.dart
// 스크린샷 기준: 설정 타이틀 + 메뉴 섹션(모드선택/개인정보/서비스이용약관/버전) + 로그아웃/회원탈퇴
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/toast_helper.dart';
import 'policy_screen.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _bg      = Color(0xFFFFFFFF);
const _red     = Color(0xFFFF4444);

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = '';
  bool _isDark = false;

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    if (mounted) setState(() => _version = 'v3.5.0');
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('로그아웃'),
        content: const Text('로그아웃 하시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('로그아웃', style: TextStyle(color: _red)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    // FCM 토큰 서버 해제
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final fcmToken = prefs.getString('fcm_token') ?? '';
      if (fcmToken.isNotEmpty) {
        await http.post(
          Uri.parse('$kBaseUrl/api/fcm/unregister'),
          headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
          body: jsonEncode({'fcm_token': fcmToken}),
        ).timeout(const Duration(seconds: 5));
      }
    } catch (_) {}

    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil('/auth', (route) => false);
  }

  Future<void> _deleteAccount() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('회원 탈퇴'),
        content: const Text('회원 탈퇴 시 모든 데이터가 삭제됩니다.\n정말 탈퇴하시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('탈퇴', style: TextStyle(color: _red)),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final res = await http.delete(
        Uri.parse('$kBaseUrl/api/auth/delete'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        await prefs.clear();
        if (!mounted) return;
        Navigator.of(context).pushNamedAndRemoveUntil('/auth', (route) => false);
        return;
      }
    } catch (_) {}

    if (mounted) {
      showCenterToast(context, '탈퇴 처리 중 오류가 발생했습니다.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('설정', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // 섹션 라벨
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Text('메뉴', style: TextStyle(fontSize: 12, color: _text, fontWeight: FontWeight.w600)),
          ),
          // 모드 선택
          _SettingsRow(
            icon: Icons.dark_mode_outlined,
            iconColor: _primary,
            label: '모드 선택',
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('라이트', style: TextStyle(fontSize: 13, color: _isDark ? _text2 : _text)),
                const SizedBox(width: 8),
                Switch(
                  value: _isDark,
                  onChanged: (v) => setState(() => _isDark = v),
                  activeColor: _primary,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                const SizedBox(width: 4),
                Text('다크', style: TextStyle(fontSize: 13, color: _isDark ? _text : _text2)),
              ],
            ),
          ),
          const Divider(height: 1, indent: 56, color: _border),
          // 개인정보보호정책
          _SettingsRow(
            icon: Icons.shield_outlined,
            iconColor: _primary,
            label: '개인정보보호정책',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PolicyScreen(type: PolicyType.privacy)),
            ),
          ),
          const Divider(height: 1, indent: 56, color: _border),
          // 서비스 이용약관
          _SettingsRow(
            icon: Icons.description_outlined,
            iconColor: _primary,
            label: '서비스 이용약관',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PolicyScreen(type: PolicyType.terms)),
            ),
          ),
          const Divider(height: 1, indent: 56, color: _border),
          // 버전
          _SettingsRow(
            icon: Icons.info_outlined,
            iconColor: _primary,
            label: '버전',
            trailing: Text(_version, style: const TextStyle(fontSize: 13, color: _text2)),
          ),
          const SizedBox(height: 24),
          // 로그아웃 버튼
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('로그아웃'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _red,
                side: const BorderSide(color: Color(0xFFFFCDD2)),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          // 회원탈퇴 버튼
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: OutlinedButton.icon(
              onPressed: _deleteAccount,
              icon: const Icon(Icons.person_remove_outlined, size: 18),
              label: const Text('회원탈퇴'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _red,
                side: const BorderSide(color: Color(0xFFFFCDD2)),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: iconColor, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: const TextStyle(fontSize: 15, color: _text)),
            ),
            if (trailing != null) trailing!
            else if (onTap != null)
              const Icon(Icons.chevron_right, color: _text2, size: 20),
          ],
        ),
      ),
    );
  }
}
