package com.pushnotify.push_notify_app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * AlarmDismissReceiver
 *
 * 상태바 그룹 알림의 "수신함 바로가기" 버튼 클릭 시 호출됩니다.
 *  1) 그룹 알림(GROUP_NOTIF_ID) 취소
 *  2) pendingChannelNames 초기화
 *  3) 앱을 수신함 탭(index=3)으로 이동
 */
class AlarmDismissReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "AlarmDismissReceiver"
        const val ACTION_OPEN_INBOX =
            "com.pushnotify.push_notify_app.ACTION_OPEN_INBOX"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "onReceive: ACTION_OPEN_INBOX")

        // 1) 그룹 알림 취소
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(AlarmPollingService.GROUP_NOTIF_ID)

        // 2) 채널명 목록 초기화 (다음 알람 사이클에 깨끗하게 시작)
        AlarmPollingService.clearPendingChannels()

        // 3) 앱 실행 + 수신함 탭 이동
        val launchIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("open_tab", "inbox")
            } ?: return

        context.startActivity(launchIntent)
    }
}
