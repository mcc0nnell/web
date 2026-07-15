const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    // blob: is required by hls.js's MediaSource Extensions playback (every
    // non-Safari browser) — without it, Stream-hosted HLS clips (e.g. Fred
    // Beam's anthem support video) silently fail to play, with only a CSP
    // violation in the console to explain the black frame.
    "media-src 'self' blob:",
    "connect-src 'self' wss://gladcast.live ws://localhost:*",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://gladcast.live',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-gladcast-operator-token',
  'Access-Control-Max-Age': '86400',
}

export function applySecurityHeaders(response: Response): Response {
  // Don't modify WebSocket upgrades
  if (response.status === 101) {
    return response
  }

  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function handleCorsPreflightIfNeeded(request: Request): Response | null {
  if (request.method !== 'OPTIONS') {
    return null
  }

  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}
