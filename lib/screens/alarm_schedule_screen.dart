// lib/screens/alarm_schedule_screen.dart
// 알람 설정 풀페이지 (v2 — 네이티브 스크롤 타임피커 + 날짜 화살표)
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

const _primary = Color(0xFF6C63FF);
const _teal    = Color(0xFF00BCD4);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _red     = Color(0xFFFF4444);

// ══════════════════════════════════════════════════════════════════
// 기존 호출부(showModalBottomSheet)와의 호환 래퍼  → 내부에서 풀페이지 push
// ══════════════════════════════════════════════════════════════════
class AlarmScheduleSheet extends StatelessWidget {
  final String channelId;
  final String channelName;
  const AlarmScheduleSheet({super.key, required this.channelId, required this.channelName});

  @override
  Widget build(BuildContext context) {
    // 바텀시트로 열렸을 때 → 즉시 닫고 풀페이지로 교체
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Navigator.pop(context); // 바텀시트 닫기
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AlarmScheduleScreen(channelId: channelId, channelName: channelName),
        ),
      );
    });
    return const SizedBox.shrink();
  }
}

// ══════════════════════════════════════════════════════════════════
// 풀페이지 알람 설정 화면
// ══════════════════════════════════════════════════════════════════
class AlarmScheduleScreen extends StatefulWidget {
  final String channelId;
  final String channelName;
  const AlarmScheduleScreen({super.key, required this.channelId, required this.channelName});

  @override
  State<AlarmScheduleScreen> createState() => _AlarmScheduleScreenState();
}

class _AlarmScheduleScreenState extends State<AlarmScheduleScreen> {
  final _youtubeCtrl      = TextEditingController();
  final _linkCtrl         = TextEditingController();
  final _contentTextCtrl  = TextEditingController();
  bool _sameAsHomepage  = false;

  // ── 날짜/시간 상태 (기본: 현재 + 10분) ──────────────────────
  late DateTime _selectedDate;
  late int  _ampmIndex;   // 0=오전  1=오후
  late int  _hourIndex;   // 0‥11 → 표시 1‥12
  late int  _minuteIndex; // 0‥59

  late FixedExtentScrollController _ampmCtrl;
  late FixedExtentScrollController _hourCtrl;
  late FixedExtentScrollController _minuteCtrl;

  PlatformFile? _pickedFile;
  String? _uploadedFileUrl;
  bool _uploading = false;
  bool _saving    = false;

  // ── 알람 목록 ──────────────────────────────────────────────
  List<Map<String, dynamic>> _alarms = [];
  bool _loadingAlarms = true;
  bool _showAddForm   = false;
  static const int _maxAlarms = 3;

  bool get _hasYoutube => _youtubeCtrl.text.isNotEmpty;
  bool get _hasFile    => _pickedFile != null;

  static const _weekdayNames = ['월', '화', '수', '목', '금', '토', '일'];

  // ── 초기화 ─────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    final init = DateTime.now().add(const Duration(minutes: 10));
    _selectedDate = DateTime(init.year, init.month, init.day);
    _ampmIndex    = init.hour < 12 ? 0 : 1;
    final h12     = init.hour % 12;  // 0‥11
    _hourIndex    = h12 == 0 ? 11 : h12 - 1;  // 표시 1‥12 → 인덱스 0‥11
    _minuteIndex  = init.minute;

    _ampmCtrl   = FixedExtentScrollController(initialItem: _ampmIndex);
    _hourCtrl   = FixedExtentScrollController(initialItem: _hourIndex);
    _minuteCtrl = FixedExtentScrollController(initialItem: _minuteIndex);

