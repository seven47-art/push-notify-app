// lib/screens/alarm_schedule_screen.dart
// 스크린샷 기준: 알람 설정 바텀시트
// 채널명 · 알람 설정 제목 + 콘텐츠 선택(YouTube/파일) + 연결URL + 날짜/시간 선택 + 확인/취소
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
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
  String? _uploadedFileUrl;   // 업로드 완료 후 받은 download URL
  bool _uploading = false;    // 파일 업로드 중 여부
  bool _saving    = false;

  // ── 상태 헬퍼 ───────────────────────────────────────────────
  bool get _hasYoutube => _youtubeCtrl.text.isNotEmpty;
  bool get _hasFile    => _pickedFile != null;

  /// 파일 선택 초기화
  void _clearFile() {
    setState(() {
      _pickedFile      = null;
      _uploadedFileUrl = null;
      _uploading       = false;
    });
  }

  /// YouTube URL 초기화
  void _clearYoutube() {
    _youtubeCtrl.clear();
    setState(() {});
  }

  /// 파일 표시 텍스트 (웹뷰와 동일: 🎵/🎬 아이콘 + 파일명 + 용량)
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

  @override
  void dispose() {
    _youtubeCtrl.dispose();
    _linkCtrl.dispose();
    super.dispose();
  }

  /// Cloudflare Worker에 파일 업로드 후 download URL 반환
  Future<String> _uploadToWorker(String localPath, String fileName, String contentType) async {
    final prefs = await SharedPreferences.getInstance();
    final sessionToken = prefs.getString('session_token') ?? '';

    final uri = Uri.parse('$kBaseUrl/api/uploads/alarm-file');
    final request = http.MultipartRequest('POST', uri);
    request.fields['session_token'] = sessionToken;
    request.files.add(await http.MultipartFile.fromPath(
      'file', localPath,
      filename: fileName,
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
    if (json['success'] == true && json['url'] != null) {
      return json['url'] as String;
    }
    throw Exception('업로드 실패: ${json['error'] ?? body}');
  }

  Future<void> _pickFile() async {
    // FileType.any + 앱 코드 확장자 검사 (일부 기기에서 custom 필터가 동작 안함)
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      withData: false,
      withReadStream: false,
    );
    if (result == null || result.files.isEmpty) return;

    final f = result.files.first;
    if (f.path == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('파일 경로를 가져올 수 없습니다.')),
        );
      }
      return;
    }

    final ext = f.name.split('.').last.toLowerCase();

    // 확장자 검증
    const audioExts = ['mp3', 'm4a', 'wav', 'aac'];
    const videoExts = ['mp4', 'mov', 'mkv'];
    if (!audioExts.contains(ext) && !videoExts.contains(ext)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('허용되지 않는 형식입니다. (mp3, m4a, wav, aac, mp4, mov, mkv)\n선택한 파일: ${f.name}')),
        );
      }
      return;
    }

    // 파일 크기 검증
    final fileSize = await File(f.path!).length();
    final isVideo  = videoExts.contains(ext);
    final limitMb  = isVideo ? 50 : 10;
    if (fileSize > limitMb * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('파일 크기가 ${limitMb}MB를 초과합니다 (${(fileSize / 1024 / 1024).toStringAsFixed(1)}MB).')),
        );
      }
      return;
    }

    // MIME 타입 결정
    String mime;
    if (ext == 'mp3')      mime = 'audio/mpeg';
    else if (ext == 'wav') mime = 'audio/wav';
    else if (ext == 'aac') mime = 'audio/aac';
    else if (ext == 'm4a') mime = 'audio/mp4';
    else if (ext == 'mov') mime = 'video/quicktime';
    else if (ext == 'mkv') mime = 'video/x-matroska';
    else                   mime = 'video/mp4';

    // 파일 선택 시 → YouTube URL 초기화 (상호 배타)
    _youtubeCtrl.clear();

    // 파일 선택 상태 업데이트 + 업로드 시작
    setState(() {
      _pickedFile      = f;
      _uploadedFileUrl = null;
      _uploading       = true;
    });

    try {
      final fileName   = '${DateTime.now().millisecondsSinceEpoch}_${f.name}';
      final downloadUrl = await _uploadToWorker(f.path!, fileName, mime);
      if (mounted) {
        setState(() {
          _uploadedFileUrl = downloadUrl;
          _uploading       = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('✅ 업로드 완료: ${f.name}')),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _pickedFile      = null;
          _uploadedFileUrl = null;
          _uploading       = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('업로드 오류: $e')),
        );
      }
    }
  }

  Future<void> _pickDateTime() async {
    final picked = await showDialog<DateTime>(
      context: context,
      builder: (_) => _DateTimePickerDialog(initial: _scheduledAt),
    );
    if (picked != null) setState(() => _scheduledAt = picked);
  }

  String _formatDateTime(DateTime dt) {
    final now     = DateTime.now();
    final today   = DateTime(now.year, now.month, now.day);
    final itemDay = DateTime(dt.year, dt.month, dt.day);
    final ampm    = dt.hour < 12 ? '오전' : '오후';
    final hour    = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final min     = dt.minute.toString().padLeft(2, '0');
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
    // 파일 선택했지만 업로드가 아직 안 된 경우
    if (_pickedFile != null && _uploadedFileUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_uploading ? '파일 업로드 중입니다. 잠시 기다려주세요.' : '파일 업로드에 실패했습니다. 다시 선택해주세요.')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final prefs  = await SharedPreferences.getInstance();
      final token  = prefs.getString('session_token') ?? '';
      final userId = prefs.getString('user_id') ?? '';

      // msg_type / msg_value 결정
      String msgType  = '';
      String msgValue = '';
      if (_youtubeCtrl.text.isNotEmpty) {
        msgType  = 'youtube';
        msgValue = _youtubeCtrl.text;
      } else if (_pickedFile != null && _uploadedFileUrl != null) {
        final ext = _pickedFile!.name.split('.').last.toLowerCase();
        msgType  = ['mp4', 'mov', 'mkv'].contains(ext) ? 'video' : 'audio';
        msgValue = _uploadedFileUrl!;
      }

      final body = <String, dynamic>{
        'channel_id':   widget.channelId,
        'created_by':   userId,
        'scheduled_at': _scheduledAt.toUtc().toIso8601String(),
        'msg_type':     msgType,
        'msg_value':    msgValue,
        'link_url':     _linkCtrl.text,
      };

      final res = await http.post(
        Uri.parse('$kBaseUrl/api/alarms'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 15));

      final resBody = jsonDecode(res.body) as Map<String, dynamic>;
      if (mounted) {
        Navigator.pop(context);
        if (resBody['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('알람이 예약되었습니다.')),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(resBody['error']?.toString() ?? '알람 예약 실패')),
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

  // ── X 버튼 공통 위젯 ────────────────────────────────────────
  Widget _clearBtn(VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 22, height: 22,
        decoration: BoxDecoration(
          color: const Color(0x2EFF3B30),
          shape: BoxShape.circle,
        ),
        child: const Center(
          child: Text('✕',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFFF3B30)),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 상호 배타 dim 여부
    final youtubeDim = _hasFile;  // 파일이 있으면 YouTube 행 dim
    final fileDim    = _hasYoutube; // YouTube가 있으면 파일 행 dim

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

            // ── 콘텐츠 선택 섹션 ───────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('콘텐츠 선택',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(height: 10),

                  // ── YouTube 행 ──────────────────────────────
                  Opacity(
                    opacity: youtubeDim ? 0.35 : 1.0,
                    child: Row(
                      children: [
                        // YouTube 아이콘 버튼 (탭 → YouTube 앱/브라우저)
                        GestureDetector(
                          onTap: youtubeDim ? null : () async {
                            const appUrl     = 'youtube://';
                            const browserUrl = 'https://www.youtube.com';
                            final appUri = Uri.parse(appUrl);
                            final webUri = Uri.parse(browserUrl);
                            if (await canLaunchUrl(appUri)) {
                              await launchUrl(appUri, mode: LaunchMode.externalApplication);
                            } else {
                              await launchUrl(webUri, mode: LaunchMode.externalApplication);
                            }
                          },
                          child: Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(
                              color: Colors.red,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.smart_display, color: Colors.white, size: 22),
                          ),
                        ),
                        const SizedBox(width: 10),
                        // URL 입력 + X 버튼
                        Expanded(
                          child: Container(
                            height: 44,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F5F5),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: _border),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _youtubeCtrl,
                                    enabled: !youtubeDim,
                                    onChanged: (_) {
                                      // URL 입력 시 파일 초기화 (상호 배타)
                                      if (_youtubeCtrl.text.isNotEmpty && _hasFile) {
                                        _clearFile();
                                      } else {
                                        setState(() {});
                                      }
                                    },
                                    decoration: const InputDecoration(
                                      hintText: 'YouTube URL 붙여넣기',
                                      hintStyle: TextStyle(fontSize: 13, color: _text2),
                                      border: InputBorder.none,
                                      isDense: true,
                                      contentPadding: EdgeInsets.zero,
                                    ),
                                    style: const TextStyle(
                                      fontSize: 13,
                                      direction: TextDirection.ltr,
                                    ),
                                  ),
                                ),
                                // X 버튼 — URL 있을 때만
                                if (_hasYoutube)
                                  Padding(
                                    padding: const EdgeInsets.only(left: 4),
                                    child: _clearBtn(_clearYoutube),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1, color: _border),
                  ),

                  // ── 파일 행 ────────────────────────────────
                  Opacity(
                    opacity: fileDim ? 0.35 : 1.0,
                    child: Row(
                      children: [
                        // 파일 아이콘 버튼
                        GestureDetector(
                          onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                          child: Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(
                              color: _uploading
                                  ? Colors.blue.withOpacity(0.5)
                                  : Colors.blue,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: _uploading
                                ? const Padding(
                                    padding: EdgeInsets.all(10),
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Icon(Icons.folder_open, color: Colors.white, size: 22),
                          ),
                        ),
                        const SizedBox(width: 10),
                        // 파일 표시 영역 + X 버튼
                        Expanded(
                          child: GestureDetector(
                            onTap: (fileDim || _uploading || _saving) ? null : _pickFile,
                            child: Container(
                              height: 44,
                              decoration: BoxDecoration(
                                color: const Color(0xFFF5F5F5),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: _border),
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: _uploading
                                        ? const Text('⬆️ 업로드 중...',
                                            style: TextStyle(fontSize: 13, color: _text2),
                                            overflow: TextOverflow.ellipsis)
                                        : Text(
                                            _fileLabel(),
                                            style: TextStyle(
                                              fontSize: 13,
                                              color: _uploadedFileUrl != null
                                                  ? _primary
                                                  : (_hasFile ? _text : _text2),
                                            ),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                  ),
                                  // X 버튼 — 파일 있을 때만
                                  if (_hasFile && !_uploading)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 4),
                                      child: _clearBtn(() {
                                        _clearFile();
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(content: Text('파일이 삭제되었습니다.')),
                                        );
                                      }),
                                    ),
                                ],
                              ),
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

            // ── 연결 URL 섹션 ──────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('연결 URL',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(
                          color: Colors.orange,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.link, color: Colors.white, size: 22),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF5F5F5),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: _border),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _linkCtrl,
                                  onChanged: (_) => setState(() {}),
                                  decoration: const InputDecoration(
                                    hintText: 'https://',
                                    hintStyle: TextStyle(fontSize: 13, color: _text2),
                                    border: InputBorder.none,
                                    isDense: true,
                                    contentPadding: EdgeInsets.zero,
                                  ),
                                  style: const TextStyle(fontSize: 13),
                                  keyboardType: TextInputType.url,
                                ),
                              ),
                              // X 버튼 — URL 있을 때만
                              if (_linkCtrl.text.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(left: 4),
                                  child: _clearBtn(() {
                                    _linkCtrl.clear();
                                    setState(() => _sameAsHomepage = false);
                                  }),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      SizedBox(
                        width: 20, height: 20,
                        child: Checkbox(
                          value: _sameAsHomepage,
                          onChanged: (v) => setState(() => _sameAsHomepage = v ?? false),
                          activeColor: _primary,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text('홈페이지와 동일',
                        style: TextStyle(fontSize: 13, color: _text2)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ── 날짜/시간 선택 ─────────────────────────────────
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                border: Border.all(color: _border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('날짜 / 시간 선택',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text)),
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: _pickDateTime,
                    child: Row(
                      children: [
                        Container(
                          width: 44, height: 44,
                          decoration: BoxDecoration(
                            color: _primary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.access_time, color: Colors.white, size: 22),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _formatDateTime(_scheduledAt),
                            style: const TextStyle(
                              fontSize: 13, color: _primary, fontWeight: FontWeight.w500),
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

            // ── 취소 / 확인 버튼 ───────────────────────────────
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
                    onPressed: (_saving || _uploading) ? null : _submit,
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
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── 커스텀 날짜/시간 선택 다이얼로그 ──────────────────────────────────────────
class _DateTimePickerDialog extends StatefulWidget {
  final DateTime initial;
  const _DateTimePickerDialog({required this.initial});

  @override
  State<_DateTimePickerDialog> createState() => _DateTimePickerDialogState();
}

class _DateTimePickerDialogState extends State<_DateTimePickerDialog> {
  late DateTime _focusMonth;
  late DateTime _selectedDate;
  late bool _isAm;
  late int _hour12;
  late int _minute;

  static const _weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  @override
  void initState() {
    super.initState();
    final d = widget.initial;
    _focusMonth   = DateTime(d.year, d.month);
    _selectedDate = DateTime(d.year, d.month, d.day);
    _isAm         = d.hour < 12;
    final h       = d.hour % 12;
    _hour12       = h == 0 ? 12 : h;
    _minute       = d.minute;
  }

  DateTime _result() {
    final h24 = _isAm ? (_hour12 % 12) : (_hour12 % 12 + 12);
    return DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, h24, _minute);
  }

  List<DateTime?> _calendarDays() {
    final firstDay = DateTime(_focusMonth.year, _focusMonth.month, 1);
    final lastDay  = DateTime(_focusMonth.year, _focusMonth.month + 1, 0);
    final List<DateTime?> days = [];
    for (int i = 0; i < firstDay.weekday % 7; i++) days.add(null);
    for (int d = 1; d <= lastDay.day; d++) {
      days.add(DateTime(_focusMonth.year, _focusMonth.month, d));
    }
    return days;
  }

  @override
  Widget build(BuildContext context) {
    final days      = _calendarDays();
    final today     = DateTime.now();
    final todayDate = DateTime(today.year, today.month, today.day);

    const dialogBg     = Color(0xFFFFFFFF);
    const dialogText   = Color(0xFF222222);
    const dialogText2  = Color(0xFF888888);
    const dialogBorder = Color(0xFFEEEEEE);
    const dialogGridBg = Color(0xFFF5F5F5);

    return Theme(
      data: ThemeData.light().copyWith(
        dialogBackgroundColor: dialogBg,
        colorScheme: const ColorScheme.light(
          primary: _primary,
          surface: dialogBg,
          onSurface: dialogText,
        ),
      ),
      child: Dialog(
        backgroundColor: dialogBg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('날짜 / 시간 선택',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: dialogText)),
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: const Icon(Icons.close, color: dialogText2, size: 22),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text('날짜',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: dialogText)),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() =>
                          _focusMonth = DateTime(_focusMonth.year, _focusMonth.month - 1)),
                      child: const Icon(Icons.chevron_left, color: dialogText2),
                    ),
                    Text('${_focusMonth.year}년 ${_focusMonth.month}월',
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w600, color: dialogText)),
                    GestureDetector(
                      onTap: () => setState(() =>
                          _focusMonth = DateTime(_focusMonth.year, _focusMonth.month + 1)),
                      child: const Icon(Icons.chevron_right, color: dialogText2),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: _weekdays.asMap().entries.map((e) {
                    final color = e.key == 0
                        ? Colors.red
                        : (e.key == 6 ? _primary : dialogText);
                    return Expanded(
                      child: Center(
                        child: Text(e.value,
                            style: TextStyle(
                                fontSize: 12, fontWeight: FontWeight.w600, color: color)),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 4),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    childAspectRatio: 1.1,
                  ),
                  itemCount: days.length,
                  itemBuilder: (_, i) {
                    final d = days[i];
                    if (d == null) return const SizedBox();
                    final isSelected = d == _selectedDate;
                    final isToday    = d == todayDate;
                    final isPast     = d.isBefore(todayDate);
                    final col = i % 7 == 0
                        ? Colors.red
                        : (i % 7 == 6 ? _primary : dialogText);
                    return GestureDetector(
                      onTap: isPast ? null : () => setState(() => _selectedDate = d),
                      child: Container(
                        margin: const EdgeInsets.all(2),
                        decoration: isSelected
                            ? const BoxDecoration(color: _primary, shape: BoxShape.circle)
                            : null,
                        child: Center(
                          child: Text(
                            '${d.day}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isToday ? FontWeight.w700 : FontWeight.normal,
                              color: isSelected
                                  ? Colors.white
                                  : isPast
                                      ? dialogText2.withOpacity(0.4)
                                      : col,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                const Text('시간',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: dialogText)),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Column(
                      children: ['오전', '오후'].map((label) {
                        final selected = label == '오전' ? _isAm : !_isAm;
                        return GestureDetector(
                          onTap: () => setState(() => _isAm = label == '오전'),
                          child: Container(
                            width: 52, height: 36,
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            decoration: BoxDecoration(
                              color: selected ? _primary : const Color(0xFFEEEEEE),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Center(
                              child: Text(label,
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: selected ? Colors.white : dialogText2)),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(width: 16),
                    _Spinner(
                      value: _hour12,
                      min: 1, max: 12,
                      bgColor: dialogGridBg,
                      textColor: dialogText,
                      arrowColor: dialogText2,
                      onChanged: (v) => setState(() => _hour12 = v),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text(':',
                          style: TextStyle(
                              fontSize: 28, fontWeight: FontWeight.w700, color: dialogText)),
                    ),
                    _Spinner(
                      value: _minute,
                      min: 0, max: 59,
                      bgColor: dialogGridBg,
                      textColor: dialogText,
                      arrowColor: dialogText2,
                      onChanged: (v) => setState(() => _minute = v),
                      pad2: true,
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          side: const BorderSide(color: dialogBorder),
                        ),
                        child: const Text('취소', style: TextStyle(color: dialogText2)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(context, _result()),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _primary,
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('확인'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── 위/아래 버튼으로 숫자 올리는 스피너 ─────────────────────────────────────
class _Spinner extends StatelessWidget {
  final int value;
  final int min;
  final int max;
  final bool pad2;
  final ValueChanged<int> onChanged;
  final Color bgColor;
  final Color textColor;
  final Color arrowColor;

  const _Spinner({
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.pad2      = false,
    this.bgColor   = const Color(0xFFF5F5F5),
    this.textColor = const Color(0xFF222222),
    this.arrowColor = const Color(0xFF888888),
  });

  @override
  Widget build(BuildContext context) {
    final display = pad2 ? value.toString().padLeft(2, '0') : value.toString();
    return Column(
      children: [
        GestureDetector(
          onTap: () => onChanged(value >= max ? min : value + 1),
          child: Icon(Icons.keyboard_arrow_up, size: 28, color: arrowColor),
        ),
        Container(
          width: 56, height: 48,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(display,
                style: TextStyle(
                    fontSize: 26, fontWeight: FontWeight.w700, color: textColor)),
          ),
        ),
        GestureDetector(
          onTap: () => onChanged(value <= min ? max : value - 1),
          child: Icon(Icons.keyboard_arrow_down, size: 28, color: arrowColor),
        ),
      ],
    );
  }
}
