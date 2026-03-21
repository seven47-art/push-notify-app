// lib/config.dart - 서버 URL 중앙 관리
// ⚠️ 서버 URL이 바뀌면 이 파일만 수정 후 GitHub Push → 자동 APK 빌드

const String kBaseUrl =
    'https://ringo.run';

const String kAppUrl = '$kBaseUrl/app';

// 앱 버전 (pubspec.yaml version 과 동기화)
const String kAppVersion = '3.7.76';
