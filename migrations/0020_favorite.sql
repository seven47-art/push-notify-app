-- 즐겨찾기 기능: channels (내 채널), subscribers (구독 채널)
ALTER TABLE channels ADD COLUMN is_favorite INTEGER DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN is_favorite INTEGER DEFAULT 0;
