import { describe, it, expect } from 'vitest';
import { SignalBus, NEUTRAL_CONTROLS, materialChange } from '../src/scripts/gladcast/signals.js';
import { validateControls } from '../src/scripts/gladcast/schema.js';

function payload(overrides = {}, sequence = 1) {
  return validateControls({
    audio: { amp: 0.8, bass: 0.9, mid: 0.5, high: 0.2 },
    motion: { energy: 0.7, x: 0.3, y: 0.6 },
    xy: { x: 0.9, y: 0.1 },
    sequence,
    ...overrides,
  });
}

describe('materialChange', () => {
  it('ignores sub-epsilon jitter and catches real movement', () => {
    const a = payload();
    const b = payload({ audio: { amp: 0.805, bass: 0.9, mid: 0.5, high: 0.2 } }, 2);
    expect(materialChange(a, b)).toBe(false);
    const c = payload({ audio: { amp: 0.9, bass: 0.9, mid: 0.5, high: 0.2 } }, 3);
    expect(materialChange(a, c)).toBe(true);
    expect(materialChange(null, a)).toBe(true);
  });
});

describe('SignalBus interpolation and decay', () => {
  it('rejects reordered and duplicate sequences', () => {
    const bus = new SignalBus();
    expect(bus.push(payload({}, 5), 0)).toBe(true);
    expect(bus.push(payload({}, 4), 10)).toBe(false);
    expect(bus.push(payload({}, 5), 20)).toBe(false);
    expect(bus.push(payload({}, 6), 30)).toBe(true);
  });

  it('smooths toward fresh targets', () => {
    const bus = new SignalBus({ smoothMs: 100, staleMs: 5000 });
    bus.push(payload(), 0);
    bus.sample(0);
    const mid = bus.sample(80);
    expect(mid.audio.amp).toBeGreaterThan(0.2);
    expect(mid.audio.amp).toBeLessThan(0.8);
    const settled = bus.sample(1000);
    expect(settled.audio.amp).toBeCloseTo(0.8, 1);
    expect(settled.stale).toBe(false);
  });

  it('detects stale data and decays safely to neutral', () => {
    const bus = new SignalBus({ smoothMs: 50, staleMs: 1000, decayMs: 300 });
    bus.push(payload(), 0);
    bus.sample(0);
    bus.sample(500); // settled near target, still fresh
    expect(bus.isStale(500)).toBe(false);
    expect(bus.isStale(2000)).toBe(true);
    // sample repeatedly during the stale window → decay toward neutral
    let out;
    for (let t = 2000; t < 5000; t += 50) out = bus.sample(t);
    expect(out.stale).toBe(true);
    expect(out.audio.amp).toBeLessThan(0.05);
    expect(out.motion.x).toBeCloseTo(NEUTRAL_CONTROLS.motion.x, 1);
    expect(out.xy.x).toBeCloseTo(0.5, 1);
  });

  it('never emits values a disconnected console could leave pinned', () => {
    const bus = new SignalBus({ staleMs: 100, decayMs: 100 });
    bus.push(payload({ emergencyLevel: 1 }, 1), 0);
    bus.sample(0);
    let out;
    for (let t = 200; t < 2000; t += 30) out = bus.sample(t);
    expect(out.emergencyLevel).toBeLessThan(0.05);
  });
});
