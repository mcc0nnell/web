/**
 * GLADcast shared transport clock.
 *
 * The transport is the single time authority for every synchronized visual:
 * generators, LFOs, sequencers, envelopes, transitions, and time-based
 * overlays all derive from transport *position* (seconds since transport
 * zero), never from each browser's own performance.now() origin.
 *
 * The transport itself is tiny, serializable state:
 *   { running, epochMs, positionAtEpoch, bpm, seed, sequence }
 *
 * position(now) = positionAtEpoch + (now - epochMs) / 1000   while running
 *
 * `epochMs` is expressed in *server* wall-clock milliseconds (the RoomDO's
 * clock). Every client estimates its own offset to the server from the
 * `sentAt` stamps on WebSocket events, so a machine with a skewed clock
 * still derives the same position. Between state updates rendering is
 * purely local — nothing is streamed frame-by-frame.
 *
 * `sequence` increases on every transport change (BPM change, seek,
 * start/stop) so receivers can reject stale or reordered transport state
 * and re-derive deterministically after reload or reconnect.
 */

const BPM_MIN = 20;
const BPM_MAX = 300;

export function createTransport({ bpm = 96, seed = 1, nowMs = Date.now(), position = 0, running = true } = {}) {
  return {
    running,
    epochMs: nowMs,
    positionAtEpoch: position,
    bpm,
    seed: seed >>> 0,
    sequence: 1,
  };
}

/** Seconds of transport time at server-time `nowMs`. Never negative. */
export function transportPosition(t, nowMs) {
  if (!t) return 0;
  if (!t.running) return Math.max(0, t.positionAtEpoch);
  return Math.max(0, t.positionAtEpoch + (nowMs - t.epochMs) / 1000);
}

/**
 * Musical phases derived from a position. Everything here is a pure
 * function of (transport, position), so any two nodes at the same
 * position agree on beat, bar, and pulse.
 */
export function transportPhases(t, position) {
  const bps = (t?.bpm ?? 96) / 60;
  const beatFloat = position * bps;
  const barFloat = beatFloat / 4;
  const beatPhase = beatFloat % 1;
  return {
    beat: Math.floor(beatFloat),
    beatPhase,
    bar: Math.floor(barFloat),
    barPhase: barFloat % 1,
    beatPulse: Math.pow(1 - beatPhase, 4),
  };
}

/**
 * Produce a successor transport with changes applied, preserving the
 * current position so visuals never jump on a BPM change. `nowMs` is
 * server time.
 */
export function retimeTransport(t, changes, nowMs) {
  const position = changes.position ?? transportPosition(t, nowMs);
  return {
    running: changes.running ?? t.running,
    epochMs: nowMs,
    positionAtEpoch: position,
    bpm: clampBpm(changes.bpm ?? t.bpm),
    seed: (changes.seed ?? t.seed) >>> 0,
    sequence: (t.sequence ?? 0) + 1,
  };
}

export function clampBpm(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n)) return 96;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)));
}

/** Sanitize a transport received over the wire. Returns null if unusable. */
export function validateTransport(x) {
  if (!x || typeof x !== 'object') return null;
  const epochMs = Number(x.epochMs);
  const positionAtEpoch = Number(x.positionAtEpoch);
  const sequence = Number(x.sequence);
  if (!Number.isFinite(epochMs) || !Number.isFinite(positionAtEpoch) || !Number.isFinite(sequence)) return null;
  return {
    running: x.running !== false,
    epochMs,
    positionAtEpoch: Math.max(0, positionAtEpoch),
    bpm: clampBpm(x.bpm),
    seed: (Number(x.seed) || 1) >>> 0,
    sequence: Math.max(0, Math.floor(sequence)),
  };
}

/**
 * Server-clock offset estimator. Feed it the `sentAt` stamp of every
 * received WebSocket event; read `offsetMs` to convert local Date.now()
 * into server time. Exponentially smoothed so one delayed frame doesn't
 * yank the clock; large jumps (>2 s) snap immediately.
 */
export class ServerClock {
  constructor() {
    this.offsetMs = 0;
    this._primed = false;
  }
  observe(sentAtIso, localNowMs = Date.now()) {
    const serverMs = Date.parse(sentAtIso);
    if (!Number.isFinite(serverMs)) return;
    const sample = serverMs - localNowMs;
    if (!this._primed || Math.abs(sample - this.offsetMs) > 2000) {
      this.offsetMs = sample;
      this._primed = true;
    } else {
      this.offsetMs += (sample - this.offsetMs) * 0.1;
    }
  }
  now(localNowMs = Date.now()) {
    return localNowMs + this.offsetMs;
  }
}
