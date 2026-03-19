// lib/screens/channel_detail_screen.dart
// 스크린샷 기준:
//   운영자 뷰: 채널헤더(이미지/이름/ID/멤버수) + 알람⏰/공유📤/편집✏️/삭제🗑️ 버튼 + 채널소개 + 홈페이지
//   구독자 뷰: 채널헤더 + 공유📤/신고🚩/나가기🚪 버튼 + 채널소개 + 홈페이지
//   초대코드 바텀시트 / 알람설정 바텀시트 / 채널설정 바텀시트 / 신고 바텀시트
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../utils/image_helper.dart';
import 'alarm_schedule_screen.dart';

const _primary  = Color(0xFF6C63FF);
const _teal     = Color(0xFF00BCD4);
const _text     = Color(0xFF222222);
const _text2    = Color(0xFF555555);
const _border   = Color(0xFFDDDDDD);
const _bg       = Color(0xFFFFFFFF);
const _red      = Color(0xFFFF4444);

class ChannelDetailScreen extends StatefulWidget {
  final String channelId;
  final bool isOwner;
  const ChannelDetailScreen({super.key, required this.channelId, required this.isOwner});

  @override
  State<ChannelDetailScreen> createState() => _ChannelDetailScreenState();
}

class _ChannelDetailScreenState extends State<ChannelDetailScreen> {
  Map<String, dynamic>? _channel;
  bool _loading = true;
  String _token = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('session_token') ?? '';
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && mounted) {
          setState(() {
            _channel = body['data'] as Map<String, dynamic>?;
            _loading = false;
          });
          return;
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _deleteChannel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('채널 삭제'),
        content: const Text('채널을 삭제하면 복구할 수 없습니다.\n정말 삭제하시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('삭제', style: TextStyle(color: _red)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await http.delete(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
    if (mounted) Navigator.pop(context);
  }

  Future<void> _leaveChannel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('채널 나가기'),
        content: const Text('이 채널에서 나가시겠습니까?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('나가기', style: TextStyle(color: _red)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await http.delete(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}/leave'),
        headers: {'Authorization': 'Bearer $_token'},
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
    if (mounted) Navigator.pop(context);
  }

  void _shareChannel() {
    final name = _channel?['name'] ?? '';
    final inviteLink = _channel?['invite_link'] ?? 'https://ringo.run/join/${widget.channelId}';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _InviteCodeSheet(channelName: name.toString(), inviteLink: inviteLink.toString()),
    );
  }

  void _openAlarmSchedule() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AlarmScheduleSheet(channelId: widget.channelId, channelName: _channel?['name']?.toString() ?? ''),
    );
  }

  void _openChannelSettings() {
    if (_channel == null) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ChannelSettingsSheet(channel: _channel!, token: _token, onSaved: _load),
    );
  }

  void _openReport() {
    final name = _channel?['name'] ?? '';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReportSheet(channelId: widget.channelId, channelName: name.toString(), token: _token),
    );
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
        title: const Text('채널 소개', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _channel == null
              ? const Center(child: Text('채널 정보를 불러올 수 없습니다.', style: TextStyle(color: _text2)))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final ch         = _channel!;
    final name       = ch['name']?.toString() ?? '';
    final userId     = ch['user_id']?.toString() ?? ch['owner_id']?.toString() ?? '';
    final memberCount = ch['member_count'] ?? ch['subscriber_count'] ?? 0;
    final description = ch['description']?.toString() ?? '';
    final homepage   = ch['homepage']?.toString() ?? ch['website']?.toString() ?? '';
    final imageUrl   = ch['image_url']?.toString();

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 채널 헤더 ──
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 채널 아바타
                channelAvatar(
                  imageUrl: imageUrl,
                  name: name,
                  size: 64,
                  bgColor: _primary,
                  borderRadius: 14,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.person_outline, size: 13, color: _text2),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(userId, style: const TextStyle(fontSize: 12, color: _text2), overflow: TextOverflow.ellipsis),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.group, size: 14, color: _text2),
                          const SizedBox(width: 3),
                          Text('$memberCount명', style: const TextStyle(fontSize: 12, color: _text2)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // ── 액션 버튼 ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: widget.isOwner
                  ? [
                      _ActionBtn(icon: Icons.alarm, onTap: _openAlarmSchedule),
                      const SizedBox(width: 8),
                      _ActionBtn(icon: Icons.share_outlined, onTap: _shareChannel),
                      const SizedBox(width: 8),
                      _ActionBtn(icon: Icons.edit_outlined, onTap: _openChannelSettings),
                      const SizedBox(width: 8),
                      _ActionBtn(icon: Icons.delete_outline, color: _red.withOpacity(0.8), onTap: _deleteChannel),
                    ]
                  : [
                      _ActionBtn(icon: Icons.share_outlined, onTap: _shareChannel),
                      const SizedBox(width: 8),
                      _ActionBtn(icon: Icons.flag_outlined, color: Colors.red[300]!, onTap: _openReport),
                      const SizedBox(width: 8),
                      _ActionBtn(icon: Icons.exit_to_app_outlined, onTap: _leaveChannel),
                    ],
            ),
          ),
          const Divider(height: 1, color: _border),
          // ── 채널 소개 ──
          if (description.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: _primary),
                  SizedBox(width: 6),
                  Text('채널 소개', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text2)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9F9F9),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _border),
                ),
                child: Text(description, style: const TextStyle(fontSize: 14, color: _text, height: 1.5)),
              ),
            ),
          ],
          // ── 홈페이지 ──
          if (homepage.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Icon(Icons.language, size: 16, color: _primary),
                  SizedBox(width: 6),
                  Text('홈페이지', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text2)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: GestureDetector(
                onTap: () async {
                  final uri = Uri.tryParse(homepage);
                  if (uri != null && await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9F9F9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: _border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.open_in_new, size: 14, color: _primary),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          homepage,
                          style: const TextStyle(fontSize: 14, color: _primary, decoration: TextDecoration.underline),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── 액션 버튼 ──────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _ActionBtn({required this.icon, required this.onTap, this.color = const Color(0xFF6C63FF)});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
    );
  }
}

