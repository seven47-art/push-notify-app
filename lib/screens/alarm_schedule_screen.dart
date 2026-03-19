// lib/screens/alarm_schedule_screen.dart
// 스크린샷 기준: 알람 설정 바텀시트
// 채널명 · 알람 설정 제목 + 콘텐츠 선택(YouTube/파일) + 연결URL + 날짜/시간 선택 + 확인/취소
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF00BCD4);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _red     = Color(0xFFFF4444);

class AlarmScheduleSheet extends StatefulWidget {
  final String channelId;
  final String channelName;
  const AlarmScheduleSheet({super.key, required this.channelId, required this.channelName});

  @override
  State<AlarmScheduleSheet> createState() => _AlarmScheduleSheetState();
}

class _AlarmScheduleSheetState extends State<AlarmScheduleSheet> {
  final _youtubeCtrl    = TextEditingController();
  final _linkCtrl       = TextEditingController();
  bool _sameAsHomepage  = false;
  DateTime _scheduledAt = DateTime.now().add(const Duration(minutes: 5));
  PlatformFile? _pickedFile;
  bool _saving = false;

  @override
  void dispose() {
    _youtubeCtrl.dispose();
    _linkCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'mp4', 'wav', 'aac', 'mov', 'mkv'],
    );
    if (result != null && result.files.isNotEmpty) {
      setState(() => _pickedFile = result.files.first);
    }
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      locale: const Locale('ko'),
    );
    if (date == null) return;
    if (!mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_scheduledAt),
    );
    if (time == null) return;
    setState(() {
      _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  String _formatDateTime(DateTime dt) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final itemDay = DateTime(dt.year, dt.month, dt.day);
    final ampm = dt.hour < 12 ? '오전' : '오후';
    final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final min = dt.minute.toString().padLeft(2, '0');
    final timeStr = '$ampm $hour:$min';
    if (itemDay == today) return '${dt.month}월 ${dt.day}일 (오늘) · $timeStr';
    return '${dt.month}월 ${dt.day}일 · $timeStr';
  }

  Future<void> _submit() async {
    if (_youtubeCtrl.text.isEmpty && _pickedFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('YouTube URL 또는 파일을 선택해주세요.')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final body = {
        'channel_id': widget.channelId,
        'scheduled_at': _scheduledAt.toUtc().toIso8601String(),
        'link_url': _linkCtrl.text,
      };
      if (_youtubeCtrl.text.isNotEmpty) {
        body['youtube_url'] = _youtubeCtrl.text;
        body['content_type'] = 'youtube';
      } else if (_pickedFile != null) {
        body['file_name'] = _pickedFile!.name;
      }
      await http.post(
        Uri.parse('$kBaseUrl/api/alarms'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));
    } catch (_) {}
    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('알람이 예약되었습니다.')),
      );
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
            // 뒤로가기 + 제목
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back, size: 20, color: _text),
                  onPressed: () => Navigator.pop(context),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${widget.channelName} · 알람 설정',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            // 콘텐츠 선택 섹션
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('콘텐츠 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text2)),
                  const SizedBox(height: 10),
                  // YouTube URL 입력
                  Row(
                    children: [
                      Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(8)),
                        child: const Icon(Icons.smart_display, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _youtubeCtrl,
                          decoration: const InputDecoration(
                            hintText: '붙여넣기 (https://youtube.com/...)',
                            hintStyle: TextStyle(fontSize: 13, color: _text2),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  const Divider(color: _border),
                  // 파일 선택
                  GestureDetector(
                    onTap: _pickFile,
                    child: Row(
                      children: [
                        Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(color: Colors.blue, borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.folder_open, color: Colors.white, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _pickedFile?.name ?? '파일을 선택하세요 (오디오/비디오)',
                            style: TextStyle(
                              fontSize: 13,
                              color: _pickedFile != null ? _text : _text2,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // 연결 URL
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('연결 URL', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text2)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(8)),
                        child: const Icon(Icons.link, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextField(
                          controller: _linkCtrl,
                          decoration: const InputDecoration(
                            hintText: '//:https',
                            hintStyle: TextStyle(fontSize: 13, color: _text2),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Checkbox(
                        value: _sameAsHomepage,
                        onChanged: (v) => setState(() => _sameAsHomepage = v ?? false),
                        activeColor: _primary,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      const Text('홈페이지와 동일', style: TextStyle(fontSize: 13, color: _text2)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // 날짜/시간 선택
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('날짜 / 시간 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text2)),
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: _pickDateTime,
                    child: Row(
                      children: [
                        Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.access_time, color: Colors.white, size: 20),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _formatDateTime(_scheduledAt),
                            style: const TextStyle(fontSize: 13, color: _primary, fontWeight: FontWeight.w500),
                          ),
                        ),
                        const Icon(Icons.keyboard_arrow_down, color: _text2),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
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
                const SizedBox(width: 12),
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
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('확인'),
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
