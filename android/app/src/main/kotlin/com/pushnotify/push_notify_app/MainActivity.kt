package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.media.MediaRecorder
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * MainActivity v1.0.41
 * - requestEssentialPermissions() 제거
 *   → 권한 요청은 Flutter permission_screen.dart 에서 순서대로 처리
 *   (알림 → 다른앱위에표시 → 전체화면알림 → 정확한알람 → 배터리최적화)
 * - CHANNEL_PERMISSIONS: canDrawOverlays, openOverlaySettings 핸들러 유지
 */
class MainActivity : FlutterActivity() {

    private val CHANNEL_ACCOUNTS     = "com.pushnotify/accounts"
    private val CHANNEL_RINGTONE     = "com.pushnotify/ringtone"
    private val CHANNEL_SERVICE      = "com.pushnotify/alarm_service"
    private val CHANNEL_ALARM        = "com.pushnotify/alarm_data"
    private val CHANNEL_PERMISSIONS  = "com.pushnotify/permissions"
    private val CHANNEL_AUDIO        = "com.pushnotify.push_notify_app/audio_recorder"
    private val CHANNEL_SCHEDULE     = "com.pushnotify.push_notify_app/alarm"  // v1.0.76: Flutter → Kotlin AlarmManager 예약
    private val REQUEST_PICK_ACCOUNT = 1002

    private var pendingResult: MethodChannel.Result? = null
    private var alarmChannel: MethodChannel? = null

