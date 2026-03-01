-- v2 시드 데이터 (폐쇄형 채널)

-- 채널 (public_id 포함, 외부 비노출)
INSERT OR IGNORE INTO channels (id, name, description, image_url, owner_id, public_id) VALUES
  (1, '힐링 뮤직 채널', '마음이 편안해지는 힐링 음악을 전달합니다', 'https://picsum.photos/seed/channel1/400/400', 'admin', 'ch_heal_music_7f3a9b2e'),
  (2, '교육 콘텐츠 채널', '유익한 교육 영상 및 강의를 제공합니다', 'https://picsum.photos/seed/channel2/400/400', 'admin', 'ch_edu_content_4d8c1f6a'),
  (3, '뉴스 & 시사 채널', '최신 뉴스와 시사 이슈를 빠르게 전달합니다', 'https://picsum.photos/seed/channel3/400/400', 'admin', 'ch_news_daily_2e5b9d3c');

-- 초대 링크 (각 채널당 여러 링크)
INSERT OR IGNORE INTO channel_invite_links (id, channel_id, invite_token, label, max_uses, use_count, expires_at, is_active, created_by) VALUES
  (1, 1, 'inv_heal_vip_Xk9mP2nQ', 'VIP 초대링크', 50, 5, NULL, 1, 'admin'),
  (2, 1, 'inv_heal_gen_Yw7rT5sA', '일반 초대링크', NULL, 8, NULL, 1, 'admin'),
  (3, 1, 'inv_heal_tmp_Bz3vL8dR', '임시 링크 (만료됨)', 10, 3, datetime('now', '-1 day'), 1, 'admin'),
  (4, 2, 'inv_edu_main_Cv6nM1gJ', '메인 초대링크', 100, 3, NULL, 1, 'admin'),
  (5, 2, 'inv_edu_beta_Dn4wK7hS', '베타테스터 링크', 20, 0, datetime('now', '+30 days'), 1, 'admin'),
  (6, 3, 'inv_news_Fp2xN9eU', '뉴스채널 초대', NULL, 2, NULL, 1, 'admin');

-- 구독자 (joined_via_invite_id 포함)
INSERT OR IGNORE INTO subscribers (channel_id, user_id, display_name, fcm_token, platform, joined_via_invite_id, accepted_count, rejected_count) VALUES
  (1, 'user_001', '김민준', 'fcm_token_test_001', 'android', 1, 12, 2),
  (1, 'user_002', '이서연', 'fcm_token_test_002', 'ios', 2, 8, 1),
  (1, 'user_003', '박지호', 'fcm_token_test_003', 'android', 2, 15, 0),
  (1, 'user_004', '최수아', 'fcm_token_test_004', 'ios', 1, 5, 3),
  (1, 'user_005', '정도윤', 'fcm_token_test_005', 'android', 2, 20, 1),
  (2, 'user_006', '강하은', 'fcm_token_test_006', 'android', 4, 7, 0),
  (2, 'user_007', '조현우', 'fcm_token_test_007', 'ios', 4, 11, 2),
  (2, 'user_008', '윤지아', 'fcm_token_test_008', 'android', 4, 3, 1),
  (3, 'user_009', '임준서', 'fcm_token_test_009', 'ios', 6, 9, 4),
  (3, 'user_010', '한소율', 'fcm_token_test_010', 'android', 6, 6, 0);

-- 콘텐츠
INSERT OR IGNORE INTO contents (channel_id, title, description, content_type, content_url, thumbnail_url, duration_seconds, created_by) VALUES
  (1, '봄날의 힐링 피아노', '봄날의 감성을 담은 힐링 피아노 연주곡', 'audio', 'https://example.com/audio/spring_piano.mp3', 'https://picsum.photos/seed/ct1/400/225', 245, 'admin'),
  (1, '자연 소리 명상', '숲속 새소리와 물소리로 마음을 안정시키는 명상 음악', 'audio', 'https://example.com/audio/nature.mp3', 'https://picsum.photos/seed/ct2/400/225', 1800, 'admin'),
  (2, 'JavaScript 기초 강의', '프로그래밍 입문자를 위한 JavaScript 기초 강의', 'youtube', 'https://youtube.com/watch?v=dQw4w9WgXcQ', 'https://picsum.photos/seed/ct3/400/225', 3600, 'admin'),
  (2, 'React 실전 프로젝트', 'React를 활용한 실전 웹 프로젝트 구축하기', 'video', 'https://example.com/video/react.mp4', 'https://picsum.photos/seed/ct4/400/225', 5400, 'admin'),
  (3, '오늘의 뉴스 브리핑', '최신 시사 이슈 5분 요약', 'youtube', 'https://youtube.com/watch?v=example1', 'https://picsum.photos/seed/ct5/400/225', 300, 'admin');

-- 알림 배치
INSERT OR IGNORE INTO notification_batches (channel_id, content_id, title, body, status, total_targets, sent_count, failed_count, accepted_count, rejected_count, created_by, started_at, completed_at) VALUES
  (1, 1, '새 음악이 등록되었습니다 🎵', '봄날의 힐링 피아노 - 지금 바로 들어보세요!', 'completed', 5, 5, 0, 4, 1, 'admin', datetime('now', '-2 days'), datetime('now', '-2 days', '+5 minutes')),
  (2, 3, '새 강의가 업로드되었습니다 📚', 'JavaScript 기초 강의를 확인해보세요!', 'completed', 3, 3, 0, 2, 1, 'admin', datetime('now', '-1 day'), datetime('now', '-1 day', '+3 minutes')),
  (1, 2, '명상 음악 업로드 완료 🧘', '자연 소리 명상 - 스트레스를 풀어드립니다', 'completed', 5, 4, 1, 3, 1, 'admin', datetime('now', '-12 hours'), datetime('now', '-12 hours', '+4 minutes'));
