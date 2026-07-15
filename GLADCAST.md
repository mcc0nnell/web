# GLADcast

**A real-time demoscene visual synthesizer for live Deaf broadcasting.**

GLADcast does not play a video. GLADcast plays the broadcast system itself.

It is a playable visual instrument — part Amiga demoscene engine, part modular
video synthesizer, part television character generator, part broadcast
automation system, part live archive-performance tool, part Deaf civic
communications console. One operator can perform an entire visual broadcast;
larger productions can split control across a director, graphics operator,
captioner, archivist, and ASL performer (MIDI/OSC/keyboard all address the
same state).

Live at **`/gladcast`**. No build-time dependencies beyond Astro; the engine
is vanilla JS + WebGL2.

## Signal chain

```
Sources → Generators → Effects → Compositor → Broadcast Output
```

| Module | File | What it does |
|---|---|---|
| Engine | `src/scripts/gladcast/engine.js` | WebGL2 core: generator passes, A/B crossfade compositor (mix/add/mult/screen), post FX with feedback, offscreen GL canvas feeding all displays |
| Generators | `src/scripts/gladcast/generators.js` | 17 native GLSL generators, each with a restrained **broadcast** mode and an aggressive **demoscene** mode |
| Broadcast CG | `src/scripts/gladcast/broadcast.js` | Clock, station bug, channel ID, lower thirds, crawler, emergency alerts, legal/technical/standby slates, safe-area guides |
| Modulation | `src/scripts/gladcast/modulation.js` | 3 LFOs (BPM-syncable), envelope, probabilistic step sequencer, smoothing/quantize, any-source → any-parameter routing matrix |
| Inputs | `src/scripts/gladcast/inputs.js` | Audio analysis (amp + 3 bands + waveform), WebMIDI with MIDI-learn, OSC-over-WebSocket, ASL camera-motion tracker |
| Captions | `src/scripts/gladcast/captions.js` | Caption-native engine: broadcast + expressive presentation, emphasis, cues, caption-safe override |
| Presets | `src/scripts/gladcast/presets.js` | The 26.x channel multiplex + signature preset bank (portable JSON) |
| Output | `src/scripts/gladcast/output.js` | Pop-out clean program feed, WebM recording, PNG grabs, aspect presets |
| Console | `src/scripts/gladcast/main.js` + `ui.js` | Single-screen performance workspace |

## The eight channels — GLAD 26 multiplex

Each channel is a program identity *and* a bank of playable presets, loaded to
PREVIEW and taken to PROGRAM.

| Ch | Identity | Example presets |
|---|---|---|
| 26.1 | Community | Community Bulletin, Deaf Los Angeles Online |
| 26.2 | Emergency | Emergency Civic Grid, GLAD Legal Alert, Shelter Map |
| 26.3 | Culture | Public Access Midnight, LA Noir Transmission, Caption Particle Field |
| 26.4 | Rights | This Is Infrastructure, Call To Action |
| 26.5 | History | Rutherford Archive Engine, Archive Resurrection |
| 26.6 | Youth | Pixel Classroom, Starfield Story Time, Metaball Playground |
| 26.7 | The Possible | LA28 Future City, ASL Oscilloscope, Wireframe Community Center |
| 26.8 | Utility | Legal ID, Technical Difficulties, Signal From Eagle Rock, WeatherStar Eagle Rock |

## Performing it

- **Keys 1–8** stage a channel on PREVIEW · **Enter/Space** = TAKE · **←/→** ride the crossfader
- **f** freeze · **d** toggle PROGRAM demoscene mode · **e** emergency override
- **Knobs** drag vertically; double-click recenters; **right-click / long-press arms MIDI-learn**
- **MIDI notes** (C–G any octave) launch channels 1–8 and trigger the envelope
- **XY pad** publishes `xy.x` / `xy.y` — every generator listens
- **TAP** sets BPM; LFOs can sync to it; the step sequencer runs on the bar

### ASL-responsive control

Enable **ASL CAMERA**. GLADcast does **not** attempt to translate ASL — it
measures broad signing motion and publishes it as expressive control data
(mod sources): `motion.energy`, `motion.x/y`, `motion.vx/vy`,
`motion.spread`, `motion.raised`, `motion.tempo`. Defaults route energy →
program intensity and spread → parameter 1; route anything else in the
MODULATION panel. A sharp stop after sustained signing freezes the frame.
ASL operates the instrument; it never merely decorates the output.
(Actual translation would require connecting a separate verified language
model — deliberately out of scope.)

### Captions are a first-class signal

Captions render (broadcast band or expressive word-flight), modulate
(`caption.len`, `caption.pulse`), and trigger scenes (`[cue:name]` prefix).
`*word*` marks emphasis. **CAPTION SAFE** (default ON) overrides every
aesthetic treatment that would reduce comprehension — expressive mode cannot
engage while it is on.

### Archive material

Load video/images (drag onto the PROGRAM monitor) — e.g. GLAD archival media
or the Susan D. Rutherford collection — and play them through the **Archive
Frame**, **Halftone Portrait**, or **ASCII Field** generators. Treatments
animate, colorize, and re-screen the material but are capped so documentary
content stays recognizable (gate weave and distortion are intentionally
clamped in the shaders).

## Modulation sources

`lfo1–3`, `env`, `seq`, `beat.pulse`, `bar`, `random`, `time.sin`,
`audio.amp/bass/mid/high`, `motion.*`, `midi.note/velocity/cc1`,
`osc.1–2`, `caption.len/pulse`, `xy.x/y`, `emergency` — routable to any deck
parameter, intensity, crossfade, or FX amount with per-route amount,
smoothing, and quantization.

## OSC bridge

Connect any WebSocket relay that forwards OSC as JSON frames:

```json
{ "address": "/gladcast/1", "value": 0.5 }   // → mod source osc.1
{ "address": "/gladcast/scene", "value": 3 } // → stage channel 26.3
{ "address": "/gladcast/take" }              // → TAKE
```

## Outputs

Working in-browser today:

- **OUTPUT ⧉** — clean program feed in its own window: fullscreen it on a
  stage screen, window-capture it in OBS, or feed a scan converter for
  HDMI/SDI. Or point an **OBS browser source** straight at `/gladcast`.
- **● REC** — WebM recording of the program feed (12 Mb/s VP9/VP8)
- **SNAP** — PNG frame grabs
- Aspect presets: 16:9 (720/1080), 9:16, 1:1, 2560×720 ultrawide stage canvas

Native-host integration points (the architecture keeps render state
serializable and the engine headless-capable for these):

- **NDI / Syphon / Spout** — wrap the page in Electron/Tauri and publish the
  program canvas; or use OBS's NDI output from a browser source
- **ProRes / WebM with alpha, image sequences** — the compositor renders to
  FBOs; an export path can render deterministic frames offline (Remotion-style)
- **AU/VST-style plugin, SF26 broadcast layer node** — the console is one
  `boot(rootElement)` call with all state addressable via MIDI/OSC, so it can
  run headless as a remote-controlled rendering node

## Design language

Los Angeles civic architecture, Eagle Rock, analog television, public-access
broadcasting, WeatherStar/Prevue, Amiga demoscene, cyberpunk terminals,
broadcast engineering, Deaf visual culture, archival documentary media,
emergency communications — set in Instrument Serif / Outfit / IBM Plex Mono
on the site's midnight-and-signal-red system. No nonprofit clip-art, no
sentimental stock, no hearing-aid symbolism, no decorative hands.
