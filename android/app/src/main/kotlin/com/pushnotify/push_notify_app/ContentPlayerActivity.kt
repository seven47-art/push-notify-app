package com.pushnotify.push_notify_app

import android.annotation.SuppressLint
import android.app.Activity
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
        const val EXTRA_HOMEPAGE_URL      = "homepage_url"
        const val EXTRA_CHANNEL_PUBLIC_ID = "channel_public_id"

        fun start(
            context: Context,
            msgType: String,
            msgValue: String,
            contentUrl: String,
            channelName: String,
            homepageUrl: String = "",
            channelPublicId: String = ""
        ) {
            val intent = Intent(context, ContentPlayerActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_MSG_TYPE,          msgType)
                putExtra(EXTRA_MSG_VALUE,         msgValue)
                putExtra(EXTRA_CONTENT_URL,       contentUrl)
                putExtra(EXTRA_CHANNEL_NAME,      channelName)
                putExtra(EXTRA_HOMEPAGE_URL,      homepageUrl)
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
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
        // 잠금화면 위에서도 키가드(잠금) 무시하고 표시
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            val keyguardManager = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        }

        val msgType         = intent.getStringExtra(EXTRA_MSG_TYPE)          ?: "youtube"
        val msgValue        = intent.getStringExtra(EXTRA_MSG_VALUE)         ?: ""
        val contentUrl      = intent.getStringExtra(EXTRA_CONTENT_URL)       ?: ""
        val channelName     = intent.getStringExtra(EXTRA_CHANNEL_NAME)      ?: "알람"
        val homepageUrl     = intent.getStringExtra(EXTRA_HOMEPAGE_URL)      ?: ""
        val channelPublicId = intent.getStringExtra(EXTRA_CHANNEL_PUBLIC_ID) ?: ""

        setContentView(buildUI(channelName, msgType, msgValue, contentUrl, homepageUrl, channelPublicId))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUI(
        channelName: String,
        msgType: String,
        msgValue: String,
        contentUrl: String,
        homepageUrl: String,
        channelPublicId: String
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
        // 상단: 콘텐츠 재생 영역 — 화면 너비 기준 16:9 높이 고정
        // ════════════════════════════════════════════════
        val screenWidth = resources.displayMetrics.widthPixels
        val playerHeight = screenWidth * 9 / 16          // 16:9 비율
        val playerParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, playerHeight
        )

        // file 타입: 확장자로 실제 타입 판별
        val effectiveType = if (msgType == "file") {
            val url = contentUrl.ifEmpty { msgValue }
            when {
                url.endsWith(".mp3", ignoreCase = true) -> "audio"
                url.endsWith(".mp4", ignoreCase = true) -> "video"
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

            // ── 오디오 (MediaPlayer) ──────────────────────────────
            "audio" -> {
                val audioUrl = contentUrl.ifEmpty { msgValue }
                val audioContainer = FrameLayout(this).apply {
                    layoutParams = playerParams
                    setBackgroundColor(Color.parseColor("#0F0C29"))
                }
                val statusText = TextView(this).apply {
                    text = "오디오 로딩 중..."
                    textSize = 15f
                    setTextColor(Color.parseColor("#94A3B8"))
                    gravity = Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.CENTER
                    )
                }
                audioContainer.addView(statusText)

                val playBtn = TextView(this).apply {
                    text = "⏸ 일시정지"
                    textSize = 16f
                    setTextColor(Color.WHITE)
                    gravity = Gravity.CENTER
                    setPadding(dp(32), dp(14), dp(32), dp(14))
                    background = GradientDrawable().apply {
                        cornerRadius = dp(30).toFloat()
                        setColor(Color.parseColor("#6D28D9"))
                    }
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        Gravity.CENTER or Gravity.BOTTOM
                    ).also { it.bottomMargin = dp(24) }
                }
                audioContainer.addView(playBtn)
                root.addView(audioContainer)

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
                            statusText.text = "오디오 재생 중"
                            mp.start()
                        }
                        setOnErrorListener { _, _, _ ->
                            statusText.text = "재생 오류가 발생했습니다"
                            true
                        }
                        setOnCompletionListener {
                            statusText.text = "재생 완료"
                            playBtn.text = "▶ 다시 재생"
                        }
                        prepareAsync()
                    }
                    playBtn.setOnClickListener {
                        mediaPlayer?.let { mp ->
                            if (mp.isPlaying) {
                                mp.pause(); playBtn.text = "▶ 재생"; statusText.text = "일시정지"
                            } else {
                                mp.start(); playBtn.text = "⏸ 일시정지"; statusText.text = "오디오 재생 중"
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "MediaPlayer 오류: ${e.message}")
                    statusText.text = "오디오를 재생할 수 없습니다"
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
        // 하단: 채널 정보 영역 — 나머지 공간 자동 채움 (weight=1f)
        // ════════════════════════════════════════════════
        val infoPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(Color.parseColor("#0D0D1A"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
            setPadding(dp(20), dp(16), dp(20), dp(20))
        }

        // ── 채널 대표이미지 (원형) ─────────────────────────────────
        val thumbSize = dp(100)
        val channelThumb = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(thumbSize, thumbSize).also {
                it.gravity = Gravity.CENTER_HORIZONTAL
            }
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#3D2F6E"))
            }
            setImageResource(R.drawable.ringo_icon)
        }
        infoPanel.addView(channelThumb)

        // 채널 이미지 비동기 로드
        if (channelPublicId.isNotEmpty()) {
            loadChannelImageIntoView(channelPublicId, channelThumb)
        }

        // ── 채널명 ────────────────────────────────────────────────
        infoPanel.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(12))
        })
        infoPanel.addView(TextView(this).apply {
            text = channelName
            textSize = 18f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })

        // ── Spacer ────────────────────────────────────────────────
        infoPanel.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, 0, 1f)
        })

        // ── 종료 버튼 + 홈페이지 버튼 묶음 (홈페이지 버튼이 종료 버튼 바로 위) ──
        // 홈페이지 버튼 (있을 때만)
        if (homepageUrl.isNotEmpty()) {
            val hpUrl = if (homepageUrl.startsWith("http")) homepageUrl else "https://$homepageUrl"
            infoPanel.addView(TextView(this).apply {
                text = "🌐  $homepageUrl"
                textSize = 14f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(dp(20), dp(12), dp(20), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(10).toFloat()
                    setColor(Color.parseColor("#2563EB"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                setOnClickListener {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(hpUrl)).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        })
                    } catch (e: Exception) {
                        Log.e(TAG, "홈페이지 열기 실패: ${e.message}")
                    }
                }
            })
            infoPanel.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(1, dp(12))
            })
        }

        // ── 종료 버튼 ─────────────────────────────────────────────
        val closeRow = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        val closeCircle = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#EF4444"))
            }
            val size = dp(60)
            layoutParams = LinearLayout.LayoutParams(size, size).also {
                it.gravity = Gravity.CENTER_HORIZONTAL
            }
            setPadding(dp(13), dp(13), dp(13), dp(13))
            setOnClickListener { closePlayer() }
        }
        closeRow.addView(closeCircle)
        closeRow.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(4))
        })
        closeRow.addView(TextView(this).apply {
            text = "종료"
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        infoPanel.addView(closeRow)

        root.addView(infoPanel)
        return root
    }

    // ── 채널 이미지 API 로드 ──────────────────────────────────────
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
        val m = Regex("(?:v=|youtu\\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})").find(url)
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
