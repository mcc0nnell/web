import type {DurableObjectNamespace} from 'cloudflare:workers'
import type {RoomDO} from './room-do'
import {log} from './logger'
import {authorizeOperator, type OperatorAuthEnv, type OperatorAuthResult} from './operator-auth'

type RuntimeEnv = OperatorAuthEnv & {
  OPS_ROOM: DurableObjectNamespace<RoomDO>
}

type NextHandler = (request: Request, env: Env, context: unknown) => Promise<Response> | Response

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  })
}

function sanitizeRoomId(value: unknown) {
  if (typeof value !== 'string') {
    return 'main-hall'
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return normalized || 'main-hall'
}

function getClientIdentifier(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip')
  if (!forwarded) {
    return 'unknown'
  }

  return forwarded.split(',')[0]?.trim() || 'unknown'
}

function describeOperatorIdentity(auth: OperatorAuthResult) {
  if (auth.identity) {
    return auth.identity
  }
  if (auth.source === 'token') {
    return 'shared-token'
  }
  return null
}

function operatorUnauthorizedResponse(auth: OperatorAuthResult) {
  return json(
    {
      type: 'ERROR',
      message: auth.reason ?? 'Operator authorization required.',
      code: 'UNAUTHORIZED',
    },
    {status: 401},
  )
}

async function requireOperator(request: Request, env: RuntimeEnv, route: string) {
  const auth = await authorizeOperator(request, env)

  if (!auth.authorized) {
    log.warn('ops.unauthorized', {route, reason: auth.reason, clientIp: getClientIdentifier(request)})
    return {auth, failure: operatorUnauthorizedResponse(auth)}
  }

  if (auth.source === 'access-header') {
    // Allowed for compatibility, but this identity was not cryptographically
    // verified. Set GLADCAST_ACCESS_TEAM_DOMAIN + GLADCAST_ACCESS_AUD to enable JWT
    // verification and close the header-spoofing gap.
    log.warn('ops.auth_header_trust', {route, operator: auth.identity})
  }

  if (auth.source === 'disabled') {
    log.warn('ops.guard_disabled', {route, clientIp: getClientIdentifier(request)})
  }

  return {auth, failure: null}
}

function getRoomStub(env: RuntimeEnv, roomId: string) {
  // Room names are the stable addressing model for the ops runtime:
  // one room slug resolves to one authoritative RoomDO instance.
  const id = env.OPS_ROOM.idFromName(roomId)
  return env.OPS_ROOM.get(id)
}

function isOpsRoute(pathname: string) {
  return pathname === '/api/ops/state' || pathname === '/api/ops/command' || pathname === '/api/ops/ws' || pathname === '/api/ops/events'
}

async function handleState(request: Request, env: RuntimeEnv) {
  const url = new URL(request.url)
  const roomId = sanitizeRoomId(url.searchParams.get('room'))
  const stub = getRoomStub(env, roomId)

  return stub.fetch(new Request(`https://ops.internal/state?room=${encodeURIComponent(roomId)}`, {method: 'GET'}))
}

async function handleCommand(request: Request, env: RuntimeEnv) {
  const {auth, failure} = await requireOperator(request, env, '/api/ops/command')
  if (failure) {
    return failure
  }

  let payload: {roomId?: unknown; command?: unknown}

  try {
    payload = (await request.json()) as {roomId?: unknown; command?: unknown}
  } catch {
    return json({type: 'ERROR', message: 'Request body must be valid JSON.', code: 'INVALID_JSON'}, {status: 400})
  }

  const roomId = sanitizeRoomId(payload.roomId)
  const stub = getRoomStub(env, roomId)
  const operator = describeOperatorIdentity(auth)
  const clientIp = getClientIdentifier(request)

  return stub.fetch(
    new Request(`https://ops.internal/command?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gladcast-client-ip': clientIp,
        ...(operator ? {'x-gladcast-operator-identity': operator} : {}),
      },
      body: JSON.stringify({command: payload.command}),
    }),
  )
}

async function handleWebSocket(request: Request, env: RuntimeEnv) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade.', {status: 426})
  }

  // The room socket is broadcast-only (RoomDO ignores client messages except
  // ping/pong), and public display surfaces like /screen/[room] subscribe to
  // it. Leaving it open exposes exactly the same read-only state as
  // GET /api/ops/state; all mutations go through the authorized command route.
  const url = new URL(request.url)
  const roomId = sanitizeRoomId(url.searchParams.get('room'))
  const stub = getRoomStub(env, roomId)

  return stub.fetch(new Request(`https://ops.internal/ws?room=${encodeURIComponent(roomId)}`, request))
}

async function handleEvents(request: Request, env: RuntimeEnv) {
  // The event log carries operator identities and command audit details, so
  // it is operator-gated like the command route.
  const {failure} = await requireOperator(request, env, '/api/ops/events')
  if (failure) {
    return failure
  }

  const url = new URL(request.url)
  const roomId = sanitizeRoomId(url.searchParams.get('room'))
  const stub = getRoomStub(env, roomId)

  return stub.fetch(new Request(`https://ops.internal/events?room=${encodeURIComponent(roomId)}`, {method: 'GET'}))
}

export async function routeOpsRequest(request: Request, env: RuntimeEnv, context: unknown, next: NextHandler) {
  const url = new URL(request.url)
  if (!isOpsRoute(url.pathname)) {
    return next(request, env as Env, context)
  }

  // Keep the new runtime isolated under /api/ops/* so the rest of the
  // Astro site and legacy surfaces continue to behave normally.
  if (url.pathname === '/api/ops/state' && request.method === 'GET') {
    return handleState(request, env)
  }
  if (url.pathname === '/api/ops/command' && request.method === 'POST') {
    return handleCommand(request, env)
  }
  if (url.pathname === '/api/ops/ws' && request.method === 'GET') {
    return handleWebSocket(request, env)
  }
  if (url.pathname === '/api/ops/events' && request.method === 'GET') {
    return handleEvents(request, env)
  }

  return new Response('Method not allowed', {status: 405})
}
