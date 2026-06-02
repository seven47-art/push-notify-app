// lib/screens/cookie_mall_screen.dart
//
// Phase 7 — 쿠키몰 메인 화면 (QRChat QKEY몰 이식)
// 상품 그리드 + 카테고리 탭 + QKEY 잔액 + 교환 확인 + 내 쿠폰

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/cookie_mall_product.dart';
import '../models/cookie_mall_order.dart';
import '../models/cookie_mall_category.dart';
import '../services/cookie_mall_service.dart';

class CookieMallScreen extends StatefulWidget {
  const CookieMallScreen({super.key});

  @override
  State<CookieMallScreen> createState() => _CookieMallScreenState();
}

class _CookieMallScreenState extends State<CookieMallScreen>
    with SingleTickerProviderStateMixin {
  final _service = CookieMallService.instance;

  bool _loading = true;
  String? _error;
  int _balance = 0;

  List<CookieMallProduct> _products = [];
  List<CookieMallCategory> _categories = [];
  String _selectedCategory = 'all';

  late TabController _tabCtrl;

  // 내 쿠폰 탭
  List<CookieMallOrder> _orders = [];
  bool _ordersLoading = false;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _tabCtrl.addListener(() {
      if (_tabCtrl.index == 1 && _orders.isEmpty && !_ordersLoading) {
        _loadOrders();
      }
    });
    _loadData();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _service.getBundle(),
        _service.getBalance(),
      ]);
      final bundle = results[0] as CookieMallBundle;
      final balance = results[1] as int;
      if (mounted) {
        setState(() {
          _products = bundle.products;
          _categories = bundle.categories;
          _balance = balance;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '데이터를 불러올 수 없습니다.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadOrders() async {
    setState(() => _ordersLoading = true);
    try {
      final orders = await _service.getMyOrders();
      if (mounted) {
        setState(() {
          _orders = orders;
          _ordersLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _ordersLoading = false);
    }
  }

  List<CookieMallProduct> get _filteredProducts {
    if (_selectedCategory == 'all') return _products;
    return _products.where((p) => p.category == _selectedCategory).toList();
  }

  Future<void> _onRedeem(CookieMallProduct product) async {
    // 잔액 확인
    if (_balance < product.priceQkey) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QKEY 잔액이 부족합니다.'), backgroundColor: Colors.red),
      );
      return;
    }

    // 교환 확인 다이얼로그
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('쿠키몰 교환', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(product.name, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(product.brand, style: const TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('차감 QKEY', style: TextStyle(color: Colors.white70, fontSize: 14)),
                  Text('${product.priceQkey} QKEY', style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 16, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('현재 잔액', style: TextStyle(color: Colors.white70, fontSize: 14)),
                  Text('$_balance QKEY', style: const TextStyle(color: Colors.white, fontSize: 14)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('교환 후 잔액', style: TextStyle(color: Colors.white70, fontSize: 14)),
                  Text('${_balance - product.priceQkey} QKEY', style: const TextStyle(color: Colors.white, fontSize: 14)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('교환하기', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // 교환 실행
    try {
      final nonce = _service.generateClientNonce();
      final result = await _service.redeem(
        productId: product.id,
        clientNonce: nonce,
      );

      if (mounted) {
        // 잔액 새로고침
        _service.invalidateCache();
        final newBalance = await _service.getBalance();
        setState(() => _balance = newBalance);

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.idempotent
                  ? '이미 처리된 요청입니다.'
                  : '교환 완료! 내 쿠폰에서 확인하세요.',
            ),
            backgroundColor: result.idempotent ? Colors.orange : Colors.green,
          ),
        );

        // 내 쿠폰 탭으로 이동
        _tabCtrl.animateTo(1);
        _loadOrders();
      }
    } on CookieMallException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('교환 처리 중 오류가 발생했습니다.'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        title: const Text('쿠키몰', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          // QKEY 잔액 뱃지
          Container(
            margin: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF59E0B).withOpacity(0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cookie, size: 16, color: Color(0xFFFBBF24)),
                const SizedBox(width: 4),
                Text(
                  '$_balance Q',
                  style: const TextStyle(
                    color: Color(0xFFFBBF24),
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          indicatorColor: const Color(0xFFF59E0B),
          labelColor: const Color(0xFFFBBF24),
          unselectedLabelColor: Colors.white54,
          tabs: const [
            Tab(text: '상품'),
            Tab(text: '내 쿠폰'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B)))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: const TextStyle(color: Colors.white60)),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _loadData,
                        child: const Text('다시 시도'),
                      ),
                    ],
                  ),
                )
              : TabBarView(
                  controller: _tabCtrl,
                  children: [
                    _buildProductsTab(),
                    _buildOrdersTab(),
                  ],
                ),
    );
  }

  // ─────────────────────────────────────────────────────────
  // 상품 탭
  // ─────────────────────────────────────────────────────────
  Widget _buildProductsTab() {
    return RefreshIndicator(
      color: const Color(0xFFF59E0B),
      onRefresh: _loadData,
      child: CustomScrollView(
        slivers: [
          // 카테고리 필터 칩
          SliverToBoxAdapter(child: _buildCategoryChips()),
          // 상품 그리드
          _filteredProducts.isEmpty
              ? SliverFillRemaining(
                  child: Center(
                    child: Text(
                      _selectedCategory == 'all' ? '등록된 상품이 없습니다.' : '해당 카테고리에 상품이 없습니다.',
                      style: const TextStyle(color: Colors.white38, fontSize: 14),
                    ),
                  ),
                )
              : SliverPadding(
                  padding: const EdgeInsets.all(12),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.72,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => _buildProductCard(_filteredProducts[index]),
                      childCount: _filteredProducts.length,
                    ),
                  ),
                ),
        ],
      ),
    );
  }

  Widget _buildCategoryChips() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Row(
        children: [
          _buildChip('all', '\uD83C\uDF81', '전체'),
          ..._categories.where((c) => c.active).map(
                (c) => _buildChip(c.id, c.emoji, c.label),
              ),
        ],
      ),
    );
  }

  Widget _buildChip(String id, String emoji, String label) {
    final selected = _selectedCategory == id;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        selected: selected,
        label: Text('$emoji $label'),
        labelStyle: TextStyle(
          color: selected ? Colors.black : Colors.white70,
          fontWeight: selected ? FontWeight.bold : FontWeight.normal,
          fontSize: 13,
        ),
        backgroundColor: const Color(0xFF1E293B),
        selectedColor: const Color(0xFFFBBF24),
        checkmarkColor: Colors.black,
        side: BorderSide(color: selected ? const Color(0xFFF59E0B) : Colors.white12),
        onSelected: (_) => setState(() => _selectedCategory = id),
      ),
    );
  }

  Widget _buildProductCard(CookieMallProduct product) {
    return GestureDetector(
      onTap: () => _onRedeem(product),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 이미지
            Expanded(
              flex: 3,
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                child: product.imageUrl.isNotEmpty
                    ? Image.network(
                        product.imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(product.categoryEmoji, style: const TextStyle(fontSize: 40)),
                        ),
                      )
                    : Center(
                        child: Text(product.categoryEmoji, style: const TextStyle(fontSize: 40)),
                      ),
              ),
            ),
            // 정보
            Expanded(
              flex: 2,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.brand,
                      style: const TextStyle(color: Colors.white38, fontSize: 11),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      product.name,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        const Icon(Icons.cookie, size: 14, color: Color(0xFFFBBF24)),
                        const SizedBox(width: 4),
                        Text(
                          '${product.priceQkey} QKEY',
                          style: const TextStyle(
                            color: Color(0xFFFBBF24),
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────
  // 내 쿠폰 탭
  // ─────────────────────────────────────────────────────────
  Widget _buildOrdersTab() {
    if (_ordersLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B)));
    }
    if (_orders.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long, size: 48, color: Colors.white24),
            const SizedBox(height: 12),
            const Text('교환한 쿠폰이 없습니다.', style: TextStyle(color: Colors.white38, fontSize: 14)),
            const SizedBox(height: 12),
            TextButton(
              onPressed: _loadOrders,
              child: const Text('새로고침', style: TextStyle(color: Color(0xFFFBBF24))),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFFF59E0B),
      onRefresh: _loadOrders,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: _orders.length,
        itemBuilder: (context, index) => _buildOrderCard(_orders[index]),
      ),
    );
  }

  Widget _buildOrderCard(CookieMallOrder order) {
    final statusColor = _orderStatusColor(order.status);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 상단: 상품명 + 상태
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.productName,
                    style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withOpacity(0.3)),
                  ),
                  child: Text(
                    order.status.label,
                    style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            if (order.brand != null) ...[
              const SizedBox(height: 4),
              Text(order.brand!, style: const TextStyle(color: Colors.white38, fontSize: 12)),
            ],
            const SizedBox(height: 8),
            // QKEY 가격
            Row(
              children: [
                const Icon(Icons.cookie, size: 14, color: Color(0xFFFBBF24)),
                const SizedBox(width: 4),
                Text(
                  '${order.priceQkey} QKEY',
                  style: const TextStyle(color: Color(0xFFFBBF24), fontSize: 13, fontWeight: FontWeight.bold),
                ),
                const SizedBox(width: 8),
                Text(
                  '(${order.priceKrw.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}원)',
                  style: const TextStyle(color: Colors.white38, fontSize: 12),
                ),
              ],
            ),
            // 쿠폰 코드 (발행 완료 시)
            if (order.hasCoupon) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('쿠폰 코드: ', style: TextStyle(color: Colors.white54, fontSize: 12)),
                        Expanded(
                          child: Text(
                            order.couponCode ?? '',
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600, fontFamily: 'monospace'),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 16, color: Colors.white54),
                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                          padding: EdgeInsets.zero,
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: order.couponCode ?? ''));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('쿠폰 코드가 복사되었습니다.'), duration: Duration(seconds: 1)),
                            );
                          },
                        ),
                      ],
                    ),
                    if (order.couponPin != null && order.couponPin!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Text('PIN: ', style: TextStyle(color: Colors.white54, fontSize: 12)),
                          Text(
                            order.couponPin!,
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'monospace'),
                          ),
                        ],
                      ),
                    ],
                    if (order.couponExpireAt != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        '유효기간: ${_formatDate(order.couponExpireAt!)}${order.isExpired ? ' (만료됨)' : ''}',
                        style: TextStyle(
                          color: order.isExpired ? Colors.red[300] : Colors.white38,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 6),
            // 날짜
            Text(
              order.createdAt != null ? _formatDate(order.createdAt!) : '',
              style: const TextStyle(color: Colors.white24, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  Color _orderStatusColor(CookieMallOrderStatus status) {
    switch (status) {
      case CookieMallOrderStatus.pending:
        return Colors.amber;
      case CookieMallOrderStatus.issued:
        return Colors.green;
      case CookieMallOrderStatus.failed:
        return Colors.red;
      case CookieMallOrderStatus.refunded:
        return Colors.blue;
      case CookieMallOrderStatus.cancelled:
        return Colors.grey;
      case CookieMallOrderStatus.unknown:
        return Colors.grey;
    }
  }

  String _formatDate(DateTime dt) {
    return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
