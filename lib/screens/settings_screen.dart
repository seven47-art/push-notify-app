// lib/screens/settings_screen.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _userId = '';
  String _fcmToken = '';
  bool _notificationsEnabled = true;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    _userId = await ApiService.getUserId();
    _fcmToken = await ApiService.getFcmToken();
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _notificationsEnabled = prefs.getBool('notifications_enabled') ?? true;
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleNotifications(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notifications_enabled', value);
    setState(() => _notificationsEnabled = value);
  }

  void _showFcmTokenDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('FCM 토큰'),
        content: SingleChildScrollView(
          child: SelectableText(
            _fcmToken,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('닫기'),
          ),
        ],
      ),
    );
  }

  Future<void> _resetUserId() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('기기 초기화'),
        content: const Text('모든 구독 정보와 사용자 ID가 초기화됩니다.\n계속하시겠습니까?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('초기화', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.clear();
      await _loadSettings();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('초기화 완료')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FE),
      appBar: AppBar(
        title: const Text('설정'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // 앱 버전 카드
                _buildAppInfoCard(),
                const SizedBox(height: 16),

                // 알림 설정
                _buildSectionTitle('알림 설정'),
                _buildSettingsCard([
                  SwitchListTile(
                    title: const Text('푸시 알림 받기'),
                    subtitle: const Text('채널에서 새 콘텐츠 알림을 받습니다'),
                    value: _notificationsEnabled,
                    onChanged: _toggleNotifications,
                    activeColor: const Color(0xFF6C63FF),
                  ),
                ]),
                const SizedBox(height: 16),

                // 기기 정보
                _buildSectionTitle('기기 정보'),
                _buildSettingsCard([
                  ListTile(
                    leading: const Icon(Icons.person_outline, color: Color(0xFF6C63FF)),
                    title: const Text('사용자 ID'),
                    subtitle: Text(
                      _userId,
                      style: const TextStyle(fontSize: 12),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Divider(height: 1, indent: 16),
                  ListTile(
                    leading: const Icon(Icons.token, color: Color(0xFF6C63FF)),
                    title: const Text('FCM 토큰'),
                    subtitle: Text(
                      _fcmToken.length > 30
                          ? '${_fcmToken.substring(0, 30)}...'
                          : _fcmToken,
                      style: const TextStyle(fontSize: 12),
                    ),
                    onTap: _showFcmTokenDialog,
                    trailing: const Icon(Icons.copy, size: 16, color: Colors.grey),
                  ),
                ]),
                const SizedBox(height: 16),

                // 서버 정보
                _buildSectionTitle('서버 연결'),
                _buildSettingsCard([
                  ListTile(
                    leading: const Icon(Icons.cloud, color: Color(0xFF6C63FF)),
                    title: const Text('API 서버'),
                    subtitle: const Text(
                      'Cloudflare Workers / D1 Database',
                      style: TextStyle(fontSize: 12),
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF4CAF50).withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        '연결됨',
                        style: TextStyle(color: Color(0xFF4CAF50), fontSize: 12),
                      ),
                    ),
                  ),
                ]),
                const SizedBox(height: 16),

                // 위험 구역
                _buildSectionTitle('관리'),
                _buildSettingsCard([
                  ListTile(
                    leading: const Icon(Icons.delete_forever, color: Colors.red),
                    title: const Text(
                      '기기 초기화',
                      style: TextStyle(color: Colors.red),
                    ),
                    subtitle: const Text('모든 구독 정보 삭제'),
                    onTap: _resetUserId,
                  ),
                ]),

                const SizedBox(height: 40),
                const Center(
                  child: Text(
                    'PushNotify v1.0.0\n© 2026 PushNotify',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildAppInfoCard() {
    return Container(
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
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.notifications_active,
              color: Colors.white,
              size: 32,
            ),
          ),
          const SizedBox(width: 16),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PushNotify',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
              Text(
                '폐쇄형 채널 알림 앱 v1.0.0',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.grey,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildSettingsCard(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}
