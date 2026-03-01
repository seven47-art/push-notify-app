-- ============================================================
-- Push Notification Admin System - Initial Schema
-- ============================================================

-- 채널 테이블 (Channel Owner가 관리하는 채널)
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  owner_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 구독자 테이블 (Flutter 앱 사용자)
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('android', 'ios', 'web')),
  is_active INTEGER DEFAULT 1,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

-- 콘텐츠 테이블 (audio / video / youtube)
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK(content_type IN ('audio', 'video', 'youtube')),
  content_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  metadata TEXT, -- JSON string (extra info like youtube_id, bitrate, etc.)
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- 알림 발송 배치 테이블 (발송 작업 단위)
CREATE TABLE IF NOT EXISTS notification_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  content_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  total_targets INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  scheduled_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);

-- 개별 알림 발송 로그 테이블
CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  fcm_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'accepted', 'rejected')),
  fcm_message_id TEXT,
  error_message TEXT,
  sent_at DATETIME,
  action_at DATETIME, -- 수락/거절 시점
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES notification_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_subscribers_channel_id ON subscribers(channel_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_fcm_token ON subscribers(fcm_token);
CREATE INDEX IF NOT EXISTS idx_contents_channel_id ON contents(channel_id);
CREATE INDEX IF NOT EXISTS idx_notification_batches_channel_id ON notification_batches(channel_id);
CREATE INDEX IF NOT EXISTS idx_notification_batches_status ON notification_batches(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_batch_id ON notification_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_subscriber_id ON notification_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
