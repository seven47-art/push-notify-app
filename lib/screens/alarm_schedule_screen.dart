// lib/screens/alarm_schedule_screen.dart
// 알람 설정 풀페이지 (v3 — 배너 + 원형+버튼 + 큰 시간 리스트)
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../utils/toast_helper.dart';
import '../utils/image_helper.dart';

const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF00BCD4);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _red     = Color(0xFFFF4444);

// ══════════════════════════════════════════════════════════════════
// 기존 호출부(showModalBottomSheet)와의 호환 래퍼 → 내부에서 풀페이지 push
// ══════════════════════════════════════════════════════════════════
class AlarmScheduleSheet extends StatelessWidget {
  final String channelId;
  final String channelName;
  final String? channelImageUrl;
  const AlarmScheduleSheet({super.key, required this.channelId, required this.channelName, this.channelImageUrl});

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Navigator.pop(context);
      Navigator.push(context, MaterialPageRoute(
        builder: (_) => AlarmScheduleScreen(channelId: channelId, channelName: channelName, channelImageUrl: channelImageUrl),
      ));
    });
    return const SizedBox.shrink();
  }
}

// ══════════════════════════════════════════════════════════════════
// 메인: 알람 목록 + 배너  (풀페이지)
// ══════════════════════════════════════════════════════════════════
class AlarmScheduleScreen extends StatefulWidget {
  final String channelId;
  final String channelName;
  final String? channelImageUrl;
  const AlarmScheduleScreen({super.key, required this.channelId, required this.channelName, this.channelImageUrl});

  @override
  State<AlarmScheduleScreen> createState() => _AlarmScheduleScreenState();
}

class _AlarmScheduleScreenState extends State<AlarmScheduleScreen> {
  List<Map<String, dynamic>> _alarms = [];
  bool _loadingAlarms = true;
  static const int _maxAlarms = 3;

  @override
  void initState() { super.initState(); _loadAlarms(); }

