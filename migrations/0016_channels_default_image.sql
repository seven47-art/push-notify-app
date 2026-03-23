-- 기존 이미지 없는 채널에 RinGo 기본 채널 이미지 적용
-- 검정 배경 + R 그라데이션 아이콘 (512x512)
UPDATE channels
SET image_url = 'https://ringo-server.pages.dev/static/ringo-default-channel.png',
    updated_at = CURRENT_TIMESTAMP
WHERE (image_url IS NULL OR image_url = '')
  AND is_active = 1;
