-- 알람 수신 로그 테이블
-- 알람이 발송될 때 수신자별로 기록 저장
CREATE TABLE IF NOT EXISTS alarm_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alarm_id INTEGER NOT NULL,              -- alarm_schedules.id
  channel_id INTEGER NOT NULL,            -- 채널 ID
  channel_name TEXT NOT NULL,             -- 채널명 (스냅샷)
  receiver_id TEXT NOT NULL,              -- 수신자 user_id
  msg_type TEXT NOT NULL DEFAULT 'youtube', -- 'youtube'|'audio'|'video'|'file'
  msg_value TEXT,                         -- 콘텐츠 URL/값
  status TEXT NOT NULL DEFAULT 'received', -- 'received'|'accepted'|'rejected'
  received_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (alarm_id) REFERENCES alarm_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alarm_logs_receiver ON alarm_logs(receiver_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarm_logs_channel  ON alarm_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_alarm_logs_alarm    ON alarm_logs(alarm_id);
