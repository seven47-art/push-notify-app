package com.pushnotify.push_notify_app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * AlarmScheduler
 *
 * 역할: AlarmManager.setExactAndAllowWhileIdle()로 정확한 시간에 AlarmReceiver를 실행 예약
 *       도즈(Doze) 모드, 배터리 최적화를 무시하고 반드시 실행됨
 *
 * 사용처:
 *   - RinGoFCMService: FCM type=alarm_schedule 수신 시 호출
 *   - BootReceiver: 부팅 후 저장된 알람 복원 시 호출 (추후 구현 가능)
 */
object AlarmScheduler {

    private const val TAG = "AlarmScheduler"

    /**
     * 알람 예약
     * @param context      Context
     * @param alarmId      알람 고유 ID (alarm_schedules.id)
     * @param scheduledMs  알람 실행 시각 (Unix timestamp, ms)
     * @param channelName  채널명
     * @param msgType      메시지 타입 (youtube/audio/video)
     * @param msgValue     메시지 값 (URL 등)
     * @param contentUrl   콘텐츠 스트림 URL
     * @param homepageUrl  채널 홈페이지 URL
     */
    fun schedule(
        context: Context,
        alarmId: Int,
        scheduledMs: Long,
        channelName: String,
        msgType: String,
        msgValue: String,
        contentUrl: String,
        homepageUrl: String = ""
    ) {
        val nowMs = System.currentTimeMillis()
        if (scheduledMs <= nowMs) {
            Log.w(TAG, "예약 시간이 이미 지남: alarmId=$alarmId, scheduledMs=$scheduledMs, now=$nowMs")
            // [v1.0.37] 이미 지난 알람은 즉시 풀스크린으로 실행
            AlarmPollingService.triggerAlarm(context, channelName, msgType, msgValue, alarmId, contentUrl, homepageUrl)
            return
        }

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_ALARM
            putExtra(AlarmReceiver.EXTRA_ALARM_ID,     alarmId)
            putExtra(AlarmReceiver.EXTRA_CHANNEL_NAME, channelName)
            putExtra(AlarmReceiver.EXTRA_MSG_TYPE,     msgType)
            putExtra(AlarmReceiver.EXTRA_MSG_VALUE,    msgValue)
            putExtra(AlarmReceiver.EXTRA_CONTENT_URL,  contentUrl)
            putExtra(AlarmReceiver.EXTRA_HOMEPAGE_URL, homepageUrl)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val pi = PendingIntent.getBroadcast(context, alarmId, intent, flags)

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Android 6.0+ : 도즈 모드 무시하고 정확한 시간에 실행
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, scheduledMs, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, scheduledMs, pi)
            }

            val diffSec = (scheduledMs - nowMs) / 1000
            Log.d(TAG, "알람 예약 완료: id=$alarmId, $channelName, ${diffSec}초 후 (${scheduledMs})")
        } catch (e: SecurityException) {
            Log.e(TAG, "SCHEDULE_EXACT_ALARM 권한 없음: ${e.message}")
            // 권한 없을 경우 부정확한 알람으로 폴백
            am.set(AlarmManager.RTC_WAKEUP, scheduledMs, pi)
        }
    }

    /**
     * 예약된 알람 취소
     * @param context  Context
     * @param alarmId  취소할 알람 ID
     */
    fun cancel(context: Context, alarmId: Int) {
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = AlarmReceiver.ACTION_ALARM
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val pi = PendingIntent.getBroadcast(context, alarmId, intent, flags)
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pi)
        Log.d(TAG, "알람 취소: id=$alarmId")
    }
}
