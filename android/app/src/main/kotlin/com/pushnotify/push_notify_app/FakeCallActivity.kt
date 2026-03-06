package com.pushnotify.push_notify_app

import android.animation.*
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.*
import android.widget.*
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class FakeCallActivity : Activity() {

    companion object {
        private const val TAG = "FakeCallActivity"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"
        const val EXTRA_AUTO_ACCEPT  = "auto_accept"

        fun start(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = "",
            autoAccept: Boolean = false
        ) {
            val intent = Intent(context, FakeCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_ALARM_ID,     alarmId)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_HOMEPAGE_URL, homepageUrl)
                putExtra(EXTRA_AUTO_ACCEPT,  autoAccept)
            }
            context.startActivity(intent)
        }
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator?  = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http  = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private var alarmId     = 0
    private var channelName = ""
    private var msgType     = ""
    private var msgValue    = ""
    private var contentUrl  = ""
    private var homepageUrl = ""
    private var autoAccept  = false

    private val autoDeclineHandler  = Handler(Looper.getMainLooper())
    private var autoDeclineRunnable: Runnable? = null
    private var ringAnimator: AnimatorSet? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ── 1. 화면/잠금 플래그 (API 27 이하 방식) ───────────────────
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED    or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD    or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON      or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // ── 2. API 27+ 추가 처리 ────────────────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        // ── 3. KeyguardManager로 잠금화면 강제 해제 (파워알람 방식) ──
        val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            km.newKeyguardLock("RinGo:KeyguardLock").disableKeyguard()
        }

        // ── 4. WakeLock (화면 강제 켜기) ─────────────────────────────
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "RinGo:FakeCallWakeLock"
        ).also { it.acquire(35_000L) }

        // ── 5. SYSTEM_ALERT_WINDOW: 화면 켜진 상태에서도 최상위 표시 ─
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
            window.setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
        }

        // ── 인텐트 데이터 추출 ──────────────────────────────────────
        alarmId     = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        msgType     = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        msgValue    = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        homepageUrl = intent.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""
        autoAccept  = intent.getBooleanExtra(EXTRA_AUTO_ACCEPT, false)

        buildUi()
        startRinging()

        if (autoAccept) {
            autoDeclineHandler.postDelayed({ handleAccept() }, 300L)
            return
        }

        autoDeclineRunnable = Runnable {
            Log.d(TAG, "30초 타임아웃 → 자동 거절")
            recordAlarmStatus(alarmId, "timeout")
            finishAlarm()
        }
        autoDeclineHandler.postDelayed(autoDeclineRunnable!!, 30_000L)
    }

    override fun onDestroy() {
        ringAnimator?.cancel()
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        scope.cancel()
        super.onDestroy()
    }

    // ── 벨소리 + 진동 ──────────────────────────────────────────────
    private fun startRinging() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        val ringerMode = am.ringerMode
        Log.d(TAG, "ringerMode=$ringerMode")

        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(this, uri)?.also { r ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.isLooping = true
                r.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setLegacyStreamType(AudioManager.STREAM_RING)
                    .build()
                r.play()
                Log.d(TAG, "벨소리 재생: $uri")
            }
        }

        if (ringerMode == AudioManager.RINGER_MODE_NORMAL ||
            ringerMode == AudioManager.RINGER_MODE_VIBRATE) {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 800, 400, 800, 400, 800, 400, 800)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        }
    }

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
    }

    // ── 수락 ───────────────────────────────────────────────────────
    private fun handleAccept() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "accepted")
        dismissNotification()
        CallForegroundService.stop(this)
        val target = contentUrl.ifEmpty { homepageUrl }
        if (target.isNotEmpty()) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
            } catch (_: Exception) {}
        }
        finish()
    }

    // ── 거절 ───────────────────────────────────────────────────────
    private fun handleDecline() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "rejected")
        finishAlarm()
    }

    private fun finishAlarm() {
        dismissNotification()
        CallForegroundService.stop(this)
        finish()
    }

    private fun dismissNotification() {
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(alarmId + 10000)
        } catch (_: Exception) {}
    }

    // ── 서버 상태 기록 ─────────────────────────────────────────────
    private fun recordAlarmStatus(alarmId: Int, status: String) {
        if (alarmId <= 0) return
        scope.launch {
            try {
                val prefs = applicationContext.getSharedPreferences(
                    "FlutterSharedPreferences", Context.MODE_PRIVATE
                )
                val token   = prefs.getString("flutter.session_token", "") ?: ""
                val baseUrl = (prefs.getString("flutter.base_url", "") ?: "").trimEnd('/')
                if (token.isEmpty() || baseUrl.isEmpty()) return@launch

                val json = """{"alarm_schedule_id":$alarmId,"status":"$status"}"""
                val req = Request.Builder()
                    .url("$baseUrl/api/alarms/status")
                    .post(json.toRequestBody("application/json".toMediaType()))
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                val resp = http.newCall(req).execute()
                Log.d(TAG, "상태 기록: $status → ${resp.code}")
            } catch (e: Exception) {
                Log.e(TAG, "상태 기록 실패: ${e.message}")
            }
        }
    }

    // ── 통화 수신 UI ────────────────────────────────────────────────
    private fun buildUi() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF0D1117.toInt())
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER_HORIZONTAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).also { it.gravity = Gravity.CENTER_VERTICAL; it.topMargin = dpToPx(40) }
        }

        // 채널명
        val channelTv = TextView(this).apply {
            text      = channelName
            textSize  = 30f
            setTextColor(0xFFFFFFFF.toInt())
            gravity   = Gravity.CENTER
            typeface  = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(dpToPx(24), 0, dpToPx(24), 0)
        }

        // 서브 라벨
        val subLabel = when (msgType) {
            "youtube" -> "YouTube 알람"
            "audio"   -> "오디오 알람"
            "video"   -> "비디오 알람"
            else      -> "알람"
        }
        val subTv = TextView(this).apply {
            text     = subLabel
            textSize = 16f
            setTextColor(0xFFAAAAAA.toInt())
            gravity  = Gravity.CENTER
            setPadding(0, dpToPx(8), 0, dpToPx(40))
        }

        // 전화기 아이콘 + 링 애니메이션
        val iconContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dpToPx(180), dpToPx(180)).also {
                it.gravity = Gravity.CENTER_HORIZONTAL
            }
        }

        val ringSize = dpToPx(180)
        val rings = (0..2).map { i ->
            View(this).apply {
                val size = ringSize - i * dpToPx(20)
                layoutParams = FrameLayout.LayoutParams(size, size).also { it.gravity = Gravity.CENTER }
                background = createCircleDrawable(
                    when (i) {
                        0    -> 0x1A4CAF50.toInt()
                        1    -> 0x334CAF50.toInt()
                        else -> 0x4D4CAF50.toInt()
                    }
                )
                alpha = 0f
            }
        }

        val phoneBg = View(this).apply {
            val size = dpToPx(90)
            layoutParams = FrameLayout.LayoutParams(size, size).also { it.gravity = Gravity.CENTER }
            background = createCircleDrawable(0xFF4CAF50.toInt())
        }

        val phoneTv = TextView(this).apply {
            text     = "📞"
            textSize = 36f
            gravity  = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).also { it.gravity = Gravity.CENTER }
        }

        rings.forEach { iconContainer.addView(it) }
        iconContainer.addView(phoneBg)
        iconContainer.addView(phoneTv)
        startRingAnimation(rings)

        // 버튼 영역
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = Gravity.CENTER
            setPadding(dpToPx(24), dpToPx(60), dpToPx(24), 0)
        }

        // 거절 버튼
        val declineLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val declineCircle = FrameLayout(this).apply {
            val size = dpToPx(72)
            layoutParams = LinearLayout.LayoutParams(size, size).also { it.gravity = Gravity.CENTER_HORIZONTAL }
            background   = createCircleDrawable(0xFFE53935.toInt())
            isClickable  = true
            isFocusable  = true
        }
        val declineEmoji = TextView(this).apply {
            text     = "📵"
            textSize = 28f
            gravity  = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        val declineLabel = TextView(this).apply {
            text     = "거절"
            textSize = 14f
            setTextColor(0xFFAAAAAA.toInt())
            gravity  = Gravity.CENTER
            setPadding(0, dpToPx(8), 0, 0)
        }
        declineCircle.addView(declineEmoji)
        declineCircle.setOnClickListener { handleDecline() }
        declineLayout.addView(declineCircle)
        declineLayout.addView(declineLabel)

        // 수락 버튼
        val acceptLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val acceptCircle = FrameLayout(this).apply {
            val size = dpToPx(72)
            layoutParams = LinearLayout.LayoutParams(size, size).also { it.gravity = Gravity.CENTER_HORIZONTAL }
            background   = createCircleDrawable(0xFF4CAF50.toInt())
            isClickable  = true
            isFocusable  = true
        }
        val acceptEmoji = TextView(this).apply {
            text     = "📞"
            textSize = 28f
            gravity  = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        val acceptLabel = TextView(this).apply {
            text     = "수락"
            textSize = 14f
            setTextColor(0xFFAAAAAA.toInt())
            gravity  = Gravity.CENTER
            setPadding(0, dpToPx(8), 0, 0)
        }
        acceptCircle.addView(acceptEmoji)
        acceptCircle.setOnClickListener { handleAccept() }
        acceptLayout.addView(acceptCircle)
        acceptLayout.addView(acceptLabel)

        btnRow.addView(declineLayout)
        btnRow.addView(acceptLayout)

        content.addView(channelTv)
        content.addView(subTv)
        content.addView(iconContainer)
        content.addView(btnRow)
        root.addView(content)

        setContentView(root)
    }

    private fun startRingAnimation(rings: List<View>) {
        val animators = rings.mapIndexed { i, ring ->
            AnimatorSet().apply {
                val scaleX = ObjectAnimator.ofFloat(ring, "scaleX", 0.6f, 1.2f)
                val scaleY = ObjectAnimator.ofFloat(ring, "scaleY", 0.6f, 1.2f)
                val alpha  = ObjectAnimator.ofFloat(ring, "alpha",  0.8f, 0f)
                playTogether(scaleX, scaleY, alpha)
                duration     = 1500L
                startDelay   = i * 400L
                interpolator = AccelerateDecelerateInterpolator()
            }
        }
        ringAnimator = AnimatorSet().apply { playTogether(*animators.toTypedArray()) }

        val repeatHandler  = Handler(Looper.getMainLooper())
        val repeatRunnable = object : Runnable {
            override fun run() {
                rings.forEach { it.alpha = 0f; it.scaleX = 0.6f; it.scaleY = 0.6f }
                ringAnimator?.start()
                repeatHandler.postDelayed(this, 1800L)
            }
        }
        repeatHandler.post(repeatRunnable)
    }

    private fun createCircleDrawable(color: Int): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            setColor(color)
        }
    }

    private fun dpToPx(dp: Int): Int = (dp * resources.displayMetrics.density).toInt()
}
