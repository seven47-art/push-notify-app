// lib/services/cookie_mall_service.dart
//
// Phase 7 — 쿠키몰 서비스 (QRChat QkeyMallService 이식)
// Workers HTTP API 호출 (NOT Cloud Functions)
//
// API 엔드포인트:
//   GET  /api/cookie-mall/products  → 번들 (products + categories + brands)
//   GET  /api/cookie-mall/balance   → QKEY 잔액
//   POST /api/cookie-mall/redeem    → QKEY 차감 + 쿠폰 발행
//   GET  /api/cookie-mall/orders    → 내 주문 목록 (limit 20)
//
// 인증: Authorization: Bearer {session_token} (SharedPreferences 'session_token')

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/cookie_mall_product.dart';
import '../models/cookie_mall_order.dart';
import '../models/cookie_mall_category.dart';

// ─────────────────────────────────────────────────────────
// 서비스 싱글턴
// ─────────────────────────────────────────────────────────
class CookieMallService {
  CookieMallService._();
  static final CookieMallService instance = CookieMallService._();

  static const String _baseUrl = kBaseUrl;

  // 캐시 TTL: 5분 (QRChat 동일)
  static const Duration _clientCacheTtl = Duration(minutes: 5);
  static const String _kBundleCacheKey = 'cookie_mall_bundle_v1';
  static const String _kBundleCacheAtKey = 'cookie_mall_bundle_at_v1';

  // 메모리 캐시
  CookieMallBundle? _memBundle;
  int _memBundleAt = 0;

