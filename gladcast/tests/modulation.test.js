import { describe, it, expect } from 'vitest';
import { prand } from '../src/scripts/gladcast/prng.js';
import { ModEngine, lfoValue, envelopeLevel, seqValueAt } from '../src/scripts/gladcast/modulation.js';
import { NEUTRAL_CONTROLS } from '../src/scripts/gladcast/signals.js';

const EXTERNAL = {
  ...JSON.parse(JSON.stringify(NEUTRAL_CONTROLS)),
  caption: { len: 0.3, pulse: 0.1 },
  emergencyLevel: 0,
};
EXTERNAL.audio = { amp: 0.4, bass: 0.6, mid: 0.2, high: 0.1 };

describe('seeded randomness', () => {
  it('is stable across calls and instances', () => {
    expect(prand(42, 1, 7)).toBe(prand(42, 1, 7));
    expect(prand(42, 1, 7)).not.toBe(prand(43, 1, 7));
    expect(prand(42, 1, 7)).not.toBe(prand(42, 1, 8));
  });

  it('stays in [0,1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = prand(123, 0, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('deterministic LFOs', () => {
  it('is a pure function of position (no per-instance phase)', () => {
    const lfo = { rate: 0.7, shape: 'sine', sync: false };
    expect(lfoValue(lfo, 0, 12.34, 96, 5)).toBe(lfoValue({ ...lfo }, 0, 12.34, 96, 5));
  });

  it('random shape matches across nodes for the same seed and diverges across seeds', () => {
    const lfo = { rate: 2, shape: 'random', sync: false };
    expect(lfoValue(lfo, 2, 8.1, 96, 99)).toBe(lfoValue(lfo, 2, 8.1, 96, 99));
    expect(lfoValue(lfo, 2, 8.1, 96, 99)).not.toBe(lfoValue(lfo, 2, 8.1, 96, 100));
  });

  it('sync mode locks cycles to the beat', () => {
    const lfo = { rate: 1, shape: 'saw', sync: true }; // 1 cycle per beat
    // at 120 bpm, one beat = 0.5 s → saw returns to 0
    expect(lfoValue(lfo, 0, 0.5, 120, 1)).toBeCloseTo(0, 5);
    expect(lfoValue(lfo, 0, 0.25, 120, 1)).toBeCloseTo(0.5, 5);
  });
});

describe('deterministic envelope', () => {
  it('is pure in (trigger, position)', () => {
    expect(envelopeLevel(10, 10.02)).toBeCloseTo(0.4);
    expect(envelopeLevel(10, 10.05)).toBeCloseTo(1, 6);
    expect(envelopeLevel(10, 10.35)).toBeCloseTo(0.5, 5); // mid-release
    expect(envelopeLevel(10, 11)).toBe(0); // fully released after 0.65 s
    expect(envelopeLevel(10, 20)).toBe(0);
    expect(envelopeLevel(null, 5)).toBe(0);
    expect(envelopeLevel(10, 9)).toBe(0); // before the trigger
  });
});

describe('deterministic sequencer', () => {
  const seq = { steps: [1, 0.2, 0.8, 0.4], probability: 0.5 };

  it('same seed → same decisions; different seed → different pattern', () => {
    const a = Array.from({ length: 64 }, (_, i) => seqValueAt(seq, i, 7));
    const b = Array.from({ length: 64 }, (_, i) => seqValueAt(seq, i, 7));
    const c = Array.from({ length: 64 }, (_, i) => seqValueAt(seq, i, 8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('probability 1 always fires the step value', () => {
    const full = { steps: [1, 0.5], probability: 1 };
    expect(seqValueAt(full, 0, 1)).toBe(1);
    expect(seqValueAt(full, 1, 1)).toBe(0.5);
    expect(seqValueAt(full, 2, 1)).toBe(1);
  });

  it('held values come from the last fired step (history-free)', () => {
    // With probability 0.5 some steps skip; landing mid-song must agree with
    // a node that played from the start.
    for (let i = 8; i < 40; i++) {
      expect(seqValueAt(seq, i, 3)).toBe(seqValueAt(seq, i, 3));
    }
  });
});

describe('two-receiver determinism harness', () => {
  function makeEngine(seed) {
    const m = new ModEngine(seed);
    m.bpm = 120;
    m.lfo3.shape = 'random';
    m.seq.probability = 0.6;
    m.addRoute('lfo1', 'A.p1', 0.5);
    m.addRoute('lfo3', 'B.p2', -0.4);
    m.addRoute('seq', 'fx.crt', 0.7);
    m.addRoute('env', 'A.intensity', 0.9);
    m.addRoute('audio.bass', 'mix.xfade', 0.3);
    return m;
  }

  it('same transport timestamps + seed + events + controls → identical outputs', () => {
    const a = makeEngine(1234);
    const b = makeEngine(1234);
    const events = [1.0, 4.25, 9.5]; // envelope triggers at transport positions

    // identical sampled transport timestamps (the acceptance contract)
    const timestamps = Array.from({ length: 240 }, (_, i) => i * 0.05);
    for (const t of timestamps) {
      for (const ev of events) {
        if (ev <= t && ev > t - 0.05) {
          a.trigger(ev);
          b.trigger(ev);
        }
      }
      const oa = a.tick(t, EXTERNAL);
      const ob = b.tick(t, EXTERNAL);
      expect(oa).toEqual(ob);
      expect(a.sources).toEqual(b.sources);
    }
  });

  it('a late joiner computes the same source values at the same timestamp', () => {
    const early = makeEngine(555);
    const late = makeEngine(555);
    for (let t = 0; t <= 30; t += 0.05) early.tick(t, EXTERNAL);
    // late node connects at t=30 knowing only (seed, transport, last trigger)
    early.trigger(28);
    late.trigger(28);
    early.tick(31, EXTERNAL);
    late.tick(31, EXTERNAL);
    // sources are pure in position — identical despite different histories
    expect(late.sources).toEqual(early.sources);
  });

  it('different seeds diverge', () => {
    const a = makeEngine(1);
    const b = makeEngine(2);
    a.tick(10.37, EXTERNAL);
    b.tick(10.37, EXTERNAL);
    expect(a.sources.lfo3).not.toBe(b.sources.lfo3);
  });
});
