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
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.widget.*

/**
 * ContentPlayerActivity
 *
 * 알람 수락 후 화면 — 자체 제작 화면
 *
 * ┌────────────────────────────┐
 * │  상단: 메시지 소스 실행창        │  ← 유튜브/동영상/오디오/파일 등 인앱 재생
 * ├────────────────────────────┤
 * │  홈페이지 주소 노출 버튼         │  ← 클릭시 브라우저로 이동 (없으면 숨김)
 * ├────────────────────────────┤
 * │  🔴 종료 버튼                 │
 * └────────────────────────────┘
 */
class ContentPlayerActivity : Activity() {

    companion object {
        private const val TAG = "ContentPlayerActivity"

        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"  // ★ 홈페이지 URL

        fun start(
            context: Context,
            msgType: String,
            msgValue: String,
            contentUrl: String,
            channelName: String,
            homepageUrl: String = ""
        ) {
            val intent = Intent(context, ContentPlayerActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_MSG_TYPE,     msgType)
                putExtra(EXTRA_MSG_VALUE,    msgValue)
                putExtra(EXTRA_CONTENT_URL,  contentUrl)
                putExtra(EXTRA_CHANNEL_NAME, channelName)
                putExtra(EXTRA_HOMEPAGE_URL, homepageUrl)
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

        val msgType     = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue    = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val homepageUrl = intent.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""

        setContentView(buildUI(channelName, msgType, msgValue, contentUrl, homepageUrl))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildUI(
        channelName: String,
        msgType: String,
        msgValue: String,
        contentUrl: String,
        homepageUrl: String
    ): View {
        // 전체 루트 컨테이너 (검정 배경)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // ── 상단: 상태바 영역 (채널명) ──────────────────────────────
        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#1A1035"))
            setPadding(dp(16), dp(12), dp(16), dp(12))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        topBar.addView(TextView(this).apply {
            text = "📺  $channelName"
            textSize = 15f
            setTextColor(Color.WHITE)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        root.addView(topBar)

        // ── 중상단: WebView 콘텐츠 재생 영역 (화면 비율의 절반 이상) ──
        webView = WebView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f  // 남은 공간 채우기
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
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    // 전체화면 동영상 지원
                }
                override fun onHideCustomView() {}
            }
            webViewClient = WebViewClient()
        }

        val html = buildHtml(msgType, msgValue, contentUrl)
        webView!!.loadDataWithBaseURL(
            "https://www.youtube.com", html, "text/html", "utf-8", null
        )
        root.addView(webView)

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

        // 홈페이지 URL 버튼 (있을 때만 표시)
        if (homepageUrl.isNotEmpty()) {
            val hpUrl = if (homepageUrl.startsWith("http")) homepageUrl else "https://$homepageUrl"
            val hpBtn = TextView(this).apply {
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
            }
            bottomArea.addView(hpBtn)
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

        val closeCircle = android.widget.ImageView(this).apply {
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

    // ── HTML 빌드: YouTube embed / 오디오 / 비디오 ────────────────
    private fun buildHtml(msgType: String, msgValue: String, contentUrl: String): String {
        return when (msgType) {
            "youtube" -> {
                val videoId = extractYoutubeId(msgValue)
                val embedId = if (videoId.isNotEmpty()) videoId else extractYoutubeId(contentUrl)
                if (embedId.isNotEmpty()) {
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
                    .icon { font-size:72px; margin-bottom:20px; }
                    .title { color:#94A3B8; font-size:15px; margin-bottom:20px; }
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
