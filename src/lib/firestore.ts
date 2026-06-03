// src/lib/firestore.ts
// =============================================
// Firestore REST API helper (서버 전용)
// - 앱은 Firestore에 직접 접근하지 않음 (명세서 22항)
// - 기존 RINGO(가입/알람/수락거절/영상/수신함/발신함)는 D1 그대로 유지
// - 신규 광고 리워드 + QKEY + 쿠키몰 데이터만 Firestore에 저장
// - fcm.ts의 OAuth2 JWT 패턴 재사용 (scope만 datastore로 변경)
// =============================================

// Firestore가 사용하는 GCP 프로젝트 ID.
// 서비스 계정 JSON 안의 project_id를 그대로 사용하므로 별도 env 불필요.
const FIRESTORE_BASE = (projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

// 토큰 캐시 (Worker 인스턴스 수명 동안 재사용 — 매 요청 JWT 서명 비용 절감)
let _cachedToken: { token: string; exp: number } | null = null

// =============================================
// Firestore 액세스 토큰 획득
// 서비스 계정 JSON으로 JWT를 RS256 서명해 access_token 발급
// scope: datastore (Firestore 읽기/쓰기)
// =============================================
export async function getFirestoreAccessToken(serviceAccountJson: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  // 캐시된 토큰이 아직 유효하면 재사용 (만료 5분 전까지)
  if (_cachedToken && _cachedToken.exp - 300 > now) {
    return _cachedToken.token
  }

  const sa = JSON.parse(serviceAccountJson)
  const exp = now + 3600

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
  }

  const encodeBase64Url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const encodedHeader  = encodeBase64Url(header)
  const encodedPayload = encodeBase64Url(payload)
  const signingInput   = `${encodedHeader}.${encodedPayload}`

  const pemKey = sa.private_key as string
  const pemBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder   = new TextEncoder()
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  const jwt = `${signingInput}.${encodedSignature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData: any = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Firestore 액세스 토큰 획득 실패: ${JSON.stringify(tokenData)}`)
  }

  _cachedToken = { token: tokenData.access_token, exp }
  return tokenData.access_token
}

// =============================================
// JS 값 → Firestore REST "Value" 타입 변환
// (https://firebase.google.com/docs/firestore/reference/rest/v1/Value)
// =============================================
export function toFirestoreValue(v: any): any {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v }
  }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } }
  }
  if (typeof v === 'object') {
    const fields: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      fields[k] = toFirestoreValue(val)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(v) }
}

// =============================================
// Firestore REST "Value" → JS 값 변환
// =============================================
export function fromFirestoreValue(v: any): any {
  if (v == null) return null
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(fromFirestoreValue)
  }
  if ('mapValue' in v) {
    return fromFirestoreFields(v.mapValue.fields || {})
  }
  return null
}

// Firestore document.fields → 평범한 JS 객체
export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v)
  }
  return out
}

// JS 객체 → Firestore document.fields
export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v)
  }
  return fields
}

// =============================================
// 문서 단건 조회 (GET)
// 반환: 평범한 JS 객체 또는 null(문서 없음)
// =============================================
export async function getDocument(
  serviceAccountJson: string,
  projectId: string,
  path: string                       // 예: "ad_users/u_xxxx"
): Promise<Record<string, any> | null> {
  const token = await getFirestoreAccessToken(serviceAccountJson)
  const url = `${FIRESTORE_BASE(projectId)}/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore getDocument 실패(${res.status}): ${text}`)
  }
  const data: any = await res.json()
  return fromFirestoreFields(data.fields || {})
}

// =============================================
// 문서 부분 갱신 (PATCH with updateMask)
// - 지정한 필드만 갱신/추가. 문서가 없으면 새로 생성됨.
// - 명시한 필드 외에는 보존(다른 필드 삭제 안 함).
// =============================================
export async function patchDocument(
  serviceAccountJson: string,
  projectId: string,
  path: string,                      // 예: "ad_users/u_xxxx"
  data: Record<string, any>          // 갱신할 필드들
): Promise<Record<string, any>> {
  const token = await getFirestoreAccessToken(serviceAccountJson)
  const fieldKeys = Object.keys(data)

  // updateMask로 지정 필드만 갱신 → 기존 다른 필드 보존
  const maskParams = fieldKeys
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&')

  const url = `${FIRESTORE_BASE(projectId)}/${path}?${maskParams}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore patchDocument 실패(${res.status}): ${text}`)
  }
  const result: any = await res.json()
  return fromFirestoreFields(result.fields || {})
}

// =============================================
// 컬렉션 문서 목록 조회 (GET .../{collection})
// - REST list API 사용. pageSize/orderBy 옵션.
// - 반환: [{ _id, ...fields }]  ( _id = 문서 ID )
// - 주의: 서버 전용. 대량 컬렉션은 pageSize로 제한할 것.
// =============================================
export async function listDocuments(
  serviceAccountJson: string,
  projectId: string,
  collection: string,                // 예: "advertisers"
  opts: { pageSize?: number; orderBy?: string } = {}
): Promise<Array<Record<string, any>>> {
  const token = await getFirestoreAccessToken(serviceAccountJson)
  const params: string[] = []
  params.push(`pageSize=${opts.pageSize ?? 200}`)
  if (opts.orderBy) params.push(`orderBy=${encodeURIComponent(opts.orderBy)}`)

  const url = `${FIRESTORE_BASE(projectId)}/${collection}?${params.join('&')}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return []
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore listDocuments 실패(${res.status}): ${text}`)
  }
  const data: any = await res.json()
  const docs = data.documents || []
  return docs.map((d: any) => {
    // name: "projects/.../documents/advertisers/{id}" → 마지막 세그먼트가 ID
    const id = (d.name || '').split('/').pop()
    return { _id: id, ...fromFirestoreFields(d.fields || {}) }
  })
}

// =============================================
// 문서 생성 (지정 ID로 PATCH = upsert, updateMask 없음 → 전체 set)
// - 새 컬렉션/문서를 만들 때 사용.
// - 같은 path가 이미 있으면 전체 덮어씀(주의). 부분 갱신은 patchDocument 사용.
// =============================================
export async function setDocument(
  serviceAccountJson: string,
  projectId: string,
  path: string,                      // 예: "advertisers/adv_xxxx"
  data: Record<string, any>
): Promise<Record<string, any>> {
  const token = await getFirestoreAccessToken(serviceAccountJson)
  const url = `${FIRESTORE_BASE(projectId)}/${path}`
  const res = await fetch(url, {
    method: 'PATCH',  // 지정 ID PATCH(updateMask 없음) = upsert
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Firestore setDocument 실패(${res.status}): ${text}`)
  }
  const result: any = await res.json()
  return fromFirestoreFields(result.fields || {})
}

// =============================================
// 문서 삭제 (DELETE .../{path})
// =============================================
export async function deleteDocument(
  serviceAccountJson: string,
  projectId: string,
  path: string                       // 예: "advertisers/adv_xxxx"
): Promise<void> {
  const token = await getFirestoreAccessToken(serviceAccountJson)
  const url = `${FIRESTORE_BASE(projectId)}/${path}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Firestore deleteDocument 실패(${res.status}): ${text}`)
  }
}

// =============================================
// 짧은 무작위 ID 생성 (문서 ID 접두어용)
// =============================================
export function genId(prefix: string): string {
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex}`
}

// =============================================
// 서버 타임스탬프 문자열 (ISO8601, UTC)
// =============================================
export function nowIso(): string {
  return new Date().toISOString()
}
