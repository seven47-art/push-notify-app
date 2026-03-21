package com.pushnotify.push_notify_app

import android.animation.*
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.*
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.*
import android.widget.*
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * FakeCallActivity v4.0
 * 카카오톡 전화 수신 화면 1:1 복제
 * - 배경: 상단 카드(#222222) / 하단 순수블랙(#000000)
 * - 프로필: 130dp 원형, 얇은 회색 테두리만 (glow 없음)
 * - 하단: 거절(#FF3B30, 64dp) / 수락(#34C759, 64dp) + vector drawable 아이콘
 * - 라벨 없음 (카카오톡 동일)
 */
class FakeCallActivity : Activity() {

    companion object {
        private const val TAG = "FakeCallActivity"
        const val EXTRA_CHANNEL_NAME      = "channel_name"
        const val EXTRA_CHANNEL_PUBLIC_ID = "channel_public_id"
        const val EXTRA_MSG_TYPE          = "msg_type"
        const val EXTRA_MSG_VALUE         = "msg_value"
        const val EXTRA_ALARM_ID          = "alarm_id"
        const val EXTRA_CONTENT_URL       = "content_url"
        const val EXTRA_HOMEPAGE_URL      = "homepage_url"
        const val EXTRA_LINK_URL          = "link_url"
        const val EXTRA_AUTO_ACCEPT       = "auto_accept"

        fun start(
            context: Context,
            channelName: String, msgType: String, msgValue: String,
            alarmId: Int, contentUrl: String, homepageUrl: String = "",
            channelPublicId: String = "",
            autoAccept: Boolean = false,
            linkUrl: String = ""
        ) {
            val intent = Intent(context, FakeCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra(EXTRA_CHANNEL_NAME,      channelName)
                putExtra(EXTRA_CHANNEL_PUBLIC_ID, channelPublicId)
                putExtra(EXTRA_MSG_TYPE,          msgType)
                putExtra(EXTRA_MSG_VALUE,         msgValue)
                putExtra(EXTRA_ALARM_ID,          alarmId)
                putExtra(EXTRA_CONTENT_URL,       contentUrl)
                putExtra(EXTRA_HOMEPAGE_URL,      homepageUrl)
                putExtra(EXTRA_LINK_URL,          linkUrl)
                putExtra(EXTRA_AUTO_ACCEPT,       autoAccept)
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

    private var alarmId         = 0
    private var channelName     = ""
    private var channelPublicId = ""
    private var msgType         = ""
    private var msgValue        = ""
    private var contentUrl      = ""
    private var homepageUrl     = ""
    private var linkUrl         = ""
    private var autoAccept      = false

    private val autoDeclineHandler  = Handler(Looper.getMainLooper())
    private var autoDeclineRunnable: Runnable? = null
    private var pulseAnimator: Animator? = null

    // 채널 이미지를 표시할 ImageView (API 응답 후 업데이트)
    private var profileIcon: ImageView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ── 1. 윈도우 플래그 (잠금화면 위에 표시) ─────────────────────
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED    or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD    or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON      or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        // ── 2. KeyguardManager 잠금화면 강제 해제 ─────────────────────
        val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            km.newKeyguardLock("RinGo:KeyguardLock").disableKeyguard()
        }

        // ── 3. WakeLock ────────────────────────────────────────────────
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "RinGo:FakeCallWakeLock"
        ).also { it.acquire(35_000L) }

        // ── 4. SYSTEM_ALERT_WINDOW 최상위 ──────────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
            window.setType(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
        }

        // ── 인텐트 데이터 추출 ──────────────────────────────────────────
        alarmId         = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        channelName     = intent.getStringExtra(EXTRA_CHANNEL_NAME)      ?: "알람"
        channelPublicId = intent.getStringExtra(EXTRA_CHANNEL_PUBLIC_ID) ?: ""
        msgType         = intent.getStringExtra(EXTRA_MSG_TYPE)          ?: "youtube"
        msgValue        = intent.getStringExtra(EXTRA_MSG_VALUE)         ?: ""
        contentUrl      = intent.getStringExtra(EXTRA_CONTENT_URL)       ?: ""
        homepageUrl     = intent.getStringExtra(EXTRA_HOMEPAGE_URL)      ?: ""
        linkUrl         = intent.getStringExtra(EXTRA_LINK_URL)          ?: ""
        autoAccept      = intent.getBooleanExtra(EXTRA_AUTO_ACCEPT, false)

        buildUi()
        startRinging()

        // 채널 이미지 로드
        loadChannelImage(channelPublicId)

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
        pulseAnimator?.cancel()
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        scope.cancel()
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        AlarmPollingService.setFakeCallShowing(false)
        Log.d(TAG, "FakeCallActivity 종료 → isFakeCallShowing = false")
        super.onDestroy()
    }

    // ─────────────────────────────────────────────────────────────────────
    // 채널 이미지 비동기 로드 (API 호출)
    // ─────────────────────────────────────────────────────────────────────
    private fun loadChannelImage(publicId: String) {
        if (publicId.isEmpty()) return  // 기본 링고 아이콘 유지

        val prefs   = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
        val savedUrl = prefs.getString("base_url", "") ?: ""
        val baseUrl = if (savedUrl.isNotEmpty()) savedUrl else "https://ringo-server.pages.dev"

        scope.launch {
            try {
                val response = http.newCall(
                    Request.Builder()
                        .url("$baseUrl/api/channels/by-public-id/$publicId")
                        .get()
                        .build()
                ).execute()

                if (!response.isSuccessful) return@launch
                val body = response.body?.string() ?: return@launch
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: return@launch
                val imageUrl = data.optString("image_url", "")

                if (imageUrl.isEmpty()) return@launch

                val bitmap = if (imageUrl.startsWith("data:")) {
                    val base64Part = imageUrl.substringAfter(",")
                    val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                } else {
                    val imgResponse = http.newCall(
                        Request.Builder().url(imageUrl).get().build()
                    ).execute()
                    val imgBytes = imgResponse.body?.bytes() ?: return@launch
                    BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size)
                }

                if (bitmap != null) {
                    val circularBitmap = toCircularBitmap(bitmap)
                    withContext(Dispatchers.Main) {
                        // crossfade 전환
                        profileIcon?.apply {
                            alpha = 0f
                            setImageBitmap(circularBitmap)
                            scaleType = ImageView.ScaleType.CENTER_CROP
                            background = null
                            animate().alpha(1f).setDuration(400).start()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "채널 이미지 로드 실패: ${e.message}")
            }
        }
    }

    // Bitmap → 원형 Bitmap 변환
    private fun toCircularBitmap(src: Bitmap): Bitmap {
        val size   = minOf(src.width, src.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint  = Paint(Paint.ANTI_ALIAS_FLAG)
        val rect   = RectF(0f, 0f, size.toFloat(), size.toFloat())
        canvas.drawOval(rect, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val sx = (src.width - size) / 2f
        val sy = (src.height - size) / 2f
        canvas.drawBitmap(src, -sx, -sy, paint)
        return output
    }

    // ─────────────────────────────────────────────────────────────────────
    // UI 구성 (카카오톡 영상통화 수신 스타일)
    // ─────────────────────────────────────────────────────────────────────
    private fun buildUi() {
        val bgDark    = Color.BLACK
        val bgCard    = Color.parseColor("#222222")
        val textWhite = Color.WHITE
        val textGray  = Color.parseColor("#AAAAAA")
        val accentRed   = Color.parseColor("#FF3B30")
        val accentGreen = Color.parseColor("#34C759")

        // ── 루트: 어두운 배경 ──
        val root = FrameLayout(this).apply {
            setBackgroundColor(bgDark)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        // ── 상단 카드 영역 (카카오 스타일 다크 카드) ──
        val topCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            background = GradientDrawable().apply {
                setColor(bgCard)
                cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, dp(28f), dp(28f), dp(28f), dp(28f))
            }
            setPadding(dp(24).toInt(), dp(48).toInt(), dp(24).toInt(), dp(40).toInt())
        }

        // "RinGo 알람" 앱 타이틀
        topCard.addView(TextView(this).apply {
            text = "RinGo 알람"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(textGray)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(12).toInt())
        })

        // 채널명 (크게)
        topCard.addView(TextView(this).apply {
            text = channelName
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            setTextColor(textWhite)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(2).toInt())
        })

        // "연결 중" 상태 텍스트
        topCard.addView(TextView(this).apply {
            text = "연결 중"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(textGray)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(6).toInt())
        })

        // 연결 중 점 애니메이션 (● ● ●)
        val dotsLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(24).toInt())
        }
        val dotColor = Color.parseColor("#AAAAAA")
        val dotViews = mutableListOf<View>()
        (0 until 3).forEachIndexed { i, _ ->
            val color = dotColor
            if (i > 0) {
                dotsLayout.addView(View(this).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(8).toInt(), 1)
                })
            }
            val dot = View(this).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(color)
                }
                layoutParams = LinearLayout.LayoutParams(dp(6).toInt(), dp(6).toInt())
                alpha = 0.3f
            }
            dotViews.add(dot)
            dotsLayout.addView(dot)
        }
        topCard.addView(dotsLayout)

        // 점 애니메이션 시작
        startDotAnimation(dotViews)

        // ── 프로필 이미지 (100dp 원형) ──
        val profileSize = dp(100).toInt()
        val profileContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(profileSize + dp(4).toInt(), profileSize + dp(4).toInt()).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
        }

        // 프로필 이미지 (기본: 링고 아이콘)
        profileIcon = ImageView(this).apply {
            setImageResource(R.drawable.ringo_icon)
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#333333"))
                setStroke(dp(1).toInt(), Color.parseColor("#444444"))
            }
            clipToOutline = true
            outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(view: View, outline: android.graphics.Outline) {
                    outline.setOval(0, 0, view.width, view.height)
                }
            }
            layoutParams = FrameLayout.LayoutParams(profileSize, profileSize, Gravity.CENTER)
        }
        profileContainer.addView(profileIcon)

        topCard.addView(profileContainer)

        // ── 알람 타입 배지 (카카오 통화녹음 버튼 스타일) ──
        topCard.addView(TextView(this).apply {
            text = getMsgTypeLabel()
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(16f)
                setColor(Color.parseColor("#33FFFFFF"))
                setStroke(dp(1).toInt(), Color.parseColor("#55FFFFFF"))
            }
            setPadding(dp(16).toInt(), dp(8).toInt(), dp(16).toInt(), dp(8).toInt())
            val badgeParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(16).toInt()
            }
            layoutParams = badgeParams
        })

        // 상단 카드를 루트에 추가 (화면의 약 75% 높이)
        val displayHeight = resources.displayMetrics.heightPixels
        val topParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            (displayHeight * 0.72).toInt()
        ).apply { gravity = Gravity.TOP }
        root.addView(topCard, topParams)

        // ── 하단 버튼 영역 ──
        val btnLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        // 거절 버튼
        btnLayout.addView(createActionButton(accentRed, true) { handleDecline() })

        // 간격
        btnLayout.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(48).toInt(), 1)
        })

        // 수락 버튼
        btnLayout.addView(createActionButton(accentGreen, false) { handleAccept() })

        val btnParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(35).toInt()
        }
        root.addView(btnLayout, btnParams)

        setContentView(root)
    }

    // ── 액션 버튼 생성 (68dp 원형, 라벨 없음) ──
    private fun createActionButton(color: Int, isDecline: Boolean, onClick: () -> Unit): FrameLayout {
        val btnSize = dp(68).toInt()
        return FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(btnSize, btnSize)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(color)
            }
            setOnClickListener { onClick() }

            // vector drawable 아이콘 사용 (확실한 전화 아이콘)
            val iconView = ImageView(this@FakeCallActivity).apply {
                setImageResource(
                    if (isDecline) R.drawable.ic_call_decline
                    else R.drawable.ic_call_accept
                )
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                val iconPad = dp(17).toInt()
                setPadding(iconPad, iconPad, iconPad, iconPad)
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                )
            }
            addView(iconView)
        }
    }

    // 점 애니메이션 (카카오 스타일 연결 중...)
    private fun startDotAnimation(dots: List<View>) {
        fun animateDot(index: Int) {
            if (isFinishing) return
            val dot = dots[index]
            dot.animate()
                .alpha(1f)
                .setDuration(300)
                .withEndAction {
                    dot.animate()
                        .alpha(0.3f)
                        .setDuration(300)
                        .setStartDelay(200)
                        .withEndAction {
                            if (!isFinishing) {
                                animateDot((index + 1) % dots.size)
                            }
                        }
                        .start()
                }
                .start()
        }
        animateDot(0)
    }

    private fun getMsgTypeLabel(): String {
        return when (msgType) {
            "youtube" -> "📺 YouTube 알람"
            "audio"   -> "🎵 오디오 알람"
            "video"   -> "🎬 비디오 알람"
            else      -> "📎 파일 알람"
        }
    }

    private fun dp(dp: Float): Float = dp * resources.displayMetrics.density
    private fun dp(dp: Int): Float = dp.toFloat() * resources.displayMetrics.density

    // ─────────────────────────────────────────────────────────────────────
    // 벨소리 / 진동
    // ─────────────────────────────────────────────────────────────────────
    private fun startRinging() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(
                applicationContext, RingtoneManager.TYPE_RINGTONE
            ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ringtone = RingtoneManager.getRingtone(applicationContext, uri)?.also { rt ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    rt.isLooping = true
                    rt.audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setLegacyStreamType(AudioManager.STREAM_RING)
                        .build()
                }
                when (am.ringerMode) {
                    AudioManager.RINGER_MODE_NORMAL  -> rt.play()
                    AudioManager.RINGER_MODE_VIBRATE -> Unit
                    else -> Unit
                }
            }
        } catch (e: Exception) { Log.e(TAG, "벨소리 오류: ${e.message}") }

        if (am.ringerMode != AudioManager.RINGER_MODE_SILENT) {
            vibrator = (getSystemService(VIBRATOR_SERVICE) as? Vibrator)?.also { v ->
                val pattern = longArrayOf(0, 500, 500, 500, 500, 500)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(pattern, 0))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(pattern, 0)
                }
            }
        }
    }

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
        ringtone = null
        vibrator = null
    }

    // ─────────────────────────────────────────────────────────────────────
    // 수락 / 거절
    // ─────────────────────────────────────────────────────────────────────
    private fun handleAccept() {
        Log.d(TAG, "수락 → alarmId=$alarmId, msgType=$msgType, msgValue=$msgValue")
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "accepted")
        ContentPlayerActivity.start(
            context          = this,
            msgType          = msgType,
            msgValue         = msgValue,
            contentUrl       = contentUrl,
            channelName      = channelName,
            homepageUrl      = homepageUrl,
            channelPublicId  = channelPublicId,
            linkUrl          = linkUrl
        )
        finishAlarm()
    }

    private fun handleDecline() {
        Log.d(TAG, "거절 → alarmId=$alarmId")
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "declined")
        finishAlarm()
    }

    private fun finishAlarm() {
        CallForegroundService.stop(this)
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        nm.cancel(CallForegroundService.NOTIFICATION_ID)
        finish()
    }

    private fun recordAlarmStatus(id: Int, status: String) {
        val prefs = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
        val baseUrl = prefs.getString("base_url", "") ?: ""
        val token   = prefs.getString("session_token", "") ?: ""
        if (baseUrl.isEmpty() || token.isEmpty()) return
        scope.launch {
            try {
                val body = """{"alarm_id":$id,"status":"$status"}"""
                    .toRequestBody("application/json".toMediaType())
                http.newCall(
                    Request.Builder()
                        .url("$baseUrl/api/alarms/status")
                        .post(body)
                        .addHeader("Authorization", "Bearer $token")
                        .build()
                ).execute().close()
            } catch (e: Exception) { Log.e(TAG, "상태 전송 실패: ${e.message}") }
        }
    }
}
