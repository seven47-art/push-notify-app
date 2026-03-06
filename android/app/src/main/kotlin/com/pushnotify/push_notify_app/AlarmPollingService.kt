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
 * AlarmPollingService  v1.0.36
 *
 * [수정 내역 v1.0.36]
 *  1. 채널 ID ringo_alarm_v5 로 변경 (이전 v4 채널 설정 무시 문제 해결)
 *     - 앱 설치 후 채널은 한번만 생성됨 → ID 변경 시 새 설정 적용
 *     - STREAM_RING + USAGE_NOTIFICATION_RINGTONE → 핸드폰 벨소리 설정 그대로
 *  2. 헤즈업 수락/거절 버튼 수정
 *     - setOngoing(true) → 알림 서랍에 고정 (30초 유지)
 *     - CATEGORY_CALL → 헤즈업 최우선 표시
 *     - BigTextStyle → 확장 시 버튼 노출
 *  3. 이전 알람 중복 표시 방지
 *     - 새 알람 발행 전 기존 알림 모두 제거
 */
class AlarmPollingService : Service() {

    companion object {
        const val TAG             = "AlarmPollingService"
        const val FG_CHANNEL_ID   = "fg_service_channel"
        const val CALL_CHANNEL_ID = "ringo_alarm_v5"   // v1.0.36: 채널 ID 변경 → 새 설정 강제 적용
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
         * [v1.0.36 수정]
         *  - 채널 ID v5 사용 (새 벨소리 설정 강제 적용)
         *  - 기존 알림 먼저 제거 후 새 알림 발행
         *  - CATEGORY_CALL + BigTextStyle = 헤즈업에 버튼 표시
         */
        fun showAlarm(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = ""
        ) {
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager

            // [v1.0.36] 이전 알람 알림 모두 제거 후 새 알람 표시
            try {
                nm.cancel(alarmId + 10000)
            } catch (_: Exception) {}

            val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            else PendingIntent.FLAG_UPDATE_CURRENT

            // 전체화면 Intent (잠금화면용)
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

            // [거절] 버튼 → AlarmActionReceiver → 알림 취소 + 서비스 중지
            val declineIntent = Intent(context, AlarmActionReceiver::class.java).apply {
                action = AlarmActionReceiver.ACTION_DECLINE
                putExtra(AlarmActionReceiver.EXTRA_ALARM_ID, alarmId)
            }
            val declinePi = PendingIntent.getBroadcast(context, alarmId + 1, declineIntent, piFlags)

            // [수락] 버튼 → FakeCallActivity 열기 (auto_accept=true)
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

            val msgLabel = when (msgType) {
                "youtube" -> "📺 YouTube 알람"
                "audio"   -> "🎵 오디오 알람"
                "video"   -> "🎬 비디오 알람"
                else      -> "📎 알람"
            }

            // BigTextStyle → 헤즈업 확장 시 수락/거절 버튼 항상 노출
            val bigStyle = NotificationCompat.BigTextStyle()
                .bigText("$msgLabel\n수락 또는 거절을 선택하세요")
                .setBigContentTitle("📞 $channelName")

            val notif = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle("📞 $channelName")
                .setContentText(msgLabel)
                .setStyle(bigStyle)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPi, true)
                .setContentIntent(fullScreenPi)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setTimeoutAfter(30_000L)
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "거절",
                    declinePi
                )
                .addAction(
                    android.R.drawable.ic_media_play,
                    "수락",
                    acceptPi
                )
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

                if (isFcmHandled(this@AlarmPollingService, alarmId)) {
                    Log.d(TAG, "alarm $alarmId → 이미 처리됨 (앱 캐시), 스킵")
                    continue
                }

                markFcmHandled(this@AlarmPollingService, alarmId)

                val channelName = alarm.optString("channel_name", "알람")
                val msgType     = alarm.optString("msg_type",     "youtube")
                val msgValue    = alarm.optString("msg_value",    "")
                val contentUrl  = alarm.optString("content_url",  "")
                val homepageUrl = alarm.optString("homepage_url", "")

                Log.d(TAG, "폴링 알람 수신: $channelName (id=$alarmId)")

                // WakeLock 먼저 → 알림 발행 순서 보장
                CallForegroundService.start(
                    this@AlarmPollingService,
                    channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
                )
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

        // FG 채널 생성 (없을 때만)
        if (nm.getNotificationChannel(FG_CHANNEL_ID) == null) {
            NotificationChannel(FG_CHANNEL_ID, "RinGo 서비스", NotificationManager.IMPORTANCE_MIN).apply {
                description = "백그라운드 알람 수신 서비스"
                setShowBadge(false)
                setSound(null, null)
                nm.createNotificationChannel(this)
            }
        }

        // 이전 채널 정리
        listOf("ringo_alarm_v2", "ringo_alarm_channel", "ringo_call_v2", "ringo_alarm_v3", "ringo_alarm_v4").forEach {
            try { nm.deleteNotificationChannel(it) } catch (_: Exception) {}
        }

        // [v1.0.36] 새 알람 채널 생성 (ringo_alarm_v5)
        // 채널 설정은 최초 생성 시에만 적용됨 → 매번 ID 바꿔야 새 설정 반영
        if (nm.getNotificationChannel(CALL_CHANNEL_ID) == null) {
            val ringUri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
                this, RingtoneManager.TYPE_RINGTONE
            ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            NotificationChannel(CALL_CHANNEL_ID, "RinGo 알람", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "알람 수신 시 전화 화면 표시"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 700, 300, 700)
                // [v1.0.36] STREAM_RING + USAGE_NOTIFICATION_RINGTONE → 핸드폰 벨소리 그대로
                setSound(ringUri, AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setLegacyStreamType(android.media.AudioManager.STREAM_RING)
                    .build()
                )
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(false)  // [v1.0.36] 핸드폰 DND 설정 따름
                nm.createNotificationChannel(this)
            }
            Log.d(TAG, "알람 채널 생성: $CALL_CHANNEL_ID, ringtone=$ringUri")
        }
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
