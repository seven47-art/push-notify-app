// lib/screens/notices_screen.dart
// 공지사항 목록 + 상세 (HTML 렌더링 + URL 새창 + 이미지 표시)
import 'dart:convert';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';

const _primary = Color(0xFF6C63FF);
const _text    = Color(0xFF222222);
const _text2   = Color(0xFF888888);
const _border  = Color(0xFFEEEEEE);
const _bg      = Color(0xFFFFFFFF);

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  List<Map<String, dynamic>> _notices = [];
  bool _loading = true;
  String? _error;
  Set<String> _seenIds  = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('session_token') ?? '';
      _seenIds = Set.from(prefs.getStringList('seen_notice_ids') ?? []);

      final res = await http.get(
        Uri.parse('$kBaseUrl/api/notices'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['success'] == true) {
          if (mounted) {
            setState(() {
              _notices = List<Map<String, dynamic>>.from(
                (body['data'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)));
              _loading = false;
            });
          }
          return;
        }
      }
      if (mounted) setState(() { _loading = false; _error = '공지사항을 불러올 수 없습니다.'; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = '네트워크 오류가 발생했습니다.'; });
    }
  }

  Future<void> _markSeen(String id) async {
    _seenIds.add(id);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('seen_notice_ids', _seenIds.toList());
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw.toString();
    }
  }

  void _openDetail(Map<String, dynamic> notice) {
    final id = notice['id']?.toString() ?? '';
    _markSeen(id);
    setState(() {});
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => _NoticeDetailScreen(notice: notice),
    ));
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
        title: const Text('공지사항', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _primary))
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline, size: 48, color: Colors.grey[300]),
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: _text2)),
                    const SizedBox(height: 12),
                    TextButton(onPressed: _load, child: const Text('다시 시도')),
                  ],
                ))
              : _notices.isEmpty
                  ? const Center(child: Text('공지사항이 없습니다.', style: TextStyle(color: _text2)))
                  : RefreshIndicator(
                      color: _primary,
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _notices.length,
                        itemBuilder: (context, index) {
                          final notice = _notices[index];
                          final id = notice['id']?.toString() ?? '$index';
                          final title = notice['title']?.toString() ?? '';
                          final date = _formatDate(notice['created_at']);
                          final isNew = !_seenIds.contains(id);
                          final hasImage = notice['image_url'] != null && notice['image_url'].toString().isNotEmpty;

                          return Column(
                            children: [
                              InkWell(
                                onTap: () => _openDetail(notice),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.campaign, size: 18, color: _primary),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Row(
                                          children: [
                                            if (hasImage) ...[
                                              const Icon(Icons.image, size: 14, color: Color(0xFF10B981)),
                                              const SizedBox(width: 4),
                                            ],
                                            Expanded(
                                              child: Text(
                                                title,
                                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: _text),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      if (isNew) ...[
                                        Container(
                                          width: 8, height: 8,
                                          decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                        ),
                                        const SizedBox(width: 6),
                                      ],
                                      Text(date, style: const TextStyle(fontSize: 12, color: _text2)),
                                      const SizedBox(width: 4),
                                      const Icon(Icons.chevron_right, size: 18, color: _text2),
                                    ],
                                  ),
                                ),
                              ),
                              const Divider(height: 1, color: _border),
                            ],
                          );
                        },
                      ),
                    ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// 공지사항 상세 화면 — HTML 렌더링 + URL 클릭 + 이미지
