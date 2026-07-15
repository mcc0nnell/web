// Verifies Cloudflare Access application JWTs (the `cf-access-jwt-assertion`
// header) against the team's published signing keys, so the operator boundary
// holds even if a request reaches the Worker without passing through Access.
// Reference: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export type AccessJwtPayload = {
  aud?: string | string[]
  email?: string
  exp?: number
  nbf?: number
  iat?: number
  iss?: string
  sub?: string
  [claim: string]: unknown
}

export type VerifyAccessJwtOptions = {
  // Team domain, either bare ("myteam") or a full URL
  // ("https://myteam.cloudflareaccess.com").
  teamDomain: string
  // The Access application's Audience (AUD) tag.
  aud: string
  fetcher?: typeof fetch
  now?: () => number
}

export class AccessJwtError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AccessJwtError'
    this.code = code
  }
}

type AccessJwk = JsonWebKey & {kid?: string}

type CachedCerts = {
  keys: Map<string, CryptoKey>
  fetchedAt: number
}

const CERTS_CACHE_TTL_MS = 60 * 60 * 1000
const CLOCK_LEEWAY_SECONDS = 30

const certsCache = new Map<string, CachedCerts>()

export function normalizeTeamDomain(teamDomain: string) {
  const trimmed = teamDomain.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new AccessJwtError('CONFIG', 'Access team domain is empty.')
  }

  if (/^https:\/\//i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (trimmed.includes('.')) {
    return `https://${trimmed.toLowerCase()}`
  }

  return `https://${trimmed.toLowerCase()}.cloudflareaccess.com`
}

function decodeBase64Url(segment: string) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function decodeJsonSegment<T>(segment: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as T
  } catch {
    throw new AccessJwtError('MALFORMED', 'Access JWT segment is not valid base64url JSON.')
  }
}

async function importVerificationKeys(jwks: AccessJwk[]) {
  const keys = new Map<string, CryptoKey>()

  for (const jwk of jwks) {
    if (!jwk.kid || jwk.kty !== 'RSA') {
      continue
    }

    try {
      const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify'])
      keys.set(jwk.kid, key)
    } catch {
      // Skip keys the runtime cannot import; verification fails closed if the
      // JWT's kid is among them.
    }
  }

  return keys
}

async function getVerificationKey(issuer: string, kid: string, fetcher: typeof fetch, now: number) {
  const certsUrl = `${issuer}/cdn-cgi/access/certs`
  const cached = certsCache.get(certsUrl)

  if (cached && now - cached.fetchedAt < CERTS_CACHE_TTL_MS) {
    const key = cached.keys.get(kid)
    if (key) {
      return key
    }
  }

  // Cache miss or unknown kid (key rotation): refetch the published certs.
  const response = await fetcher(certsUrl)
  if (!response.ok) {
    throw new AccessJwtError('CERTS_FETCH', `Access certs endpoint returned ${response.status}.`)
  }

  const body = (await response.json()) as {keys?: AccessJwk[]}
  const keys = await importVerificationKeys(body.keys ?? [])
  certsCache.set(certsUrl, {keys, fetchedAt: now})

  const key = keys.get(kid)
  if (!key) {
    throw new AccessJwtError('UNKNOWN_KID', 'Access JWT signing key is not in the published certs.')
  }

  return key
}

export function clearAccessCertsCache() {
  certsCache.clear()
}

export async function verifyAccessJwt(token: string, options: VerifyAccessJwtOptions): Promise<AccessJwtPayload> {
  const fetcher = options.fetcher ?? fetch
  const nowMs = options.now ? options.now() : Date.now()
  const issuer = normalizeTeamDomain(options.teamDomain)

  const segments = token.split('.')
  if (segments.length !== 3) {
    throw new AccessJwtError('MALFORMED', 'Access JWT must have three segments.')
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments
  const header = decodeJsonSegment<{alg?: string; kid?: string}>(headerSegment)

  if (header.alg !== 'RS256') {
    throw new AccessJwtError('ALG', `Access JWT algorithm must be RS256, got ${header.alg ?? 'none'}.`)
  }
  if (!header.kid) {
    throw new AccessJwtError('MALFORMED', 'Access JWT header is missing kid.')
  }

  const key = await getVerificationKey(issuer, header.kid, fetcher, nowMs)
  const signedData = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  const signature = decodeBase64Url(signatureSegment)

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData)
  if (!valid) {
    throw new AccessJwtError('SIGNATURE', 'Access JWT signature is invalid.')
  }

  const payload = decodeJsonSegment<AccessJwtPayload>(payloadSegment)
  const nowSeconds = nowMs / 1000

  if (payload.iss !== issuer) {
    throw new AccessJwtError('ISSUER', `Access JWT issuer mismatch: ${payload.iss ?? 'none'}.`)
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : []
  if (!audiences.includes(options.aud)) {
    throw new AccessJwtError('AUDIENCE', 'Access JWT audience does not include this application.')
  }

  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds - CLOCK_LEEWAY_SECONDS) {
    throw new AccessJwtError('EXPIRED', 'Access JWT is expired.')
  }

  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + CLOCK_LEEWAY_SECONDS) {
    throw new AccessJwtError('NOT_YET_VALID', 'Access JWT is not valid yet.')
  }

  return payload
}
