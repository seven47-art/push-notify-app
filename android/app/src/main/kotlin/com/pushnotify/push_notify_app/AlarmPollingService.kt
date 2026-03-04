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
 * AlarmPollingService — 세이투두 방식
 *
 * ● Foreground Service로 1분마다 서버 폴링
 * ● 알람 수신 시 → fullScreenIntent로 FakeCallActivity 강제 표시
 *   - Android 10+에서 백그라운드 앱은 Activity를 직접 시작할 수 없음
 *   - fullScreenIntent(category=CALL, importance=HIGH)를 사용하면
 *     잠금화면·화면꺼짐 상태에서도 FakeCallActivity가 전체화면으로 뜸
 *   - 알림 드로어에 남는 알림은 FakeCallActivity가 뜨자마자 자동 취소
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
            val channelName = alarm.optString("channel_name", "알람")
            val msgType     = alarm.optString("msg_type", "youtube")
            val msgValue    = alarm.optString("msg_value", "")
            val alarmId     = alarm.optInt("alarm_id", 0)
            val contentUrl  = alarm.optString("content_url", "")

            Log.d(TAG, "알람 수신 → FakeCallActivity: $channelName")
            showFakeCallViaFullScreenIntent(channelName, msgType, msgValue, alarmId, contentUrl)

        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    // ── fullScreenIntent로 FakeCallActivity 표시 ──────────────────────
    // Android 10+ 백그라운드 Activity 시작 제한을 우회하는 공식 방법
    private fun showFakeCallViaFullScreenIntent(
        channelName: String, msgType: String, msgValue: String,
        alarmId: Int, contentUrl: String
    ) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // FakeCallActivity를 여는 Intent
        val fakeCallIntent = Intent(this, FakeCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(FakeCallActivity.EXTRA_CHANNEL_NAME, channelName)
            putExtra(FakeCallActivity.EXTRA_MSG_TYPE,     msgType)
            putExtra(FakeCallActivity.EXTRA_MSG_VALUE,    msgValue)
            putExtra(FakeCallActivity.EXTRA_ALARM_ID,     alarmId)
            putExtra(FakeCallActivity.EXTRA_CONTENT_URL,  contentUrl)
        }

        val fullScreenPi = PendingIntent.getActivity(
            this, alarmId, fakeCallIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 기기 기본 벨소리
        val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val notif = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("📞 $channelName")
            .setContentText("알람이 도착했습니다")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)   // ★ 통화 카테고리
            .setFullScreenIntent(fullScreenPi, true)          // ★ 잠금화면에서 강제 표시
            .setContentIntent(fullScreenPi)
            .setAutoCancel(true)
            .setSound(ringtoneUri)
            .setVibrate(longArrayOf(0, 700, 300, 700))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setTimeoutAfter(35_000L)                         // 35초 후 자동 제거
            .build()

        nm.notify(alarmId + 10000, notif)
    }

    // ── 알림 채널 생성 ────────────────────────────────────────────────
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 1) 포그라운드 서비스 채널 (최소 중요도 - 거의 안 보임)
        NotificationChannel(FG_CHANNEL_ID, "PushNotify 서비스", NotificationManager.IMPORTANCE_MIN).apply {
            description = "백그라운드 알람 수신 서비스"
            setShowBadge(false)
            nm.createNotificationChannel(this)
        }

        // 2) 가상전화 채널 (최고 중요도 + 기기 벨소리)
        val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        NotificationChannel(CALL_CHANNEL_ID, "PushNotify 알람 전화", NotificationManager.IMPORTANCE_HIGH).apply {
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
            .setContentTitle("PushNotify")
            .setContentText("알람 수신 대기 중")
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
    }
}
