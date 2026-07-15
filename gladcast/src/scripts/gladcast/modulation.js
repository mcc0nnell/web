/**
 * GLADcast modulation system — deterministic edition.
 *
 * Every modulation value is a pure function of (seed, transport position,
 * event list, external control signals). Nothing integrates local frame
 * time and nothing calls Math.random(), so any two nodes with the same
 * transport, seed, and events compute identical LFO phases, sequencer
 * decisions, envelope levels, and "random" values — while the picture
 * still feels alive.
 *
 * Base parameter values stay untouched by routing: releasing a modulation
 * returns the parameter to its performed position.
 */

import { prand } from './prng.js';

export const LFO_SHAPES = ['sine', 'triangle', 'saw', 'square', 'random'];

/** Pure LFO evaluation. `index` seeds the random shape per-LFO. */
export function lfoValue(lfo, index, position, bpm, seed) {
  const rate = Math.max(0, lfo.rate);
  if (rate === 0) return 0.5;
  // sync: rate = cycles per beat; free: rate = Hz. Both are pure in position.
  const cycles = lfo.sync ? (position * bpm / 60) * rate : position * rate;
  const p = cycles % 1;
  switch (lfo.shape) {
    case 'sine': return 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
    case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2;
    case 'saw': return p;
    case 'square': return p < 0.5 ? 1 : 0;
    case 'random': return prand(seed, 100 + index, Math.floor(cycles * 4)); // 4 holds/cycle
    default: return 0;
  }
}

/** Envelope level from the most recent trigger position (pure). */
export function envelopeLevel(triggerAt, position, attack = 0.05, release = 0.6) {
  if (triggerAt == null || position < triggerAt) return 0;
  const e = position - triggerAt;
  if (e < attack) return e / Math.max(0.005, attack);
  return Math.max(0, 1 - (e - attack) / Math.max(0.01, release));
}

/**
 * Step-sequencer value at an absolute step index. Probability decisions are
 * seeded per absolute step; when a step doesn't fire the previous fired
 * value holds. The bounded back-scan keeps this pure (no held state), so
 * receivers landing mid-song still agree.
 */
export function seqValueAt(seq, absStep, seed) {
  const steps = seq.steps;
  const len = steps.length;
  if (!len) return 0;
  for (let back = 0; back < len * 2; back++) {
    const idx = absStep - back;
    if (idx < 0) break;
    if (seq.probability >= 1 || prand(seed, 300, idx) <= seq.probability) {
      return steps[((idx % len) + len) % len];
    }
  }
  return 0;
}

/** One modulation route: source key → target key, scaled, smoothed. */
export class ModRoute {
  constructor(source, target, amount = 0.5) {
    this.source = source;
    this.target = target;   // e.g. 'A.p1', 'fx.trails', 'mix.xfade'
    this.amount = amount;   // -1..1
    this.smooth = 0.15;     // seconds to ~63% — 0 for instant
    this.quantize = 0;      // 0 off, else snap to N levels
    this._val = 0;
  }
  tick(dt, sources) {
    let v = (sources[this.source] ?? 0) * this.amount;
    if (this.quantize > 0) v = Math.round(v * this.quantize) / this.quantize;
    if (this.smooth > 0 && dt >= 0) {
      const k = 1 - Math.exp(-dt / this.smooth);
      this._val += (v - this._val) * k;
    } else {
      this._val = v;
    }
    return this._val;
  }
}

