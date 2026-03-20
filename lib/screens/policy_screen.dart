// lib/screens/policy_screen.dart
// 스크린샷 기준: 뒤로가기 + 약관/개인정보 텍스트 표시
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config.dart';

enum PolicyType { terms, privacy }

class PolicyScreen extends StatefulWidget {
  final PolicyType type;
  const PolicyScreen({super.key, required this.type});

  @override
  State<PolicyScreen> createState() => _PolicyScreenState();
}

class _PolicyScreenState extends State<PolicyScreen> {
  String _content = '';
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final endpoint = widget.type == PolicyType.terms
          ? '$kBaseUrl/api/settings/terms'
          : '$kBaseUrl/api/settings/privacy';
      final res = await http.get(Uri.parse(endpoint))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          // API 응답: { success: true, data: { value: "내용", updated_at: "..." } }
          final data = body['data'];
          String text = '';
          if (data is Map) {
            text = data['value']?.toString() ?? '';
          } else {
            text = data?.toString() ?? '';
          }
          if (mounted) setState(() { _content = text; _loading = false; });
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '불러오기 실패'; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류'; });
    }
  }

  String get _title =>
      widget.type == PolicyType.terms ? '서비스 이용약관' : '개인정보처리방침';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF333333)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(_title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF222222))),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error.isNotEmpty
              ? Center(child: Text(_error, style: const TextStyle(color: Colors.grey)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                  child: Text(
                    _content.isNotEmpty ? _content : '$_title 내용을 불러오는 중...',
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF333333),
                      height: 1.7,
                    ),
                  ),
                ),
    );
  }
}
