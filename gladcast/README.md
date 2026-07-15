# GLADcast

**A real-time demoscene visual synthesizer for live Deaf broadcasting.**
Successor to [SF26](https://github.com/mcc0nnell/sf26) — the same proven
broadcast-operations spine, now driving one distributed visual instrument
with any number of synchronized video outputs.

GLADcast does not play a video. GLADcast plays the broadcast system itself.

## What it is

- **17 native WebGL2 generators** (plasma, starfield, tunnel, metaballs,
  raster bars, particles, oscilloscope, vector grid, city, wireframe
  terrain, halftone, archive frame, test patterns, point cloud, ASCII,
  waveform geometry, signal acquisition), each with restrained *broadcast*
  and aggressive *demoscene* modes
- **Eight-channel 26.x multiplex** (Community / Emergency / Culture /
  Rights / History / Youth / The Possible / Utility): preview/program
  decks, TAKE/CUT, four-blend-mode crossfader, signature presets
- **Deterministic modulation**: 3 BPM-syncable LFOs, envelope,
  probabilistic step sequencer, any-source→any-parameter routing
- **Inputs**: audio analysis, WebMIDI with MIDI-learn, OSC-over-WebSocket,
  keyboard, and an **ASL-responsive camera tracker** publishing signing
  motion (energy/position/velocity/spread/raised/tempo) as control data —
  ASL operates the instrument, it is never decoration, and no translation
  is attempted
- **Caption-native**: broadcast + expressive presentation, emphasis,
  `[cue:name]` scene triggers, and a caption-safe override that always wins
- **Character generator**: clock, bug, channel ID, lower thirds, crawler,
  three-level emergency alerts, legal/technical/standby slates

## Architecture

```
console (/)                      RoomDO (one per room)              outputs (/output/[room])
┌────────────────────┐            ┌──────────────────────┐            ┌────────────────────┐
│ performs the       │  commands  │ command → validate → │  WebSocket │ validating render  │
│ instrument; owns   │ ─────────► │ pure reducer → SQL   │ ─────────► │ nodes: derive      │
│ transport, seeds,  │  (operator │ snapshot + event log │ (read-only)│ everything locally │
│ live inputs        │   gated)   │ → broadcast          │            │ from shared state  │
└────────────────────┘            └──────────────────────┘            └────────────────────┘
```

Traffic is split by frequency — high-frequency rendering never crosses
the network:

| Layer | Commands | Cadence | Persistence |
|---|---|---|---|
| Authoritative state | `SET_VISUAL`, `SET_TRANSPORT`, `SET_MEDIA_SOURCE`, `SET_OUTPUT_FORMAT` | change-only (≤ ~3 Hz) | SQL snapshot + event log |
| Instrument events | `TAKE_VISUAL`, `TRIGGER_ENVELOPE`, `EMERGENCY_OVERRIDE` | on action, stamped with transport position | persisted |
| Live control signals | `SET_CONTROL_SIGNALS` | ≤10 Hz, material-change + heartbeat | **ephemeral** (broadcast, never stored) |
| Rendering | — | 60 fps, local | — |

### What is synchronized

Generator selection and parameters for both decks, crossfade and blend
mode, effects (trails/pixelate/posterize/CRT/invert/freeze), XY pad,
LFO/sequencer configuration, modulation routes, presets (they are just
visual state), captions (text + emphasis + safe/expressive mode),
character-generator overlays, media descriptors, output format, transport
(epoch/BPM/seed/sequence), TAKE and envelope events, live control signals
(audio bands, ASL motion, MIDI, OSC, XY, emergency level), and the
emergency override layer.

### What remains local

Microphone audio and the camera feed themselves (their *analysis* syncs,
the media does not), MIDI/OSC device handling, the operator UI, and each
node's actual GPU rendering. The oscilloscope trace on outputs is a
deterministic synthesis from the synced band levels — outputs have no
microphone.

### Transport synchronization

The transport is tiny serializable state:
`{running, epochMs, positionAtEpoch, bpm, seed, sequence}` — `epochMs` in
*server* wall-clock time. Every client estimates its offset to the RoomDO
clock from the `sentAt` stamp on each WebSocket event (smoothed, snap on
>2 s jumps), then derives `position = positionAtEpoch + (serverNow −
epochMs)/1000`. All generators, LFOs, sequencers, envelopes, caption/CG
entrances, and video playback derive from this position, so reloads and
reconnects land on the same frame and nothing depends on any browser's
`performance.now()` origin. BPM changes preserve position (`sequence`
increments; stale transports are rejected in the reducer).

### Deterministic modulation

Every modulation value is a pure function of (seed, transport position,
event list, control signals) — see `src/scripts/gladcast/modulation.js`:

- LFO phase = `position × rate` (or beat-synced) — no integration
- random LFOs and the `random` source draw from a seeded stateless PRNG
  keyed by (seed, stream, quantized position)
- sequencer probability decisions are seeded per absolute step, with a
  bounded back-scan so a node joining mid-song computes the same held value
- envelopes are pure in (trigger position, position); triggers arrive as
  `TRIGGER_ENVELOPE` / `TAKE_VISUAL` events stamped with the transport
  position they apply at

`tests/modulation.test.js` includes a two-receiver harness proving equal
outputs for equal (seed, transport timestamps, events, controls).

### Media assets

Binary media never enters RoomDO. The console publishes to R2 once
(`POST /api/ops/media`, operator-gated → served at `/media/<key>`), then
syncs a descriptor `{id, type, url, mimeType, loop, muted, fit, startedAt,
duration, revision}` via `SET_MEDIA_SOURCE`. Receivers preload, report
status, lock video playback to transport time (±0.35 s window,
deterministic looping), and fall back to procedural generator content when
a source fails. Remote URLs must be same-origin or on the https allowlist
in `schema.js`.

**Live camera is not faked.** "CAM AS SOURCE" renders the webcam on the
console and publishes an honest `{type:'camera'}` descriptor — outputs
show their procedural fallback. Distributing a live camera requires a real
ingest (WebRTC SFU or HLS): publish its playback URL as a `video`
descriptor from an allowed origin and the receivers will play it.

### Output formats

`SET_OUTPUT_FORMAT` syncs aspect preset, pixel dimensions, and target fps:
1280×720, 1920×1080, 720×1280, 1080×1080, 2560×720. Every output resizes
its engine, framebuffers, canvas, overlays, captions, and safe areas
together — no reload.

## Running it

```bash
npm install
npm run check        # astro check (type safety)
npm run test         # vitest — schema, reducers, transport, determinism
npm run build        # production build
npm run dev:worker   # build + wrangler dev (full DO runtime + local R2)
npm run deploy       # build + wrangler deploy
```

Open `/` (optionally `/?room=<slug>`), press **SYNC**. Open outputs
anywhere: `/output/<slug>`.

### Clean output

`/output/[room]` is a clean feed for projectors, LED walls, OBS browser
sources, and scan converters: no chrome, no status text, no cursor (hides
after 3 s), no layout shift, black standby (never an "acquiring signal"
message). Options:

- `?debug=1` — diagnostics overlay: connection state, reconnects, applied
  revision, transport sequence/position/offset, control-signal age and
  staleness, media status, fps and GPU frame time, emergency state
- `?standby=slate` — broadcast standby slate instead of black before sync
- `?bg=<color>` — page background behind the canvas

Outputs are read-only: the WebSocket carries state out; every mutation
goes through the operator-gated command route.

### Emergency override

One press (or key `e`): sends `EMERGENCY_OVERRIDE` (its own state slice,
independent of visual state and media), takes 26.2 to program, raises the
alert banner, forces caption-safe. Receivers assert the alert even when
the visual payload or media is broken — the banner and captions are CG
drawn over whatever renders, and generators fall back procedurally. No
aesthetic effect may reduce emergency legibility.

### Performing

- **1–8** stage a channel · **Enter** TAKE · **←/→** crossfader · **f**
  freeze · **d** demoscene · **e** emergency
- Knobs drag vertically; double-click recenters; right-click/long-press
  arms MIDI-learn
- MIDI notes C–G launch channels; TAP sets BPM (retimes the shared
  transport, position-preserving)
- OSC over WebSocket: `/gladcast/1..8`, `/gladcast/scene`, `/gladcast/take`

## Production setup (Cloudflare)

1. `wrangler r2 bucket create gladcast-media` (binding is preconfigured;
   `wrangler dev` simulates it locally).
2. Put Cloudflare Access in front of the console route and set
   `GLADCAST_OPERATOR_TRUST_ACCESS`, plus `GLADCAST_ACCESS_TEAM_DOMAIN` +
   `GLADCAST_ACCESS_AUD` for cryptographic JWT verification
   (`worker/operator-auth.ts`), or set `GLADCAST_OPERATOR_TOKEN` for
   shared-token auth.
3. **Remove `GLADCAST_OPERATOR_GUARD_DISABLED`** — it ships `"true"` for
   development and leaves every command route open.
4. `npm run deploy`.

## Known browser limitations

- WebGL2 is required; receivers show nothing (debug mode explains why).
- Background tabs throttle timers: keep the console tab focused/visible
  while performing; output windows should be their own windows.
- Client clocks are corrected against the DO, but transport agreement is
  bounded by network jitter (typically well under a frame on a LAN).
- WebMIDI requires Chromium-family browsers; audio/camera need HTTPS.
- Autoplay policies can delay synced video until the output window has
  had one user gesture in strict browsers (muted video generally exempt).

## What this is — and isn't (yet)

- **Is:** a browser-native distributed visual instrument, and a clean
  OBS-browser-source / window-capture output for streaming or hardware
  scan-out.
- **Is not yet:** NDI, Syphon, Spout, SDI, ProRes export, or a native
  AU/VST3 plugin. Those require a native shell (Electron/Tauri wrapping
  the receiver, publishing its canvas) — the receiver is a single
  `bootOutput(el, {room})` call to make that wrap thin. None of these are
  claimed until implemented.

## Design doctrine

ASL operates the instrument; it is not decorative. Captions are a
first-class signal. Archive media remains recognizable. Broadcast mode
stays legible. Demoscene mode may be aggressive. Emergency information
always wins. The 26.x multiplex is the station's identity. GLADcast plays
the broadcast system itself.
