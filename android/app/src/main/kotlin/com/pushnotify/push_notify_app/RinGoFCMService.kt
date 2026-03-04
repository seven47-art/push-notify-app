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
 * FCM data-only 메시지 수신 → FakeCallActivity 표시
 *
 * ▶ 앱 포그라운드: Flutter onMessage 리스너가 처리 (main.dart)
 * ▶ 앱 백그라운드/종료: 이 서비스가 Notification + fullScreenIntent 로 FakeCallActivity 직접 실행
 *
 * Android 10+ 에서 백그라운드/종료 상태에서 startActivity() 직접 호출 불가
 * → fullScreenIntent 를 가진 Notification 을 띄워야 잠금화면 위에 Activity 표시 가능
 */
class RinGoFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG              = "RinGoFCMService"
        private const val CHANNEL_ID       = "alarm_channel"
        private const val CHANNEL_NAME     = "RinGo 알람"
        private const val NOTIFICATION_ID  = 9999
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        Log.d(TAG, "FCM 메시지 수신: ${message.data}")

        val data = message.data
        if (data["type"] != "alarm") return

        val channelName  = data["channel_name"] ?: "알람"
        val alarmMsgType = data["msg_type"]     ?: "youtube"
        val msgValue     = data["msg_value"]    ?: ""
        val alarmId      = data["alarm_id"]?.toIntOrNull() ?: 0
        val contentUrl   = data["content_url"]  ?: ""

        Log.d(TAG, "알람 수신: $channelName / $alarmMsgType")

        // 앱이 포그라운드인지 확인
        // 포그라운드: Flutter onMessage 리스너가 처리하므로 여기서는 스킵
        // 백그라운드/종료: fullScreenIntent Notification으로 FakeCallActivity 띄움
        if (isAppInForeground()) {
            Log.d(TAG, "앱 포그라운드 → Flutter onMessage 처리")
            return
        }

        Log.d(TAG, "앱 백그라운드/종료 → fullScreenIntent Notification 발송")
        showFullScreenNotification(channelName, alarmMsgType, msgValue, alarmId, contentUrl)
    }

    private fun isAppInForeground(): Boolean {
        val am = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
        val tasks = am.runningAppProcesses ?: return false
        return tasks.any {
            it.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                    && it.processName == packageName
        }
    }

    private fun showFullScreenNotification(
        channelName: String,
        msgType: String,
        msgValue: String,
        alarmId: Int,
        contentUrl: String
    ) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 알림 채널 생성 (Android 8+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description    = "RinGo 알람 전화 화면"
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
                enableVibration(false) // FakeCallActivity에서 직접 진동 처리
                setSound(null, null)   // FakeCallActivity에서 직접 벨소리 처리
            }
            nm.createNotificationChannel(channel)
        }

        // FakeCallActivity 시작 Intent
        val fullScreenIntent = Intent(applicationContext, FakeCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(FakeCallActivity.EXTRA_CHANNEL_NAME, channelName)
            putExtra(FakeCallActivity.EXTRA_MSG_TYPE,     msgType)
            putExtra(FakeCallActivity.EXTRA_MSG_VALUE,    msgValue)
            putExtra(FakeCallActivity.EXTRA_ALARM_ID,     alarmId)
            putExtra(FakeCallActivity.EXTRA_CONTENT_URL,  contentUrl)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT

        val fullScreenPendingIntent = PendingIntent.getActivity(
            applicationContext,
            alarmId,
            fullScreenIntent,
            flags
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle(channelName)
            .setContentText("RinGo 알람이 도착했습니다")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(true)                     // 스와이프로 제거 불가 (통화 중 스타일)
            .setFullScreenIntent(fullScreenPendingIntent, true)  // ← 잠금화면 위 Activity 실행 핵심
            .setContentIntent(fullScreenPendingIntent)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM 토큰 갱신: $token")
    }
}
