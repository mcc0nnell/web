/**
 * GLADcast preset system.
 *
 * A preset is a full deck + overlay scene: generator, params, mode, fx,
 * broadcast graphics state, and optional modulation routes. The eight
 * channels (26.1–26.8) model a television multiplex — each is both a
 * program identity and a bank of playable presets.
 *
 * Presets serialize to plain JSON (portable; savable to localStorage or
 * shipped as files).
 */

const P = (gen, opts = {}) => ({
  gen,
  mode: 0,               // 0 broadcast, 1 demoscene
  intensity: 0.8,
  p1: null, p2: null, p3: null, p4: null,   // null → generator defaults
  fx: { trails: 0, pixelate: 0, posterize: 0, crt: 0, invert: 0 },
  overlay: {},           // partial BroadcastLayer state
  routes: [],            // [source, target, amount]
  caption: null,         // caption fired when the preset lands
  ...opts,
});

/** The eight-channel multiplex. Each channel: identity + playable presets. */
export const CHANNELS = [
  {
    id: '26.1', name: 'COMMUNITY',
    brief: 'People, events, interviews, local information, live programming.',
    presets: [
      { name: 'Community Bulletin', ...P('citygrid', { p2: 0.15, overlay: { clock: true, bugText: 'GLAD 26.1' }, caption: 'Welcome to *GLADcast* — community programming from Eagle Rock.' }) },
      { name: 'Deaf Los Angeles Online', ...P('vectorgrid', { p2: 0.2, p4: 0.15, overlay: { clock: true }, routes: [['audio.amp', 'A.intensity', 0.25]] }) },
      { name: 'Interview Bed', ...P('plasma', { p1: 0.2, p2: 0.1, intensity: 0.5 }) },
    ],
  },
  {
    id: '26.2', name: 'EMERGENCY',
    brief: 'Alerts, evacuation info, maps, shelters, resilience centers, public safety.',
    presets: [
      { name: 'Emergency Civic Grid', ...P('wireframe', { p2: 0.4, fx: { trails: 0, pixelate: 0, posterize: 0, crt: 0.15, invert: 0 }, overlay: { clock: true, alert: { level: 'warning', title: 'Test of the GLAD emergency layer', body: 'This is a test. No action is required.', shownAt: 0 } }, routes: [['emergency', 'A.intensity', 0.5]] }) },
      { name: 'GLAD Legal Alert', ...P('rasterbars', { p1: 0.2, p2: 0.1, overlay: { crawlText: 'GLAD LEGAL ALERT — Know your rights: effective communication is required at hospitals, courts, and by first responders under the ADA.' } }) },
      { name: 'Shelter Map', ...P('pointcloud', { p1: 0.15, p4: 0.7, overlay: { clock: true, lowerThird: { title: 'Resilience Center — Eagle Rock', subtitle: 'Open 24 hours · ASL staff on site', shownAt: 0 } } }) },
    ],
  },
  {
    id: '26.3', name: 'CULTURE',
    brief: 'Deaf arts, performance, cinema, theater, LA creative work.',
    presets: [
      { name: 'Public Access Midnight', ...P('tunnel', { mode: 1, p2: 0.5, fx: { trails: 0.55, pixelate: 0, posterize: 0, crt: 0.5, invert: 0 }, routes: [['audio.bass', 'A.p1', 0.4]] }) },
      { name: 'LA Noir Transmission', ...P('halftone', { mode: 1, p4: 0.1, fx: { trails: 0.2, pixelate: 0, posterize: 5, crt: 0.35, invert: 0 } }) },
      { name: 'Caption Particle Field', ...P('particles', { mode: 1, p1: 0.7, routes: [['caption.pulse', 'A.p2', 0.8], ['caption.len', 'A.p1', 0.5]], caption: 'Captions *drive* the picture on this channel.' }) },
    ],
  },
  {
    id: '26.4', name: 'RIGHTS',
    brief: 'Legal advocacy, civil rights, policy, public services, calls to action.',
    presets: [
      { name: 'This Is Infrastructure', ...P('pointcloud', { p3: 0.7, p4: 0.5, overlay: { lowerThird: { title: 'Access is infrastructure', subtitle: 'Title II · Title III · Section 504 · FCC TRS', shownAt: 0 } } }) },
      { name: 'Call To Action', ...P('rasterbars', { mode: 1, p1: 0.6, p2: 0.5, overlay: { crawlText: 'TAKE ACTION — Public comment is open. File with the FCC. Your access story is evidence.' }, routes: [['beat.pulse', 'A.intensity', 0.3]] }) },
      { name: 'Policy Desk', ...P('vectorgrid', { p2: 0.1, intensity: 0.6, overlay: { clock: true } }) },
    ],
  },
  {
    id: '26.5', name: 'HISTORY',
    brief: 'GLAD history, Deaf Los Angeles history, the Susan D. Rutherford collection.',
    presets: [
      { name: 'Rutherford Archive Engine', ...P('archive', { p1: 0.35, p2: 0.5, overlay: { bugText: 'RUTHERFORD COLLECTION' }, caption: 'From the *Susan D. Rutherford* collection.' }) },
      { name: 'Archive Resurrection', ...P('archive', { mode: 1, p1: 0.4, p4: 0.4, fx: { trails: 0.35, pixelate: 0, posterize: 0, crt: 0.4, invert: 0 } }) },
      { name: 'Halftone Memory', ...P('halftone', { p1: 0.55, p3: 0.6, routes: [['lfo1', 'A.p2', 0.2]] }) },
    ],
  },
  {
    id: '26.6', name: 'YOUTH',
    brief: 'Education, schools, families, young creators, future leadership.',
    presets: [
      { name: 'Pixel Classroom', ...P('ascii', { p1: 0.55, p4: 0.3, routes: [['lfo2', 'A.p2', 0.3]] }) },
      { name: 'Starfield Story Time', ...P('starfield', { p1: 0.25, p2: 0.6, caption: 'Every kid gets the *whole* sky.' }) },
      { name: 'Metaball Playground', ...P('metaballs', { mode: 1, p3: 0.5, routes: [['motion.energy', 'A.p2', 0.6], ['motion.x', 'B.p1', 0.4]] }) },
    ],
  },
  {
    id: '26.7', name: 'THE POSSIBLE',
    brief: 'Experimental graphics, civic futures, LA28, speculative programming.',
    presets: [
      { name: 'LA28 Future City', ...P('citygrid', { mode: 1, p3: 0.8, p4: 0.7, fx: { trails: 0.3, pixelate: 0, posterize: 0, crt: 0, invert: 0 }, routes: [['audio.mid', 'A.p4', 0.4]] }) },
      { name: 'ASL Oscilloscope', ...P('oscilloscope', { mode: 1, p1: 0.7, routes: [['motion.energy', 'A.p1', 0.7], ['motion.x', 'xy → pan', 0]] , caption: 'The trace you see is *your* signing.' }) },
      { name: 'Wireframe Community Center', ...P('wireframe', { mode: 1, p1: 0.7, p3: 0.7, routes: [['motion.spread', 'A.p1', 0.5]] }) },
    ],
  },
  {
    id: '26.8', name: 'UTILITY',
    brief: 'Station ID, weather, schedules, interstitials, diagnostics, system status.',
    presets: [
      { name: 'Legal ID', ...P('testpattern', { p1: 0.0, intensity: 0.6, overlay: { slate: 'legal' } }) },
      { name: 'Technical Difficulties', ...P('testpattern', { p1: 1.0, overlay: { slate: 'technical' } }) },
      { name: 'Signal From Eagle Rock', ...P('signalacq', { p1: 0.2, p3: 0.5, overlay: { slate: null, bugText: 'EAGLE ROCK CA' }, routes: [['lfo1', 'A.p1', 0.4]], caption: '[cue:acquire] Signal from *Eagle Rock* — GLADcast is on the air.' }) },
      { name: 'WeatherStar Eagle Rock', ...P('vectorgrid', { p3: 0.35, p4: 0.2, overlay: { clock: true, crawlText: 'EAGLE ROCK — CLEAR 74° · DOWNTOWN LA 78° · AIR QUALITY GOOD · NO ACTIVE ALERTS · GLADCAST WEATHER', bugText: 'WEATHERSTAR' } }) },
    ],
  },
];

/** Flat signature bank — the presets named in the GLADcast spec. */
export const SIGNATURE_PRESETS = [
  ...CHANNELS.flatMap((ch) => ch.presets.map((p) => ({ ...p, channel: ch.id }))),
  { name: 'Channel Surf', channel: '—', ...P('testpattern', { p1: 0.6, p2: 0.6, p3: 0.5, mode: 1, fx: { trails: 0.2, pixelate: 6, posterize: 0, crt: 0.6, invert: 0 }, routes: [['lfo3', 'A.p1', 0.9]] }) },
  { name: 'The Palace', channel: '—', ...P('tunnel', { mode: 1, p3: 0.8, p4: 0.9, fx: { trails: 0.5, pixelate: 0, posterize: 6, crt: 0.2, invert: 0 }, routes: [['audio.bass', 'A.p2', 0.6], ['beat.pulse', 'fx.crt', 0.3]] }) },
];

export function serializePreset(p) { return JSON.stringify(p); }
export function deserializePreset(json) { return JSON.parse(json); }

export function saveUserPresets(list) {
  try { localStorage.setItem('gladcast.presets', JSON.stringify(list)); } catch { /* private mode */ }
}
export function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem('gladcast.presets') || '[]'); } catch { return []; }
}
