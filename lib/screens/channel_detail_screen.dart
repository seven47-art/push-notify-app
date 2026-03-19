// lib/screens/channel_detail_screen.dart
// Phase 6-2: 채널 상세 화면 완전 재작성
// - 채널 정보 (이름, 이미지, 설명, 구독자수, 비밀채널 여부)
// - 운영자: 알람 예약(home_screen _AlarmSheet 활용), 채널 편집/삭제
// - 구독자: 채널 나가기 (DELETE /api/subscribers/leave)
// - 미가입자: 채널 가입 버튼 (POST /api/invites/join, 비밀채널 비번 확인)
// - 신고 바텀시트 (POST /api/reports)
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

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

const _avatarColors = [
  Color(0xFF6C63FF), Color(0xFF1DE9B6), Color(0xFFF59E0B),
  Color(0xFFEF4444), Color(0xFF3B82F6), Color(0xFF10B981),
];

class ChannelDetailScreen extends StatefulWidget {
  final int    channelId;
  final String channelName;

  const ChannelDetailScreen({
    super.key,
    required this.channelId,
    required this.channelName,
  });

  @override
  State<ChannelDetailScreen> createState() => _ChannelDetailScreenState();
}

class _ChannelDetailScreenState extends State<ChannelDetailScreen> {
  Map<String, dynamic>? _channel;
  bool   _loading      = true;
  String? _error;
  String _myUserId     = '';
  bool   _isOwner      = false;
  bool   _isSubscribed = false;
  bool   _actionLoading = false;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() { _loading = true; _error = null; });
    final prefs = await SharedPreferences.getInstance();
    _myUserId = prefs.getString('user_id') ?? '';
    final token = prefs.getString('session_token') ?? '';

    try {
      // 채널 정보
      final chRes = await http.get(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}'),
        headers: token.isNotEmpty ? {'Authorization': 'Bearer $token'} : {},
      ).timeout(const Duration(seconds: 15));

      if (!mounted) return;
      if (chRes.statusCode != 200) {
        setState(() { _loading = false; _error = '채널 정보를 불러올 수 없습니다'; });
        return;
      }
      final chBody = jsonDecode(chRes.body) as Map<String, dynamic>;
      final ch = chBody['data'] as Map<String, dynamic>? ?? {};

      // 구독 여부 확인
      bool subscribed = false;
      if (_myUserId.isNotEmpty) {
        try {
          final subRes = await http.get(
            Uri.parse('$kBaseUrl/api/subscribers?user_id=${Uri.encodeComponent(_myUserId)}&channel_id=${widget.channelId}'),
            headers: token.isNotEmpty ? {'Authorization': 'Bearer $token'} : {},
          ).timeout(const Duration(seconds: 10));
          if (subRes.statusCode == 200) {
            final subBody = jsonDecode(subRes.body) as Map<String, dynamic>;
            final list = subBody['data'] as List? ?? [];
            subscribed = list.any((s) =>
                s['channel_id'] == widget.channelId ||
                s['channel_id'].toString() == widget.channelId.toString());
          }
        } catch (_) {}
      }

      if (mounted) {
        setState(() {
          _channel      = ch;
          _isOwner      = ch['owner_id']?.toString() == _myUserId;
          _isSubscribed = subscribed;
          _loading      = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '연결 실패'; });
    }
  }

  // ── 채널 가입 ─────────────────────────────────────────
  Future<void> _joinChannel() async {
    final ch = _channel;
    if (ch == null) return;
    final isSecret = ch['is_secret'] == true || ch['is_secret'] == 1;

    // 비밀채널이면 비밀번호 확인
    if (isSecret) {
      final pw = await _promptPassword();
      if (pw == null || pw.isEmpty) return;
      final ok = await _verifyPassword(pw);
      if (!ok) return;
    }

    setState(() => _actionLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = _myUserId;
      final fcmToken = prefs.getString('fcm_token') ?? '';

      // 활성 초대 토큰 조회
      final invRes = await http.get(
        Uri.parse('$kBaseUrl/api/invites?channel_id=${widget.channelId}'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      final invBody = jsonDecode(invRes.body) as Map<String, dynamic>;
      final invList = invBody['data'] as List? ?? [];
      final now = DateTime.now();
      final active = invList.firstWhere(
        (l) => l['is_active'] == true &&
               (l['expires_at'] == null || DateTime.tryParse(l['expires_at'].toString())?.isAfter(now) == true),
        orElse: () => null,
      );

      String? inviteToken;
      if (active != null) {
        inviteToken = active['invite_token']?.toString();
      } else {
        // 초대링크 생성
        final crRes = await http.post(
          Uri.parse('$kBaseUrl/api/invites'),
          headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
          body: jsonEncode({'channel_id': widget.channelId, 'created_by': userId}),
        ).timeout(const Duration(seconds: 10));
        final crBody = jsonDecode(crRes.body) as Map<String, dynamic>;
        inviteToken = crBody['data']?['invite_token']?.toString();
      }

      if (inviteToken == null || inviteToken.isEmpty) {
        _showToast('참여 링크를 만들 수 없습니다');
        setState(() => _actionLoading = false);
        return;
      }

      // 가입
      final joinRes = await http.post(
        Uri.parse('$kBaseUrl/api/invites/join'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({
          'invite_token': inviteToken,
          'user_id':      userId,
          'fcm_token':    fcmToken,
          'platform':     'android',
        }),
      ).timeout(const Duration(seconds: 15));
      final joinBody = jsonDecode(joinRes.body) as Map<String, dynamic>;

      if (joinBody['success'] == true) {
        _showToast('채널에 참여했습니다! 🎉');
        await _loadAll();
      } else {
        _showToast(joinBody['error']?.toString() ?? '참여 실패');
      }
    } catch (e) {
      _showToast('오류: $e');
    }
    if (mounted) setState(() => _actionLoading = false);
  }

  // ── 채널 나가기 ────────────────────────────────────────
  Future<void> _leaveChannel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('채널 나가기', style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        content: Text('"${_channel?['name']}" 채널에서 나가시겠습니까?\n나가면 더 이상 알림을 받을 수 없습니다.',
            style: const TextStyle(color: _text2)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false),
              child: const Text('취소', style: TextStyle(color: _text3))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('나가기', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _actionLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final res = await http.delete(
        Uri.parse('$kBaseUrl/api/subscribers/leave?user_id=${Uri.encodeComponent(_myUserId)}&channel_id=${widget.channelId}'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] == true) {
        _showToast('채널에서 나갔습니다');
        if (mounted) Navigator.of(context).pop(true);
      } else {
        _showToast(body['error']?.toString() ?? '나가기 실패');
      }
    } catch (_) { _showToast('오류가 발생했습니다'); }
    if (mounted) setState(() => _actionLoading = false);
  }

  // ── 비밀채널 비밀번호 확인 ─────────────────────────────
  Future<String?> _promptPassword() async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: _bg2,
        title: const Text('비밀 채널', style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('이 채널은 비밀 채널입니다.\n비밀번호를 입력하세요.',
                style: TextStyle(color: _text2)),
            const SizedBox(height: 14),
            TextField(
              controller: ctrl,
              obscureText: true,
              style: const TextStyle(color: _text),
              decoration: InputDecoration(
                hintText: '비밀번호',
                hintStyle: const TextStyle(color: _text3),
                filled: true, fillColor: _bg3,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
                prefixIcon: const Icon(Icons.lock, color: _primary),
              ),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context),
              child: const Text('취소', style: TextStyle(color: _text3))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _primary),
            onPressed: () => Navigator.pop(context, ctrl.text),
            child: const Text('확인', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<bool> _verifyPassword(String pw) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}/verify-password'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({'password': pw}),
      ).timeout(const Duration(seconds: 10));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] == true) return true;
      _showToast(body['error']?.toString() ?? '비밀번호가 올바르지 않습니다');
      return false;
    } catch (_) {
      _showToast('확인 실패');
      return false;
    }
  }

  // ── 신고 바텀시트 ─────────────────────────────────────
  void _openReport() {
    final reasons = [
      '불법 광고 / 스팸', '사기 / 피싱', '음란 / 선정적 콘텐츠',
      '괴롭힘 / 혐오', '저작권 / 도용 의심', '기타',
    ];
    String? selected;
    final descCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setSheet) => DraggableScrollableSheet(
          initialChildSize: 0.75,
          maxChildSize: 0.92,
          minChildSize: 0.5,
          builder: (_, controller) => Container(
            decoration: const BoxDecoration(
              color: _bg,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: [
                // 핸들
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: _border, borderRadius: BorderRadius.circular(2)),
                ),
                // 헤더
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text('신고하기',
                            style: TextStyle(
                                color: _text, fontSize: 17, fontWeight: FontWeight.bold)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: _text2),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    controller: controller,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      const Text('신고 사유 선택',
                          style: TextStyle(color: _text3, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      ...reasons.map((r) => RadioListTile<String>(
                        value: r, groupValue: selected,
                        onChanged: (v) => setSheet(() => selected = v),
                        title: Text(r, style: const TextStyle(color: _text, fontSize: 14)),
                        activeColor: _red,
                        contentPadding: EdgeInsets.zero,
                      )),
                      const SizedBox(height: 8),
                      const Text('추가 설명 (선택)',
                          style: TextStyle(color: _text3, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      TextField(
                        controller: descCtrl,
                        maxLines: 3,
                        maxLength: 300,
                        style: const TextStyle(color: _text),
                        decoration: InputDecoration(
                          hintText: '구체적인 내용을 입력해 주세요 (선택)',
                          hintStyle: const TextStyle(color: _text3),
                          filled: true, fillColor: _bg2,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: _border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: _border),
                          ),
                          counterStyle: const TextStyle(color: _text3),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: selected != null ? _red : _bg3,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: selected == null
                              ? null
                              : () async {
                                  Navigator.pop(ctx);
                                  await _submitReport(selected!, descCtrl.text.trim());
                                },
                          child: Text('신고하기',
                              style: TextStyle(
                                  color: selected != null ? Colors.white : _text3,
                                  fontSize: 16, fontWeight: FontWeight.bold)),
                        ),
                      ),
                      const SizedBox(height: 20),
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

  Future<void> _submitReport(String reason, String desc) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final ch    = _channel ?? {};
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/reports'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({
          'report_type':      'channel',
          'reason':           reason,
          'description':      desc,
          'channel_id':       widget.channelId,
          'channel_name':     ch['name'] ?? widget.channelName,
          'target_user_id':   ch['owner_id'] ?? '',
          'target_user_name': ch['owner_id'] ?? '',
        }),
      ).timeout(const Duration(seconds: 15));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] == true) {
        _showToast('✅ 신고가 접수되었습니다. 검토 후 조치하겠습니다.');
      } else {
        _showToast(body['error']?.toString() ?? '신고 접수 실패');
      }
    } catch (e) { _showToast('오류: $e'); }
  }

  void _showToast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 3)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg2,
        title: Text(
          _channel?['name']?.toString() ?? widget.channelName,
          style: const TextStyle(color: _text, fontWeight: FontWeight.bold),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          if (!_loading && _channel != null && !_isOwner)
            IconButton(
              icon: const Icon(Icons.flag_outlined, color: _text3),
              tooltip: '신고',
              onPressed: _openReport,
            ),
        ],
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? _buildError()
              : _buildDetail(),
    );
  }

  Widget _buildDetail() {
    final ch = _channel!;
    final name       = ch['name']?.toString() ?? widget.channelName;
    final imageUrl   = ch['image_url']?.toString() ?? '';
    final desc       = ch['description']?.toString() ?? '';
    final subCnt     = ch['subscriber_count'] ?? 0;
    final isSecret   = ch['is_secret'] == true || ch['is_secret'] == 1;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 채널 헤더 ──────────────────────────────────
          Row(
            children: [
              _buildAvatar(name, imageUrl, 72),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(name,
                              style: const TextStyle(
                                  color: _text, fontSize: 20, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis),
                        ),
                        if (isSecret) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.lock, color: _red, size: 16),
                        ],
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(Icons.people_outline, color: _text3, size: 15),
                        const SizedBox(width: 4),
                        Text('$subCnt명 구독 중',
                            style: const TextStyle(color: _text3, fontSize: 13)),
                        if (_isOwner) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: _primary.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text('운영자',
                                style: TextStyle(color: _primary, fontSize: 11, fontWeight: FontWeight.w600)),
                          ),
                        ],
                        if (_isSubscribed && !_isOwner) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: _teal.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text('구독 중',
                                style: TextStyle(color: _teal, fontSize: 11, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          // ── 채널 설명 ──────────────────────────────────
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: _bg2,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _border),
              ),
              child: Text(desc,
                  style: const TextStyle(color: _text2, fontSize: 14, height: 1.6)),
            ),
          ],

          const SizedBox(height: 24),

          // ── 액션 버튼 ──────────────────────────────────
          if (_actionLoading)
            const Center(child: CircularProgressIndicator(color: _primary))
          else if (_isOwner)
            _buildOwnerActions()
          else if (_isSubscribed)
            _buildSubscriberActions()
          else
            _buildGuestActions(),
        ],
      ),
    );
  }

  // ── 운영자 액션 ───────────────────────────────────────
  Widget _buildOwnerActions() {
    return Column(
      children: [
        _actionBtn(
          icon: Icons.notifications_active_outlined,
          label: '알람 발송',
          color: _primary,
          onTap: () => _showToast('알람 발송은 내 채널 탭에서 이용해주세요'),
        ),
        const SizedBox(height: 12),
        _actionBtn(
          icon: Icons.share_outlined,
          label: '초대 링크 공유',
          color: _teal,
          onTap: () => _showToast('초대 링크 공유는 내 채널 탭에서 이용해주세요'),
        ),
      ],
    );
  }

  // ── 구독자 액션 ───────────────────────────────────────
  Widget _buildSubscriberActions() {
    return _actionBtn(
      icon: Icons.exit_to_app_outlined,
      label: '채널 나가기',
      color: _red,
      outline: true,
      onTap: _leaveChannel,
    );
  }

  // ── 미가입 액션 ───────────────────────────────────────
  Widget _buildGuestActions() {
    return _actionBtn(
      icon: Icons.add_circle_outline,
      label: '채널 참여',
      color: _primary,
      onTap: _joinChannel,
    );
  }

  Widget _actionBtn({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
    bool outline = false,
  }) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        style: ElevatedButton.styleFrom(
          backgroundColor: outline ? Colors.transparent : color,
          foregroundColor: outline ? color : Colors.white,
          side: outline ? BorderSide(color: color, width: 1.5) : BorderSide.none,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
        icon: Icon(icon, size: 20),
        label: Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        onPressed: onTap,
      ),
    );
  }

  Widget _buildAvatar(String name, String imageUrl, double size) {
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'C';
    final color   = _avatarColors[name.codeUnitAt(0) % _avatarColors.length];
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: imageUrl.isNotEmpty
          ? Image.network(imageUrl, fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Center(
                child: Text(initial,
                    style: TextStyle(color: color,
                        fontWeight: FontWeight.bold, fontSize: size * 0.4))))
          : Center(
              child: Text(initial,
                  style: TextStyle(color: color,
                      fontWeight: FontWeight.bold, fontSize: size * 0.4))),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 56, color: _red),
          const SizedBox(height: 12),
          Text(_error ?? '', style: const TextStyle(color: _text2, fontSize: 14)),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: _primary, foregroundColor: Colors.white),
            icon: const Icon(Icons.refresh),
            label: const Text('다시 시도'),
            onPressed: _loadAll,
          ),
        ],
      ),
    );
  }
}
