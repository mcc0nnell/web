import {routeOpsRequest} from './router'
import {RoomDO} from './room-do'
import {applySecurityHeaders, handleCorsPreflightIfNeeded} from './headers'

export {RoomDO}

// The ops router owns /api/ops/* (RoomDO room runtime — the SF26-proven
// command → reducer → broadcast spine). Everything else falls through to the
// Astro handler (console, output surfaces, static assets).
export function withOpsRouter(next: (request: Request, env: Env, context: unknown) => Promise<Response> | Response) {
  return {
    async fetch(request: Request, env: Env, context: unknown) {
      const preflight = handleCorsPreflightIfNeeded(request)
      if (preflight) {
        return preflight
      }

      const response = await routeOpsRequest(request, env as never, context, next)
      return applySecurityHeaders(response)
    },
  }
}
