// scripts/alarm-cron.js
// 알람 자동 발송 크론 스크립트
// 서버와 별도로 실행되어 1분마다 알람 트리거를 폴링
// PM2로 실행: pm2 start scripts/alarm-cron.js --name alarm-cron

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'
const INTERVAL_MS = 60 * 1000 // 1분

console.log(`[AlarmCron] 시작 - 서버: ${SERVER_URL}, 인터벌: ${INTERVAL_MS/1000}초`)

async function triggerAlarms() {
  try {
    const res = await fetch(`${SERVER_URL}/api/alarms/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await res.json()
    if (data.triggered > 0) {
      console.log(`[AlarmCron] ${new Date().toISOString()} - 알람 발송: ${data.triggered}건`)
      data.results?.forEach(r => {
        console.log(`  - 채널: ${r.channel_name}, 대상: ${r.total_targets}명, 발송: ${r.sent_count}명`)
      })
    }
    // else: 발송할 알람 없음 (조용히 무시)
  } catch (e) {
    // 서버 미준비 상태 등 오류는 조용히 무시 (재시도는 setInterval로 자동)
  }
}

// 서버 준비 대기 후 시작 (10초 후 첫 실행)
setTimeout(() => {
  triggerAlarms()
  setInterval(triggerAlarms, INTERVAL_MS)
}, 10 * 1000)
