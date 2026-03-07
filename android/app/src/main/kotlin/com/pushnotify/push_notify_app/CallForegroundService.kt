package com.pushnotify.push_notify_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * CallForegroundService v1.0.40
 * - WakeLock으로 화면/CPU 강제 켜기
 * - startForeground() 유지 (필수)
 * - 포그라운드 알림은 IMPORTANCE_MIN / PRIORITY_MIN → 헤즈업 완전 차단
 *   (FakeCallActivity가 풀스크린으로 표시되므로 알림 자체는 숨김)
 */
class CallForegroundService : Service() {

    companion object {
        private const val TAG          = "CallForegroundService"
        const val CHANNEL_ID           = "ringo_call_fg_channel"
        private const val CHANNEL_NAME = "RinGo 서비스"
        const val NOTIFICATION_ID      = 1001
        const val ACTION_STOP          = "ACTION_STOP_CALL"

        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"

        fun start(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = ""
        ) {
            val intent = Intent(context, CallForegroundService::class.java).apply {
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_ALARM_ID,     alarmId)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_HOMEPAGE_URL, homepageUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(intent)
            else
                context.startService(intent)
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
        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "ACTION_STOP → 서비스 종료")
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val channelName = intent?.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val alarmId     = intent?.getIntExtra(EXTRA_ALARM_ID, 0)    ?: 0
        Log.d(TAG, "서비스 시작: $channelName (alarmId=$alarmId)")

        acquireWakeLock()

        // startForeground 필수 — IMPORTANCE_MIN 채널이므로 헤즈업 없음
        startForeground(NOTIFICATION_ID, buildSilentNotif())

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        Log.d(TAG, "서비스 종료")
        super.onDestroy()
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock?.release()
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK        or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "ringo:alarm_wakelock"
            ).also {
                it.acquire(30_000L)
                Log.d(TAG, "WakeLock 획득")
            }
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock 획득 실패: ${e.message}")
        }
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                // IMPORTANCE_MIN = 알림바에 아이콘만, 헤즈업 없음, 소리/진동 없음
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description          = "RinGo 백그라운드 서비스"
                lockscreenVisibility = Notification.VISIBILITY_SECRET
                setBypassDnd(false)
                enableVibration(false)
                setSound(null, null)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun buildSilentNotif(): Notification {
        return NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle("RinGo")
            .setContentText("실행 중")
            .setPriority(NotificationCompat.PRIORITY_MIN)   // 헤즈업 완전 차단
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setOngoing(true)
            .setAutoCancel(false)
            .setShowWhen(false)
            .setSilent(true)
            .build()
    }
}
