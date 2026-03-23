-- alarm_schedules 테이블에 content_text 컬럼 추가
-- 알람 설정 시 입력하는 알람내용 (선택, 최대 20자)
-- 수신 화면 / 콘텐츠 재생 화면에 표시
ALTER TABLE alarm_schedules ADD COLUMN content_text TEXT;

-- alarm_logs 테이블에 content_text 컬럼 추가
-- 수신함/발신함에서 알람내용 표시용
ALTER TABLE alarm_logs ADD COLUMN content_text TEXT;