  Future<void> _loadAlarms() async {
    setState(() => _loadingAlarms = true);
    try {
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/alarms?channel_id=${widget.channelId}&created_by=$userId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && mounted) {
          setState(() {
            _alarms = List<Map<String, dynamic>>.from(
              (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
            _loadingAlarms = false;
          });
          return;
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingAlarms = false);
  }

  Future<void> _deleteAlarm(String alarmId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final res = await http.delete(
        Uri.parse('$kBaseUrl/api/alarms/$alarmId'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200 || res.statusCode == 204) {
        if (mounted) {
          setState(() => _alarms.removeWhere((a) => a['id']?.toString() == alarmId));
          showCenterToast(context, '알람이 삭제되었습니다.');
        }
        return;
      }
    } catch (_) {}
    if (mounted) showCenterToast(context, '알람 삭제에 실패했습니다.');
  }

  /// + 버튼 → 알람 추가 폼 화면
  Future<void> _openAddForm() async {
    if (_alarms.length >= _maxAlarms) {
      showCenterToast(context, '알람은 채널당 최대 $_maxAlarms개까지 설정할 수 있습니다.');
      return;
    }
    final result = await Navigator.push<bool>(context, MaterialPageRoute(
      builder: (_) => _AlarmAddFormScreen(channelId: widget.channelId, channelName: widget.channelName),
    ));
    if (result == true) await _loadAlarms();
  }

  // ── 상단 배너 ──────────────────────────────────────────────
  Widget _buildBanner() {
    final count = _alarms.length;
    final statusText = count == 0
        ? '예약된 알람이 없습니다.'
        : '$count개의 알람이 예약되어있습니다.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF5B8DEF), Color(0xFF00BCD4)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        // 채널 이미지
        channelAvatar(
          imageUrl: widget.channelImageUrl,
          name: widget.channelName,
          size: 52,
          bgColor: Colors.white,
          borderRadius: 14,
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.channelName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
            maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(statusText,
            style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.85))),
        ])),
      ]),
    );
  }

  // ── 알람 리스트 항목 (큰 시간 표시) ────────────────────────
  Widget _buildAlarmItem(Map<String, dynamic> alarm) {
    final alarmId     = alarm['id']?.toString() ?? '';
    final msgType     = alarm['msg_type']?.toString() ?? '';
    final contentText = alarm['content_text']?.toString() ?? '';
    final scheduledAt = alarm['scheduled_at']?.toString();

    // 시간 파싱
    String dateStr = '-', timeStr = '-', ampm = '';
    if (scheduledAt != null) {
      try {
        final dt = DateTime.parse(scheduledAt).toLocal();
        ampm = dt.hour < 12 ? '오전' : '오후';
        final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
        final min  = dt.minute.toString().padLeft(2, '0');
        dateStr = '${dt.month}월 ${dt.day}일';
        timeStr = '$hour:$min';
      } catch (_) {}
    }

    final typeIcon = msgType == 'youtube' ? Icons.smart_display
        : (msgType == 'video' ? Icons.videocam_outlined : Icons.music_note_outlined);
    final typeColor = msgType == 'youtube' ? Colors.red
        : (msgType == 'video' ? Colors.blue : _teal);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // 왼쪽: 날짜 + 큰 시간 + 아이콘·알람내용
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // 날짜 + AM/PM
          Row(children: [
            Text(dateStr, style: const TextStyle(fontSize: 13, color: _text2)),
            const SizedBox(width: 6),
            Text(ampm, style: const TextStyle(fontSize: 13, color: _text2, fontWeight: FontWeight.w500)),
          ]),
          const SizedBox(height: 2),
          // 큰 시간
          Text(timeStr, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: _text, height: 1.1)),
          const SizedBox(height: 6),
          // 아이콘 + 알람 내용
          Row(children: [
            Icon(typeIcon, size: 16, color: typeColor),
            const SizedBox(width: 6),
            Expanded(child: Text(
              contentText.isNotEmpty ? contentText : '알람 내용',
              style: TextStyle(fontSize: 13, color: contentText.isNotEmpty ? _text : _text2),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            )),
          ]),
        ])),
        // 오른쪽: 삭제 버튼
        GestureDetector(
          onTap: () => _deleteAlarm(alarmId),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: _red.withOpacity(0.08), borderRadius: BorderRadius.circular(8)),
            child: const Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.delete_outline, size: 14, color: _red),
              SizedBox(width: 3),
              Text('삭제', style: TextStyle(fontSize: 12, color: _red, fontWeight: FontWeight.w500)),
            ]),
          ),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isMaxReached = _alarms.length >= _maxAlarms;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7FA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0.5,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: _text), onPressed: () => Navigator.pop(context)),
        title: const Text('알람 설정', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text)),
        actions: [
          // + 버튼 (원형)
          if (!isMaxReached && !_loadingAlarms)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: _openAddForm,
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: _teal,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: _teal.withOpacity(0.3), blurRadius: 6, offset: const Offset(0, 2))],
                  ),
                  child: const Icon(Icons.add, color: Colors.white, size: 22),
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: _loadingAlarms
            ? const Center(child: CircularProgressIndicator(color: _primary))
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // 배너
                  _buildBanner(),
                  const SizedBox(height: 20),

                  // 알람 리스트
                  if (_alarms.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 50),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.alarm_off, size: 48, color: _text2.withOpacity(0.3)),
                        const SizedBox(height: 12),
                        const Text('예약된 알람이 없습니다.', style: TextStyle(fontSize: 14, color: _text2)),
                        const SizedBox(height: 6),
                        const Text('우측 상단 + 버튼을 눌러 알람을 추가하세요.', style: TextStyle(fontSize: 12, color: _text2)),
                      ]),
                    )
                  else
                    ..._alarms.map(_buildAlarmItem),
                ]),
              ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// 알람 추가 폼 (별도 풀페이지)
