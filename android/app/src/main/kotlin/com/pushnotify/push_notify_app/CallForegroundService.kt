package com.pushnotify.push_notify_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * CallForegroundService
 *
 * 카카오톡 보이스톡과 동일한 방식:
 * FCM 수신 → Foreground Service 시작 → fullScreenIntent로 FakeCallActivity 표시
 *
 * ▶ Foreground Service는 Android OS가 절대 kill하지 않음
 * ▶ 배터리 최적화 앱(도즈 모드)에서도 안정적으로 동작
 * ▶ 앱 완전 종료(swipe kill) 상태에서도 FCM → Foreground Service 동작
 *
 * 흐름:
 * FCM onMessageReceived
 *   → startForegroundService(CallForegroundService)
 *   → onStartCommand에서 즉시 startForeground() (5초 룰)
 *   → fullScreenIntent Notification으로 FakeCallActivity 실행
 *   → FakeCallActivity가 수락/거절/타임아웃 → stopService()
 */
class CallForegroundService : Service() {

    companion object {
        private const val TAG             = "CallForegroundService"
        const val CHANNEL_ID              = "ringo_call_channel"
        const val CHANNEL_NAME            = "RinGo 전화"
        const val NOTIFICATION_ID         = 1001
        const val ACTION_STOP             = "ACTION_STOP_CALL"

        const val EXTRA_CHANNEL_NAME      = "channel_name"
        const val EXTRA_MSG_TYPE          = "msg_type"
        const val EXTRA_MSG_VALUE         = "msg_value"
        const val EXTRA_ALARM_ID          = "alarm_id"
        const val EXTRA_CONTENT_URL       = "content_url"

        fun start(
            context: Context,
            channelName: String,
            msgType: String,
            msgValue: String,
            alarmId: Int,
            contentUrl: String
        ) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_ALARM_ID,     alarmId)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
            }
            // Android 8+ 에서 백그라운드에서 Foreground Service 시작
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CallForegroundService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: ${intent?.action}")

        // 서비스 중단 요청
        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "서비스 중단 요청")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val msgType     = intent?.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue    = intent?.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val alarmId     = intent?.getIntExtra(EXTRA_ALARM_ID, 0)     ?: 0
        val contentUrl  = intent?.getStringExtra(EXTRA_CONTENT_URL)  ?: ""

        Log.d(TAG, "알람 수신: $channelName / $msgType")

        // ★ 핵심: 5초 이내에 반드시 startForeground() 호출
        // FakeCallActivity를 fullScreenIntent로 띄우는 Notification
        val notification = buildCallNotification(channelName, msgType, alarmId, msgValue, contentUrl)
        startForeground(NOTIFICATION_ID, notification)

        // FakeCallActivity 시작
        FakeCallActivity.start(
            context     = applicationContext,
            channelName = channelName,
            msgType     = msgType,
            msgValue    = msgValue,
            alarmId     = alarmId,
            contentUrl  = contentUrl
        )

        // START_NOT_STICKY: 서비스가 kill되어도 자동 재시작 안 함
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "서비스 종료")
        super.onDestroy()
    }

    // ── 알림 채널 생성 ────────────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "RinGo 알람 전화 화면"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)       // 방해 금지 모드 무시
                enableVibration(false)   // FakeCallActivity에서 직접 처리
                setSound(null, null)     // FakeCallActivity에서 직접 처리
            }
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    // ── fullScreenIntent Notification 빌드 ───────────────────────────
    private fun buildCallNotification(
        channelName: String,
        msgType: String,
        alarmId: Int,
        msgValue: String,
        contentUrl: String
    ): Notification {
        // FakeCallActivity를 직접 여는 fullScreenIntent
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

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val fullScreenPi = PendingIntent.getActivity(
            applicationContext, alarmId, fullScreenIntent, piFlags
        )

        // 거절 PendingIntent (알림에서 직접 거절 가능)
        val declineIntent = Intent(applicationContext, CallForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val declinePi = PendingIntent.getService(
            applicationContext, alarmId + 1, declineIntent, piFlags
        )

        val msgTypeLabel = when (msgType) {
            "youtube" -> "📺 YouTube 알람"
            "audio"   -> "🎵 오디오 알람"
            "video"   -> "🎬 비디오 알람"
            else      -> "📎 파일 알람"
        }

        return NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle(channelName)
            .setContentText(msgTypeLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)                                        // 스와이프 제거 불가
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPi, true)                 // ★ 잠금화면 위 Activity 실행
            .setContentIntent(fullScreenPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "거절", declinePi)
            .build()
    }
}
