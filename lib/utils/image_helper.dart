// lib/utils/image_helper.dart
// base64 data URL 또는 일반 http URL 이미지를 통합 처리하는 헬퍼
import 'dart:convert';
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
Widget channelAvatar({
  required String? imageUrl,
  required String name,
  required double size,
  Color? bgColor,
  double borderRadius = 10,
}) {
  final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
  final bg = bgColor ?? const Color(0xFF6C63FF);

  ImageProvider? provider;

  if (imageUrl != null && imageUrl.isNotEmpty) {
    if (isBase64Image(imageUrl)) {
      final bytes = base64ToBytes(imageUrl);
      if (bytes != null) provider = MemoryImage(bytes);
    } else {
      provider = NetworkImage(imageUrl);
    }
  }

  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: provider == null ? bg.withOpacity(0.2) : null,
      borderRadius: BorderRadius.circular(borderRadius),
      image: provider != null
          ? DecorationImage(image: provider, fit: BoxFit.cover)
          : null,
    ),
    clipBehavior: Clip.antiAlias,
    child: provider == null
        ? Center(
            child: Text(
              initial,
              style: TextStyle(
                color: bg,
                fontSize: size * 0.4,
                fontWeight: FontWeight.bold,
              ),
            ),
          )
        : null,
  );
}
