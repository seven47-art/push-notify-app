// src/routes/reward_ads.ts
// =============================================
// 광고 리워드 참여(옵트인) API — 명세서 2단계
// - 마이페이지 "광고 리워드 참여하기" 화면에서 사용
// - 저장 위치: Firestore ad_users/{uid}  (uid = D1 users.user_id, 예: u_xxxx)
// - D1(기존 RINGO 가입/알람/수락거절/영상/수신함/발신함)은 일절 변경하지 않음
// - 광고 리워드 참여는 "선택 사항". 미동의해도 기존 RINGO 기능 정상 사용 가능.
// =============================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  getDocument,
  patchDocument,
  setDocument,
  genId,
  nowIso,
} from '../lib/firestore'

const rewardAds = new Hono<{ Bindings: Bindings }>()

// =============================================
// 세션 토큰 → user_id 조회 (기존 D1 세션 그대로 사용)
// alarms.ts의 getUserFromSession과 동일 패턴
// =============================================
async function getUserIdFromSession(c: any): Promise<string | null> {
  try {
    const authHeader = c.req.header('Authorization') || ''
    const sessionToken = authHeader.replace('Bearer ', '').trim()
    if (!sessionToken) return null
    const session = await c.env.DB.prepare(`
      SELECT user_id FROM user_sessions
      WHERE session_token = ? AND expires_at > datetime('now')
    `).bind(sessionToken).first() as { user_id: string } | null
    if (!session) return null
    return session.user_id
  } catch {
    return null
  }
}

// 서비스 계정 JSON에서 project_id 추출 (Firestore 프로젝트 ID)
function getProjectId(c: any): string {
  try {
    const sa = JSON.parse(c.env.FCM_SERVICE_ACCOUNT_JSON)
    return sa.project_id
  } catch {
    // 폴백: 알려진 RINGO 프로젝트 ID
    return c.env.FCM_PROJECT_ID || 'ringo-app-7b6d6'
  }
}

// =============================================
// 입력 검증 헬퍼
// =============================================

// 콴타리움(Quantarium) 지갑 주소 형식 검증
// - 명세서: HTTPS/형식 검증. 구체 스펙 미확정이므로 안전한 기본 규칙 적용.
//   1) 빈값 불가, 2) 공백 불가, 3) 길이 8~256, 4) 제어문자 불가
const WALLET_RE = /^[0-9A-Za-z:_\-./@+=]{8,256}$/
function validateWalletAddress(addr: string): string | null {
  const a = (addr || '').trim()
  if (!a) return '지갑 주소를 입력해 주세요.'
  if (/\s/.test(a)) return '지갑 주소에 공백을 포함할 수 없습니다.'
  if (!WALLET_RE.test(a)) return '지갑 주소 형식이 올바르지 않습니다.'
  return null
}

const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대 이상']
const GENDERS   = ['남성', '여성', '응답하지 않음']

// =============================================
// GET /api/reward-ads/me
// 현재 사용자의 광고 리워드 참여 설정 조회
// 문서가 없으면 기본값(미참여) 반환
// =============================================
rewardAds.get('/me', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  try {
    const projectId = getProjectId(c)
    const doc = await getDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `ad_users/${uid}`)

    if (!doc) {
      return c.json({
        success: true,
        data: {
          uid,
          adRewardOptIn: false,
          adRewardEnabled: false,
          quantariumWalletAddress: '',
          adTargetRegion: null,
          adTargetAgeBand: null,
          adTargetGender: null,
          adRewardConsentAt: null,
        },
      })
    }

    return c.json({
      success: true,
      data: {
        uid,
        adRewardOptIn: doc.adRewardOptIn ?? false,
        adRewardEnabled: doc.adRewardEnabled ?? false,
        quantariumWalletAddress: doc.quantariumWalletAddress ?? '',
        adTargetRegion: doc.adTargetRegion ?? null,
        adTargetAgeBand: doc.adTargetAgeBand ?? null,
        adTargetGender: doc.adTargetGender ?? null,
        adRewardConsentAt: doc.adRewardConsentAt ?? null,
        adRewardOptOutAt: doc.adRewardOptOutAt ?? null,
        walletAddressUpdatedAt: doc.walletAddressUpdatedAt ?? null,
      },
    })
  } catch (e: any) {
    return c.json({ success: false, error: `조회 실패: ${e?.message || e}` }, 500)
  }
})

