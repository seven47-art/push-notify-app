package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL_ACCOUNTS     = "com.pushnotify/accounts"
    private val CHANNEL_RINGTONE     = "com.pushnotify/ringtone"
    private val CHANNEL_SERVICE      = "com.pushnotify/alarm_service"
    private val CHANNEL_ALARM        = "com.pushnotify/alarm_data"
    private val CHANNEL_PERMISSIONS  = "com.pushnotify/permissions"
    private val REQUEST_PICK_ACCOUNT = 1002

    private var pendingResult: MethodChannel.Result? = null
    private var alarmChannel: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // ── 알람 데이터 수신 채널 (FakeCallActivity 수락 후 Flutter로 전달) ──
        alarmChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_ALARM)

        // ── 계정 선택 채널 ──────────────────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_ACCOUNTS)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "showAccountPicker" -> { pendingResult = result; showAccountPicker() }
                    "getGoogleAccounts" -> getAccountsDirect(result)
                    else -> result.notImplemented()
                }
            }

        // ── 기기 벨소리 채널 ────────────────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_RINGTONE)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getDefaultRingtoneUri" -> {
                        try {
                            val uri: Uri? = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_RINGTONE)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    "getDefaultAlarmUri" -> {
                        try {
                            val uri: Uri? = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_ALARM)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    "getDefaultNotificationUri" -> {
                        try {
                            val uri: Uri? = RingtoneManager.getActualDefaultRingtoneUri(
                                applicationContext, RingtoneManager.TYPE_NOTIFICATION)
                            result.success(uri?.toString() ?: "")
                        } catch (e: Exception) { result.success("") }
                    }
                    else -> result.notImplemented()
                }
            }

        // ── 알람 백그라운드 서비스 채널 ─────────────────────────────
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

        // ── 권한 채널 (전체화면 알림 권한 확인/설정) ──────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_PERMISSIONS)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "canUseFullScreenIntent" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            // Android 14+ 에서만 런타임 권한 필요
                            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                            result.success(nm.canUseFullScreenIntent())
                        } else {
                            // Android 13 이하는 항상 허용
                            result.success(true)
                        }
                    }
                    "openFullScreenIntentSettings" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                            try {
                                val intent = Intent(
                                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                    Uri.parse("package:$packageName")
                                )
                                startActivity(intent)
                                result.success(true)
                            } catch (e: Exception) {
                                Log.e("MainActivity", "전체화면 알림 설정 열기 실패: ${e.message}")
                                result.success(false)
                            }
                        } else {
                            result.success(true)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // ── onCreate: 앱이 꺼진 상태에서 FakeCallActivity 수락으로 열린 경우 ──
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleAlarmIntent(intent)
        // ※ USE_FULL_SCREEN_INTENT 권한은 permission_screen(Flutter)에서 안내
        //   onCreate에서 강제로 설정화면 이동하면 Flutter 초기화 전 크래시 발생
    }

    // ── onNewIntent: 앱이 이미 열려있는 상태에서 인텐트 수신 ──────────
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAlarmIntent(intent)
    }

    // ── 알람 수락 인텐트 처리 → Flutter로 알람 데이터 전달 ────────────
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
            // Flutter 엔진이 준비된 후 전달 (약간 지연)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                alarmChannel?.invokeMethod("onAlarmAnswered", data)
            }, 1000)
        }
    }

    // ── Account Picker: 시스템 계정 선택 팝업 ──────────────────────
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

    // ── AccountManager 직접 조회 ────────────────────────────────────
    private fun getAccountsDirect(result: MethodChannel.Result) {
        try {
            val am = AccountManager.get(this)
            val accounts = am.getAccountsByType("com.google")
            val list = accounts.map { it.name }.filter { it.contains("@") }
            result.success(list)
        } catch (e: Exception) {
            result.success(emptyList<String>())
        }
    }

    // ── Account Picker 결과 처리 ────────────────────────────────────
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_PICK_ACCOUNT) {
            val result = pendingResult ?: return
            pendingResult = null
            if (resultCode == Activity.RESULT_OK && data != null) {
                val email = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
                if (!email.isNullOrEmpty()) {
                    result.success(email)
                } else {
                    result.error("NO_EMAIL", "이메일을 가져올 수 없습니다.", null)
                }
            } else {
                result.error("CANCELLED", "계정 선택이 취소되었습니다.", null)
            }
        }
    }
}
