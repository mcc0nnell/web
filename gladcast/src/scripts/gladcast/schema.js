/**
 * GLADcast visual-state schema — version 2.
 *
 * Everything a receiver applies from the network passes through here first.
 * Validation clamps rather than rejects wherever a safe value exists, so a
 * partially bad payload degrades to a renderable frame instead of a crash.
 * Unknown generator IDs, out-of-range params, unsupported blend modes,
 * malformed media descriptors, and oversized payloads are all normalized.
 *
 * v2 shape (synced via SET_VISUAL / TAKE_VISUAL):
 * {
 *   version: 2,
 *   decks: { A: {gen, params}, B: {gen, params} },
 *   mix: { xfade, blend },
 *   effects: { trails, pixelate, posterize, crt, invert, freeze },
 *   xy: { x, y },
 *   modulation: { lfos: [{rate, shape, sync}×3], seq: {steps, probability} },
 *   routes: [[source, target, amount]…],
 *   overlays: { clock, bug, bugText, channelId, channelName, showChannelId,
 *               lowerThird, crawlText, alert, slate },
 *   captions: { raw, seq, safe, mode },
 *   revision
 * }
 *
 * v1 payloads (the original flat prototype shape) migrate transparently.
 */

import { GENERATOR_MAP } from './generators.js';
import { LFO_SHAPES, MOD_SOURCES, MOD_TARGETS } from './modulation.js';

export const VISUAL_VERSION = 2;
export const MAX_ROUTES = 24;
export const MAX_SEQ_STEPS = 16;

const BLEND_MODES = [0, 1, 2, 3];
const ALERT_LEVELS = ['advisory', 'warning', 'emergency'];
const SLATES = [null, 'legal', 'technical', 'standby'];
const CAPTION_MODES = ['broadcast', 'expressive'];
const MEDIA_TYPES = ['image', 'video', 'camera', 'none'];
const MEDIA_FITS = ['cover', 'contain'];

/** Origins a receiver will load remote media from, beyond same-origin. */
export const ALLOWED_MEDIA_ORIGINS = [
  'https://videodelivery.net',
  'https://customer-fvi4fzmd2w084z8d.cloudflarestream.com',
];

export const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

const clampRange = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

const str = (v, max = 512) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitizeDeck(d, fallbackGen) {
  const genId = d && GENERATOR_MAP[d.gen] ? d.gen : fallbackGen;
  const p = d?.params ?? {};
  return {
    gen: genId,
    params: {
      mode: p.mode ? 1 : 0,
      intensity: clamp01(p.intensity ?? 0.8),
      p1: clamp01(p.p1 ?? GENERATOR_MAP[genId].defaults.p1),
      p2: clamp01(p.p2 ?? GENERATOR_MAP[genId].defaults.p2),
      p3: clamp01(p.p3 ?? GENERATOR_MAP[genId].defaults.p3),
      p4: clamp01(p.p4 ?? GENERATOR_MAP[genId].defaults.p4),
    },
  };
}

function sanitizeRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  const out = [];
  for (const r of routes.slice(0, MAX_ROUTES)) {
    if (!Array.isArray(r) || r.length < 3) continue;
    const [source, target, amount] = r;
    if (!MOD_SOURCES.includes(source) || !MOD_TARGETS.includes(target)) continue;
    out.push([source, target, clampRange(amount, -1, 1, 0)]);
  }
  return out;
}

function sanitizeOverlays(o = {}) {
  const lt = o.lowerThird;
  const alert = o.alert;
  return {
    clock: !!o.clock,
    bug: !!o.bug,
    bugText: str(o.bugText, 40) || 'GLAD 26',
    channelId: str(o.channelId, 8) || '26.1',
    channelName: str(o.channelName, 24) || 'COMMUNITY',
    showChannelId: !!o.showChannelId,
    lowerThird: lt && typeof lt === 'object' && str(lt.title, 120)
      ? { title: str(lt.title, 120), subtitle: str(lt.subtitle, 160) }
      : null,
    crawlText: str(o.crawlText, 600),
    alert: alert && typeof alert === 'object' && str(alert.title, 160)
      ? {
          level: ALERT_LEVELS.includes(alert.level) ? alert.level : 'advisory',
          title: str(alert.title, 160),
          body: str(alert.body, 240),
        }
      : null,
    slate: SLATES.includes(o.slate) ? o.slate : null,
  };
}

