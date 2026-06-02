// src/routes/cookie_mall.ts
// =============================================
// 쿠키몰 (QKEY 몰) API — 명세서 7단계
// - QRChat의 qkey_mall.js를 Cloudflare Workers + Firestore REST로 재구현
// - Cloud Functions / cloud_firestore / cloud_functions 의존성 없음 (pubspec.yaml 불변)
// - 기존 RINGO 기능(D1)은 일절 변경하지 않음
// - Firestore 컬렉션:
//   qkey_mall_products/{productId}     상품 카탈로그
//   qkey_mall_orders/{orderId}         주문/쿠폰 발행 기록
//   qkey_mall_categories/{categoryId}  동적 카테고리 메타
//   qkey_mall_idempotency/{idemKey}    중복 차감 방지 키
//   qkey_transactions/{txId}           포인트 거래 원장 (기존 구조 재사용)
//   users/{uid}                        잔액 캐시 (qkeyBalance / qkey_balance)
// - 환율: 1 QKEY = 10 KRW (QRChat 동일)
// - Giftishow Biz API 연동: Phase 7에서는 Mock 모드 (Secret 미설정 = 자동 차단)
//   실제 발행은 기프티쇼 비즈 계약 + 환경변수 등록 후 활성화
// =============================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import {
  getDocument,
  patchDocument,
  setDocument,
  deleteDocument,
  listDocuments,
  genId,
  nowIso,
} from '../lib/firestore'

const cookieMall = new Hono<{ Bindings: Bindings }>()

// =============================================
// 상수
// =============================================
const QKEY_PER_KRW = 10
const TX_TYPE_REDEEM = 'qkey_mall_redeem'
const TX_TYPE_REFUND = 'qkey_mall_refund'

