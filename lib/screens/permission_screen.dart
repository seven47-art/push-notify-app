// lib/screens/permission_screen.dart  v1
// 최초 설치 후 로그인 완료 → 필수 권한 안내 및 승인 절차
// 모든 권한 완료 시 메인 화면으로 이동

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PermissionScreen extends StatefulWidget {
  const PermissionScreen({super.key});
  @override
  State<PermissionScreen> createState() => _PermissionScreenState();
}

class _PermissionScreenState extends State<PermissionScreen>
    with TickerProviderStateMixin {

  // ── 권한 항목 정의 ────────────────────────────────
  // [중요도순] 알림 → 정확한알람 → 배터리최적화 → 마이크 → 카메라
  final List<_PermItem> _items = [
    _PermItem(
      permission:  Permission.notification,
      icon:        Icons.notifications_active_rounded,
      color:       const Color(0xFF6C63FF),
      title:       '알림 권한',
      subtitle:    '알람이 도착하면 즉시 알려드립니다',
      description: '이 앱의 핵심 기능입니다.\n승인하지 않으면 알람을 받을 수 없습니다.',
      required:    true,
    ),
    _PermItem(
      permission:  Permission.scheduleExactAlarm,
      icon:        Icons.alarm_on_rounded,
      color:       const Color(0xFF10B981),
      title:       '정확한 알람 권한',
      subtitle:    '설정된 시간에 정확하게 알람을 울립니다',
      description: '지정된 시간에 정확히 알람을 실행하기 위해 필요합니다.',
      required:    true,
    ),
    _PermItem(
      permission:  Permission.ignoreBatteryOptimizations,
      icon:        Icons.battery_charging_full_rounded,
      color:       const Color(0xFFF59E0B),
      title:       '배터리 최적화 제외',
      subtitle:    '앱이 꺼져 있어도 알람을 받습니다',
      description: '배터리 절약 모드에서 앱이 강제 종료되면 알람을 못 받습니다.\n이 앱을 배터리 최적화에서 제외해 주세요.',
      required:    true,
    ),
    _PermItem(
      permission:  Permission.microphone,
      icon:        Icons.mic_rounded,
      color:       const Color(0xFF3B82F6),
      title:       '마이크 권한',
      subtitle:    '오디오 메시지 녹음 시 사용됩니다',
      description: '채널에 오디오 메시지를 전송할 때만 사용됩니다.',
      required:    false,
    ),
    _PermItem(
      permission:  Permission.camera,
      icon:        Icons.videocam_rounded,
      color:       const Color(0xFFEC4899),
      title:       '카메라 권한',
      subtitle:    '영상 메시지 녹화 시 사용됩니다',
      description: '채널에 비디오 메시지를 전송할 때만 사용됩니다.',
      required:    false,
    ),
  ];

  int _currentStep = 0;        // 현재 진행 중인 권한 인덱스
  bool _isRequesting = false;
  late final AnimationController _pulseCtrl;
  late final Animation<double>   _pulseAnim;
  late final AnimationController _slideCtrl;
  late final Animation<Offset>   _slideAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
    _slideCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _slideCtrl, curve: Curves.easeOut));
    _slideCtrl.forward();
    _checkAlreadyGranted();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _slideCtrl.dispose();
    super.dispose();
  }

  // 이미 허용된 권한은 건너뛰기
  Future<void> _checkAlreadyGranted() async {
    for (int i = 0; i < _items.length; i++) {
      final status = await _items[i].permission.status;
      if (status.isGranted || status.isLimited) {
        _items[i].granted = true;
      }
    }
    // 현재 단계부터 시작 (이미 허용된 것 건너뜀)
    final first = _items.indexWhere((e) => !e.granted);
    if (first == -1) {
      // 모든 권한 이미 허용 → 바로 완료
      await _finishAndGoMain();
      return;
    }
    if (mounted) setState(() => _currentStep = first);
  }

  // ── 현재 권한 요청 ──────────────────────────────
  Future<void> _requestCurrent() async {
    if (_isRequesting) return;
    setState(() => _isRequesting = true);

    final item = _items[_currentStep];

    try {
      PermissionStatus status;

      // 배터리 최적화 제외는 별도 처리 (시스템 설정 화면 이동)
      if (item.permission == Permission.ignoreBatteryOptimizations) {
        status = await Permission.ignoreBatteryOptimizations.request();
        if (!status.isGranted) {
          // 시스템 설정으로 직접 안내
          await openAppSettings();
          // 설정 복귀 후 재확인
          await Future.delayed(const Duration(seconds: 2));
          status = await Permission.ignoreBatteryOptimizations.status;
        }
      } else if (item.permission == Permission.scheduleExactAlarm) {
        status = await Permission.scheduleExactAlarm.request();
        if (status.isPermanentlyDenied) {
          await openAppSettings();
          await Future.delayed(const Duration(seconds: 2));
          status = await Permission.scheduleExactAlarm.status;
        }
      } else {
        status = await item.permission.request();
        if (status.isPermanentlyDenied) {
          // 영구 거부 → 설정 화면 안내
          if (mounted) await _showPermanentlyDeniedDialog(item);
          status = await item.permission.status;
        }
      }

      item.granted  = status.isGranted || status.isLimited;
      item.denied   = status.isDenied || status.isPermanentlyDenied;
    } catch (e) {
      item.denied = true;
    }

    if (mounted) setState(() => _isRequesting = false);
    await _moveToNext();
  }

  // ── 다음 권한으로 이동 ────────────────────────────
  Future<void> _moveToNext() async {
    final nextIdx = _items.indexWhere((e) => !e.granted, _currentStep + 1);
    if (nextIdx == -1) {
      // 남은 권한 없음 → 완료
      await _finishAndGoMain();
      return;
    }
    // 슬라이드 애니메이션
    _slideCtrl.reset();
    if (mounted) {
      setState(() => _currentStep = nextIdx);
      _slideCtrl.forward();
    }
  }

  // ── 건너뛰기 (선택 권한만 가능) ───────────────────
  Future<void> _skipCurrent() async {
    _items[_currentStep].skipped = true;
    await _moveToNext();
  }

  // ── 완료 처리 ───────────────────────────────────
  Future<void> _finishAndGoMain() async {
    // 권한 설정 완료 플래그 저장
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('permissions_setup_done', true);
    if (mounted) {
      Navigator.of(context).pushReplacementNamed('/main');
    }
  }

  // ── 영구 거부 다이얼로그 ────────────────────────
  Future<void> _showPermanentlyDeniedDialog(_PermItem item) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1B4B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(children: [
          Icon(item.icon, color: item.color, size: 22),
          const SizedBox(width: 8),
          Text(item.title,
              style: const TextStyle(color: Colors.white, fontSize: 16,
                  fontWeight: FontWeight.w700)),
        ]),
        content: Text(
          '권한이 거부되었습니다.\n설정 앱에서 직접 허용해 주세요.',
          style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14, height: 1.6),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('나중에',
                style: TextStyle(color: Color(0xFF6B7280))),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await openAppSettings();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('설정 열기',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  // ── UI ──────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final item        = _items[_currentStep];
    final totalSteps  = _items.length;
    final doneCount   = _items.where((e) => e.granted).length;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: SafeArea(
        child: Column(
          children: [
            // ── 상단 진행률 ──
            _buildHeader(doneCount, totalSteps),

            // ── 중앙 권한 카드 ──
            Expanded(
              child: SlideTransition(
                position: _slideAnim,
                child: _buildPermCard(item),
              ),
            ),

            // ── 하단 버튼 ──
            _buildButtons(item),
          ],
        ),
      ),
    );
  }

  // ── 상단 헤더 (단계 표시) ──
  Widget _buildHeader(int done, int total) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('권한 설정',
                  style: TextStyle(color: Colors.white, fontSize: 22,
                      fontWeight: FontWeight.w800)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0xFF6C63FF).withOpacity(0.18),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('$done / $total',
                    style: const TextStyle(color: Color(0xFF6C63FF),
                        fontSize: 13, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // 진행 바
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: total > 0 ? (_currentStep + 1) / total : 1.0,
              minHeight: 5,
              backgroundColor: const Color(0xFF1E1B4B),
              valueColor: const AlwaysStoppedAnimation(Color(0xFF6C63FF)),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${_currentStep + 1}단계 / $total단계',
            style: const TextStyle(color: Color(0xFF4B5563), fontSize: 12),
          ),
        ],
      ),
    );
  }

  // ── 권한 카드 ──
  Widget _buildPermCard(_PermItem item) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 아이콘
            ScaleTransition(
              scale: _pulseAnim,
              child: Container(
                width: 110, height: 110,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      item.color.withOpacity(0.35),
                      item.color.withOpacity(0.06),
                    ],
                    radius: 0.8,
                  ),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: item.color.withOpacity(0.5), width: 2),
                ),
                child: Icon(item.icon, color: item.color, size: 52),
              ),
            ),
            const SizedBox(height: 28),

            // 필수/선택 뱃지
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: item.required
                    ? const Color(0xFFEF4444).withOpacity(0.15)
                    : const Color(0xFF6B7280).withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: item.required
                      ? const Color(0xFFEF4444).withOpacity(0.4)
                      : const Color(0xFF6B7280).withOpacity(0.4),
                ),
              ),
              child: Text(
                item.required ? '필수 권한' : '선택 권한',
                style: TextStyle(
                  color: item.required
                      ? const Color(0xFFEF4444)
                      : const Color(0xFF9CA3AF),
                  fontSize: 11, fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 14),

            // 제목
            Text(item.title,
                style: const TextStyle(color: Colors.white, fontSize: 24,
                    fontWeight: FontWeight.w800),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),

            // 부제목
            Text(item.subtitle,
                style: const TextStyle(color: Color(0xFF94A3B8),
                    fontSize: 14, height: 1.5),
                textAlign: TextAlign.center),
            const SizedBox(height: 20),

            // 설명 카드
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: item.color.withOpacity(0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: item.color.withOpacity(0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded,
                      color: item.color.withOpacity(0.8), size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(item.description,
                        style: TextStyle(
                            color: item.color.withOpacity(0.9),
                            fontSize: 13, height: 1.6)),
                  ),
                ],
              ),
            ),

            // 거부 상태 표시
            if (item.denied) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: const Color(0xFFEF4444).withOpacity(0.25)),
                ),
                child: const Row(children: [
                  Icon(Icons.warning_amber_rounded,
                      color: Color(0xFFEF4444), size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text('권한이 거부됐습니다. 아래 버튼으로 다시 요청하거나 설정에서 직접 허용해 주세요.',
                        style: TextStyle(color: Color(0xFFEF4444),
                            fontSize: 12, height: 1.5)),
                  ),
                ]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ── 하단 버튼 영역 ──
  Widget _buildButtons(_PermItem item) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: Column(
        children: [
          // 허용 버튼
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: _isRequesting ? null : _requestCurrent,
              style: ElevatedButton.styleFrom(
                backgroundColor: item.color,
                disabledBackgroundColor: item.color.withOpacity(0.4),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
              child: _isRequesting
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          valueColor: AlwaysStoppedAnimation(Colors.white)))
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle_outline_rounded, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          item.denied ? '다시 요청하기' : '허용하기',
                          style: const TextStyle(fontSize: 16,
                              fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
            ),
          ),

          const SizedBox(height: 10),

          // 건너뛰기 (선택 권한) / 나중에 (필수 권한)
          SizedBox(
            width: double.infinity,
            height: 46,
            child: TextButton(
              onPressed: _isRequesting ? null : _skipCurrent,
              style: TextButton.styleFrom(
                foregroundColor: item.required
                    ? const Color(0xFF6B7280)
                    : const Color(0xFF9CA3AF),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(
                item.required ? '나중에 설정하기' : '건너뛰기',
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 권한 항목 데이터 클래스 ──────────────────────────
class _PermItem {
  final Permission permission;
  final IconData   icon;
  final Color      color;
  final String     title;
  final String     subtitle;
  final String     description;
  final bool       required;
  bool granted = false;
  bool denied  = false;
  bool skipped = false;

  _PermItem({
    required this.permission,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.required,
  });
}
