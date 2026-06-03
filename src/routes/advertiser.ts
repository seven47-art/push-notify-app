// src/routes/advertiser.ts
// ──────────────────────────────────────────────────────────────
// 광고주 전용 포털 (PC 페이지 + API)
//  - 인증: 이메일(email) + 지갑주소(walletAddress) — advertisers 컬렉션 매칭
//  - 기능: 내 캠페인 목록 / 성과 통계 / 캠페인 생성·수정 / 잔액·정산
//  - 기존 링고(RinGo) 코드/로직은 일절 건드리지 않음 (신규 라우트만 추가)
//  - 실제 FCM 발송(dispatch)은 어드민 권한이 필요하므로 광고주는 'draft'까지만.
// ──────────────────────────────────────────────────────────────
import { Hono } from 'hono'
import { setCookie, getCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import {
  listDocuments,
  getDocument,
  setDocument,
  patchDocument,
  genId,
  nowIso,
} from '../lib/firestore'
import { advertiserPortalHTML } from './advertiser_html'

const advertiser = new Hono<{ Bindings: Bindings }>()

// 컬렉션명 (admin.ts와 동일)
const COL_ADVERTISERS = 'advertisers'
const COL_CAMPAIGNS   = 'ad_campaigns'
const COL_DISPATCHES  = 'ad_dispatches'
const COL_EVENTS      = 'ad_events'          // 신규: 시청/클릭 트래킹
const COL_TXNS        = 'qkey_transactions'
const COL_ADV_SESSION = 'advertiser_sessions' // 신규: 광고주 세션 토큰

function getAdProjectId(c: any): string {
  try {
    const sa = JSON.parse(c.env.FCM_SERVICE_ACCOUNT_JSON)
    return sa.project_id
  } catch {
    return c.env.FCM_PROJECT_ID || 'ringo-app-7b6d6'
  }
}

function genToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── 세션 검증: 쿠키 토큰 → advertiser_sessions/{token} → advertiserId 반환 ──
async function currentAdvertiser(c: any): Promise<{ id: string; doc: any } | null> {
  const token = getCookie(c, 'adv_session')
  if (!token) return null
  const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
  const pid = getAdProjectId(c)
  try {
    const sess = await getDocument(sa, pid, `${COL_ADV_SESSION}/${token}`)
    if (!sess || !sess.advertiserId) return null
    // 만료 체크 (7일)
    if (sess.expiresAt && new Date(sess.expiresAt).getTime() < Date.now()) return null
    const doc = await getDocument(sa, pid, `${COL_ADVERTISERS}/${sess.advertiserId}`)
    if (!doc || doc.active === false) return null
    return { id: sess.advertiserId, doc }
  } catch {
    return null
  }
}

// ════════════════════════════════════════════════════════════
//  페이지 (PC)
// ════════════════════════════════════════════════════════════
advertiser.get('/', (c) => c.redirect('/advertiser/portal'))

advertiser.get('/portal', (c) => {
  return c.html(advertiserPortalHTML())
})

// ════════════════════════════════════════════════════════════
//  인증 API
// ════════════════════════════════════════════════════════════

// POST /advertiser/api/login  { email, walletAddress }
advertiser.post('/api/login', async (c) => {
  try {
    const body = await c.req.json()
    const email  = String(body.email || '').trim().toLowerCase()
    const wallet = String(body.walletAddress || '').trim()
    if (!email || !wallet) {
      return c.json({ success: false, error: '이메일과 지갑주소를 모두 입력하세요.' }, 400)
    }

    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)

    // advertisers 전체 조회 후 email+wallet 매칭 (대소문자 무시)
    const items = await listDocuments(sa, pid, COL_ADVERTISERS, { pageSize: 1000 })
    const matched = items.find((a: any) =>
      String(a.email || '').trim().toLowerCase() === email &&
      String(a.walletAddress || '').trim().toLowerCase() === wallet.toLowerCase()
    )

    if (!matched) {
      return c.json({ success: false, error: '일치하는 광고주 계정이 없습니다. 이메일/지갑주소를 확인하세요.' }, 401)
    }
    if (matched.active === false) {
      return c.json({ success: false, error: '비활성화된 광고주 계정입니다. 관리자에게 문의하세요.' }, 403)
    }

    const advId = String(matched.advertiserId || matched._id)
    const token = genToken()
    const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString()
    await setDocument(sa, pid, `${COL_ADV_SESSION}/${token}`, {
      token,
      advertiserId: advId,
      email,
      createdAt: nowIso(),
      expiresAt,
    })
    setCookie(c, 'adv_session', token, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 86400 * 7, path: '/' })
    return c.json({ success: true, data: { advertiserId: advId, name: matched.name } })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// POST /advertiser/api/logout
advertiser.post('/api/logout', async (c) => {
  const token = getCookie(c, 'adv_session')
  setCookie(c, 'adv_session', '', { httpOnly: true, secure: true, maxAge: 0, path: '/' })
  if (token) {
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    try { await patchDocument(sa, pid, `${COL_ADV_SESSION}/${token}`, { expiresAt: nowIso() }) } catch {}
  }
  return c.json({ success: true })
})

// GET /advertiser/api/me  — 내 정보 + 잔액
advertiser.get('/api/me', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  const d = me.doc
  return c.json({
    success: true,
    data: {
      advertiserId: me.id,
      name: d.name || '',
      email: d.email || '',
      contact: d.contact || '',
      walletAddress: d.walletAddress || '',
      balanceQkey: Math.floor(Number(d.balanceQkey) || 0),
    },
  })
})

// ════════════════════════════════════════════════════════════
//  내 캠페인 + 통계
// ════════════════════════════════════════════════════════════

// 캠페인별 통계 집계 (dispatch sentCount, claim 수/지급 QKEY, 이벤트 view/click)
async function aggregateStats(sa: string, pid: string, campaignIds: Set<string>) {
  const stat: Record<string, any> = {}
  for (const cid of campaignIds) {
    stat[cid] = { sentCount: 0, targetCount: 0, claimCount: 0, paidQkey: 0, viewCount: 0, clickCount: 0 }
  }

  // 1) 발송 이력 (ad_dispatches)
  try {
    const disp = await listDocuments(sa, pid, COL_DISPATCHES, { pageSize: 1000 })
    for (const d of disp) {
      const cid = String(d.campaignId || '')
      if (stat[cid]) {
        stat[cid].sentCount   += Number(d.sentCount || 0)
        stat[cid].targetCount += Number(d.targetCount || 0)
      }
    }
  } catch {}

  // 2) QKEY 지급 (qkey_transactions, type=reward)
  try {
    const txns = await listDocuments(sa, pid, COL_TXNS, { pageSize: 2000 })
    for (const t of txns) {
      if (String(t.type) !== 'reward') continue
      const cid = String(t.campaignId || '')
      if (stat[cid]) {
        stat[cid].claimCount += 1
        stat[cid].paidQkey   += Number(t.amount || 0)
      }
    }
  } catch {}

  // 3) 이벤트 트래킹 (ad_events: view | click)
  try {
    const evts = await listDocuments(sa, pid, COL_EVENTS, { pageSize: 2000 })
    for (const e of evts) {
      const cid = String(e.campaignId || '')
      if (!stat[cid]) continue
      if (e.type === 'view')  stat[cid].viewCount  += 1
      if (e.type === 'click') stat[cid].clickCount += 1
    }
  } catch {}

  return stat
}

// GET /advertiser/api/campaigns — 내 캠페인 + 통계
advertiser.get('/api/campaigns', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  try {
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    const all = await listDocuments(sa, pid, COL_CAMPAIGNS, { pageSize: 1000 })
    const mine = all.filter((x: any) => String(x.advertiserId || '') === me.id)
    mine.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

    const ids = new Set(mine.map((x: any) => String(x.campaignId || x._id)))
    const stat = await aggregateStats(sa, pid, ids)

    const data = mine.map((x: any) => {
      const cid = String(x.campaignId || x._id)
      return { ...x, campaignId: cid, _stat: stat[cid] || {} }
    })
    return c.json({ success: true, data })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /advertiser/api/summary — 전체 합계 통계
advertiser.get('/api/summary', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  try {
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    const all = await listDocuments(sa, pid, COL_CAMPAIGNS, { pageSize: 1000 })
    const mine = all.filter((x: any) => String(x.advertiserId || '') === me.id)
    const ids = new Set(mine.map((x: any) => String(x.campaignId || x._id)))
    const stat = await aggregateStats(sa, pid, ids)

    const sum = { campaigns: mine.length, sentCount: 0, claimCount: 0, paidQkey: 0, viewCount: 0, clickCount: 0 }
    for (const cid of ids) {
      const s = stat[cid] || {}
      sum.sentCount  += s.sentCount  || 0
      sum.claimCount += s.claimCount || 0
      sum.paidQkey   += s.paidQkey   || 0
      sum.viewCount  += s.viewCount  || 0
      sum.clickCount += s.clickCount || 0
    }
    return c.json({ success: true, data: sum })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ════════════════════════════════════════════════════════════
//  캠페인 생성/수정 (광고주 본인) — status는 항상 'draft' (발송은 어드민)
// ════════════════════════════════════════════════════════════

// POST /advertiser/api/campaigns
advertiser.post('/api/campaigns', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  try {
    const body = await c.req.json()
    const title     = String(body.title || '').trim()
    const videoUrl  = String(body.videoUrl || '').trim()
    const linkUrl   = String(body.linkUrl || '').trim()
    const rewardQkey = Number(body.rewardQkey)

    if (!title)     return c.json({ success: false, error: '캠페인명을 입력하세요.' }, 400)
    if (!videoUrl)  return c.json({ success: false, error: '광고 영상 URL을 입력하세요.' }, 400)
    if (!linkUrl)   return c.json({ success: false, error: '광고주 링크 URL을 입력하세요.' }, 400)
    if (!Number.isFinite(rewardQkey) || rewardQkey <= 0) {
      return c.json({ success: false, error: '지급 QKEY는 1 이상의 숫자여야 합니다.' }, 400)
    }
    if (!/^https?:\/\//i.test(videoUrl)) return c.json({ success: false, error: '영상 URL 형식이 올바르지 않습니다.' }, 400)
    if (!/^https?:\/\//i.test(linkUrl))  return c.json({ success: false, error: '링크 URL 형식이 올바르지 않습니다.' }, 400)

    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    const id  = genId('camp')
    const ts  = nowIso()
    const data = {
      campaignId: id,
      advertiserId: me.id,
      advertiserName: me.doc.name || '',
      title,
      videoType: String(body.videoType || 'youtube'),
      videoUrl,
      linkUrl,
      rewardQkey: Math.floor(rewardQkey),
      targetRegion: body.targetRegion || null,
      targetAgeBand: body.targetAgeBand || null,
      targetGender: body.targetGender || null,
      status: 'draft',           // 광고주는 draft까지 — 발송 승인은 어드민
      active: true,
      createdBy: 'advertiser',
      createdAt: ts,
      updatedAt: ts,
    }
    await setDocument(sa, pid, `${COL_CAMPAIGNS}/${id}`, data)
    return c.json({ success: true, data })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// PUT /advertiser/api/campaigns/:id — 본인 캠페인만
advertiser.put('/api/campaigns/:id', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  try {
    const id = c.req.param('id')
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)

    const existing = await getDocument(sa, pid, `${COL_CAMPAIGNS}/${id}`)
    if (!existing) return c.json({ success: false, error: '캠페인을 찾을 수 없습니다.' }, 404)
    if (String(existing.advertiserId || '') !== me.id) {
      return c.json({ success: false, error: '본인 캠페인만 수정할 수 있습니다.' }, 403)
    }

    const body = await c.req.json()
    const patch: Record<string, any> = { updatedAt: nowIso() }
    if (body.title !== undefined)     patch.title = String(body.title || '').trim()
    if (body.videoType !== undefined) patch.videoType = String(body.videoType || 'youtube')
    if (body.videoUrl !== undefined) {
      const v = String(body.videoUrl || '').trim()
      if (v && !/^https?:\/\//i.test(v)) return c.json({ success: false, error: '영상 URL 형식이 올바르지 않습니다.' }, 400)
      patch.videoUrl = v
    }
    if (body.linkUrl !== undefined) {
      const v = String(body.linkUrl || '').trim()
      if (v && !/^https?:\/\//i.test(v)) return c.json({ success: false, error: '링크 URL 형식이 올바르지 않습니다.' }, 400)
      patch.linkUrl = v
    }
    if (body.rewardQkey !== undefined) {
      const q = Number(body.rewardQkey)
      if (!Number.isFinite(q) || q <= 0) return c.json({ success: false, error: '지급 QKEY는 1 이상이어야 합니다.' }, 400)
      patch.rewardQkey = Math.floor(q)
    }
    if (body.active !== undefined) patch.active = !!body.active

    const saved = await patchDocument(sa, pid, `${COL_CAMPAIGNS}/${id}`, patch)
    return c.json({ success: true, data: saved })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ════════════════════════════════════════════════════════════
//  정산 내역 (QKEY 차감/충전 기록 — advertiser_ledger)
// ════════════════════════════════════════════════════════════
advertiser.get('/api/ledger', async (c) => {
  const me = await currentAdvertiser(c)
  if (!me) return c.json({ success: false, error: 'Unauthorized' }, 401)
  try {
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    const all = await listDocuments(sa, pid, 'advertiser_ledger', { pageSize: 1000 })
    const mine = all
      .filter((x: any) => String(x.advertiserId || '') === me.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return c.json({ success: true, data: mine, balanceQkey: Math.floor(Number(me.doc.balanceQkey) || 0) })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ════════════════════════════════════════════════════════════
//  공개 트래킹 엔드포인트 (앱/플레이어가 호출) — 인증 불필요
//   POST /advertiser/api/track  { campaignId, type: 'view'|'click', uid? }
//   ※ 신규 컬렉션 ad_events 에만 기록 → 기존 로직 영향 없음
// ════════════════════════════════════════════════════════════
advertiser.post('/api/track', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const campaignId = String(body.campaignId || '').trim()
    const type = String(body.type || '').trim()
    if (!campaignId || (type !== 'view' && type !== 'click')) {
      return c.json({ success: false, error: 'campaignId와 type(view|click)이 필요합니다.' }, 400)
    }
    const sa  = c.env.FCM_SERVICE_ACCOUNT_JSON || ''
    const pid = getAdProjectId(c)
    const id  = genId('evt')
    await setDocument(sa, pid, `${COL_EVENTS}/${id}`, {
      eventId: id,
      campaignId,
      type,
      uid: String(body.uid || '').trim() || null,
      createdAt: nowIso(),
    })
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

export default advertiser
