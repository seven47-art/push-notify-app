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
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * CallForegroundService
 *
 * 핵심 원칙:
 *   ① startForeground() 로 Foreground Service 유지
 *   ② FakeCallActivity는 fullScreenIntent 로만 실행 (startActivity 직접 호출 X)
 *   ③ WAKE_LOCK 으로 화면을 먼저 켠 뒤 fullScreenIntent 발동
 *
 * Android 10+ 에서 백그라운드 앱은 startActivity() 직접 호출 불가.
 * Foreground Service 안에서도 앱 프로세스가 없으면 startActivity() 차단됨.
 * → fullScreenIntent 만 사용해야 잠금화면/종료 상태에서 Activity 표시 가능.
 */
class CallForegroundService : Service() {

    companion object {
        private const val TAG        = "CallForegroundService"
        const val CHANNEL_ID         = "ringo_call_channel"
        const val CHANNEL_NAME       = "RinGo 알람"
        const val NOTIFICATION_ID    = 1001
        const val ACTION_STOP        = "ACTION_STOP_CALL"
        const val ACTION_ACCEPT      = "ACTION_ACCEPT_CALL"

        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"  // ★ 홈페이지 URL

        fun start(
            context: Context,
            channelName: String,
            msgType: String,
            msgValue: String,
            alarmId: Int,
            contentUrl: String,
            homepageUrl: String = ""
        ) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_ALARM_ID,     alarmId)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_HOMEPAGE_URL, homepageUrl)
            }
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

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: ${intent?.action}")

        if (intent?.action == ACTION_STOP) {
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val msgType     = intent?.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue    = intent?.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val alarmId     = intent?.getIntExtra(EXTRA_ALARM_ID, 0)     ?: 0
        val contentUrl  = intent?.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        val homepageUrl = intent?.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""

        Log.d(TAG, "알람 처리 시작: $channelName / $msgType")

        // ① WAKE_LOCK 먼저 획득 → 화면이 꺼져 있어도 CPU/화면 깨움
        acquireWakeLock()

        // ② startForeground() 반드시 5초 이내 호출
        //    fullScreenIntent 포함 → OS가 잠금화면 위에 FakeCallActivity 표시
        val notification = buildCallNotification(channelName, msgType, alarmId, msgValue, contentUrl, homepageUrl)
        startForeground(NOTIFICATION_ID, notification)

        // ③ FakeCallActivity.start() 직접 호출 금지!
        //    fullScreenIntent 가 OS에 의해 자동으로 Activity 를 실행함
        //    (앱 종료/잠금화면/백그라운드 모두 동작)
        Log.d(TAG, "fullScreenIntent 발동 완료 → OS가 FakeCallActivity 실행")

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        Log.d(TAG, "서비스 종료")
        super.onDestroy()
    }

    // ── WAKE_LOCK: 화면/CPU 강제 깨움 ───────────────────────────────
    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock?.release()
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "ringo:alarm_wakelock"
            ).also {
                it.acquire(30_000L) // 최대 30초 (알람 타임아웃과 동일)
                Log.d(TAG, "WAKE_LOCK 획득")
            }
        } catch (e: Exception) {
            Log.e(TAG, "WAKE_LOCK 획득 실패: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "WAKE_LOCK 해제")
            }
        } catch (e: Exception) {
            Log.e(TAG, "WAKE_LOCK 해제 실패: ${e.message}")
        }
        wakeLock = null
    }

    // ── 알림 채널 생성 ────────────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description         = "RinGo 알람"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
                enableVibration(false)
                setSound(null, null)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    // ── Notification 빌드 (fullScreenIntent 포함) ────────────────────
    private fun buildCallNotification(
        channelName: String,
        msgType: String,
        alarmId: Int,
        msgValue: String,
        contentUrl: String,
        homepageUrl: String = ""
    ): Notification {

        val fullScreenIntent = Intent(applicationContext, FakeCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(FakeCallActivity.EXTRA_CHANNEL_NAME, channelName)
            putExtra(FakeCallActivity.EXTRA_MSG_TYPE,     msgType)
            putExtra(FakeCallActivity.EXTRA_MSG_VALUE,    msgValue)
            putExtra(FakeCallActivity.EXTRA_ALARM_ID,     alarmId)
            putExtra(FakeCallActivity.EXTRA_CONTENT_URL,  contentUrl)
            putExtra(FakeCallActivity.EXTRA_HOMEPAGE_URL, homepageUrl)
        }

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val fullScreenPi = PendingIntent.getActivity(
            applicationContext, alarmId, fullScreenIntent, piFlags
        )

        val declineIntent = Intent(applicationContext, CallForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val declinePi = PendingIntent.getService(
            applicationContext, alarmId + 1, declineIntent, piFlags
        )

        // 수락 버튼 → FakeCallActivity를 직접 시작 (헤즈업 상태에서도 동작)
        val acceptIntent = Intent(applicationContext, FakeCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(FakeCallActivity.EXTRA_CHANNEL_NAME, channelName)
            putExtra(FakeCallActivity.EXTRA_MSG_TYPE,     msgType)
            putExtra(FakeCallActivity.EXTRA_MSG_VALUE,    msgValue)
            putExtra(FakeCallActivity.EXTRA_ALARM_ID,     alarmId)
            putExtra(FakeCallActivity.EXTRA_CONTENT_URL,  contentUrl)
            putExtra(FakeCallActivity.EXTRA_HOMEPAGE_URL, homepageUrl)
            putExtra(FakeCallActivity.EXTRA_AUTO_ACCEPT,  true)   // 자동 수락 플래그
        }
        val acceptPi = PendingIntent.getActivity(
            applicationContext, alarmId + 2, acceptIntent, piFlags
        )

        val msgTypeLabel = when (msgType) {
            "youtube" -> "📺 YouTube 알람"
            "audio"   -> "🎵 오디오 알람"
            "video"   -> "🎬 비디오 알람"
            else      -> "📎 알람"
        }

        return NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("📞 $channelName")
            .setContentText(msgTypeLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPi, true)   // ← OS가 이걸로 FakeCallActivity 실행
            .setContentIntent(fullScreenPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "거절", declinePi)
            .addAction(android.R.drawable.ic_media_play, "수락", acceptPi)
            .build()
    }
}
