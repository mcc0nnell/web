/**
 * Live control-signal bus.
 *
 * The console is the authority for live performance inputs (audio analysis,
 * ASL motion, MIDI, OSC, XY, emergency level). It publishes small,
 * change-only SET_CONTROL_SIGNALS payloads; receivers run one SignalBus
 * that smooths toward the latest targets and decays safely to neutral when
 * the operator disconnects or the data goes stale — a dead console must
 * never leave outputs pinned at the last screamed value.
 */

export const NEUTRAL_CONTROLS = Object.freeze({
  audio: { amp: 0, bass: 0, mid: 0, high: 0 },
  motion: { energy: 0, x: 0.5, y: 0.5, vx: 0.5, vy: 0.5, spread: 0, raised: 0, tempo: 0 },
  midi: { note: 0, velocity: 0, cc: {} },
  osc: [],
  xy: { x: 0.5, y: 0.5 },
  emergencyLevel: 0,
});

const SCALAR_PATHS = [
  ['audio', 'amp'], ['audio', 'bass'], ['audio', 'mid'], ['audio', 'high'],
  ['motion', 'energy'], ['motion', 'x'], ['motion', 'y'], ['motion', 'vx'], ['motion', 'vy'],
  ['motion', 'spread'], ['motion', 'raised'], ['motion', 'tempo'],
  ['xy', 'x'], ['xy', 'y'],
];

function deepCopyNeutral() {
  return JSON.parse(JSON.stringify(NEUTRAL_CONTROLS));
}

/** True when two control payloads differ enough to be worth publishing. */
export function materialChange(a, b, eps = 0.01) {
  if (!a || !b) return true;
  for (const [g, k] of SCALAR_PATHS) {
    if (Math.abs((a[g]?.[k] ?? 0) - (b[g]?.[k] ?? 0)) > eps) return true;
  }
  if ((a.emergencyLevel ?? 0) !== (b.emergencyLevel ?? 0)) return true;
  if ((a.midi?.note ?? 0) !== (b.midi?.note ?? 0)) return true;
  if (Math.abs((a.midi?.velocity ?? 0) - (b.midi?.velocity ?? 0)) > eps * 127) return true;
  const ccA = a.midi?.cc ?? {}, ccB = b.midi?.cc ?? {};
  for (const k of new Set([...Object.keys(ccA), ...Object.keys(ccB)])) {
    if (Math.abs((ccA[k] ?? 0) - (ccB[k] ?? 0)) > eps) return true;
  }
  const oa = a.osc ?? [], ob = b.osc ?? [];
  for (let i = 0; i < Math.max(oa.length, ob.length); i++) {
    if (Math.abs((oa[i] ?? 0) - (ob[i] ?? 0)) > eps) return true;
  }
  return false;
}

export class SignalBus {
  constructor({ smoothMs = 120, staleMs = 3000, decayMs = 1200 } = {}) {
    this.smoothMs = smoothMs;
    this.staleMs = staleMs;
    this.decayMs = decayMs;
    this.target = deepCopyNeutral();
    this.current = deepCopyNeutral();
    this.lastUpdateMs = -1; // -1 = never updated
    this.lastSequence = -1;
    this._lastSampleMs = 0;
  }

  /** Accept a validated control payload. Reordered/duplicate payloads are dropped. */
  push(controls, atMs) {
    if (!controls) return false;
    if (controls.sequence <= this.lastSequence) return false;
    this.lastSequence = controls.sequence;
    this.lastUpdateMs = atMs;
    this.target = controls;
    return true;
  }

  isStale(nowMs) {
    return this.lastUpdateMs < 0 || nowMs - this.lastUpdateMs > this.staleMs;
  }

  /**
   * Smoothed values at `nowMs`. While fresh, current eases toward target;
   * once stale, target eases toward neutral so signals land softly at rest.
   */
  sample(nowMs) {
    const dt = this._lastSampleMs ? Math.min(250, nowMs - this._lastSampleMs) : 16;
    this._lastSampleMs = nowMs;
    const stale = this.isStale(nowMs);
    const goal = stale ? NEUTRAL_CONTROLS : this.target;
    const tau = stale ? this.decayMs : this.smoothMs;
    const k = 1 - Math.exp(-dt / Math.max(1, tau));

    for (const [g, key] of SCALAR_PATHS) {
      const target = goal[g]?.[key] ?? NEUTRAL_CONTROLS[g][key];
      this.current[g][key] += (target - this.current[g][key]) * k;
    }
    this.current.emergencyLevel += ((stale ? 0 : this.target.emergencyLevel ?? 0) - this.current.emergencyLevel) * k;

    // Discrete values switch instantly while fresh, clear when stale.
    if (!stale) {
      this.current.midi.note = this.target.midi?.note ?? 0;
      this.current.midi.velocity = this.target.midi?.velocity ?? 0;
      this.current.midi.cc = { ...(this.target.midi?.cc ?? {}) };
      this.current.osc = [...(this.target.osc ?? [])];
    } else {
      this.current.midi.velocity *= 1 - k;
      this.current.osc = this.current.osc.map((v) => v * (1 - k));
    }
    this.current.stale = stale;
    return this.current;
  }
}
