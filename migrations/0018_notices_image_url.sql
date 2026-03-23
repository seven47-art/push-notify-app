-- 공지사항 이미지 URL 컬럼 추가
ALTER TABLE notices ADD COLUMN image_url TEXT DEFAULT NULL;
