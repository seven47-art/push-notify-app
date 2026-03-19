// lib/screens/notices_screen.dart
// 스크린샷 기준: ← 공지사항 + 확장가능한 목록 (빨간점 신규표시 + 날짜 + 체브론)
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _bg      = Color(0xFFFFFFFF);

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  List<Map<String, dynamic>> _notices = [];
  bool _loading = true;
  String? _error;
  Set<String> _expanded = {};
  Set<String> _seenIds  = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      _seenIds = Set.from(prefs.getStringList('seen_notice_ids') ?? []);

      final res = await http.get(
        Uri.parse('$kBaseUrl/api/notices'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          if (mounted) {
            setState(() {
              _notices = List<Map<String, dynamic>>.from(
                (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
              _loading = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '공지사항을 불러올 수 없습니다.'; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  void _toggleExpand(String id) async {
    setState(() {
      if (_expanded.contains(id)) {
        _expanded.remove(id);
      } else {
        _expanded.add(id);
        _seenIds.add(id);
      }
    });
    // 읽음 처리 저장
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('seen_notice_ids', _seenIds.toList());
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw.toString();
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
        title: const Text('공지사항', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline, size: 48, color: Colors.grey[300]),
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: _text2)),
                    const SizedBox(height: 12),
                    TextButton(onPressed: _load, child: const Text('다시 시도')),
                  ],
                ))
              : _notices.isEmpty
                  ? const Center(child: Text('공지사항이 없습니다.', style: TextStyle(color: _text2)))
                  : RefreshIndicator(
                      color: _primary,
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _notices.length,
                        itemBuilder: (context, index) {
                          final notice = _notices[index];
                          final id = notice['id']?.toString() ?? '$index';
                          final title = notice['title']?.toString() ?? notice['content']?.toString() ?? '';
                          final content = notice['content']?.toString() ?? '';
                          final date = _formatDate(notice['created_at']);
                          final isNew = !_seenIds.contains(id);
                          final isExpanded = _expanded.contains(id);

                          return Column(
                            children: [
                              InkWell(
                                onTap: () => _toggleExpand(id),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.campaign, size: 18, color: _primary),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          title,
                                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _text),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      if (isNew) ...[
                                        Container(
                                          width: 8, height: 8,
                                          decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                        ),
                                        const SizedBox(width: 6),
                                      ],
                                      Text(date, style: const TextStyle(fontSize: 12, color: _text2)),
                                      const SizedBox(width: 4),
                                      Icon(
                                        isExpanded ? Icons.expand_less : Icons.expand_more,
                                        size: 18,
                                        color: _text2,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              if (isExpanded)
                                Container(
                                  width: double.infinity,
                                  color: const Color(0xFFF9F9F9),
                                  padding: const EdgeInsets.fromLTRB(44, 12, 16, 16),
                                  child: Text(
                                    content,
                                    style: const TextStyle(fontSize: 13, color: _text, height: 1.6),
                                  ),
                                ),
                              const Divider(height: 1, color: _border),
                            ],
                          );
                        },
                      ),
                    ),
    );
  }
}
