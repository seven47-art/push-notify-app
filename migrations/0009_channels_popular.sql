-- channels 테이블에 인기채널 지정 컬럼 추가
ALTER TABLE channels ADD COLUMN is_popular INTEGER DEFAULT 0;

-- 인기채널 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_popular ON channels(is_popular);
