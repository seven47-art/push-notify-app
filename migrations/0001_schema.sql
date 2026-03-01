-- ============================================================
-- Push Notification Admin - 폐쇄형 채널 시스템 (v2)
-- 채널은 외부 비노출, 초대 링크를 통해서만 참여 가능
-- ============================================================

-- 채널 (비노출 - 직접 검색/조회 불가)
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  owner_id TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  public_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 채널 초대 링크 (폐쇄형 핵심)
CREATE TABLE IF NOT EXISTS channel_invite_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  label TEXT,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  expires_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- 구독자 (반드시 invite_token으로 가입)
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('android', 'ios', 'web')),
  is_active INTEGER DEFAULT 1,
  joined_via_invite_id INTEGER,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (joined_via_invite_id) REFERENCES channel_invite_links(id),
  UNIQUE(channel_id, user_id)
);

-- 콘텐츠 (audio / video / youtube)
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK(content_type IN ('audio', 'video', 'youtube')),
  content_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  metadata TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- 알림 발송 배치
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

-- 개별 알림 발송 로그
CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  subscriber_id INTEGER NOT NULL,
  fcm_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'accepted', 'rejected')),
  fcm_message_id TEXT,
  error_message TEXT,
  sent_at DATETIME,
  action_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES notification_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_public_id ON channels(public_id);
CREATE INDEX IF NOT EXISTS idx_invite_token ON channel_invite_links(invite_token);
CREATE INDEX IF NOT EXISTS idx_invite_channel_id ON channel_invite_links(channel_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_channel ON subscribers(channel_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_fcm ON subscribers(fcm_token);
CREATE INDEX IF NOT EXISTS idx_contents_channel ON contents(channel_id);
CREATE INDEX IF NOT EXISTS idx_batches_channel ON notification_batches(channel_id);
CREATE INDEX IF NOT EXISTS idx_logs_batch ON notification_logs(batch_id);
