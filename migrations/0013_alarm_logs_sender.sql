-- alarm_logs 테이블에 sender_id 컬럼 추가
-- 발송자(채널 운영자) user_id 저장 → alarm_schedules 삭제 후에도 추적 가능
-- NOTE: 이미 수동 적용됨 — no-op
SELECT 1;

CREATE INDEX IF NOT EXISTS idx_alarm_logs_sender ON alarm_logs(sender_id);
