package com.pushnotify.push_notify_app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.GradientDrawable
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
 * ┌────────────────────────────┐
 * │                            │
 * │   콘텐츠 FULL SCREEN       │  ← 전체 화면 사용
 * │  (YouTube / Audio / Video) │
 * │                            │
 * │ ▓▓▓ 반투명 그라데이션 ▓▓▓▓▓▓ │  ← 하단 오버레이
 * │ [img] 채널명  [▶앱] [🔗] [✕]│  ← 한줄 바
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
    private var audioWebView: WebView? = null
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

        // ── 루트: FrameLayout (콘텐츠 풀스크린 + 하단 오버레이) ──
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ════════════════════════════════════════════════
        // 콘텐츠 재생 영역 — MATCH_PARENT (전체 화면)
        // ════════════════════════════════════════════════
        val playerParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )

        val effectiveType = msgType

        when (effectiveType) {

            // ── YouTube ──
            "youtube" -> {
                val videoId = extractYoutubeId(msgValue).ifEmpty { extractYoutubeId(contentUrl) }
                webView = WebView(this).apply {
                    layoutParams = playerParams
                    settings.apply {
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
                        private var customView: View? = null
                        private var customViewCallback: CustomViewCallback? = null

                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            customView?.let { root.removeView(it) }
                            customView = view
                            customViewCallback = callback
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

                        override fun onJsPrompt(
                            view: WebView?, url: String?, message: String?,
                            defaultValue: String?, result: JsPromptResult?
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
                                .setTitle("비밀번호 확인")
                                .setMessage(message ?: "비밀번호를 입력하세요")
                                .setView(container)
                                .setPositiveButton("확인") { _, _ -> result?.confirm(input.text.toString()) }
                                .setNegativeButton("취소") { _, _ -> result?.cancel() }
                                .setOnCancelListener { result?.cancel() }
                                .show()
                                .apply {
                                    window?.setBackgroundDrawable(GradientDrawable().apply {
                                        setColor(Color.parseColor("#1E293B"))
                                        cornerRadius = dp(16).toFloat()
                                    })
                                }
                            return true
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val url = request?.url?.toString() ?: return false
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
                        val prefs = getSharedPreferences("ringo_alarm_prefs", MODE_PRIVATE)
                        val baseUrl = prefs.getString("base_url", "")
                            ?.takeIf { it.isNotEmpty() } ?: "https://ringo-server.pages.dev"
                        loadUrl("$baseUrl/static/youtubehelp.html?id=$videoId")
                    } else {
                        val errorHtml = """
                            <!DOCTYPE html><html><head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>* { margin:0; padding:0; background:#000; } body { display:flex; align-items:center; justify-content:center; height:100vh; }</style>
                            </head><body>
                            <div style="color:#fff; font-size:14px; text-align:center; padding:20px; line-height:1.8;">
                                영상 URL을 확인할 수 없습니다.<br><br>
                                올바른 YouTube URL을 등록해 주세요.<br>
                                (예: youtu.be/xxxxx 또는 youtube.com/watch?v=xxxxx)
                            </div></body></html>
                        """.trimIndent()
                        loadDataWithBaseURL("https://www.youtube.com", errorHtml, "text/html", "UTF-8", null)
                    }
                }
                root.addView(webView)
            }

            // ── 오디오 ──
            "audio" -> {
                val audioUrl = contentUrl.ifEmpty { msgValue }
                Log.d(TAG, "오디오 WebView URL: $audioUrl")

                val audioContainer = FrameLayout(this).apply {
                    layoutParams = playerParams
                    background = GradientDrawable().apply {
                        gradientType = GradientDrawable.LINEAR_GRADIENT
                        orientation = GradientDrawable.Orientation.TOP_BOTTOM
                        colors = intArrayOf(Color.parseColor("#1A0533"), Color.parseColor("#0F0C29"))
                    }
                }

                audioWebView = WebView(this).apply {
                    layoutParams = FrameLayout.LayoutParams(dp(1), dp(1))
                    visibility = View.INVISIBLE
                    settings.apply { javaScriptEnabled = true; mediaPlaybackRequiresUserGesture = false }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = false
                    }
                    loadUrl(audioUrl)
                }
                audioContainer.addView(audioWebView)

                val centerLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
                    layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
                }

                val eqContainer = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(60)).also { it.bottomMargin = dp(8) }
                }

                val barColors = listOf("#7C3AED","#8B5CF6","#A78BFA","#8B5CF6","#7C3AED","#A78BFA","#8B5CF6","#7C3AED","#A78BFA","#8B5CF6","#7C3AED","#8B5CF6")
                val barWidth = dp(6); val barMargin = dp(3); val maxBarHeight = dp(50); val minBarHeight = dp(6)
                val barAnimators = mutableListOf<ValueAnimator>(); val barViews = mutableListOf<View>()

                barColors.forEachIndexed { index, colorHex ->
                    val bar = View(this).apply {
                        background = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = dp(3).toFloat(); setColor(Color.parseColor(colorHex)) }
                        layoutParams = LinearLayout.LayoutParams(barWidth, minBarHeight).also { it.marginStart = if (index == 0) 0 else barMargin }
                    }
                    eqContainer.addView(bar); barViews.add(bar)
                    val randomHeight = minBarHeight + (Math.random() * (maxBarHeight - minBarHeight)).toInt()
                    val duration = 300L + (index * 80L) + (Math.random() * 200).toLong()
                    barAnimators.add(ValueAnimator.ofInt(minBarHeight, randomHeight).apply {
                        this.duration = duration; repeatCount = ValueAnimator.INFINITE; repeatMode = ValueAnimator.REVERSE
                        interpolator = DecelerateInterpolator()
                        addUpdateListener { anim -> bar.layoutParams = (bar.layoutParams as LinearLayout.LayoutParams).also { lp -> lp.height = anim.animatedValue as Int }; bar.requestLayout() }
                    })
                }
                centerLayout.addView(eqContainer)

                val statusText = TextView(this).apply {
                    text = "♪ 오디오 재생 중"; textSize = 14f; setTextColor(Color.parseColor("#A78BFA")); gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).also { it.topMargin = dp(12) }
                }
                centerLayout.addView(statusText)
                audioContainer.addView(centerLayout)

                val playBtn = TextView(this).apply {
                    text = "⏸ 일시정지"; textSize = 16f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
                    setPadding(dp(32), dp(14), dp(32), dp(14))
                    background = GradientDrawable().apply { cornerRadius = dp(30).toFloat(); setColor(Color.parseColor("#7C3AED")) }
                    layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).also { it.bottomMargin = dp(100) }
                }
                audioContainer.addView(playBtn)
                root.addView(audioContainer)

                fun startEqualizer() { barAnimators.forEachIndexed { i, anim -> if (!anim.isRunning) { anim.startDelay = (i * 40L); anim.start() } } }
                fun stopEqualizer() { barAnimators.forEach { it.cancel() }; barViews.forEach { bar -> bar.layoutParams = (bar.layoutParams as LinearLayout.LayoutParams).also { lp -> lp.height = minBarHeight }; bar.requestLayout() } }

                audioWebView?.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) { startEqualizer(); statusText.text = "♪ 오디오 재생 중" }
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = false
                }

                var isPlaying = true
                playBtn.setOnClickListener {
                    if (isPlaying) {
                        audioWebView?.loadUrl("javascript:(function(){var a=document.querySelector('audio,video');if(a)a.pause();})()")
                        playBtn.text = "▶ 재생"; statusText.text = "일시정지"; stopEqualizer(); isPlaying = false
                    } else {
                        audioWebView?.loadUrl("javascript:(function(){var a=document.querySelector('audio,video');if(a)a.play();})()")
                        playBtn.text = "⏸ 일시정지"; statusText.text = "♪ 오디오 재생 중"; startEqualizer(); isPlaying = true
                    }
                }
            }

            // ── 비디오 ──
            "video" -> {
                val videoUrl = contentUrl.ifEmpty { msgValue }
                Log.d(TAG, "비디오 WebView URL: $videoUrl")
                webView = WebView(this).apply {
                    layoutParams = playerParams; setBackgroundColor(Color.BLACK)
                    settings.apply {
                        javaScriptEnabled = true; @Suppress("DEPRECATION") pluginState = WebSettings.PluginState.ON
                        javaScriptCanOpenWindowsAutomatically = true; setSupportMultipleWindows(true)
                        setSupportZoom(true); builtInZoomControls = true; allowFileAccess = true; mediaPlaybackRequiresUserGesture = false
                    }
                    webChromeClient = object : WebChromeClient() {
                        private var customView: View? = null; private var customViewCallback: CustomViewCallback? = null
                        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                            customView?.let { root.removeView(it) }; customView = view; customViewCallback = callback
                            root.addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                            webView?.visibility = View.GONE
                        }
                        override fun onHideCustomView() {
                            customView?.let { root.removeView(it) }; customView = null
                            customViewCallback?.onCustomViewHidden(); customViewCallback = null; webView?.visibility = View.VISIBLE
                        }
                    }
                    webViewClient = object : WebViewClient() { override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = false }
                    loadUrl(videoUrl)
                }
                root.addView(webView)
            }

            // ── 기타 ──
            else -> {
                val msgView = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; layoutParams = playerParams
                    setBackgroundColor(Color.parseColor("#0F0C29"))
                }
                msgView.addView(TextView(this).apply { text = "⚠️"; textSize = 60f; gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT) })
                msgView.addView(TextView(this).apply { text = "지원하지 않는 파일 형식입니다\n(mp4, m4a만 지원)"; textSize = 15f; setTextColor(Color.parseColor("#94A3B8")); gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT) })
                root.addView(msgView)
            }
        }

        // ════════════════════════════════════════════════════════════
        // 하단 오버레이: 반투명 그라데이션 + 한줄 바 (콘텐츠 위에 떠있음)
        // ════════════════════════════════════════════════════════════
        val overlayContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
            )
        }

        // ── 그라데이션 페이드 (투명 → 반투명 검정) ──
        overlayContainer.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(40))
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.LINEAR_GRADIENT
                orientation = GradientDrawable.Orientation.TOP_BOTTOM
                colors = intArrayOf(Color.TRANSPARENT, Color.parseColor("#CC000000"))
            }
        })

        // ── 한줄 바 ──
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#CC000000"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60))
            setPadding(dp(16), dp(6), dp(12), dp(6))
        }

        // ── 채널 이미지 (원형, 38dp) ──
        val thumbSize = dp(38)
        val channelThumb = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#2A2A3E"))
                setStroke(dp(1), Color.parseColor("#40FFFFFF"))
            }
            setImageResource(R.drawable.ringo_icon)
            layoutParams = LinearLayout.LayoutParams(thumbSize, thumbSize).also { it.marginEnd = dp(10) }
        }
        bottomBar.addView(channelThumb)
        if (channelImage.isNotEmpty()) loadImageUrlIntoView(channelImage, channelThumb)
        else if (channelPublicId.isNotEmpty()) loadChannelImageIntoView(channelPublicId, channelThumb)

        // ── 채널명 ──
        bottomBar.addView(TextView(this).apply {
            text = channelName; textSize = 14f; setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
            gravity = Gravity.CENTER_VERTICAL
            setShadowLayer(4f, 0f, 1f, Color.parseColor("#80000000"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also { it.marginEnd = dp(8) }
        })

        // ── YouTube 앱으로 열기 버튼 (youtube 타입일 때만) ──
        if (effectiveType == "youtube") {
            val youtubeUrl = msgValue.ifEmpty { contentUrl }
            if (youtubeUrl.isNotEmpty()) {
                bottomBar.addView(TextView(this).apply {
                    text = "▶"; textSize = 14f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
                    background = GradientDrawable().apply {
                        cornerRadius = dp(19).toFloat()
                        setColor(Color.parseColor("#40FFFFFF"))
                        setStroke(dp(1), Color.parseColor("#33FFFFFF"))
                    }
                    layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).also { it.marginEnd = dp(10) }
                    setOnClickListener {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(youtubeUrl)).apply {
                                setPackage("com.google.android.youtube")
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            })
                        } catch (_: Exception) {
                            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(youtubeUrl)).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }) }
                            catch (_: Exception) { Log.e(TAG, "YouTube URL 열기 실패") }
                        }
                    }
                })
            }
        }

        // ── 링크 버튼 ──
        val effectiveLinkUrl = when {
            linkUrl.isNotEmpty() -> linkUrl
            homepageUrl.isNotEmpty() -> homepageUrl
            else -> ""
        }
        if (effectiveLinkUrl.isNotEmpty()) {
            val fullLinkUrl = if (effectiveLinkUrl.startsWith("http")) effectiveLinkUrl else "https://$effectiveLinkUrl"
            bottomBar.addView(ImageView(this).apply {
                setImageResource(R.drawable.link_icon)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(9), dp(9), dp(9), dp(9))
                background = GradientDrawable().apply {
                    cornerRadius = dp(19).toFloat()
                    setColor(Color.parseColor("#40FFFFFF"))
                    setStroke(dp(1), Color.parseColor("#33FFFFFF"))
                }
                layoutParams = LinearLayout.LayoutParams(dp(38), dp(38)).also { it.marginEnd = dp(10) }
                setOnClickListener {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fullLinkUrl)).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }) }
                    catch (e: Exception) { Log.e(TAG, "링크 열기 실패: ${e.message}") }
                }
            })
        }

        // ── 종료 버튼 ──
        bottomBar.addView(ImageView(this).apply {
            setImageResource(R.drawable.close_icon)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(9), dp(9), dp(9), dp(9))
            background = GradientDrawable().apply {
                cornerRadius = dp(19).toFloat()
                setColor(Color.parseColor("#55FF4444"))
                setStroke(dp(1), Color.parseColor("#44FF6666"))
            }
            layoutParams = LinearLayout.LayoutParams(dp(38), dp(38))
            setOnClickListener { closePlayer() }
        })

        overlayContainer.addView(bottomBar)
        root.addView(overlayContainer)
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
        audioWebView?.apply { stopLoading(); loadUrl("about:blank"); destroy() }
        audioWebView = null
        scope.cancel()
        finish()
    }

    override fun onDestroy() { closePlayer(); super.onDestroy() }
    override fun onBackPressed() { closePlayer() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()
}
