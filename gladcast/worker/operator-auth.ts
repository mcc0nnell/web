// Worker-side operator authorization for the mutating/audit ops API routes.
// This is the enforcement point that holds even if the Cloudflare Access
// dashboard configuration drifts: with GLADCAST_ACCESS_TEAM_DOMAIN and
// GLADCAST_ACCESS_AUD set, the Access JWT is cryptographically verified and the
// identity checked against the operator allowlist before any command runs.
import {AccessJwtError, verifyAccessJwt} from './access-jwt'

export const PRODUCTION_HOSTNAME = 'gladcast.live'

const ACCESS_EMAIL_HEADER_NAME = 'cf-access-authenticated-user-email'
const ACCESS_JWT_HEADER_NAME = 'cf-access-jwt-assertion'
const OPERATOR_TOKEN_HEADER_NAME = 'x-gladcast-operator-token'
const OPERATOR_TOKEN_QUERY_PARAM = 'token'
const OPERATOR_TOKEN_COOKIE_NAME = 'gladcast_operator_token'

export type OperatorAuthEnv = {
  GLADCAST_OPERATOR_ACCESS_EMAILS?: string
  GLADCAST_OPERATOR_ACCESS_DOMAINS?: string
  GLADCAST_OPERATOR_TOKEN?: string
  GLADCAST_ACCESS_TEAM_DOMAIN?: string
  GLADCAST_ACCESS_AUD?: string
  GLADCAST_OPERATOR_TRUST_ACCESS?: string
  GLADCAST_OPERATOR_GUARD_DISABLED?: string
}

export type OperatorAuthSource = 'access-jwt' | 'access-header' | 'token' | 'none' | 'disabled'

export type OperatorAuthResult = {
  authorized: boolean
  identity: string | null
  source: OperatorAuthSource
  reason?: string
}

export type AuthorizeOperatorOptions = {
  fetcher?: typeof fetch
  now?: () => number
}

function parseCsvList(value: string | undefined) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowlistedEmail(email: string, env: OperatorAuthEnv) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const allowedEmails = parseCsvList(env.GLADCAST_OPERATOR_ACCESS_EMAILS)
  if (allowedEmails.includes(normalized)) {
    return true
  }

  const domain = normalized.split('@')[1] ?? ''
  const allowedDomains = parseCsvList(env.GLADCAST_OPERATOR_ACCESS_DOMAINS)
  return Boolean(domain) && allowedDomains.includes(domain)
}

function hasAllowlistConfiguration(env: OperatorAuthEnv) {
  return parseCsvList(env.GLADCAST_OPERATOR_ACCESS_EMAILS).length > 0 || parseCsvList(env.GLADCAST_OPERATOR_ACCESS_DOMAINS).length > 0
}

function isStrictAccessConfigured(env: OperatorAuthEnv) {
  return Boolean(env.GLADCAST_ACCESS_TEAM_DOMAIN?.trim()) && Boolean(env.GLADCAST_ACCESS_AUD?.trim())
}

// When set, operator membership is delegated entirely to the Cloudflare Access
// policy: the in-app guard authorizes any request that carries an
// Access-authenticated identity instead of checking a local email allowlist.
function isAccessTrustEnabled(env: OperatorAuthEnv) {
  const value = env.GLADCAST_OPERATOR_TRUST_ACCESS?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

function isProductionRequest(request: Request) {
  return new URL(request.url).hostname === PRODUCTION_HOSTNAME
}

// Kill switch: when set, every operator surface (ops pages + the mutating/audit
// ops and CoBo API routes) authorizes unconditionally, on every hostname
// including production. Off by default; flip on only for a deliberate,
// time-boxed reason and flip back off (or unset) the moment it's no longer needed.
function isGuardDisabled(env: OperatorAuthEnv) {
  const value = env.GLADCAST_OPERATOR_GUARD_DISABLED?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

function getCookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) {
      continue
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim() || null
    }
  }

  return null
}