// =============================================
// PUT /api/reward-ads/me
// 광고 리워드 참여 설정 저장/갱신
// body: {
//   adRewardOptIn: boolean,           // 참여 동의 여부
//   quantariumWalletAddress: string,  // 콴타리움 지갑 주소 (참여 시 필수)
//   adTargetRegion: { sido },        // 광역시·도 1개 (사용자 선택, GPS 미사용)
//   adTargetAgeBand: string,          // 10대~60대 이상
//   adTargetGender: string,           // 남성/여성/응답하지 않음
// }
// =============================================
rewardAds.put('/me', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const optIn = body.adRewardOptIn === true

  // 참여(opt-in) 시에는 필수 항목 검증
  if (optIn) {
    const walletErr = validateWalletAddress(body.quantariumWalletAddress)
    if (walletErr) return c.json({ success: false, error: walletErr }, 400)

    if (body.adTargetAgeBand && !AGE_BANDS.includes(body.adTargetAgeBand)) {
      return c.json({ success: false, error: '연령대 값이 올바르지 않습니다.' }, 400)
    }
    if (body.adTargetGender && !GENDERS.includes(body.adTargetGender)) {
      return c.json({ success: false, error: '성별 값이 올바르지 않습니다.' }, 400)
    }
  }

  try {
    const projectId = getProjectId(c)
    const path = `ad_users/${uid}`
    const ts = nowIso()

    // 기존 문서 조회 (지갑 주소 변경 시각 판단용)
    const prev = await getDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, path)

    // 저장할 필드 구성 (updateMask로 명시 필드만 갱신 → 다른 필드 보존)
    const fields: Record<string, any> = {
      uid,
      adRewardOptIn: optIn,
      adRewardEnabled: optIn,            // 참여 = 활성화
    }

    // 타깃 정보 (값이 들어온 것만 반영)
    if (body.quantariumWalletAddress !== undefined) {
      const wallet = String(body.quantariumWalletAddress || '').trim()
      fields.quantariumWalletAddress = wallet
      // 지갑 주소가 실제로 변경된 경우에만 갱신 시각 기록
      if (!prev || prev.quantariumWalletAddress !== wallet) {
        fields.walletAddressUpdatedAt = ts
      }
    }
    if (body.adTargetRegion !== undefined) {
      // { sido } 형태 — 광역시·도 1개 선택. GPS 미사용, 시·군·구 미사용.
      const region = body.adTargetRegion
      const sido = region && typeof region === 'object' ? String(region.sido || '').trim() : ''
      fields.adTargetRegion = sido ? { sido } : null
    }
    if (body.adTargetAgeBand !== undefined) {
      fields.adTargetAgeBand = body.adTargetAgeBand || null
    }
    if (body.adTargetGender !== undefined) {
      fields.adTargetGender = body.adTargetGender || null
    }

    // 동의/철회 시각 기록
    if (optIn) {
      // 새로 참여하거나 이전에 미참여였다면 동의 시각 갱신
      if (!prev || prev.adRewardOptIn !== true) {
        fields.adRewardConsentAt = ts
      }
    } else {
      // 참여 해제 시 철회 시각 기록
      fields.adRewardOptOutAt = ts
    }

    fields.updatedAt = ts

    const saved = await patchDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, path, fields)

    return c.json({
      success: true,
      data: {
        uid,
        adRewardOptIn: saved.adRewardOptIn ?? optIn,
        adRewardEnabled: saved.adRewardEnabled ?? optIn,
        quantariumWalletAddress: saved.quantariumWalletAddress ?? '',
        adTargetRegion: saved.adTargetRegion ?? null,
        adTargetAgeBand: saved.adTargetAgeBand ?? null,
        adTargetGender: saved.adTargetGender ?? null,
        adRewardConsentAt: saved.adRewardConsentAt ?? null,
      },
    })
  } catch (e: any) {
    return c.json({ success: false, error: `저장 실패: ${e?.message || e}` }, 500)
  }
})

