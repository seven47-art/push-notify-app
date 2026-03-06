package com.pushnotify.push_notify_app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * AlarmActionReceiver  v1.0.34
 *
 * 헤즈업 알림의 [거절] 버튼을 BroadcastReceiver로 처리
 *  - 알림 제거
 *  - CallForegroundService 중지 (WakeLock 해제)
 *  - 알람 상태 'rejected' 기록은 FakeCallActivity에서 처리하지 않으므로
 *    여기서는 단순히 알림만 제거
 */
class AlarmActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmActionReceiver"
        const val ACTION_DECLINE  = "com.pushnotify.ACTION_ALARM_DECLINE"
        const val EXTRA_ALARM_ID  = "alarm_id"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        Log.d(TAG, "거절 수신: alarmId=$alarmId")

        when (intent.action) {
            ACTION_DECLINE -> {
                // 알람 알림 제거
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.cancel(alarmId + 10000)

                // CallForegroundService 중지 (WakeLock + 포그라운드 알림 제거)
                CallForegroundService.stop(context)
            }
        }
    }
}