const ORDER_STATUS = {
  PENDING: 'pending',
  ISSUED: 'issued',
  USED: 'used',
  EXPIRED: 'expired',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const

// =============================================
// 세션 → user_id (기존 D1 패턴)
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

function getProjectId(c: any): string {
  try {
    const sa = JSON.parse(c.env.FCM_SERVICE_ACCOUNT_JSON)
    return sa.project_id
  } catch {
    return c.env.FCM_PROJECT_ID || 'ringo-app-7b6d6'
  }
}

// =============================================
// Giftishow Biz API 헬퍼
// 환경변수 미설정 시 mock 모드 → 실제 쿠폰 미발행
// =============================================
function isGiftishowConfigured(c: any): boolean {
  try {
    const env = c.env as any
    return !!(
      env.GIFTISHOW_CUSTOM_AUTH_CODE &&
      env.GIFTISHOW_CUSTOM_AUTH_TOKEN &&
      env.GIFTISHOW_USER_ID
    )
  } catch {
    return false
  }
}

const GIFTISHOW_BASE = 'https://bizapi.giftishow.com'

async function giftishowCall(
  c: any,
  apiCode: string,
  apiPath: string,
  params: Record<string, string> = {}
): Promise<{ ok: boolean; json: any; httpStatus: number }> {
  const env = c.env as any
  const urlParams = new URLSearchParams()
  urlParams.append('api_code', apiCode)
  urlParams.append('custom_auth_code', env.GIFTISHOW_CUSTOM_AUTH_CODE || '')
  urlParams.append('custom_auth_token', env.GIFTISHOW_CUSTOM_AUTH_TOKEN || '')
  urlParams.append('dev_yn', env.GIFTISHOW_DEV_YN || 'N')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) urlParams.append(k, v)
  }

  const url = `${GIFTISHOW_BASE}${apiPath}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: urlParams.toString(),
    signal: AbortSignal.timeout(15000),
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = null }
  return { ok: r.ok, json, httpStatus: r.status }
}

// SHA256 해시 (멱등성 키 생성용)
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// =============================================
// 사용자 API
// =============================================

// GET /api/cookie-mall/products
// 상품 + 카테고리 + 브랜드 번들 조회
cookieMall.get('/products', async (c) => {
  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON

    // 상품 목록 (active=true만 — listDocuments는 where 미지원이므로 전체 읽기 후 필터)
    const allProducts = await listDocuments(sa, projectId, 'qkey_mall_products', {
      pageSize: 500,
    })
    const products = allProducts
      .filter((p: any) => p.active !== false)
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((p: any) => ({
        id: p._id,
        name: p.name || '',
        brand: p.brand || '',
        category: p.category || 'etc',
        priceKrw: Number(p.priceKrw) || 0,
        priceQkey: Number(p.priceQkey) || 0,
        imageUrl: p.imageUrl || '',
        sortOrder: Number(p.sortOrder) || 0,
        active: p.active !== false,
      }))

    // 카테고리
    const allCats = await listDocuments(sa, projectId, 'qkey_mall_categories', {
      pageSize: 100,
    })
    const categories = allCats
      .filter((cat: any) => cat.active !== false)
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((cat: any) => ({
        id: cat._id,
        label: cat.label || '',
        emoji: cat.emoji || '🎁',
        sortOrder: Number(cat.sortOrder) || 0,
        active: cat.active !== false,
      }))

    // 브랜드 (상품에서 추출)
    const brandMap = new Map<string, { name: string; count: number; category: string; imageUrl: string }>()
    for (const p of products) {
      const b = p.brand
      if (!b) continue
      const ex = brandMap.get(b)
      if (ex) {
        ex.count++
      } else {
        brandMap.set(b, { name: b, count: 1, category: p.category, imageUrl: p.imageUrl })
      }
    }
    const brands = Array.from(brandMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)

    return c.json({
      success: true,
      data: {
        products,
        categories,
        brands,
        total: products.length,
      },
    })
  } catch (e: any) {
    return c.json({ success: false, error: `상품 조회 실패: ${e?.message || e}` }, 500)
  }
})

// GET /api/cookie-mall/balance
// 현재 사용자의 QKEY 잔액 조회
cookieMall.get('/balance', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  try {
    const projectId = getProjectId(c)
    const userDoc = await getDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `users/${uid}`)
    const balance = (typeof userDoc?.qkeyBalance === 'number')
      ? userDoc.qkeyBalance
      : (typeof userDoc?.qkey_balance === 'number' ? userDoc.qkey_balance : 0)

    return c.json({ success: true, data: { uid, balance } })
  } catch (e: any) {
    return c.json({ success: false, error: `잔액 조회 실패: ${e?.message || e}` }, 500)
  }
})

// POST /api/cookie-mall/redeem
// QKEY 차감 + 쿠폰 발행 요청
// body: { productId, clientNonce }
cookieMall.post('/redeem', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 요청 형식입니다.' }, 400)
  }

  const productId = String(body.productId || '').trim()
  const clientNonce = String(body.clientNonce || '').trim()
  if (!productId) return c.json({ success: false, error: 'productId가 필요합니다.' }, 400)
  if (!clientNonce) return c.json({ success: false, error: 'clientNonce가 필요합니다.' }, 400)

  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON

    // ── 1) 멱등성 검사 ──
    const idemKey = await sha256(`${uid}_${productId}_${clientNonce}`)
    const idemPath = `qkey_mall_idempotency/${idemKey}`
    const existing = await getDocument(sa, projectId, idemPath)
    if (existing) {
      return c.json({
        success: true,
        data: {
          idempotent: true,
          orderId: existing.orderId || '',
          status: existing.status || 'pending',
        },
      })
    }

    // ── 2) 상품 조회 ──
    const product = await getDocument(sa, projectId, `qkey_mall_products/${productId}`)
    if (!product) return c.json({ success: false, error: '상품을 찾을 수 없습니다.' }, 404)
    if (product.active === false) {
      return c.json({ success: false, error: '판매가 일시 중단된 상품입니다.' }, 400)
    }
    const priceQkey = Math.max(1, Math.floor(Number(product.priceQkey) || 0))
    const priceKrw = Number(product.priceKrw) || (priceQkey * QKEY_PER_KRW)

    // ── 3) 잔액 확인 ──
    const userDoc = await getDocument(sa, projectId, `users/${uid}`)
    const currentBalance = (typeof userDoc?.qkeyBalance === 'number')
      ? userDoc.qkeyBalance
      : (typeof userDoc?.qkey_balance === 'number' ? userDoc.qkey_balance : 0)

    if (currentBalance < priceQkey) {
      return c.json({
        success: false,
        error: `QKEY 잔액이 부족합니다. (현재: ${currentBalance}, 필요: ${priceQkey})`,
      }, 400)
    }

    const newBalance = currentBalance - priceQkey
    const ts = nowIso()
    const orderId = genId('ord')
    const txId = genId('qtx')

    // 브랜드 prefix 상품명
    const rawName = String(product.name || productId)
    const brand = String(product.brand || '').trim()
    const productName = (brand && !rawName.startsWith(`[${brand}]`) && !rawName.startsWith(brand))
      ? `[${brand}] ${rawName}`
      : rawName

    // ── 4) 멱등성 선점 ──
    await setDocument(sa, projectId, idemPath, {
      uid,
      productId,
      clientNonce,
      orderId,
      status: 'processing',
      createdAt: ts,
    })

    // ── 5) QKEY 차감 (qkey_transactions) ──
    await setDocument(sa, projectId, `qkey_transactions/${txId}`, {
      userId: uid,
      type: TX_TYPE_REDEEM,
      amount: -Math.abs(priceQkey),   // 음수 = 차감 (QRChat v4.0.432 호환)
      balanceAfter: newBalance,
      description: '상품권교환',
      orderId,
      productId,
      timestamp: ts,
      createdAt: ts,
    })

    // ── 6) 잔액 갱신 ──
    await patchDocument(sa, projectId, `users/${uid}`, {
      qkeyBalance: newBalance,
      qkey_balance: newBalance,
      qkeyBalanceUpdatedAt: ts,
    })

    // ── 7) 주문 생성 ──
    let couponCode = ''
    let couponPin = ''
    let couponBarcode = ''
    let orderStatus = ORDER_STATUS.PENDING

    // Giftishow 실제 발행 시도
    if (isGiftishowConfigured(c)) {
      try {
        const env = c.env as any
        const sendResult = await giftishowCall(c, '0204', '/bizApi/send', {
          goods_code: String(product.goodsCode || productId),
          callback_no: env.GIFTISHOW_CALLBACK_NO || '',
          phone_no: '',   // 링고는 전화번호 미수집 → 빈값 (바코드 모드)
          user_id: env.GIFTISHOW_USER_ID || '',
          tr_id: orderId,
        })

        if (sendResult.ok && sendResult.json?.code === '0000') {
          const r = sendResult.json.result || {}
          couponCode = r.coupon_code || ''
          couponPin = r.pin_no || ''
          couponBarcode = r.barcode_no || r.barcode_url || ''
          orderStatus = ORDER_STATUS.ISSUED
        } else {
          // 발행 실패 → 환불
          orderStatus = ORDER_STATUS.FAILED
        }
      } catch {
        orderStatus = ORDER_STATUS.FAILED
      }
    } else {
      // Giftishow 미설정 → pending 상태 유지 (관리자가 수동 처리 또는 향후 자동화)
      orderStatus = ORDER_STATUS.PENDING
    }

    // 발행 실패 시 환불
    if (orderStatus === ORDER_STATUS.FAILED) {
      const refundBalance = newBalance + priceQkey
      const refundTxId = genId('qtx')
      await setDocument(sa, projectId, `qkey_transactions/${refundTxId}`, {
        userId: uid,
        type: TX_TYPE_REFUND,
        amount: priceQkey,
        balanceAfter: refundBalance,
        description: '상품권교환 실패 환불',
        orderId,
        productId,
        timestamp: nowIso(),
        createdAt: nowIso(),
      })
      await patchDocument(sa, projectId, `users/${uid}`, {
        qkeyBalance: refundBalance,
        qkey_balance: refundBalance,
        qkeyBalanceUpdatedAt: nowIso(),
      })
      orderStatus = ORDER_STATUS.REFUNDED
    }

    await setDocument(sa, projectId, `qkey_mall_orders/${orderId}`, {
      orderId,
      userId: uid,
      productId,
      productName,
      brand: brand || null,
      category: product.category || null,
      productImageUrl: product.imageUrl || null,
      priceQkey,
      priceKrw,
      status: orderStatus,
      couponCode: couponCode || null,
      couponPin: couponPin || null,
      couponBarcode: couponBarcode || null,
      couponExpireAt: null,
      couponImgUrl: null,
      mockMode: !isGiftishowConfigured(c),
      createdAt: ts,
      issuedAt: orderStatus === ORDER_STATUS.ISSUED ? ts : null,
    })

    // ── 8) 멱등성 완료 ──
    await patchDocument(sa, projectId, idemPath, {
      status: orderStatus === ORDER_STATUS.REFUNDED ? 'refunded' : 'completed',
      orderId,
      completedAt: nowIso(),
    })

    return c.json({
      success: true,
      data: {
        idempotent: false,
        orderId,
        status: orderStatus,
        priceQkey,
        priceKrw,
        balanceAfter: orderStatus === ORDER_STATUS.REFUNDED ? currentBalance : newBalance,
      },
    })
  } catch (e: any) {
    return c.json({ success: false, error: `교환 실패: ${e?.message || e}` }, 500)
  }
})

// GET /api/cookie-mall/orders
// 내 주문 목록
cookieMall.get('/orders', async (c) => {
  const uid = await getUserIdFromSession(c)
  if (!uid) return c.json({ success: false, error: '인증이 필요합니다.' }, 401)

  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON

    // listDocuments로 전체 읽기 후 uid 필터 (Firestore REST list는 where 미지원)
    const allOrders = await listDocuments(sa, projectId, 'qkey_mall_orders', {
      pageSize: 200,
    })

    const myOrders = allOrders
      .filter((o: any) => o.userId === uid)
      .sort((a: any, b: any) => {
        const ta = String(a.createdAt || '')
        const tb = String(b.createdAt || '')
        return tb.localeCompare(ta) // 최신 먼저
      })
      .slice(0, 20)
      .map((o: any) => ({
        orderId: o.orderId || o._id || '',
        productId: o.productId || '',
        productName: o.productName || '',
        brand: o.brand || null,
        category: o.category || null,
        productImageUrl: o.productImageUrl || null,
        couponImgUrl: o.couponImgUrl || null,
        priceQkey: Number(o.priceQkey) || 0,
        priceKrw: Number(o.priceKrw) || 0,
        status: o.status || 'unknown',
        couponCode: o.couponCode || null,
        couponPin: o.couponPin || null,
        couponBarcode: o.couponBarcode || null,
        couponExpireAt: o.couponExpireAt || null,
        createdAt: o.createdAt || null,
        issuedAt: o.issuedAt || null,
      }))

    return c.json({ success: true, data: { orders: myOrders } })
  } catch (e: any) {
    return c.json({ success: false, error: `주문 조회 실패: ${e?.message || e}` }, 500)
  }
})

// =============================================
// 관리자 API (admin_session 인증)
// =============================================
async function verifyAdminSession(c: any): Promise<boolean> {
  try {
    const cookie = c.req.header('Cookie') || ''
    const match = cookie.match(/admin_session=([^;]+)/)
    if (!match) return false
    const token = match[1]
    const row = await c.env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'admin_session_token'"
    ).first() as { value: string } | null
    return row ? row.value === token : false
  } catch {
    return false
  }
}

// ─── 상품 CRUD ───

// GET /api/cookie-mall/admin/products
cookieMall.get('/admin/products', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  try {
    const projectId = getProjectId(c)
    const products = await listDocuments(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, 'qkey_mall_products', {
      pageSize: 500,
    })
    const mapped = products
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((p: any) => ({
        id: p._id,
        name: p.name || '',
        brand: p.brand || '',
        category: p.category || 'etc',
        priceKrw: Number(p.priceKrw) || 0,
        priceQkey: Number(p.priceQkey) || 0,
        imageUrl: p.imageUrl || '',
        sortOrder: Number(p.sortOrder) || 0,
        active: p.active !== false,
        goodsCode: p.goodsCode || '',
        createdAt: p.createdAt || null,
      }))
    return c.json({ success: true, data: mapped })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// POST /api/cookie-mall/admin/products
// body: { name, brand, category, priceKrw, priceQkey, imageUrl, sortOrder, goodsCode }
cookieMall.post('/admin/products', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 형식' }, 400)
  }

  const name = String(body.name || '').trim()
  if (!name) return c.json({ success: false, error: '상품명을 입력하세요.' }, 400)

  const priceKrw = Math.max(0, Math.floor(Number(body.priceKrw) || 0))
  const priceQkey = Math.max(1, Math.floor(Number(body.priceQkey) || (priceKrw > 0 ? Math.ceil(priceKrw / QKEY_PER_KRW) : 1)))

  try {
    const projectId = getProjectId(c)
    const id = genId('prod')
    const ts = nowIso()

    await setDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `qkey_mall_products/${id}`, {
      name,
      brand: String(body.brand || '').trim(),
      category: String(body.category || 'etc').trim(),
      priceKrw,
      priceQkey,
      imageUrl: String(body.imageUrl || '').trim(),
      sortOrder: Math.max(0, Math.floor(Number(body.sortOrder) || 0)),
      active: true,
      goodsCode: String(body.goodsCode || '').trim(),
      createdAt: ts,
      updatedAt: ts,
    })

    return c.json({ success: true, data: { id } })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// PUT /api/cookie-mall/admin/products/:id
cookieMall.put('/admin/products/:id', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  const id = c.req.param('id')
  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 형식' }, 400)
  }

  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON
    const existing = await getDocument(sa, projectId, `qkey_mall_products/${id}`)
    if (!existing) return c.json({ success: false, error: '상품을 찾을 수 없습니다.' }, 404)

    const fields: Record<string, any> = { updatedAt: nowIso() }
    if (body.name !== undefined) fields.name = String(body.name).trim()
    if (body.brand !== undefined) fields.brand = String(body.brand).trim()
    if (body.category !== undefined) fields.category = String(body.category).trim()
    if (body.priceKrw !== undefined) fields.priceKrw = Math.max(0, Math.floor(Number(body.priceKrw) || 0))
    if (body.priceQkey !== undefined) fields.priceQkey = Math.max(1, Math.floor(Number(body.priceQkey) || 1))
    if (body.imageUrl !== undefined) fields.imageUrl = String(body.imageUrl).trim()
    if (body.sortOrder !== undefined) fields.sortOrder = Math.max(0, Math.floor(Number(body.sortOrder) || 0))
    if (body.active !== undefined) fields.active = body.active === true
    if (body.goodsCode !== undefined) fields.goodsCode = String(body.goodsCode).trim()

    await patchDocument(sa, projectId, `qkey_mall_products/${id}`, fields)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// DELETE /api/cookie-mall/admin/products/:id
cookieMall.delete('/admin/products/:id', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  const id = c.req.param('id')
  try {
    const projectId = getProjectId(c)
    await deleteDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `qkey_mall_products/${id}`)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// POST /api/cookie-mall/admin/products/:id/toggle
cookieMall.post('/admin/products/:id/toggle', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  const id = c.req.param('id')
  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON
    const existing = await getDocument(sa, projectId, `qkey_mall_products/${id}`)
    if (!existing) return c.json({ success: false, error: '상품을 찾을 수 없습니다.' }, 404)

    const newActive = !(existing.active !== false)
    await patchDocument(sa, projectId, `qkey_mall_products/${id}`, {
      active: newActive,
      updatedAt: nowIso(),
    })
    return c.json({ success: true, data: { active: newActive } })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// ─── 카테고리 CRUD ───

// GET /api/cookie-mall/admin/categories
cookieMall.get('/admin/categories', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  try {
    const projectId = getProjectId(c)
    const cats = await listDocuments(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, 'qkey_mall_categories', {
      pageSize: 100,
    })
    const mapped = cats
      .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((cat: any) => ({
        id: cat._id,
        label: cat.label || '',
        emoji: cat.emoji || '🎁',
        sortOrder: Number(cat.sortOrder) || 0,
        active: cat.active !== false,
        description: cat.description || '',
      }))
    return c.json({ success: true, data: mapped })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// POST /api/cookie-mall/admin/categories
cookieMall.post('/admin/categories', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 형식' }, 400)
  }

  const catId = String(body.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const label = String(body.label || '').trim()
  if (!catId || !label) return c.json({ success: false, error: 'ID와 라벨을 입력하세요.' }, 400)

  try {
    const projectId = getProjectId(c)
    const ts = nowIso()
    await setDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `qkey_mall_categories/${catId}`, {
      label,
      emoji: String(body.emoji || '🎁').trim(),
      sortOrder: Math.max(0, Math.floor(Number(body.sortOrder) || 0)),
      active: body.active !== false,
      description: String(body.description || '').trim(),
      createdAt: ts,
      updatedAt: ts,
    })
    return c.json({ success: true, data: { id: catId } })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// PUT /api/cookie-mall/admin/categories/:id
cookieMall.put('/admin/categories/:id', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  const id = c.req.param('id')
  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: '잘못된 형식' }, 400)
  }

  try {
    const projectId = getProjectId(c)
    const sa = c.env.FCM_SERVICE_ACCOUNT_JSON
    const fields: Record<string, any> = { updatedAt: nowIso() }
    if (body.label !== undefined) fields.label = String(body.label).trim()
    if (body.emoji !== undefined) fields.emoji = String(body.emoji).trim()
    if (body.sortOrder !== undefined) fields.sortOrder = Math.max(0, Math.floor(Number(body.sortOrder) || 0))
    if (body.active !== undefined) fields.active = body.active === true
    if (body.description !== undefined) fields.description = String(body.description).trim()

    await patchDocument(sa, projectId, `qkey_mall_categories/${id}`, fields)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// DELETE /api/cookie-mall/admin/categories/:id
cookieMall.delete('/admin/categories/:id', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  const id = c.req.param('id')
  try {
    const projectId = getProjectId(c)
    await deleteDocument(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, `qkey_mall_categories/${id}`)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

// ─── 관리자: 주문 목록 ───

// GET /api/cookie-mall/admin/orders
cookieMall.get('/admin/orders', async (c) => {
  if (!await verifyAdminSession(c)) return c.json({ success: false, error: '인증 필요' }, 401)

  try {
    const projectId = getProjectId(c)
    const orders = await listDocuments(c.env.FCM_SERVICE_ACCOUNT_JSON, projectId, 'qkey_mall_orders', {
      pageSize: 200,
    })
    const mapped = orders
      .sort((a: any, b: any) => {
        const ta = String(a.createdAt || '')
        const tb = String(b.createdAt || '')
        return tb.localeCompare(ta)
      })
      .map((o: any) => ({
        orderId: o.orderId || o._id || '',
        userId: o.userId || '',
        productId: o.productId || '',
        productName: o.productName || '',
        priceQkey: Number(o.priceQkey) || 0,
        priceKrw: Number(o.priceKrw) || 0,
        status: o.status || 'unknown',
        mockMode: o.mockMode || false,
        createdAt: o.createdAt || null,
        issuedAt: o.issuedAt || null,
      }))
    return c.json({ success: true, data: mapped })
  } catch (e: any) {
    return c.json({ success: false, error: e?.message || e }, 500)
  }
})

export default cookieMall
