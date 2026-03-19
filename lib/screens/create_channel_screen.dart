// lib/screens/create_channel_screen.dart
// 스크린샷 기준: 채널 만들기 바텀시트
// 채널명(필수)/채널소개(필수)/홈페이지/대표이미지/비밀번호 + 확인/취소
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF00BCD4);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF555555);  // 흐린 회색 → 진한 색으로 수정
const _border  = Color(0xFFDDDDDD);
const _red     = Color(0xFFFF4444);

// ── 바텀시트로 사용 ──────────────────────────────
class CreateChannelSheet extends StatefulWidget {
  const CreateChannelSheet({super.key});

  @override
  State<CreateChannelSheet> createState() => _CreateChannelSheetState();
}

class _CreateChannelSheetState extends State<CreateChannelSheet> {
  final _nameCtrl     = TextEditingController();
  final _descCtrl     = TextEditingController();
  final _homepageCtrl = TextEditingController();
  bool _isPrivate       = false;
  File? _selectedImage;
  bool _saving           = false;
  String? _nameError;
  String? _descError;
  final _passwordCtrl    = TextEditingController();
  bool _showPassword     = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _homepageCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 85,
    );
    if (xfile != null && mounted) {
      setState(() => _selectedImage = File(xfile.path));
    }
  }

  bool _validate() {
    bool ok = true;
    if (_nameCtrl.text.trim().isEmpty || _nameCtrl.text.trim().length > 10) {
      setState(() => _nameError = '채널명을 10자 이내로 입력해주세요.');
      ok = false;
    } else {
      setState(() => _nameError = null);
    }
    if (_descCtrl.text.trim().isEmpty || _descCtrl.text.trim().length > 50) {
      setState(() => _descError = '채널 소개를 50자 이내로 입력해주세요.');
      ok = false;
    } else {
      setState(() => _descError = null);
    }
    return ok;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => _saving = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';

      // 이미지 선택 시 base64로 변환 (웹뷰와 동일 방식)
      String? imageUrl;
      if (_selectedImage != null) {
        final bytes = await _selectedImage!.readAsBytes();
        imageUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      }

      final body = <String, dynamic>{
        'name': _nameCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'homepage_url': _homepageCtrl.text.trim(),
        'is_private': _isPrivate,
        'is_secret': _isPrivate,
        'owner_id': userId,
        if (imageUrl != null) 'image_url': imageUrl,
        if (_isPrivate && _passwordCtrl.text.isNotEmpty)
          'password': _passwordCtrl.text,
      };
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/channels'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200 || res.statusCode == 201) {
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('채널이 생성되었습니다.')),
          );
        }
        return;
      }
      // 에러 처리
      if (mounted) {
        final errBody = jsonDecode(res.body) as Map<String, dynamic>?;
        final msg = errBody?['error']?.toString() ?? '채널 생성에 실패했습니다.';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('오류: $e')),
        );
      }
    }
    if (mounted) setState(() => _saving = false);
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
            const Text('채널 만들기', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 16),

            // 채널명 (필수)
            Row(
              children: [
                const Text('채널명 (필수)', style: TextStyle(fontSize: 13, color: _text, fontWeight: FontWeight.w500)),
                const Spacer(),
                const Text('* 변경 불가', style: TextStyle(fontSize: 11, color: _red)),
              ],
            ),
            const SizedBox(height: 4),
            TextField(
              controller: _nameCtrl,
              maxLength: 10,
              style: const TextStyle(fontSize: 14, color: _text),
              onChanged: (_) => setState(() => _nameError = null),
              decoration: InputDecoration(
                hintText: '10자 내로 적어주세요',
                errorText: _nameError,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _primary),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                counterText: '${_nameCtrl.text.length}/10',
              ),
            ),
            const SizedBox(height: 12),

            // 채널 소개 (필수)
            const Text('채널 소개 (필수)', style: TextStyle(fontSize: 13, color: _text, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              maxLength: 50,
              style: const TextStyle(fontSize: 14, color: _text),
              onChanged: (_) => setState(() => _descError = null),
              decoration: InputDecoration(
                hintText: '50자 내로 적어주세요',
                errorText: _descError,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _primary),
                ),
                contentPadding: const EdgeInsets.all(12),
                counterText: '${_descCtrl.text.length}/50',
              ),
            ),
            const SizedBox(height: 12),

            // 채널 홈페이지
            const Text('채널 홈페이지', style: TextStyle(fontSize: 13, color: _text, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            TextField(
              controller: _homepageCtrl,
              style: const TextStyle(fontSize: 14, color: _text),
              decoration: InputDecoration(
                hintText: 'https://',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: _primary),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
            const SizedBox(height: 12),

            // 채널 대표이미지 선택
            const Text('채널 대표이미지 선택', style: TextStyle(fontSize: 13, color: _text, fontWeight: FontWeight.w500)),
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
                        : Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(8)),
                            child: const Icon(Icons.camera_alt_outlined, color: Colors.grey, size: 20),
                          ),
                    const SizedBox(width: 12),
                    Text(
                      _selectedImage != null ? _selectedImage!.path.split('/').last : '탭하여 이미지 선택',
                      style: const TextStyle(fontSize: 13, color: _text2),
                    ),
                    const Spacer(),
                    const Text('미선택시 기본 이미지 적용', style: TextStyle(fontSize: 11, color: _text2)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // 비밀번호
            const Text('비밀번호', style: TextStyle(fontSize: 13, color: _text, fontWeight: FontWeight.w500)),
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
            // 비밀번호 입력칸 (비밀채널 ON일 때만 표시)
            if (_isPrivate) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _passwordCtrl,
                obscureText: !_showPassword,
                style: const TextStyle(fontSize: 14, color: _text),
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
                    onPressed: _saving ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _teal,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _saving
                        ? const SizedBox(width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('확인'),
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

// ── 기존 화면 방식 호환 (사용되지 않지만 유지) ────
class CreateChannelScreen extends StatelessWidget {
  const CreateChannelScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CreateChannelSheet();
  }
}