// ══════════════════════════════════════════════════════════════════
class _AlarmAddFormScreen extends StatefulWidget {
  final String channelId;
  final String channelName;
  const _AlarmAddFormScreen({required this.channelId, required this.channelName});

  @override
  State<_AlarmAddFormScreen> createState() => _AlarmAddFormScreenState();
}

class _AlarmAddFormScreenState extends State<_AlarmAddFormScreen> {
  final _youtubeCtrl      = TextEditingController();
  final _linkCtrl         = TextEditingController();
  final _contentTextCtrl  = TextEditingController();
  bool _sameAsHomepage = false;

  // ── 날짜/시간 (기본: 현재 + 10분) ──────────────────────────
  late DateTime _selectedDate;
  late int  _ampmIndex;   // 0=오전 1=오후
  late int  _hourIndex;   // 0‥11 → 표시 1‥12
  late int  _minuteIndex; // 0‥59

  late FixedExtentScrollController _ampmCtrl;
  late FixedExtentScrollController _hourCtrl;
  late FixedExtentScrollController _minuteCtrl;

  PlatformFile? _pickedFile;
  String? _uploadedFileUrl;
  bool _uploading = false;
  bool _saving    = false;

  bool get _hasYoutube => _youtubeCtrl.text.isNotEmpty;
  bool get _hasFile    => _pickedFile != null;

  static const _weekdayNames = ['월', '화', '수', '목', '금', '토', '일'];

  @override
  void initState() {
    super.initState();
    final init = DateTime.now().add(const Duration(minutes: 10));
    _selectedDate = DateTime(init.year, init.month, init.day);
    _ampmIndex    = init.hour < 12 ? 0 : 1;
    final h12     = init.hour % 12;
    _hourIndex    = h12 == 0 ? 11 : h12 - 1;
    _minuteIndex  = init.minute;
    _ampmCtrl   = FixedExtentScrollController(initialItem: _ampmIndex);
    _hourCtrl   = FixedExtentScrollController(initialItem: _hourIndex);
    _minuteCtrl = FixedExtentScrollController(initialItem: _minuteIndex);
  }

  @override
  void dispose() {
    _youtubeCtrl.dispose(); _linkCtrl.dispose(); _contentTextCtrl.dispose();
    _ampmCtrl.dispose(); _hourCtrl.dispose(); _minuteCtrl.dispose();
    super.dispose();
  }

