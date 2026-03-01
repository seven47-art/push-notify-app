// src/routes/notifications.ts
import { Hono } from 'hono'
import type { Bindings } from '../types'

const notifications = new Hono<{ Bindings: Bindings }>()

// =============================================
// FCM HTTP v1 API를 이용한 푸시 발송 유틸리티
// =============================================

interface FCMMessage {
  token: string
  notification: { title: string; body: string }
  data?: Record<string, string>
  android?: { priority: string }
  apns?: { payload: { aps: Record<string, any> } }
}

async function sendFCMNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  serverKey: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Legacy FCM API (Server Key 방식)
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${serverKey}`
      },
      body: JSON.stringify({
        to: token,
        priority: 'high',
        notification: {
          title,
          body,
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: 'push_content_channel',
            priority: 'max',
            visibility: 'public'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: 'default',
              'content-available': 1,
              badge: 1
            }
          },
          headers: { 'apns-priority': '10' }
        }
      })
    })
    
    const result: any = await response.json()
    
    if (result.success === 1) {
      return { success: true, messageId: result.results?.[0]?.message_id }
    } else {
      return { success: false, error: result.results?.[0]?.error || 'FCM send failed' }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// GET /api/notifications/batches?channel_id=X - 배치 목록 조회
notifications.get('/batches', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    let query = `
      SELECT 
        nb.*,
        ch.name as channel_name,
        ct.title as content_title,
        ct.content_type,
        ct.thumbnail_url
      FROM notification_batches nb
      JOIN channels ch ON nb.channel_id = ch.id
      JOIN contents ct ON nb.content_id = ct.id
    `
    const params: any[] = []
    if (channelId) {
      query += ' WHERE nb.channel_id = ?'
      params.push(channelId)
    }
    query += ' ORDER BY nb.created_at DESC LIMIT 50'
    
    const stmt = c.env.DB.prepare(query)
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all()
    return c.json({ success: true, data: results })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/notifications/batches/:id - 배치 상세 + 로그 조회
notifications.get('/batches/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const batch = await c.env.DB.prepare(`
      SELECT nb.*, ch.name as channel_name, ct.title as content_title, ct.content_type
      FROM notification_batches nb
      JOIN channels ch ON nb.channel_id = ch.id
      JOIN contents ct ON nb.content_id = ct.id
      WHERE nb.id = ?
    `).bind(id).first()
    
    if (!batch) return c.json({ success: false, error: 'Batch not found' }, 404)
    
    const { results: logs } = await c.env.DB.prepare(`
      SELECT nl.*, s.display_name, s.platform
      FROM notification_logs nl
      JOIN subscribers s ON nl.subscriber_id = s.id
      WHERE nl.batch_id = ?
      ORDER BY nl.created_at DESC
    `).bind(id).all()
    
    return c.json({ success: true, data: { ...batch, logs } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /api/notifications/send - 푸시 알림 발송 (콘텐츠 등록 시 트리거)
notifications.post('/send', async (c) => {
  try {
    const body = await c.req.json()
    const { channel_id, content_id, title, body: notifBody, created_by } = body
    
    if (!channel_id || !content_id || !title || !notifBody || !created_by) {
      return c.json({ success: false, error: 'channel_id, content_id, title, body, created_by are required' }, 400)
    }
    
    // 콘텐츠 정보 조회
    const content: any = await c.env.DB.prepare('SELECT * FROM contents WHERE id = ?').bind(content_id).first()
    if (!content) return c.json({ success: false, error: 'Content not found' }, 404)
    
    // 활성 구독자 조회
    const { results: activeSubscribers } = await c.env.DB.prepare(`
      SELECT * FROM subscribers WHERE channel_id = ? AND is_active = 1
    `).bind(channel_id).all() as { results: any[] }
    
    if (activeSubscribers.length === 0) {
      return c.json({ success: false, error: 'No active subscribers found' }, 400)
    }
    
    // 배치 생성
    const batchResult = await c.env.DB.prepare(`
      INSERT INTO notification_batches (channel_id, content_id, title, body, status, total_targets, created_by, started_at)
      VALUES (?, ?, ?, ?, 'processing', ?, ?, CURRENT_TIMESTAMP)
    `).bind(channel_id, content_id, title, notifBody, activeSubscribers.length, created_by).run()
    
    const batchId = batchResult.meta.last_row_id
    
    // FCM 서버 키 확인
    const fcmServerKey = c.env.FCM_SERVER_KEY
    
    let sentCount = 0
    let failedCount = 0
    
    // 구독자별 개별 발송 (배치 처리)
    const BATCH_SIZE = 100
    for (let i = 0; i < activeSubscribers.length; i += BATCH_SIZE) {
      const batch = activeSubscribers.slice(i, i + BATCH_SIZE)
      
      await Promise.all(batch.map(async (subscriber: any) => {
        // 로그 생성
        const logResult = await c.env.DB.prepare(`
          INSERT INTO notification_logs (batch_id, subscriber_id, fcm_token, status)
          VALUES (?, ?, ?, 'pending')
        `).bind(batchId, subscriber.id, subscriber.fcm_token).run()
        
        // FCM 키가 없으면 시뮬레이션 모드
        if (!fcmServerKey || fcmServerKey === 'your-fcm-server-key') {
          // 시뮬레이션: 90% 성공률
          const simSuccess = Math.random() > 0.1
          await c.env.DB.prepare(`
            UPDATE notification_logs 
            SET status = ?, fcm_message_id = ?, sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            simSuccess ? 'sent' : 'failed',
            simSuccess ? `sim_msg_${Date.now()}_${subscriber.id}` : null,
            logResult.meta.last_row_id
          ).run()
          
          if (simSuccess) sentCount++
          else failedCount++
        } else {
          // 실제 FCM 발송
          const fcmResult = await sendFCMNotification(
            subscriber.fcm_token,
            title,
            notifBody,
            {
              content_id: String(content_id),
              content_type: content.content_type,
              content_url: content.content_url,
              thumbnail_url: content.thumbnail_url || '',
              batch_id: String(batchId),
              subscriber_id: String(subscriber.id)
            },
            fcmServerKey
          )
          
          await c.env.DB.prepare(`
            UPDATE notification_logs 
            SET status = ?, fcm_message_id = ?, error_message = ?, sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            fcmResult.success ? 'sent' : 'failed',
            fcmResult.messageId || null,
            fcmResult.error || null,
            logResult.meta.last_row_id
          ).run()
          
          if (fcmResult.success) sentCount++
          else failedCount++
        }
      }))
    }
    
    // 배치 완료 처리
    await c.env.DB.prepare(`
      UPDATE notification_batches 
      SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(sentCount, failedCount, batchId).run()
    
    return c.json({
      success: true,
      data: {
        batch_id: batchId,
        total_targets: activeSubscribers.length,
        sent_count: sentCount,
        failed_count: failedCount,
        mode: (!fcmServerKey || fcmServerKey === 'your-fcm-server-key') ? 'simulation' : 'live'
      }
    }, 201)
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/notifications/stats - 전체 통계
notifications.get('/stats', async (c) => {
  try {
    const channelId = c.req.query('channel_id')
    
    const whereClause = channelId ? 'WHERE nb.channel_id = ?' : ''
    const params = channelId ? [channelId] : []
    
    const statsStmt = c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT nb.id) as total_batches,
        SUM(nb.total_targets) as total_targets,
        SUM(nb.sent_count) as total_sent,
        SUM(nb.failed_count) as total_failed,
        SUM(nb.accepted_count) as total_accepted,
        SUM(nb.rejected_count) as total_rejected,
        ROUND(
          CAST(SUM(nb.accepted_count) AS FLOAT) / 
          NULLIF(SUM(nb.sent_count), 0) * 100, 1
        ) as accept_rate
      FROM notification_batches nb
      ${whereClause}
    `)
    
    const stats = params.length ? await statsStmt.bind(...params).first() : await statsStmt.first()
    
    // 최근 7일 일별 발송 통계
    const dailyStmt = c.env.DB.prepare(`
      SELECT 
        DATE(nb.created_at) as date,
        COUNT(*) as batch_count,
        SUM(nb.sent_count) as sent_count,
        SUM(nb.accepted_count) as accepted_count
      FROM notification_batches nb
      ${channelId ? 'WHERE nb.channel_id = ?' : ''}
      GROUP BY DATE(nb.created_at)
      ORDER BY date DESC
      LIMIT 7
    `)
    
    const { results: daily } = params.length 
      ? await dailyStmt.bind(...params).all() 
      : await dailyStmt.all()
    
    return c.json({ success: true, data: { summary: stats, daily } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default notifications
