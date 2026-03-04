package com.pushnotify.push_notify_app

import android.accounts.AccountManager
import android.app.Activity
import android.content.Intent
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "com.pushnotify/accounts"
    private val REQUEST_PICK_ACCOUNT = 1002

    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    // 방법 1: Account Picker 팝업 (공식 계정 선택 UI)
                    "showAccountPicker" -> {
                        pendingResult = result
                        showAccountPicker()
                    }
                    // 방법 2: AccountManager 직접 조회 (권한 있을 때)
                    "getGoogleAccounts" -> {
                        pendingResult = result
                        getAccountsDirect(result)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // ── Account Picker: 시스템 계정 선택 팝업 ──────────────────────
    // AccountManager.newChooseAccountIntent() 사용
    // GET_ACCOUNTS 권한 불필요, OAuth 불필요
    // 사용자가 선택한 이메일만 반환
    private fun showAccountPicker() {
        try {
            val intent = AccountManager.newChooseAccountIntent(
                null,           // 현재 선택된 계정 없음
                null,           // 허용 계정 목록 없음 (전체)
                arrayOf("com.google"), // Google 계정 타입만
                null,           // 설명 문자열
                null,           // 추가 계정 타입
                null,           // 옵션
                null            // 번들
            )
            startActivityForResult(intent, REQUEST_PICK_ACCOUNT)
        } catch (e: Exception) {
            // Activity not found 등
            pendingResult?.error("NO_PICKER", "계정 선택 창을 열 수 없습니다: ${e.message}", null)
            pendingResult = null
        }
    }

    // ── AccountManager 직접 조회 (보조 수단) ───────────────────────
    private fun getAccountsDirect(result: MethodChannel.Result) {
        try {
            val am = AccountManager.get(this)
            val accounts = am.getAccountsByType("com.google")
            val list = accounts.map { it.name }.filter { it.contains("@") }
            result.success(list)
        } catch (e: SecurityException) {
            // 권한 없으면 빈 목록 반환 (오류 X)
            result.success(emptyList<String>())
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
                    // 선택된 이메일 반환
                    result.success(email)
                } else {
                    result.error("NO_EMAIL", "이메일을 가져올 수 없습니다.", null)
                }
            } else {
                // 사용자가 취소
                result.error("CANCELLED", "계정 선택이 취소되었습니다.", null)
            }
        }
    }
}
