// lib/screens/alarm_schedule_screen.dart
// 삼성 기본 알람 골격 UI — 화이트/그레이, 미니멀, 큰 상태 텍스트, 둥근 카드
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

// ── 삼성 알람앱 색상 팔레트 ───────────────────────────────────
const _bgColor     = Color(0xFFF8F8F8);   // 전체 배경 (밝은 그레이)
const _cardColor   = Color(0xFFF2F2F7);   // 알람 카드 배경 (삼성 스타일 밝은 회색)
const _textPrimary = Color(0xFF1C1C1E);   // 주 텍스트 (거의 블랙)
const _textSecond  = Color(0xFF8E8E93);   // 보조 텍스트 (그레이)
const _textMuted   = Color(0xFFAEAEB2);   // 뮤트 텍스트
const _divider     = Color(0xFFE5E5EA);   // 구분선
const _accent      = Color(0xFF007AFF);   // 삼성/iOS 블루 액센트
const _red         = Color(0xFFFF3B30);   // 삭제 빨강

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
// 메인: 알람 목록 (풀페이지 — 삼성 기본 알람 골격)
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
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text('알람 삭제', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: _textPrimary)),
        content: const Text('이 알람을 삭제하시겠습니까?', style: TextStyle(fontSize: 15, color: _textSecond)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('취소', style: TextStyle(color: _textSecond))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('삭제', style: TextStyle(color: _red, fontWeight: FontWeight.w600))),
        ],
      ),
    );
    if (confirm != true) return;
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
    final now = DateTime.now();
    final futureCount = _alarms.where((a) {
      final s = a['scheduled_at']?.toString();
      if (s == null) return false;
      try { return DateTime.parse(s).toLocal().isAfter(now); } catch (_) { return false; }
    }).length;
    if (futureCount >= _maxAlarms) {
      showCenterToast(context, '알람은 채널당 최대 $_maxAlarms개까지 설정할 수 있습니다.');
      return;
    }
    final result = await Navigator.push<bool>(context, MaterialPageRoute(
      builder: (_) => _AlarmAddFormScreen(channelId: widget.channelId, channelName: widget.channelName),
    ));
    if (result == true) await _loadAlarms();
  }

  // ── 삼성 스타일: 큰 상태 텍스트 ─────────────────────────────
  Widget _buildStatusHeader() {
    final now = DateTime.now();
    final futureCount = _alarms.where((a) {
      final s = a['scheduled_at']?.toString();
      if (s == null) return false;
      try { return DateTime.parse(s).toLocal().isAfter(now); } catch (_) { return false; }
    }).length;
    final pastCount = _alarms.length - futureCount;
    String statusText;
    if (_loadingAlarms) {
      statusText = '';
    } else if (_alarms.isEmpty) {
      statusText = '예약된 알람이\n없습니다';
    } else if (futureCount > 0 && pastCount > 0) {
      statusText = '예약 ${futureCount}개  ·  지난 알람 ${pastCount}개';
    } else if (futureCount > 0) {
      statusText = '${futureCount}개의 알람이\n예약되어 있습니다';
    } else {
      statusText = '지난 알람 ${pastCount}개';
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 20, 28, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 채널 정보
          Row(
            children: [
              channelAvatar(
                imageUrl: widget.channelImageUrl,
                name: widget.channelName,
                size: 44,
                bgColor: _cardColor,
                borderRadius: 12,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.channelName,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: _textSecond),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // 삼성 스타일 큰 상태 텍스트
          Text(
            statusText,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: _textPrimary,
              height: 1.3,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  // ── 삼성 스타일 알람 카드 ───────────────────────────────────
  Widget _buildAlarmCard(Map<String, dynamic> alarm) {
    final alarmId     = alarm['id']?.toString() ?? '';
    final msgType     = alarm['msg_type']?.toString() ?? '';
    final contentText = alarm['content_text']?.toString() ?? '';
    final scheduledAt = alarm['scheduled_at']?.toString();

    // 지난 알람 여부 판별
    bool isPast = false;
    String ampm = '오전', timeStr = '0:00', dateStr = '';
    if (scheduledAt != null) {
      try {
        final dt = DateTime.parse(scheduledAt).toLocal();
        ampm = dt.hour < 12 ? '오전' : '오후';
        final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
        final min  = dt.minute.toString().padLeft(2, '0');
        timeStr = '$hour:$min';
        dateStr = '${dt.month}월 ${dt.day}일';
        isPast = dt.isBefore(DateTime.now());
      } catch (_) {}
    }

    // 콘텐츠 아이콘 (에셋 이미지)
    String typeAsset;
    String typeLabel;
    if (msgType == 'youtube') {
      typeAsset = 'assets/icons/ic_form_youtube.png';
      typeLabel = 'YouTube';
    } else if (msgType == 'video' || msgType == 'audio') {
      typeAsset = 'assets/icons/ic_form_file.png';
      typeLabel = msgType == 'video' ? '동영상' : '오디오';
    } else {
      typeAsset = 'assets/icons/ic_form_file.png';
      typeLabel = '파일';
    }

    // 지난 알람: 연한색
    final primaryColor = isPast ? _textMuted : _textPrimary;
    final secondColor  = isPast ? _textMuted.withOpacity(0.6) : _textSecond;
    final cardBg       = isPast ? const Color(0xFFEDEDED) : _cardColor;

    return Container(
      height: 130,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── 왼쪽: 날짜 + 시간 + 아이콘·내용 ──
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 날짜 (시간 위)
                Text(dateStr, style: TextStyle(fontSize: 13, color: secondColor, fontWeight: FontWeight.w400)),
                const SizedBox(height: 2),
                // AM/PM + 시간
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(ampm, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w400, color: primaryColor, height: 1.0)),
                    const SizedBox(width: 6),
                    Text(timeStr, style: TextStyle(fontSize: 44, fontWeight: FontWeight.w300, color: primaryColor, height: 1.0, letterSpacing: -1.5)),
                  ],
                ),
                const Spacer(),
                // 아이콘 + 알람 내용 (typeLabel 텍스트 삭제)
                Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: Opacity(opacity: isPast ? 0.4 : 1.0, child: Image.asset(typeAsset, width: 16, height: 16)),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        contentText.isNotEmpty ? contentText : ' ',
                        style: TextStyle(fontSize: 13, color: secondColor),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // ── 오른쪽: 삭제 + 뱃지 + (다시예약) ──
          Column(
            children: [
              GestureDetector(
                onTap: () => _deleteAlarm(alarmId),
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Icon(Icons.delete_outline_rounded, size: 22, color: isPast ? _textMuted.withOpacity(0.4) : _textMuted),
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isPast ? _red.withOpacity(0.12) : _accent.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  isPast ? '지난알람' : '예약알람',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isPast ? _red : _accent),
                ),
              ),
              if (isPast) ...[
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () => _openRescheduleForm(alarm),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: _accent, borderRadius: BorderRadius.circular(8)),
                    child: const Text('다시 예약', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// 지난 알람 → 데이터 복사하여 새 알람 추가 폼 열기 (저장 성공 시 원본 삭제)
  Future<void> _openRescheduleForm(Map<String, dynamic> alarm) async {
    final result = await Navigator.push<bool>(context, MaterialPageRoute(
      builder: (_) => _AlarmAddFormScreen(
        channelId: widget.channelId,
        channelName: widget.channelName,
        prefillData: alarm,
        deleteAfterSaveId: alarm['id']?.toString(),
      ),
    ));
    if (result == true) await _loadAlarms();
  }

  @override
  Widget build(BuildContext context) {
    // 미래 알람만 카운트하여 + 버튼 제한
    final now = DateTime.now();
    final futureAlarms = _alarms.where((a) {
      final s = a['scheduled_at']?.toString();
      if (s == null) return false;
      try { return DateTime.parse(s).toLocal().isAfter(now); } catch (_) { return false; }
    }).toList();
    final isMaxReached = futureAlarms.length >= _maxAlarms;

    // 정렬: 미래 알람 위(시간순), 지난 알람 아래(최근순)
    final sortedAlarms = List<Map<String, dynamic>>.from(_alarms);
    sortedAlarms.sort((a, b) {
      final sa = a['scheduled_at']?.toString() ?? '';
      final sb = b['scheduled_at']?.toString() ?? '';
      DateTime? da, db;
      try { da = DateTime.parse(sa).toLocal(); } catch (_) {}
      try { db = DateTime.parse(sb).toLocal(); } catch (_) {}
      if (da == null || db == null) return 0;
      final aPast = da.isBefore(now);
      final bPast = db.isBefore(now);
      if (aPast != bPast) return aPast ? 1 : -1; // 미래 먼저
      return aPast ? db.compareTo(da) : da.compareTo(db); // 미래:오름차순, 과거:내림차순
    });

    return Scaffold(
      backgroundColor: Colors.white,
      // 삼성 스타일: 앱바 없이 SafeArea + 뒤로가기/+ 버튼만
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── 상단 네비게이션 바 (삼성: 미니멀) ──────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: _textPrimary),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const Spacer(),
                ],
              ),
            ),

            // ── 큰 상태 텍스트 + 채널 정보 ──────────────────
            _buildStatusHeader(),
            const SizedBox(height: 28),

            // ── + 버튼 + 점3개 (삼성 스타일: 리스트 바로 위) ────
            if (!_loadingAlarms)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 12, 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (!isMaxReached)
                      IconButton(
                        icon: const Icon(Icons.add, size: 26, color: _textPrimary),
                        onPressed: _openAddForm,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                  ],
                ),
              ),

            // ── 알람 리스트 ──────────────────────────────────
            Expanded(
              child: _loadingAlarms
                  ? const Center(child: CircularProgressIndicator(color: _textMuted, strokeWidth: 2))
                  : _alarms.isEmpty
                      ? const SizedBox.shrink()  // 빈 상태는 큰 텍스트로 이미 표현
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
                          itemCount: sortedAlarms.length,
                          itemBuilder: (_, i) => _buildAlarmCard(sortedAlarms[i]),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// 알람 추가 폼 (별도 풀페이지 — 삼성 톤 유지)
// ══════════════════════════════════════════════════════════════════
class _AlarmAddFormScreen extends StatefulWidget {
  final String channelId;
  final String channelName;
  final Map<String, dynamic>? prefillData;  // 지난 알람 '다시 예약' 시 콘텐츠 복사용 (항상 신규 POST)
  final String? deleteAfterSaveId;  // 다시 예약 시 저장 성공 후 삭제할 원본 알람 ID
  const _AlarmAddFormScreen({required this.channelId, required this.channelName, this.prefillData, this.deleteAfterSaveId});

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
  bool get _hasFile    => _pickedFile != null || _existingFileUrl != null;

  String? _existingFileUrl;  // 다시 예약: 기존 파일 URL 복사

  static const _weekdayNames = ['월', '화', '수', '목', '금', '토', '일'];

  @override
  void initState() {
    super.initState();
    // 날짜는 항상 오늘, 시간은 +10분 (신규든 수정이든)
    final init = DateTime.now().add(const Duration(minutes: 10));
    _selectedDate = DateTime(init.year, init.month, init.day);
    _ampmIndex    = init.hour < 12 ? 0 : 1;
    final h12     = init.hour % 12;
    _hourIndex    = h12 == 0 ? 11 : h12 - 1;
    _minuteIndex  = init.minute;
    _ampmCtrl   = FixedExtentScrollController(initialItem: _ampmIndex);
    _hourCtrl   = FixedExtentScrollController(initialItem: _hourIndex);
    _minuteCtrl = FixedExtentScrollController(initialItem: _minuteIndex);

    // 다시 예약: 기존 알람 콘텐츠 복사 (날짜/시간은 항상 오늘+10분)
    if (widget.prefillData != null) {
      final a = widget.prefillData!;
      final msgType  = a['msg_type']?.toString() ?? '';
      final msgValue = a['msg_value']?.toString() ?? '';
      final linkUrl  = a['link_url']?.toString() ?? '';
      final cText    = a['content_text']?.toString() ?? '';

      if (msgType == 'youtube') {
        _youtubeCtrl.text = msgValue;
      } else if (msgValue.isNotEmpty) {
        _existingFileUrl  = msgValue;
        _uploadedFileUrl  = msgValue;
      }
      _linkCtrl.text = linkUrl;
      _contentTextCtrl.text = cText;
    }
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
          colorScheme: const ColorScheme.light(primary: _accent, onPrimary: Colors.white, surface: Colors.white, onSurface: _textPrimary),
          dialogBackgroundColor: Colors.white,
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = DateTime(picked.year, picked.month, picked.day));
  }

  void _clearFile() { setState(() { _pickedFile = null; _uploadedFileUrl = null; _existingFileUrl = null; _uploading = false; }); }
  void _clearYoutube() { _youtubeCtrl.clear(); setState(() {}); }

  String _fileLabel() {
    // 다시 예약: 기존 파일 URL만 있는 경우 (새로 선택 안 함)
    if (_pickedFile == null && _existingFileUrl != null) {
      final uri = Uri.tryParse(_existingFileUrl!);
      final fileName = uri != null ? Uri.decodeComponent(uri.pathSegments.last) : '기존 파일';
      return '✓ $fileName';
    }
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

  /// 유튜브 아이콘 탭 → 유튜브 앱/브라우저 열기
  Future<void> _launchYoutube(String url) async {
    String ytUrl = url.trim();
    if (ytUrl.isEmpty) return;
    if (!ytUrl.startsWith('http://') && !ytUrl.startsWith('https://')) {
      ytUrl = 'https://$ytUrl';
    }
    final uri = Uri.tryParse(ytUrl);
    if (uri != null) {
      try {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } catch (_) {
        if (mounted) showCenterToast(context, 'URL을 열 수 없습니다.');
      }
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
    if (_youtubeCtrl.text.isEmpty && _pickedFile == null && _existingFileUrl == null) { showCenterToast(context, 'YouTube URL 또는 파일을 선택해주세요.'); return; }
    if (_youtubeCtrl.text.isNotEmpty && !_isValidYoutubeUrl(_youtubeCtrl.text)) { showCenterToast(context, '올바른 YouTube URL을 입력해주세요.'); return; }
    if (_pickedFile != null && _uploadedFileUrl == null) { showCenterToast(context, _uploading ? '파일 업로드 중입니다.' : '파일 업로드에 실패했습니다.'); return; }
    setState(() => _saving = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';
      String msgType = '', msgValue = '';
      if (_youtubeCtrl.text.isNotEmpty) { msgType = 'youtube'; msgValue = _youtubeCtrl.text; }
      else if (_uploadedFileUrl != null) {
        if (_pickedFile != null) {
          final ext = _pickedFile!.name.split('.').last.toLowerCase();
          msgType = ['mp4', 'mov', 'mkv'].contains(ext) ? 'video' : 'audio';
        } else {
          msgType = widget.prefillData?['msg_type']?.toString() ?? 'audio';
        }
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
          // 다시 예약: 원본 지난 알람 삭제
          if (widget.deleteAfterSaveId != null) {
            try {
              await http.delete(
                Uri.parse('$kBaseUrl/api/alarms/${widget.deleteAfterSaveId}'),
                headers: {'Authorization': 'Bearer $token'},
              ).timeout(const Duration(seconds: 10));
            } catch (_) {
              // 삭제 실패해도 새 알람은 이미 생성됨 — 무시
            }
          }
          showCenterToast(context, '알람이 예약되었습니다.');
          Navigator.pop(context, true);
        } else { setState(() => _saving = false); showCenterToast(context, resBody['error']?.toString() ?? '알람 저장 실패'); }
      }
    } catch (e) { if (mounted) { setState(() => _saving = false); showCenterToast(context, '오류: $e'); } }
  }

  Widget _clearBtn(VoidCallback onTap) {
    return GestureDetector(onTap: onTap, child: Container(
      width: 22, height: 22,
      decoration: const BoxDecoration(color: Color(0x20FF3B30), shape: BoxShape.circle),
      child: const Center(child: Icon(Icons.close, size: 14, color: _red)),
    ));
  }

  // ── 날짜 선택 바 (삼성 톤) ─────────────────────────────────
  Widget _buildDateSelector() {
    final today = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);
    final isPastDisabled = !_selectedDate.isAfter(todayDate);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      decoration: BoxDecoration(color: _cardColor, borderRadius: BorderRadius.circular(14)),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        GestureDetector(
          onTap: isPastDisabled ? null : () => _moveDate(-1),
          child: Icon(Icons.chevron_left_rounded, size: 28, color: isPastDisabled ? _textMuted.withOpacity(0.3) : _textPrimary),
        ),
        const SizedBox(width: 4),
        Expanded(child: Center(child: Text(
          _formatDateLabel(_selectedDate),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _textPrimary),
        ))),
        GestureDetector(
          onTap: _openCalendar,
          child: const Icon(Icons.calendar_today_rounded, size: 20, color: _textSecond),
        ),
        const SizedBox(width: 12),
        GestureDetector(
          onTap: () => _moveDate(1),
          child: const Icon(Icons.chevron_right_rounded, size: 28, color: _textPrimary),
        ),
      ]),
    );
  }

  // ── 스크롤 타임피커 (삼성 톤) ──────────────────────────────
  Widget _buildTimePicker() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: _cardColor, borderRadius: BorderRadius.circular(14)),
      child: SizedBox(height: 180, child: Stack(
        children: [
          // 선택 영역 하이라이트 (삼성 스타일)
          Center(
            child: Container(
              height: 44,
              margin: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          Row(children: [
            Expanded(child: _wheelColumn(
              controller: _ampmCtrl, count: 2, selectedIndex: _ampmIndex,
              labelBuilder: (i) => i == 0 ? '오전' : '오후',
              onChanged: (i) => setState(() => _ampmIndex = i),
            )),
            Expanded(flex: 2, child: _wheelColumn(
              controller: _hourCtrl, count: 12, selectedIndex: _hourIndex,
              labelBuilder: (i) => '${i + 1}',
              onChanged: (i) => setState(() => _hourIndex = i),
            )),
            const Padding(
              padding: EdgeInsets.only(bottom: 4),
              child: Text(':', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w300, color: _textPrimary)),
            ),
            Expanded(flex: 2, child: _wheelColumn(
              controller: _minuteCtrl, count: 60, selectedIndex: _minuteIndex,
              labelBuilder: (i) => i.toString().padLeft(2, '0'),
              onChanged: (i) => setState(() => _minuteIndex = i),
            )),
          ]),
        ],
      )),
    );
  }

  Widget _wheelColumn({
    required FixedExtentScrollController controller,
    required int count,
    required int selectedIndex,
    required String Function(int) labelBuilder,
    required ValueChanged<int> onChanged,
  }) {
    return ListWheelScrollView.useDelegate(
      controller: controller, itemExtent: 44, diameterRatio: 1.4, perspective: 0.003,
      physics: const FixedExtentScrollPhysics(), onSelectedItemChanged: onChanged,
      childDelegate: ListWheelChildBuilderDelegate(childCount: count, builder: (_, i) {
        final selected = i == selectedIndex;
        return Center(child: AnimatedDefaultTextStyle(
          duration: const Duration(milliseconds: 150),
          style: TextStyle(
            fontSize: selected ? 22 : 16,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? _textPrimary : _textMuted,
          ),
          child: Text(labelBuilder(i)),
        ));
      }),
    );
  }

  // ── 섹션 라벨 (삼성 스타일: 작은 캡션) ─────────────────────
  Widget _sectionLabel(String label, {String? sub}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: _textPrimary)),
        if (sub != null) ...[
          const SizedBox(width: 6),
          Text(sub, style: const TextStyle(fontSize: 12, color: _textMuted)),
        ],
      ]),
    );
  }

  // ── 입력 행 (아이콘 + 텍스트필드 — 삼성 톤) ────────────────
  Widget _inputRow({
    required TextEditingController controller,
    required String hint,
    String? iconAsset,
    IconData? icon,
    Color? iconColor,
    bool enabled = true,
    VoidCallback? onTap,
    VoidCallback? onClear,
    bool showClear = false,
    Widget? trailing,
    TextInputType? keyboardType,
    VoidCallback? onChanged,
    VoidCallback? onIconTap,
  }) {
    Widget iconWidget;
    if (iconAsset != null) {
      iconWidget = ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.asset(iconAsset, width: 44, height: 44, fit: BoxFit.cover),
      );
    } else {
      iconWidget = Container(
        width: 44, height: 44,
        decoration: BoxDecoration(color: iconColor ?? _accent, borderRadius: BorderRadius.circular(12)),
        child: Icon(icon ?? Icons.info, color: Colors.white, size: 22),
      );
    }
    return Row(children: [
      onIconTap != null
          ? GestureDetector(onTap: onIconTap, child: iconWidget)
          : iconWidget,
      const SizedBox(width: 10),
      Expanded(child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 44,
          decoration: BoxDecoration(color: _cardColor, borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            Expanded(child: TextField(
              controller: controller,
              enabled: enabled,
              onChanged: (_) { onChanged?.call(); setState(() {}); },
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: const TextStyle(fontSize: 13, color: _textMuted),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
                counterText: '',
              ),
              style: const TextStyle(fontSize: 14, color: _textPrimary),
              keyboardType: keyboardType,
              maxLength: controller == _contentTextCtrl ? 20 : null,
            )),
            if (showClear && onClear != null) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(onClear)),
            if (trailing != null) trailing,
          ]),
        ),
      )),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final youtubeDim = _hasFile;
    final fileDim = _hasYoutube;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // ── 상단 바 (삼성 스타일) ───────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
              child: Row(children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: _textPrimary),
                  onPressed: () => Navigator.pop(context),
                ),
                const Spacer(),
                Text('알람 추가', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: _textPrimary)),
                const Spacer(),
                const SizedBox(width: 48),  // 밸런스용
              ]),
            ),
            const SizedBox(height: 8),

            // ── 폼 본문 ──────────────────────────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // 시간 선택
                  _sectionLabel('시간'),
                  _buildTimePicker(),
                  const SizedBox(height: 20),

                  // 날짜 선택
                  _sectionLabel('날짜'),
                  _buildDateSelector(),
                  const SizedBox(height: 24),

                  // 구분선
                  const Divider(color: _divider, height: 1),
                  const SizedBox(height: 24),

                  // 알람 내용
                  _sectionLabel('알람 내용', sub: '선택'),
                  _inputRow(
                    icon: Icons.short_text_rounded,
                    iconColor: const Color(0xFF7C4DFF),
                    controller: _contentTextCtrl,
                    hint: '수신자에게 표시할 메시지',
                    showClear: _contentTextCtrl.text.isNotEmpty,
                    onClear: () { _contentTextCtrl.clear(); setState(() {}); },
                    trailing: ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _contentTextCtrl,
                      builder: (_, v, __) => Text(
                        '${v.text.length}/20',
                        style: TextStyle(fontSize: 11, color: v.text.length >= 20 ? _red : _textMuted),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // 알람화면 선택
                  _sectionLabel('알람화면'),
                  // YouTube
                  Opacity(
                    opacity: youtubeDim ? 0.35 : 1.0,
                    child: _inputRow(
                      iconAsset: 'assets/icons/ic_form_youtube.png',
                      controller: _youtubeCtrl,
                      hint: 'URL 붙여넣기 (https://youtube.com/...)',
                      enabled: !youtubeDim,
                      showClear: _hasYoutube,
                      onClear: _clearYoutube,
                      onChanged: () { if (_youtubeCtrl.text.isNotEmpty && _hasFile) _clearFile(); },
                      onIconTap: () => _launchYoutube(_youtubeCtrl.text.isNotEmpty ? _youtubeCtrl.text : 'https://youtube.com'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  // 파일
                  Opacity(
                    opacity: fileDim ? 0.35 : 1.0,
                    child: Row(children: [
                      GestureDetector(
                        onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                        child: _uploading
                            ? Container(
                                width: 44, height: 44,
                                decoration: BoxDecoration(color: const Color(0xFF4A90D9), borderRadius: BorderRadius.circular(12)),
                                child: const Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                              )
                            : ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.asset('assets/icons/ic_form_file.png', width: 44, height: 44, fit: BoxFit.cover),
                              ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: GestureDetector(
                        onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                        child: Container(
                          height: 44,
                          decoration: BoxDecoration(color: _cardColor, borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Row(children: [
                            Expanded(child: _uploading
                                ? const Text('업로드 중...', style: TextStyle(fontSize: 13, color: _textMuted))
                                : Text(_fileLabel(), style: TextStyle(fontSize: 13, color: _hasFile ? _textPrimary : _textMuted), overflow: TextOverflow.ellipsis)),
                            if (_hasFile && !_uploading) Padding(padding: const EdgeInsets.only(left: 4), child: _clearBtn(() { _clearFile(); showCenterToast(context, '파일이 삭제되었습니다.'); })),
                          ]),
                        ),
                      )),
                    ]),
                  ),
                  const SizedBox(height: 20),

                  // 연결 URL
                  _sectionLabel('연결 URL', sub: '선택'),
                  _inputRow(
                    iconAsset: 'assets/icons/ic_form_link.png',
                    controller: _linkCtrl,
                    hint: 'https://',
                    showClear: _linkCtrl.text.isNotEmpty,
                    onClear: () { _linkCtrl.clear(); setState(() => _sameAsHomepage = false); },
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    SizedBox(width: 20, height: 20, child: Checkbox(
                      value: _sameAsHomepage, onChanged: (v) => setState(() => _sameAsHomepage = v ?? false),
                      activeColor: _accent, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, visualDensity: VisualDensity.compact,
                    )),
                    const SizedBox(width: 8),
                    const Text('홈페이지와 동일', style: TextStyle(fontSize: 13, color: _textSecond)),
                  ]),
                  const SizedBox(height: 32),

                  // 취소/확인 버튼 (삼성 스타일)
                  Row(children: [
                    Expanded(child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        side: const BorderSide(color: _divider),
                      ),
                      child: const Text('취소', style: TextStyle(fontSize: 16, color: _textSecond, fontWeight: FontWeight.w500)),
                    )),
                    const SizedBox(width: 12),
                    Expanded(child: ElevatedButton(
                      onPressed: (_saving || _uploading) ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _textPrimary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: _textMuted,
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      child: _saving
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('저장', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    )),
                  ]),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
