# CLAUDE.md — GLADcast

Real-time broadcast visual synthesizer. Successor to SF26 (`mcc0nnell/sf26`):
SF26's RoomDO ops spine + a new performable WebGL2 instrument.

## Stack

- Astro 6 + `@astrojs/cloudflare` (custom Worker entry `src/worker.ts`)
- Cloudflare Workers + one Durable Object (`RoomDO`, binding `OPS_ROOM`)
- Instrument: dependency-free vanilla JS + WebGL2 (`src/scripts/gladcast/`)
- Fonts: Instrument Serif, Outfit, IBM Plex Mono

## Commands

```bash
npm run dev          # console at /, output at /output/[room]
npm run check        # astro check — must stay green
npm run test         # vitest: schema, reducers, transport, determinism
npm run build        # production build
npm run dev:worker   # build + wrangler dev (full DO runtime + local R2)
npm run deploy       # build + wrangler deploy
```

Note: `wrangler dev` serves client JS from `dist/` — rebuild before
browser-testing client changes.

## Architecture rules (inherited from SF26 — do not regress)

- **One canonical RoomState** per room, mutated only via command → pure
  reducer (`src/lib/ops/reducers.ts`) → broadcast. Never mutate DO state
  outside `reduceRoomState`.
- The instrument syncs as a **versioned `visual` slice** (v2) via
  `SET_VISUAL`/`TAKE_VISUAL`, plus typed-but-opaque `transport`, `media`,
  `output`, `controls` (ephemeral — never persisted), and `emergency`
  slices. The ops spine stays schema-agnostic; validation lives client-side
  in `src/scripts/gladcast/schema.js`, serialization in `sync.js`.
- **Determinism is law**: all synchronized animation derives from the
  shared transport clock (`transport.js`) and the seeded PRNG (`prng.js`).
  Never introduce `Math.random()` or `performance.now()`-origin time into
  anything a receiver renders.
- Monotonicity guards are per-slice (`visual.revision`,
  `transport.sequence`, `controls.sequence`, `emergency.seq`,
  `visualEvent.seq`) and console-side counters are timestamp-based so a
  reloaded console outruns its previous session. Do not reintroduce a
  room-level revision gate on receivers — ephemeral commands make it
  non-monotonic across DO hibernation.
- The WebSocket (`/api/ops/ws`) is **read-only**; all mutations go through
  operator-gated `POST /api/ops/command`.
- **Captions are information, not atmosphere**: caption-safe mode must
  always override aesthetic treatment; never render caption truth in WebGL.
- ASL camera input is **control data, never translation** — do not add
  sign-recognition claims without a separate verified language model.
- Accessibility non-negotiables: no strobe >3/s, respect
  `prefers-reduced-motion`, no color-only status, big touch targets.

## Layout

```
worker/                 SF26 spine: RoomDO, router, operator auth, headers
src/lib/ops/            state / reducers / protocol / macros (+ visual slice)
src/worker.ts           Worker entry: ops router wraps Astro handler
src/scripts/gladcast/   the instrument (engine, generators, inputs, sync…)
src/pages/index.astro   operator console (?room= binds SYNC)
src/pages/output/[room].astro  clean render node (prerender = false)
```

## Design system

Background `#0F1520`, midnight `#1B2333`, accent `#DC2626`, foreground
`#E8ECF1`. Serif = Instrument Serif, sans = Outfit, mono = IBM Plex Mono.
Identity: civic Los Angeles × public-access television × demoscene. No
nonprofit clip-art, no hearing-aid symbolism, no decorative hands.
