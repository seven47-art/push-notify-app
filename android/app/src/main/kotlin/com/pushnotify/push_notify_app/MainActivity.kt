package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "com.pushnotify/accounts"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getGoogleAccounts" -> {
                        try {
                            val accountManager = AccountManager.get(this)
                            // "com.google" 타입 = 기기에 로그인된 구글 계정
                            val accounts = accountManager.getAccountsByType("com.google")
                            val emailList = accounts
                                .map { it.name }
                                .filter { it.contains("@") }
                            result.success(emailList)
                        } catch (e: SecurityException) {
                            // GET_ACCOUNTS 권한 없을 경우
                            result.error("PERMISSION_DENIED", "GET_ACCOUNTS 권한이 없습니다.", null)
                        } catch (e: Exception) {
                            result.error("ERROR", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
