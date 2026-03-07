package com.pushnotify.push_notify_app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * RinGoFCMService  v1.0.42
 *
 * FCM 메시지 수신 처리:
 *  - alarm_schedule: 로컬 AlarmManager로 예약
 *  - alarm_cancel: AlarmManager 취소
 *  - alarm: 즉시 triggerAlarm() 호출 → FakeCallActivity 풀스크린 실행
 *
 * v1.0.42: 중복 방지 로직을 triggerAlarm() 내부로 이동
 *          (FCM/AlarmManager/Polling/AlarmScheduler 모든 경로 단일 처리)
 */
class RinGoFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "RinGoFCMService"
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "New FCM token: $token")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val msgType = data["type"] ?: return
        Log.d(TAG, "FCM 수신: type=$msgType")

        when (msgType) {
            "alarm_schedule" -> handleSchedule(data)
            "alarm_cancel"   -> handleCancel(data)
            "alarm"          -> handleAlarmNow(data)
            else             -> Log.w(TAG, "알 수 없는 FCM type: $msgType")
        }
    }

    private fun handleSchedule(data: Map<String, String>) {
        val alarmId         = data["alarm_id"]?.toIntOrNull()    ?: return
        val scheduledMs     = data["scheduled_time"]?.toLongOrNull() ?: return
        val channelName     = data["channel_name"]     ?: "알람"
        val channelPublicId = data["channel_public_id"] ?: ""
        val msgType         = data["msg_type"]          ?: "youtube"
        val msgValue        = data["msg_value"]         ?: ""
        val contentUrl      = data["content_url"]       ?: ""
        val homepageUrl     = data["homepage_url"]      ?: ""

        Log.d(TAG, "알람 예약: $channelName (id=$alarmId) at $scheduledMs")
        AlarmScheduler.schedule(
            this, alarmId, scheduledMs,
            channelName, msgType, msgValue, contentUrl, homepageUrl, channelPublicId
        )
    }

    private fun handleCancel(data: Map<String, String>) {
        val alarmId = data["alarm_id"]?.toIntOrNull() ?: return
        Log.d(TAG, "알람 취소: id=$alarmId")
        AlarmScheduler.cancel(this, alarmId)
    }

    private fun handleAlarmNow(data: Map<String, String>) {
        val alarmId         = data["alarm_id"]?.toIntOrNull()  ?: 0
        val channelName     = data["channel_name"]     ?: "알람"
        val channelPublicId = data["channel_public_id"] ?: ""
        val msgType         = data["msg_type"]          ?: "youtube"
        val msgValue        = data["msg_value"]         ?: ""
        val contentUrl      = data["content_url"]       ?: ""
        val homepageUrl     = data["homepage_url"]      ?: ""

        // v1.0.42: 중복 방지는 triggerAlarm() 내부 synchronized 블록에서 처리
        Log.d(TAG, "FCM 즉시 알람: $channelName (id=$alarmId)")
        AlarmPollingService.triggerAlarm(
            this, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl, channelPublicId
        )
    }
}
