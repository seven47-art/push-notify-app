package com.pushnotify.push_notify_app

import android.Manifest
import android.accounts.AccountManager
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "com.pushnotify/accounts"
    private val REQUEST_CODE_ACCOUNTS = 1001

    // 권한 요청 후 결과를 Flutter로 보내기 위한 콜백
    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getGoogleAccounts" -> {
                        pendingResult = result
                        fetchGoogleAccounts(result)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun fetchGoogleAccounts(result: MethodChannel.Result) {
        // Android 8.0(API 26) 이상: GET_ACCOUNTS는 런타임 권한 필요
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val hasPermission = ContextCompat.checkSelfPermission(
                this, Manifest.permission.GET_ACCOUNTS
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasPermission) {
                // 권한 요청 → onRequestPermissionsResult에서 처리
                pendingResult = result
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.GET_ACCOUNTS),
                    REQUEST_CODE_ACCOUNTS
                )
                return
            }
        }

        // 권한 있음 → 계정 읽기
        sendAccountsToFlutter(result)
    }

    private fun sendAccountsToFlutter(result: MethodChannel.Result) {
        try {
            val accountManager = AccountManager.get(this)
            val accounts = accountManager.getAccountsByType("com.google")
            val emailList = accounts
                .map { it.name }
                .filter { it.contains("@") }
            result.success(emailList)
        } catch (e: SecurityException) {
            result.error("PERMISSION_DENIED", "GET_ACCOUNTS 권한이 거부되었습니다.", null)
        } catch (e: Exception) {
            result.error("ERROR", e.message, null)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_CODE_ACCOUNTS) {
            val result = pendingResult ?: return
            pendingResult = null

            if (grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // 권한 허용 → 계정 읽기
                sendAccountsToFlutter(result)
            } else {
                // 권한 거부 → 빈 목록 반환 (Flutter에서 수동 입력 폴백)
                result.success(emptyList<String>())
            }
        }
    }
}
