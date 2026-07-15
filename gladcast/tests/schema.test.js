import { describe, it, expect } from 'vitest';
import {
  validateVisual,
  migrateV1,
  validateMedia,
  validateOutputFormat,
  validateControls,
  validateEmergency,
  isAllowedMediaUrl,
  ASPECT_PRESETS,
} from '../src/scripts/gladcast/schema.js';

describe('visual schema v2 validation', () => {
  it('normalizes a good payload and preserves values', () => {
    const v = validateVisual({
      version: 2,
      decks: { A: { gen: 'tunnel', params: { mode: 1, intensity: 0.7, p1: 0.1, p2: 0.2, p3: 0.3, p4: 0.4 } }, B: { gen: 'plasma', params: {} } },
      mix: { xfade: 0.25, blend: 3 },
      effects: { trails: 0.5, crt: 0.2 },
      routes: [['lfo1', 'A.p1', 0.5]],
      captions: { raw: 'hi', seq: 3, safe: true, mode: 'broadcast' },
      revision: 9,
    });
    expect(v.decks.A.gen).toBe('tunnel');
    expect(v.decks.A.params.p2).toBe(0.2);
    expect(v.mix.blend).toBe(3);
    expect(v.routes).toEqual([['lfo1', 'A.p1', 0.5]]);
    expect(v.revision).toBe(9);
  });

  it('replaces unknown generator IDs with safe defaults', () => {
    const v = validateVisual({ version: 2, decks: { A: { gen: 'evil-shader' }, B: { gen: 'metaballs' } } });
    expect(v.decks.A.gen).toBe('signalacq');
    expect(v.decks.B.gen).toBe('metaballs');
  });

  it('clamps out-of-range values and rejects bad blend modes/routes', () => {
    const v = validateVisual({
      version: 2,
      decks: { A: { gen: 'plasma', params: { p1: 99, intensity: -5 } } },
      mix: { xfade: 7, blend: 42 },
      effects: { trails: 3, pixelate: 9999, posterize: -2 },
      routes: [['nope', 'A.p1', 1], ['lfo1', 'nowhere', 1], ['lfo2', 'B.p3', 5], 'garbage'],
    });
    expect(v.decks.A.params.p1).toBe(1);
    expect(v.decks.A.params.intensity).toBe(0);
    expect(v.mix.xfade).toBe(1);
    expect(v.mix.blend).toBe(0);
    expect(v.effects.trails).toBe(0.97);
    expect(v.effects.pixelate).toBe(128);
    expect(v.routes).toEqual([['lfo2', 'B.p3', 1]]);
  });

  it('survives complete garbage without throwing', () => {
    for (const junk of [null, 0, 'x', [], { decks: 'no' }, { version: 99 }]) {
      expect(() => validateVisual(junk)).not.toThrow();
      expect(validateVisual(junk).decks.A.gen).toBeTruthy();
    }
  });

  it('migrates version-1 payloads', () => {
    const v1 = {
      v: 1,
      A: { gen: 'tunnel', params: { mode: 1, intensity: 0.6, p1: 0.9, p2: 0.2, p3: 0.3, p4: 0.4 } },
      B: { gen: 'ascii', params: { mode: 0, intensity: 0.5, p1: 0.1, p2: 0.2, p3: 0.3, p4: 0.4 } },
      mix: { xfade: 0.5, blend: 1 },
      fx: { trails: 0.3, pixelate: 0, posterize: 0, crt: 0.1, invert: 0, freeze: 0 },
      xy: { x: 0.2, y: 0.8 },
      routes: [['audio.amp', 'A.intensity', 0.25]],
      overlay: { bugText: 'GLAD 26', crawlText: 'hello' },
      caption: { raw: 'legacy *caption*', seq: 2 },
      captionSafe: true,
      captionMode: 'broadcast',
    };
    const v2 = validateVisual(v1);
    expect(v2.version).toBe(2);
    expect(v2.decks.A.gen).toBe('tunnel');
    expect(v2.decks.A.params.p1).toBe(0.9);
    expect(v2.mix.blend).toBe(1);
    expect(v2.effects.crt).toBe(0.1);
    expect(v2.routes).toEqual([['audio.amp', 'A.intensity', 0.25]]);
    expect(v2.overlays.crawlText).toBe('hello');
    expect(v2.captions.raw).toBe('legacy *caption*');
    // migrateV1 is also directly exercised
    expect(migrateV1(v1).version).toBe(2);
  });

  it('caption safety survives malformed caption state', () => {
    const v = validateVisual({ version: 2, captions: { raw: 42, seq: 'x', safe: 'yes', mode: 'weird' } });
    expect(v.captions.raw).toBe('');
    expect(v.captions.safe).toBe(true); // safe unless explicitly false
    expect(v.captions.mode).toBe('broadcast');
  });
});

