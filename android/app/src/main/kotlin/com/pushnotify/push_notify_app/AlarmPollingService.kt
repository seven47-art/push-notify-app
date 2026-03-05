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
 * AlarmPollingService — 폴링 방식 알람 수신
 *
 * ● Foreground Service로 1분마다 서버 폴링
 * ● 알람 수신 시 → CallForegroundService를 통해 FakeCallActivity 표시
 *   - FCM이 이미 처리한 알람은 중복 실행 방지 (recentFcmAlarmIds 체크)
 *   - Android 10+에서 백그라운드 앱은 Activity를 직접 시작할 수 없음
 *   - fullScreenIntent(category=CALL, importance=HIGH)를 사용하면
 *     잠금화면·화면꺼짐 상태에서도 FakeCallActivity가 전체화면으로 뜸
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG                   = "AlarmPollingService"
        const val FG_CHANNEL_ID         = "fg_service_channel"   // 포그라운드 서비스용 (최소)
        const val CALL_CHANNEL_ID       = "fake_call_channel"    // 가상전화용 (최고 중요도)
        const val FG_NOTIF_ID           = 9001
        const val ACTION_START          = "ACTION_START"
        const val ACTION_STOP           = "ACTION_STOP"
        const val EXTRA_TOKEN           = "session_token"
        const val EXTRA_BASE_URL        = "base_url"

        // FCM이 처리한 알람 ID 목록 (중복 방지용) — RinGoFCMService에서 등록
        private val recentFcmAlarmIds = mutableSetOf<Int>()
        private val fcmAlarmLock = Any()

        fun markFcmHandled(alarmId: Int) {
            synchronized(fcmAlarmLock) {
                recentFcmAlarmIds.add(alarmId)
                // 오래된 항목 정리 (최대 20개 유지)
                if (recentFcmAlarmIds.size > 20) {
                    recentFcmAlarmIds.remove(recentFcmAlarmIds.first())
                }
            }
        }

        fun isFcmHandled(alarmId: Int): Boolean {
            return synchronized(fcmAlarmLock) { recentFcmAlarmIds.contains(alarmId) }
        }

        fun start(context: Context, token: String, baseUrl: String) {
            val i = Intent(context, AlarmPollingService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_BASE_URL, baseUrl)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
            else context.startService(i)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AlarmPollingService::class.java))
        }
    }

    private var sessionToken = ""
    private var baseUrl      = ""
    private var pollingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http  = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }

        sessionToken = intent?.getStringExtra(EXTRA_TOKEN)    ?: sessionToken
        baseUrl      = intent?.getStringExtra(EXTRA_BASE_URL) ?: baseUrl

        // 포그라운드 유지 (최소 알림 - 상태바에 조용히)
        startForeground(FG_NOTIF_ID, buildFgNotif())

        // 폴링 시작 (중복 방지)
        pollingJob?.cancel()
        pollingJob = scope.launch { runPolling() }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        http.dispatcher.executorService.shutdown()
        super.onDestroy()
    }

    // ── 폴링 루프 ─────────────────────────────────────────────────────
    private suspend fun runPolling() {
        delay(5_000L)          // 서비스 시작 후 5초 대기
        poll()
        while (scope.isActive) {
            delay(60_000L)     // 1분마다
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
            if (!resp.isSuccessful) return

            val json      = JSONObject(resp.body?.string() ?: "{}")
            val triggered = json.optInt("triggered", 0)
            if (triggered <= 0) return

            val results = json.optJSONArray("results") ?: return
            if (results.length() == 0) return

            // 첫 번째 알람만 처리
            val alarm       = results.getJSONObject(0)
            val alarmId     = alarm.optInt("alarm_id", 0)

            // ★ FCM이 이미 처리한 알람이면 스킵 (중복 방지)
            if (isFcmHandled(alarmId)) {
                Log.d(TAG, "알람 $alarmId 는 FCM이 이미 처리함 → 폴링 스킵")
                return
            }

            val channelName = alarm.optString("channel_name", "알람")
            val msgType     = alarm.optString("msg_type", "youtube")
            val msgValue    = alarm.optString("msg_value", "")
            val contentUrl  = alarm.optString("content_url", "")

            Log.d(TAG, "폴링 알람 수신 → CallForegroundService: $channelName (id=$alarmId)")

            // CallForegroundService를 통해 처리 (FCM 경로와 동일하게)
            withContext(Dispatchers.Main) {
                CallForegroundService.start(
                    this@AlarmPollingService,
                    channelName, msgType, msgValue, alarmId, contentUrl
                )
            }

        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    // ── 알림 채널 생성 ────────────────────────────────────────────────
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 1) 포그라운드 서비스 채널 (최소 중요도 - 거의 안 보임)
        NotificationChannel(FG_CHANNEL_ID, "RinGo 서비스", NotificationManager.IMPORTANCE_MIN).apply {
            description = "백그라운드 알람 수신 서비스"
            setShowBadge(false)
            nm.createNotificationChannel(this)
        }

        // 2) 가상전화 채널 (최고 중요도 + 기기 벨소리)
        val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        NotificationChannel(CALL_CHANNEL_ID, "RinGo 알람 전화", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "알람 수신 시 전화 화면 표시"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700)
            setSound(ringtoneUri, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            nm.createNotificationChannel(this)
        }
    }

    // ── 포그라운드 유지용 최소 알림 ──────────────────────────────────
    private fun buildFgNotif(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName) ?: Intent(),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, FG_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("RinGo")
            .setContentText("알람 수신 대기 중")
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
    }
}
