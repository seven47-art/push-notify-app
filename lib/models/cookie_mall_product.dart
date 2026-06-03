// lib/models/cookie_mall_product.dart
//
// Phase 7 — 쿠키몰 상품 모델 (QRChat QkeyMallProduct 이식)
// Workers GET /api/cookie-mall/products 응답 파싱

class CookieMallProduct {
  const CookieMallProduct({
    required this.id,
    required this.name,
    required this.brand,
    required this.category,
    required this.priceKrw,
    required this.priceQkey,
    required this.imageUrl,
    required this.sortOrder,
    required this.active,
  });

  final String id;
  final String name;
  final String brand;
  final String category;
  final int priceKrw;
  final int priceQkey;
  final String imageUrl;
  final int sortOrder;
  final bool active;

  factory CookieMallProduct.fromMap(Map<String, dynamic> map) {
    return CookieMallProduct(
      id: (map['id'] as String?) ?? '',
      name: (map['name'] as String?) ?? '',
      brand: (map['brand'] as String?) ?? '',
      category: (map['category'] as String?) ?? 'etc',
      priceKrw: _toInt(map['priceKrw']),
      priceQkey: _toInt(map['priceQkey']),
      imageUrl: (map['imageUrl'] as String?) ?? '',
      sortOrder: _toInt(map['sortOrder']),
      active: (map['active'] as bool?) ?? true,
    );
  }

  Map<String, dynamic> toCacheMap() => {
        'id': id,
        'name': name,
        'brand': brand,
        'category': category,
        'priceKrw': priceKrw,
        'priceQkey': priceQkey,
        'imageUrl': imageUrl,
        'sortOrder': sortOrder,
        'active': active,
      };

  static int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  /// 카테고리 이모지 폴백
  String get categoryEmoji {
    switch (category) {
      case 'coffee':
        return '\u2615';
      case 'convenience':
        return '\uD83C\uDFEA';
      case 'chicken':
        return '\uD83C\uDF57';
      case 'movie':
        return '\uD83C\uDFAC';
      case 'department':
        return '\uD83C\uDFEC';
      case 'food':
      case 'fastfood':
        return '\uD83C\uDF54';
      default:
        return '\uD83C\uDF81';
    }
  }

  /// 카테고리 한국어 라벨
  String get categoryLabel {
    switch (category) {
      case 'coffee':
        return '커피';
      case 'convenience':
        return '편의점';
      case 'chicken':
        return '치킨';
      case 'movie':
        return '영화';
      case 'department':
        return '백화점';
      case 'food':
      case 'fastfood':
        return '패스트푸드';
      default:
        return '기타';
    }
  }
}
