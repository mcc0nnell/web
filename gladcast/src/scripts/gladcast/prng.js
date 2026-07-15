/**
 * Deterministic pseudo-random generation for distributed modulation.
 *
 * Every "random" visual decision (random LFO cycles, sequencer probability,
 * the `random` mod source) is derived from (seed, stream, index) — never from
 * Math.random() — so every output node computes the identical sequence while
 * the picture still feels alive.
 */

/** fnv-1a style mix of integer inputs into a 32-bit hash. */
export function hash32(...ns) {
  let h = 0x811c9dc5 >>> 0;
  for (const n of ns) {
    // mix both halves so large/fractional inputs still disperse
    const x = Math.floor(n) >>> 0;
    h ^= x & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= x >>> 16;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One mulberry32 step — high-quality 32-bit scrambling of a state word. */
function mulberry(a) {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Stateless deterministic random in [0,1).
 * Same (seed, stream, index) → same value on every machine.
 */
export function prand(seed, stream = 0, index = 0) {
  return mulberry(hash32(seed, stream, index));
}

/** Draw a stable seed for a new session (console-side only). */
export function drawSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}
