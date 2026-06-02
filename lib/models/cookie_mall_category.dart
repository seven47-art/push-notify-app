// lib/models/cookie_mall_category.dart
//
// Phase 7 — 쿠키몰 카테고리 모델 (QRChat QkeyMallCategory 이식)
// Workers GET /api/cookie-mall/products 응답의 categories[] 파싱

class CookieMallCategory {
  const CookieMallCategory({
    required this.id,
    required this.label,
    required this.emoji,
    required this.sortOrder,
    required this.active,
    this.description,
  });

  final String id;
  final String label;
  final String emoji;
  final int sortOrder;
  final bool active;
  final String? description;

  factory CookieMallCategory.fromMap(Map<String, dynamic> map) {
    return CookieMallCategory(
      id: (map['id'] as String?) ?? '',
      label: (map['label'] as String?) ?? '',
      emoji: (map['emoji'] as String?) ?? '\uD83C\uDF81',
      sortOrder: _toInt(map['sortOrder']),
      active: (map['active'] as bool?) ?? true,
      description: map['description'] as String?,
    );
  }

  Map<String, dynamic> toCacheMap() => {
        'id': id,
        'label': label,
        'emoji': emoji,
        'sortOrder': sortOrder,
        'active': active,
        if (description != null) 'description': description,
      };

  static int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}
