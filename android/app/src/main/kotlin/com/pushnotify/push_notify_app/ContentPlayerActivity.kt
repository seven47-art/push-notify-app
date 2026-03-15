package com.pushnotify.push_notify_app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.webkit.*
import android.widget.*
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL

/**
 * ContentPlayerActivity
 *
 * 알람 수락 후 콘텐츠 재생 화면
 *
 * ┌────────────────────────────┐  ← 화면 너비 기준 16:9 비율 자동 계산
 * │  콘텐츠 실행 영역              │
 * │  (YouTube / Audio / Video) │
 * ├────────────────────────────┤  ← 나머지 공간 자동 채움
 * │  [채널 대표이미지 - 원형]       │
 * │  채널명                      │
 * │  🌐 홈페이지 버튼 (있을 때만)   │
 * │  🔴 종료 버튼                 │
 * └────────────────────────────┘
 */
class ContentPlayerActivity : Activity() {

    companion object {
        private const val TAG = "ContentPlayerActivity"

        const val EXTRA_MSG_TYPE          = "msg_type"
        const val EXTRA_MSG_VALUE         = "msg_value"
        const val EXTRA_CONTENT_URL       = "content_url"
        const val EXTRA_CHANNEL_NAME      = "channel_name"
        const val EXTRA_CHANNEL_IMAGE     = "channel_image"
        const val EXTRA_HOMEPAGE_URL      = "homepage_url"
        const val EXTRA_LINK_URL          = "link_url"
        const val EXTRA_CHANNEL_PUBLIC_ID = "channel_public_id"

        fun start(
            context: Context,
            msgType: String,
            msgValue: String,
            contentUrl: String,
            channelName: String,
            channelImage: String = "",
            homepageUrl: String = "",
            channelPublicId: String = "",
            linkUrl: String = ""
        ) {
            val intent = Intent(context, ContentPlayerActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_MSG_TYPE,          msgType)
                putExtra(EXTRA_MSG_VALUE,         msgValue)
                putExtra(EXTRA_CONTENT_URL,       contentUrl)
                putExtra(EXTRA_CHANNEL_NAME,      channelName)
                putExtra(EXTRA_CHANNEL_IMAGE,     channelImage)
                putExtra(EXTRA_HOMEPAGE_URL,      homepageUrl)
                putExtra(EXTRA_LINK_URL,          linkUrl)
                putExtra(EXTRA_CHANNEL_PUBLIC_ID, channelPublicId)
            }
            context.startActivity(intent)
        }
    }

    private var webView: WebView? = null
    private var mediaPlayer: MediaPlayer? = null
    private var videoView: VideoView? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 전체화면 + 화면 켜기 + 잠금화면 위에 표시 (잠금 해제 없이)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val msgType         = intent.getStringExtra(EXTRA_MSG_TYPE)          ?: "youtube"
        val msgValue        = intent.getStringExtra(EXTRA_MSG_VALUE)         ?: ""
        val contentUrl      = intent.getStringExtra(EXTRA_CONTENT_URL)       ?: ""
        val channelName     = intent.getStringExtra(EXTRA_CHANNEL_NAME)      ?: "알람"
        val channelImage    = intent.getStringExtra(EXTRA_CHANNEL_IMAGE)     ?: ""
        val homepageUrl     = intent.getStringExtra(EXTRA_HOMEPAGE_URL)      ?: ""
        val linkUrl         = intent.getStringExtra(EXTRA_LINK_URL)          ?: ""
        val channelPublicId = intent.getStringExtra(EXTRA_CHANNEL_PUBLIC_ID) ?: ""

        setContentView(buildUI(channelName, channelImage, msgType, msgValue, contentUrl, homepageUrl, channelPublicId, linkUrl))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUI(
        channelName: String,
        channelImage: String,
        msgType: String,
        msgValue: String,
        contentUrl: String,
        homepageUrl: String,
        channelPublicId: String,
        linkUrl: String = ""
    ): View {

        // ── 루트: 세로 LinearLayout ──
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ════════════════════════════════════════════════
        // 상단: 콘텐츠 재생 영역 — weight=1f (하단바 제외 전체 공간)
        // ════════════════════════════════════════════════
        // weight=1f 로 하단바를 제외한 전체 공간을 채움
        val playerParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        )

        // file 타입: 확장자로 실제 타입 판별 (Firebase Storage URL은 ?alt=media&token=... 포함하므로 쿼리파라미터 제거 후 비교)
        val effectiveType = if (msgType == "file" || msgType == "audio" || msgType == "video") {
            val rawUrl = contentUrl.ifEmpty { msgValue }
            val cleanUrl = rawUrl.substringBefore("?").lowercase()
            val audioExts = listOf(".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".wma")
            val videoExts = listOf(".mp4", ".mov", ".mkv", ".avi", ".wmv", ".m4v", ".webm")
            when {
                audioExts.any { cleanUrl.endsWith(it) } -> "audio"
                videoExts.any { cleanUrl.endsWith(it) } -> "video"
                // 확장자 판별 불가 시 원래 msg_type 유지 (youtube 등 다른 타입 보호)
                msgType == "audio" -> "audio"
                msgType == "video" -> "video"
                else -> "file"
            }
        } else msgType

        when (effectiveType) {

            // ── YouTube IFrame API 방식 (세이투두 youtubehelp.html 동일 로직) ──
            "youtube" -> {
                val videoId = extractYoutubeId(msgValue).ifEmpty { extractYoutubeId(contentUrl) }
                webView = WebView(this).apply {
                    layoutParams = playerParams
                    settings.apply {
                        // 세이투두 VideoPlayActivity WebView 설정과 완전 동일
                        javaScriptEnabled = true
                        @Suppress("DEPRECATION")
                        pluginState = WebSettings.PluginState.ON
                        javaScriptCanOpenWindowsAutomatically = true
                        setSupportMultipleWindows(true)
                        setSupportZoom(true)
                        builtInZoomControls = true
                        allowFileAccess = true
                        mediaPlaybackRequiresUserGesture = false
                    }
                    webChromeClient = object : WebChromeClient() {
                        // 전체화면(onShowCustomView) 지원
                        private var customView: View? = null
                        private var customViewCallback: CustomViewCallback? = null

                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            customView?.let { root.removeView(it) }
                            customView = view
                            customViewCallback = callback
                            // 전체화면: root 전체를 덮음
                            root.addView(view, ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            ))
                            webView?.visibility = View.GONE
                        }

                        override fun onHideCustomView() {
                            customView?.let { root.removeView(it) }
                            customView = null
                            customViewCallback?.onCustomViewHidden()
                            customViewCallback = null
                            webView?.visibility = View.VISIBLE
                        }

                        // window.prompt() 를 커스텀 다이얼로그로 교체 (URL 노출 방지)
                        override fun onJsPrompt(
                            view: WebView?,
                            url: String?,
                            message: String?,
                            defaultValue: String?,
                            result: JsPromptResult?
                        ): Boolean {
                            val ctx = this@ContentPlayerActivity
                            val input = EditText(ctx).apply {
                                inputType = android.text.InputType.TYPE_CLASS_TEXT or
                                        android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
                                hint = "비밀번호를 입력하세요"
                                setTextColor(Color.WHITE)
                                setHintTextColor(Color.parseColor("#64748B"))
                                background = GradientDrawable().apply {
                                    setColor(Color.parseColor("#1E293B"))
                                    cornerRadius = dp(10).toFloat()
                                    setStroke(dp(1), Color.parseColor("#334155"))
                                }
                                setPadding(dp(14), dp(12), dp(14), dp(12))
                            }
                            val container = LinearLayout(ctx).apply {
                                orientation = LinearLayout.VERTICAL
                                setPadding(dp(20), dp(8), dp(20), dp(4))
                                addView(input)
                            }
                            AlertDialog.Builder(ctx)
                                .setTitle("🔒 비밀번호 확인")
                                .setMessage(message ?: "비밀번호를 입력하세요")
                                .setView(container)
                                .setPositiveButton("확인") { _, _ ->
                                    result?.confirm(input.text.toString())
                                }
                                .setNegativeButton("취소") { _, _ ->
                                    result?.cancel()
                                }
                                .setOnCancelListener {
                                    result?.cancel()
                                }
                                .show()
                                .apply {
                                    // 다이얼로그 배경 다크 테마
                                    window?.setBackgroundDrawable(
                                        GradientDrawable().apply {
                                            setColor(Color.parseColor("#1E293B"))
                                            cornerRadius = dp(16).toFloat()
                                        }
                                    )
                                }
                            return true
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val url = request?.url?.toString() ?: return false
                            // youtube.com / youtu.be / googlevideo.com / ringo-server.pages.dev 은 WebView 내에서 처리
                            return if (url.contains("youtube.com") || url.contains("youtu.be")
                                || url.contains("googlevideo.com") || url.contains("ringo-server.pages.dev")) {
                                false
                            } else {
                                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
                                true
                            }
                        }
                    }
                    if (videoId.isNotEmpty()) {
                        // 세이투두와 동일한 loadUrl 방식
                        // saytodo.io/youtubehelp.html?id=VIDEO_ID → ringo-server.pages.dev/static/youtubehelp.html?id=VIDEO_ID
                        val prefs = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
                        val baseUrl = prefs.getString("base_url", "")
                            ?.takeIf { it.isNotEmpty() }
                            ?: "https://ringo-server.pages.dev"
                        loadUrl("$baseUrl/static/youtubehelp.html?id=$videoId")
                    } else {
                        // videoId 추출 실패 시 안내 메시지
                        val errorHtml = """
                            <!DOCTYPE html><html><head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>* { margin:0; padding:0; background:#000; } body { display:flex; align-items:center; justify-content:center; height:100vh; }</style>
                            </head><body>
                            <div style="color:#fff; font-size:14px; text-align:center; padding:20px; line-height:1.8;">
                                ⚠️ 영상 URL을 확인할 수 없습니다.<br><br>
                                올바른 YouTube URL을 등록해 주세요.<br>
                                (예: youtu.be/xxxxx 또는 youtube.com/watch?v=xxxxx)
                            </div>
                            </body></html>
                        """.trimIndent()
                        loadDataWithBaseURL("https://www.youtube.com", errorHtml, "text/html", "UTF-8", null)
                    }
                }
                root.addView(webView)
            }

            // ── 오디오 (MediaPlayer + 이퀄라이저 애니메이션) ──────────────────────────────
            "audio" -> {
                val audioUrl = contentUrl.ifEmpty { msgValue }

                // 배경: 딥 퍼플 그라디언트
                val audioContainer = FrameLayout(this).apply {
                    layoutParams = playerParams
                    background = GradientDrawable().apply {
                        gradientType = GradientDrawable.LINEAR_GRADIENT
                        orientation = GradientDrawable.Orientation.TOP_BOTTOM
                        colors = intArrayOf(
                            Color.parseColor("#1A0533"),
                            Color.parseColor("#0F0C29")
                        )
                    }
                }

                // 중앙 컨테이너 (이퀄라이저 + 상태 텍스트)
                val centerLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                }

                // ── 이퀄라이저 막대 컨테이너 ──
                val eqContainer = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        dp(60)
                    ).also { it.bottomMargin = dp(8) }
                }

                // 막대 색상 (보라 계열 그라디언트)
                val barColors = listOf(
                    "#7C3AED", "#8B5CF6", "#A78BFA", "#8B5CF6",
                    "#7C3AED", "#A78BFA", "#8B5CF6", "#7C3AED",
                    "#A78BFA", "#8B5CF6", "#7C3AED", "#8B5CF6"
                )
                val barCount = barColors.size
                val barWidth = dp(6)
                val barMargin = dp(3)
                val maxBarHeight = dp(50)
                val minBarHeight = dp(6)

                // 각 막대의 높이 애니메이터 저장 (재생/일시정지 제어용)
                val barAnimators = mutableListOf<ValueAnimator>()
                val barViews = mutableListOf<View>()

                barColors.forEachIndexed { index, colorHex ->
                    val bar = View(this).apply {
                        background = GradientDrawable().apply {
                            shape = GradientDrawable.RECTANGLE
                            cornerRadius = dp(3).toFloat()
                            setColor(Color.parseColor(colorHex))
                        }
                        layoutParams = LinearLayout.LayoutParams(barWidth, minBarHeight).also {
                            it.marginStart = if (index == 0) 0 else barMargin
                        }
                    }
                    eqContainer.addView(bar)
                    barViews.add(bar)

                    // 각 막대마다 다른 속도/진폭으로 위아래 애니메이션
                    val randomHeight = minBarHeight + (Math.random() * (maxBarHeight - minBarHeight)).toInt()
                    val duration = 300L + (index * 80L) + (Math.random() * 200).toLong()
                    val animator = ValueAnimator.ofInt(minBarHeight, randomHeight).apply {
                        this.duration = duration
                        repeatCount = ValueAnimator.INFINITE
                        repeatMode = ValueAnimator.REVERSE
                        interpolator = DecelerateInterpolator()
                        addUpdateListener { anim ->
                            val h = anim.animatedValue as Int
                            bar.layoutParams = (bar.layoutParams as LinearLayout.LayoutParams).also { lp ->
                                lp.height = h
                            }
                            bar.requestLayout()
                        }
                    }
                    barAnimators.add(animator)
                }
                centerLayout.addView(eqContainer)

                // 상태 텍스트
                val statusText = TextView(this).apply {
                    text = "오디오 로딩 중..."
                    textSize = 14f
                    setTextColor(Color.parseColor("#A78BFA"))
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).also { it.topMargin = dp(12) }
                }
                centerLayout.addView(statusText)
                audioContainer.addView(centerLayout)

                // 재생/일시정지 버튼
                val playBtn = TextView(this).apply {
                    text = "⏸ 일시정지"
                    textSize = 16f
                    setTextColor(Color.WHITE)
                    gravity = Gravity.CENTER
                    setPadding(dp(32), dp(14), dp(32), dp(14))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(30).toFloat()
                        setColor(Color.parseColor("#7C3AED"))
                    }
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    ).also { it.bottomMargin = dp(28) }
                }
                audioContainer.addView(playBtn)
                root.addView(audioContainer)

                // 이퀄라이저 시작 함수
                fun startEqualizer() {
                    barAnimators.forEachIndexed { i, anim ->
                        if (!anim.isRunning) {
                            anim.startDelay = (i * 40L)
                            anim.start()
                        }
                    }
                }
                // 이퀄라이저 정지 함수 (막대를 최소 높이로)
                fun stopEqualizer() {
                    barAnimators.forEach { it.cancel() }
                    barViews.forEach { bar ->
                        bar.layoutParams = (bar.layoutParams as LinearLayout.LayoutParams).also { lp ->
                            lp.height = minBarHeight
                        }
                        bar.requestLayout()
                    }
                }

                try {
                    mediaPlayer = MediaPlayer().apply {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .build()
                        )
                        setDataSource(audioUrl)
                        setOnPreparedListener { mp ->
                            statusText.text = "♪ 오디오 재생 중"
                            mp.start()
                            startEqualizer()
                        }
                        setOnErrorListener { _, _, _ ->
                            statusText.text = "재생 오류가 발생했습니다"
                            stopEqualizer()
                            true
                        }
                        setOnCompletionListener {
                            statusText.text = "재생 완료"
                            playBtn.text = "▶ 다시 재생"
                            stopEqualizer()
                        }
                        prepareAsync()
                    }
                    playBtn.setOnClickListener {
                        mediaPlayer?.let { mp ->
                            if (mp.isPlaying) {
                                mp.pause()
                                playBtn.text = "▶ 재생"
                                statusText.text = "일시정지"
                                stopEqualizer()
                            } else {
                                mp.start()
                                playBtn.text = "⏸ 일시정지"
                                statusText.text = "♪ 오디오 재생 중"
                                startEqualizer()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "MediaPlayer 오류: ${e.message}")
                    statusText.text = "오디오를 재생할 수 없습니다"
                    stopEqualizer()
                }
            }

            // ── 비디오 (VideoView) ────────────────────────────────
            "video" -> {
                val videoUrl = contentUrl.ifEmpty { msgValue }
                val videoContainer = FrameLayout(this).apply {
                    layoutParams = playerParams
                    setBackgroundColor(Color.BLACK)
                }
                videoView = VideoView(this).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        Gravity.CENTER
                    )
                    val mc = MediaController(context).apply { setAnchorView(this@apply) }
                    setMediaController(mc)
                    setVideoURI(Uri.parse(videoUrl))
                    setOnPreparedListener { mp -> mp.start(); mc.show(3000) }
                    setOnErrorListener { _, _, _ -> Log.e(TAG, "VideoView 재생 오류"); false }
                }
                videoContainer.addView(videoView)
                root.addView(videoContainer)
            }

            // ── 기타 파일 (지원 불가 안내) ────────────────────────
            else -> {
                val msgView = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    layoutParams = playerParams
                    setBackgroundColor(Color.parseColor("#0F0C29"))
                }
                msgView.addView(TextView(this).apply {
                    text = "⚠️"
                    textSize = 60f
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                })
                msgView.addView(TextView(this).apply {
                    text = "지원하지 않는 파일 형식입니다\n(mp3, mp4만 지원)"
                    textSize = 15f
                    setTextColor(Color.parseColor("#94A3B8"))
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                })
                root.addView(msgView)
            }
        }

        // ════════════════════════════════════════════════
        // 하단: 고정 바 — 가로 배치 (채널이미지 | 채널명 | 홈페이지아이콘 | X버튼)
        // ════════════════════════════════════════════════
        val bottomBarHeight = dp(72)
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#0D0D1A"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, bottomBarHeight
            )
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }

        // ── 채널 대표이미지 (원형, 48dp) ─────────────────────────
        val thumbSize = dp(48)
        val channelThumb = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#3D2F6E"))
            }
            setImageResource(R.drawable.ringo_icon)
            layoutParams = LinearLayout.LayoutParams(thumbSize, thumbSize).also {
                it.marginEnd = dp(10)
            }
        }
        bottomBar.addView(channelThumb)

        // 채널 이미지 로드 (직접 전달된 URL 우선, 없으면 publicId로 API 조회)
        if (channelImage.isNotEmpty()) {
            loadImageUrlIntoView(channelImage, channelThumb)
        } else if (channelPublicId.isNotEmpty()) {
            loadChannelImageIntoView(channelPublicId, channelThumb)
        }

        // ── 채널명 (weight=1f 로 남은 공간 채움) ─────────────────
        val channelNameView = TextView(this).apply {
            text = channelName
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also {
                it.marginEnd = dp(8)
            }
        }
        bottomBar.addView(channelNameView)

        // ── 링크 버튼 (우선순위: link_url → homepage_url → 없으면 숨김) ──────────
        val effectiveLinkUrl = when {
            linkUrl.isNotEmpty()      -> linkUrl
            homepageUrl.isNotEmpty()  -> homepageUrl
            else                      -> ""
        }
        if (effectiveLinkUrl.isNotEmpty()) {
            val fullLinkUrl = if (effectiveLinkUrl.startsWith("http")) effectiveLinkUrl else "https://$effectiveLinkUrl"
            val iconSize = dp(44)
            val linkBtn = ImageView(this).apply {
                setImageResource(R.drawable.link_icon)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#3B82F6"))
                }
                layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).also {
                    it.marginEnd = dp(8)
                }
                setOnClickListener {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fullLinkUrl)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        })
                    } catch (e: Exception) {
                        Log.e(TAG, "링크 열기 실패: ${e.message}")
                    }
                }
            }
            bottomBar.addView(linkBtn)
        }

        // ── X (종료) 버튼 ──────────────────────────────────────────
        val closeSize = dp(44)
        val closeBtn = ImageView(this).apply {
            setImageResource(R.drawable.close_icon)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(10), dp(10), dp(10), dp(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#FF3B30"))
            }
            layoutParams = LinearLayout.LayoutParams(closeSize, closeSize)
            setOnClickListener { closePlayer() }
        }
        bottomBar.addView(closeBtn)

        root.addView(bottomBar)
        return root
    }

    // ── 채널 이미지 API 로드 ──────────────────────────────────────
    private fun loadImageUrlIntoView(
        imageUrl: String,
        imageView: ImageView
    ) {
        scope.launch {
            try {
                val bitmap = withContext(Dispatchers.IO) {
                    val raw: Bitmap? = if (imageUrl.startsWith("data:")) {
                        val base64 = imageUrl.substringAfter(",")
                        val bytes  = Base64.decode(base64, Base64.DEFAULT)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    } else {
                        val imgConn = URL(imageUrl).openConnection() as HttpURLConnection
                        imgConn.connectTimeout = 5000
                        imgConn.readTimeout    = 5000
                        val bmp = BitmapFactory.decodeStream(imgConn.inputStream)
                        imgConn.disconnect()
                        bmp
                    }
                    raw?.let { toCircleBitmap(it) }
                }
                if (bitmap != null) {
                    imageView.background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.BLACK)
                    }
                    imageView.setImageBitmap(bitmap)
                }
            } catch (e: Exception) {
                Log.e(TAG, "채널 이미지 URL 로드 실패: ${e.message}")
            }
        }
    }

    private fun loadChannelImageIntoView(
        publicId: String,
        imageView: ImageView
    ) {
        val prefs   = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
        val baseUrl = prefs.getString("base_url", "")
            ?.takeIf { it.isNotEmpty() }
            ?: "https://ringo-server.pages.dev"

        scope.launch {
            try {
                val bitmap = withContext(Dispatchers.IO) {
                    val conn = URL("$baseUrl/api/channels/by-public-id/$publicId")
                        .openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000
                    conn.readTimeout    = 5000
                    val response = conn.inputStream.bufferedReader().readText()
                    conn.disconnect()

                    val jsonObj  = org.json.JSONObject(response)
                    if (!jsonObj.optBoolean("success", false)) return@withContext null
                    val imageUrl = jsonObj.optJSONObject("data")?.optString("image_url") ?: ""
                    if (imageUrl.isEmpty()) return@withContext null

                    val raw: Bitmap? = if (imageUrl.startsWith("data:")) {
                        val base64 = imageUrl.substringAfter(",")
                        val bytes  = Base64.decode(base64, Base64.DEFAULT)
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    } else {
                        val imgConn = URL(imageUrl).openConnection() as HttpURLConnection
                        imgConn.connectTimeout = 5000
                        imgConn.readTimeout    = 5000
                        val bmp = BitmapFactory.decodeStream(imgConn.inputStream)
                        imgConn.disconnect()
                        bmp
                    }
                    // rounded=true 이면 원형, false면 원본 비트맵 그대로 (사각형은 clipToOutline으로 처리)
                    // 항상 원형으로 처리
                    raw?.let { toCircleBitmap(it) }
                }

                if (bitmap != null) {
                    imageView.background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.BLACK)
                    }
                    imageView.setImageBitmap(bitmap)
                }
            } catch (e: Exception) {
                Log.e(TAG, "채널 이미지 로드 실패: ${e.message}")
            }
        }
    }

    private fun toCircleBitmap(src: Bitmap): Bitmap {
        val size   = minOf(src.width, src.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint  = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val dx = ((size - src.width)  / 2).toFloat()
        val dy = ((size - src.height) / 2).toFloat()
        canvas.drawBitmap(src, dx, dy, paint)
        return output
    }

    private fun extractYoutubeId(url: String): String {
        if (url.length == 11 && !url.startsWith("http")) return url
        val m = Regex("(?:v=|youtu\\.be/|embed/|shorts/|live/)([A-Za-z0-9_-]{11})").find(url)
        return m?.groupValues?.get(1) ?: ""
    }

    private fun closePlayer() {
        webView?.apply { stopLoading(); loadUrl("about:blank"); destroy() }
        webView = null
        mediaPlayer?.apply { if (isPlaying) stop(); release() }
        mediaPlayer = null
        videoView?.stopPlayback()
        videoView = null
        scope.cancel()
        finish()
    }

    override fun onDestroy() { closePlayer(); super.onDestroy() }
    override fun onBackPressed() { closePlayer() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()
}