export class ModEngine {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.bpm = 96;
    this.lfo1 = { rate: 0.1, shape: 'sine', sync: false };
    this.lfo2 = { rate: 0.5, shape: 'triangle', sync: false };
    this.lfo3 = { rate: 2, shape: 'random', sync: false };
    this.seq = { steps: [1, 0.25, 1, 0.25, 1, 0.25, 1, 0.25], probability: 1 };
    this.envTriggerAt = null;   // transport position of latest envelope trigger
    this.routes = [];
    this.sources = {};
    this.position = 0;
    this._lastPosition = null;
  }

  get lfos() { return [this.lfo1, this.lfo2, this.lfo3]; }

  /** Apply a validated modulation config (schema.js sanitizeModulation). */
  configure(m) {
    if (!m) return;
    if (m.lfos) {
      this.lfos.forEach((lfo, i) => Object.assign(lfo, m.lfos[i]));
    }
    if (m.seq) {
      this.seq.steps = [...m.seq.steps];
      this.seq.probability = m.seq.probability;
    }
  }

  /** Trigger the envelope at a transport position (defaults to "now"). */
  trigger(atPosition = this.position) {
    // Keep only the newest trigger; envelopeLevel() is pure in it.
    if (this.envTriggerAt == null || atPosition >= this.envTriggerAt) {
      this.envTriggerAt = atPosition;
    }
  }

  /**
   * Compute all mod sources at a transport position and apply routes.
   * `external`: { audio, motion, midi, osc, caption, xy, emergencyLevel }.
   * Returns additive offsets per target.
   */
  tick(position, external) {
    const dt = this._lastPosition == null ? 0 : Math.max(0, position - this._lastPosition);
    this._lastPosition = position;
    this.position = position;

    const bps = this.bpm / 60;
    const beatFloat = position * bps;
    const barFloat = beatFloat / 4;
    const beatPhase = beatFloat % 1;
    const now = new Date();

    const s = this.sources;
    s['lfo1'] = lfoValue(this.lfo1, 0, position, this.bpm, this.seed);
    s['lfo2'] = lfoValue(this.lfo2, 1, position, this.bpm, this.seed);
    s['lfo3'] = lfoValue(this.lfo3, 2, position, this.bpm, this.seed);
    s['env'] = envelopeLevel(this.envTriggerAt, position);
    s['seq'] = seqValueAt(this.seq, Math.floor(barFloat * this.seq.steps.length), this.seed);
    s['beat'] = beatPhase;
    s['beat.pulse'] = Math.pow(1 - beatPhase, 4);
    s['bar'] = barFloat % 1;
    s['random'] = prand(this.seed, 200, Math.floor(position * 6)); // shared "alive" noise
    s['time.day'] = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
    s['time.sin'] = 0.5 + 0.5 * Math.sin(s['time.day'] * Math.PI * 2);

    s['audio.amp'] = external.audio.amp;
    s['audio.bass'] = external.audio.bass;
    s['audio.mid'] = external.audio.mid;
    s['audio.high'] = external.audio.high;

    s['motion.energy'] = external.motion.energy;
    s['motion.x'] = external.motion.x;
    s['motion.y'] = external.motion.y;
    s['motion.vx'] = external.motion.vx;
    s['motion.vy'] = external.motion.vy;
    s['motion.spread'] = external.motion.spread;
    s['motion.raised'] = external.motion.raised;
    s['motion.tempo'] = external.motion.tempo;

    s['midi.note'] = (external.midi.lastNote ?? external.midi.note ?? 0) / 127;
    s['midi.velocity'] = (external.midi.lastVelocity ?? external.midi.velocity ?? 0) / 127;
    s['midi.cc1'] = external.midi.cc?.[1] ?? 0;
    s['osc.1'] = external.osc[0] ?? 0;
    s['osc.2'] = external.osc[1] ?? 0;

    s['caption.len'] = external.caption.len;
    s['caption.pulse'] = external.caption.pulse;
    s['xy.x'] = external.xy.x;
    s['xy.y'] = external.xy.y;
    s['emergency'] = external.emergencyLevel;

    const offsets = {};
    for (const r of this.routes) {
      offsets[r.target] = (offsets[r.target] ?? 0) + r.tick(dt, s);
    }
    return offsets;
  }

  addRoute(source, target, amount) {
    const r = new ModRoute(source, target, amount);
    this.routes.push(r);
    return r;
  }

  removeRoute(route) {
    this.routes = this.routes.filter((r) => r !== route);
  }
}

export const MOD_SOURCES = [
  'lfo1', 'lfo2', 'lfo3', 'env', 'seq', 'beat.pulse', 'bar', 'random',
  'time.sin', 'audio.amp', 'audio.bass', 'audio.mid', 'audio.high',
  'motion.energy', 'motion.x', 'motion.y', 'motion.vx', 'motion.vy',
  'motion.spread', 'motion.raised', 'motion.tempo',
  'midi.note', 'midi.velocity', 'midi.cc1', 'osc.1', 'osc.2',
  'caption.len', 'caption.pulse', 'xy.x', 'xy.y', 'emergency',
];

export const MOD_TARGETS = [
  'A.p1', 'A.p2', 'A.p3', 'A.p4', 'A.intensity',
  'B.p1', 'B.p2', 'B.p3', 'B.p4', 'B.intensity',
  'mix.xfade', 'fx.trails', 'fx.pixelate01', 'fx.crt', 'fx.posterize01',
];
