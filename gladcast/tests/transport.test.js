import { describe, it, expect } from 'vitest';
import {
  createTransport,
  transportPosition,
  transportPhases,
  retimeTransport,
  validateTransport,
  ServerClock,
} from '../src/scripts/gladcast/transport.js';

describe('transport time derivation', () => {
  it('derives position from the epoch, not local clocks', () => {
    const t = createTransport({ bpm: 120, seed: 7, nowMs: 1_000_000 });
    expect(transportPosition(t, 1_000_000)).toBe(0);
    expect(transportPosition(t, 1_010_000)).toBeCloseTo(10);
    // two "machines" reading the same server time agree exactly
    expect(transportPosition(t, 1_004_321)).toBe(transportPosition({ ...t }, 1_004_321));
  });

  it('holds position while stopped', () => {
    const t = { ...createTransport({ nowMs: 0 }), running: false, positionAtEpoch: 12 };
    expect(transportPosition(t, 99_999)).toBe(12);
  });

  it('never returns negative positions', () => {
    const t = createTransport({ nowMs: 5000 });
    expect(transportPosition(t, 0)).toBe(0);
  });

  it('derives identical musical phases from a position', () => {
    const t = createTransport({ bpm: 120, nowMs: 0 });
    const p = transportPosition(t, 2_000); // 2 s @ 120bpm = 4 beats = 1 bar
    const ph = transportPhases(t, p);
    expect(ph.beat).toBe(4);
    expect(ph.bar).toBe(1);
    expect(ph.beatPhase).toBeCloseTo(0);
  });

  it('retime preserves position and bumps sequence (drift-free BPM change)', () => {
    const t = createTransport({ bpm: 96, nowMs: 0 });
    const later = 30_000;
    const before = transportPosition(t, later);
    const t2 = retimeTransport(t, { bpm: 140 }, later);
    expect(transportPosition(t2, later)).toBeCloseTo(before);
    expect(t2.bpm).toBe(140);
    expect(t2.sequence).toBe(t.sequence + 1);
  });

  it('validates and clamps wire transports, rejecting garbage', () => {
    expect(validateTransport(null)).toBeNull();
    expect(validateTransport({ epochMs: 'nope' })).toBeNull();
    const ok = validateTransport({ epochMs: 5, positionAtEpoch: -3, bpm: 9999, seed: 42.9, sequence: 2.7 });
    expect(ok.positionAtEpoch).toBe(0);
    expect(ok.bpm).toBe(300);
    expect(ok.sequence).toBe(2);
  });
});

describe('drift correction (ServerClock)', () => {
  it('estimates server offset from event stamps and smooths jitter', () => {
    const c = new ServerClock();
    c.observe(new Date(10_000).toISOString(), 9_000); // server 1s ahead
    expect(c.offsetMs).toBe(1000);
    // small jitter moves the estimate slightly, not violently
    c.observe(new Date(10_500).toISOString(), 9_450);
    expect(c.offsetMs).toBeGreaterThan(1000);
    expect(c.offsetMs).toBeLessThan(1100);
  });

  it('snaps on large clock jumps', () => {
    const c = new ServerClock();
    c.observe(new Date(10_000).toISOString(), 10_000);
    c.observe(new Date(60_000).toISOString(), 10_000); // 50s jump
    expect(c.offsetMs).toBe(50_000);
  });

  it('reload/reconnect lands on the same position', () => {
    const t = createTransport({ bpm: 100, nowMs: 1_000_000 });
    const a = new ServerClock();
    const b = new ServerClock(); // a fresh page after reload
    a.observe(new Date(1_030_000).toISOString(), 500);
    b.observe(new Date(1_030_000).toISOString(), 999_999); // wildly different local clock
    expect(transportPosition(t, a.now(500))).toBeCloseTo(transportPosition(t, b.now(999_999)), 5);
  });
});
