-- 채널 알람 스케줄 테이블
-- 알람 설정 완료 시 저장, 설정 시각이 되면 채널 구독자들에게 통화형 알람 발송
CREATE TABLE IF NOT EXISTS alarm_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,                -- 대상 채널
  created_by TEXT NOT NULL,                   -- 설정한 유저 ID
  scheduled_at TEXT NOT NULL,                 -- 발송 예정 시각 (ISO 8601: YYYY-MM-DDTHH:MM:SS)
  msg_type TEXT NOT NULL DEFAULT 'youtube',   -- 'youtube'|'audio'|'video'|'file'
  msg_value TEXT,                             -- YouTube URL, 파일 base64/URL 등
  status TEXT NOT NULL DEFAULT 'pending',     -- 'pending'|'triggered'|'cancelled'
  triggered_at TEXT,                          -- 실제 발송 시각
  total_targets INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alarm_schedules_channel ON alarm_schedules(channel_id);
CREATE INDEX IF NOT EXISTS idx_alarm_schedules_status ON alarm_schedules(status, scheduled_at);
