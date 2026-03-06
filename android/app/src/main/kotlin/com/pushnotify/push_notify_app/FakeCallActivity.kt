package com.pushnotify.push_notify_app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.os.PowerManager
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.Animation
import android.view.animation.RotateAnimation
import android.view.animation.ScaleAnimation
import android.widget.*
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * FakeCallActivity
 *
 * 역할: fullScreenIntent로 잠금화면 위에 표시되는 전화 수신 UI
 *
 * 흐름:
 *   AlarmPollingService / RinGoFCMService
 *   → nm.notify(fullScreenIntent) → 이 Activity 실행
 *   → 벨소리 + 진동 + 수락/거절 UI
 *   → [수락] → ContentPlayerActivity (콘텐츠 재생)
 *   → [거절/타임아웃] → 서버에 상태 기록 후 종료
 */
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
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private val autoDeclineHandler   = Handler(Looper.getMainLooper())
    private var autoDeclineRunnable: Runnable? = null
    private var isAnswered       = false
    private var isTimeoutDecline = false
    private var wakeLock: PowerManager.WakeLock? = null

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // WakeLock — Activity 레벨에서 화면 강제 켜기 (서비스의 WakeLock 보조)
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "ringo:fakecall_wakelock"
            ).also { it.acquire(35_000L) }
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock 실패: ${e.message}")
        }

        // 잠금화면 위 표시 설정
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON   or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val msgType     = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue    = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val alarmId     = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        val autoAccept  = intent.getBooleanExtra(EXTRA_AUTO_ACCEPT, false)
        val contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        val homepageUrl = intent.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""

        // fullScreenIntent로 열릴 때 발행된 알림 취소 (드로어에 남지 않도록)
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(alarmId + 10000)
            nm.cancel(CallForegroundService.NOTIFICATION_ID)
        } catch (_: Exception) {}

        buildUI(channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)

        if (autoAccept) {
            Handler(Looper.getMainLooper()).postDelayed({
                answer(channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)
            }, 300L)
        } else {
            startRinging()
            autoDeclineRunnable = Runnable {
                if (!isAnswered) {
                    isTimeoutDecline = true
                    recordAlarmStatus(alarmId, "timeout")
                    decline()
                }
            }
            autoDeclineHandler.postDelayed(autoDeclineRunnable!!, 30_000L)
        }
    }

    override fun onDestroy() {
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        scope.cancel()
        super.onDestroy()
    }

    // ── 벨소리 + 진동 ────────────────────────────────────────────────
    private fun startRinging() {
        val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        ringtone = RingtoneManager.getRingtone(this, uri)?.also { r ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.isLooping = true
            r.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            @Suppress("DEPRECATION")
            r.streamType = AudioManager.STREAM_RING
            r.play()
        }

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(VIBRATOR_SERVICE) as Vibrator
        }
        val pattern = longArrayOf(0, 700, 300, 700, 300, 700, 300, 700)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }
    }

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
    }

    // ── 서버에 알람 상태 기록 ────────────────────────────────────────
    private fun recordAlarmStatus(alarmId: Int, status: String) {
        if (alarmId <= 0) return
        scope.launch {
            try {
                val prefs = applicationContext.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
                val token = prefs.getString("flutter.session_token", "") ?: ""
                if (token.isEmpty()) return@launch

                val json = """{"alarm_schedule_id":$alarmId,"status":"$status"}"""
                val req = Request.Builder()
                    .url("https://ringo-server.pages.dev/api/alarms/status")
                    .post(json.toRequestBody("application/json".toMediaType()))
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                val resp = http.newCall(req).execute()
                Log.d(TAG, "알람 상태 기록 → $status: HTTP ${resp.code}")
                resp.close()
            } catch (e: Exception) {
                Log.e(TAG, "알람 상태 기록 실패: ${e.message}")
            }
        }
    }

    // ── [수락] 처리 ──────────────────────────────────────────────────
    private fun answer(
        channelName: String, msgType: String, msgValue: String,
        alarmId: Int, contentUrl: String, homepageUrl: String
    ) {
        if (isAnswered) return
        isAnswered = true

        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "accepted")

        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(alarmId + 10000)
            nm.cancel(CallForegroundService.NOTIFICATION_ID)
        } catch (_: Exception) {}

        CallForegroundService.stop(applicationContext)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }

        ContentPlayerActivity.start(applicationContext, msgType, msgValue, contentUrl, channelName, homepageUrl)
        autoDeclineHandler.postDelayed({ finish() }, 300L)
    }

    // ── [거절] 처리 ──────────────────────────────────────────────────
    private fun decline() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        if (!isAnswered && !isTimeoutDecline) {
            recordAlarmStatus(intent.getIntExtra(EXTRA_ALARM_ID, 0), "rejected")
        }
        CallForegroundService.stop(applicationContext)
        finish()
    }

    // ── UI 빌드 ──────────────────────────────────────────────────────
    private fun buildUI(
        channelName: String, msgType: String, msgValue: String,
        alarmId: Int, contentUrl: String, homepageUrl: String
    ) {
        val bg = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#0A0A1A"), Color.parseColor("#1A1035"), Color.parseColor("#0D0D1F"))
        )
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER_HORIZONTAL
            background  = bg
            setPadding(0, dp(80), 0, dp(60))
        }

        root.addView(TextView(this).apply {
            text = "수신 전화"; textSize = 16f
            setTextColor(Color.parseColor("#94A3B8")); gravity = Gravity.CENTER; letterSpacing = 0.15f
        })
        root.addView(space(32))

        // 아이콘 (맥박 펄스 애니메이션)
        val iconFrame = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(160), dp(160)).apply { gravity = Gravity.CENTER_HORIZONTAL }
        }
        iconFrame.addView(View(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(160), dp(160)).apply { gravity = Gravity.CENTER }
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#2D2A6E")); alpha = 80 }
        })
        iconFrame.addView(View(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(120), dp(120)).apply { gravity = Gravity.CENTER }
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#6C63FF")) }
            startAnimation(ScaleAnimation(1f, 1.12f, 1f, 1.12f,
                Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f).apply {
                duration = 800; repeatMode = Animation.REVERSE; repeatCount = Animation.INFINITE
            })
        })
        iconFrame.addView(android.widget.ImageView(this).apply {
            setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            setColorFilter(Color.WHITE)
            layoutParams = FrameLayout.LayoutParams(dp(52), dp(52)).apply { gravity = Gravity.CENTER }
        })
        root.addView(iconFrame)
        root.addView(space(32))

        root.addView(TextView(this).apply {
            text = channelName; textSize = 30f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD); setPadding(dp(24), 0, dp(24), 0)
        })
        root.addView(space(10))

        root.addView(TextView(this).apply {
            text = getMsgTypeLabel(msgType); textSize = 15f
            setTextColor(Color.parseColor("#94A3B8")); gravity = Gravity.CENTER
        })
        root.addView(space(8))

        root.addView(TextView(this).apply {
            text = "RinGo 알람"; textSize = 13f; setTextColor(Color.parseColor("#6C63FF"))
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat(); setColor(Color.parseColor("#1A1860"))
                setStroke(1, Color.parseColor("#3730A3"))
            }
            setPadding(dp(14), dp(6), dp(14), dp(6))
        })

        // 빈 공간 (버튼을 아래로)
        root.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        })

        // 거절/수락 버튼 행
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        btnRow.addView(callBtn(android.R.drawable.ic_menu_close_clear_cancel, "#EF4444", "거절") { decline() })
        btnRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })

        val answerCol = callBtn(android.R.drawable.ic_menu_call, "#22C55E", "수락") {
            answer(channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)
        }
        (answerCol as LinearLayout).getChildAt(0)?.startAnimation(
            RotateAnimation(-8f, 8f, Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f).apply {
                duration = 200; repeatMode = Animation.REVERSE; repeatCount = Animation.INFINITE
            }
        )
        btnRow.addView(answerCol)
        root.addView(btnRow)

        setContentView(root)
    }

    private fun callBtn(iconRes: Int, color: String, label: String, onClick: () -> Unit): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(40); marginEnd = dp(40) }
            addView(android.widget.ImageView(this@FakeCallActivity).apply {
                setImageResource(iconRes); setColorFilter(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(dp(72), dp(72))
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor(color)) }
                setPadding(dp(16), dp(16), dp(16), dp(16))
                setOnClickListener { onClick() }
            })
            addView(space(12))
            addView(TextView(this@FakeCallActivity).apply {
                text = label; textSize = 14f; setTextColor(Color.parseColor("#94A3B8")); gravity = Gravity.CENTER
            })
        }
    }

    private fun space(dpVal: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(dpVal))
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()

    private fun getMsgTypeLabel(msgType: String) = when (msgType) {
        "youtube" -> "📺 YouTube 알람"
        "audio"   -> "🎵 오디오 알람"
        "video"   -> "🎬 비디오 알람"
        else      -> "📎 파일 알람"
    }
}
