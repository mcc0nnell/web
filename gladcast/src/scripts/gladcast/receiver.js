/**
 * GLADcast output receiver — a clean render node.
 *
 * Boots the engine with no console and mirrors the room's `visual` slice
 * from RoomDO. This is the projector / stream / venue-screen surface:
 * point a browser (or OBS browser source) at /output/[room] and it stays
 * in lockstep with whoever is performing the console.
 *
 * Modulation runs locally from the synced base state (routes + BPM), so
 * LFO motion stays smooth between publishes; only performed state travels.
 */

import { Engine } from './engine.js';
import { GENERATOR_MAP } from './generators.js';
import { BroadcastLayer } from './broadcast.js';
import { ModEngine, MOD_SOURCES, MOD_TARGETS } from './modulation.js';
import { AudioInput } from './inputs.js';
import { CaptionEngine } from './captions.js';
import { OpsSync } from './sync.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function bootOutput(root, room) {
  root.textContent = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'gc-output-canvas';
  root.appendChild(canvas);
  const status = document.createElement('div');
  status.className = 'gc-output-status';
  status.textContent = 'ACQUIRING SIGNAL…';
  root.appendChild(status);

  const engine = new Engine(1280, 720);
  canvas.width = 1280;
  canvas.height = 720;
  const ctx2d = canvas.getContext('2d');
  const overlay = new BroadcastLayer();
  const captions = new CaptionEngine();
  const mod = new ModEngine();
  const audio = new AudioInput(); // idle synthetic pulse unless enabled

  const mkDeck = (genId) => {
    const gen = GENERATOR_MAP[genId] || GENERATOR_MAP.signalacq;
    return { gen, params: { mode: 0, intensity: 0.8, ...gen.defaults } };
  };
  const state = {
    A: mkDeck('signalacq'),
    B: mkDeck('plasma'),
    mix: { xfade: 0, blend: 0 },
    fx: { trails: 0, pixelate: 0, posterize: 0, crt: 0, invert: 0, freeze: 0 },
    xy: { x: 0.5, y: 0.5 },
  };

  const start = performance.now();
  const nowSec = () => (performance.now() - start) / 1000;
  let lastCaptionSeq = 0;
  let lastOverlaySig = '';

  function applyVisual(v) {
    if (!v || v.v !== 1) return;
    for (const key of ['A', 'B']) {
      const d = v[key];
      if (!d || !GENERATOR_MAP[d.gen]) continue;
      state[key] = { gen: GENERATOR_MAP[d.gen], params: { ...state[key].params, ...d.params } };
    }
    if (v.mix) state.mix = { ...state.mix, ...v.mix };
    if (v.fx) state.fx = { ...state.fx, ...v.fx };
    if (v.xy) state.xy = { ...state.xy, ...v.xy };
    if (typeof v.bpm === 'number') mod.bpm = v.bpm;

    if (Array.isArray(v.routes)) {
      mod.routes = [];
      for (const [src, tgt, amt] of v.routes) {
        if (MOD_SOURCES.includes(src) && MOD_TARGETS.includes(tgt)) mod.addRoute(src, tgt, amt);
      }
    }

    if (v.overlay) {
      const o = v.overlay;
      const sig = JSON.stringify([o.lowerThird, o.alert]);
      Object.assign(overlay.state, {
        clock: !!o.clock,
        bug: !!o.bug,
        bugText: o.bugText || overlay.state.bugText,
        channelId: o.channelId || overlay.state.channelId,
        channelName: o.channelName || overlay.state.channelName,
        showChannelId: !!o.showChannelId,
        crawlText: o.crawlText || '',
        slate: o.slate ?? null,
      });
      if (sig !== lastOverlaySig) {
        // Re-stamp animated elements against this client's clock.
        overlay.state.lowerThird = o.lowerThird ? { ...o.lowerThird, shownAt: nowSec() } : null;
        overlay.state.alert = o.alert ? { ...o.alert, shownAt: nowSec() } : null;
        lastOverlaySig = sig;
      }
    }

    captions.captionSafe = v.captionSafe !== false;
    if (v.captionMode) captions.mode = v.captionMode;
    if (v.caption && v.caption.seq !== lastCaptionSeq) {
      lastCaptionSeq = v.caption.seq;
      captions.show(v.caption.raw, nowSec());
    }
  }

  const sync = new OpsSync();
  sync.onStatus = (s) => { status.textContent = s; };
  sync.onState = (roomState) => {
    status.classList.add('live');
    applyVisual(roomState.visual);
  };
  sync.connect(room);

  let last = nowSec();
  function frame() {
    const t = nowSec();
    const dt = Math.min(0.1, t - last);
    last = t;

    audio.tick();
    captions.tick(dt, t);
    const offsets = mod.tick(dt, {
      audio,
      motion: { energy: 0, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, spread: 0, raised: 0, tempo: 0 },
      midi: { lastNote: 0, lastVelocity: 0, cc: {} },
      osc: [],
      caption: { len: captions.len, pulse: captions.pulse },
      xy: state.xy,
      emergencyLevel: 0,
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

    engine.updateWave(audio.wave);
    const ctx = { time: t, audio, xy: state.xy, beat: mod.sources['beat.pulse'] || 0 };
    engine.renderProgram(effDeck('A'), effDeck('B'), ctx, effMix, effFx);
    ctx2d.drawImage(engine.canvas, 0, 0, canvas.width, canvas.height);
    overlay.draw(ctx2d, canvas.width, canvas.height, t);
    captions.draw(ctx2d, canvas.width, canvas.height, t);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