// ══════════════════════════════════════════════════════════════════
class _NoticeDetailScreen extends StatelessWidget {
  final Map<String, dynamic> notice;
  const _NoticeDetailScreen({required this.notice});

  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      return '${dt.year}년 ${dt.month}월 ${dt.day}일';
    } catch (_) {
      return raw.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = notice['title']?.toString() ?? '';
    final content = notice['content']?.toString() ?? '';
    final imageUrl = notice['image_url']?.toString();
    final date = _formatDate(notice['created_at']);

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
        title: const Text('공지사항', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _text)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 제목
            Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: _text, height: 1.3)),
            const SizedBox(height: 8),
            // 날짜
            Text(date, style: const TextStyle(fontSize: 13, color: _text2)),
            const SizedBox(height: 16),
            const Divider(color: _border),
            const SizedBox(height: 16),
            // 이미지 (있으면)
            if (imageUrl != null && imageUrl.isNotEmpty) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  imageUrl,
                  width: double.infinity,
                  fit: BoxFit.fitWidth,
                  loadingBuilder: (_, child, progress) {
                    if (progress == null) return child;
                    return Container(
                      height: 200,
                      alignment: Alignment.center,
                      child: const CircularProgressIndicator(color: _primary, strokeWidth: 2),
                    );
                  },
                  errorBuilder: (_, __, ___) => Container(
                    height: 100,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.broken_image_outlined, size: 40, color: _text2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
            // 내용 (HTML → 위젯)
            _HtmlContentWidget(html: content),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// 간단한 HTML → Flutter Widget 변환기
// 지원: <b>, <i>, <u>, <br>, <a href>, <font size>, <ul>/<li>, 일반 텍스트, URL 자동 링크
// ══════════════════════════════════════════════════════════════════
class _HtmlContentWidget extends StatelessWidget {
  final String html;
  const _HtmlContentWidget({required this.html});

  @override
  Widget build(BuildContext context) {
    if (html.isEmpty) return const SizedBox.shrink();

    // HTML 태그가 없으면 단순 텍스트로 처리
    if (!html.contains('<')) {
      return _buildPlainTextWithLinks(html);
    }

    return _HtmlRenderer(html: html);
  }

  Widget _buildPlainTextWithLinks(String text) {
    return RichText(
      text: _buildLinkedTextSpan(text, const TextStyle(fontSize: 15, color: _text, height: 1.7)),
    );
  }

  static TextSpan _buildLinkedTextSpan(String text, TextStyle baseStyle) {
    final urlPattern = RegExp(r'https?://[^\s<>"]+', caseSensitive: false);
    final matches = urlPattern.allMatches(text).toList();
    if (matches.isEmpty) return TextSpan(text: text, style: baseStyle);

    final spans = <InlineSpan>[];
    int lastEnd = 0;
    for (final m in matches) {
      if (m.start > lastEnd) {
        spans.add(TextSpan(text: text.substring(lastEnd, m.start), style: baseStyle));
      }
      final url = m.group(0)!;
      spans.add(TextSpan(
        text: url,
        style: baseStyle.copyWith(color: _primary, decoration: TextDecoration.underline),
        recognizer: TapGestureRecognizer()..onTap = () => _launchUrl(url),
      ));
      lastEnd = m.end;
    }
    if (lastEnd < text.length) {
      spans.add(TextSpan(text: text.substring(lastEnd), style: baseStyle));
    }
    return TextSpan(children: spans);
  }

  static Future<void> _launchUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _HtmlRenderer extends StatelessWidget {
  final String html;
  const _HtmlRenderer({required this.html});

  @override
  Widget build(BuildContext context) {
    final widgets = _parseHtml(html);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  List<Widget> _parseHtml(String html) {
    final widgets = <Widget>[];
    // div, p 블록 단위로 분리
    final cleaned = html
        .replaceAll(RegExp(r'<br\s*/?>'), '\n')
        .replaceAll('</p>', '</p>\n')
        .replaceAll('</div>', '</div>\n')
        .replaceAll('</li>', '</li>\n');

    // <img> 태그 패턴
    final imgPattern = RegExp(r'<img\s[^>]*src="([^"]*)"[^>]*/?\s*>', caseSensitive: false);

    // <ul>...</ul> 블록과 <img> 태그 추출
    final parts = cleaned.split(RegExp(r'(<ul[^>]*>.*?</ul>|<img\s[^>]*>)', dotAll: true));

    for (final part in parts) {
      if (part.trim().isEmpty) continue;

      // 이미지 태그 처리
      final imgMatch = imgPattern.firstMatch(part);
      if (imgMatch != null) {
        final imgUrl = imgMatch.group(1) ?? '';
        if (imgUrl.isNotEmpty) {
          widgets.add(Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.network(
                imgUrl,
                width: double.infinity,
                fit: BoxFit.fitWidth,
                loadingBuilder: (_, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    height: 150,
                    alignment: Alignment.center,
                    child: const CircularProgressIndicator(color: _primary, strokeWidth: 2),
                  );
                },
                errorBuilder: (_, __, ___) => Container(
                  height: 80,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.broken_image_outlined, size: 36, color: _text2),
                ),
              ),
            ),
          ));
        }
        continue;
      }

      if (part.contains('<ul') && part.contains('</ul>')) {
        // 리스트 처리
        final liMatches = RegExp(r'<li[^>]*>(.*?)</li>', dotAll: true).allMatches(part);
        for (final li in liMatches) {
          final liContent = _stripTags(li.group(1) ?? '');
          widgets.add(Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('• ', style: TextStyle(fontSize: 15, color: _text)),
                Expanded(child: RichText(
                  text: _buildRichSpan(liContent, const TextStyle(fontSize: 15, color: _text, height: 1.7)),
                )),
              ],
            ),
          ));
        }
      } else {
        // 일반 텍스트/인라인 HTML 처리
        final lines = part.split('\n');
        for (final line in lines) {
          final trimmed = line.trim();
          if (trimmed.isEmpty) continue;
          widgets.add(Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: RichText(
              text: _buildRichSpan(trimmed, const TextStyle(fontSize: 15, color: _text, height: 1.7)),
            ),
          ));
        }
      }
    }

    return widgets;
  }

  TextSpan _buildRichSpan(String html, TextStyle baseStyle) {
    final spans = <InlineSpan>[];
    final tagPattern = RegExp(
      r'<(b|strong|i|em|u|s|strike|a|font|span|/b|/strong|/i|/em|/u|/s|/strike|/a|/font|/span|h[1-3]|/h[1-3])[^>]*>',
      caseSensitive: false,
    );

    bool bold = false, italic = false, underline = false, strikethrough = false;
    double? fontSize;
    Color? textColor;
    String? linkUrl;
    int lastEnd = 0;
    int headerLevel = 0;

    final matches = tagPattern.allMatches(html).toList();

    for (final m in matches) {
      // 태그 앞 텍스트
      if (m.start > lastEnd) {
        final text = _decodeHtmlEntities(html.substring(lastEnd, m.start));
        if (text.isNotEmpty) {
          spans.add(_makeSpan(text, baseStyle, bold || headerLevel > 0, italic, underline, strikethrough, fontSize ?? _headerFontSize(headerLevel), textColor, linkUrl));
        }
      }

      final tag = m.group(0)!.toLowerCase();
      if (tag.startsWith('<b') || tag.startsWith('<strong')) {
        bold = true;
      } else if (tag.startsWith('</b') || tag.startsWith('</strong')) {
        bold = false;
      } else if (tag.startsWith('<i') || tag.startsWith('<em')) {
        italic = true;
      } else if (tag.startsWith('</i') || tag.startsWith('</em')) {
        italic = false;
      } else if (tag.startsWith('<u')) {
        underline = true;
      } else if (tag.startsWith('</u')) {
        underline = false;
      } else if (tag.startsWith('<s') && (tag.startsWith('<s>') || tag.startsWith('<s ') || tag.startsWith('<strike'))) {
        strikethrough = true;
      } else if (tag.startsWith('</s') && (tag == '</s>' || tag.startsWith('</strike'))) {
        strikethrough = false;
      } else if (tag.startsWith('<a ')) {
        final hrefMatch = RegExp(r'href="([^"]*)"').firstMatch(tag);
        linkUrl = hrefMatch?.group(1);
      } else if (tag.startsWith('</a')) {
        linkUrl = null;
      } else if (tag.startsWith('<h')) {
        final lvl = int.tryParse(tag.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
        if (lvl >= 1 && lvl <= 3) headerLevel = lvl;
      } else if (tag.startsWith('</h')) {
        headerLevel = 0;
      } else if (tag.startsWith('<font')) {
        final sizeMatch = RegExp(r'size="(\d)"').firstMatch(tag);
        if (sizeMatch != null) {
          final s = int.tryParse(sizeMatch.group(1)!) ?? 3;
          fontSize = _fontSizeFromHtml(s);
        }
      } else if (tag.startsWith('</font')) {
        fontSize = null;
      } else if (tag.startsWith('<span')) {
        // Quill color/background: style="color: rgb(...);" or style="background-color: ..."
        final colorMatch = RegExp(r'color:\s*([^;"]+)').firstMatch(tag);
        if (colorMatch != null) {
          textColor = _parseCssColor(colorMatch.group(1)!.trim());
        }
        // Quill size class: class="ql-size-large" etc
        if (tag.contains('ql-size-small')) fontSize = 12;
        else if (tag.contains('ql-size-large')) fontSize = 20;
        else if (tag.contains('ql-size-huge')) fontSize = 26;
      } else if (tag.startsWith('</span')) {
        textColor = null;
        fontSize = null;
      }

      lastEnd = m.end;
    }

    // 남은 텍스트
    if (lastEnd < html.length) {
      final text = _decodeHtmlEntities(_stripAllTags(html.substring(lastEnd)));
      if (text.isNotEmpty) {
        spans.add(_makeSpan(text, baseStyle, bold || headerLevel > 0, italic, underline, strikethrough, fontSize ?? _headerFontSize(headerLevel), textColor, linkUrl));
      }
    }

    if (spans.isEmpty) {
      final plain = _decodeHtmlEntities(_stripAllTags(html));
      return _HtmlContentWidget._buildLinkedTextSpan(plain, baseStyle);
    }

    return TextSpan(children: spans);
  }

  InlineSpan _makeSpan(String text, TextStyle base, bool bold, bool italic, bool underline, bool strikethrough, double? fontSize, Color? textColor, String? linkUrl) {
    var style = base.copyWith(
      fontWeight: bold ? FontWeight.bold : null,
      fontStyle: italic ? FontStyle.italic : null,
      decoration: underline
          ? TextDecoration.underline
          : strikethrough
              ? TextDecoration.lineThrough
              : null,
      fontSize: fontSize,
      color: textColor,
    );

    if (linkUrl != null) {
      style = style.copyWith(color: _primary, decoration: TextDecoration.underline);
      return TextSpan(
        text: text,
        style: style,
        recognizer: TapGestureRecognizer()..onTap = () => _HtmlContentWidget._launchUrl(linkUrl),
      );
    }

    // URL 자동 링크 처리
    return _HtmlContentWidget._buildLinkedTextSpan(text, style);
  }

  double _fontSizeFromHtml(int htmlSize) {
    switch (htmlSize) {
      case 1: return 12;
      case 2: return 13;
      case 3: return 15;
      case 4: return 17;
      case 5: return 20;
      case 6: return 24;
      case 7: return 28;
      default: return 15;
    }
  }

  double? _headerFontSize(int level) {
    switch (level) {
      case 1: return 26;
      case 2: return 22;
      case 3: return 18;
      default: return null;
    }
  }

  Color? _parseCssColor(String css) {
    // rgb(r, g, b)
    final rgbMatch = RegExp(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)').firstMatch(css);
    if (rgbMatch != null) {
      final r = int.tryParse(rgbMatch.group(1)!) ?? 0;
      final g = int.tryParse(rgbMatch.group(2)!) ?? 0;
      final b = int.tryParse(rgbMatch.group(3)!) ?? 0;
      return Color.fromARGB(255, r, g, b);
    }
    // #hex
    final hexMatch = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(css);
    if (hexMatch != null) {
      return Color(int.parse('FF${hexMatch.group(1)!}', radix: 16));
    }
    // 기본 색상 이름
    final named = <String, Color>{
      'red': const Color(0xFFFF0000), 'blue': const Color(0xFF0000FF),
      'green': const Color(0xFF008000), 'orange': const Color(0xFFFFA500),
      'purple': const Color(0xFF800080), 'black': const Color(0xFF000000),
      'white': const Color(0xFFFFFFFF), 'gray': const Color(0xFF808080),
      'grey': const Color(0xFF808080), 'yellow': const Color(0xFFFFFF00),
    };
    return named[css.toLowerCase()];
  }

  String _stripTags(String html) {
    return html.replaceAll(RegExp(r'<p[^>]*>|</p>|<div[^>]*>|</div>'), '');
  }

  String _stripAllTags(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), '');
  }

  String _decodeHtmlEntities(String text) {
    return text
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&nbsp;', ' ');
  }
}
