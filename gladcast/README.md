# GLADcast

**A real-time demoscene visual synthesizer for live Deaf broadcasting.**
Successor to [SF26](https://github.com/mcc0nnell/sf26) — the same proven
broadcast-operations spine in a new performable wrapper.

GLADcast does not play a video. GLADcast plays the broadcast system itself.

## Lineage

SF26 ran sf26.live for the NAD 58th Biennial Conference: a Cloudflare
Workers + Durable Objects ops runtime where one canonical `RoomState` fans
out to every console and output surface via **command → pure reducer →
broadcast**. GLADcast keeps that spine verbatim (`worker/`, `src/lib/ops/`)
and replaces the output layer with a playable instrument:

- **17 native WebGL2 generators** (plasma, starfield, tunnel, metaballs,
  raster bars, particles, oscilloscope, vector grid, city, wireframe
  terrain, halftone, archive frame, test patterns, point cloud, ASCII,
  waveform geometry, signal acquisition), each with restrained *broadcast*
  and aggressive *demoscene* modes
- **Eight-channel 26.x multiplex** (Community / Emergency / Culture /
  Rights / History / Youth / The Possible / Utility) with preview/program
  switching, TAKE/CUT, four-blend-mode crossfader, signature presets
- **Modulation**: 3 BPM-syncable LFOs, envelope, probabilistic step
  sequencer, any-source→any-parameter routing with smoothing/quantize
- **Inputs**: audio analysis, WebMIDI with MIDI-learn, OSC-over-WebSocket,
  keyboard, webcam-as-source, and an **ASL-responsive camera tracker** that
  publishes signing motion (energy/position/velocity/spread/raised/tempo)
  as control data — no translation attempted; ASL operates the instrument
- **Caption-native**: broadcast + expressive presentation, emphasis, scene
  cues, and a caption-safe override that always wins
- **Character generator**: clock, bug, channel ID, lower thirds, crawler,
  three-level emergency alerts with one-press override, legal/technical/
  standby slates

See `src/scripts/gladcast/` — the instrument is dependency-free vanilla JS.

## Architecture

```
console (/)                    RoomDO (one per room)          outputs (/output/[room])
┌──────────────────┐  SET_VISUAL  ┌──────────────────┐  STATE_PATCH  ┌──────────────────┐
│ perform: decks,  │ ───────────► │ command → pure   │ ────────────► │ clean render     │
│ mix, fx, CG,     │  (POST       │ reducer → SQL    │  (WebSocket   │ node: engine +   │
│ captions, mods   │  /api/ops/   │ snapshot + event │  /api/ops/ws) │ CG + captions,   │
│                  │  command)    │ log → broadcast  │               │ N in lockstep    │
└──────────────────┘              └──────────────────┘               └──────────────────┘
```

- The instrument's whole performable surface travels as one opaque
  `visual` slice (`SET_VISUAL`), mirroring SF26's `cobo` pattern — the ops
  spine stays agnostic of the instrument's schema.
- Publishes are throttled and change-only (~3 Hz max); LFO/modulation
  motion runs locally on each output from the synced base state, so motion
  stays smooth between publishes and clocks never need to agree.
- Timers, alerts, lower thirds, show phase, gates, macros: the full SF26
  command set still works on the same room — `SET_VISUAL` is one more
  command, not a fork.

## Running it

```bash
npm install
npm run dev          # console at /, output at /output/main-hall
npm run build        # astro build → dist/
npm run dev:worker   # build + wrangler dev (full DO runtime locally)
npm run deploy       # build + wrangler deploy
```

Open `/` for the console, press **SYNC** in the header, then open
`/output/main-hall` anywhere else — it mirrors the program. Multiple
consoles can share a room (`/?room=stage-left`), which is how control
distributes across a director, graphics operator, captioner, and ASL
performer.

## Operator boundary

Inherited from SF26: `POST /api/ops/command` is operator-gated
(`worker/operator-auth.ts`), designed for Cloudflare Access in front with
optional JWT verification (`GLADCAST_ACCESS_TEAM_DOMAIN` +
`GLADCAST_ACCESS_AUD`). The WebSocket is read-only by design — outputs are
public read surfaces, mutations are not.

> ⚠ `wrangler.jsonc` ships with `GLADCAST_OPERATOR_GUARD_DISABLED: "true"`
> so development works before an Access application exists. Configure
> Access and flip it off before real production use.

## Performing

- **1–8** stage a channel on preview · **Enter** TAKE · **←/→** crossfader
- **f** freeze · **d** demoscene mode · **e** emergency override
- Knobs: drag vertically; double-click recenters; right-click/long-press = MIDI-learn
- MIDI notes C–G launch channels; `[cue:name]` in a caption fires a scene
- OSC: `{"address":"/gladcast/take"}`, `/gladcast/scene`, `/gladcast/1..8`

## Roadmap (carried from the SF26 inventory)

- Showcaller surface driving `SET_SHOW_PHASE` / `SET_SEGMENT` / gates
  against rundown JSON (the commands already work)
- Provider-neutral live caption ingestion (Wordly/webhook/replay) feeding
  the caption engine instead of manual entry
- Fallback-slate phase wired to `show.fallback` on output surfaces
- NDI/Syphon via a native (Electron/Tauri) shell; deterministic offline
  render path for Remotion-style exports