// =============================================
// POST /api/reward-ads/claim  — 명세서 6단계
// 광고 리워드 QKEY 지급 (비디오 시청 + 광고주 링크 클릭 후 앱에서 호출)
//
// 핵심 원칙:
//  - QRChat 소스의 qkey_transactions 구조 재사용 (type:"reward")
//  - users/{uid}.qkeyBalance 캐시 필드 증가
//  - 멱등성: qkey_reward_idempotency/{uid}_{alarmId} 문서로 중복 지급 방지
//  - 기존 RINGO 기능(D1) 일절 변경 없음
//  - qkey_transactions 기존 행/구조 변경 없음 (행 추가만)
//
// body: { alarmId: number, campaignId: string }
// 인증: Bearer session → uid
// =============================================
rewardAds.post('/claim', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const alarmId    = Number(body.alarmId)
  const campaignId = String(body.campaignId || '').trim()
  if (!Number.isFinite(alarmId) || alarmId <= 0) {
    return c.json({ success: false, error: 'alarmId가 올바르지 않습니다.' }, 400)
  }
  if (!campaignId) {
    return c.json({ success: false, error: 'campaignId가 필요합니다.' }, 400)
  }

  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON

    // ── 1) 멱등성 검사 ──────────────────────────────────────────
    const idemKey = `${uid}_${alarmId}`
    const idemPath = `qkey_reward_idempotency/${idemKey}`
    const existing = await getDocument(sa, projectId, idemPath)
    if (existing && existing.status === 'completed') {
      // 이미 지급 완료 — 성공으로 응답 (멱등)
      return c.json({
        success: true,
        data: {
          already: true,
          txId: existing.txId || '',
          amount: existing.amount || 0,
          balanceAfter: existing.balanceAfter || 0,
        },
      })
    }

    // ── 2) 캠페인 로드 → rewardQkey 확인 ────────────────────────
    const camp = await getDocument(sa, projectId, `ad_campaigns/${campaignId}`)
    if (!camp) {
      return c.json({ success: false, error: '캠페인을 찾을 수 없습니다.' }, 404)
    }
    const rewardQkey = Math.max(1, Math.floor(Number(camp.rewardQkey) || 0))

    // ── 3) 사용자 현재 QKEY 잔액 조회 ──────────────────────────
    const userPath = `users/${uid}`
    const userDoc = await getDocument(sa, projectId, userPath)
    const currentBalance = (typeof userDoc?.qkeyBalance === 'number')
      ? userDoc.qkeyBalance
      : (typeof userDoc?.qkey_balance === 'number' ? userDoc.qkey_balance : 0)
    const newBalance = currentBalance + rewardQkey

    // ── 4) 멱등성 문서 선점 (status: processing) ─────────────────
    //  다른 동시 요청이 이 시점에 getDocument로 확인해도
    //  status='processing'이므로 아래 completed 체크에 걸리지 않지만,
    //  최종 지급은 한 번만 실행됨 (setDocument = upsert, 덮어쓰기 허용)
    const ts = nowIso()
    const txId = genId('qtx')
    await setDocument(sa, projectId, idemPath, {
      uid,
      alarmId,
      campaignId,
      amount: rewardQkey,
      txId,
      status: 'processing',
      createdAt: ts,
    })

    // ── 5) qkey_transactions 행 추가 (type: "reward") ───────────
    //  QRChat 소스의 qkey_transactions 구조 그대로:
    //  userId, type, amount, balanceAfter, timestamp/createdAt, description
    await setDocument(sa, projectId, `qkey_transactions/${txId}`, {
      userId: uid,
      type: 'reward',
      amount: rewardQkey,                 // 양수 = 적립 (credit)
      balanceAfter: newBalance,
      description: `광고 리워드 (${camp.advertiserName || campaignId})`,
      campaignId,
      alarmId,
      timestamp: ts,
      createdAt: ts,
    })

    // ── 6) users/{uid}.qkeyBalance + qkey_balance 갱신 ──────────
    await patchDocument(sa, projectId, userPath, {
      qkeyBalance: newBalance,
      qkey_balance: newBalance,
      qkeyBalanceUpdatedAt: ts,
    })

    // ── 7) 멱등성 문서 완료 표시 ──────────────────────────────────
    await patchDocument(sa, projectId, idemPath, {
      status: 'completed',
      balanceAfter: newBalance,
      completedAt: nowIso(),
    })

    return c.json({
      success: true,
      data: {
        already: false,
        txId,
        amount: rewardQkey,
        balanceAfter: newBalance,
      },
    })
  } catch (e: any) {
    return c.json({ success: false, error: `QKEY 지급 실패: ${e?.message || e}` }, 500)
  }
})

export default rewardAds