function sanitizeModulation(m = {}) {
  const lfos = [];
  for (let i = 0; i < 3; i++) {
    const l = Array.isArray(m.lfos) ? m.lfos[i] : null;
    lfos.push({
      rate: clampRange(l?.rate, 0, 8, [0.1, 0.5, 2][i]),
      shape: LFO_SHAPES.includes(l?.shape) ? l.shape : ['sine', 'triangle', 'random'][i],
      sync: !!l?.sync,
    });
  }
  const rawSteps = Array.isArray(m.seq?.steps) ? m.seq.steps.slice(0, MAX_SEQ_STEPS) : null;
  return {
    lfos,
    seq: {
      steps: rawSteps && rawSteps.length >= 2 ? rawSteps.map((s) => clamp01(s)) : [1, 0.25, 1, 0.25, 1, 0.25, 1, 0.25],
      probability: clamp01(m.seq?.probability ?? 1),
    },
  };
}

/** Migrate the original flat prototype payload into v2. */
export function migrateV1(v1) {
  return {
    version: VISUAL_VERSION,
    decks: {
      A: { gen: v1.A?.gen, params: v1.A?.params },
      B: { gen: v1.B?.gen, params: v1.B?.params },
    },
    mix: v1.mix,
    effects: v1.fx,
    xy: v1.xy,
    modulation: { lfos: null, seq: null },
    routes: v1.routes,
    overlays: v1.overlay,
    captions: v1.caption
      ? { raw: v1.caption.raw, seq: v1.caption.seq ?? 1, safe: v1.captionSafe !== false, mode: v1.captionMode }
      : { raw: '', seq: 0, safe: v1.captionSafe !== false, mode: v1.captionMode },
    revision: 0,
  };
}

/**
 * Validate + normalize a visual payload of any supported version.
 * Always returns a fully-populated, safe v2 object (never throws).
 */
export function validateVisual(input) {
  let v = input && typeof input === 'object' ? input : {};
  if (v.v === 1 || (!v.version && (v.A || v.B))) v = migrateV1(v);
  const captions = v.captions ?? {};
  return {
    version: VISUAL_VERSION,
    decks: {
      A: sanitizeDeck(v.decks?.A, 'signalacq'),
      B: sanitizeDeck(v.decks?.B, 'plasma'),
    },
    mix: {
      xfade: clamp01(v.mix?.xfade),
      blend: BLEND_MODES.includes(Number(v.mix?.blend)) ? Number(v.mix.blend) : 0,
    },
    effects: {
      trails: clampRange(v.effects?.trails, 0, 0.97, 0),
      pixelate: clampRange(v.effects?.pixelate, 0, 128, 0),
      posterize: clampRange(v.effects?.posterize, 0, 16, 0),
      crt: clamp01(v.effects?.crt),
      invert: v.effects?.invert ? 1 : 0,
      freeze: v.effects?.freeze ? 1 : 0,
    },
    xy: { x: clamp01(v.xy?.x ?? 0.5), y: clamp01(v.xy?.y ?? 0.5) },
    modulation: sanitizeModulation(v.modulation),
    routes: sanitizeRoutes(v.routes),
    overlays: sanitizeOverlays(v.overlays),
    captions: {
      raw: str(captions.raw, 400),
      seq: Math.max(0, Math.floor(Number(captions.seq) || 0)),
      safe: captions.safe !== false,
      mode: CAPTION_MODES.includes(captions.mode) ? captions.mode : 'broadcast',
    },
    revision: Math.max(0, Math.floor(Number(v.revision) || 0)),
  };
}

// ----------------------------------------------------------- media ----

/** True when a receiver may load this URL: same-origin or allowlisted https. */
export function isAllowedMediaUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true; // same-origin
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_MEDIA_ORIGINS.includes(u.origin);
  } catch {
    return false;
  }
}

/**
 * Validate a media descriptor. Returns a sanitized descriptor, a
 * {type:'none'} clear marker, or null when the payload is unusable.
 */
