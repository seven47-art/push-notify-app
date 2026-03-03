-- ============================================================
-- users 테이블에 phone_number 컬럼 추가
-- 알람 통화 발송(Twilio)에 사용
-- ============================================================

ALTER TABLE users ADD COLUMN phone_number TEXT DEFAULT NULL;
