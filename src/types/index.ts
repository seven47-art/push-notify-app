// src/types/index.ts
export type Bindings = {
  DB: D1Database
  FCM_SERVER_KEY: string
  FCM_PROJECT_ID: string
  ADMIN_SECRET: string
}

export interface Channel {
  id: number
  name: string
  description?: string
  image_url?: string
  owner_id: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface Subscriber {
  id: number
  channel_id: number
  user_id: string
  display_name?: string
  fcm_token: string
  platform: 'android' | 'ios' | 'web'
  is_active: number
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

export interface NotificationLog {
  id: number
  batch_id: number
  subscriber_id: number
  fcm_token: string
  status: 'pending' | 'sent' | 'failed' | 'accepted' | 'rejected'
  fcm_message_id?: string
  error_message?: string
  sent_at?: string
  action_at?: string
  created_at: string
}
