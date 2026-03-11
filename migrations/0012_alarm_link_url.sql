-- alarm_schedules 테이블에 link_url 컬럼 추가
-- 알람 설정 시 연결 URL 저장용 (NULL 허용 - 기존 데이터 영향 없음)
ALTER TABLE alarm_schedules ADD COLUMN link_url TEXT;
