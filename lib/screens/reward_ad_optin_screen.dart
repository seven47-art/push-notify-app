// lib/screens/reward_ad_optin_screen.dart
// =============================================
// 광고 리워드 참여하기 화면 (명세서 2단계)
// - 마이페이지(설정)에서 진입
// - 입력: 콴타리움 지갑주소 / 지역(시·도·시·군·구, 직접선택, GPS 미사용)
//         / 연령대 / 성별 / 참여 동의
// - 저장: PUT /api/reward-ads/me  → 서버가 Firestore ad_users/{uid}에 기록
// - 광고 리워드 참여는 "선택 사항". 미동의해도 기존 RINGO 기능 정상 사용 가능.
// - 기존 가입/알람/수락거절/영상/수신함/발신함 기능에 일절 영향 없음.
// =============================================
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../utils/toast_helper.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _bg      = Color(0xFFFFFFFF);

// 안내 문구 (명세서 필수 고지)
const _consentNotice =
    '광고 리워드 참여는 선택사항입니다. 동의하지 않아도 링고의 기존 기능을 정상적으로 사용할 수 있습니다.';

const _ageBands = ['10대', '20대', '30대', '40대', '50대', '60대 이상'];
const _genders  = ['남성', '여성', '응답하지 않음'];

// 관심 지역 — 전국 17개 광역시·도 (직접 입력 X, 선택만, GPS 미사용)
const _regions = [
  '서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종',
  '전북', '전남', '광주', '경북', '경남', '대구', '울산', '부산', '제주',
];

class RewardAdOptInScreen extends StatefulWidget {
  const RewardAdOptInScreen({super.key});

  @override
  State<RewardAdOptInScreen> createState() => _RewardAdOptInScreenState();
}

class _RewardAdOptInScreenState extends State<RewardAdOptInScreen> {
  final _walletCtrl  = TextEditingController();

  String? _region;   // 선택된 광역시·도 1개
  String? _ageBand;
  String? _gender;
  bool _optIn = false;

  bool _loading = true;   // 초기 조회 중
  bool _saving  = false;  // 저장 중

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _walletCtrl.dispose();
    super.dispose();
  }

  Future<String> _token() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('session_token') ?? '';
  }

  // 현재 설정 조회
  Future<void> _load() async {
    try {
      final token = await _token();
      final res = await http.get(
        Uri.parse('$kBaseUrl/api/reward-ads/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true && body['data'] is Map) {
          final d = body['data'] as Map<String, dynamic>;
          _optIn = d['adRewardOptIn'] == true;
          _walletCtrl.text = (d['quantariumWalletAddress'] ?? '').toString();
          final region = d['adTargetRegion'];
          if (region is Map) {
            final sido = (region['sido'] ?? '').toString();
            if (_regions.contains(sido)) _region = sido;
          }
          final ab = d['adTargetAgeBand']?.toString();
          if (ab != null && _ageBands.contains(ab)) _ageBand = ab;
          final g = d['adTargetGender']?.toString();
          if (g != null && _genders.contains(g)) _gender = g;
        }
      }
    } catch (_) {
      // 조회 실패해도 화면은 기본값으로 표시
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // 저장
  Future<void> _save() async {
    // 참여 동의 시 지갑 주소 필수
    if (_optIn) {
      final wallet = _walletCtrl.text.trim();
      if (wallet.isEmpty) {
        showCenterToast(context, '콴타리움 지갑 주소를 입력해 주세요.');
        return;
      }
    }

    setState(() => _saving = true);
    try {
      final token = await _token();
      final payload = <String, dynamic>{
        'adRewardOptIn': _optIn,
        'quantariumWalletAddress': _walletCtrl.text.trim(),
        'adTargetRegion': {
          'sido': _region ?? '',
        },
        'adTargetAgeBand': _ageBand,
        'adTargetGender': _gender,
      };

      final res = await http.put(
        Uri.parse('$kBaseUrl/api/reward-ads/me'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 12));

      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200 && body['success'] == true) {
        if (!mounted) return;
        showCenterToast(context, _optIn ? '광고 리워드 참여가 저장되었습니다.' : '참여가 해제되었습니다.');
        Navigator.pop(context, true);
        return;
      }
      final err = body['error']?.toString() ?? '저장 중 오류가 발생했습니다.';
      if (mounted) showCenterToast(context, err);
    } catch (_) {
      if (mounted) showCenterToast(context, '저장 중 오류가 발생했습니다.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: _text),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('광고 리워드 참여하기',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                // 안내 문구
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: _primary.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _primary.withOpacity(0.15)),
                  ),
                  child: const Text(
                    _consentNotice,
                    style: TextStyle(fontSize: 13, color: _text, height: 1.6),
                  ),
                ),
                const SizedBox(height: 24),

                // 참여 동의 스위치
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8F8FA),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _border),
                  ),
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    activeColor: _primary,
                    title: const Text('광고 리워드 참여 동의',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _text)),
                    subtitle: const Text('동의 시 광고 리워드 전화를 받을 수 있습니다.',
                        style: TextStyle(fontSize: 12, color: _text2)),
                    value: _optIn,
                    onChanged: (v) => setState(() => _optIn = v),
                  ),
                ),
                const SizedBox(height: 24),

                // 콴타리움 지갑 주소
                _label('콴타리움(Quantarium) 지갑 주소'),
                const SizedBox(height: 8),
                TextField(
                  controller: _walletCtrl,
                  decoration: _inputDeco('지갑 주소를 입력하세요'),
                  style: const TextStyle(fontSize: 14, color: _text),
                ),
                const SizedBox(height: 6),
                const Text('QKEY 리워드 지급에 사용됩니다.',
                    style: TextStyle(fontSize: 12, color: _text2)),
                const SizedBox(height: 24),

                // 관심 지역 — 광역시·도 선택 (직접 입력 X, GPS 미사용)
                _label('관심 지역 (선택)'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _regions.map((r) => _chip(
                        label: r,
                        selected: _region == r,
                        onTap: () => setState(() => _region = _region == r ? null : r),
                      )).toList(),
                ),
                const SizedBox(height: 6),
                const Text('관심 지역을 선택하면 해당 지역 광고를 우선 받을 수 있습니다.',
                    style: TextStyle(fontSize: 12, color: _text2)),
                const SizedBox(height: 24),

                // 연령대
                _label('연령대 (선택)'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _ageBands.map((b) => _chip(
                        label: b,
                        selected: _ageBand == b,
                        onTap: () => setState(() => _ageBand = _ageBand == b ? null : b),
                      )).toList(),
                ),
                const SizedBox(height: 24),

                // 성별
                _label('성별 (선택)'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _genders.map((g) => _chip(
                        label: g,
                        selected: _gender == g,
                        onTap: () => setState(() => _gender = _gender == g ? null : g),
                      )).toList(),
                ),
                const SizedBox(height: 32),

                // 저장 버튼
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _primary,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('저장', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
    );
  }

  Widget _label(String text) => Text(text,
      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _text));

  InputDecoration _inputDeco(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: _text2, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        filled: true,
        fillColor: const Color(0xFFF8F8FA),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _primary),
        ),
      );

  Widget _chip({required String label, required bool selected, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? _primary : const Color(0xFFF8F8FA),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? _primary : _border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: selected ? Colors.white : _text,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }
}