  /// 인증 토큰 조회
  Future<String> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('session_token') ?? '';
  }

  /// 인증 헤더
  Future<Map<String, String>> _authHeaders() async {
    final token = await _getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // ─────────────────────────────────────────────────────────
  // 1. 번들 조회 (products + categories + brands, 3단 캐시)
  // ─────────────────────────────────────────────────────────
  Future<CookieMallBundle> getBundle({bool forceRefresh = false}) async {
    // 메모리 캐시
    if (!forceRefresh && _memBundle != null) {
      final age = DateTime.now().millisecondsSinceEpoch - _memBundleAt;
      if (age <= _clientCacheTtl.inMilliseconds) {
        debugPrint('[CookieMall] bundle MEM-cache HIT');
        return _memBundle!;
      }
    }

    // 디스크 캐시
    if (!forceRefresh) {
      final cached = await _loadCachedBundle();
      if (cached != null) {
        debugPrint('[CookieMall] bundle DISK-cache HIT');
        _memBundle = cached;
        _memBundleAt = DateTime.now().millisecondsSinceEpoch;
        return cached;
      }
    }

    // 서버 호출
    try {
      final headers = await _authHeaders();
      final res = await http.get(
        Uri.parse('$_baseUrl/api/cookie-mall/products'),
        headers: headers,
      ).timeout(const Duration(seconds: 12));

      if (res.statusCode != 200) {
        debugPrint('[CookieMall] products HTTP ${res.statusCode}');
        final fb = await _loadCachedBundle(ignoreTtl: true);
        return fb ?? CookieMallBundle.empty();
      }

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] != true) {
        debugPrint('[CookieMall] products not success');
        final fb = await _loadCachedBundle(ignoreTtl: true);
        return fb ?? CookieMallBundle.empty();
      }

      final data = body['data'] as Map<String, dynamic>? ?? {};

      // products[]
      final products = <CookieMallProduct>[];
      final rawP = data['products'];
      if (rawP is List) {
        for (final raw in rawP) {
          if (raw is Map) {
            try {
              products.add(CookieMallProduct.fromMap(Map<String, dynamic>.from(raw)));
            } catch (e) {
              debugPrint('[CookieMall] product parse error: $e');
            }
          }
        }
      }
      products.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      // categories[]
      final categories = <CookieMallCategory>[];
      final rawC = data['categories'];
      if (rawC is List) {
        for (final raw in rawC) {
          if (raw is Map) {
            try {
              categories.add(CookieMallCategory.fromMap(Map<String, dynamic>.from(raw)));
            } catch (e) {
              debugPrint('[CookieMall] category parse error: $e');
            }
          }
        }
      }
      categories.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      // brands[]
      final brands = <CookieMallBrand>[];
      final rawB = data['brands'];
      if (rawB is List) {
        for (final raw in rawB) {
          if (raw is Map) {
            try {
              brands.add(CookieMallBrand.fromMap(Map<String, dynamic>.from(raw)));
            } catch (e) {
              debugPrint('[CookieMall] brand parse error: $e');
            }
          }
        }
      }

      final bundle = CookieMallBundle(
        products: products,
        categories: categories,
        brands: brands,
      );

      await _saveCachedBundle(bundle);
      _memBundle = bundle;
      _memBundleAt = DateTime.now().millisecondsSinceEpoch;

      debugPrint('[CookieMall] bundle MISS -> fetched p=${products.length}, c=${categories.length}, b=${brands.length}');
      return bundle;
    } catch (e) {
      debugPrint('[CookieMall] getBundle error: $e');
      final fb = await _loadCachedBundle(ignoreTtl: true);
      return fb ?? CookieMallBundle.empty();
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. QKEY 잔액 조회
  // ─────────────────────────────────────────────────────────
  Future<int> getBalance() async {
    try {
      final headers = await _authHeaders();
      final res = await http.get(
        Uri.parse('$_baseUrl/api/cookie-mall/balance'),
        headers: headers,
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && body['data'] is Map) {
          return _toInt((body['data'] as Map)['balance']);
        }
      }
      return 0;
    } catch (e) {
      debugPrint('[CookieMall] getBalance error: $e');
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. 교환 (Idempotency 보호)
  // ─────────────────────────────────────────────────────────
  Future<CookieMallRedeemResult> redeem({
    required String productId,
    required String clientNonce,
  }) async {
    if (productId.isEmpty || clientNonce.isEmpty) {
      throw CookieMallException(
        code: 'invalid_argument',
        message: '필수 정보가 누락되었습니다.',
      );
    }

    try {
      final headers = await _authHeaders();
      final res = await http.post(
        Uri.parse('$_baseUrl/api/cookie-mall/redeem'),
        headers: headers,
        body: jsonEncode({
          'productId': productId,
          'clientNonce': clientNonce,
        }),
      ).timeout(const Duration(seconds: 25));

      final body = jsonDecode(res.body) as Map<String, dynamic>;

      if (body['success'] != true) {
        throw CookieMallException(
          code: 'server_error',
          message: (body['error'] as String?) ?? '교환 요청이 거부되었습니다.',
        );
      }

      final data = body['data'] as Map<String, dynamic>? ?? {};
      return CookieMallRedeemResult(
        orderId: (data['orderId'] as String?) ?? '',
        status: (data['status'] as String?) ?? 'pending',
        idempotent: data['idempotent'] == true,
        priceQkey: _toInt(data['priceQkey']),
        priceKrw: _toInt(data['priceKrw']),
      );
    } catch (e) {
      if (e is CookieMallException) rethrow;
      debugPrint('[CookieMall] redeem error: $e');
      throw CookieMallException(
        code: 'unknown',
        message: '교환 처리 중 오류가 발생했습니다.',
      );
    }
  }

  /// Idempotency nonce 생성
  String generateClientNonce() {
    final rnd = Random.secure();
    final bytes = List<int>.generate(16, (_) => rnd.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${DateTime.now().millisecondsSinceEpoch}_$hex';
  }

  // ─────────────────────────────────────────────────────────
  // 4. 내 주문 목록
  // ─────────────────────────────────────────────────────────
  Future<List<CookieMallOrder>> getMyOrders({int limit = 20}) async {
    try {
      final headers = await _authHeaders();
      final res = await http.get(
        Uri.parse('$_baseUrl/api/cookie-mall/orders?limit=${limit.clamp(1, 20)}'),
        headers: headers,
      ).timeout(const Duration(seconds: 12));

      if (res.statusCode != 200) return const <CookieMallOrder>[];

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (body['success'] != true) return const <CookieMallOrder>[];

      final rawList = body['data'];
      if (rawList is! List) return const <CookieMallOrder>[];

      final list = <CookieMallOrder>[];
      for (final raw in rawList) {
        if (raw is Map) {
          try {
            list.add(CookieMallOrder.fromMap(Map<String, dynamic>.from(raw)));
          } catch (e) {
            debugPrint('[CookieMall] order parse error: $e');
          }
        }
      }
      return list;
    } catch (e) {
      debugPrint('[CookieMall] getMyOrders error: $e');
      return const <CookieMallOrder>[];
    }
  }

  // ─────────────────────────────────────────────────────────
  // 캐시 관리
  // ─────────────────────────────────────────────────────────
  Future<void> invalidateCache() async {
    _memBundle = null;
    _memBundleAt = 0;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kBundleCacheKey);
      await prefs.remove(_kBundleCacheAtKey);
    } catch (_) {}
  }

  Future<CookieMallBundle?> _loadCachedBundle({bool ignoreTtl = false}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString(_kBundleCacheKey);
      final at = prefs.getInt(_kBundleCacheAtKey);
      if (jsonStr == null || at == null) return null;

      if (!ignoreTtl) {
        final age = DateTime.now().millisecondsSinceEpoch - at;
        if (age > _clientCacheTtl.inMilliseconds) return null;
      }

      final decoded = jsonDecode(jsonStr);
      if (decoded is! Map) return null;

      final products = <CookieMallProduct>[];
      final rawP = decoded['products'];
      if (rawP is List) {
        for (final r in rawP) {
          if (r is Map) {
            try {
              products.add(CookieMallProduct.fromMap(Map<String, dynamic>.from(r)));
            } catch (_) {}
          }
        }
      }

      final categories = <CookieMallCategory>[];
      final rawC = decoded['categories'];
      if (rawC is List) {
        for (final r in rawC) {
          if (r is Map) {
            try {
              categories.add(CookieMallCategory.fromMap(Map<String, dynamic>.from(r)));
            } catch (_) {}
          }
        }
      }

      final brands = <CookieMallBrand>[];
      final rawB = decoded['brands'];
      if (rawB is List) {
        for (final r in rawB) {
          if (r is Map) {
            try {
              brands.add(CookieMallBrand.fromMap(Map<String, dynamic>.from(r)));
            } catch (_) {}
          }
        }
      }

      return CookieMallBundle(
        products: products,
        categories: categories,
        brands: brands,
      );
    } catch (e) {
      debugPrint('[CookieMall] bundle cache load error: $e');
      return null;
    }
  }

  Future<void> _saveCachedBundle(CookieMallBundle bundle) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final json = jsonEncode({
        'products': bundle.products.map((p) => p.toCacheMap()).toList(),
        'categories': bundle.categories.map((c) => c.toCacheMap()).toList(),
        'brands': bundle.brands.map((b) => b.toCacheMap()).toList(),
      });
      await prefs.setString(_kBundleCacheKey, json);
      await prefs.setInt(_kBundleCacheAtKey, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      debugPrint('[CookieMall] bundle cache save error: $e');
    }
  }

  static int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}

