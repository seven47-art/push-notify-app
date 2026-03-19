// lib/screens/policy_screen.dart
// Phase 3: 서버에서 약관/개인정보처리방침 텍스트를 받아 표시
// type: 'terms' → GET /api/settings/terms
// type: 'privacy' → GET /api/settings/privacy
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config.dart';

const _bg      = Color(0xFF121212);
const _bg2     = Color(0xFF1E1E2E);
const _primary = Color(0xFF6C63FF);
const _text    = Colors.white;
const _text2   = Color(0xFFB0B0C8);
const _text3   = Color(0xFF64748B);
const _border  = Color(0xFF3A3A55);

class PolicyScreen extends StatefulWidget {
  final String type; // 'terms' | 'privacy'
  const PolicyScreen({super.key, required this.type});

  @override
  State<PolicyScreen> createState() => _PolicyScreenState();
}

class _PolicyScreenState extends State<PolicyScreen> {
  String? _content;
  bool    _loading = true;
  String? _error;

  String get _title =>
      widget.type == 'terms' ? '서비스 이용약관' : '개인정보 처리방침';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/settings/${widget.type}'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final value = body['data']?['value']?.toString() ?? '';
        setState(() {
          _content = value.isNotEmpty ? value : '등록된 내용이 없습니다.';
          _loading = false;
        });
      } else {
        setState(() {
          _error = '서버 오류 (${res.statusCode})';
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = '불러오기 실패. 네트워크를 확인해주세요.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg2,
        title: Text(_title,
            style: const TextStyle(color: _text, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 56, color: Color(0xFFEF4444)),
                      const SizedBox(height: 12),
                      Text(_error!,
                          style: const TextStyle(color: _text2, fontSize: 14),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 20),
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: _primary, foregroundColor: Colors.white),
                        icon: const Icon(Icons.refresh),
                        label: const Text('다시 시도'),
                        onPressed: _load,
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 제목 헤더
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: _bg2,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _border),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              widget.type == 'terms'
                                  ? Icons.description_outlined
                                  : Icons.privacy_tip_outlined,
                              color: _primary,
                              size: 22,
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _title,
                              style: const TextStyle(
                                  color: _text,
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      // 본문 텍스트
                      SelectableText(
                        _content ?? '',
                        style: const TextStyle(
                          color: _text2,
                          fontSize: 14,
                          height: 1.7,
                        ),
                      ),
                      const SizedBox(height: 40),
                    ],
                  ),
                ),
    );
  }
}
