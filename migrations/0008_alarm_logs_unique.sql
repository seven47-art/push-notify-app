-- alarm_logs 테이블에 UNIQUE 제약 추가
-- 같은 alarm_id + receiver_id 조합은 1개만 저장 (중복 수신 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_alarm_logs_unique
  ON alarm_logs(alarm_id, receiver_id);