// ── 초대 코드 바텀시트 ──────────────────────────────
class _InviteCodeSheet extends StatelessWidget {
  final String channelName;
  final String inviteLink;
  const _InviteCodeSheet({required this.channelName, required this.inviteLink});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(width: 40, height: 4, decoration: BoxDecoration(
              color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
          ),
          const SizedBox(height: 16),
          const Text('초대 코드', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
          const SizedBox(height: 6),
          Text('"$channelName" 채널의 초대 링크', style: const TextStyle(fontSize: 14, color: _text2)),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _border),
            ),
            child: Text(inviteLink, style: const TextStyle(fontSize: 13, color: _primary)),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: inviteLink));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('링크가 복사되었습니다.')),
                );
              },
              icon: const Icon(Icons.copy, size: 18),
              label: const Text('복사'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _teal,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기', style: TextStyle(color: _text2)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 채널 설정 바텀시트 ─────────────────────────────
class _ChannelSettingsSheet extends StatefulWidget {
  final Map<String, dynamic> channel;
  final String token;
  final VoidCallback onSaved;
  const _ChannelSettingsSheet({required this.channel, required this.token, required this.onSaved});

  @override
  State<_ChannelSettingsSheet> createState() => _ChannelSettingsSheetState();
}

class _ChannelSettingsSheetState extends State<_ChannelSettingsSheet> {
  late final TextEditingController _descCtrl;
  late final TextEditingController _homepageCtrl;
  late final TextEditingController _passwordCtrl;
  bool _isPrivate    = false;
  bool _saving       = false;
  bool _showPassword = false;
  String? _imageUrl;
  File? _selectedImage;

  @override
  void initState() {
    super.initState();
    _descCtrl     = TextEditingController(text: widget.channel['description']?.toString() ?? '');
    _homepageCtrl = TextEditingController(text: widget.channel['homepage']?.toString() ?? widget.channel['website']?.toString() ?? '');
    _passwordCtrl = TextEditingController();
    _isPrivate    = widget.channel['is_private'] == true || widget.channel['is_private'] == 1;
    _imageUrl     = widget.channel['image_url']?.toString();
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    _homepageCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Widget _buildImagePreview(String url, double size) {
    if (isBase64Image(url)) {
      final bytes = base64ToBytes(url);
      if (bytes != null) {
        return Image.memory(bytes, width: size, height: size, fit: BoxFit.cover);
      }
    }
    return Image.network(url, width: size, height: size, fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
            width: size, height: size,
            color: Colors.grey[300],
            child: const Icon(Icons.camera_alt, color: Colors.grey, size: 20)));
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final xfile  = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 300,
      maxHeight: 300,
      imageQuality: 70,
    );
    if (xfile != null && mounted) {
      setState(() { _selectedImage = File(xfile.path); _imageUrl = null; });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      // 이미지 선택 시 base64로 변환 (웹뷰와 동일 방식)
      String? imageUrl;
      if (_selectedImage != null) {
        final bytes = await _selectedImage!.readAsBytes();
        imageUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      }

      final body = <String, dynamic>{
        'description':  _descCtrl.text,
        'homepage_url': _homepageCtrl.text,
        'is_secret':    _isPrivate,
        if (imageUrl != null) 'image_url': imageUrl,
        if (_isPrivate && _passwordCtrl.text.isNotEmpty)
          'password': _passwordCtrl.text,
        if (!_isPrivate) 'remove_password': true,
      };
      final res = await http.put(
        Uri.parse('$kBaseUrl/api/channels/${widget.channel['id']}'),
        headers: {
          'Authorization': 'Bearer ${widget.token}',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));

      if (mounted) {
        Navigator.pop(context);
        widget.onSaved();
        final resBody = jsonDecode(res.body) as Map<String, dynamic>?;
        if (resBody?['success'] != true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(resBody?['error']?.toString() ?? '저장에 실패했습니다.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('오류: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.channel['name']?.toString() ?? '';
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text('채널 설정', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 16),
            // 채널명 (변경 불가)
            const Text('채널명', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF5F5F5),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _border),
                    ),
                    child: Text(name, style: const TextStyle(fontSize: 14, color: _text2)),
                  ),
                ),
                const SizedBox(width: 8),
                const Text('* 변경 불가', style: TextStyle(fontSize: 11, color: _red)),
              ],
            ),
            const SizedBox(height: 12),
            // 채널 소개
            const Text('채널 소개', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: '채널 소개를 입력하세요',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _primary)),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
            const SizedBox(height: 12),
            // 채널 홈페이지
            const Text('채널 홈페이지', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            TextField(
              controller: _homepageCtrl,
              decoration: InputDecoration(
                hintText: 'https://',
                suffixIcon: _homepageCtrl.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => setState(() => _homepageCtrl.clear()))
                    : null,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _primary)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
            const SizedBox(height: 12),
            // 채널 대이미지
            const Text('채널 대표이미지', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: _pickImage,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F5F5),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _border),
                ),
                child: Row(
                  children: [
                    _selectedImage != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.file(_selectedImage!, width: 40, height: 40, fit: BoxFit.cover),
                          )
                        : _imageUrl != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: _buildImagePreview(_imageUrl!, 40),
                              )
                            : Container(
                                width: 40, height: 40,
                                decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(8)),
                                child: const Icon(Icons.camera_alt_outlined, color: Colors.grey, size: 20),
                              ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _selectedImage != null
                            ? _selectedImage!.path.split('/').last
                            : '탭하여 이미지 선택',
                        style: const TextStyle(fontSize: 13, color: _text2),
                      ),
                    ),
                    const Text('미선택시 기본 이미지 적용',
                        style: TextStyle(fontSize: 11, color: _text2)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            // 비밀번호 설정
            const Text('비밀번호 설정', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: _isPrivate ? const Color(0xFFEEEBFF) : const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _isPrivate ? _primary : _border),
              ),
              child: Row(
                children: [
                  Icon(_isPrivate ? Icons.lock : Icons.lock_open, size: 18,
                      color: _isPrivate ? _primary : _text2),
                  const SizedBox(width: 8),
                  Text(_isPrivate ? '비밀채널 설정됨' : '비밀채널 미설정',
                      style: TextStyle(
                          fontSize: 13,
                          color: _isPrivate ? _primary : _text2,
                          fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Switch(
                    value: _isPrivate,
                    onChanged: (v) => setState(() { _isPrivate = v; if (!v) _passwordCtrl.clear(); }),
                    activeColor: _primary,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ],
              ),
            ),
            if (_isPrivate) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _passwordCtrl,
                obscureText: !_showPassword,
                decoration: InputDecoration(
                  hintText: '비밀번호를 입력하세요',
                  hintStyle: const TextStyle(color: _text2, fontSize: 13),
                  prefixIcon: const Icon(Icons.lock_outline, size: 18, color: _text2),
                  suffixIcon: IconButton(
                    icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility,
                        size: 18, color: _text2),
                    onPressed: () => setState(() => _showPassword = !_showPassword),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _primary),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _primary, width: 2),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: _primary),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
              ),
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _teal,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _saving
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('저장'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      side: const BorderSide(color: _border),
                    ),
                    child: const Text('취소', style: TextStyle(color: _text2)),
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

