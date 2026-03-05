package com.pushnotify.push_notify_app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.widget.*
import androidx.annotation.RequiresApi

/**
 * ContentPlayerActivity
 *
 * 인앱 WebView 플레이어 (YouTube / 오디오 / 동영상 URL)
 *
 * ▶ FakeCallActivity 수락 → Keyguard 해제 → 이 Activity 실행
 * ▶ YouTube: embed URL 로 인앱 재생 (유튜브 앱 실행 X)
 * ▶ 오디오/비디오: HTML5 <video>/<audio> 태그로 인앱 재생
 * ▶ 하단 빨간 X 버튼으로 종료
 */
class ContentPlayerActivity : Activity() {

    companion object {
        private const val TAG = "ContentPlayerActivity"

        const val EXTRA_MSG_TYPE    = "msg_type"
        const val EXTRA_MSG_VALUE   = "msg_value"
        const val EXTRA_CONTENT_URL = "content_url"
        const val EXTRA_CHANNEL_NAME = "channel_name"

        fun start(
            context: Context,
            msgType: String,
            msgValue: String,
            contentUrl: String,
            channelName: String
        ) {
            val intent = Intent(context, ContentPlayerActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_CHANNEL_NAME, channelName)
            }
            context.startActivity(intent)
        }
    }

    private var webView: WebView? = null

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

        // 상태바 숨김 (전체화면)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )

        val msgType    = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue   = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val contentUrl = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"

        // ★ YouTube도 인앱 WebView로 재생 (외부 앱 실행 X)
        setContentView(buildUI(channelName, msgType, msgValue, contentUrl))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUI(
        channelName: String,
        msgType: String,
        msgValue: String,
        contentUrl: String
    ): View {
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ── WebView (상단 전체 영역) ──────────────────────────────
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false  // 자동 재생 허용
                allowFileAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            webChromeClient = object : WebChromeClient() {
                // 전체화면 동영상 지원
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    root.addView(view, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    ))
                }
                override fun onHideCustomView() {}
            }
            webViewClient = WebViewClient()
        }

        // ── 콘텐츠 HTML 생성 ────────────────────────────────────
        val html = buildHtml(msgType, msgValue, contentUrl)
        webView!!.loadDataWithBaseURL(
            "https://www.youtube.com", html, "text/html", "utf-8", null
        )
        root.addView(webView)

        // ── 상단 채널명 바 ────────────────────────────────────────
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(dp(16), dp(12), dp(16), dp(12))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            )
        }
        topBar.addView(TextView(this).apply {
            text = "📺  $channelName"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        root.addView(topBar)

        // ── 하단 종료 버튼 ────────────────────────────────────────
        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, dp(32))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
            )
            setBackgroundColor(Color.parseColor("#AA000000"))
        }

        // 빨간 종료 버튼
        val closeBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#EF4444"))
            }
            val size = dp(64)
            layoutParams = LinearLayout.LayoutParams(size, size)
            setPadding(dp(14), dp(14), dp(14), dp(14))
            setOnClickListener { closePlayer() }
        }
        bottomBar.addView(closeBtn)
        bottomBar.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(8))
        })
        bottomBar.addView(TextView(this).apply {
            text = "종료"
            textSize = 13f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
        })
        root.addView(bottomBar)

        return root
    }

    // ── HTML 빌드: YouTube embed / 오디오 / 비디오 ────────────────
    private fun buildHtml(msgType: String, msgValue: String, contentUrl: String): String {
        return when (msgType) {
            "youtube" -> {
                val videoId = extractYoutubeId(msgValue)
                val embedId = if (videoId.isNotEmpty()) videoId else extractYoutubeId(contentUrl)
                if (embedId.isNotEmpty()) {
                    // YouTube IFrame embed (자동재생 + 음소거 없이)
                    """
                    <!DOCTYPE html><html>
                    <head>
                      <meta name="viewport" content="width=device-width,initial-scale=1">
                      <style>
                        * { margin:0; padding:0; box-sizing:border-box; }
                        body { background:#000; width:100vw; height:100vh; overflow:hidden; }
                        .wrap { position:absolute; top:0; left:0; width:100%; height:100%; }
                        iframe { width:100%; height:100%; border:none; }
                      </style>
                    </head>
                    <body>
                      <div class="wrap">
                        <iframe
                          src="https://www.youtube.com/embed/$embedId?autoplay=1&playsinline=1&rel=0&showinfo=0&controls=1"
                          allow="autoplay; encrypted-media; fullscreen"
                          allowfullscreen>
                        </iframe>
                      </div>
                    </body></html>
                    """.trimIndent()
                } else {
                    // videoId 추출 실패 시 URL 직접 로드
                    buildBrowserHtml(msgValue.ifEmpty { contentUrl })
                }
            }
            "audio" -> {
                val url = msgValue.ifEmpty { contentUrl }
                """
                <!DOCTYPE html><html>
                <head>
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <style>
                    * { margin:0; padding:0; }
                    body { background:#0F0C29; display:flex; flex-direction:column;
                           align-items:center; justify-content:center;
                           height:100vh; font-family:sans-serif; }
                    .icon { font-size:80px; margin-bottom:24px; }
                    .title { color:#94A3B8; font-size:16px; margin-bottom:24px; }
                    audio { width:90%; outline:none; }
                  </style>
                </head>
                <body>
                  <div class="icon">🎵</div>
                  <div class="title">오디오 재생 중</div>
                  <audio controls autoplay src="$url"></audio>
                </body></html>
                """.trimIndent()
            }
            "video" -> {
                val url = msgValue.ifEmpty { contentUrl }
                """
                <!DOCTYPE html><html>
                <head>
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <style>
                    * { margin:0; padding:0; box-sizing:border-box; }
                    body { background:#000; width:100vw; height:100vh; overflow:hidden; }
                    video { width:100%; height:100%; object-fit:contain; }
                  </style>
                </head>
                <body>
                  <video controls autoplay playsinline src="$url"></video>
                </body></html>
                """.trimIndent()
            }
            else -> buildBrowserHtml(msgValue.ifEmpty { contentUrl })
        }
    }

    private fun buildBrowserHtml(url: String): String {
        return """
        <!DOCTYPE html><html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { background:#000; width:100vw; height:100vh; overflow:hidden; }
            iframe { width:100%; height:100%; border:none; }
          </style>
        </head>
        <body>
          <iframe src="$url" allow="autoplay; encrypted-media"></iframe>
        </body></html>
        """.trimIndent()
    }

    // ── YouTube: 앱 우선, 없으면 브라우저 실행 ────────────────────
    private fun launchYouTube(url: String) {
        val videoId = extractYoutubeId(url)
        val watchUrl = if (videoId.isNotEmpty())
            "https://www.youtube.com/watch?v=$videoId"
        else if (url.startsWith("http")) url
        else "https://www.youtube.com/watch?v=$url"

        // YouTube 앱 시도
        try {
            val appIntent = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(appIntent)
            return
        } catch (_: Exception) {}

        // YouTube 앱 없으면 브라우저로 열기
        try {
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(watchUrl)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(webIntent)
        } catch (e: Exception) {
            Log.e(TAG, "YouTube 실행 실패: ${e.message}")
        }
    }

    private fun closePlayer() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        webView = null
        finish()
    }

    override fun onDestroy() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        webView = null
        super.onDestroy()
    }

    override fun onBackPressed() {
        closePlayer()
    }

    private fun extractYoutubeId(url: String): String {
        if (url.length == 11 && !url.startsWith("http")) return url
        val m = Regex("(?:v=|youtu\\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})").find(url)
        return m?.groupValues?.get(1) ?: ""
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()
}
