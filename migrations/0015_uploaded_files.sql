-- ============================================================
-- 0015_uploaded_files.sql
-- 파일 업로드 상태 관리 테이블
-- 앱 → Firebase Storage 직접 업로드 후 상태 추적
-- ============================================================

CREATE TABLE IF NOT EXISTS uploaded_files (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT     NOT NULL,
  file_type     TEXT     NOT NULL CHECK(file_type IN ('video', 'audio')),
  original_ext  TEXT     NOT NULL,                      -- 원본 확장자 (mp4, mov, mp3, m4a, wav)
  original_path TEXT     NOT NULL,                      -- Storage 원본 경로 (original/{userId}/{timestamp}_{name})
  original_url  TEXT,                                   -- 원본 다운로드 URL
  processed_path TEXT,                                  -- Storage 변환 경로 (processed/{userId}/{timestamp}_{name}.mp4|m4a)
  processed_url  TEXT,                                  -- 변환 완료 URL (알람에서 이 값만 사용)
  status        TEXT     NOT NULL DEFAULT 'uploading'
                         CHECK(status IN ('uploading', 'processing', 'ready', 'failed')),
  -- ffprobe 분석 결과
  duration_sec  REAL,                                   -- 재생 길이 (초)
  video_codec   TEXT,                                   -- 영상 코덱 (video 타입만)
  audio_codec   TEXT,                                   -- 오디오 코덱
  resolution    TEXT,                                   -- 해상도 ex) 1280x720 (video 타입만)
  file_size     INTEGER,                                -- 원본 파일 크기 (bytes)
  error_message TEXT,                                   -- 실패 시 오류 메시지
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 상태 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_status  ON uploaded_files(status);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at);
