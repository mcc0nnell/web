/**
 * GLADcast output receiver — a clean, distributed render node.
 *
 * Mirrors one RoomDO room on a projector / LED wall / OBS browser source.
 * Everything applied from the network is validated (schema.js) and clamped;
 * a malformed payload degrades to a renderable frame, never a crash.
 *
 * Time: all animation derives from the shared transport clock (server-time
 * epoch + local offset estimation), so reloading or reconnecting lands on
 * the identical frame the console is performing. Nothing is streamed
 * frame-by-frame.
 *
 * Determinism: modulation runs locally from the synced seed + transport
 * position + event sequence (see modulation.js) — two receivers compute
 * the same LFO/sequencer/envelope values at the same transport timestamp.
 *
 * Live inputs arrive as throttled control-signal payloads and are smoothed
 * by a SignalBus that decays to neutral if the console goes away.
 *
 * Clean feed: no chrome, no status text, no cursor. `?debug=1` overlays
 * diagnostics; `?standby=slate` shows a broadcast standby slate instead of
 * black before the first state arrives.
 */

import { Engine } from './engine.js';
import { GENERATOR_MAP } from './generators.js';
import { BroadcastLayer } from './broadcast.js';
import { ModEngine } from './modulation.js';
import { CaptionEngine } from './captions.js';
import { OpsSync } from './sync.js';
import { transportPosition, validateTransport } from './transport.js';
import { SignalBus } from './signals.js';
import {
  validateVisual,
  validateMedia,
  validateControls,
  validateOutputFormat,
  validateEmergency,
} from './schema.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Media player for synchronized descriptors. Loads the referenced asset,
 * reports status, keeps video playback locked to transport time, and
 * falls back safely (procedural generator content) when a source is
 * unavailable. Live camera descriptors are honest: they render fallback —
 * a webcam cannot be distributed without a real ingest.
 */
class MediaPlayer {
  constructor() {
    this.desc = null;
    this.status = 'none'; // none | loading | ready | error | camera-local
    this.source = null;   // element for engine.updateMedia
    this.isStatic = false;
  }

  set(desc) {
    if (!desc || desc.type === 'none') {
      this._cleanup();
      this.desc = desc;
      this.status = 'none';
      return;
    }
    if (this.desc && this.desc.id === desc.id && this.desc.revision === desc.revision && this.status !== 'error') {
      this.desc = desc; // refresh playback intent (loop/startedAt) only
      return;
    }
    this._cleanup();
    this.desc = desc;

    if (desc.type === 'camera') {
      this.status = 'camera-local';
      return;
    }

    this.status = 'loading';
    if (desc.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        this.source = c;
        this.isStatic = true;
        this.status = 'ready';
      };
      img.onerror = () => { this.status = 'error'; };
      img.src = desc.url;
    } else if (desc.type === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.loop = desc.loop;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadeddata = () => {
        this.source = v;
        this.isStatic = false;
        this.status = 'ready';
        v.play().catch(() => { /* retried on next tick */ });
      };
      v.onerror = () => { this.status = 'error'; };
      v.src = desc.url;
    }
  }

  /** Lock video playback to transport position (loop-aware, ±0.35 s window). */
  tick(position) {
    const v = this.source;
    if (this.status !== 'ready' || !this.desc || this.desc.type !== 'video' || !v) return;
    if (v.paused) v.play().catch(() => {});
    const dur = this.desc.duration > 0 ? this.desc.duration : v.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const elapsed = Math.max(0, position - this.desc.startedAt);
    const expected = this.desc.loop ? elapsed % dur : Math.min(elapsed, dur - 0.05);
    if (Math.abs(v.currentTime - expected) > 0.35) {
      try { v.currentTime = expected; } catch { /* not seekable yet */ }
    }
  }

  _cleanup() {
    if (this.source instanceof HTMLVideoElement) {
      this.source.pause();
      this.source.removeAttribute('src');
      this.source.load();
    }
    this.source = null;
    this.isStatic = false;
  }
}

