// lib/models/cookie_mall_order.dart
//
// Phase 7 — 쿠키몰 주문/쿠폰 모델 (QRChat QkeyMallOrder 이식)
// Workers GET /api/cookie-mall/orders 응답 파싱

enum CookieMallOrderStatus {
  pending,
  issued,
  failed,
  refunded,
  cancelled,
  unknown,
}

CookieMallOrderStatus _parseStatus(String? raw) {
  switch (raw) {
    case 'pending':
      return CookieMallOrderStatus.pending;
    case 'issued':
      return CookieMallOrderStatus.issued;
    case 'failed':
      return CookieMallOrderStatus.failed;
    case 'refunded':
      return CookieMallOrderStatus.refunded;
    case 'cancelled':
      return CookieMallOrderStatus.cancelled;
    default:
      return CookieMallOrderStatus.unknown;
  }
}

extension CookieMallOrderStatusX on CookieMallOrderStatus {
  String get label {
    switch (this) {
      case CookieMallOrderStatus.pending:
        return '발행 중';
      case CookieMallOrderStatus.issued:
        return '사용 가능';
      case CookieMallOrderStatus.failed:
        return '발행 실패';
      case CookieMallOrderStatus.refunded:
        return '환불 완료';
      case CookieMallOrderStatus.cancelled:
        return '취소됨';
      case CookieMallOrderStatus.unknown:
        return '확인 중';
    }
  }
}

class CookieMallOrder {
  const CookieMallOrder({
    required this.orderId,
    required this.productId,
    required this.productName,
    required this.priceQkey,
    required this.priceKrw,
    required this.status,
    required this.couponCode,
    required this.couponPin,
    required this.couponBarcode,
    required this.couponExpireAt,
    required this.createdAt,
    required this.issuedAt,
    this.brand,
    this.productImageUrl,
    this.couponImgUrl,
    this.category,
  });

  final String orderId;
  final String productId;
  final String productName;
  final int priceQkey;
  final int priceKrw;
  final CookieMallOrderStatus status;
  final String? couponCode;
  final String? couponPin;
  final String? couponBarcode;
  final DateTime? couponExpireAt;
  final DateTime? createdAt;
  final DateTime? issuedAt;
  final String? brand;
  final String? productImageUrl;
  final String? couponImgUrl;
  final String? category;

  factory CookieMallOrder.fromMap(Map<String, dynamic> map) {
    return CookieMallOrder(
      orderId: (map['orderId'] as String?) ?? '',
      productId: (map['productId'] as String?) ?? '',
      productName: (map['productName'] as String?) ?? '',
      priceQkey: _toInt(map['priceQkey']),
      priceKrw: _toInt(map['priceKrw']),
      status: _parseStatus(map['status'] as String?),
      couponCode: map['couponCode'] as String?,
      couponPin: map['couponPin'] as String?,
      couponBarcode: map['couponBarcode'] as String?,
      couponExpireAt: _toDate(map['couponExpireAt']),
      createdAt: _toDate(map['createdAt']),
      issuedAt: _toDate(map['issuedAt']),
      brand: map['brand'] as String?,
      productImageUrl: map['productImageUrl'] as String?,
      couponImgUrl: map['couponImgUrl'] as String?,
      category: map['category'] as String?,
    );
  }

  /// 이미지 우선순위: 쿠폰이미지 > 상품이미지
  String? get displayImageUrl {
    if (couponImgUrl != null && couponImgUrl!.isNotEmpty) return couponImgUrl;
    if (productImageUrl != null && productImageUrl!.isNotEmpty) return productImageUrl;
    return null;
  }

  static int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  static DateTime? _toDate(dynamic v) {
    if (v == null) return null;
    if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
    if (v is double) return DateTime.fromMillisecondsSinceEpoch(v.toInt());
    if (v is String) {
      final p = int.tryParse(v);
      if (p != null) return DateTime.fromMillisecondsSinceEpoch(p);
      return DateTime.tryParse(v);
    }
    return null;
  }

  bool get isExpired {
    final expire = couponExpireAt;
    if (expire == null) return false;
    return DateTime.now().isAfter(expire);
  }

  bool get hasCoupon =>
      status == CookieMallOrderStatus.issued &&
      couponCode != null &&
      couponCode!.isNotEmpty;
}
