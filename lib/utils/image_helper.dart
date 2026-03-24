// lib/utils/image_helper.dart
// base64 data URL 또는 일반 http URL 이미지를 통합 처리하는 헬퍼
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';

/// image_url이 base64(data:image/...)인지 확인
bool isBase64Image(String? url) {
  return url != null && url.startsWith('data:image/');
}

/// base64 문자열에서 순수 base64 데이터만 추출
Uint8List? base64ToBytes(String dataUrl) {
  try {
    final comma = dataUrl.indexOf(',');
    if (comma == -1) return null;
    return base64Decode(dataUrl.substring(comma + 1));
  } catch (_) {
    return null;
  }
}

/// 채널 아바타 위젯 (base64 / http URL / 이니셜 모두 처리)
/// - base64: 즉시 표시 (DecorationImage)
/// - http URL: fade-in 로딩 (Image.network + frameBuilder)
/// - 이미지 없음: 이니셜 표시
Widget channelAvatar({
  required String? imageUrl,
  required String name,
  required double size,
  Color? bgColor,
  double borderRadius = 10,
}) {
  final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
  final bg = bgColor ?? const Color(0xFF6C63FF);

  // base64 이미지: 즉시 표시 (메모리에서 바로 디코딩)
  if (imageUrl != null && imageUrl.isNotEmpty && isBase64Image(imageUrl)) {
    final bytes = base64ToBytes(imageUrl);
    if (bytes != null) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(borderRadius),
          image: DecorationImage(image: MemoryImage(bytes), fit: BoxFit.cover),
        ),
        clipBehavior: Clip.antiAlias,
      );
    }
  }

  // http URL 이미지: fade-in 로딩 (로딩 중 빈 배경 → 로드 완료 시 부드럽게 전환)
  if (imageUrl != null && imageUrl.isNotEmpty) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg.withOpacity(0.08),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      clipBehavior: Clip.antiAlias,
      child: Image.network(
        imageUrl,
        width: size,
        height: size,
        fit: BoxFit.cover,
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded || frame != null) return child;
          // 로딩 중: 빈 컨테이너 (배경색만 보임)
          return const SizedBox.shrink();
        },
        errorBuilder: (context, error, stackTrace) {
          // 로드 실패: 이니셜 표시
          return Center(
            child: Text(
              initial,
              style: TextStyle(
                color: bg,
                fontSize: size * 0.4,
                fontWeight: FontWeight.bold,
              ),
            ),
          );
        },
      ),
    );
  }

  // 이미지 없음: 이니셜 표시
  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: bg.withOpacity(0.2),
      borderRadius: BorderRadius.circular(borderRadius),
    ),
    clipBehavior: Clip.antiAlias,
    child: Center(
      child: Text(
        initial,
        style: TextStyle(
          color: bg,
          fontSize: size * 0.4,
          fontWeight: FontWeight.bold,
        ),
      ),
    ),
  );
}
