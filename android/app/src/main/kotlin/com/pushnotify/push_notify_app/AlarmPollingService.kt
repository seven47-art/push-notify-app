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
 *
 * 역할: 앱이 백그라운드/종료 상태일 때 1분마다 서버를 폴링해 알람을 수신한다.
 *       알람 수신 시 nm.notify()로 fullScreenIntent 알림을 직접 발행한다.
 *
 * 흐름:
 *   1. AlarmPollingService (Foreground Service, IMPORTANCE_MIN) → 서버 폴링 1분 주기
 *   2. 알람 확인 → showAlarm() → nm.notify(fullScreenIntent) → FakeCallActivity 전체화면
 *   3. CallForegroundService.start() → WakeLock 획득 (화면 켜기 보조)
 *   4. FCM이 이미 처리한 alarm_id는 중복 실행 방지
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG             = "AlarmPollingService"
        const val FG_CHANNEL_ID   = "fg_service_channel"   // 포그라운드 서비스용 (최소)
        const val CALL_CHANNEL_ID = "ringo_alarm_v2"       // 알람 알림용 (최고 중요도 — v1.0.28 재생성)
        const val FG_NOTIF_ID     = 9001
        const val ACTION_START    = "ACTION_START"
        const val ACTION_STOP     = "ACTION_STOP"
        const val EXTRA_TOKEN     = "session_token"
        const val EXTRA_BASE_URL  = "base_url"

        // 처리된 alarm_id 목록 — SharedPreferences에 영구 저장 (앱 재시작 후에도 중복 방지)
        private const val PREF_NAME        = "ringo_alarm_prefs"
        private const val PREF_KEY_HANDLED = "handled_alarm_ids"
        private val fcmLock = Any()

        fun markFcmHandled(context: Context, alarmId: Int) {
            synchronized(fcmLock) {
                val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                val set = prefs.getStringSet(PREF_KEY_HANDLED, mutableSetOf())!!.toMutableSet()
                set.add(alarmId.toString())
                // 최대 50개만 유지 (오래된 것 제거)
                if (set.size > 50) {
                    val sorted = set.map { it.toIntOrNull() ?: 0 }.sorted()
                    sorted.take(set.size - 50).forEach { set.remove(it.toString()) }
                }
                prefs.edit().putStringSet(PREF_KEY_HANDLED, set).apply()
            }
        }

        fun isFcmHandled(context: Context, alarmId: Int): Boolean {
            return synchronized(fcmLock) {
                val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                val set = prefs.getStringSet(PREF_KEY_HANDLED, emptySet()) ?: emptySet()
                set.contains(alarmId.toString())
            }
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

        /**
         * 알람 알림 발행 (폴링 + FCM 공용)
         * nm.notify()로 fullScreenIntent 알림을 직접 발행한다.
         * CallForegroundService.start()는 호출부에서 별도 처리.
         */
        fun showAlarm(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = ""
        ) {
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager

            val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            else PendingIntent.FLAG_UPDATE_CURRENT

            val fullScreenIntent = Intent(context, FakeCallActivity::class.java).apply {
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
            val fullScreenPi = PendingIntent.getActivity(context, alarmId, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            val declinePi = PendingIntent.getService(
                context, alarmId + 1,
                Intent(context, CallForegroundService::class.java).apply { action = CallForegroundService.ACTION_STOP },
                piFlags
            )

            val acceptIntent = Intent(context, FakeCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(FakeCallActivity.EXTRA_CHANNEL_NAME, channelName)
                putExtra(FakeCallActivity.EXTRA_MSG_TYPE,     msgType)
                putExtra(FakeCallActivity.EXTRA_MSG_VALUE,    msgValue)
                putExtra(FakeCallActivity.EXTRA_ALARM_ID,     alarmId)
                putExtra(FakeCallActivity.EXTRA_CONTENT_URL,  contentUrl)
                putExtra(FakeCallActivity.EXTRA_HOMEPAGE_URL, homepageUrl)
                putExtra(FakeCallActivity.EXTRA_AUTO_ACCEPT,  true)
            }
            val acceptPi = PendingIntent.getActivity(context, alarmId + 2, acceptIntent, piFlags)

            // TYPE_RINGTONE: 핸드폰 벨소리 설정과 동일한 소리 사용
            // (전화 수신처럼 동작 — 설정 > 소리 > 벨소리 와 동일)
            val ringtoneUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
                context, RingtoneManager.TYPE_RINGTONE
            ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            val msgLabel = when (msgType) {
                "youtube" -> "📺 YouTube 알람"
                "audio"   -> "🎵 오디오 알람"
                "video"   -> "🎬 비디오 알람"
                else      -> "📎 알람"
            }

            val notif = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle("📞 $channelName")
                .setContentText(msgLabel)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPi, true)
                .setContentIntent(fullScreenPi)
                .setOngoing(true)
                .setAutoCancel(false)
                .setSound(ringtoneUri, android.media.AudioManager.STREAM_RING)
                .setVibrate(longArrayOf(0, 700, 300, 700))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setTimeoutAfter(35_000L)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "거절", declinePi)
                .addAction(android.R.drawable.ic_media_play, "수락", acceptPi)
                .build()

            nm.notify(alarmId + 10000, notif)
            Log.d(TAG, "알람 알림 발행 (notifId=${alarmId + 10000})")
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

        startForeground(FG_NOTIF_ID, buildFgNotif())

        // 중복 방지: 이미 폴링 중이면 재시작만
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

    // ── 폴링 루프 (5초 후 첫 poll, 이후 1분 간격) ──────────────────
    private suspend fun runPolling() {
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
            val req = Request.Builder()
                .url("$baseUrl/api/alarms/trigger")
                .post("{}".toRequestBody("application/json".toMediaType()))
                .addHeader("Authorization", "Bearer $sessionToken")
                .addHeader("Content-Type", "application/json")
                .build()

            val resp = http.newCall(req).execute()
            if (!resp.isSuccessful) return

            val json = JSONObject(resp.body?.string() ?: "{}")
            if (json.optInt("triggered", 0) <= 0) return

            val results = json.optJSONArray("results") ?: return
            if (results.length() == 0) return

            val alarm   = results.getJSONObject(0)
            val alarmId = alarm.optInt("alarm_id", 0)

            // FCM이 이미 처리한 알람이면 스킵
            if (isFcmHandled(this@AlarmPollingService, alarmId)) {
                Log.d(TAG, "alarm $alarmId → FCM 처리됨, 폴링 스킵")
                return
            }

            val channelName = alarm.optString("channel_name", "알람")
            val msgType     = alarm.optString("msg_type",     "youtube")
            val msgValue    = alarm.optString("msg_value",    "")
            val contentUrl  = alarm.optString("content_url",  "")
            val homepageUrl = alarm.optString("homepage_url", "")

            Log.d(TAG, "알람 수신: $channelName (id=$alarmId)")
            // companion.showAlarm()으로 알림 발행 (FCM 경로와 동일한 코드 공유)
            showAlarm(this@AlarmPollingService, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)
            // WakeLock 획득 (화면 켜기 보조)
            CallForegroundService.start(this@AlarmPollingService, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)

        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    // ── 알림 채널 ─────────────────────────────────────────────────────
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 포그라운드 서비스 유지용 (최소 중요도)
        NotificationChannel(FG_CHANNEL_ID, "RinGo 서비스", NotificationManager.IMPORTANCE_MIN).apply {
            description = "백그라운드 알람 수신 서비스"
            setShowBadge(false)
            nm.createNotificationChannel(this)
        }

        // 알람 알림용 (최고 중요도 + 벨소리 + 진동)
        // TYPE_RINGTONE: 핸드폰 벨소리 설정과 동일 (설정 > 소리 > 벨소리)
        val ringUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        // ★ IMPORTANCE_HIGH + bypassDnd=true → fullScreenIntent 잠금화면에서 동작 보장
        NotificationChannel(CALL_CHANNEL_ID, "RinGo 알람 전화", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "알람 수신 시 전화 화면 표시"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700)
            setSound(ringUri, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)   // 방해 금지 모드에서도 알람 수신
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
