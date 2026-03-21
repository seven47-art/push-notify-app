package com.pushnotify.push_notify_app

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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

        // 그룹 알림 고정 ID (summary 알림은 항상 이 ID로 갱신)
        const val GROUP_NOTIF_ID  = 30000
        const val GROUP_KEY       = "ringo_alarm_group"

        private const val PREF_NAME        = "ringo_alarm_prefs"
        private const val PREF_KEY_HANDLED = "handled_alarm_ids"
        private val fcmLock = Any()

        // ── 풀스크린 알람 표시 중 여부 플래그 ──────────────────────────
        // FCM 수신 순서 기준: 첫 번째 알람은 풀스크린, 이후는 상태바
        private val isFakeCallShowing = AtomicBoolean(false)

        fun setFakeCallShowing(showing: Boolean) {
            isFakeCallShowing.set(showing)
            Log.d(TAG, "isFakeCallShowing = $showing")
            // 풀스크린 알람 종료 시 → 그룹 알림 목록도 초기화
            if (!showing) {
                synchronized(fcmLock) { pendingChannelNames.clear() }
            }
        }

        fun isFakeCallActive(): Boolean = isFakeCallShowing.get()

        // ── 상태바 그룹 알림용 채널명 목록 ──────────────────────────────
        // 새 알람이 올 때마다 추가하고 summary 알림을 갱신
        private val pendingChannelNames = mutableListOf<String>()

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

        // ── 상태바 그룹 알림 발송 ────────────────────────────────────────
        // 새 채널명 추가 후 InboxStyle summary 알림을 갱신
        // → 알림 하나로 모든 채널명을 묶어서 표시
        // → "수신함 바로가기" 탭 시 수신함으로 이동 + 알림 자동 닫힘
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

            // 채널명 목록에 추가
            synchronized(fcmLock) { pendingChannelNames.add(channelName) }
            val currentNames = synchronized(fcmLock) { pendingChannelNames.toList() }
            val timeStr = SimpleDateFormat("a h:mm", Locale.KOREA).format(Date())

            // ── 수신함 이동 PendingIntent ─────────────────────────────────
            val inboxIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("open_tab", "inbox")
                } ?: Intent()

            val inboxPi = PendingIntent.getActivity(
                context,
                GROUP_NOTIF_ID,
                inboxIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // ── 링고 LargeIcon 로드 ───────────────────────────────────────
            val largeIcon = try {
                BitmapFactory.decodeResource(context.resources, R.drawable.ringo_icon)
            } catch (_: Exception) { null }

            // ── InboxStyle 구성 ───────────────────────────────────────────
            val inboxStyle = NotificationCompat.InboxStyle()
            currentNames.forEach { name -> inboxStyle.addLine("📢  $name") }
            inboxStyle.setSummaryText("RinGo 알람이 도착했습니다. 수신함에서 확인하세요.")

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // ── Summary(그룹) 알림 갱신 ───────────────────────────────────
            // 항상 GROUP_NOTIF_ID 하나만 사용 → 새 알람마다 덮어쓰기(갱신)
            val summaryNotif = NotificationCompat.Builder(context, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(largeIcon)
                .setContentTitle(timeStr)
                .setContentText(currentNames.joinToString(", ") { "📢$it" })
                .setStyle(inboxStyle)
                .setContentIntent(inboxPi)          // 알림 탭 → 수신함
                .setAutoCancel(true)                // 탭 시 자동 닫힘
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setGroup(GROUP_KEY)
                .setGroupSummary(true)
                // "수신함 바로가기" 액션 버튼
                .addAction(
                    NotificationCompat.Action.Builder(
                        R.drawable.ringo_icon,
                        "수신함 바로가기",
                        inboxPi
                    ).build()
                )
                .build()

            nm.notify(GROUP_NOTIF_ID, summaryNotif)
            Log.d(TAG, "그룹 알림 갱신: ${currentNames.size}개 채널 [${currentNames.joinToString()}]")
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
