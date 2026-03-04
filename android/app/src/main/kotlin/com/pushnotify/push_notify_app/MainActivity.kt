package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import android.app.Activity
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL_ACCOUNTS = "com.pushnotify/accounts"
    private val CHANNEL_RINGTONE = "com.pushnotify/ringtone"
    private val CHANNEL_SERVICE  = "com.pushnotify/alarm_service"
    private val REQUEST_PICK_ACCOUNT = 1002

    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

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
