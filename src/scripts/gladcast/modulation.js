/**
 * GLADcast modulation system.
 *
 * Any deck parameter can be modulated by any source. Sources are computed
 * once per frame into a flat map; routes apply them with per-route amount,
 * smoothing and optional beat quantization. Base values stay untouched, so
 * releasing a modulation returns the parameter to its performed position.
 */

export const LFO_SHAPES = ['sine', 'triangle', 'saw', 'square', 'random'];

export class LFO {
  constructor(rate = 0.25, shape = 'sine') {
    this.rate = rate;       // Hz (or cycles-per-beat when synced)
    this.shape = shape;
    this.sync = false;      // lock to BPM
    this.phase = 0;
    this._rand = Math.random();
    this._lastCycle = 0;
  }
  tick(dt, beatPhase, bpm) {
    if (this.sync) {
      this.phase = (beatPhase * this.rate) % 1;
    } else {
      this.phase = (this.phase + dt * this.rate) % 1;
    }
    const cycle = Math.floor(this.phase * 4);
    if (this.shape === 'random' && cycle !== this._lastCycle) {
      this._rand = Math.random();
      this._lastCycle = cycle;
    }
    return this.value();
  }
  value() {
    const p = this.phase;
    switch (this.shape) {
      case 'sine': return 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
      case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2;
      case 'saw': return p;
      case 'square': return p < 0.5 ? 1 : 0;
      case 'random': return this._rand;
      default: return 0;
    }
  }
}

export class Envelope {
  constructor(attack = 0.05, release = 0.6) {
    this.attack = attack;
    this.release = release;
    this.level = 0;
    this._gate = false;
  }
  trigger() { this._gate = true; }
  release_() { this._gate = false; }
  tick(dt) {
    if (this._gate) {
      this.level = Math.min(1, this.level + dt / Math.max(0.005, this.attack));
      if (this.level >= 1) this._gate = false;
    } else {
      this.level = Math.max(0, this.level - dt / Math.max(0.01, this.release));
    }
    return this.level;
  }
}

export class StepSequencer {
  constructor(steps = 8) {
    this.steps = new Array(steps).fill(0).map((_, i) => (i % 2 === 0 ? 1 : 0.25));
    this.probability = 1;    // chance a step fires at all
    this.index = 0;
    this.value = 0;
    this._lastBeat = -1;
  }
  /** Advances one step per beat subdivision (16ths of a bar at 4/4). */
  tick(barPhase) {
    const step = Math.floor(barPhase * this.steps.length) % this.steps.length;
    if (step !== this._lastBeat) {
      this._lastBeat = step;
      this.index = step;
      if (Math.random() <= this.probability) this.value = this.steps[step];
    }
    return this.value;
  }
}

/** One modulation route: source key → target key, scaled, smoothed. */
export class ModRoute {
  constructor(source, target, amount = 0.5) {
    this.source = source;   // key into the per-frame source map
    this.target = target;   // e.g. 'A.p1', 'A.intensity', 'fx.trails', 'mix.xfade'
    this.amount = amount;   // -1..1
    this.smooth = 0.15;     // seconds to ~63% — 0 for instant
    this.quantize = 0;      // 0 off, else snap to N levels
    this._val = 0;
  }
  tick(dt, sources) {
    let v = (sources[this.source] ?? 0) * this.amount;
    if (this.quantize > 0) v = Math.round(v * this.quantize) / this.quantize;
    if (this.smooth > 0) {
      const k = 1 - Math.exp(-dt / this.smooth);
      this._val += (v - this._val) * k;
    } else {
      this._val = v;
    }
    return this._val;
  }
}

export class ModEngine {
  constructor() {
    this.bpm = 96;
    this.beatPhase = 0;     // 0..1 within one beat
    this.barPhase = 0;      // 0..1 within a 4-beat bar
    this.lfo1 = new LFO(0.1, 'sine');
    this.lfo2 = new LFO(0.5, 'triangle');
    this.lfo3 = new LFO(2, 'random');
    this.env = new Envelope();
    this.seq = new StepSequencer(8);
    this.routes = [];
    this.sources = {};
  }

  addRoute(source, target, amount) {
    const r = new ModRoute(source, target, amount);
    this.routes.push(r);
    return r;
  }

  removeRoute(route) {
    this.routes = this.routes.filter((r) => r !== route);
  }

  /**
   * Compute all source values for this frame.
   * external: { audio, motion, midi, osc, caption, xy, weather, emergencyLevel }
   */
  tick(dt, external) {
    const beatLen = 60 / this.bpm;
    this.beatPhase = (this.beatPhase + dt / beatLen) % 1;
    this.barPhase = (this.barPhase + dt / (beatLen * 4)) % 1;

    const now = new Date();
    const s = this.sources;
    s['lfo1'] = this.lfo1.tick(dt, this.beatPhase, this.bpm);
    s['lfo2'] = this.lfo2.tick(dt, this.beatPhase, this.bpm);
    s['lfo3'] = this.lfo3.tick(dt, this.beatPhase, this.bpm);
    s['env'] = this.env.tick(dt);
    s['seq'] = this.seq.tick(this.barPhase);
    s['beat'] = this.beatPhase;
    s['beat.pulse'] = Math.pow(1 - this.beatPhase, 4);
    s['bar'] = this.barPhase;
    s['random'] = Math.random();
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

    s['midi.note'] = external.midi.lastNote / 127;
    s['midi.velocity'] = external.midi.lastVelocity / 127;
    s['midi.cc1'] = external.midi.cc[1] ?? 0;
    s['osc.1'] = external.osc[0] ?? 0;
    s['osc.2'] = external.osc[1] ?? 0;

    s['caption.len'] = external.caption.len;
    s['caption.pulse'] = external.caption.pulse;
    s['xy.x'] = external.xy.x;
    s['xy.y'] = external.xy.y;
    s['emergency'] = external.emergencyLevel;

    // Apply routes → additive offsets per target.
    const offsets = {};
    for (const r of this.routes) {
      offsets[r.target] = (offsets[r.target] ?? 0) + r.tick(dt, s);
    }
    return offsets;
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
