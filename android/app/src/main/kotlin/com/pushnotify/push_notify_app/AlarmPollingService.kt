package com.pushnotify.push_notify_app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class AlarmPollingService : Service() {

    companion object {
        const val TAG             = "AlarmPollingService"
        const val FG_CHANNEL_ID   = "fg_service_channel"
        const val FG_NOTIF_ID     = 9001
        const val ACTION_START    = "ACTION_START"
        const val ACTION_STOP     = "ACTION_STOP"
        const val EXTRA_TOKEN     = "session_token"
        const val EXTRA_BASE_URL  = "base_url"

        // 상태바 알림 채널
        const val NOTIF_CHANNEL_ID   = "ringo_secondary_alarm_channel"
        const val NOTIF_CHANNEL_NAME = "RinGo 동시 알람"

        private const val PREF_NAME        = "ringo_alarm_prefs"
        private const val PREF_KEY_HANDLED = "handled_alarm_ids"
        private val fcmLock = Any()

        // ── 풀스크린 알람 표시 중 여부 플래그 ──────────────────────────
        // FCM 수신 순서 기준: 첫 번째 알람은 풀스크린, 이후는 상태바
        private val isFakeCallShowing = AtomicBoolean(false)

        fun setFakeCallShowing(showing: Boolean) {
            isFakeCallShowing.set(showing)
            Log.d(TAG, "isFakeCallShowing = $showing")
        }

        fun isFakeCallActive(): Boolean = isFakeCallShowing.get()

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
                prefs.getStringSet(PREF_KEY_HANDLED, emptySet())?.contains(alarmId.toString()) ?: false
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

        // v1.0.42: triggerAlarm 자체에서 원자적 중복 방지
        // FCM / AlarmManager / Polling / AlarmScheduler 어느 경로로 오더라도
        // alarmId 기준으로 단 한 번만 실행되도록 synchronized 블록 안에서 check-then-act
        fun triggerAlarm(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = "",
            channelPublicId: String = "", linkUrl: String = ""
        ) {
            if (alarmId > 0) {
                synchronized(fcmLock) {
                    if (isFcmHandled(context, alarmId)) {
                        Log.d(TAG, "triggerAlarm: alarm $alarmId already triggered – skip")
                        return
                    }
                    markFcmHandled(context, alarmId)
                }
            }
            Log.d(TAG, "triggerAlarm: $channelName (id=$alarmId)")

            // ── 풀스크린 vs 상태바 분기 ────────────────────────────────
            // FCM 수신 순서 기준: 첫 번째 알람 → 풀스크린, 이후 → 상태바
            if (isFakeCallShowing.compareAndSet(false, true)) {
                // 첫 번째 알람 → 풀스크린 FakeCallActivity
                Log.d(TAG, "triggerAlarm: 풀스크린 알람 표시 [$channelName]")
                CallForegroundService.start(
                    context, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
                )
                FakeCallActivity.start(
                    context, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl,
                    channelPublicId = channelPublicId, linkUrl = linkUrl
                )
            } else {
                // 이후 알람 → 상태바 알림
                Log.d(TAG, "triggerAlarm: 상태바 알림 표시 [$channelName]")
                showStatusBarAlarm(
                    context, channelName, alarmId, msgType, msgValue,
                    contentUrl, homepageUrl, channelPublicId, linkUrl
                )
            }
        }

        // ── 상태바 알림 발송 ─────────────────────────────────────────────
        // 수신함으로 이동하는 PendingIntent 포함
        fun showStatusBarAlarm(
            context: Context,
            channelName: String,
            alarmId: Int,
            msgType: String,
            msgValue: String,
            contentUrl: String,
            homepageUrl: String,
            channelPublicId: String,
            linkUrl: String
        ) {
            createNotifChannel(context)

            // 수신함으로 이동 Intent (MainActivity + 수신함 탭 플래그)
            val intent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("open_tab", "inbox")
                    putExtra("alarm_id",          alarmId)
                    putExtra("channel_name",       channelName)
                    putExtra("msg_type",           msgType)
                    putExtra("msg_value",          msgValue)
                    putExtra("content_url",        contentUrl)
                    putExtra("homepage_url",       homepageUrl)
                    putExtra("channel_public_id",  channelPublicId)
                    putExtra("link_url",           linkUrl)
                } ?: Intent()

            val pi = PendingIntent.getActivity(
                context,
                alarmId + 20000,  // 고유 requestCode (풀스크린 알람과 충돌 방지)
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val notif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("📢 $channelName")
                .setContentText("RinGo 알람이 도착했습니다. 탭하여 수신함에서 확인하세요.")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .build()

            nm.notify(alarmId + 20000, notif)
            Log.d(TAG, "상태바 알림 발송: $channelName (notifId=${alarmId + 20000})")
        }

        private fun createNotifChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(NOTIF_CHANNEL_ID) != null) return
            NotificationChannel(
                NOTIF_CHANNEL_ID,
                NOTIF_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "풀스크린 알람과 동시에 도착한 추가 알람"
                enableVibration(true)
                nm.createNotificationChannel(this)
            }
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
        createFgChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        sessionToken = intent?.getStringExtra(EXTRA_TOKEN)    ?: sessionToken
        baseUrl      = intent?.getStringExtra(EXTRA_BASE_URL) ?: baseUrl

        // base_url과 session_token을 SharedPreferences에 저장
        // FakeCallActivity에서 API 호출 시 사용 (앱이 종료된 상태에서도 접근 가능)
        if (baseUrl.isNotEmpty() || sessionToken.isNotEmpty()) {
            getSharedPreferences(PREF_NAME, MODE_PRIVATE).edit().apply {
                if (baseUrl.isNotEmpty())      putString("base_url",      baseUrl)
                if (sessionToken.isNotEmpty()) putString("session_token", sessionToken)
                apply()
            }
        }

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
                    Log.d(TAG, "alarm $alarmId skipped (already handled)")
                    continue
                }

                markFcmHandled(this@AlarmPollingService, alarmId)

                val channelName     = alarm.optString("channel_name",     "알람")
                val channelPublicId = alarm.optString("channel_public_id", "")
                val msgType         = alarm.optString("msg_type",          "youtube")
                val msgValue        = alarm.optString("msg_value",         "")
                val contentUrl      = alarm.optString("content_url",       "")
                val homepageUrl     = alarm.optString("channel_homepage_url", "").ifEmpty { alarm.optString("homepage_url", "") }
                val linkUrl         = alarm.optString("link_url", "")

                Log.d(TAG, "polling alarm: $channelName (id=$alarmId)")

                triggerAlarm(
                    this@AlarmPollingService,
                    channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl, channelPublicId, linkUrl
                )
            }

        } catch (e: Exception) {
            Log.e(TAG, "poll error: ${e.message}")
        }
    }

    private fun createFgChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(FG_CHANNEL_ID) == null) {
            NotificationChannel(FG_CHANNEL_ID, "RinGo 서비스", NotificationManager.IMPORTANCE_MIN).apply {
                description = "백그라운드 알람 수신 서비스"
                setShowBadge(false)
                setSound(null, null)
                nm.createNotificationChannel(this)
            }
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
