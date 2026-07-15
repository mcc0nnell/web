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
npm run build        # production build
npm run dev:worker   # build + wrangler dev (full DO runtime)
npm run deploy       # build + wrangler deploy
```

## Architecture rules (inherited from SF26 — do not regress)

- **One canonical RoomState** per room, mutated only via command → pure
  reducer (`src/lib/ops/reducers.ts`) → broadcast. Never mutate DO state
  outside `reduceRoomState`.
- The instrument syncs as one **opaque `visual` slice** via `SET_VISUAL`
  (same doctrine as SF26's `cobo`). Ops spine stays schema-agnostic;
  serialization lives in `src/scripts/gladcast/sync.js` (`collectVisual`).
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