  DateTime _buildScheduledAt() {
    final hour12 = _hourIndex + 1;
    final h24 = _ampmIndex == 0 ? (hour12 % 12) : (hour12 % 12 + 12);
    return DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, h24, _minuteIndex);
  }

  String _formatDateLabel(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dow = _weekdayNames[d.weekday - 1];
    final base = '${d.month}월 ${d.day}일 ($dow)';
    if (d == today) return '$base  오늘';
    if (d == today.add(const Duration(days: 1))) return '$base  내일';
    return base;
  }

  void _moveDate(int delta) {
    final next = _selectedDate.add(Duration(days: delta));
    final today = DateTime.now();
    if (next.isBefore(DateTime(today.year, today.month, today.day))) return;
    setState(() => _selectedDate = next);
  }

  Future<void> _openCalendar() async {
    final now = DateTime.now();
    final todayDate = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isBefore(todayDate) ? todayDate : _selectedDate,
      firstDate: todayDate,
      lastDate: DateTime(now.year + 1, now.month, now.day),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: _primary, onPrimary: Colors.white, surface: Colors.white, onSurface: _text),
          dialogBackgroundColor: Colors.white,
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = DateTime(picked.year, picked.month, picked.day));
  }

  void _clearFile() { setState(() { _pickedFile = null; _uploadedFileUrl = null; _uploading = false; }); }
  void _clearYoutube() { _youtubeCtrl.clear(); setState(() {}); }

  String _fileLabel() {
    if (_pickedFile == null) return '파일을 선택하세요 (오디오/비디오)';
    final ext = _pickedFile!.name.split('.').last.toLowerCase();
    final isVideo = ['mp4', 'mov', 'mkv'].contains(ext);
    final icon = isVideo ? '🎬' : '🎵';
    final size = _pickedFile!.size;
    final sizeStr = size > 1024 * 1024 ? '${(size / 1024 / 1024).toStringAsFixed(2)} MB' : '${(size / 1024).round()} KB';
    final prefix = _uploadedFileUrl != null ? '✓ ' : '';
    return '$prefix$icon ${_pickedFile!.name} ($sizeStr)';
  }

  Future<String> _uploadToWorker(String localPath, String fileName, String contentType) async {
    final prefs = await SharedPreferences.getInstance();
    final sessionToken = prefs.getString('session_token') ?? '';
    final uri = Uri.parse('$kBaseUrl/api/uploads/alarm-file');
    final request = http.MultipartRequest('POST', uri);
    request.fields['session_token'] = sessionToken;
    request.files.add(await http.MultipartFile.fromPath('file', localPath, filename: fileName, contentType: MediaType.parse(contentType)));
    final streamed = await request.send().timeout(const Duration(minutes: 3));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      try { final errJson = jsonDecode(body) as Map<String, dynamic>; throw Exception('업로드 실패 (${streamed.statusCode}): ${errJson['error'] ?? body}'); }
      catch (parseErr) { if (parseErr is Exception && parseErr.toString().startsWith('Exception: 업로드 실패')) rethrow; throw Exception('업로드 실패 (${streamed.statusCode}): $body'); }
    }
    final json = jsonDecode(body) as Map<String, dynamic>;
    if (json['success'] == true && json['url'] != null) return json['url'] as String;
    throw Exception('업로드 실패: ${json['error'] ?? body}');
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.any, withData: false, withReadStream: false);
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    if (f.path == null) { if (mounted) showCenterToast(context, '파일 경로를 가져올 수 없습니다.'); return; }
    final ext = f.name.split('.').last.toLowerCase();
    const audioExts = ['mp3', 'm4a', 'wav', 'aac'];
    const videoExts = ['mp4', 'mov', 'mkv'];
    if (!audioExts.contains(ext) && !videoExts.contains(ext)) { if (mounted) showCenterToast(context, '허용되지 않는 형식입니다.\n선택한 파일: ${f.name}'); return; }
    final fileSize = await File(f.path!).length();
    final isVideo = videoExts.contains(ext);
    final limitMb = isVideo ? 50 : 10;
    if (fileSize > limitMb * 1024 * 1024) { if (mounted) showCenterToast(context, '파일 크기가 ${limitMb}MB를 초과합니다.'); return; }
    String mime;
    if (ext == 'mp3') mime = 'audio/mpeg'; else if (ext == 'wav') mime = 'audio/wav'; else if (ext == 'aac') mime = 'audio/aac';
    else if (ext == 'm4a') mime = 'audio/mp4'; else if (ext == 'mov') mime = 'video/quicktime'; else if (ext == 'mkv') mime = 'video/x-matroska'; else mime = 'video/mp4';
    _youtubeCtrl.clear();
    setState(() { _pickedFile = f; _uploadedFileUrl = null; _uploading = true; });
    try {
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${f.name}';
      final downloadUrl = await _uploadToWorker(f.path!, fileName, mime);
      if (mounted) { setState(() { _uploadedFileUrl = downloadUrl; _uploading = false; }); showCenterToast(context, '✅ 업로드 완료: ${f.name}'); }
    } catch (e) { if (mounted) { setState(() { _pickedFile = null; _uploadedFileUrl = null; _uploading = false; }); showCenterToast(context, '업로드 오류: $e'); } }
  }

  bool _isValidYoutubeUrl(String url) {
    if (url.isEmpty) return false;
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) return false;
    final host = uri.host.toLowerCase();
    return host.contains('youtube.com') || host.contains('youtu.be') || host.contains('youtube-nocookie.com');
  }

  Future<void> _submit() async {
    if (_youtubeCtrl.text.isEmpty && _pickedFile == null) { showCenterToast(context, 'YouTube URL 또는 파일을 선택해주세요.'); return; }
    if (_youtubeCtrl.text.isNotEmpty && !_isValidYoutubeUrl(_youtubeCtrl.text)) { showCenterToast(context, '올바른 YouTube URL을 입력해주세요.'); return; }
    if (_pickedFile != null && _uploadedFileUrl == null) { showCenterToast(context, _uploading ? '파일 업로드 중입니다.' : '파일 업로드에 실패했습니다.'); return; }
    setState(() => _saving = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      String msgType = '', msgValue = '';
      if (_youtubeCtrl.text.isNotEmpty) { msgType = 'youtube'; msgValue = _youtubeCtrl.text; }
      else if (_pickedFile != null && _uploadedFileUrl != null) {
        final ext = _pickedFile!.name.split('.').last.toLowerCase();
        msgType = ['mp4', 'mov', 'mkv'].contains(ext) ? 'video' : 'audio';
        msgValue = _uploadedFileUrl!;
      }
      final body = <String, dynamic>{
        'channel_id': widget.channelId, 'created_by': userId,
        'scheduled_at': _buildScheduledAt().toUtc().toIso8601String(),
        'msg_type': msgType, 'msg_value': msgValue, 'link_url': _linkCtrl.text,
        if (_contentTextCtrl.text.trim().isNotEmpty) 'content_text': _contentTextCtrl.text.trim(),
      };
      final res = await http.post(
        Uri.parse('$kBaseUrl/api/alarms'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));
      final resBody = jsonDecode(res.body) as Map<String, dynamic>;
      if (mounted) {
        if (resBody['success'] == true) {
          showCenterToast(context, '알람이 예약되었습니다.');
          Navigator.pop(context, true); // true = 성공 → 리스트 새로고침
        } else { setState(() => _saving = false); showCenterToast(context, resBody['error']?.toString() ?? '알람 예약 실패'); }
      }
    } catch (e) { if (mounted) { setState(() => _saving = false); showCenterToast(context, '오류: $e'); } }
  }

  Widget _clearBtn(VoidCallback onTap) {
    return GestureDetector(onTap: onTap, child: Container(
      width: 22, height: 22,
      decoration: const BoxDecoration(color: Color(0x2EFF3B30), shape: BoxShape.circle),
      child: const Center(child: Text('✕', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFF3B30)))),
    ));
  }

  // ── 날짜 선택 바 ───────────────────────────────────────────
  Widget _buildDateSelector() {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final isPastDisabled = !_selectedDate.isAfter(todayDate);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(color: const Color(0xFFF8F8FF), borderRadius: BorderRadius.circular(14), border: Border.all(color: _primary.withOpacity(0.15))),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        GestureDetector(onTap: isPastDisabled ? null : () => _moveDate(-1), child: Container(width: 36, height: 36,
          decoration: BoxDecoration(color: isPastDisabled ? const Color(0xFFEEEEEE) : _primary.withOpacity(0.1), shape: BoxShape.circle),
          child: Icon(Icons.chevron_left, size: 22, color: isPastDisabled ? _text2.withOpacity(0.3) : _primary))),
        const SizedBox(width: 8),
        Expanded(child: Center(child: Text(_formatDateLabel(_selectedDate), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _text)))),
        GestureDetector(onTap: _openCalendar, child: Container(width: 36, height: 36, decoration: BoxDecoration(color: _primary.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(Icons.calendar_today, size: 18, color: _primary))),
        const SizedBox(width: 8),
        GestureDetector(onTap: () => _moveDate(1), child: Container(width: 36, height: 36, decoration: BoxDecoration(color: _primary.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(Icons.chevron_right, size: 22, color: _primary))),
      ]),
    );
  }

  // ── 스크롤 타임피커 ────────────────────────────────────────
  Widget _buildTimePicker() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: const Color(0xFFF8F8FF), borderRadius: BorderRadius.circular(14), border: Border.all(color: _primary.withOpacity(0.15))),
      child: SizedBox(height: 160, child: Row(children: [
        Expanded(child: _wheelColumn(controller: _ampmCtrl, count: 2, selectedIndex: _ampmIndex, labelBuilder: (i) => i == 0 ? '오전' : '오후', onChanged: (i) => setState(() => _ampmIndex = i))),
        Expanded(child: _wheelColumn(controller: _hourCtrl, count: 12, selectedIndex: _hourIndex, labelBuilder: (i) => '${i + 1}', onChanged: (i) => setState(() => _hourIndex = i))),
        const Padding(padding: EdgeInsets.only(bottom: 4), child: Text(':', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: _text))),
        Expanded(child: _wheelColumn(controller: _minuteCtrl, count: 60, selectedIndex: _minuteIndex, labelBuilder: (i) => i.toString().padLeft(2, '0'), onChanged: (i) => setState(() => _minuteIndex = i))),
      ])),
    );
  }

  Widget _wheelColumn({required FixedExtentScrollController controller, required int count, required int selectedIndex, required String Function(int) labelBuilder, required ValueChanged<int> onChanged}) {
    return ListWheelScrollView.useDelegate(
      controller: controller, itemExtent: 44, diameterRatio: 1.4, perspective: 0.003,
      physics: const FixedExtentScrollPhysics(), onSelectedItemChanged: onChanged,
      childDelegate: ListWheelChildBuilderDelegate(childCount: count, builder: (_, i) {
        final selected = i == selectedIndex;
        return Center(child: AnimatedDefaultTextStyle(
          duration: const Duration(milliseconds: 150),
          style: TextStyle(fontSize: selected ? 24 : 16, fontWeight: selected ? FontWeight.w700 : FontWeight.w400, color: selected ? _primary : _text2.withOpacity(0.5)),
          child: Text(labelBuilder(i)),
        ));
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final youtubeDim = _hasFile;
    final fileDim = _hasYoutube;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white, surfaceTintColor: Colors.white, elevation: 0.5,
        leading: IconButton(icon: const Icon(Icons.arrow_back, color: _text), onPressed: () => Navigator.pop(context)),
        title: const Text('알람 추가', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text)),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // 시간 선택
            const Text('시간 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
            const SizedBox(height: 10),
            _buildTimePicker(),
            const SizedBox(height: 16),

            // 날짜 선택
            const Text('날짜 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
            const SizedBox(height: 10),
            _buildDateSelector(),
            const SizedBox(height: 16),

            // 알람내용
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Text('알람내용', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(width: 6), const Text('(선택)', style: TextStyle(fontSize: 11, color: _text2)), const Spacer(),
                  ValueListenableBuilder<TextEditingValue>(valueListenable: _contentTextCtrl, builder: (_, v, __) => Text('${v.text.length}/20', style: TextStyle(fontSize: 11, color: v.text.length >= 20 ? _red : _text2))),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Container(width: 44, height: 44, decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.short_text, color: Colors.white, size: 22)),
                  const SizedBox(width: 10),
                  Expanded(child: Container(height: 44, decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)), padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Row(children: [
                      Expanded(child: TextField(controller: _contentTextCtrl, maxLength: 20, onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(hintText: '수신자에게 표시할 메시지 입력', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero, counterText: ''),
                        style: const TextStyle(fontSize: 13, color: _text))),
                      if (_contentTextCtrl.text.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _contentTextCtrl.clear(); setState(() {}); })),
                    ]),
                  )),
                ]),
              ]),
            ),
            const SizedBox(height: 12),

            // 콘텐츠 선택
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('콘텐츠 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                const SizedBox(height: 10),
                Opacity(opacity: youtubeDim ? 0.35 : 1.0, child: Row(children: [
                  GestureDetector(
                    onTap: youtubeDim ? null : () async {
                      const appUrl = 'youtube://'; const browserUrl = 'https://www.youtube.com';
                      if (await canLaunchUrl(Uri.parse(appUrl))) { await launchUrl(Uri.parse(appUrl), mode: LaunchMode.externalApplication); }
                      else { await launchUrl(Uri.parse(browserUrl), mode: LaunchMode.externalApplication); }
                    },
                    child: Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.smart_display, color: Colors.white, size: 22)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Container(height: 44, decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)), padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Row(children: [
                      Expanded(child: TextField(controller: _youtubeCtrl, enabled: !youtubeDim, onChanged: (_) { if (_youtubeCtrl.text.isNotEmpty && _hasFile) _clearFile(); else setState(() {}); },
                        decoration: const InputDecoration(hintText: 'URL 붙여넣기 (https://youtube.com/…)', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                        style: const TextStyle(fontSize: 13, color: _text))),
                      if (_hasYoutube) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(_clearYoutube)),
                    ]),
                  )),
                ])),
                const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1, color: _border)),
                Opacity(opacity: fileDim ? 0.35 : 1.0, child: Row(children: [
                  GestureDetector(onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                    child: Container(width: 44, height: 44, decoration: BoxDecoration(color: _uploading ? Colors.blue.withOpacity(0.5) : Colors.blue, borderRadius: BorderRadius.circular(12)),
                      child: _uploading ? const Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.folder_open, color: Colors.white, size: 22))),
                  const SizedBox(width: 10),
                  Expanded(child: GestureDetector(onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                    child: Container(height: 44, decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)), padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Row(children: [
                        Expanded(child: _uploading ? const Text('⬆️ 업로드 중...', style: TextStyle(fontSize: 13, color: _text2), overflow: TextOverflow.ellipsis)
                            : Text(_fileLabel(), style: TextStyle(fontSize: 13, color: _uploadedFileUrl != null ? _primary : (_hasFile ? _text : _text2)), overflow: TextOverflow.ellipsis)),
                        if (_hasFile && !_uploading) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _clearFile(); showCenterToast(context, '파일이 삭제되었습니다.'); })),
                      ]),
                    ),
                  )),
                ])),
              ]),
            ),
            const SizedBox(height: 12),

            // 연결 URL
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('연결 URL', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                const SizedBox(height: 10),
                Row(children: [
                  Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.link, color: Colors.white, size: 22)),
                  const SizedBox(width: 10),
                  Expanded(child: Container(height: 44, decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)), padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Row(children: [
                      Expanded(child: TextField(controller: _linkCtrl, onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(hintText: 'https://', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                        style: const TextStyle(fontSize: 13, color: _text), keyboardType: TextInputType.url)),
                      if (_linkCtrl.text.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _linkCtrl.clear(); setState(() => _sameAsHomepage = false); })),
                    ]),
                  )),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  SizedBox(width: 20, height: 20, child: Checkbox(value: _sameAsHomepage, onChanged: (v) => setState(() => _sameAsHomepage = v ?? false), activeColor: _primary, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, visualDensity: VisualDensity.compact)),
                  const SizedBox(width: 8), const Text('홈페이지와 동일', style: TextStyle(fontSize: 13, color: _text2)),
                ]),
              ]),
            ),
            const SizedBox(height: 20),

            // 취소/확인
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: _border)),
                child: const Text('취소', style: TextStyle(color: _text2)))),
              const SizedBox(width: 12),
              Expanded(child: ElevatedButton(onPressed: (_saving || _uploading) ? null : _submit,
                style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('확인'))),
            ]),
          ]),
        ),
      ),
    );
  }
}