// ─────────────────────────────────────────────────────────
// 번들 / 브랜드 / 결과 / 예외 모델
// ─────────────────────────────────────────────────────────
class CookieMallBundle {
  const CookieMallBundle({
    required this.products,
    required this.categories,
    required this.brands,
  });

  final List<CookieMallProduct> products;
  final List<CookieMallCategory> categories;
  final List<CookieMallBrand> brands;

  factory CookieMallBundle.empty() => const CookieMallBundle(
        products: <CookieMallProduct>[],
        categories: <CookieMallCategory>[],
        brands: <CookieMallBrand>[],
      );

  bool get isEmpty => products.isEmpty && categories.isEmpty && brands.isEmpty;
}

class CookieMallBrand {
  const CookieMallBrand({
    required this.name,
    required this.count,
    required this.category,
    this.representativeImage,
  });

  final String name;
  final int count;
  final String category;
  final String? representativeImage;

  factory CookieMallBrand.fromMap(Map<String, dynamic> map) {
    int toInt(dynamic v) {
      if (v is int) return v;
      if (v is double) return v.toInt();
      if (v is String) return int.tryParse(v) ?? 0;
      return 0;
    }

    return CookieMallBrand(
      name: (map['name'] as String?) ?? '',
      count: toInt(map['count']),
      category: (map['category'] as String?) ?? '',
      representativeImage:
          map['representativeImage'] as String? ?? map['imageUrl'] as String?,
    );
  }

  Map<String, dynamic> toCacheMap() => <String, dynamic>{
        'name': name,
        'count': count,
        'category': category,
        if (representativeImage != null) 'representativeImage': representativeImage,
      };
}

class CookieMallRedeemResult {
  const CookieMallRedeemResult({
    required this.orderId,
    required this.status,
    required this.idempotent,
    required this.priceQkey,
    required this.priceKrw,
  });

  final String orderId;
  final String status;
  final bool idempotent;
  final int priceQkey;
  final int priceKrw;
}

class CookieMallException implements Exception {
  const CookieMallException({required this.code, required this.message});

  final String code;
  final String message;

  @override
  String toString() => 'CookieMallException($code): $message';
}
