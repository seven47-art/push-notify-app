import 'package:flutter/material.dart';

/// 웹뷰 스타일 하단 토스트 메시지 (하단 탭바 위, 둥근 pill, 진한 배경 + 흰색 텍스트)
/// [isError] 가 true 이면 빨간 계열 배경을 사용합니다.
void showCenterToast(BuildContext context, String message, {bool isError = false}) {
  final overlay = Overlay.of(context);
  final entry = OverlayEntry(
    builder: (_) => _BottomToast(message: message, isError: isError),
  );
  overlay.insert(entry);
  Future.delayed(const Duration(milliseconds: 3000), () {
    entry.remove();
  });
}

class _BottomToast extends StatefulWidget {
  final String message;
  final bool isError;
  const _BottomToast({required this.message, required this.isError});

  @override
  State<_BottomToast> createState() => _BottomToastState();
}

class _BottomToastState extends State<_BottomToast>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _ctrl.forward();
    // 2500ms 후 fade-out
    Future.delayed(const Duration(milliseconds: 2500), () {
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
    return Positioned(
      left: 16,
      right: 16,
      bottom: 80,
      child: IgnorePointer(
        child: SlideTransition(
          position: _slide,
          child: FadeTransition(
            opacity: _opacity,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: widget.isError
                    ? const Color(0xF0FF4444)
                    : const Color(0xF028283C),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                widget.message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: Colors.white,
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
