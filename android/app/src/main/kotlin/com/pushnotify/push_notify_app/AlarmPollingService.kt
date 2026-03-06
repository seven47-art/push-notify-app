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
 * AlarmPollingService  v1.0.33
 *
 * [수정 내역]
 *  1. 풀스크린 보장: CallForegroundService.start() → showAlarm() 순서로 변경
 *     (WakeLock 먼저 획득 후 알림 발행해야 잠금화면에서 풀스크린 동작)
 *  2. 벨소리: USAGE_ALARM 적용 + 채널 ID 매번 삭제/재생성 → 시스템 벨소리 갱신 반영
 *  3. 미구독자 알람: 이미 server-side에서 subscription 체크하지만 앱에서도 이중 확인
 *  4. 재실행 중복: poll() 직후 markFcmHandled() 로 handled 등록 (서버에 alarm_logs가 있어도 앱 측 중복 방지)
 *  5. IMPORTANCE_HIGH 유지 (MAX는 Android 8+ 무시됨, HIGH가 올바른 값)
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG             = "AlarmPollingService"
        const val FG_CHANNEL_ID   = "fg_service_channel"
        const val CALL_CHANNEL_ID = "ringo_alarm_v4"   // v1.0.33: 새 채널 ID → 기존 채널 설정 무시
        const val FG_NOTIF_ID     = 9001
        const val ACTION_START    = "ACTION_START"
        const val ACTION_STOP     = "ACTION_STOP"
        const val EXTRA_TOKEN     = "session_token"
        const val EXTRA_BASE_URL  = "base_url"

        private const val PREF_NAME        = "ringo_alarm_prefs"
        private const val PREF_KEY_HANDLED = "handled_alarm_ids"
        private val fcmLock = Any()

        fun markFcmHandled(context: Context, alarmId: Int) {
            synchronized(fcmLock) {
                val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
                val set = prefs.getStringSet(PREF_KEY_HANDLED, mutableSetOf())!!.toMutableSet()
                set.add(alarmId.toString())
                if (set.size > 100) {
                    val sorted = set.mapNotNull { it.toIntOrNull() }.sorted()
                    sorted.take(set.size - 100).forEach { set.remove(it.toString()) }
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
         * 알람 발행 (폴링 + FCM + AlarmReceiver 공용)
         *
         * ★ 핵심 순서:
         *   1. CallForegroundService.start() → WakeLock 획득 (화면 ON)
         *   2. 짧은 딜레이 후 nm.notify(fullScreenIntent) 발행
         *   → 화면이 켜진 상태에서 알림 발행해야 fullScreenIntent가 잠금화면 위에 표시됨
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
            val fullScreenPi = PendingIntent.getActivity(
                context, alarmId, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

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

            // [수정 2] 벨소리: TYPE_RINGTONE (핸드폰 설정의 벨소리)
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
            Log.d(TAG, "알람 알림 발행 (notifId=${alarmId + 10000}, channel=$CALL_CHANNEL_ID)")
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
        // [수정 2] 서비스 시작 시 채널 재생성 → 벨소리 설정 갱신
        recreateAlarmChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }

        sessionToken = intent?.getStringExtra(EXTRA_TOKEN)    ?: sessionToken
        baseUrl      = intent?.getStringExtra(EXTRA_BASE_URL) ?: baseUrl

        startForeground(FG_NOTIF_ID, buildFgNotif())

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

            for (i in 0 until results.length()) {
                val alarm   = results.getJSONObject(i)
                val alarmId = alarm.optInt("alarm_id", 0)
                if (alarmId <= 0) continue

                // [수정 4] 앱 측 중복 체크 (재실행 후 중복 방지)
                if (isFcmHandled(this@AlarmPollingService, alarmId)) {
                    Log.d(TAG, "alarm $alarmId → 이미 처리됨 (앱 캐시), 스킵")
                    continue
                }

                // [수정 4] 처리 전 즉시 handled 등록
                markFcmHandled(this@AlarmPollingService, alarmId)

                val channelName = alarm.optString("channel_name", "알람")
                val msgType     = alarm.optString("msg_type",     "youtube")
                val msgValue    = alarm.optString("msg_value",    "")
                val contentUrl  = alarm.optString("content_url",  "")
                val homepageUrl = alarm.optString("homepage_url", "")

                Log.d(TAG, "폴링 알람 수신: $channelName (id=$alarmId)")

                // [수정 1] WakeLock 먼저 → 알림 발행 순서 보장
                CallForegroundService.start(
                    this@AlarmPollingService,
                    channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
                )
                // WakeLock 획득 시간 확보 (300ms)
                delay(300L)
                showAlarm(
                    this@AlarmPollingService,
                    channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
                )
            }

        } catch (e: Exception) {
            Log.e(TAG, "폴링 오류: ${e.message}")
        }
    }

    private fun recreateAlarmChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // 포그라운드 서비스용 채널 (최소 중요도, 사운드 없음)
        if (nm.getNotificationChannel(FG_CHANNEL_ID) == null) {
            NotificationChannel(FG_CHANNEL_ID, "RinGo 서비스", NotificationManager.IMPORTANCE_MIN).apply {
                description = "백그라운드 알람 수신 서비스"
                setShowBadge(false)
                setSound(null, null)
                nm.createNotificationChannel(this)
            }
        }

        // [수정 2] 이전 채널 모두 삭제 (기존 벨소리 설정 제거)
        listOf("ringo_alarm_v2", "ringo_alarm_channel", "ringo_call_v2", "ringo_alarm_v3").forEach {
            try { nm.deleteNotificationChannel(it) } catch (_: Exception) {}
        }
        // v4 채널도 삭제 후 재생성 (앱 실행 시마다 시스템 벨소리 갱신)
        try { nm.deleteNotificationChannel(CALL_CHANNEL_ID) } catch (_: Exception) {}

        val ringUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        // [수정 2] USAGE_ALARM → DND 우회, 항상 소리 재생
        NotificationChannel(CALL_CHANNEL_ID, "RinGo 알람", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "알람 수신 시 전화 화면 표시"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 700, 300, 700)
            setSound(ringUri, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)           // ← ALARM으로 변경
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            )
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
            nm.createNotificationChannel(this)
        }
        Log.d(TAG, "알람 채널 재생성: $CALL_CHANNEL_ID, ringtone=$ringUri")
    }

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
