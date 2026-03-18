// lib/screens/terms_screen.dart
// 최초 1회 동의 화면 – 앱 설치 후 /main 진입 전 한 번만 표시
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TermsScreen extends StatefulWidget {
  const TermsScreen({super.key});

  @override
  State<TermsScreen> createState() => _TermsScreenState();
}

class _TermsScreenState extends State<TermsScreen> {
  bool _checked = false;

  Future<void> _onAgree() async {
    if (!_checked) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('termsAccepted', true);
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed('/main');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      body: SafeArea(
        child: Column(
          children: [
            // ── 스크롤 가능한 본문 영역 ──────────────────
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 36, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 타이틀
                    const Text(
                      '링고 이용 전 확인해주세요',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 20),

                    // 본문 서두
                    const Text(
                      '링고는 채널 기반으로 알람을 수신하는 서비스입니다.\n'
                      '이 앱은 별도의 회원가입이나 비밀번호 설정 없이 이용할 수 있으며,\n'
                      '기기에 등록된 이메일 정보가 사용자 식별을 위한 값으로 사용될 수 있습니다.\n\n'
                      '서비스 이용 전 아래 내용을 확인해주세요.',
                      style: TextStyle(
                        color: Color(0xFFCCCCCC),
                        fontSize: 14,
                        height: 1.7,
                      ),
                    ),
                    const SizedBox(height: 28),

                    // 섹션 구분선
                    _divider(),

                    // [서비스 이용 안내]
                    _sectionTitle('[서비스 이용 안내]'),
                    _sectionBody(
                      '채널 구독 기반 알람 서비스이며, 오디오/비디오 콘텐츠가 알람으로 전달됩니다.',
                    ),
                    const SizedBox(height: 20),
                    _divider(),

                    // [개인정보 처리 안내]
                    _sectionTitle('[개인정보 처리 안내]'),
                    _sectionBody(
                      '기기 이메일은 사용자 식별, 알람 제공, 채널 이용, 신고 처리 및 서비스 운영에 사용될 수 있습니다.',
                    ),
                    const SizedBox(height: 20),
                    _divider(),

                    // [운영정책 및 신고 안내]
                    _sectionTitle('[운영정책 및 신고 안내]'),
                    _sectionBody(
                      '불법 광고/스팸, 사기/피싱, 음란/선정적 콘텐츠, 괴롭힘/혐오, 저작권/도용 의심 콘텐츠는 '
                      '관리자 검토 후 조치될 수 있습니다.',
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),

            // ── 고정 하단 영역 ────────────────────────────
            Container(
              decoration: const BoxDecoration(
                color: Color(0xFF1E1E1E),
                border: Border(
                  top: BorderSide(color: Color(0xFF2E2E2E), width: 1),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 체크박스 + 동의 문구
                  GestureDetector(
                    onTap: () => setState(() => _checked = !_checked),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(
                            color: _checked
                                ? const Color(0xFF6C63FF)
                                : Colors.transparent,
                            border: Border.all(
                              color: _checked
                                  ? const Color(0xFF6C63FF)
                                  : const Color(0xFF888888),
                              width: 2,
                            ),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: _checked
                              ? const Icon(Icons.check,
                                  size: 14, color: Colors.white)
                              : null,
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            '위 내용을 확인했고 이에 동의합니다.',
                            style: TextStyle(
                              color: Color(0xFFDDDDDD),
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 동의하고 시작 버튼
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _checked ? _onAgree : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF6C63FF),
                        disabledBackgroundColor: const Color(0xFF2E2E2E),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: Text(
                        '동의하고 시작',
                        style: TextStyle(
                          color: _checked
                              ? Colors.white
                              : const Color(0xFF666666),
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── 헬퍼 위젯 ──────────────────────────────────────

  Widget _divider() => Container(
        height: 1,
        color: const Color(0xFF2A2A2A),
        margin: const EdgeInsets.only(bottom: 20),
      );

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          title,
          style: const TextStyle(
            color: Color(0xFF9D9AFF),
            fontSize: 13,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.3,
          ),
        ),
      );

  Widget _sectionBody(String body) => Text(
        body,
        style: const TextStyle(
          color: Color(0xFFAAAAAA),
          fontSize: 13,
          height: 1.7,
        ),
      );
}
