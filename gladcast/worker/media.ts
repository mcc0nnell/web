import {authorizeOperator, type OperatorAuthEnv} from './operator-auth'
import {log} from './logger'

/**
 * GLADcast media asset routes.
 *
 * Uploaded performance media (images, video, archive material) is published
 * once to R2 and referenced everywhere by URL — binary media never enters
 * RoomDO state; only a small descriptor is synchronized via
 * SET_MEDIA_SOURCE.
 *
 *   POST /api/ops/media?name=<filename>   operator-gated upload → {url}
 *   GET  /media/<key>                     public, immutable, range-capable
 *
 * When the MEDIA R2 binding is absent (bucket not yet provisioned), upload
 * returns 501 with a clear message and the console falls back to
 * console-local preview so a missing bucket never blocks a performance.
 */

type MediaEnv = OperatorAuthEnv & {
  MEDIA?: R2BucketLike
}

// Narrow structural type so the worker compiles without wrangler-generated
// R2 bindings types; matches the subset of the R2 API used here.
export type R2BucketLike = {
  put(key: string, value: ReadableStream | ArrayBuffer | null, options?: {httpMetadata?: {contentType?: string}}): Promise<unknown>
  get(key: string): Promise<{body: ReadableStream; httpMetadata?: {contentType?: string}; size: number} | null>
}

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = /^(image|video)\//

type NextHandler = (request: Request, env: Env, context: unknown) => Promise<Response> | Response

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  })
}

function sanitizeName(value: string | null) {
  return (value ?? 'asset').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'asset'
}

async function handleUpload(request: Request, env: MediaEnv) {
  const auth = await authorizeOperator(request, env)
  if (!auth.authorized) {
    return json({type: 'ERROR', message: auth.reason ?? 'Operator authorization required.', code: 'UNAUTHORIZED'}, 401)
  }

  if (!env.MEDIA) {
    return json(
      {
        type: 'ERROR',
        code: 'MEDIA_STORE_UNAVAILABLE',
        message: 'No MEDIA R2 binding. Create the bucket (wrangler r2 bucket create gladcast-media) and bind it in wrangler.jsonc.',
      },
      501,
    )
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!ALLOWED_UPLOAD_TYPES.test(contentType)) {
    return json({type: 'ERROR', code: 'UNSUPPORTED_TYPE', message: 'Only image/* and video/* uploads are accepted.'}, 415)
  }

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_UPLOAD_BYTES) {
    return json({type: 'ERROR', code: 'TOO_LARGE', message: `Upload must declare a size up to ${MAX_UPLOAD_BYTES} bytes.`}, 413)
  }

  const url = new URL(request.url)
  const name = sanitizeName(url.searchParams.get('name'))
  const key = `${crypto.randomUUID()}/${name}`

  await env.MEDIA.put(key, request.body, {httpMetadata: {contentType}})
  log.info('media.uploaded', {key, contentType, bytes: declared})

  return json({url: `/media/${key}`, key, contentType})
}

async function handleServe(request: Request, env: MediaEnv, key: string) {
  if (!env.MEDIA) {
    return new Response('Media store unavailable.', {status: 404})
  }
  const object = await env.MEDIA.get(key)
  if (!object) {
    return new Response('Not found.', {status: 404})
  }
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size),
      // Keys are content-addressed by UUID: safe to cache hard.
      'cache-control': 'public, max-age=31536000, immutable',
      'accept-ranges': 'bytes',
    },
  })
}

export async function routeMediaRequest(request: Request, env: Env, context: unknown, next: NextHandler) {
  const url = new URL(request.url)

  if (url.pathname === '/api/ops/media' && request.method === 'POST') {
    return handleUpload(request, env as unknown as MediaEnv)
  }

  if (url.pathname.startsWith('/media/') && request.method === 'GET') {
    const key = decodeURIComponent(url.pathname.slice('/media/'.length))
    if (key && !key.includes('..')) {
      return handleServe(request, env as unknown as MediaEnv, key)
    }
  }

  return next(request, env, context)
}
