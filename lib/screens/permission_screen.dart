// lib/screens/permission_screen.dart  v2.0
// 권한 요청 3단계로 간소화
// [1단계] 시스템 팝업 일괄 요청: 알림 + 정확한알람 + 배터리최적화 + 마이크 + 카메라
// [2단계] 다른 앱 위에 표시 → 설정앱 이동
// [3단계] 전체화면 알림 → 설정앱 이동

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

  static const _platform = MethodChannel('com.pushnotify/permissions');

  // 3단계 정의
  static const int _stepBulk    = 0; // 시스템 팝업 일괄
  static const int _stepOverlay = 1; // 다른 앱 위에 표시
  static const int _stepFsi     = 2; // 전체화면 알림

  int  _currentStep  = 0;
  bool _isRequesting = false;

  late final AnimationController _pulseCtrl;
  late final Animation<double>   _pulseAnim;
  late final AnimationController _slideCtrl;
  late final Animation<Offset>   _slideAnim;

  // 각 단계 UI 정보
  final _stepInfo = const [
    _StepInfo(
      icon:        Icons.security_rounded,
      color:       Color(0xFF6C63FF),
      title:       '앱 권한 허용',
      subtitle:    '링고 앱 이용에 필요한 권한을 한 번에 허용합니다',
      description: '알림, 정확한 알람, 배터리 최적화 제외,\n마이크, 카메라 권한을 요청합니다.\n팝업이 나타나면 모두 "허용"을 눌러주세요.',
    ),
    _StepInfo(
      icon:        Icons.picture_in_picture_alt_rounded,
      color:       Color(0xFFF97316),
      title:       '다른 앱 위에 표시',
      subtitle:    '화면이 켜진 상태에서도 알람을 표시합니다',
      description: '설정 화면으로 이동합니다.\n"링고(RinGo)" 항목을 찾아 허용으로 켜주세요.',
    ),
    _StepInfo(
      icon:        Icons.fullscreen_rounded,
      color:       Color(0xFFEF4444),
      title:       '전체화면 알림 권한',
      subtitle:    '잠금화면 위에 알람을 표시합니다',
      description: '설정 화면으로 이동합니다.\n"링고(RinGo)" 항목을 찾아 허용으로 켜주세요.',
    ),
  ];

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
      end:   Offset.zero,
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

  // ── 이미 허용된 단계 건너뛰기 ─────────────────────────────────────────
  Future<void> _checkAlreadyGranted() async {
    int startStep = _stepBulk;

    // 1단계 — 시스템 팝업 권한 모두 허용됐는지 확인
    final bulkDone = await _isBulkGranted();

    // 2단계 — 오버레이 권한
    final overlayDone = await _checkOverlayGranted();

    // 3단계 — 전체화면 인텐트
    final fsiDone = await _checkFsiGranted();

    if (bulkDone && overlayDone && fsiDone) {
      await _finish();
      return;
    }

    if (bulkDone)    startStep = _stepOverlay;
    if (bulkDone && overlayDone) startStep = _stepFsi;

    if (mounted) setState(() => _currentStep = startStep);
  }

  Future<bool> _isBulkGranted() async {
    final statuses = await [
      Permission.notification,
      Permission.scheduleExactAlarm,
      Permission.ignoreBatteryOptimizations,
      Permission.microphone,
      Permission.camera,
    ].request(); // request() 는 이미 허용된 건 팝업 없이 통과
    return statuses.values.every(
      (s) => s.isGranted || s.isLimited,
    );
  }

  Future<bool> _checkOverlayGranted() async {
    try {
      return await _platform.invokeMethod<bool>('canDrawOverlays') ?? true;
    } catch (_) { return true; }
  }

  Future<bool> _checkFsiGranted() async {
    try {
      return await _platform.invokeMethod<bool>('canUseFullScreenIntent') ?? true;
    } catch (_) { return true; }
  }

  // ── 현재 단계 실행 ────────────────────────────────────────────────────
  Future<void> _requestCurrent() async {
    if (_isRequesting) return;
    setState(() => _isRequesting = true);

    switch (_currentStep) {
      case _stepBulk:
        await _doBulkRequest();
      case _stepOverlay:
        await _doOverlayRequest();
      case _stepFsi:
        await _doFsiRequest();
    }

    if (mounted) setState(() => _isRequesting = false);
  }

  // 1단계: 시스템 팝업 일괄 요청
  Future<void> _doBulkRequest() async {
    await [
      Permission.notification,
      Permission.scheduleExactAlarm,
      Permission.ignoreBatteryOptimizations,
      Permission.microphone,
      Permission.camera,
    ].request();
    await _moveToNext(_stepOverlay);
  }

  // 2단계: 다른 앱 위에 표시
  Future<void> _doOverlayRequest() async {
    try {
      await _platform.invokeMethod('openOverlaySettings');
    } catch (_) {
      await openAppSettings();
    }
    await Future.delayed(const Duration(seconds: 2));
    await _moveToNext(_stepFsi);
  }

  // 3단계: 전체화면 알림
  Future<void> _doFsiRequest() async {
    try {
      await _platform.invokeMethod('openFullScreenIntentSettings');
    } catch (_) {
      await openAppSettings();
    }
    await Future.delayed(const Duration(seconds: 2));
    await _finish();
  }

  Future<void> _moveToNext(int next) async {
    _slideCtrl.reset();
    if (mounted) {
      setState(() => _currentStep = next);
      _slideCtrl.forward();
    }
  }

  Future<void> _skipCurrent() async {
    if (_currentStep < _stepFsi) {
      await _moveToNext(_currentStep + 1);
    } else {
      await _finish();
    }
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('permissions_setup_done', true);
    if (mounted) Navigator.of(context).pushReplacementNamed('/main');
  }

  // ── UI ───────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final info = _stepInfo[_currentStep];

    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: SlideTransition(
                position: _slideAnim,
                child: _buildCard(info),
              ),
            ),
            _buildButtons(info),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
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
                child: Text('${_currentStep + 1} / 3',
                    style: const TextStyle(color: Color(0xFF6C63FF),
                        fontSize: 13, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (_currentStep + 1) / 3,
              minHeight: 5,
              backgroundColor: const Color(0xFF1E1B4B),
              valueColor: const AlwaysStoppedAnimation(Color(0xFF6C63FF)),
            ),
          ),
          const SizedBox(height: 6),
          Text('${_currentStep + 1}단계 / 3단계',
              style: const TextStyle(color: Color(0xFF4B5563), fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildCard(_StepInfo info) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: _pulseAnim,
              child: Container(
                width: 110, height: 110,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    colors: [
                      info.color.withOpacity(0.35),
                      info.color.withOpacity(0.06),
                    ],
                    radius: 0.8,
                  ),
                  shape: BoxShape.circle,
                  border: Border.all(color: info.color.withOpacity(0.5), width: 2),
                ),
                child: Icon(info.icon, color: info.color, size: 52),
              ),
            ),
            const SizedBox(height: 28),
            Text(info.title,
                style: const TextStyle(color: Colors.white, fontSize: 24,
                    fontWeight: FontWeight.w800),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(info.subtitle,
                style: const TextStyle(color: Color(0xFF94A3B8),
                    fontSize: 14, height: 1.5),
                textAlign: TextAlign.center),
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: info.color.withOpacity(0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: info.color.withOpacity(0.2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded,
                      color: info.color.withOpacity(0.8), size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(info.description,
                        style: TextStyle(
                            color: info.color.withOpacity(0.9),
                            fontSize: 13, height: 1.6)),
                  ),
                ],
              ),
            ),

            // 1단계 — 요청할 권한 목록 뱃지
            if (_currentStep == _stepBulk) ...[
              const SizedBox(height: 20),
              Wrap(
                spacing: 8, runSpacing: 8,
                alignment: WrapAlignment.center,
                children: const [
                  _Badge(Icons.notifications_active_rounded, '알림'),
                  _Badge(Icons.alarm_on_rounded,             '정확한 알람'),
                  _Badge(Icons.battery_charging_full_rounded,'배터리 최적화 제외'),
                  _Badge(Icons.mic_rounded,                  '마이크'),
                  _Badge(Icons.videocam_rounded,             '카메라'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildButtons(_StepInfo info) {
    final isLast = _currentStep == _stepFsi;
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: Column(
        children: [
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: _isRequesting ? null : _requestCurrent,
              style: ElevatedButton.styleFrom(
                backgroundColor: info.color,
                disabledBackgroundColor: info.color.withOpacity(0.4),
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
                          _currentStep == _stepBulk ? '권한 허용하기'
                              : isLast ? '허용하고 시작하기'
                              : '설정으로 이동',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: TextButton(
              onPressed: _isRequesting ? null : _skipCurrent,
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF6B7280),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(
                isLast ? '건너뛰고 시작하기' : '나중에 설정하기',
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 단계 정보 데이터 클래스 ──────────────────────────────────────────────
class _StepInfo {
  final IconData icon;
  final Color    color;
  final String   title;
  final String   subtitle;
  final String   description;
  const _StepInfo({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.description,
  });
}

// ── 권한 뱃지 위젯 ────────────────────────────────────────────────────────
class _Badge extends StatelessWidget {
  final IconData icon;
  final String   label;
  const _Badge(this.icon, this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF6C63FF).withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF6C63FF).withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: const Color(0xFF6C63FF), size: 14),
          const SizedBox(width: 5),
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF6C63FF),
                  fontSize: 12,
                  fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
