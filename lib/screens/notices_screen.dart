// lib/screens/notices_screen.dart
// Phase 6-3: 공지사항 화면 — GET /api/notices, 아코디언 열람, 미열람 배지
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const _bg      = Color(0xFF121212);
const _bg2     = Color(0xFF1E1E2E);
const _bg3     = Color(0xFF2A2A3E);
const _primary = Color(0xFF6C63FF);
const _text    = Colors.white;
const _text2   = Color(0xFFB0B0C8);
const _text3   = Color(0xFF64748B);
const _border  = Color(0xFF3A3A55);
const _red     = Color(0xFFEF4444);

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  List<Map<String, dynamic>> _items    = [];
  bool   _loading  = true;
  bool   _hasMore  = false;
  int    _offset   = 0;
  String? _error;

  // 열린 공지 id 집합 (아코디언)
  final Set<String> _expanded = {};
  // 열람한 공지 id
  Set<String> _seen = {};

  static const int _limit = 20;

  @override
  void initState() {
    super.initState();
    _loadSeen().then((_) => _load());
  }

  Future<void> _loadSeen() async {
    final prefs = await SharedPreferences.getInstance();
    _seen = (prefs.getStringList('seen_notices') ?? []).toSet();
  }

  Future<void> _saveSeen() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('seen_notices', _seen.toList());
  }

  Future<void> _load({bool refresh = true}) async {
    if (refresh) {
      setState(() { _loading = true; _error = null; _offset = 0; _items = []; });
    }
    try {
      final offset = refresh ? 0 : _offset;
      final res = await http
          .get(Uri.parse('$kBaseUrl/api/notices?limit=$_limit&offset=$offset'))
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          final newItems = (body['data'] as List? ?? [])
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          setState(() {
            if (refresh) {
              _items = newItems;
            } else {
              _items = [..._items, ...newItems];
            }
            _hasMore = body['hasMore'] == true;
            _offset  = _items.length;
            _loading = false;
          });
        } else {
          setState(() { _loading = false; _error = body['error']?.toString(); });
        }
      } else {
        setState(() { _loading = false; _error = '서버 오류 (${res.statusCode})'; });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = '연결 실패'; });
    }
  }

  void _toggle(String id) {
    setState(() {
      if (_expanded.contains(id)) {
        _expanded.remove(id);
      } else {
        _expanded.add(id);
        // 열람 처리
        if (!_seen.contains(id)) {
          _seen.add(id);
          _saveSeen();
        }
      }
    });
  }

  String _formatDate(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw).toLocal();
      return '${dt.year}.${dt.month.toString().padLeft(2,'0')}.${dt.day.toString().padLeft(2,'0')}';
    } catch (_) { return raw.substring(0, 10); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg2,
        title: const Text('공지사항',
            style: TextStyle(color: _text, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.of(context).pop(),
        ),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? _buildError()
              : _items.isEmpty
                  ? _buildEmpty()
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: _primary,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length + (_hasMore ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (i == _items.length) {
                            return _buildMoreBtn();
                          }
                          return _buildNoticeItem(_items[i]);
                        },
                      ),
                    ),
    );
  }

  Widget _buildNoticeItem(Map<String, dynamic> item) {
    final id       = item['id']?.toString() ?? '';
    final title    = item['title']?.toString() ?? '공지';
    final content  = item['content']?.toString() ?? '';
    final date     = _formatDate(item['created_at']?.toString());
    final isOpen   = _expanded.contains(id);
    final isUnread = !_seen.contains(id);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: _bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isOpen ? _primary.withOpacity(0.4) : _border),
      ),
      child: Column(
        children: [
          // 헤더 (탭으로 열기/닫기)
          InkWell(
            onTap: () => _toggle(id),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.campaign_rounded, color: _primary, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(title,
                        style: const TextStyle(
                            color: _text,
                            fontSize: 14,
                            fontWeight: FontWeight.w600)),
                  ),
                  if (isUnread)
                    Container(
                      width: 8, height: 8, margin: const EdgeInsets.only(right: 8),
                      decoration: const BoxDecoration(color: _red, shape: BoxShape.circle),
                    ),
                  Text(date, style: const TextStyle(color: _text3, fontSize: 11)),
                  const SizedBox(width: 8),
                  Icon(
                    isOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: _text3, size: 18),
                ],
              ),
            ),
          ),
          // 내용 (펼쳐질 때만 표시)
          if (isOpen)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Divider(height: 1, color: _border),
                  const SizedBox(height: 12),
                  SelectableText(content,
                      style: const TextStyle(
                          color: _text2, fontSize: 13, height: 1.7)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMoreBtn() {
    return GestureDetector(
      onTap: () => _load(refresh: false),
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
            color: _bg2,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _border)),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_circle_outline, color: _primary, size: 18),
            SizedBox(width: 6),
            Text('더보기', style: TextStyle(color: _primary, fontSize: 14, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.campaign_outlined, size: 72, color: _text3),
          SizedBox(height: 16),
          Text('등록된 공지사항이 없습니다', style: TextStyle(color: _text3, fontSize: 15)),
        ],
      ),
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
            onPressed: _load,
          ),
        ],
      ),
    );
  }
}
