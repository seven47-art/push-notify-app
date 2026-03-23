-- 알람 스케줄 켜기/끄기 토글 컬럼
ALTER TABLE alarm_schedules ADD COLUMN is_enabled INTEGER DEFAULT 1;
