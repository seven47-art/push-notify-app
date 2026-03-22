// lib/widgets/invite_code_sheet.dart
// 초대 코드 바텀시트 — 공통 위젯
// 사용처: channel_detail_screen, my_channels_screen
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';
import '../utils/toast_helper.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);

class InviteCodeSheet extends StatelessWidget {
  final String channelName;
  final String inviteLink;
  const InviteCodeSheet({super.key, required this.channelName, required this.inviteLink});

  /// 카카오톡 공유 (텍스트)
  Future<void> _shareKakao(BuildContext context) async {
    final text = '$channelName 채널에 초대합니다!\n$inviteLink';
    final uri = Uri.parse('kakaolink://send?text=${Uri.encodeComponent(text)}');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // 카카오톡 미설치 시 시스템 공유로 폴백
        await SharePlus.instance.share(ShareParams(text: text));
      }
    } catch (_) {
      await SharePlus.instance.share(ShareParams(text: text));
    }
  }

  /// 텔레그램 공유
  Future<void> _shareTelegram(BuildContext context) async {
    final text = '$channelName 채널에 초대합니다!\n$inviteLink';
    final uri = Uri.parse('tg://msg?text=${Uri.encodeComponent(text)}');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        showCenterToast(context, '텔레그램이 설치되어 있지 않습니다.');
      }
    } catch (_) {
      showCenterToast(context, '텔레그램을 열 수 없습니다.');
    }
  }

  /// 문자(SMS) 공유
  Future<void> _shareSms() async {
    final text = '$channelName 채널에 초대합니다!\n$inviteLink';
    final uri = Uri.parse('sms:?body=${Uri.encodeComponent(text)}');
    try {
      await launchUrl(uri);
    } catch (_) {}
  }

  /// 시스템 공유시트
  Future<void> _shareSystem() async {
    final text = '$channelName 채널에 초대합니다!\n$inviteLink';
    await SharePlus.instance.share(ShareParams(text: text));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 핸들 바
          Center(child: Container(width: 40, height: 4,
            decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),

          // 제목
          Text('$channelName · 초대 링크',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _text)),
          const SizedBox(height: 16),

          // 링크 + 복사 버튼
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(inviteLink,
                    style: const TextStyle(fontSize: 13, color: _primary),
                    overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: inviteLink));
                    showCenterToast(context, '초대 링크가 복사되었습니다.');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _primary,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('복사',
                      style: TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // 공유 버튼 (카톡 / 텔레그램 / 문자 / 더보기)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ShareButton(
                icon: 'assets/images/ic_kakao.png',
                label: '카카오톡',
                color: const Color(0xFFFEE500),
                iconColor: const Color(0xFF3C1E1E),
                onTap: () => _shareKakao(context),
                useAsset: true,
              ),
              _ShareButton(
                icon: '',
                label: '텔레그램',
                color: const Color(0xFF0088CC),
                iconColor: Colors.white,
                iconData: Icons.send,
                onTap: () => _shareTelegram(context),
              ),
              _ShareButton(
                icon: '',
                label: '문자',
                color: const Color(0xFF34C759),
                iconColor: Colors.white,
                iconData: Icons.sms,
                onTap: () => _shareSms(),
              ),
              _ShareButton(
                icon: '',
                label: '더보기',
                color: const Color(0xFF9E9E9E),
                iconColor: Colors.white,
                iconData: Icons.more_horiz,
                onTap: () => _shareSystem(),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // 닫기 버튼
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.pop(context),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                side: const BorderSide(color: _border),
              ),
              child: const Text('닫기', style: TextStyle(color: _text2)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── 공유 버튼 위젯 ──────────────────────────────────
class _ShareButton extends StatelessWidget {
  final String icon;
  final String label;
  final Color color;
  final Color iconColor;
  final IconData? iconData;
  final VoidCallback onTap;
  final bool useAsset;

  const _ShareButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.iconColor,
    required this.onTap,
    this.iconData,
    this.useAsset = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 50, height: 50,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: useAsset
                ? Image.asset(icon, width: 26, height: 26,
                    errorBuilder: (_, __, ___) => Icon(Icons.chat_bubble, color: iconColor, size: 24))
                : Icon(iconData ?? Icons.share, color: iconColor, size: 24),
            ),
          ),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF888888))),
        ],
      ),
    );
  }
}
