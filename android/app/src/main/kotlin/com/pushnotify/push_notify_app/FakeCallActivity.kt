package com.pushnotify.push_notify_app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * FakeCallActivity  v1.0.36
 *
 * [수정 내역 v1.0.36]
 *  1. 벨소리: USAGE_NOTIFICATION_RINGTONE + STREAM_RING → 핸드폰 벨소리 설정 그대로
 *  2. 진동: 핸드폰 진동 모드일 때만 진동, 무음 모드는 조용히
 *  3. 볼륨 강제 설정 없음 → 사용자 볼륨 설정 그대로
 *  4. AudioManager.RINGER_MODE 확인 → 모드별 처리
 *     - NORMAL: 벨소리 + 진동
 *     - VIBRATE: 진동만
 *     - SILENT: 조용히
 */
class FakeCallActivity : Activity() {

    companion object {
        private const val TAG = "FakeCallActivity"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"
        const val EXTRA_AUTO_ACCEPT  = "auto_accept"
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private var alarmId      = 0
    private var channelName  = ""
    private var msgType      = ""
    private var msgValue     = ""
    private var contentUrl   = ""
    private var homepageUrl  = ""
    private var autoAccept   = false

    private var autoDeclineHandler  = Handler(Looper.getMainLooper())
    private var autoDeclineRunnable: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 잠금화면 위 표시 설정
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        // WakeLock 획득
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "RinGo:FakeCallWakeLock"
        ).also { it.acquire(35_000L) }

        // 인텐트 데이터 추출
        alarmId     = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        msgType     = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        msgValue    = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        homepageUrl = intent.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""
        autoAccept  = intent.getBooleanExtra(EXTRA_AUTO_ACCEPT, false)

        buildUi()
        startRinging()

        // 자동 수락
        if (autoAccept) {
            autoDeclineHandler.postDelayed({ handleAccept() }, 300L)
            return
        }

        // 30초 후 자동 거절
        autoDeclineRunnable = Runnable {
            Log.d(TAG, "30초 타임아웃: 자동 거절")
            recordAlarmStatus(alarmId, "timeout")
            stopRinging()
            finish()
        }
        autoDeclineHandler.postDelayed(autoDeclineRunnable!!, 30_000L)
    }

    override fun onDestroy() {
        stopRinging()
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        scope.cancel()
        super.onDestroy()
    }

    // ── 벨소리 + 진동 ────────────────────────────────────────────────
    private fun startRinging() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager

        // [v1.0.36] 핸드폰 벨소리/진동 모드 그대로 따름
        val ringerMode = am.ringerMode
        Log.d(TAG, "ringerMode: $ringerMode (NORMAL=2, VIBRATE=1, SILENT=0)")

        // 벨소리 모드일 때만 소리 재생 (볼륨 강제 설정 없음)
        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

            ringtone = RingtoneManager.getRingtone(this, uri)?.also { r ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.isLooping = true
                // [v1.0.36] USAGE_NOTIFICATION_RINGTONE → 핸드폰 벨소리 채널 사용
                r.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setLegacyStreamType(AudioManager.STREAM_RING)
                    .build()
                r.play()
                Log.d(TAG, "벨소리 재생: $uri")
            }
        }

        // 진동 모드 또는 벨소리 모드 모두 진동 실행
        if (ringerMode == AudioManager.RINGER_MODE_NORMAL || ringerMode == AudioManager.RINGER_MODE_VIBRATE) {
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
            Log.d(TAG, "진동 시작")
        }
    }

    private fun stopRinging() {
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
    }

    // ── 서버에 알람 상태 기록 ────────────────────────────────────────
    private fun recordAlarmStatus(alarmId: Int, status: String) {
        if (alarmId <= 0) return
        scope.launch {
            try {
                val prefs = applicationContext.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
                val token = prefs.getString("flutter.session_token", "") ?: ""
                if (token.isEmpty()) return@launch

                val baseUrlRaw = prefs.getString("flutter.base_url", "") ?: ""
                val baseUrl = baseUrlRaw.trimEnd('/')
                if (baseUrl.isEmpty()) return@launch

                val json = """{"alarm_schedule_id":$alarmId,"status":"$status"}"""
                val req = Request.Builder()
                    .url("$baseUrl/api/alarms/status")
                    .post(json.toRequestBody("application/json".toMediaType()))
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                val resp = http.newCall(req).execute()
                Log.d(TAG, "상태 기록: $status → ${resp.code}")
            } catch (e: Exception) {
                Log.e(TAG, "상태 기록 실패: ${e.message}")
            }
        }
    }

    // ── 수락 처리 ────────────────────────────────────────────────────
    private fun handleAccept() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "accepted")

        // 알림 제거
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        try { nm.cancel(alarmId + 10000) } catch (_: Exception) {}

        // 콘텐츠 화면 열기
        val target = contentUrl.ifEmpty { homepageUrl }
        if (target.isNotEmpty()) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
            } catch (_: Exception) {}
        }
        finish()
    }

    // ── 거절 처리 ────────────────────────────────────────────────────
    private fun handleDecline() {
        autoDeclineRunnable?.let { autoDeclineHandler.removeCallbacks(it) }
        stopRinging()
        recordAlarmStatus(alarmId, "rejected")

        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        try { nm.cancel(alarmId + 10000) } catch (_: Exception) {}

        CallForegroundService.stop(this)
        finish()
    }

    // ── UI 구성 ──────────────────────────────────────────────────────
    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(0xFF1A1A2E.toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        // 아이콘
        val icon = TextView(this).apply {
            text = "📞"
            textSize = 72f
            gravity = Gravity.CENTER
        }

        // 채널 이름
        val titleTv = TextView(this).apply {
            text = channelName
            textSize = 28f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 8)
        }

        // 알람 유형
        val msgLabel = when (msgType) {
            "youtube" -> "📺 YouTube 알람"
            "audio"   -> "🎵 오디오 알람"
            "video"   -> "🎬 비디오 알람"
            else      -> "📎 알람"
        }
        val subtitleTv = TextView(this).apply {
            text = msgLabel
            textSize = 18f
            setTextColor(0xFFAAAAAA.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 48)
        }

        // 버튼 레이아웃
        val btnLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        // [거절] 버튼
        val declineBtn = Button(this).apply {
            text = "거절"
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFFE53935.toInt())
            setPadding(48, 24, 48, 24)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.setMargins(32, 0, 32, 0) }
            layoutParams = params
            setOnClickListener { handleDecline() }
        }

        // [수락] 버튼
        val acceptBtn = Button(this).apply {
            text = "수락"
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            setBackgroundColor(0xFF43A047.toInt())
            setPadding(48, 24, 48, 24)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.setMargins(32, 0, 32, 0) }
            layoutParams = params
            setOnClickListener { handleAccept() }
        }

        btnLayout.addView(declineBtn)
        btnLayout.addView(acceptBtn)

        root.addView(icon)
        root.addView(titleTv)
        root.addView(subtitleTv)
        root.addView(btnLayout)

        setContentView(root)
    }
}