describe('media descriptor validation', () => {
  it('accepts same-origin and allowlisted https URLs only', () => {
    expect(isAllowedMediaUrl('/media/abc/clip.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://videodelivery.net/x.m3u8')).toBe(true);
    expect(isAllowedMediaUrl('https://evil.example.com/x.mp4')).toBe(false);
    expect(isAllowedMediaUrl('http://videodelivery.net/x.mp4')).toBe(false);
    expect(isAllowedMediaUrl('blob:https://x/abc')).toBe(false);
    expect(isAllowedMediaUrl('//evil.example.com/x')).toBe(false);
    expect(isAllowedMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('sanitizes descriptors and rejects unusable ones', () => {
    expect(validateMedia(null)).toEqual({ type: 'none', id: 'none', revision: 0 });
    expect(validateMedia({ type: 'video', url: 'https://evil.example/x.mp4' })).toBeNull();
    expect(validateMedia({ type: 'weird', url: '/media/x' })).toBeNull();
    const d = validateMedia({ id: 'a', type: 'video', url: '/media/k/clip.mp4', loop: true, startedAt: 12, duration: 30, revision: 4 });
    expect(d.fit).toBe('cover');
    expect(d.startedAt).toBe(12);
    expect(d.revision).toBe(4);
  });

  it('keeps camera descriptors honest (no URL, local-only marker)', () => {
    const d = validateMedia({ type: 'camera', id: 'console-camera', revision: 1 });
    expect(d.type).toBe('camera');
    expect(d.url).toBeUndefined();
  });
});

describe('output format validation', () => {
  it('honours every aspect preset', () => {
    for (const [aspect, dims] of Object.entries(ASPECT_PRESETS)) {
      const f = validateOutputFormat({ aspect });
      expect(f.width).toBe(dims.width);
      expect(f.height).toBe(dims.height);
    }
  });

  it('clamps invalid dimensions and fps', () => {
    const f = validateOutputFormat({ aspect: 'nope', width: 999999, height: -4, fps: 500 });
    expect(f.width).toBe(4096);
    expect(f.height).toBe(16);
    expect(f.fps).toBe(120);
    expect(validateOutputFormat(null).width).toBe(1280);
  });
});

describe('control signal validation', () => {
  it('clamps and bounds the payload', () => {
    const c = validateControls({
      audio: { amp: 2, bass: -1 },
      motion: { x: 5 },
      midi: { note: 300, velocity: -2, cc: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, 2])) },
      osc: Array.from({ length: 30 }, () => 9),
      emergencyLevel: 3,
      sequence: 5.9,
    });
    expect(c.audio.amp).toBe(1);
    expect(c.audio.bass).toBe(0);
    expect(c.motion.x).toBe(1);
    expect(c.midi.note).toBe(127);
    expect(Object.keys(c.midi.cc).length).toBeLessThanOrEqual(16);
    expect(c.osc.length).toBe(8);
    expect(c.emergencyLevel).toBe(1);
    expect(c.sequence).toBe(5);
    expect(validateControls('junk')).toBeNull();
  });
});

describe('emergency validation', () => {
  it('normalizes and defaults to maximum severity on bad levels', () => {
    const e = validateEmergency({ active: true, level: 'weird', title: 'X', seq: 2 });
    expect(e.level).toBe('emergency');
    expect(validateEmergency({ active: false, seq: 3 })).toEqual({ active: false, seq: 3 });
    expect(validateEmergency(null)).toBeNull();
  });
});