function getPresentedToken(request: Request) {
  const url = new URL(request.url)
  return (
    url.searchParams.get(OPERATOR_TOKEN_QUERY_PARAM)?.trim() ||
    request.headers.get(OPERATOR_TOKEN_HEADER_NAME)?.trim() ||
    getCookieValue(request, OPERATOR_TOKEN_COOKIE_NAME)
  )
}

function authorizeWithToken(request: Request, env: OperatorAuthEnv): OperatorAuthResult | null {
  // The shared token is a local/dev convenience only; it never authorizes
  // requests on the production hostname.
  if (isProductionRequest(request)) {
    return null
  }

  const configuredToken = env.GLADCAST_OPERATOR_TOKEN?.trim()
  if (!configuredToken) {
    return null
  }

  if (getPresentedToken(request) === configuredToken) {
    return {authorized: true, identity: null, source: 'token'}
  }

  return null
}

export async function authorizeOperator(
  request: Request,
  env: OperatorAuthEnv,
  options: AuthorizeOperatorOptions = {},
): Promise<OperatorAuthResult> {
  if (isGuardDisabled(env)) {
    return {authorized: true, identity: null, source: 'disabled'}
  }

  // Strict mode: verify the Access JWT signature, audience, and expiry, then
  // check the verified email against the operator allowlist.
  if (isStrictAccessConfigured(env)) {
    const jwt = request.headers.get(ACCESS_JWT_HEADER_NAME)?.trim()

    if (jwt) {
      try {
        const payload = await verifyAccessJwt(jwt, {
          teamDomain: env.GLADCAST_ACCESS_TEAM_DOMAIN as string,
          aud: env.GLADCAST_ACCESS_AUD as string,
          fetcher: options.fetcher,
          now: options.now,
        })

        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
        if (email && (isAccessTrustEnabled(env) || isAllowlistedEmail(email, env))) {
          // Trust mode here is fully safe: the JWT is cryptographically verified,
          // so membership is whatever the Access policy admits.
          return {authorized: true, identity: email, source: 'access-jwt'}
        }

        return {
          authorized: false,
          identity: email || null,
          source: 'none',
          reason: email ? 'Access identity is not on the operator allowlist.' : 'Access JWT has no email claim.',
        }
      } catch (error) {
        const reason = error instanceof AccessJwtError ? `Access JWT rejected (${error.code}).` : 'Access JWT verification failed.'
        const tokenResult = authorizeWithToken(request, env)
        if (tokenResult) {
          return tokenResult
        }
        return {authorized: false, identity: null, source: 'none', reason}
      }
    }

    const tokenResult = authorizeWithToken(request, env)
    if (tokenResult) {
      return tokenResult
    }

    return {
      authorized: false,
      identity: null,
      source: 'none',
      reason: 'No Cloudflare Access JWT presented. Sign in through Access.',
    }
  }

  // Legacy mode (no team domain/AUD configured): trust the Access identity
  // header. This relies on Cloudflare Access actually fronting the route —
  // set GLADCAST_ACCESS_TEAM_DOMAIN and GLADCAST_ACCESS_AUD to close the
  // header-spoofing gap.
  //
  // With GLADCAST_OPERATOR_TRUST_ACCESS set, membership is delegated to the Access
  // policy: any Access-authenticated identity is trusted, no local allowlist
  // required. Without strict mode the header is not cryptographically verified,
  // so this is an accepted risk that depends on Access gating /ops at the edge.
  const trustAccess = isAccessTrustEnabled(env)
  if (trustAccess || hasAllowlistConfiguration(env)) {
    const email = request.headers.get(ACCESS_EMAIL_HEADER_NAME)?.trim().toLowerCase()
    if (email && (trustAccess || isAllowlistedEmail(email, env))) {
      return {authorized: true, identity: email, source: 'access-header'}
    }
  }

  const tokenResult = authorizeWithToken(request, env)
  if (tokenResult) {
    return tokenResult
  }

  return {
    authorized: false,
    identity: null,
    source: 'none',
    reason: 'Operator authorization required.',
  }
}
