package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "com.pushnotify/accounts"
    private val REQUEST_CODE_PICK_ACCOUNT = 1001
    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    // 기기에 등록된 Google 계정 이메일 목록 반환
                    "getGoogleAccounts" -> {
                        try {
                            val am = AccountManager.get(this)
                            val accounts = am.getAccountsByType("com.google")
                            val emails = accounts.map { it.name }
                            result.success(emails)
                        } catch (e: Exception) {
                            result.error("ACCOUNT_ERROR", e.message, null)
                        }
                    }
                    // 시스템 계정 선택 다이얼로그 표시
                    "pickAccount" -> {
                        try {
                            pendingResult = result
                            val intent = AccountManager.newChooseAccountIntent(
                                null, null,
                                arrayOf("com.google"),
                                null, null, null, null
                            )
                            startActivityForResult(intent, REQUEST_CODE_PICK_ACCOUNT)
                        } catch (e: Exception) {
                            result.error("PICK_ERROR", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CODE_PICK_ACCOUNT) {
            val result = pendingResult
            pendingResult = null
            if (resultCode == RESULT_OK && data != null) {
                val email = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
                result?.success(email)
            } else {
                result?.success(null)
            }
        }
    }
}
