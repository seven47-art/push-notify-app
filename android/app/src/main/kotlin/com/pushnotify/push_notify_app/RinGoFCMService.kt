package com.pushnotify.push_notify_app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * RinGoFCMService  v1.0.37
 *
 * [수정 내역 v1.0.37]
 *  type = "alarm"
 *   → AlarmPollingService.triggerAlarm() 호출
 *   → FakeCallActivity.start() 직접 실행 (항상 풀스크린)
 *
 *  type = "alarm_schedule" → AlarmScheduler.schedule() (로컬 AlarmManager 예약)
 *  type = "alarm_cancel"   → AlarmScheduler.cancel()
 */
class RinGoFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "RinGoFCMService"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val type = data["type"] ?: return

        val channelName = data["channel_name"]            ?: "알람"
        val msgType     = data["msg_type"]                ?: "youtube"
        val msgValue    = data["msg_value"]               ?: ""
        val alarmId     = data["alarm_id"]?.toIntOrNull() ?: 0
        val contentUrl  = data["content_url"]             ?: ""
        val homepageUrl = data["homepage_url"]            ?: ""

        when (type) {

            // ── 알람 예약 신호 (서버 → 앱, 로컬 AlarmManager 예약) ──
            "alarm_schedule" -> {
                val scheduledMs = data["scheduled_time"]?.toLongOrNull() ?: 0L
                if (scheduledMs <= 0L) {
                    Log.w(TAG, "alarm_schedule: scheduled_time 누락, 무시")
                    return
                }
                Log.d(TAG, "AlarmManager 예약: $channelName (id=$alarmId)")
                AlarmScheduler.schedule(
                    applicationContext, alarmId, scheduledMs,
                    channelName, msgType, msgValue, contentUrl, homepageUrl
                )
            }

            // ── 알람 취소 신호 ────────────────────────────────────────
            "alarm_cancel" -> {
                if (alarmId <= 0) { Log.w(TAG, "alarm_cancel: alarm_id 누락"); return }
                Log.d(TAG, "AlarmManager 취소: $channelName (id=$alarmId)")
                AlarmScheduler.cancel(applicationContext, alarmId)
            }

            // ── 즉시 알람 (FCM 직접 수신) ─────────────────────────────
            // [v1.0.37] NotificationManager → FakeCallActivity.start() 직접 호출
            "alarm" -> {
                Log.d(TAG, "FCM 즉시 알람: $channelName (id=$alarmId)")

                // 중복 방지
                AlarmPollingService.markFcmHandled(applicationContext, alarmId)

                // [v1.0.37] 풀스크린 통화 수신 화면 직접 실행
                AlarmPollingService.triggerAlarm(
                    applicationContext,
                    channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
                )
            }

            else -> Log.w(TAG, "알 수 없는 FCM type: $type")
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM 토큰 갱신: $token")
    }
}
