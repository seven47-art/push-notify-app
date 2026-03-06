package com.pushnotify.push_notify_app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * RinGoFCMService
 *
 * 역할: FCM data-only 메시지 수신 → 세 가지 타입 처리
 *
 * type = "alarm_schedule"  (알람 시간 2분 전 예약 신호)
 *   → AlarmScheduler.schedule() 로 AlarmManager에 정확한 시간 예약
 *   → OS가 scheduled_time에 AlarmReceiver 실행 → FakeCallActivity 전체화면
 *   → 도즈/배터리 최적화 완전 무시, 초 단위 정확
 *
 * type = "alarm_cancel"  (알람 취소 신호)
 *   → AlarmScheduler.cancel() 로 AlarmManager 예약 취소
 *   → 이미 예약된 로컬 알람이 울리지 않도록 차단
 *
 * type = "alarm"  (기존 즉시 실행 — 폴백)
 *   → AlarmPollingService.showAlarm() → nm.notify(fullScreenIntent)
 *   → CallForegroundService.start() → WakeLock 획득
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

            // ── 신규: 5분 전 예약 신호 ──────────────────────────────────
            // 서버가 알람 등록 시 구독자 전체에게 FCM으로 미리 전송
            // 앱이 이 신호를 받아 AlarmManager로 정확한 시간에 로컬 알람 예약
            "alarm_schedule" -> {
                val scheduledMs = data["scheduled_time"]?.toLongOrNull() ?: 0L
                if (scheduledMs <= 0L) {
                    Log.w(TAG, "alarm_schedule: scheduled_time 누락, 무시")
                    return
                }

                Log.d(TAG, "AlarmManager 예약: $channelName (id=$alarmId), scheduledMs=$scheduledMs")

                AlarmScheduler.schedule(
                    applicationContext,
                    alarmId,
                    scheduledMs,
                    channelName,
                    msgType,
                    msgValue,
                    contentUrl,
                    homepageUrl
                )
            }

            // ── 신규: 알람 취소 신호 ────────────────────────────────────
            // 서버에서 알람 삭제 시 구독자 전체에게 FCM으로 취소 신호 전송
            // 앱이 이 신호를 받아 AlarmManager에 예약된 로컬 알람을 취소
            "alarm_cancel" -> {
                if (alarmId <= 0) {
                    Log.w(TAG, "alarm_cancel: alarm_id 누락, 무시")
                    return
                }
                Log.d(TAG, "AlarmManager 취소: $channelName (id=$alarmId)")
                AlarmScheduler.cancel(applicationContext, alarmId)
            }

            // ── 기존: 즉시 알람 (폴링 폴백 또는 테스트) ────────────────
            "alarm" -> {
                Log.d(TAG, "FCM 즉시 알람 수신: $channelName (id=$alarmId)")

                // 폴링 중복 방지 등록
                AlarmPollingService.markFcmHandled(applicationContext, alarmId)

                // 알람 알림 발행
                AlarmPollingService.showAlarm(
                    applicationContext, channelName, msgType, msgValue,
                    alarmId, contentUrl, homepageUrl
                )

                // WakeLock 획득 (화면 켜기 보조)
                CallForegroundService.start(
                    applicationContext, channelName, msgType, msgValue,
                    alarmId, contentUrl, homepageUrl
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
