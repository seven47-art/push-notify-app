-- 기존 이미지 없는 채널에 RinGo 기본 아이콘 적용
-- 서버 배포 URL 기준: https://ringo-server.pages.dev/static/ringo-icon.png
UPDATE channels
SET image_url = 'https://ringo-server.pages.dev/static/ringo-icon.png',
    updated_at = CURRENT_TIMESTAMP
WHERE (image_url IS NULL OR image_url = '')
  AND is_active = 1;
