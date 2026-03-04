package com.pushnotify.push_notify_app

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * AlarmPollingService
 * - Foreground Service로 실행 → Android의 배터리/Doze 제한 우회
 * - 1분마다 서버 /api/alarms/trigger 폴링
 * - 알람 수신 시 fullScreenIntent 알림 → 앱이 꺼져있어도 가상통화 화면 표시
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG = "AlarmPollingService"
        const val FOREGROUND_CHANNEL_ID  = "alarm_service_channel"
        const val ALARM_CHANNEL_ID       = "alarm_channel"
        const val FOREGROUND_NOTIF_ID    = 9001
        const val ACTION_START           = "ACTION_START"
        const val ACTION_STOP            = "ACTION_STOP"
        const val EXTRA_TOKEN            = "session_token"
        const val EXTRA_BASE_URL         = "base_url"

        fun start(context: Context, token: String, baseUrl: String) {
            val intent = Intent(context, AlarmPollingService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_BASE_URL, baseUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AlarmPollingService::class.java))
        }
    }

    private var sessionToken = ""
    private var baseUrl      = ""
    private val scope        = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http         = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
        }
        sessionToken = intent?.getStringExtra(EXTRA_TOKEN) ?: sessionToken
        baseUrl      = intent?.getStringExtra(EXTRA_BASE_URL) ?: baseUrl

        // 포그라운드 알림 (서비스 유지용 - 사용자에게 보이지 않게 최소화)
        startForeground(FOREGROUND_NOTIF_ID, buildForegroundNotif())

        // 이미 폴링 중이면 새로 시작하지 않음
        if (scope.isActive) {
            startPolling()
        }
        return START_STICKY // 시스템이 죽여도 재시작
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        http.dispatcher.executorService.shutdown()
        super.onDestroy()
    }

    // ── 1분마다 폴링 ──────────────────────────────────────────────────
    private fun startPolling() {
        scope.launch {
            // 즉시 1회 실행
            poll()
            while (isActive) {
                delay(60_000L) // 1분
                poll()
            }
        }
    }

    private suspend fun poll() {
        if (sessionToken.isEmpty() || baseUrl.isEmpty()) return
        try {
            val body = "{}".toRequestBody("application/json".toMediaType())
            val req  = Request.Builder()
                .url("$baseUrl/api/alarms/trigger")
                .post(body)
                .addHeader("Authorization", "Bearer $sessionToken")
                .addHeader("Content-Type", "application/json")
                .build()

            val resp = http.newCall(req).execute()
            if (resp.isSuccessful) {
                val json     = JSONObject(resp.body?.string() ?: "{}")
                val triggered = json.optInt("triggered", 0)
                if (triggered > 0) {
                    val results = json.optJSONArray("results") ?: return
                    for (i in 0 until results.length()) {
                        val alarm       = results.getJSONObject(i)
                        val channelName = alarm.optString("channel_name", "알람")
                        val msgType     = alarm.optString("msg_type", "youtube")
                        val msgValue    = alarm.optString("msg_value", "")
                        val alarmId     = alarm.optInt("alarm_id", 0)
                        val contentUrl  = alarm.optString("content_url", "")
                        showAlarmNotification(channelName, msgType, msgValue, alarmId, contentUrl)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    // ── 알람 알림 (fullScreenIntent → 앱 강제 열기) ──────────────────
    private fun showAlarmNotification(
        channelName: String,
        msgType: String,
        msgValue: String,
        alarmId: Int,
        contentUrl: String
    ) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 앱의 MainActivity를 열면서 알람 데이터 전달
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("alarm_channel_name", channelName)
            putExtra("alarm_msg_type",     msgType)
            putExtra("alarm_msg_value",    msgValue)
            putExtra("alarm_id",           alarmId)
            putExtra("alarm_content_url",  contentUrl)
        }

        val pi = PendingIntent.getActivity(
            this, alarmId, launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 기기 기본 벨소리
        val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val vibPattern = longArrayOf(0, 700, 300, 700, 300, 700)

        val notif = NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("📞 $channelName")
            .setContentText("알람이 도착했습니다. 탭하여 확인하세요.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)        // 화면 켜기
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setSound(ringtoneUri)                // 기기 기본 벨소리
            .setVibrate(vibPattern)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        nm.notify(alarmId, notif)
    }

    // ── 알림 채널 생성 ──────────────────────────────────────────────
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 포그라운드 서비스용 (최소 중요도 - 상태바에 조용히 표시)
        val fgChannel = NotificationChannel(
            FOREGROUND_CHANNEL_ID,
            "PushNotify 백그라운드 서비스",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "앱 종료 시에도 알람을 받기 위한 백그라운드 서비스"
            setShowBadge(false)
        }

        // 알람 채널 (최고 중요도 + 기기 벨소리)
        val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val alarmChannel = NotificationChannel(
            ALARM_CHANNEL_ID,
            "PushNotify 알람",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "채널 알람 수신"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700, 300, 700)
            setSound(ringtoneUri, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        nm.createNotificationChannel(fgChannel)
        nm.createNotificationChannel(alarmChannel)
    }

    // ── 포그라운드 유지용 최소 알림 ─────────────────────────────────
    private fun buildForegroundNotif(): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 0, intent ?: Intent(),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, FOREGROUND_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("PushNotify")
            .setContentText("알람 수신 대기 중")
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
    }
}
