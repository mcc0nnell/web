/// <reference types="astro/client" />

// Worker environment. Operator auth vars are read by worker/operator-auth.ts;
// OPS_ROOM binds the RoomDO namespace (wrangler.jsonc).
interface Env {
  OPS_ROOM: import('cloudflare:workers').DurableObjectNamespace<import('../worker/room-do').RoomDO>
  ASSETS: {fetch(request: Request): Promise<Response>}
  GLADCAST_OPERATOR_ACCESS_EMAILS?: string
  GLADCAST_OPERATOR_ACCESS_DOMAINS?: string
  GLADCAST_OPERATOR_TOKEN?: string
  GLADCAST_ACCESS_TEAM_DOMAIN?: string
  GLADCAST_ACCESS_AUD?: string
  GLADCAST_OPERATOR_TRUST_ACCESS?: string
  GLADCAST_OPERATOR_GUARD_DISABLED?: string
  // Optional R2 bucket for published performance media (see worker/media.ts).
  MEDIA?: import('../worker/media').R2BucketLike
}
