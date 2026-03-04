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
 * - 알람 수신 시 FakeCallActivity를 직접 startActivity → 세이투두 방식
 *   (알림(Notification) 표시 없음, 잠금화면 위에 바로 전체화면 전화 수신 화면 표시)
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG                   = "AlarmPollingService"
        const val FOREGROUND_CHANNEL_ID = "alarm_service_channel"
        const val FOREGROUND_NOTIF_ID   = 9001
        const val ACTION_START          = "ACTION_START"
        const val ACTION_STOP           = "ACTION_STOP"
        const val EXTRA_TOKEN           = "session_token"
        const val EXTRA_BASE_URL        = "base_url"

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
    private var pollingJob: Job? = null
    private val scope        = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http         = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        createForegroundChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
        }
        sessionToken = intent?.getStringExtra(EXTRA_TOKEN)   ?: sessionToken
        baseUrl      = intent?.getStringExtra(EXTRA_BASE_URL) ?: baseUrl

        // 포그라운드 알림 (서비스 유지용 - 사용자에게 최소 표시)
        startForeground(FOREGROUND_NOTIF_ID, buildForegroundNotif())

        // 이전 폴링 취소 후 새로 시작 (중복 방지)
        pollingJob?.cancel()
        pollingJob = scope.launch { startPolling() }

        return START_STICKY // 시스템이 죽여도 재시작
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        http.dispatcher.executorService.shutdown()
        super.onDestroy()
    }

    // ── 1분마다 폴링 ──────────────────────────────────────────────────
    private suspend fun startPolling() {
        delay(5_000L)
        poll()
        while (scope.isActive) {
            delay(60_000L)
            poll()
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
                val json      = JSONObject(resp.body?.string() ?: "{}")
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

                        // ★ 핵심: 알림 표시 없이 FakeCallActivity 직접 실행 (세이투두 방식)
                        Log.d(TAG, "알람 수신 → FakeCallActivity 직접 시작: $channelName")
                        FakeCallActivity.start(
                            context     = applicationContext,
                            channelName = channelName,
                            msgType     = msgType,
                            msgValue    = msgValue,
                            alarmId     = alarmId,
                            contentUrl  = contentUrl
                        )
                        // 여러 알람이 있어도 첫 번째만 표시 (중복 방지)
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    // ── 포그라운드 채널 생성 ─────────────────────────────────────────
    private fun createForegroundChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val ch = NotificationChannel(
            FOREGROUND_CHANNEL_ID,
            "PushNotify 백그라운드 서비스",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "앱 종료 시에도 알람을 받기 위한 백그라운드 서비스"
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
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
