import 'package:flutter/material.dart';

/// 화면 중앙에 카카오톡 스타일 토스트 메시지를 표시합니다.
/// [isError] 가 true 이면 빨간 계열 배경을 사용합니다.
void showCenterToast(BuildContext context, String message, {bool isError = false}) {
  final overlay = Overlay.of(context);
  final entry = OverlayEntry(
    builder: (_) => _CenterToast(message: message, isError: isError),
  );
  overlay.insert(entry);
  Future.delayed(const Duration(milliseconds: 2000), () {
    entry.remove();
  });
}

class _CenterToast extends StatefulWidget {
  final String message;
  final bool isError;
  const _CenterToast({required this.message, required this.isError});

  @override
  State<_CenterToast> createState() => _CenterToastState();
}

class _CenterToastState extends State<_CenterToast>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
    // 1600ms 후 fade-out
    Future.delayed(const Duration(milliseconds: 1600), () {
      if (mounted) _ctrl.reverse();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: IgnorePointer(
        child: Center(
          child: FadeTransition(
            opacity: _opacity,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 48),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(
                color: widget.isError
                    ? const Color(0xFFFF4444)
                    : Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.18),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                widget.message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: widget.isError ? Colors.white : const Color(0xFF222222),
                  fontWeight: FontWeight.w500,
                  decoration: TextDecoration.none,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
