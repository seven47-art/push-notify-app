package com.pushnotify.push_notify_app

import android.app.NotificationManager
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * RinGoFCMService
 *
 * FCM data-only 메시지 수신 → FakeCallActivity 직접 표시
 * - 앱이 꺼진 상태(background/killed)에서도 동작
 * - 포그라운드 서비스(AlarmPollingService) 불필요
 * - 알림(Notification) 드로어에 아무것도 안 남음
 */
class RinGoFCMService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "RinGoFCMService"
    }

    /**
     * FCM 메시지 수신 (앱 상태 무관하게 항상 호출됨)
     * data-only 메시지는 앱이 완전히 꺼진 상태에서도 이 메서드가 호출됨
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        Log.d(TAG, "FCM 메시지 수신: ${message.data}")

        val data = message.data

        // alarm 타입 메시지만 처리
        val msgType = data["type"] ?: return
        if (msgType != "alarm") return

        val channelName = data["channel_name"] ?: "알람"
        val alarmMsgType = data["msg_type"]    ?: "youtube"
        val msgValue     = data["msg_value"]   ?: ""
        val alarmId      = data["alarm_id"]?.toIntOrNull() ?: 0
        val contentUrl   = data["content_url"] ?: ""

        Log.d(TAG, "알람 수신 → FakeCallActivity 시작: $channelName / $alarmMsgType")

        // FakeCallActivity 직접 시작 (fullScreenIntent 방식)
        // FCM 서비스에서는 startActivity 직접 가능
        FakeCallActivity.start(
            context     = applicationContext,
            channelName = channelName,
            msgType     = alarmMsgType,
            msgValue    = msgValue,
            alarmId     = alarmId,
            contentUrl  = contentUrl
        )
    }

    /**
     * FCM 토큰 갱신 시 호출 - 서버에 새 토큰 등록
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM 토큰 갱신: $token")
        // Flutter 앱에서 토큰을 처리하므로 여기서는 로그만 남김
        // Flutter의 FirebaseMessaging.instance.onTokenRefresh 스트림으로 전달됨
    }
}
