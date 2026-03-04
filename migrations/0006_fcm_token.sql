-- 0006_fcm_token.sql
-- users 테이블에 FCM 토큰 컬럼 추가 (앱 기기별 푸시 발송용)
ALTER TABLE users ADD COLUMN fcm_token TEXT;
CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);
