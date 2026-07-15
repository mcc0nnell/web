import {defineConfig, sessionDrivers} from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  output: 'static',
  // Nothing uses Astro.session; pin the no-op driver so the adapter does not
  // default to Cloudflare KV and add a SESSION namespace to every deploy.
  session: {driver: sessionDrivers.null()},
  adapter: cloudflare({
    imageService: 'compile',
    // The worker entry comes from wrangler.jsonc `main` (src/worker.ts), which
    // wraps the Astro handler with the RoomDO ops router.
  }),
})