export function bootOutput(root, options) {
  const { room, debug = false, standby = 'black' } = options;

  root.textContent = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'gc-output-canvas';
  root.appendChild(canvas);
  const ctx2d = canvas.getContext('2d');

  const hud = document.createElement('pre');
  hud.className = 'gc-output-hud';
  if (debug) root.appendChild(hud);

  if (!window.WebGL2RenderingContext) {
    if (debug) hud.textContent = 'WebGL2 unsupported — output cannot render.';
    return;
  }

  const engine = new Engine(1280, 720);
  const overlay = new BroadcastLayer();
  overlay.state.bug = false; // outputs show nothing until told to
  const captions = new CaptionEngine();
  const mod = new ModEngine();
  const bus = new SignalBus();
  const media = new MediaPlayer();

  let format = validateOutputFormat({ aspect: '16:9' });
  applyFormat(format);

  const mkDeck = (genId) => ({ gen: GENERATOR_MAP[genId], params: { mode: 0, intensity: 0.8, ...GENERATOR_MAP[genId].defaults } });
  const state = {
    A: mkDeck('signalacq'),
    B: mkDeck('plasma'),
    mix: { xfade: 0, blend: 0 },
    fx: { trails: 0, pixelate: 0, posterize: 0, crt: 0, invert: 0, freeze: 0 },
    xy: { x: 0.5, y: 0.5 },
  };

  let transport = null;          // adopted from the console via SET_TRANSPORT
  let synced = false;            // first visual applied
  let lastVisualRevision = -1;
  let lastEventSeq = 0;
  let lastEmergencySeq = 0;
  let emergency = null;
  let lastRoutesSig = '';
  let lastOverlaySig = '';
  let lastCaptionSeq = 0;
  const health = { frames: 0, fps: 0, lastFpsAt: 0, applied: 0, dropped: 0 };

  const sync = new OpsSync();

  function positionNow() {
    if (!transport) return sync.serverNow() / 1000; // pre-sync: arbitrary but smooth
    return transportPosition(transport, sync.serverNow());
  }

  function applyFormat(next) {
    format = next;
    engine.setSize(format.width, format.height);
    canvas.width = format.width;
    canvas.height = format.height;
    canvas.style.aspectRatio = `${format.width} / ${format.height}`;
  }

  function applyVisual(visual) {
    if (visual.revision && visual.revision <= lastVisualRevision) {
      health.dropped++;
      return; // stale or duplicate
    }
    if (visual.revision) lastVisualRevision = visual.revision;
    health.applied++;
    synced = true;

    for (const key of ['A', 'B']) {
      const d = visual.decks[key];
      state[key] = { gen: GENERATOR_MAP[d.gen], params: { ...d.params } };
    }
    state.mix = visual.mix;
    state.fx = visual.effects;
    state.xy = visual.xy;
    mod.configure(visual.modulation);

    const routesSig = JSON.stringify(visual.routes);
    if (routesSig !== lastRoutesSig) {
      lastRoutesSig = routesSig;
      mod.routes = [];
      for (const [src, tgt, amt] of visual.routes) mod.addRoute(src, tgt, amt);
    }

    const o = visual.overlays;
    const overlaySig = JSON.stringify([o.lowerThird, o.alert]);
    Object.assign(overlay.state, {
      clock: o.clock, bug: o.bug, bugText: o.bugText,
      channelId: o.channelId, channelName: o.channelName,
      showChannelId: o.showChannelId, crawlText: o.crawlText, slate: o.slate,
    });
    if (overlaySig !== lastOverlaySig) {
      lastOverlaySig = overlaySig;
      // Animated entrances re-stamp against transport time on this node.
      overlay.state.lowerThird = o.lowerThird ? { ...o.lowerThird, shownAt: positionNow() } : null;
      overlay.state.alert = o.alert ? { ...o.alert, shownAt: positionNow() } : null;
    }

    captions.captionSafe = visual.captions.safe;
    captions.mode = visual.captions.mode;
    if (visual.captions.raw && visual.captions.seq > lastCaptionSeq) {
      lastCaptionSeq = visual.captions.seq;
      captions.show(visual.captions.raw, positionNow());
    }
  }

  function applyState(roomState) {
    const t = validateTransport(roomState.transport);
    if (t && (!transport || t.sequence > transport.sequence)) {
      transport = t;
      mod.seed = t.seed;
      mod.bpm = t.bpm;
    }

    if (roomState.visual) applyVisual(validateVisual(roomState.visual));

    const ev = roomState.visualEvent;
    if (ev && typeof ev.seq === 'number' && ev.seq > lastEventSeq && Number.isFinite(ev.at)) {
      lastEventSeq = ev.seq;
      // TAKE and envelope hits land at the same transport point everywhere.
      mod.trigger(ev.at);
    }

    if (roomState.output) {
      const next = validateOutputFormat(roomState.output);
      if (next.width !== format.width || next.height !== format.height || next.fps !== format.fps) {
        applyFormat(next);
      }
    }

    if ('media' in roomState) {
      const desc = validateMedia(roomState.media);
      if (desc) media.set(desc);
    }

    const controls = validateControls(roomState.controls);
    if (controls) bus.push(controls, performance.now());

    const em = validateEmergency(roomState.emergency);
    if (em && em.seq > lastEmergencySeq) {
      lastEmergencySeq = em.seq;
      emergency = em.active ? em : null;
      if (emergency) {
        // Emergency wins over everything: alert band up, captions pinned
        // readable, no aesthetic treatment may reduce legibility.
        overlay.state.alert = { level: emergency.level, title: emergency.title, body: emergency.body, shownAt: positionNow() };
        overlay.state.slate = null;
        captions.captionSafe = true;
      } else {
        overlay.state.alert = null;
      }
    }
  }

  sync.onState = (roomState) => {
    try {
      applyState(roomState);
    } catch (err) {
      health.dropped++;
      if (debug) console.error('applyState failed', err);
    }
  };
  sync.connect(room);

  // Deterministic stand-in waveform for the oscilloscope generators: outputs
  // have no microphone, so synthesize the trace from synced band levels and
  // transport phase — identical on every node.
  const wave = new Uint8Array(256);
  function synthWave(position, a) {
    for (let i = 0; i < 256; i++) {
      const ph = i / 256;
      const v =
        Math.sin((ph * 2 + position * 1.7) * Math.PI * 2) * a.bass +
        Math.sin((ph * 7 + position * 3.1) * Math.PI * 2) * a.mid * 0.6 +
        Math.sin((ph * 19 + position * 5.3) * Math.PI * 2) * a.high * 0.35;
      wave[i] = 128 + Math.max(-127, Math.min(127, v * 110));
    }
    return wave;
  }

  // ------------------------------------------------------ render loop ----
  let last = null;
  let lastFrameAt = 0;

  function frame() {
    requestAnimationFrame(frame);

    // Frame-rate target from the synced output format.
    const nowMs = performance.now();
    if (format.fps < 58 && nowMs - lastFrameAt < 1000 / format.fps - 2) return;
    lastFrameAt = nowMs;

    const t = positionNow();
    const dt = last == null ? 0 : Math.max(0, Math.min(0.1, t - last));
    last = t;

    if (!synced) {
      // Clean standby: black by default, broadcast slate on request.
      ctx2d.fillStyle = '#000';
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      if (standby === 'slate') {
        overlay.state.slate = 'standby';
        overlay.draw(ctx2d, canvas.width, canvas.height, t);
        overlay.state.slate = null;
      }
      updateHud(t);
      return;
    }

    const live = bus.sample(nowMs);
    captions.tick(dt, t);
    media.tick(t);

    const emergencyLevel = emergency
      ? (emergency.level === 'emergency' ? 1 : emergency.level === 'warning' ? 0.66 : 0.33)
      : live.emergencyLevel;

    const offsets = mod.tick(t, {
      audio: live.audio,
      motion: live.motion,
      midi: live.midi,
      osc: live.osc,
      caption: { len: captions.len, pulse: captions.pulse },
      xy: live.xy,
      emergencyLevel,
    });

    const effDeck = (key) => {
      const d = state[key];
      const p = { ...d.params };
      for (const pk of ['p1', 'p2', 'p3', 'p4', 'intensity']) {
        const o = offsets[`${key}.${pk}`];
        if (o) p[pk] = clamp01(p[pk] + o);
      }
      return { gen: d.gen, params: p };
    };
    const effMix = { xfade: clamp01(state.mix.xfade + (offsets['mix.xfade'] || 0)), blend: state.mix.blend };
    const effFx = {
      ...state.fx,
      trails: clamp01(state.fx.trails + (offsets['fx.trails'] || 0)) * 0.97,
      crt: clamp01(state.fx.crt + (offsets['fx.crt'] || 0)),
      pixelate: state.fx.pixelate + (offsets['fx.pixelate01'] || 0) * 64,
      posterize: state.fx.posterize + (offsets['fx.posterize01'] || 0) * 10,
    };

    engine.updateMedia(media.source, media.isStatic);
    engine.updateWave(synthWave(t, live.audio));

    const ctx = { time: t, audio: { amp: live.audio.amp, bass: live.audio.bass, mid: live.audio.mid, high: live.audio.high }, xy: live.xy, beat: mod.sources['beat.pulse'] || 0 };
    engine.renderProgram(effDeck('A'), effDeck('B'), ctx, effMix, effFx);
    ctx2d.drawImage(engine.canvas, 0, 0, canvas.width, canvas.height);
    overlay.draw(ctx2d, canvas.width, canvas.height, t);
    captions.draw(ctx2d, canvas.width, canvas.height, t);

    health.frames++;
    updateHud(t);
  }

  function updateHud(t) {
    const nowMs = performance.now();
    if (nowMs - health.lastFpsAt > 500) {
      health.fps = Math.round((health.frames * 1000) / Math.max(1, nowMs - health.lastFpsAt));
      health.frames = 0;
      health.lastFpsAt = nowMs;
      if (debug) {
        const ctrlAge = bus.lastUpdateMs >= 0 ? Math.round(nowMs - bus.lastUpdateMs) : -1;
        hud.textContent = [
          `room        ${room}`,
          `conn        ${sync.connected ? 'connected' : sync.unauthorized ? 'unauthorized' : 'reconnecting'} (reconnects ${sync.reconnects})`,
          `revision    ${sync.lastRevision}  visual ${lastVisualRevision}  applied ${health.applied}  dropped ${health.dropped}`,
          `transport   seq ${transport?.sequence ?? '—'}  pos ${t.toFixed(2)}s  bpm ${transport?.bpm ?? '—'}  offset ${Math.round(sync.clock.offsetMs)}ms`,
          `controls    ${bus.isStale(nowMs) ? 'STALE→neutral' : 'live'}  age ${ctrlAge}ms  seq ${bus.lastSequence}`,
          `media       ${media.status}${media.desc?.url ? '  ' + media.desc.url.slice(0, 48) : ''}`,
          `render      ${health.fps} fps  gpu ${engine.frameMs.toFixed(1)}ms  ${format.width}×${format.height}@${format.fps}`,
          `emergency   ${emergency ? emergency.level.toUpperCase() : 'none'}`,
          `event seq   ${lastEventSeq}  caption seq ${lastCaptionSeq}`,
        ].join('\n');
      }
    }
  }

  requestAnimationFrame(frame);
}
