-- alarm_logs에 scheduled_at (알람이 울리는 시간), link_url (연결 URL) 컬럼 추가
ALTER TABLE alarm_logs ADD COLUMN scheduled_at TEXT;
ALTER TABLE alarm_logs ADD COLUMN link_url TEXT;