// ── 신고하기 바텀시트 ──────────────────────────────
class _ReportSheet extends StatefulWidget {
  final String channelId;
  final String channelName;
  final String token;
  const _ReportSheet({required this.channelId, required this.channelName, required this.token});

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  String? _selectedReason;
  final _detailCtrl = TextEditingController();
  bool _submitting = false;

  static const _reasons = [
    '불법 광고 / 스팸',
    '사기 / 피싱',
    '음란 / 선정적 콘텐츠',
    '괴롭힘 / 혐오',
    '저작권 / 도용 의심',
    '기타',
  ];

  @override
  void dispose() {
    _detailCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedReason == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('신고 사유를 선택해주세요.')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await http.post(
        Uri.parse('$kBaseUrl/api/channels/${widget.channelId}/report'),
        headers: {'Authorization': 'Bearer ${widget.token}', 'Content-Type': 'application/json'},
        body: jsonEncode({'reason': _selectedReason, 'detail': _detailCtrl.text}),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('신고가 접수되었습니다.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('신고하기', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
                    Text(widget.channelName, style: const TextStyle(fontSize: 13, color: _text2)),
                  ],
                ),
                IconButton(icon: const Icon(Icons.close, color: _text2), onPressed: () => Navigator.pop(context)),
              ],
            ),
            const SizedBox(height: 12),
            const Text('신고 사유 선택', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            ..._reasons.map((reason) => RadioListTile<String>(
              value: reason,
              groupValue: _selectedReason,
              onChanged: (v) => setState(() => _selectedReason = v),
              title: Text(reason, style: const TextStyle(fontSize: 14, color: _text)),
              contentPadding: EdgeInsets.zero,
              activeColor: _primary,
              dense: true,
            )),
            const SizedBox(height: 8),
            const Text('추가 설명 (선택)', style: TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            TextField(
              controller: _detailCtrl,
              maxLines: 3,
              maxLength: 300,
              decoration: InputDecoration(
                hintText: '구체적인 내용을 입력해 주세요 (선택사항)',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: _primary)),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red[300],
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(50),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('신고하기'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
