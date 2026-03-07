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
 * ┌────────────────────────────┐
 * │  상단: 채널 이미지(원형) + 채널명   │
 * ├────────────────────────────┤
 * │  메시지 소스 재생 영역           │
 * │  - youtube  → YouTube 웹 버전 (WebView)
 * │  - audio    → MediaPlayer (mp3) + 채널 이미지
 * │  - video    → VideoView (mp4)
 * │  - file     → 확장자 감지 후 audio/video 분기
 * ├────────────────────────────┤
 * │  🌐 홈페이지 버튼 (있을 때만)     │
 * ├────────────────────────────┤
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

        // 전체화면 + 화면 켜기
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

        // 루트 컨테이너
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ── 상단 채널 바 (이미지 원형 + 채널명) ──────────────────────
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#1A1035"))
            setPadding(dp(14), dp(10), dp(16), dp(10))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // 채널 이미지 (원형 ImageView)
        val channelIconSize = dp(40)
        val channelIcon = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(channelIconSize, channelIconSize).also {
                it.marginEnd = dp(10)
            }
            scaleType = ImageView.ScaleType.CENTER_CROP
            // 기본: 회색 원 배경
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#3D2F6E"))
            }
            // 기본 아이콘 (로딩 전)
            setImageResource(R.drawable.ringo_icon)
        }
        topBar.addView(channelIcon)

        // 채널명 텍스트
        topBar.addView(TextView(this).apply {
            text = channelName
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            )
        })
        root.addView(topBar)

        // ── 채널 이미지 비동기 로드 ────────────────────────────────
        if (channelPublicId.isNotEmpty()) {
            loadChannelImageIntoView(channelPublicId, channelIcon)
        }

        // ── 재생 영역 (타입에 따라 분기) ─────────────────────────
        val playerParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
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

            // ── YouTube IFrame Embed ───────────────────────────────────
            "youtube" -> {
                val videoId = extractYoutubeId(msgValue).ifEmpty { extractYoutubeId(contentUrl) }
                webView = WebView(this).apply {
                    layoutParams = playerParams
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        userAgentString = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                        cacheMode = WebSettings.LOAD_DEFAULT
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {}
                        override fun onHideCustomView() {}
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val url = request?.url?.toString() ?: return false
                            return if (url.contains("youtube.com") || url.contains("youtu.be") || url.contains("googlevideo.com")) {
                                false
                            } else {
                                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
                                true
                            }
                        }
                    }
                    if (videoId.isNotEmpty()) {
                        val html = """
                            <!DOCTYPE html><html><head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>*{margin:0;padding:0;background:#000;} iframe{width:100%;height:100vh;border:none;}</style>
                            </head><body>
                            <iframe src="https://www.youtube.com/embed/$videoId?autoplay=1&playsinline=1&rel=0&modestbranding=1"
                                allow="autoplay; encrypted-media" allowfullscreen></iframe>
                            </body></html>
                        """.trimIndent()
                        loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null)
                    } else {
                        val fallbackUrl = if (msgValue.startsWith("http")) msgValue
                                         else if (contentUrl.startsWith("http")) contentUrl
                                         else "https://m.youtube.com"
                        loadUrl(fallbackUrl)
                    }
                }
                root.addView(webView)
            }

            // ── 오디오 (MediaPlayer) + 채널 대표이미지 ──────────────
            "audio" -> {
                val audioUrl = contentUrl.ifEmpty { msgValue }
                val audioContainer = FrameLayout(this).apply {
                    layoutParams = playerParams
                    setBackgroundColor(Color.parseColor("#0F0C29"))
                }

                val audioLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                }

                // 채널 대표이미지 (오디오 재생화면 중앙) - 큰 원형
                val audioIconSize = dp(120)
                val audioChannelIcon = ImageView(this).apply {
                    layoutParams = LinearLayout.LayoutParams(audioIconSize, audioIconSize).also {
                        it.gravity = Gravity.CENTER_HORIZONTAL
                    }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.parseColor("#3D2F6E"))
                    }
                    setImageResource(R.drawable.ringo_icon)
                }
                audioLayout.addView(audioChannelIcon)
                audioLayout.addView(View(this).apply {
                    layoutParams = LinearLayout.LayoutParams(1, dp(20))
                })

                // 채널 이미지 비동기 로드 (오디오 화면용)
                if (channelPublicId.isNotEmpty()) {
                    loadChannelImageIntoView(channelPublicId, audioChannelIcon)
                }

                // 상태 텍스트
                val statusText = TextView(this).apply {
                    text = "오디오 로딩 중..."
                    textSize = 15f
                    setTextColor(Color.parseColor("#94A3B8"))
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                }
                audioLayout.addView(statusText)
                audioLayout.addView(View(this).apply {
                    layoutParams = LinearLayout.LayoutParams(1, dp(24))
                })

                // 재생/일시정지 버튼
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
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).also { it.gravity = Gravity.CENTER_HORIZONTAL }
                }
                audioLayout.addView(playBtn)
                audioContainer.addView(audioLayout)
                root.addView(audioContainer)

                // MediaPlayer 초기화
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
                                mp.pause()
                                playBtn.text = "▶ 재생"
                                statusText.text = "일시정지"
                            } else {
                                mp.start()
                                playBtn.text = "⏸ 일시정지"
                                statusText.text = "오디오 재생 중"
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
                    val mc = MediaController(context).apply {
                        setAnchorView(this@apply)
                    }
                    setMediaController(mc)
                    setVideoURI(Uri.parse(videoUrl))
                    setOnPreparedListener { mp ->
                        mp.start()
                        mc.show(3000)
                    }
                    setOnErrorListener { _, _, _ ->
                        Log.e(TAG, "VideoView 재생 오류")
                        false
                    }
                }
                videoContainer.addView(videoView)
                root.addView(videoContainer)
            }

            // ── 기타 파일 (지원 불가 안내) ─────────────────────────
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

        // ── 하단 영역 (홈페이지 버튼 + 종료 버튼) ─────────────────
        val bottomArea = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0D0D1A"))
            setPadding(dp(20), dp(16), dp(20), dp(24))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        // 홈페이지 URL 버튼 (있을 때만)
        if (homepageUrl.isNotEmpty()) {
            val hpUrl = if (homepageUrl.startsWith("http")) homepageUrl else "https://$homepageUrl"
            bottomArea.addView(TextView(this).apply {
                text = "🌐  $homepageUrl"
                textSize = 14f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(dp(20), dp(14), dp(20), dp(14))
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
            bottomArea.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams(1, dp(14))
            })
        }

        // 종료 버튼
        val closeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
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
            layoutParams = LinearLayout.LayoutParams(size, size)
            setPadding(dp(13), dp(13), dp(13), dp(13))
            setOnClickListener { closePlayer() }
        }
        closeRow.addView(closeCircle)
        bottomArea.addView(closeRow)
        bottomArea.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(6))
        })
        bottomArea.addView(TextView(this).apply {
            text = "종료"
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        })
        root.addView(bottomArea)

        return root
    }

    // ── 채널 이미지 API 로드 (FakeCallActivity와 동일 로직) ──────────
    private fun loadChannelImageIntoView(publicId: String, imageView: ImageView) {
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

                    val jsonObj = org.json.JSONObject(response)
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
                    raw?.let { toCircleBitmap(it) }
                }

                if (bitmap != null) {
                    imageView.background = null
                    imageView.setImageBitmap(bitmap)
                }
                // bitmap == null 이면 기본 ringo_icon 유지
            } catch (e: Exception) {
                Log.e(TAG, "채널 이미지 로드 실패: ${e.message}")
                // 기본 ringo_icon 유지
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
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        webView = null
        mediaPlayer?.apply {
            if (isPlaying) stop()
            release()
        }
        mediaPlayer = null
        videoView?.stopPlayback()
        videoView = null
        scope.cancel()
        finish()
    }

    override fun onDestroy() {
        closePlayer()
        super.onDestroy()
    }

    override fun onBackPressed() {
        closePlayer()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()
}
