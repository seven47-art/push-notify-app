-- 비밀채널 기능 추가
-- is_secret: 비밀채널 여부 (0=공개, 1=비밀)
-- password_hash: 비밀번호 해시 (SHA-256)
ALTER TABLE channels ADD COLUMN is_secret INTEGER DEFAULT 0;
ALTER TABLE channels ADD COLUMN password_hash TEXT;