export function validateMedia(desc) {
  if (desc == null) return { type: 'none', id: 'none', revision: 0 };
  if (typeof desc !== 'object') return null;
  if (desc.type === 'none') return { type: 'none', id: 'none', revision: Math.floor(Number(desc.revision) || 0) };
  if (!MEDIA_TYPES.includes(desc.type)) return null;
  if (desc.type === 'camera') {
    // Console-local camera. Not distributable without a real ingest —
    // receivers render their procedural fallback, never a fake stream.
    return { type: 'camera', id: str(desc.id, 64) || 'camera', revision: Math.floor(Number(desc.revision) || 0) };
  }
  if (!isAllowedMediaUrl(desc.url)) return null;
  return {
    id: str(desc.id, 64) || 'media',
    type: desc.type,
    url: str(desc.url, 1024),
    mimeType: str(desc.mimeType, 80),
    checksum: str(desc.checksum, 80),
    loop: desc.loop !== false,
    muted: desc.muted !== false,
    fit: MEDIA_FITS.includes(desc.fit) ? desc.fit : 'cover',
    startedAt: clampRange(desc.startedAt, 0, 1e9, 0), // transport position (s)
    duration: clampRange(desc.duration, 0, 1e6, 0),   // 0 = unknown
    archive: !!desc.archive, // documentary material: receivers keep it recognizable
    revision: Math.max(0, Math.floor(Number(desc.revision) || 0)),
  };
}

// ---------------------------------------------------- output format ----

export const ASPECT_PRESETS = {
  '16:9': { width: 1280, height: 720 },
  '16:9 HD': { width: 1920, height: 1080 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 },
  'ultrawide': { width: 2560, height: 720 },
};

export function validateOutputFormat(f) {
  const preset = f && ASPECT_PRESETS[f.aspect] ? ASPECT_PRESETS[f.aspect] : null;
  const width = Math.round(clampRange(f?.width, 16, 4096, preset?.width ?? 1280));
  const height = Math.round(clampRange(f?.height, 16, 4096, preset?.height ?? 720));
  return {
    aspect: preset ? f.aspect : 'custom',
    width: preset ? preset.width : width,
    height: preset ? preset.height : height,
    fps: Math.round(clampRange(f?.fps, 24, 120, 60)),
  };
}

// ------------------------------------------------- control signals ----

export function validateControls(c) {
  if (!c || typeof c !== 'object') return null;
  const cc = {};
  if (c.midi?.cc && typeof c.midi.cc === 'object') {
    for (const k of Object.keys(c.midi.cc).slice(0, 16)) cc[k] = clamp01(c.midi.cc[k]);
  }
  return {
    audio: {
      amp: clamp01(c.audio?.amp),
      bass: clamp01(c.audio?.bass),
      mid: clamp01(c.audio?.mid),
      high: clamp01(c.audio?.high),
    },
    motion: {
      energy: clamp01(c.motion?.energy),
      x: clamp01(c.motion?.x ?? 0.5),
      y: clamp01(c.motion?.y ?? 0.5),
      vx: clamp01(c.motion?.vx ?? 0.5),
      vy: clamp01(c.motion?.vy ?? 0.5),
      spread: clamp01(c.motion?.spread),
      raised: clamp01(c.motion?.raised),
      tempo: clamp01(c.motion?.tempo),
    },
    midi: {
      note: clampRange(c.midi?.note, 0, 127, 0),
      velocity: clampRange(c.midi?.velocity, 0, 127, 0),
      cc,
    },
    osc: Array.isArray(c.osc) ? c.osc.slice(0, 8).map((v) => clamp01(v)) : [],
    xy: { x: clamp01(c.xy?.x ?? 0.5), y: clamp01(c.xy?.y ?? 0.5) },
    emergencyLevel: clamp01(c.emergencyLevel),
    timestamp: Number(c.timestamp) || 0,
    sequence: Math.max(0, Math.floor(Number(c.sequence) || 0)),
  };
}

// ---------------------------------------------------- emergency ----

export function validateEmergency(e) {
  if (!e || typeof e !== 'object') return null;
  if (!e.active) return { active: false, seq: Math.floor(Number(e.seq) || 0) };
  return {
    active: true,
    level: ALERT_LEVELS.includes(e.level) ? e.level : 'emergency',
    title: str(e.title, 160) || 'Emergency information follows',
    body: str(e.body, 240),
    seq: Math.max(0, Math.floor(Number(e.seq) || 0)),
  };
}
