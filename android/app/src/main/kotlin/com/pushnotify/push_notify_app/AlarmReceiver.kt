package com.pushnotify.push_notify_app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * AlarmReceiver
 *
 * 역할: AlarmManager.setExactAndAllowWhileIdle() 예약 시간에 OS가 깨우는 BroadcastReceiver
 *       도즈(Doze) 모드, 배터리 최적화 완전 무시
 *
 * ★ 기본 알람 앱과 동일한 방식:
 *   분기 없이 무조건 nm.notify(fullScreenIntent) 한 가지만 사용
 *   - fullScreenIntent = OS가 공식 허가한 잠금화면 위 Activity 실행 방법
 *   - FakeCallActivity 내부에서 FLAG_SHOW_WHEN_LOCKED + FLAG_TURN_SCREEN_ON 처리
 *   - 화면 ON 상태 → OS가 자동으로 헤즈업으로 표시 (정상)
 *   - 화면 OFF/잠금 → OS가 fullScreenIntent로 FakeCallActivity 실행 (정상)
 *
 * 흐름:
 *   AlarmManager 트리거 → AlarmReceiver.onReceive()
 *   → nm.notify(fullScreenIntent)  ← 잠금화면/꺼진 화면에서 풀스크린
 *   → CallForegroundService.start() ← WakeLock으로 화면 강제 켜기 보조
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AlarmReceiver"

        const val ACTION_ALARM  = "com.pushnotify.push_notify_app.ACTION_ALARM"
        const val ACTION_CANCEL = "com.pushnotify.push_notify_app.ACTION_CANCEL_ALARM"

        const val EXTRA_ALARM_ID     = "alarm_id"
        const val EXTRA_CHANNEL_NAME = "channel_name"
        const val EXTRA_MSG_TYPE     = "msg_type"
        const val EXTRA_MSG_VALUE    = "msg_value"
        const val EXTRA_CONTENT_URL  = "content_url"
        const val EXTRA_HOMEPAGE_URL = "homepage_url"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_ALARM  -> handleAlarm(context, intent)
            ACTION_CANCEL -> handleCancel(context, intent)
            else          -> Log.w(TAG, "알 수 없는 액션: ${intent.action}")
        }
    }

    private fun handleAlarm(context: Context, intent: Intent) {
        val alarmId     = intent.getIntExtra(EXTRA_ALARM_ID,        0)
        val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: "알람"
        val msgType     = intent.getStringExtra(EXTRA_MSG_TYPE)     ?: "youtube"
        val msgValue    = intent.getStringExtra(EXTRA_MSG_VALUE)    ?: ""
        val contentUrl  = intent.getStringExtra(EXTRA_CONTENT_URL)  ?: ""
        val homepageUrl = intent.getStringExtra(EXTRA_HOMEPAGE_URL) ?: ""

        Log.d(TAG, "AlarmManager 트리거: $channelName (id=$alarmId)")

        // 중복 방지
        if (AlarmPollingService.isFcmHandled(context, alarmId)) {
            Log.d(TAG, "alarm $alarmId → 이미 처리됨, 스킵")
            return
        }
        AlarmPollingService.markFcmHandled(context, alarmId)

        // ★ AlarmManager 예약 취소 — 실행 후 재부팅/재시작 시 재발동 방지
        AlarmScheduler.cancel(context, alarmId)

        // ① WakeLock 먼저 — 화면을 강제로 깨움 (fullScreenIntent 실행 전 화면 켜기)
        //    기본 알람 앱도 동일하게 WakeLock으로 화면 먼저 켬
        CallForegroundService.start(
            context, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
        )

        // ② nm.notify(fullScreenIntent) — 기본 알람과 동일한 방식
        //    - 화면 OFF/잠금 상태: OS가 fullScreenIntent로 FakeCallActivity 전체화면 실행
        //    - 화면 ON 상태: OS가 자동으로 헤즈업 표시
        //    FakeCallActivity 내부에 setShowWhenLocked(true) + setTurnScreenOn(true) 이미 설정됨
        AlarmPollingService.showAlarm(
            context, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl
        )

        Log.d(TAG, "알람 처리 완료: $channelName (id=$alarmId)")
    }

    private fun handleCancel(context: Context, intent: Intent) {
        val alarmId = intent.getIntExtra(EXTRA_ALARM_ID, 0)
        Log.d(TAG, "알람 취소: id=$alarmId")
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(alarmId + 10000)
    }
}
