// src/types/index.ts
export type Bindings = {
  DB: D1Database
  FCM_SERVER_KEY: string
  FCM_PROJECT_ID: string
  FCM_SERVICE_ACCOUNT_JSON: string   // Firebase 서비스 계정 JSON (FCM V1 API용)
  ADMIN_SECRET: string
  CLOUD_RUN_SECRET: string           // Cloud Run 내부 API 공유 시크릿
  KV?: KVNamespace  // APK 파일 저장용 (optional)
}

export interface Channel {
  id: number
  name: string
  description?: string
  image_url?: string
  owner_id: string
  is_active: number
  public_id: string
  created_at: string
  updated_at: string
}

export interface ChannelInviteLink {
  id: number
  channel_id: number
  invite_token: string
  label?: string
  max_uses?: number
  use_count: number
  expires_at?: string
  is_active: number
  created_by: string
  created_at: string
}

export interface Subscriber {
  id: number
  channel_id: number
  user_id: string
  display_name?: string
  fcm_token: string
  platform: 'android' | 'ios' | 'web'
  is_active: number
  joined_via_invite_id?: number
  accepted_count: number
  rejected_count: number
  last_seen_at?: string
  subscribed_at: string
  updated_at: string
}

export interface Content {
  id: number
  channel_id: number
  title: string
  description?: string
  content_type: 'audio' | 'video' | 'youtube'
  content_url: string
  thumbnail_url?: string
  duration_seconds?: number
  metadata?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface NotificationBatch {
  id: number
  channel_id: number
  content_id: number
  title: string
  body: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_targets: number
  sent_count: number
  failed_count: number
  accepted_count: number
  rejected_count: number
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  created_by: string
  created_at: string
}
