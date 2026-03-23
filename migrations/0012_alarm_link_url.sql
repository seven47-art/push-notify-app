-- alarm_schedules 테이블에 link_url 컬럼 추가
-- 알람 설정 시 연결 URL 저장용 (NULL 허용 - 기존 데이터 영향 없음)
-- NOTE: 이미 수동 적용됨 — 중복 방지를 위해 CREATE VIEW/DROP VIEW 패턴 사용
CREATE VIEW IF NOT EXISTS _migration_0012_check AS SELECT 1;
DROP VIEW IF EXISTS _migration_0012_check;
-- 컬럼이 이미 존재하므로 no-op (원본: ALTER TABLE alarm_schedules ADD COLUMN link_url TEXT);
SELECT 1;