    // 오디오 녹음
    private var mediaRecorder: MediaRecorder? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        alarmChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_ALARM)

        // v1.0.76: Flutter → Kotlin AlarmManager 예약 채널
        // Flutter가 서버에서 조회한 pending 알람을 Kotlin AlarmScheduler에 등록
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_SCHEDULE)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "scheduleAlarm" -> {
                        try {
                            val alarmId        = call.argument<Int>("alarm_id")      ?: 0
                            val scheduledMs    = call.argument<Long>("scheduled_ms") ?: 0L
                            val channelName    = call.argument<String>("channel_name")     ?: ""
                            val channelPubId   = call.argument<String>("channel_public_id") ?: ""
                            val msgType        = call.argument<String>("msg_type")    ?: "youtube"
                            val msgValue       = call.argument<String>("msg_value")   ?: ""
                            val contentUrl     = call.argument<String>("content_url") ?: ""
                            val homepageUrl    = call.argument<String>("homepage_url") ?: ""
                            AlarmScheduler.schedule(
                                applicationContext, alarmId, scheduledMs,
                                channelName, msgType, msgValue, contentUrl, homepageUrl, channelPubId
                            )
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("SCHEDULE_ERROR", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
        // 계정 선택 채널
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_ACCOUNTS)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "showAccountPicker" -> { pendingResult = result; showAccountPicker() }
                    "getGoogleAccounts" -> getAccountsDirect(result)
                    else -> result.notImplemented()
                }
            }

        // 벨소리 채널
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_RINGTONE)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getDefaultRingtoneUri" -> {
                        try {
                            val uri = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_RINGTONE)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    "getDefaultAlarmUri" -> {
                        try {
                            val uri = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_ALARM)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    "getDefaultNotificationUri" -> {
                        try {
                            val uri = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_NOTIFICATION)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    else -> result.notImplemented()
                }
            }

        // 알람 서비스 채널
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_SERVICE)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startService" -> {
                        try {
                            val token   = call.argument<String>("token") ?: ""
                            val baseUrl = call.argument<String>("base_url") ?: ""
                            AlarmPollingService.start(applicationContext, token, baseUrl)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("SERVICE_ERROR", e.message, null)
                        }
                    }
                    "stopService" -> {
                        AlarmPollingService.stop(applicationContext)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }

        // 권한 채널 — Flutter에서 호출, Kotlin에서 시스템 설정 열기
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_PERMISSIONS)
            .setMethodCallHandler { call, result ->
                when (call.method) {

                    // ── 전체화면 알림 권한 (Android 14+) ────────────────
                    "canUseFullScreenIntent" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                            result.success(nm.canUseFullScreenIntent())
                        } else {
                            result.success(true)
                        }
                    }
                    "openFullScreenIntentSettings" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            try {
                                startActivity(Intent(
                                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                    Uri.parse("package:$packageName")
                                ))
                                result.success(true)
                            } catch (e: Exception) { result.success(false) }
                        } else {
                            result.success(true)
                        }
                    }

                    // ── 다른 앱 위에 표시 (SYSTEM_ALERT_WINDOW) ─────────
                    "canDrawOverlays" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            result.success(Settings.canDrawOverlays(this))
                        } else {
                            result.success(true)
                        }
                    }
                    "openOverlaySettings" -> {
                        try {
                            startActivity(Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:$packageName")
                            ))
                            result.success(true)
                        } catch (e: Exception) { result.success(false) }
                    }

                    // ── 배터리 최적화 무시 ───────────────────────────────
                    "isIgnoringBatteryOptimizations" -> {
                        val pm = getSystemService(POWER_SERVICE) as PowerManager
                        result.success(pm.isIgnoringBatteryOptimizations(packageName))
                    }
                    "requestIgnoreBatteryOptimizations" -> {
                        try {
                            startActivity(Intent(
                                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                Uri.parse("package:$packageName")
                            ))
                            result.success(true)
                        } catch (e: Exception) { result.success(false) }
                    }

                    else -> result.notImplemented()
                }
            }

        // 오디오 녹음 채널 (MediaRecorder 직접 구현)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_AUDIO)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startRecording" -> {
                        try {
                            val path = call.argument<String>("path") ?: ""
                            mediaRecorder?.release()
                            mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                MediaRecorder(applicationContext)
                            } else {
                                @Suppress("DEPRECATION")
                                MediaRecorder()
                            }
                            mediaRecorder!!.apply {
                                setAudioSource(MediaRecorder.AudioSource.MIC)
                                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                                setAudioSamplingRate(44100)
                                setAudioEncodingBitRate(128000)
                                setOutputFile(path)
                                prepare()
                                start()
                            }
                            result.success(true)
                        } catch (e: Exception) {
                            mediaRecorder?.release()
                            mediaRecorder = null
                            result.error("RECORD_ERROR", e.message, null)
                        }
                    }
                    "stopRecording" -> {
                        try {
                            mediaRecorder?.apply { stop(); release() }
                            mediaRecorder = null
                            result.success(true)
                        } catch (e: Exception) {
                            mediaRecorder?.release()
                            mediaRecorder = null
                            result.error("STOP_ERROR", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleAlarmIntent(intent)
        // 권한 요청은 Flutter permission_screen.dart 에서 처리
        // requestEssentialPermissions() 제거 → 중복 팝업 없음
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAlarmIntent(intent)
    }

    private fun handleAlarmIntent(intent: Intent?) {
        if (intent?.getBooleanExtra("alarm_answered", false) == true) {
            val channelName = intent.getStringExtra("alarm_channel_name") ?: "알람"
            val msgType     = intent.getStringExtra("alarm_msg_type")     ?: "youtube"
            val msgValue    = intent.getStringExtra("alarm_msg_value")    ?: ""
            val alarmId     = intent.getIntExtra("alarm_id", 0)
            val contentUrl  = intent.getStringExtra("alarm_content_url")  ?: ""
            Log.d("MainActivity", "alarm_answered: $channelName / $msgType / $msgValue")

            val data = mapOf(
                "channel_name" to channelName,
                "msg_type"     to msgType,
                "msg_value"    to msgValue,
                "alarm_id"     to alarmId,
                "content_url"  to contentUrl
            )
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                alarmChannel?.invokeMethod("onAlarmAnswered", data)
            }, 1000)
        }
    }

    private fun showAccountPicker() {
        try {
            val intent = AccountManager.newChooseAccountIntent(
                null, null, arrayOf("com.google"),
                null, null, null, null
            )
            startActivityForResult(intent, REQUEST_PICK_ACCOUNT)
        } catch (e: Exception) {
            pendingResult?.error("NO_PICKER", "계정 선택 창을 열 수 없습니다: ${e.message}", null)
            pendingResult = null
        }
    }

    private fun getAccountsDirect(result: MethodChannel.Result) {
        try {
            val am = AccountManager.get(this)
            val accounts = am.getAccountsByType("com.google")
            result.success(accounts.map { it.name }.filter { it.contains("@") })
        } catch (e: Exception) {
            result.success(emptyList<String>())
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_PICK_ACCOUNT) {
            val result = pendingResult ?: return
            pendingResult = null
            if (resultCode == Activity.RESULT_OK && data != null) {
                val email = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
                if (!email.isNullOrEmpty()) result.success(email)
                else result.error("NO_EMAIL", "이메일을 가져올 수 없습니다.", null)
            } else {
                result.error("CANCELLED", "계정 선택이 취소되었습니다.", null)
            }
        }
    }
}
