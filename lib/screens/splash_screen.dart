// lib/screens/splash_screen.dart
import 'package:flutter/material.dart';
import 'package:gif/gif.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late GifController _gifController;

  // GIF 총 재생 시간 (프레임 99개 × 33ms ≈ 3.3초) + 여유 0.2초
  static const Duration _gifDuration = Duration(milliseconds: 3500);

  @override
  void initState() {
    super.initState();
    _gifController = GifController(vsync: this);

    // GIF 재생 시작
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _gifController.repeat(
        min: 0,
        max: 98,
        period: _gifDuration,
      );
    });

    // GIF 한 사이클 후 다음 화면으로 이동
    Future.delayed(_gifDuration, () {
      if (mounted) {
        Navigator.pushReplacementNamed(context, '/home');
      }
    });
  }

  @override
  void dispose() {
    _gifController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF222222),
      body: SizedBox.expand(
        child: Gif(
          image: const AssetImage('assets/images/splash_animation.gif'),
          controller: _gifController,
          fit: BoxFit.cover,
          placeholder: (context) => const SizedBox.shrink(),
        ),
      ),
    );
  }
}
