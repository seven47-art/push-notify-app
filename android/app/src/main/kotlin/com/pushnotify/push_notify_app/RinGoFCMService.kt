package com.pushnotify.push_notify_app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * RinGoFCMService
 *
 * FCM data-only 메시지 수신 처리
 *
 * ▶ 처리 흐름:
 *   FCM 메시지 수신
 *   → CallForegroundService.start() 호출 (Foreground Service로 시작)
 *   → CallForegroundService.onStartCommand() → startForeground() + FakeCallActivity.start()
 *   → 잠금화면 위에 FakeCall 화면 표시
 *
 * ▶ 왜 Foreground Service인가?
 *   - Android 8+ 에서 백그라운드 앱의 startActivity() 직접 호출 불가
 *   - Foreground Service는 OS가 kill하지 않음 (카카오톡 보이스톡 방식)
 *   - 배터리 최적화/도즈 모드에서도 안정적 동작
 *   - 앱 완전 종료(swipe kill) 후에도 FCM 수신 가능
 */
class RinGoFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "RinGoFCMService"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        Log.d(TAG, "FCM 메시지 수신: ${message.data}")

        val data = message.data
        if (data["type"] != "alarm") {
            Log.d(TAG, "알람 타입 아님, 무시: ${data["type"]}")
            return
        }

        val channelName  = data["channel_name"] ?: "알람"
        val alarmMsgType = data["msg_type"]     ?: "youtube"
        val msgValue     = data["msg_value"]    ?: ""
        val alarmId      = data["alarm_id"]?.toIntOrNull() ?: 0
        val contentUrl   = data["content_url"]  ?: ""

        Log.d(TAG, "알람 수신 → CallForegroundService 시작: channel=$channelName, type=$alarmMsgType, id=$alarmId")

        // CallForegroundService 시작 (Foreground Service)
        // startForeground() → fullScreenIntent → FakeCallActivity 표시
        CallForegroundService.start(
            context     = applicationContext,
            channelName = channelName,
            msgType     = alarmMsgType,
            msgValue    = msgValue,
            alarmId     = alarmId,
            contentUrl  = contentUrl
        )
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM 토큰 갱신: $token")
    }
}
