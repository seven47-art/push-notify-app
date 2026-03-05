package com.pushnotify.push_notify_app

import android.app.Activity
import android.app.KeyguardManager
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

/**
 * FakeCallActivity  ─ 세이투두 방식
 *
 * ① 알람 도착 → fullScreenIntent로 이 화면 띄움
 * ② 기기 기본 벨소리(STREAM_RING 볼륨) + 진동
 * ③ [수락] 버튼 → ContentPlayerActivity 실행 (homepage_url 포함)
 * ④ [거절] 버튼 / 30초 타임아웃 → 화면 종료
 */
class FakeCallActivity : Activity() {

    companion object {
        private const val TAG = "FakeCallActivity"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"  // ★ 홈페이지 URL
        const val EXTRA_AUTO_ACCEPT  = "auto_accept"   // 헤즈업 수락 버튼에서 올 때 true

        fun start(
            context: Context,
            channelName: String,
            msgType: String,
            msgValue: String,
            alarmId: Int,
            contentUrl: String,
            homepageUrl: String = ""
        ) {
            val i = Intent(context, FakeCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_ALARM_ID,     alarmId)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_HOMEPAGE_URL, homepageUrl)
            }
            context.startActivity(i)
        }
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var autoDeclineHandler  = Handler(Looper.getMainLooper())
    private var autoDeclineRunnable: Runnable? = null
    private var isAnswered = false
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ── WAKE_LOCK: Activity 레벨에서도 화면 강제 켜기 ────────────
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "ringo:fakecall_wakelock"
            ).also { it.acquire(35_000L) }
            Log.d(TAG, "FakeCallActivity WAKE_LOCK 획득")
        } catch (e: Exception) {
            Log.e(TAG, "WAKE_LOCK 실패: ${e.message}")
        }

        // ── 잠금화면/화면 켜기 설정 ─────────────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
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

        // fullScreenIntent로 열렸을 때 트리거한 알림 즉시 취소
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(alarmId + 10000)
            nm.cancel(CallForegroundService.NOTIFICATION_ID)
        } catch (_: Exception) {}

        buildUI(channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)

        if (autoAccept) {
            Log.d(TAG, "AUTO_ACCEPT: 즉시 콘텐츠 실행")
            Handler(Looper.getMainLooper()).postDelayed({
                answer(channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)
            }, 300L)
        } else {
            startRinging()
            autoDeclineRunnable = Runnable { if (!isAnswered) decline() }
            autoDeclineHandler.postDelayed(autoDeclineRunnable!!, 30_000L)
        }
    }

    override fun onDestroy() {
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {}
        super.onDestroy()
    }

    // ── 벨소리 + 진동 ────────────────────────────────────────────────
    private fun startRinging() {
        val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(
            this, RingtoneManager.TYPE_RINGTONE
        ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

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

    // ── [수락] 처리 ──────────────────────────────────────────────────
    private fun answer(
        channelName: String,
        msgType: String,
        msgValue: String,
        alarmId: Int,
        contentUrl: String,
        homepageUrl: String = ""
    ) {
        if (isAnswered) return
        isAnswered = true

        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()

        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(9999)
            nm.cancel(alarmId + 10000)
            nm.cancel(CallForegroundService.NOTIFICATION_ID)
        } catch (_: Exception) {}

        CallForegroundService.stop(applicationContext)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            // ContentPlayerActivity 자체에서 setShowWhenLocked(true) 처리
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }
        // ★ homepageUrl 전달
        ContentPlayerActivity.start(applicationContext, msgType, msgValue, contentUrl, channelName, homepageUrl)
        autoDeclineHandler.postDelayed({ finish() }, 300L)
    }

    // ── [거절] 처리 ──────────────────────────────────────────────────
    private fun decline() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        CallForegroundService.stop(applicationContext)
        finish()
    }

    // ── UI 빌드 ──────────────────────────────────────────────────────
    private fun buildUI(
        channelName: String,
        msgType: String,
        msgValue: String,
        alarmId: Int,
        contentUrl: String,
        homepageUrl: String = ""
    ) {
        val bg = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.parseColor("#0A0A1A"),
                Color.parseColor("#1A1035"),
                Color.parseColor("#0D0D1F")
            )
        )
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER_HORIZONTAL
            background  = bg
            setPadding(0, dp(80), 0, dp(60))
        }

        // "수신 전화" 레이블
        root.addView(TextView(this).apply {
            text      = "수신 전화"
            textSize  = 16f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity   = Gravity.CENTER
            letterSpacing = 0.15f
        })
        root.addView(space(32))

        // 아이콘 컨테이너 (맥박 펄스)
        val iconFrame = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(160), dp(160)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
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
        iconFrame.addView(ImageView(this).apply {
            setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            setColorFilter(Color.WHITE)
            layoutParams = FrameLayout.LayoutParams(dp(52), dp(52)).apply { gravity = Gravity.CENTER }
        })

        root.addView(iconFrame)
        root.addView(space(32))

        root.addView(TextView(this).apply {
            text      = channelName
            textSize  = 30f
            setTextColor(Color.WHITE)
            gravity   = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(24), 0, dp(24), 0)
        })
        root.addView(space(10))

        root.addView(TextView(this).apply {
            text     = getMsgTypeLabel(msgType)
            textSize = 15f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity  = Gravity.CENTER
        })
        root.addView(space(8))

        root.addView(TextView(this).apply {
            text    = "RinGo 알람"
            textSize = 13f
            setTextColor(Color.parseColor("#6C63FF"))
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(Color.parseColor("#1A1860"))
                setStroke(1, Color.parseColor("#3730A3"))
            }
            setPadding(dp(14), dp(6), dp(14), dp(6))
        })

        root.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        })

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }

        btnRow.addView(callBtn(android.R.drawable.ic_menu_close_clear_cancel, "#EF4444", "거절") { decline() })
        btnRow.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })

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
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dp(40); marginEnd = dp(40) }

            addView(ImageView(this@FakeCallActivity).apply {
                setImageResource(iconRes)
                setColorFilter(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(dp(72), dp(72))
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor(color)) }
                setPadding(dp(16), dp(16), dp(16), dp(16))
                setOnClickListener { onClick() }
            })
            addView(space(12))
            addView(TextView(this@FakeCallActivity).apply {
                text     = label
                textSize = 14f
                setTextColor(Color.parseColor("#94A3B8"))
                gravity  = Gravity.CENTER
            })
        }
    }

    private fun space(dpVal: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(dpVal))
    }

    private fun dp(dpVal: Int): Int =
        (dpVal * resources.displayMetrics.density + 0.5f).toInt()

    private fun getMsgTypeLabel(msgType: String) = when (msgType) {
        "youtube" -> "📺 YouTube 알람"
        "audio"   -> "🎵 오디오 알람"
        "video"   -> "🎬 비디오 알람"
        else      -> "📎 파일 알람"
    }
}
