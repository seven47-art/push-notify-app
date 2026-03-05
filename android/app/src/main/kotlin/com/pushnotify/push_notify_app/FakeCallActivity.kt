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
 * ① 알람 도착 → AlarmPollingService.start() 직접 이 화면 띄움
 *   (알림/Notification 없음, 잠금화면 위에 바로 표시)
 * ② 기기 기본 벨소리(STREAM_RING 볼륨) + 진동
 * ③ [수락] 버튼 → msgType에 따라 콘텐츠 즉시 실행 (YouTube/브라우저/오디오)
 *                  → Flutter MainActivity도 열어 앱 상태 동기화
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

        fun start(
            context: Context,
            channelName: String,
            msgType: String,
            msgValue: String,
            alarmId: Int,
            contentUrl: String
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
        // CallForegroundService 에서 이미 WakeLock 획득했지만
        // Activity 에서도 추가로 획득해서 화면이 꺼지지 않도록 보장
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

        // fullScreenIntent로 열렸을 때 트리거한 알림 즉시 취소
        // (알림 드로어에 알림이 남지 않도록)
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(alarmId + 10000)
        } catch (_: Exception) {}
        val contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""

        buildUI(channelName, msgType, msgValue, alarmId, contentUrl)
        startRinging()

        // 30초 후 자동 거절
        autoDeclineRunnable = Runnable { if (!isAnswered) decline() }
        autoDeclineHandler.postDelayed(autoDeclineRunnable!!, 30_000L)
    }

    override fun onDestroy() {
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        // WAKE_LOCK 해제
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
        contentUrl: String
    ) {
        if (isAnswered) return
        isAnswered = true

        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()

        // 알림 정리
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.cancel(9999)
            nm.cancel(alarmId + 10000)
            nm.cancel(CallForegroundService.NOTIFICATION_ID)
        } catch (_: Exception) {}

        // CallForegroundService 종료
        CallForegroundService.stop(applicationContext)

        // ★ 핵심: 잠금화면을 완전히 해제한 뒤 콘텐츠 실행
        // 잠금화면 위에서 startActivity()를 바로 호출하면 OS가 차단함
        // → Keyguard 해제 완료 콜백 안에서 ContentPlayerActivity 실행
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() {
                    // 잠금화면 해제 완료 → 인앱 플레이어 실행
                    ContentPlayerActivity.start(applicationContext, msgType, msgValue, contentUrl, channelName)
                    autoDeclineHandler.postDelayed({ finish() }, 300L)
                }
                override fun onDismissError() {
                    // PIN/패턴 없는 경우도 실행
                    ContentPlayerActivity.start(applicationContext, msgType, msgValue, contentUrl, channelName)
                    autoDeclineHandler.postDelayed({ finish() }, 300L)
                }
                override fun onDismissCancelled() {
                    finish()
                }
            })
        } else {
            // Android 8.0 미만
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
            autoDeclineHandler.postDelayed({
                ContentPlayerActivity.start(applicationContext, msgType, msgValue, contentUrl, channelName)
                autoDeclineHandler.postDelayed({ finish() }, 300L)
            }, 300L)
        }
    }

    // ── 콘텐츠 즉시 실행 ─────────────────────────────────────────────
    private fun launchContent(msgType: String, msgValue: String, contentUrl: String) {
        try {
            when (msgType) {
                "youtube" -> {
                    val videoId = extractYoutubeId(msgValue)
                    val youtubeAppUri = Uri.parse("vnd.youtube:$videoId")
                    val youtubeWebUrl = if (videoId.isNotEmpty())
                        "https://www.youtube.com/watch?v=$videoId"
                    else if (msgValue.startsWith("http")) msgValue
                    else contentUrl.ifEmpty { msgValue }

                    val appIntent = Intent(Intent.ACTION_VIEW, youtubeAppUri).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    try {
                        startActivity(appIntent)
                    } catch (_: Exception) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(youtubeWebUrl)).apply {
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
        val m = Regex("(?:v=|youtu\\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})").find(url)
        return m?.groupValues?.get(1) ?: ""
    }

    // ── [거절] 처리 ──────────────────────────────────────────────────
    private fun decline() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        // CallForegroundService 종료 (포그라운드 알림 제거)
        CallForegroundService.stop(applicationContext)
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

        // 외부 링
        iconFrame.addView(View(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(160), dp(160)).apply { gravity = Gravity.CENTER }
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#2D2A6E")); alpha = 80 }
        })

        // 내부 원 (펄스 애니메이션)
        iconFrame.addView(View(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(120), dp(120)).apply { gravity = Gravity.CENTER }
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#6C63FF")) }
            startAnimation(ScaleAnimation(1f, 1.12f, 1f, 1.12f,
                Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f).apply {
                duration = 800; repeatMode = Animation.REVERSE; repeatCount = Animation.INFINITE
            })
        })

        // 벨 아이콘
        iconFrame.addView(ImageView(this).apply {
            setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            setColorFilter(Color.WHITE)
            layoutParams = FrameLayout.LayoutParams(dp(52), dp(52)).apply { gravity = Gravity.CENTER }
        })

        root.addView(iconFrame)
        root.addView(space(32))

        // 채널명
        root.addView(TextView(this).apply {
            text      = channelName
            textSize  = 30f
            setTextColor(Color.WHITE)
            gravity   = Gravity.CENTER
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(24), 0, dp(24), 0)
        })
        root.addView(space(10))

        // 메시지 타입 라벨
        root.addView(TextView(this).apply {
            text     = getMsgTypeLabel(msgType)
            textSize = 15f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity  = Gravity.CENTER
        })
        root.addView(space(8))

        // RinGo 배지
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

        // 가중치 스페이서
        root.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        })

        // 수락 / 거절 버튼 행
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }

        // 거절 버튼
        btnRow.addView(callBtn(android.R.drawable.ic_menu_close_clear_cancel, "#EF4444", "거절") { decline() })

        btnRow.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        })

        // 수락 버튼 (흔들림)
        val answerCol = callBtn(android.R.drawable.ic_menu_call, "#22C55E", "수락") {
            answer(channelName, msgType, msgValue, alarmId, contentUrl)
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

    // ── 유틸 ─────────────────────────────────────────────────────────
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