    _loadAlarms();
  }

  @override
  void dispose() {
    _youtubeCtrl.dispose();
    _linkCtrl.dispose();
    _contentTextCtrl.dispose();
    _ampmCtrl.dispose();
    _hourCtrl.dispose();
    _minuteCtrl.dispose();
    super.dispose();
  }

  // ── 날짜/시간 → DateTime 변환 ──────────────────────────────
  DateTime _buildScheduledAt() {
    final hour12 = _hourIndex + 1; // 1‥12
    final h24 = _ampmIndex == 0
        ? (hour12 % 12)        // 오전: 12→0, 1→1, … 11→11
        : (hour12 % 12 + 12);  // 오후: 12→12, 1→13, … 11→23
    return DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, h24, _minuteIndex);
  }

  // ── 날짜 포맷 ──────────────────────────────────────────────
  String _formatDateLabel(DateTime d) {
    final now   = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dow   = _weekdayNames[d.weekday - 1];
    final base  = '${d.month}월 ${d.day}일 ($dow)';
    if (d == today) return '$base  오늘';
    final tomorrow = today.add(const Duration(days: 1));
    if (d == tomorrow) return '$base  내일';
    return base;
  }

  /// 날짜 하루 이동 (과거 불가)
  void _moveDate(int delta) {
    final next = _selectedDate.add(Duration(days: delta));
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    if (next.isBefore(todayDate)) return;
    setState(() => _selectedDate = next);
  }

  /// 캘린더 팝업
  Future<void> _openCalendar() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isBefore(DateTime(now.year, now.month, now.day))
          ? DateTime(now.year, now.month, now.day)
          : _selectedDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1, now.month, now.day),
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(ctx).copyWith(
            colorScheme: const ColorScheme.light(
              primary: _primary,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: _text,
            ),
            dialogBackgroundColor: Colors.white,
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _selectedDate = DateTime(picked.year, picked.month, picked.day));
    }
  }

  // ── 파일/YouTube 헬퍼 (기존 로직 유지) ─────────────────────
  void _clearFile() {
    setState(() {
      _pickedFile      = null;
      _uploadedFileUrl = null;
      _uploading       = false;
    });
  }
  void _clearYoutube() { _youtubeCtrl.clear(); setState(() {}); }

  String _fileLabel() {
    if (_pickedFile == null) return '파일을 선택하세요 (오디오/비디오)';
    final ext = _pickedFile!.name.split('.').last.toLowerCase();
    final isVideo = ['mp4', 'mov', 'mkv'].contains(ext);
    final icon = isVideo ? '🎬' : '🎵';
    final size = _pickedFile!.size;
    final sizeStr = size > 1024 * 1024
        ? '${(size / 1024 / 1024).toStringAsFixed(2)} MB'
        : '${(size / 1024).round()} KB';
    final prefix = _uploadedFileUrl != null ? '✓ ' : '';
    return '$prefix$icon ${_pickedFile!.name} ($sizeStr)';
  }

  void _openAddForm() => setState(() => _showAddForm = true);

  // ── API ────────────────────────────────────────────────────
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

  String _formatAlarmTime(String? scheduledAt) {
    if (scheduledAt == null) return '-';
    try {
      final dt = DateTime.parse(scheduledAt).toLocal();
      final ampm = dt.hour < 12 ? '오전' : '오후';
      final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
      final min  = dt.minute.toString().padLeft(2, '0');
      return '${dt.month}월 ${dt.day}일 $ampm $hour:$min';
    } catch (_) { return scheduledAt; }
  }

  // ── 파일 업로드 ────────────────────────────────────────────
  Future<String> _uploadToWorker(String localPath, String fileName, String contentType) async {
    final prefs = await SharedPreferences.getInstance();
    final sessionToken = prefs.getString('session_token') ?? '';
    final uri = Uri.parse('$kBaseUrl/api/uploads/alarm-file');
    final request = http.MultipartRequest('POST', uri);
    request.fields['session_token'] = sessionToken;
    request.files.add(await http.MultipartFile.fromPath(
      'file', localPath, filename: fileName,
      contentType: MediaType.parse(contentType),
    ));
    final streamed = await request.send().timeout(const Duration(minutes: 3));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      try {
        final errJson = jsonDecode(body) as Map<String, dynamic>;
        throw Exception('업로드 실패 (${streamed.statusCode}): ${errJson['error'] ?? body}');
      } catch (parseErr) {
        if (parseErr is Exception && parseErr.toString().startsWith('Exception: 업로드 실패')) rethrow;
        throw Exception('업로드 실패 (${streamed.statusCode}): $body');
      }
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
    if (!audioExts.contains(ext) && !videoExts.contains(ext)) {
      if (mounted) showCenterToast(context, '허용되지 않는 형식입니다. (mp3, m4a, wav, aac, mp4, mov, mkv)\n선택한 파일: ${f.name}');
      return;
    }
    final fileSize = await File(f.path!).length();
    final isVideo  = videoExts.contains(ext);
    final limitMb  = isVideo ? 50 : 10;
    if (fileSize > limitMb * 1024 * 1024) {
      if (mounted) showCenterToast(context, '파일 크기가 ${limitMb}MB를 초과합니다 (${(fileSize / 1024 / 1024).toStringAsFixed(1)}MB).');
      return;
    }
    String mime;
    if (ext == 'mp3') mime = 'audio/mpeg';
    else if (ext == 'wav') mime = 'audio/wav';
    else if (ext == 'aac') mime = 'audio/aac';
    else if (ext == 'm4a') mime = 'audio/mp4';
    else if (ext == 'mov') mime = 'video/quicktime';
    else if (ext == 'mkv') mime = 'video/x-matroska';
    else mime = 'video/mp4';
    _youtubeCtrl.clear();
    setState(() { _pickedFile = f; _uploadedFileUrl = null; _uploading = true; });
    try {
      final fileName    = '${DateTime.now().millisecondsSinceEpoch}_${f.name}';
      final downloadUrl = await _uploadToWorker(f.path!, fileName, mime);
      if (mounted) { setState(() { _uploadedFileUrl = downloadUrl; _uploading = false; }); showCenterToast(context, '✅ 업로드 완료: ${f.name}'); }
    } catch (e) {
      if (mounted) { setState(() { _pickedFile = null; _uploadedFileUrl = null; _uploading = false; }); showCenterToast(context, '업로드 오류: $e'); }
    }
  }

  bool _isValidYoutubeUrl(String url) {
    if (url.isEmpty) return false;
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) return false;
    final host = uri.host.toLowerCase();
    return host.contains('youtube.com') || host.contains('youtu.be') || host.contains('youtube-nocookie.com');
  }

  Future<void> _submit() async {
    if (_alarms.length >= _maxAlarms) { showCenterToast(context, '알람은 채널당 최대 $_maxAlarms개까지 설정할 수 있습니다.'); return; }
    if (_youtubeCtrl.text.isEmpty && _pickedFile == null) { showCenterToast(context, 'YouTube URL 또는 파일을 선택해주세요.'); return; }
    if (_youtubeCtrl.text.isNotEmpty && !_isValidYoutubeUrl(_youtubeCtrl.text)) { showCenterToast(context, '올바른 YouTube URL을 입력해주세요.\n예: https://youtube.com/watch?v=... 또는 https://youtu.be/...'); return; }
    if (_pickedFile != null && _uploadedFileUrl == null) { showCenterToast(context, _uploading ? '파일 업로드 중입니다. 잠시 기다려주세요.' : '파일 업로드에 실패했습니다. 다시 선택해주세요.'); return; }

    setState(() => _saving = true);
    try {
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      String msgType = '', msgValue = '';
      if (_youtubeCtrl.text.isNotEmpty) { msgType = 'youtube'; msgValue = _youtubeCtrl.text; }
      else if (_pickedFile != null && _uploadedFileUrl != null) {
        final ext = _pickedFile!.name.split('.').last.toLowerCase();
        msgType  = ['mp4', 'mov', 'mkv'].contains(ext) ? 'video' : 'audio';
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
          _youtubeCtrl.clear(); _linkCtrl.clear(); _contentTextCtrl.clear();
          final init = DateTime.now().add(const Duration(minutes: 10));
          setState(() {
            _pickedFile = null; _uploadedFileUrl = null; _sameAsHomepage = false; _saving = false; _showAddForm = false;
            _selectedDate = DateTime(init.year, init.month, init.day);
            _ampmIndex = init.hour < 12 ? 0 : 1;
            final h12 = init.hour % 12;
            _hourIndex = h12 == 0 ? 11 : h12 - 1;
            _minuteIndex = init.minute;
          });
          _ampmCtrl.jumpToItem(_ampmIndex);
          _hourCtrl.jumpToItem(_hourIndex);
          _minuteCtrl.jumpToItem(_minuteIndex);
          await _loadAlarms();
          showCenterToast(context, '알람이 예약되었습니다.');
        } else { setState(() => _saving = false); showCenterToast(context, resBody['error']?.toString() ?? '알람 예약 실패'); }
      }
    } catch (e) { if (mounted) { setState(() => _saving = false); showCenterToast(context, '오류: $e'); } }
  }

  // ── 공용 위젯 ──────────────────────────────────────────────
  Widget _clearBtn(VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 22, height: 22,
        decoration: const BoxDecoration(color: Color(0x2EFF3B30), shape: BoxShape.circle),
        child: const Center(child: Text('✕', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFF3B30)))),
      ),
    );
  }

  // ── 안내 다이얼로그 ────────────────────────────────────────
  void _showAlarmGuide() {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('알람 설정 안내', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 14), const Divider(height: 1, thickness: 0.5, color: _border), const SizedBox(height: 14),
            const Text('알람을 설정하면 설정한 시간에 선택한 콘텐츠가 채널 구독자에게 전화 방식으로 알람이 전송됩니다.', style: TextStyle(fontSize: 13, color: _text2, height: 1.55)),
            const SizedBox(height: 16),
            const Text('콘텐츠 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 4),
            const Text('선택한 콘텐츠(유튜브/영상/오디오)가 알람에 포함됩니다.\n링크를 입력하면 해당 콘텐츠로 연결됩니다.', style: TextStyle(fontSize: 13, color: _text2, height: 1.55)),
            const SizedBox(height: 14),
            const Text('연결 URL', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 4),
            const Text('알람 클릭 시 이동할 링크를 설정합니다.\n입력하지 않아도 알람 전송은 가능합니다.', style: TextStyle(fontSize: 13, color: _text2, height: 1.55)),
            const SizedBox(height: 14),
            const Text('날짜 / 시간 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _text)),
            const SizedBox(height: 4),
            const Text('선택한 시간에 알람이 자동 전송됩니다.', style: TextStyle(fontSize: 13, color: _text2, height: 1.55)),
            const SizedBox(height: 20),
            SizedBox(width: double.infinity, child: TextButton(
              onPressed: () => Navigator.pop(context),
              style: TextButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
              child: const Text('확인', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            )),
          ]),
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // 알람 목록
  // ══════════════════════════════════════════════════════════════
  Widget _buildAlarmList() {
    if (_loadingAlarms) {
      return const Padding(padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: _primary))));
    }
    if (_alarms.isEmpty) return const SizedBox.shrink();

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(padding: EdgeInsets.only(bottom: 10),
        child: Text('설정된 알람', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text))),
      Container(
        decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _border),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Column(children: _alarms.asMap().entries.map((entry) {
          final i = entry.key;
          final alarm = entry.value;
          final alarmId = alarm['id']?.toString() ?? '';
          final scheduledAt = _formatAlarmTime(alarm['scheduled_at']?.toString());
          final msgType = alarm['msg_type']?.toString() ?? '';
          final contentText = alarm['content_text']?.toString() ?? '';
          final typeIcon = msgType == 'youtube' ? Icons.smart_display
              : (msgType == 'video' ? Icons.videocam_outlined : Icons.music_note_outlined);
          final typeColor = msgType == 'youtube' ? Colors.red
              : (msgType == 'video' ? Colors.blue : _teal);

          return Column(children: [
            if (i > 0) const Divider(height: 1, color: _border),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12), child: Row(children: [
              Container(width: 36, height: 36, decoration: BoxDecoration(color: _teal.withOpacity(0.10), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.alarm, size: 18, color: _teal)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.channelName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _text), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (contentText.isNotEmpty) ...[const SizedBox(height: 3), Text(contentText, style: const TextStyle(fontSize: 12, color: Color(0xFF999999)), maxLines: 1, overflow: TextOverflow.ellipsis)],
                const SizedBox(height: 3),
                Row(children: [Text(scheduledAt, style: const TextStyle(fontSize: 12, color: _text2)), const SizedBox(width: 6), Icon(typeIcon, size: 14, color: typeColor)]),
              ])),
              GestureDetector(onTap: () => _deleteAlarm(alarmId), child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: _red.withOpacity(0.08), borderRadius: BorderRadius.circular(8)),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.delete_outline, size: 14, color: _red), SizedBox(width: 3), Text('삭제', style: TextStyle(fontSize: 12, color: _red, fontWeight: FontWeight.w500))]),
              )),
            ])),
          ]);
        }).toList()),
      ),
      const SizedBox(height: 12),
      if (_alarms.length < _maxAlarms && !_showAddForm)
        GestureDetector(onTap: _openAddForm, child: Container(
          width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: _teal.withOpacity(0.6), width: 1.5)),
          child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.add_circle_outline, size: 18, color: _teal), SizedBox(width: 6),
            Text('알람 추가하기', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _teal)),
          ]),
        )),
      const SizedBox(height: 16),
    ]);
  }

  // ══════════════════════════════════════════════════════════════
  // 날짜 선택 바 —  ◀  3월24일(월)  📅  ▶
  // ══════════════════════════════════════════════════════════════
  Widget _buildDateSelector() {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final isPastDisabled = !_selectedDate.isAfter(todayDate);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F8FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _primary.withOpacity(0.15)),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        // ◀ 이전 날
        GestureDetector(
          onTap: isPastDisabled ? null : () => _moveDate(-1),
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: isPastDisabled ? const Color(0xFFEEEEEE) : _primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.chevron_left, size: 22, color: isPastDisabled ? _text2.withOpacity(0.3) : _primary),
          ),
        ),
        const SizedBox(width: 8),
        // 날짜 텍스트
        Expanded(child: Center(
          child: Text(_formatDateLabel(_selectedDate),
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _text)),
        )),
        // 📅 캘린더 버튼
        GestureDetector(
          onTap: _openCalendar,
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: _primary.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(Icons.calendar_today, size: 18, color: _primary),
          ),
        ),
        const SizedBox(width: 8),
        // ▶ 다음 날
        GestureDetector(
          onTap: () => _moveDate(1),
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: _primary.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(Icons.chevron_right, size: 22, color: _primary),
          ),
        ),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // 스크롤 타임피커 (AM/PM · 시 · 분)
  // ══════════════════════════════════════════════════════════════
  Widget _buildTimePicker() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F8FF),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _primary.withOpacity(0.15)),
      ),
      child: SizedBox(
        height: 160,
        child: Row(children: [
          // AM/PM 스크롤
          Expanded(child: _wheelColumn(
            controller: _ampmCtrl,
            count: 2,
            selectedIndex: _ampmIndex,
            labelBuilder: (i) => i == 0 ? '오전' : '오후',
            onChanged: (i) => setState(() => _ampmIndex = i),
          )),
          // 시 스크롤 (1‥12)
          Expanded(child: _wheelColumn(
            controller: _hourCtrl,
            count: 12,
            selectedIndex: _hourIndex,
            labelBuilder: (i) => '${i + 1}',
            onChanged: (i) => setState(() => _hourIndex = i),
          )),
          // : 구분자
          const Padding(
            padding: EdgeInsets.only(bottom: 4),
            child: Text(':', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: _text)),
          ),
          // 분 스크롤 (00‥59)
          Expanded(child: _wheelColumn(
            controller: _minuteCtrl,
            count: 60,
            selectedIndex: _minuteIndex,
            labelBuilder: (i) => i.toString().padLeft(2, '0'),
            onChanged: (i) => setState(() => _minuteIndex = i),
          )),
        ]),
      ),
    );
  }

  /// ListWheelScrollView 단일 컬럼
  Widget _wheelColumn({
    required FixedExtentScrollController controller,
    required int count,
    required int selectedIndex,
    required String Function(int) labelBuilder,
    required ValueChanged<int> onChanged,
  }) {
    return ListWheelScrollView.useDelegate(
      controller: controller,
      itemExtent: 44,
      diameterRatio: 1.4,
      perspective: 0.003,
      physics: const FixedExtentScrollPhysics(),
      onSelectedItemChanged: onChanged,
      childDelegate: ListWheelChildBuilderDelegate(
        childCount: count,
        builder: (_, i) {
          final selected = i == selectedIndex;
          return Center(child: AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 150),
            style: TextStyle(
              fontSize: selected ? 24 : 16,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
              color: selected ? _primary : _text2.withOpacity(0.5),
            ),
            child: Text(labelBuilder(i)),
          ));
        },
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // build
  // ══════════════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    final youtubeDim   = _hasFile;
    final fileDim      = _hasYoutube;
    final isMaxReached = _alarms.length >= _maxAlarms;
    final showForm     = !isMaxReached && (_alarms.isEmpty || _showAddForm);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0.5,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('${widget.channelName} · 알람 설정',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text),
          overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(icon: const Icon(Icons.info_outline, size: 22, color: _text2), onPressed: _showAlarmGuide),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── 예약 알람 목록 ──────────────────────────────
            _buildAlarmList(),

            // ── 추가 폼 ────────────────────────────────────
            if (showForm) ...[
              // ── 시간 선택 ──────────────────────────────────
              const Text('시간 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
              const SizedBox(height: 10),
              _buildTimePicker(),
              const SizedBox(height: 16),

              // ── 날짜 선택 ──────────────────────────────────
              const Text('날짜 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
              const SizedBox(height: 10),
              _buildDateSelector(),
              const SizedBox(height: 16),

              // ── 알람내용 (선택, 최대 20자) ──────────────────
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Text('알람내용', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                    const SizedBox(width: 6),
                    const Text('(선택)', style: TextStyle(fontSize: 11, color: _text2)),
                    const Spacer(),
                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _contentTextCtrl,
                      builder: (_, v, __) => Text('${v.text.length}/20',
                        style: TextStyle(fontSize: 11, color: v.text.length >= 20 ? _red : _text2)),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    Container(width: 44, height: 44, decoration: BoxDecoration(color: _primary, borderRadius: BorderRadius.circular(12)),
                      child: const Icon(Icons.short_text, color: Colors.white, size: 22)),
                    const SizedBox(width: 10),
                    Expanded(child: Container(height: 44,
                      decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Row(children: [
                        Expanded(child: TextField(
                          controller: _contentTextCtrl, maxLength: 20, onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(hintText: '수신자에게 표시할 메시지 입력', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero, counterText: ''),
                          style: const TextStyle(fontSize: 13, color: _text),
                        )),
                        if (_contentTextCtrl.text.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _contentTextCtrl.clear(); setState(() {}); })),
                      ]),
                    )),
                  ]),
                ]),
              ),
              const SizedBox(height: 12),

              // ── 콘텐츠 선택 ────────────────────────────────
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('콘텐츠 선택', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(height: 10),
                  // YouTube 행
                  Opacity(opacity: youtubeDim ? 0.35 : 1.0, child: Row(children: [
                    GestureDetector(
                      onTap: youtubeDim ? null : () async {
                        const appUrl = 'youtube://'; const browserUrl = 'https://www.youtube.com';
                        final appUri = Uri.parse(appUrl); final webUri = Uri.parse(browserUrl);
                        if (await canLaunchUrl(appUri)) { await launchUrl(appUri, mode: LaunchMode.externalApplication); }
                        else { await launchUrl(webUri, mode: LaunchMode.externalApplication); }
                      },
                      child: Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.smart_display, color: Colors.white, size: 22)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Container(height: 44,
                      decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Row(children: [
                        Expanded(child: TextField(
                          controller: _youtubeCtrl, enabled: !youtubeDim,
                          onChanged: (_) { if (_youtubeCtrl.text.isNotEmpty && _hasFile) _clearFile(); else setState(() {}); },
                          decoration: const InputDecoration(hintText: 'URL 붙여넣기 (https://youtube.com/…)', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                          style: const TextStyle(fontSize: 13, color: _text),
                        )),
                        if (_hasYoutube) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(_clearYoutube)),
                      ]),
                    )),
                  ])),
                  const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider(height: 1, color: _border)),
                  // 파일 행
                  Opacity(opacity: fileDim ? 0.35 : 1.0, child: Row(children: [
                    GestureDetector(
                      onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                      child: Container(width: 44, height: 44,
                        decoration: BoxDecoration(color: _uploading ? Colors.blue.withOpacity(0.5) : Colors.blue, borderRadius: BorderRadius.circular(12)),
                        child: _uploading ? const Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.folder_open, color: Colors.white, size: 22),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: GestureDetector(
                      onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                      child: Container(height: 44,
                        decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Row(children: [
                          Expanded(child: _uploading
                              ? const Text('⬆️ 업로드 중...', style: TextStyle(fontSize: 13, color: _text2), overflow: TextOverflow.ellipsis)
                              : Text(_fileLabel(), style: TextStyle(fontSize: 13, color: _uploadedFileUrl != null ? _primary : (_hasFile ? _text : _text2)), overflow: TextOverflow.ellipsis)),
                          if (_hasFile && !_uploading) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _clearFile(); showCenterToast(context, '파일이 삭제되었습니다.'); })),
                        ]),
                      ),
                    )),
                  ])),
                ]),
              ),
              const SizedBox(height: 12),

              // ── 연결 URL ───────────────────────────────────
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(border: Border.all(color: _border), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('연결 URL', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(height: 10),
                  Row(children: [
                    Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.link, color: Colors.white, size: 22)),
                    const SizedBox(width: 10),
                    Expanded(child: Container(height: 44,
                      decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10), border: Border.all(color: _border)),
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Row(children: [
                        Expanded(child: TextField(
                          controller: _linkCtrl, onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(hintText: 'https://', hintStyle: TextStyle(fontSize: 13, color: _text2), border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                          style: const TextStyle(fontSize: 13, color: _text), keyboardType: TextInputType.url,
                        )),
                        if (_linkCtrl.text.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _linkCtrl.clear(); setState(() => _sameAsHomepage = false); })),
                      ]),
                    )),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    SizedBox(width: 20, height: 20, child: Checkbox(value: _sameAsHomepage, onChanged: (v) => setState(() => _sameAsHomepage = v ?? false), activeColor: _primary, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, visualDensity: VisualDensity.compact)),
                    const SizedBox(width: 8),
                    const Text('홈페이지와 동일', style: TextStyle(fontSize: 13, color: _text2)),
                  ]),
                ]),
              ),
              const SizedBox(height: 16),

              // ── 취소/확인 버튼 ─────────────────────────────
              Row(children: [
                Expanded(child: OutlinedButton(
                  onPressed: () {
                    if (_showAddForm && _alarms.isNotEmpty) { setState(() => _showAddForm = false); }
                    else { Navigator.pop(context); }
                  },
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: _border)),
                  child: const Text('취소', style: TextStyle(color: _text2)),
                )),
                const SizedBox(width: 12),
                Expanded(child: ElevatedButton(
                  onPressed: (_saving || _uploading) ? null : _submit,
                  style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, minimumSize: const Size.fromHeight(50), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: _saving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('확인'),
                )),
              ]),
            ], // if (showForm)

            // ── 3개 꽉 찼을 때 ───────────────────────────────
            if (isMaxReached)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: SizedBox(width: double.infinity, height: 50, child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), side: const BorderSide(color: _border)),
                  child: const Text('닫기', style: TextStyle(color: _text2)),
                )),
              ),
          ]),
        ),
      ),
    );
  }
}
