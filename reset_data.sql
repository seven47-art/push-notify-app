-- ================================================
-- RinGo DB 데이터 전체 초기화 (스키마 유지)
-- 외래키 제약 순서대로 삭제
-- ================================================

DELETE FROM alarm_logs;
DELETE FROM alarm_schedules;
DELETE FROM notification_logs;
DELETE FROM notification_batches;
DELETE FROM contents;
DELETE FROM subscribers;
DELETE FROM channel_invite_links;
DELETE FROM channels;
DELETE FROM user_sessions;
DELETE FROM users;

-- 자동증가 카운터 리셋
DELETE FROM sqlite_sequence WHERE name IN (
  'alarm_logs','alarm_schedules','notification_logs','notification_batches',
  'contents','subscribers','channel_invite_links','channels','user_sessions','users'
);

SELECT 'DB 초기화 완료' as result;
