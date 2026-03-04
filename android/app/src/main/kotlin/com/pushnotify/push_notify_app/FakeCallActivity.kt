package com.pushnotify.push_notify_app

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.*
import android.util.Log

/**
 * FakeCallActivity  ─ 세이투두 방식
 *
 * ① 알람 도착 → AlarmPollingService가 startActivity로 직접 이 화면 띄움
 *   (알림/Notification 없음, 잠금화면 위에 바로 표시)
 * ② 기기 기본 벨소리(STREAM_RING 볼륨) + 진동
 * ③ [수락] 버튼 → msgType에 따라 콘텐츠 즉시 실행 (YouTube/브라우저/오디오)
 *                  → Flutter MainActivity도 열어 앱 상태 동기화
 * ④ [거절] 버튼 / 30초 타임아웃 → 화면 종료
 */
class FakeCallActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "FakeCallActivity"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"

        fun start(
            context: Context,
            channelName: String,
            msgType: String,
            msgValue: String,
            alarmId: Int,
            contentUrl: String
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
            }
            context.startActivity(intent)
        }
    }

    private var ringtone: Ringtone?           = null
    private var vibrator: Vibrator?            = null
    private var autoDeclineTimer: CountDownTimer? = null
    private var isAnswered = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
        val contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""

        buildUI(channelName, msgType, msgValue, alarmId, contentUrl)
        startRinging()

        // 30초 후 자동 거절
        autoDeclineTimer = object : CountDownTimer(30_000, 1_000) {
            override fun onTick(millisUntilFinished: Long) {}
            override fun onFinish() { if (!isAnswered) decline() }
        }.start()
    }

    override fun onDestroy() {
        stopRinging()
        autoDeclineTimer?.cancel()
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
        contentUrl: String
    ) {
        if (isAnswered) return
        isAnswered = true
        autoDeclineTimer?.cancel()
        stopRinging()

        // 1) 메시지 소스 즉시 실행 (YouTube / 브라우저 / 오디오)
        launchContent(msgType, msgValue, contentUrl)

        // 2) Flutter MainActivity도 열어 앱 상태 동기화
        //    (앱이 꺼져있던 경우에도 웹뷰 화면이 뜨도록)
        val mainIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("alarm_answered",     true)
            putExtra("alarm_channel_name", channelName)
            putExtra("alarm_msg_type",     msgType)
            putExtra("alarm_msg_value",    msgValue)
            putExtra("alarm_id",           alarmId)
            putExtra("alarm_content_url",  contentUrl)
        }
        if (mainIntent != null) startActivity(mainIntent)

        finish()
    }

    // ── 콘텐츠 즉시 실행 ─────────────────────────────────────────────
    private fun launchContent(msgType: String, msgValue: String, contentUrl: String) {
        try {
            when (msgType) {
                "youtube" -> {
                    // YouTube 앱 우선, 없으면 브라우저
                    val videoId = extractYoutubeId(msgValue)
                    val youtubeAppUri = Uri.parse("vnd.youtube:$videoId")
                    val youtubeWebUri = Uri.parse(
                        if (videoId.isNotEmpty()) "https://www.youtube.com/watch?v=$videoId"
                        else if (msgValue.startsWith("http")) msgValue
                        else contentUrl.ifEmpty { msgValue }
                    )
                    val appIntent = Intent(Intent.ACTION_VIEW, youtubeAppUri).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    try {
                        startActivity(appIntent)
                    } catch (_: Exception) {
                        startActivity(Intent(Intent.ACTION_VIEW, youtubeWebUri).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        })
                    }
                }
                "audio", "video" -> {
                    val url = msgValue.ifEmpty { contentUrl }
                    if (url.isNotEmpty()) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        })
                    }
                }
                else -> {
                    val url = msgValue.ifEmpty { contentUrl }
                    if (url.startsWith("http")) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        })
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "콘텐츠 실행 실패: ${e.message}")
        }
    }

    private fun extractYoutubeId(url: String): String {
        if (url.length == 11 && !url.startsWith("http")) return url
        val patterns = listOf(
            Regex("(?:v=|youtu\\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})")
        )
        for (p in patterns) {
            val m = p.find(url)
            if (m != null) return m.groupValues[1]
        }
        return ""
    }

    // ── [거절] 처리 ──────────────────────────────────────────────────
    private fun decline() {
        autoDeclineTimer?.cancel()
        stopRinging()
        finish()
    }

    // ── UI 빌드 ──────────────────────────────────────────────────────
    private fun buildUI(
        channelName: String,
        msgType: String,
        msgValue: String,
        alarmId: Int,
        contentUrl: String
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
            setPadding(0, dpToPx(80), 0, dpToPx(60))
        }

        // "수신 전화" 레이블
        root.addView(TextView(this).apply {
            text      = "수신 전화"
            textSize  = 16f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity   = Gravity.CENTER
            letterSpacing = 0.15f
        })
        root.addView(spaceView(32))

        // 아이콘 (맥박 펄스)
        val iconContainer = android.widget.FrameLayout(this)
        val outerRing  = circleView(160, Color.parseColor("#2D2A6E"), alpha = 80)
        val innerCircle = circleView(120, Color.parseColor("#6C63FF")).apply {
            val pulse = ScaleAnimation(1f, 1.12f, 1f, 1.12f,
                Animation.RELATIVE_TO_SELF, 0.5f,
                Animation.RELATIVE_TO_SELF, 0.5f).apply {
                duration    = 800
                repeatMode  = Animation.REVERSE
                repeatCount = Animation.INFINITE
            }
            startAnimation(pulse)
        }
        val bellIcon = android.widget.ImageView(this).apply {
            setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            setColorFilter(Color.WHITE)
            layoutParams = android.widget.FrameLayout.LayoutParams(dpToPx(52), dpToPx(52)).apply {
                gravity = Gravity.CENTER
            }
        }
        iconContainer.layoutParams = LinearLayout.LayoutParams(dpToPx(160), dpToPx(160)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
        }
        iconContainer.addView(outerRing)
        iconContainer.addView(innerCircle)
        iconContainer.addView(bellIcon)
        root.addView(iconContainer)
        root.addView(spaceView(32))

        // 채널명
        root.addView(TextView(this).apply {
            text      = channelName
            textSize  = 30f
            setTextColor(Color.WHITE)
            gravity   = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dpToPx(24), 0, dpToPx(24), 0)
        })
        root.addView(spaceView(10))

        // 메시지 타입 라벨
        root.addView(TextView(this).apply {
            text     = getMsgTypeLabel(msgType)
            textSize = 15f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity  = Gravity.CENTER
        })
        root.addView(spaceView(8))

        // PushNotify 배지
        root.addView(TextView(this).apply {
            text    = "PushNotify 알람"
            textSize = 13f
            setTextColor(Color.parseColor("#6C63FF"))
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dpToPx(20).toFloat()
                setColor(Color.parseColor("#1A1860"))
                setStroke(1, Color.parseColor("#3730A3"))
            }
            setPadding(dpToPx(14), dpToPx(6), dpToPx(14), dpToPx(6))
        })

        // Spacer (push buttons to bottom)
        root.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        })

        // 수락 / 거절 버튼 행
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // 거절 버튼
        btnRow.addView(makeCallButton(
            iconRes = android.R.drawable.ic_menu_close_clear_cancel,
            color   = "#EF4444",
            label   = "거절",
            onClick = { decline() }
        ))

        btnRow.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })

        // 수락 버튼 (흔들림 애니메이션)
        val answerCol = makeCallButton(
            iconRes = android.R.drawable.ic_menu_call,
            color   = "#22C55E",
            label   = "수락",
            onClick = { answer(channelName, msgType, msgValue, alarmId, contentUrl) }
        )
        answerCol.getChildAt(0)?.let { btn ->
            val shake = RotateAnimation(-8f, 8f,
                Animation.RELATIVE_TO_SELF, 0.5f,
                Animation.RELATIVE_TO_SELF, 0.5f).apply {
                duration    = 200
                repeatMode  = Animation.REVERSE
                repeatCount = Animation.INFINITE
            }
            btn.startAnimation(shake)
        }
        btnRow.addView(answerCol)
        root.addView(btnRow)

        setContentView(root)
    }

    // ── 유틸 ─────────────────────────────────────────────────────────
    private fun circleView(sizeDp: Int, colorInt: Int, alpha: Int = 255): View {
        return View(this).apply {
            layoutParams = android.widget.FrameLayout.LayoutParams(dpToPx(sizeDp), dpToPx(sizeDp)).apply {
                gravity = Gravity.CENTER
            }
            background = GradientDrawable().apply {
                shape      = GradientDrawable.OVAL
                setColor(colorInt)
                this.alpha = alpha
            }
        }
    }

    private fun makeCallButton(
        iconRes: Int, color: String, label: String, onClick: () -> Unit
    ): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dpToPx(40); marginEnd = dpToPx(40) }

            val btn = android.widget.ImageView(this@FakeCallActivity).apply {
                setImageResource(iconRes)
                setColorFilter(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(dpToPx(72), dpToPx(72))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor(color))
                }
                setPadding(dpToPx(16), dpToPx(16), dpToPx(16), dpToPx(16))
                setOnClickListener { onClick() }
            }
            addView(btn)
            addView(spaceView(12))
            addView(TextView(this@FakeCallActivity).apply {
                text     = label
                textSize = 14f
                setTextColor(Color.parseColor("#94A3B8"))
                gravity  = Gravity.CENTER
            })
        }
    }

    private fun spaceView(dp: Int) = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dpToPx(dp))
    }

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density + 0.5f).toInt()

    private fun getMsgTypeLabel(msgType: String) = when (msgType) {
        "youtube" -> "📺 YouTube 알람"
        "audio"   -> "🎵 오디오 알람"
        "video"   -> "🎬 비디오 알람"
        else      -> "📎 파일 알람"
    }
}
