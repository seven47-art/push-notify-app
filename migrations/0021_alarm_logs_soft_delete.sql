-- alarm_logs 소프트 삭제 컬럼 추가
-- 수신함/발신함 삭제 시 각자의 플래그만 변경 (상대방 데이터 유지)
-- 채널 삭제/회원 탈퇴 시에는 기존대로 행 자체 삭제 (ON DELETE CASCADE)
ALTER TABLE alarm_logs ADD COLUMN deleted_by_sender INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alarm_logs ADD COLUMN deleted_by_receiver INTEGER NOT NULL DEFAULT 0;
