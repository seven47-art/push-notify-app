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
 * FakeCallActivity v1.0.55
 * - 카카오톡 전화 스타일 UI
 * - 상단: 발신자 이름 + "RinGo 알람" 부제목
 * - 중앙: 채널 대표 이미지 원형 아이콘 (없으면 링고 기본 아이콘) + 파동 링 애니메이션
 * - 하단: 거절(빨강 왼쪽) / 수락(초록 오른쪽) 버튼
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
    private var rippleAnimators = mutableListOf<Animator>()

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

        // 채널 이미지 로드 (public_id 있으면 API 호출, 없으면 바로 링고 아이콘)
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
        rippleAnimators.forEach { it.cancel() }
        rippleAnimators.clear()
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        scope.cancel()
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    // ─────────────────────────────────────────────────────────────────────
    // 채널 이미지 비동기 로드 (API 호출)
    // ─────────────────────────────────────────────────────────────────────
    private fun loadChannelImage(publicId: String) {
        val prefs   = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
        val savedUrl = prefs.getString("base_url", "") ?: ""
        // base_url이 저장되지 않은 경우 고정 서버 URL을 폴백으로 사용
        val baseUrl = if (savedUrl.isNotEmpty()) savedUrl else "https://ringo-server.pages.dev"

        // public_id 없으면 바로 링고 아이콘
        if (publicId.isEmpty()) {
            showRingoIcon()
            return
        }

        scope.launch {
            try {
                val response = http.newCall(
                    Request.Builder()
                        .url("$baseUrl/api/channels/by-public-id/$publicId")
                        .get()
                        .build()
                ).execute()

                if (!response.isSuccessful) {
                    withContext(Dispatchers.Main) { showRingoIcon() }
                    return@launch
                }
                val body = response.body?.string() ?: run {
                    withContext(Dispatchers.Main) { showRingoIcon() }
                    return@launch
                }
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: run {
                    withContext(Dispatchers.Main) { showRingoIcon() }
                    return@launch
                }
                val imageUrl = data.optString("image_url", "")

                if (imageUrl.isNotEmpty()) {
                    // base64 데이터 URL 파싱 (data:image/jpeg;base64,xxxx)
                    val bitmap = if (imageUrl.startsWith("data:")) {
                        val base64Part = imageUrl.substringAfter(",")
                        val bytes = Base64.decode(base64Part, Base64.DEFAULT)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    } else {
                        // 일반 URL인 경우
                        val imgResponse = http.newCall(
                            Request.Builder().url(imageUrl).get().build()
                        ).execute()
                        val imgBytes = imgResponse.body?.bytes() ?: run {
                            withContext(Dispatchers.Main) { showRingoIcon() }
                            return@launch
                        }
                        BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size)
                    }

                    if (bitmap != null) {
                        val circularBitmap = toCircularBitmap(bitmap)
                        withContext(Dispatchers.Main) {
                            profileIcon?.apply {
                                background = GradientDrawable().apply {
                                    shape = GradientDrawable.OVAL
                                    setColor(Color.TRANSPARENT)
                                }
                                setImageBitmap(circularBitmap)
                                scaleType = ImageView.ScaleType.CENTER_CROP
                            }
                        }
                    } else {
                        withContext(Dispatchers.Main) { showRingoIcon() }
                    }
                } else {
                    // image_url이 비어있으면 링고 아이콘 표시
                    withContext(Dispatchers.Main) { showRingoIcon() }
                }
            } catch (e: Exception) {
                Log.e(TAG, "채널 이미지 로드 실패: ${e.message}")
                withContext(Dispatchers.Main) { showRingoIcon() }
            }
        }
    }

    // 내장 링고 아이콘 표시
    private fun showRingoIcon() {
        profileIcon?.apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#FEE500"))
            }
            setImageResource(R.drawable.ringo_icon)
            scaleType = ImageView.ScaleType.CENTER_CROP
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
    // UI 구성 (카카오톡 전화 스타일)
    // ─────────────────────────────────────────────────────────────────────
    private fun buildUi() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#1A1A2E"))  // 카카오 스타일 어두운 배경
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        // ── 중앙 컨텐츠 (이름 + 아이콘 + 파동) ──────────────────────────
        val centerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER_HORIZONTAL
        }

        // 수신 타입 텍스트 (상단 안내)
        val incomingLabel = TextView(this).apply {
            text      = "RinGo 알람"
            textSize  = 14f
            setTextColor(Color.parseColor("#AAAAAA"))
            gravity   = Gravity.CENTER
            setPadding(0, 0, 0, dpToPx(8))
        }

        // 발신자 이름
        val nameText = TextView(this).apply {
            text     = channelName
            textSize = 28f
            setTextColor(Color.WHITE)
            gravity  = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dpToPx(6))
        }

        // "전화 수신 중" 상태 텍스트
        val statusText = TextView(this).apply {
            text      = "전화 수신 중..."
            textSize  = 15f
            setTextColor(Color.parseColor("#AAAAAA"))
            gravity   = Gravity.CENTER
            setPadding(0, 0, 0, dpToPx(40))
        }

        // 프로필 아이콘 컨테이너 (파동 + 원형 아이콘)
        val profileContainer = FrameLayout(this).apply {
            val size = dpToPx(220)
            layoutParams = LinearLayout.LayoutParams(size, size).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dpToPx(50)
            }
        }

        val iconSize = dpToPx(130)

        // 파동 원 3개
        val rippleColors = listOf(
            Color.parseColor("#3A3A5C"),
            Color.parseColor("#2D2D4E"),
            Color.parseColor("#232340")
        )
        val ripleSizes = listOf(dpToPx(210), dpToPx(180), dpToPx(150))
        val rippleViews = ripleSizes.mapIndexed { i, size ->
            View(this).apply {
                background = createCircleDrawable(rippleColors[i])
                alpha = 0f
                layoutParams = FrameLayout.LayoutParams(size, size, Gravity.CENTER)
            }
        }
        rippleViews.forEach { profileContainer.addView(it) }

        // 프로필 원형 아이콘 (기본: 링고 아이콘 / API 응답 후 채널 이미지로 교체)
        profileIcon = ImageView(this).apply {
            val drawable = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#FEE500"))  // 기본 카카오 노란색
            }
            background = drawable
            setImageDrawable(createPhoneIconDrawable())
            scaleType = ImageView.ScaleType.CENTER
            layoutParams = FrameLayout.LayoutParams(iconSize, iconSize, Gravity.CENTER)
        }
        profileContainer.addView(profileIcon)

        // 파동 애니메이션 시작
        startRippleAnimation(rippleViews)

        centerLayout.addView(incomingLabel)
        centerLayout.addView(nameText)
        centerLayout.addView(statusText)
        centerLayout.addView(profileContainer)

        // ── 하단 버튼 (거절 왼쪽 / 수락 오른쪽) ─────────────────────────
        val btnLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity     = Gravity.CENTER
            weightSum   = 2f
        }

        // 거절 버튼
        val declineBtn = createCallButton(
            iconColor  = Color.parseColor("#FF3B30"),
            iconType   = "decline",
            label      = "거절"
        ) { handleDecline() }

        // 수락 버튼
        val acceptBtn = createCallButton(
            iconColor  = Color.parseColor("#34C759"),
            iconType   = "accept",
            label      = "수락"
        ) { handleAccept() }

        val btnParam = LinearLayout.LayoutParams(0,
            LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dpToPx(30)
            marginEnd   = dpToPx(30)
        }
        declineBtn.layoutParams = btnParam
        acceptBtn.layoutParams  = LinearLayout.LayoutParams(
            btnParam.width, btnParam.height, btnParam.weight
        ).apply {
            marginStart = dpToPx(30)
            marginEnd   = dpToPx(30)
        }

        btnLayout.addView(declineBtn)
        btnLayout.addView(acceptBtn)

        // ── 루트에 배치 ───────────────────────────────────────────────
        // 중앙 콘텐츠
        val centerParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER_VERTICAL
            topMargin = dpToPx(-40)
        }
        root.addView(centerLayout, centerParams)

        // 하단 버튼
        val btnParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity      = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            bottomMargin = dpToPx(60)
        }
        root.addView(btnLayout, btnParams)

        setContentView(root)
    }

    // 파동(Ripple) 애니메이션
    private fun startRippleAnimation(views: List<View>) {
        views.forEachIndexed { index, view ->
            val delay = (index * 400L)
            val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 0.5f, 1f)
            val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 0.5f, 1f)
            val alpha  = ObjectAnimator.ofFloat(view, "alpha", 0.8f, 0f)
            AnimatorSet().apply {
                playTogether(scaleX, scaleY, alpha)
                duration    = 1500L
                startDelay  = delay
                interpolator = AccelerateDecelerateInterpolator()
                addListener(object : android.animation.AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        view.scaleX = 0.5f
                        view.scaleY = 0.5f
                        view.alpha  = 0f
                        start()  // 반복
                    }
                })
                rippleAnimators.add(this)
                start()
            }
        }
    }

    // 전화 아이콘 Drawable 생성
    private fun createPhoneIconDrawable(): Drawable {
        return object : Drawable() {
            override fun draw(canvas: Canvas) {
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.parseColor("#1A1A2E")
                    style = Paint.Style.FILL
                }
                val b = bounds
                val cx = b.exactCenterX()
                val cy = b.exactCenterY()
                val r  = b.width() * 0.28f

                val path = Path().apply {
                    // 간단한 전화기 모양
                    moveTo(cx - r * 0.8f, cy - r * 1.2f)
                    cubicTo(cx - r, cy - r * 1.5f, cx - r * 1.5f, cy - r, cx - r * 1.2f, cy - r * 0.5f)
                    lineTo(cx - r * 0.6f, cy + r * 0.1f)
                    cubicTo(cx - r * 0.3f, cy + r * 0.4f, cx, cy + r * 0.3f, cx + r * 0.3f, cy + r * 0.6f)
                    lineTo(cx + r, cy + r * 1.2f)
                    cubicTo(cx + r * 1.5f, cy + r * 1.5f, cx + r, cy + r * 2f, cx + r * 0.5f, cy + r * 1.8f)
                    cubicTo(cx - r * 1.5f, cy + r * 1.2f, cx - r * 2.2f, cy - r * 0.5f, cx - r * 0.8f, cy - r * 1.2f)
                    close()
                }
                canvas.drawPath(path, paint)
            }
            override fun setAlpha(alpha: Int) {}
            override fun setColorFilter(cf: ColorFilter?) {}
            @Suppress("OVERRIDE_DEPRECATION")
            override fun getOpacity() = PixelFormat.TRANSLUCENT
        }
    }

    // 버튼 생성 헬퍼
    private fun createCallButton(
        iconColor: Int,
        iconType: String,
        label: String,
        onClick: () -> Unit
    ): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setOnClickListener { onClick() }

            // 원형 버튼
            val circle = ImageView(this@FakeCallActivity).apply {
                background = GradientDrawable().apply {
                    shape    = GradientDrawable.OVAL
                    setColor(iconColor)
                }
                val phoneDrawable = if (iconType == "decline") {
                    createEndCallDrawable(Color.WHITE)
                } else {
                    createAcceptCallDrawable(Color.WHITE)
                }
                setImageDrawable(phoneDrawable)
                scaleType = ImageView.ScaleType.CENTER
                val btnSize = dpToPx(68)
                layoutParams = LinearLayout.LayoutParams(btnSize, btnSize)
            }

            // 버튼 레이블
            val labelText = TextView(this@FakeCallActivity).apply {
                text      = label
                textSize  = 13f
                setTextColor(Color.parseColor("#CCCCCC"))
                gravity   = Gravity.CENTER
                setPadding(0, dpToPx(8), 0, 0)
            }

            addView(circle)
            addView(labelText)
        }
    }

    // 통화 종료(거절) 아이콘
    private fun createEndCallDrawable(color: Int): Drawable {
        return object : Drawable() {
            override fun draw(canvas: Canvas) {
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    this.color = color
                    style = Paint.Style.FILL
                }
                val b  = bounds
                val cx = b.exactCenterX()
                val cy = b.exactCenterY()
                val r  = b.width() * 0.22f
                // 수평 전화기 (끊기 아이콘)
                val path = Path().apply {
                    moveTo(cx - r * 1.8f, cy + r * 0.3f)
                    cubicTo(cx - r * 1.8f, cy - r * 1.2f, cx + r * 1.8f, cy - r * 1.2f, cx + r * 1.8f, cy + r * 0.3f)
                    lineTo(cx + r, cy + r * 0.3f)
                    cubicTo(cx + r, cy - r * 0.3f, cx + r * 0.3f, cy - r * 0.6f, cx, cy - r * 0.6f)
                    cubicTo(cx - r * 0.3f, cy - r * 0.6f, cx - r, cy - r * 0.3f, cx - r, cy + r * 0.3f)
                    close()
                }
                canvas.save()
                canvas.rotate(135f, cx, cy)
                canvas.drawPath(path, paint)
                canvas.restore()
            }
            override fun setAlpha(alpha: Int) {}
            override fun setColorFilter(cf: ColorFilter?) {}
            @Suppress("OVERRIDE_DEPRECATION")
            override fun getOpacity() = PixelFormat.TRANSLUCENT
        }
    }

    // 통화 수락 아이콘
    private fun createAcceptCallDrawable(color: Int): Drawable {
        return object : Drawable() {
            override fun draw(canvas: Canvas) {
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    this.color = color
                    style = Paint.Style.FILL
                }
                val b  = bounds
                val cx = b.exactCenterX()
                val cy = b.exactCenterY()
                val r  = b.width() * 0.22f
                val path = Path().apply {
                    moveTo(cx - r * 1.8f, cy + r * 0.3f)
                    cubicTo(cx - r * 1.8f, cy - r * 1.2f, cx + r * 1.8f, cy - r * 1.2f, cx + r * 1.8f, cy + r * 0.3f)
                    lineTo(cx + r, cy + r * 0.3f)
                    cubicTo(cx + r, cy - r * 0.3f, cx + r * 0.3f, cy - r * 0.6f, cx, cy - r * 0.6f)
                    cubicTo(cx - r * 0.3f, cy - r * 0.6f, cx - r, cy - r * 0.3f, cx - r, cy + r * 0.3f)
                    close()
                }
                canvas.drawPath(path, paint)
            }
            override fun setAlpha(alpha: Int) {}
            override fun setColorFilter(cf: ColorFilter?) {}
            @Suppress("OVERRIDE_DEPRECATION")
            override fun getOpacity() = PixelFormat.TRANSLUCENT
        }
    }

    private fun createCircleDrawable(color: Int): Drawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(color)
        }
    }

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
                    else -> Unit  // SILENT
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
        // ContentPlayerActivity로 바로 이동 (콘텐츠 재생 화면)
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

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()
}
