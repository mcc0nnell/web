/**
 * GLADcast native generators.
 *
 * Every generator is a GLSL fragment body compiled against GEN_HEADER
 * (engine.js). Shared contract:
 *   u_mode      0 = broadcast (restrained), 1 = demoscene (aggressive)
 *   u_intensity master intensity
 *   u_p1..u_p4  performable parameters (labelled below, all 0..1)
 *   u_audio     amp/bass/mid/high, u_beat, u_xy, u_media, u_wave
 *
 * Broadcast mode must always stay legible enough to sit under captions.
 */

export const GENERATORS = [
  {
    id: 'plasma',
    name: 'Plasma Field',
    params: ['Scale', 'Speed', 'Warp', 'Hue'],
    defaults: { p1: 0.4, p2: 0.35, p3: 0.3, p4: 0.5 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time * mix(0.15, 0.9, u_p2) * (1.0 + u_mode * u_audio.y * 2.0);
  float sc = mix(2.0, 9.0, u_p1);
  vec2 p = uv * sc;
  float warp = mix(0.2, 2.5, u_p3) + u_mode * u_xy.x * 2.0;
  float v = sin(p.x + t) + sin(p.y + t * 1.3)
          + sin(length(p) * 1.5 - t * 2.0)
          + sin(dot(p, vec2(sin(t * 0.3), cos(t * 0.3))) * warp);
  v *= 0.25;
  vec3 col = house(v + u_p4);
  col *= mix(0.55, 1.0, u_intensity);
  if (u_mode > 0.5) col = pow(col, vec3(0.8)) * (1.0 + u_audio.x * 0.8);
  else col = mix(vec3(0.06, 0.08, 0.13), col, 0.75); // sit-back civic bed
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'starfield',
    name: 'Starfield',
    params: ['Speed', 'Density', 'Streak', 'Tint'],
    defaults: { p1: 0.35, p2: 0.5, p3: 0.2, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float speed = mix(0.05, 1.2, u_p1) * (1.0 + u_mode * (u_audio.x * 2.0 + u_xy.y));
  vec3 col = vec3(0.0);
  float layers = mix(3.0, 6.0, u_p2);
  for (float i = 0.0; i < 6.0; i++) {
    if (i >= layers) break;
    float depth = fract(i / 6.0 + u_time * speed * 0.15);
    float scale = mix(18.0, 0.6, depth);
    vec2 p = uv * scale + vec2(hash1(i) * 43.0, hash1(i + 9.0) * 91.0);
    vec2 cell = floor(p);
    vec2 f = fract(p) - 0.5;
    float star = hash(cell);
    if (star > mix(0.97, 0.88, u_p2)) {
      float d = length(f - (vec2(hash(cell + 7.0), hash(cell + 13.0)) - 0.5) * 0.6);
      float streak = mix(1.0, 6.0, u_p3 * u_mode);
      d = length((f) * vec2(1.0, streak));
      float b = smoothstep(0.12, 0.0, d) * depth * depth;
      col += mix(vec3(0.85, 0.9, 1.0), house(star + u_p4), 0.4) * b;
    }
  }
  col *= u_intensity;
  fragColor = vec4(col + vec3(0.02, 0.03, 0.06), 1.0);
}`,
  },
  {
    id: 'tunnel',
    name: 'Tunnel',
    params: ['Speed', 'Twist', 'Rings', 'Hue'],
    defaults: { p1: 0.3, p2: 0.25, p3: 0.5, p4: 0.55 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  uv += (u_xy - 0.5) * 0.4;
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float t = u_time * mix(0.2, 1.6, u_p1) * (1.0 + u_mode * u_audio.y);
  float twist = mix(0.0, 4.0, u_p2);
  float tube = 0.25 / max(r, 0.001);
  float rings = sin((tube + t) * mix(4.0, 16.0, u_p3)) * 0.5 + 0.5;
  float spokes = sin(a * 12.0 + tube * twist + t * 2.0) * 0.5 + 0.5;
  float shade = rings * mix(0.6, 1.0, spokes);
  vec3 col = house(tube * 0.15 + u_p4 + u_beat * u_mode * 0.2) * shade;
  col *= smoothstep(0.0, 0.25, r);            // dark core
  col *= mix(0.5, 1.15, u_intensity);
  if (u_mode < 0.5) col *= 0.7;
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'metaballs',
    name: 'Metaballs',
    params: ['Count', 'Size', 'Speed', 'Hue'],
    defaults: { p1: 0.5, p2: 0.45, p3: 0.3, p4: 0.3 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time * mix(0.2, 1.2, u_p3);
  float field = 0.0;
  float n = floor(mix(3.0, 8.0, u_p1));
  for (float i = 0.0; i < 8.0; i++) {
    if (i >= n) break;
    vec2 c = vec2(sin(t * (0.5 + hash1(i) * 0.7) + i * 2.4),
                  cos(t * (0.4 + hash1(i + 5.0) * 0.8) + i * 1.7)) * 0.45;
    c += (u_xy - 0.5) * 0.5 * step(i, 1.5);
    float r = mix(0.05, 0.22, u_p2) * (1.0 + u_mode * u_audio.y * hash1(i + 11.0));
    field += r * r / dot(uv - c, uv - c);
  }
  float m = smoothstep(0.9, 1.1, field);
  float edge = smoothstep(0.9, 1.0, field) - smoothstep(1.1, 1.3, field);
  vec3 col = house(field * 0.12 + u_p4) * m + vec3(0.9, 0.25, 0.2) * edge * u_mode;
  col *= u_intensity;
  fragColor = vec4(col + vec3(0.04, 0.05, 0.09) * (1.0 - m), 1.0);
}`,
  },
  {
    id: 'rasterbars',
    name: 'Raster Bars',
    params: ['Count', 'Speed', 'Width', 'Copper'],
    defaults: { p1: 0.4, p2: 0.35, p3: 0.4, p4: 0.6 },
    frag: `
void main() {
  float t = u_time * mix(0.3, 2.0, u_p2);
  vec3 col = vec3(0.04, 0.05, 0.09);
  float n = floor(mix(3.0, 10.0, u_p1));
  for (float i = 0.0; i < 10.0; i++) {
    if (i >= n) break;
    float y = 0.5 + 0.38 * sin(t + i * 6.28318 / n + u_audio.y * u_mode * 2.0);
    float w = mix(0.015, 0.07, u_p3);
    float d = abs(v_uv.y - y);
    float bar = smoothstep(w, 0.0, d);
    vec3 bc = mix(house(i / n + u_p4), vec3(0.86, 0.16, 0.15), step(0.7, hash1(i)));
    col += bc * bar * (0.55 + 0.45 * sin(d / w * 3.14159)); // copper shading
  }
  col *= u_intensity * mix(0.7, 1.1, u_mode);
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'particles',
    name: 'Particle System',
    params: ['Count', 'Spread', 'Rise', 'Glow'],
    defaults: { p1: 0.5, p2: 0.5, p3: 0.4, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = vec3(0.02, 0.03, 0.06);
  float n = floor(mix(24.0, 90.0, u_p1));
  float spread = mix(0.3, 1.4, u_p2) * (1.0 + u_mode * u_xy.x);
  float rise = mix(0.02, 0.4, u_p3);
  for (float i = 0.0; i < 90.0; i++) {
    if (i >= n) break;
    float seed = hash1(i * 1.37);
    float life = fract(u_time * (0.05 + seed * 0.12) + seed);
    vec2 p = vec2((hash1(i + 40.0) - 0.5) * spread,
                  -0.55 + life * (1.1 + rise) + sin(u_time * (1.0 + seed) + i) * 0.04);
    p.x += sin(u_time * seed * 3.0 + i) * 0.08 * spread;
    float d = length(uv - p);
    float size = mix(0.002, 0.012, hash1(i + 80.0)) * (1.0 + u_audio.z * u_mode * 2.0);
    float glow = mix(0.01, 0.06, u_p4);
    col += house(seed + u_beat * 0.2) * (smoothstep(size + glow, size, d) * 0.9 + smoothstep(glow * 4.0, 0.0, d) * 0.08)
           * (1.0 - abs(life - 0.5) * 1.6);
  }
  fragColor = vec4(col * u_intensity, 1.0);
}`,
  },
  {
    id: 'oscilloscope',
    name: 'ASL Oscilloscope',
    params: ['Gain', 'Thickness', 'Trace', 'Grid'],
    defaults: { p1: 0.6, p2: 0.3, p3: 0.5, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = v_uv;
  vec3 col = vec3(0.015, 0.03, 0.03);
  // graticule
  vec2 g = abs(fract(uv * 10.0) - 0.5);
  float grid = smoothstep(0.48, 0.5, max(g.x, g.y)) * mix(0.0, 0.25, u_p4);
  col += vec3(0.1, 0.3, 0.2) * grid;
  float gain = mix(0.1, 0.9, u_p1) * (0.4 + u_intensity);
  float samp = texture(u_wave, vec2(uv.x, 0.5)).r * 2.0 - 1.0;
  float y = 0.5 + samp * gain;
  float thick = mix(0.002, 0.02, u_p2);
  float d = abs(uv.y - y);
  float beam = smoothstep(thick, 0.0, d) + smoothstep(thick * 8.0, 0.0, d) * 0.25;
  vec3 phosphor = mix(vec3(0.2, 1.0, 0.5), vec3(1.0, 0.3, 0.25), u_mode * u_p3);
  col += phosphor * beam;
  // demoscene: second lissajous trace driven by the XY pad
  if (u_mode > 0.5) {
    vec2 c = v_uv - 0.5;
    float lx = sin(u_time * 3.0 + c.y * 12.0 * u_xy.y) * 0.3 * u_xy.x;
    float d2 = abs(c.x - lx) ;
    col += vec3(0.9, 0.4, 0.9) * smoothstep(0.01, 0.0, d2) * 0.6;
  }
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'vectorgrid',
    name: 'Vector Grid',
    params: ['Scale', 'Speed', 'Horizon', 'Pulse'],
    defaults: { p1: 0.5, p2: 0.3, p3: 0.5, p4: 0.3 },
    frag: `
void main() {
  vec2 uv = v_uv;
  float horizon = mix(0.35, 0.65, u_p3);
  vec3 col = vec3(0.03, 0.04, 0.08);
  if (uv.y < horizon) {
    float py = horizon - uv.y;
    float z = 0.12 / max(py, 0.001);
    float x = (uv.x - 0.5) * z * mix(4.0, 14.0, u_p1);
    float t = u_time * mix(0.4, 3.0, u_p2);
    float lx = smoothstep(0.06, 0.0, abs(fract(x) - 0.5) * py * 2.0 + 0.001);
    lx = smoothstep(0.94, 1.0, abs(fract(x) - 0.5) * 2.0);
    float lz = smoothstep(0.9, 1.0, fract(z + t));
    float pulse = 1.0 + u_p4 * (u_audio.y * 2.0 + u_beat) * u_mode;
    vec3 gc = mix(vec3(0.25, 0.35, 0.6), vec3(0.86, 0.16, 0.15), u_mode * 0.6);
    col += gc * max(lx, lz) * pulse * smoothstep(0.0, 0.25, py);
  } else {
    float glow = smoothstep(0.2, 0.0, uv.y - horizon);
    col += vec3(0.55, 0.12, 0.1) * glow * mix(0.4, 1.0, u_intensity);
    // stars above
    vec2 sp = floor(uv * vec2(120.0, 60.0));
    if (hash(sp) > 0.995) col += vec3(0.6);
  }
  fragColor = vec4(col * u_intensity * 1.4, 1.0);
}`,
  },
  {
    id: 'citygrid',
    name: 'Scrolling City',
    params: ['Density', 'Speed', 'Height', 'Neon'],
    defaults: { p1: 0.5, p2: 0.3, p3: 0.5, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = v_uv;
  vec3 col = mix(vec3(0.03, 0.04, 0.08), vec3(0.1, 0.03, 0.05), uv.y * u_mode);
  float t = u_time * mix(0.02, 0.25, u_p2);
  // three parallax skyline layers
  for (float L = 0.0; L < 3.0; L++) {
    float depth = 1.0 - L * 0.3;
    float x = uv.x * mix(6.0, 20.0, u_p1) * depth + t * (40.0 * depth) + L * 37.0;
    float b = floor(x);
    float h = (0.12 + hash1(b + L * 91.0) * mix(0.2, 0.55, u_p3)) * depth;
    float base = 0.0;
    if (uv.y < base + h) {
      vec3 bc = mix(vec3(0.07, 0.09, 0.15), vec3(0.16, 0.2, 0.3), depth);
      // windows
      vec2 w = fract(vec2(x * 4.0, uv.y * 40.0));
      float lit = step(0.82, hash(vec2(floor(x * 4.0), floor(uv.y * 40.0)) + L))
                * step(uv.y, base + h - 0.01);
      vec3 wc = mix(vec3(0.9, 0.8, 0.5), house(hash1(b) + u_p4), u_mode);
      col = bc + wc * lit * step(0.25, w.x) * step(w.x, 0.75) * step(0.3, w.y) * step(w.y, 0.7)
            * (0.6 + 0.4 * sin(u_time * 2.0 + b));
    }
  }
  fragColor = vec4(col * u_intensity * 1.3, 1.0);
}`,
  },
  {
    id: 'wireframe',
    name: 'Wireframe Terrain',
    params: ['Relief', 'Speed', 'Density', 'Glow'],
    defaults: { p1: 0.5, p2: 0.25, p3: 0.5, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = v_uv;
  vec3 col = vec3(0.02, 0.03, 0.06);
  float horizon = 0.62;
  if (uv.y < horizon) {
    float py = horizon - uv.y + 0.02;
    float z = 0.35 / py;
    float t = u_time * mix(0.2, 1.5, u_p2);
    vec2 world = vec2((uv.x - 0.5) * z * 3.0, z + t);
    float h = noise(world * mix(0.5, 2.0, u_p1)) * 0.8;
    world.y += h * 0.3;
    vec2 cell = abs(fract(world * mix(2.0, 8.0, u_p3)) - 0.5);
    float line = smoothstep(0.46, 0.5, max(cell.x, cell.y));
    float fade = smoothstep(0.0, 0.3, py);
    vec3 wire = mix(vec3(0.2, 0.5, 0.9), vec3(0.9, 0.2, 0.2), h + u_mode * 0.3);
    col += wire * line * fade * (1.0 + u_p4 * 2.0 * u_audio.z * u_mode);
  } else {
    col += vec3(0.5, 0.1, 0.08) * smoothstep(0.25, 0.0, uv.y - horizon) * 0.6;
  }
  fragColor = vec4(col * u_intensity * 1.4, 1.0);
}`,
  },
  {
    id: 'halftone',
    name: 'Halftone Portrait',
    params: ['Dot Size', 'Angle', 'Contrast', 'Ink'],
    defaults: { p1: 0.4, p2: 0.2, p3: 0.5, p4: 0.3 },
    frag: `
// Archive-respecting: geometry re-screens the source but luminance structure
// is preserved, so documentary content stays recognizable.
void main() {
  vec2 uv = v_uv;
  vec3 src;
  if (u_hasMedia > 0.5) {
    src = texture(u_media, uv).rgb;
  } else {
    // procedural placeholder pattern when no source is loaded
    float v = noise(uv * 5.0 + u_time * 0.1) * 0.6 + noise(uv * 17.0) * 0.4;
    src = vec3(v);
  }
  float lum = dot(src, vec3(0.299, 0.587, 0.114));
  lum = clamp((lum - 0.5) * mix(0.8, 2.2, u_p3) + 0.5, 0.0, 1.0);
  float cells = mix(160.0, 40.0, u_p1);
  vec2 guv = rot(u_p2 * 1.57 + u_mode * u_time * 0.05) * (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec2 cell = fract(guv * cells) - 0.5;
  float d = length(cell);
  float radius = sqrt(lum) * 0.62;
  float dot_ = smoothstep(radius, radius - 0.12, d);
  vec3 paper = vec3(0.05, 0.07, 0.11);
  vec3 ink = mix(vec3(0.91, 0.93, 0.96), house(u_p4), u_mode * 0.7);
  vec3 col = mix(paper, ink, dot_);
  fragColor = vec4(col * mix(0.7, 1.1, u_intensity), 1.0);
}`,
  },
  {
    id: 'archive',
    name: 'Archive Frame',
    params: ['Grain', 'Warmth', 'Vignette', 'Drift'],
    defaults: { p1: 0.3, p2: 0.4, p3: 0.4, p4: 0.2 },
    frag: `
// Documentary-first source treatment. Effects surround and texture the
// material; they never destroy legibility (distortion is intentionally capped).
void main() {
  vec2 uv = v_uv;
  uv += (vec2(noise(vec2(u_time * 0.7, 1.0)), noise(vec2(0.0, u_time * 0.9))) - 0.5)
        * 0.006 * u_p4;                       // capped gate weave
  vec3 col;
  if (u_hasMedia > 0.5) col = texture(u_media, clamp(uv, 0.0, 1.0)).rgb;
  else {
    float bars = step(0.48, fract(uv.y * 1.0 + u_time * 0.02));
    col = vec3(0.1, 0.12, 0.17) + vec3(0.05) * bars; // leader placeholder
  }
  // warmth toward archival print stock
  col = mix(col, col * vec3(1.12, 1.0, 0.82), u_p2);
  // grain
  float g = (hash(uv * u_res + fract(u_time) * 100.0) - 0.5) * mix(0.0, 0.25, u_p1);
  col += g;
  // vignette + frame edge
  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * mix(0.2, 1.4, u_p3);
  if (u_mode > 0.5) {
    // demoscene: scanline resurrection sweep, still leaves the image readable
    float sweep = smoothstep(0.02, 0.0, abs(fract(u_time * 0.2) - uv.y));
    col += vec3(0.9, 0.25, 0.2) * sweep * 0.5;
  }
  fragColor = vec4(col * mix(0.8, 1.1, u_intensity), 1.0);
}`,
  },
  {
    id: 'testpattern',
    name: 'CRT Test Pattern',
    params: ['Variant', 'Roll', 'Noise', 'Tone'],
    defaults: { p1: 0.0, p2: 0.0, p3: 0.1, p4: 0.5 },
    frag: `
void main() {
  vec2 uv = v_uv;
  uv.y = fract(uv.y + u_p2 * u_time * 0.2);   // vertical roll
  vec3 col;
  if (u_p1 < 0.5) {
    // SMPTE-style bars
    float x = uv.x * 7.0;
    vec3 bars[7] = vec3[7](vec3(0.75), vec3(0.75,0.75,0.0), vec3(0.0,0.75,0.75),
      vec3(0.0,0.75,0.0), vec3(0.75,0.0,0.75), vec3(0.75,0.0,0.0), vec3(0.0,0.0,0.75));
    col = bars[int(clamp(x, 0.0, 6.99))];
    if (uv.y < 0.25) {
      float px = uv.x * 6.0;
      col = mix(vec3(0.0), vec3(1.0), floor(px) / 5.0); // pluge / grayscale strip
    }
  } else {
    // convergence grid + center circle
    vec2 g = abs(fract(uv * vec2(16.0, 9.0)) - 0.5);
    col = vec3(0.05, 0.06, 0.1) + vec3(0.8) * smoothstep(0.47, 0.5, max(g.x, g.y));
    vec2 c = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
    col += vec3(0.86, 0.16, 0.15) * smoothstep(0.008, 0.0, abs(length(c) - 0.35));
  }
  col += (hash(uv * u_res + fract(u_time) * 77.0) - 0.5) * u_p3;
  col *= mix(0.6, 1.0, u_p4) * mix(0.7, 1.0, u_intensity);
  if (u_mode > 0.5) col = mix(col, house(uv.x + u_time * 0.1), 0.25 + u_audio.x * 0.3);
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'pointcloud',
    name: 'Point-Cloud Building',
    params: ['Spin', 'Density', 'Height', 'Scan'],
    defaults: { p1: 0.3, p2: 0.5, p3: 0.5, p4: 0.4 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  vec3 col = vec3(0.02, 0.03, 0.06);
  float t = u_time * mix(0.1, 0.8, u_p1) + u_xy.x * 3.14;
  float n = mix(150.0, 400.0, u_p2);
  // project a procedural "civic building" point cloud (box + tower)
  for (float i = 0.0; i < 400.0; i++) {
    if (i >= n) break;
    float fx = hash1(i), fz = hash1(i + 400.0), fy = hash1(i + 800.0);
    vec3 p;
    if (fy > 0.7) p = vec3((fx - 0.5) * 0.3, fy * mix(0.6, 1.3, u_p3), (fz - 0.5) * 0.3); // tower
    else          p = vec3((fx - 0.5) * 1.2, fy * 0.5, (fz - 0.5) * 0.8);                 // base
    p.xz = rot(t) * p.xz;
    float persp = 1.6 / (2.4 + p.z);
    vec2 s = vec2(p.x, p.y - 0.45) * persp;
    float d = length(uv - s);
    float scan = smoothstep(0.05, 0.0, abs(fract(u_time * 0.3) * 1.4 - p.y)) * u_p4;
    vec3 pc = mix(vec3(0.35, 0.55, 0.9), vec3(0.9, 0.25, 0.2), scan + u_mode * step(0.7, fy));
    col += pc * smoothstep(0.006 * persp + 0.002, 0.0, d) * persp * 0.8;
  }
  fragColor = vec4(col * u_intensity * 1.5, 1.0);
}`,
  },
  {
    id: 'ascii',
    name: 'ASCII Field',
    params: ['Cell', 'Flow', 'Density', 'Tint'],
    defaults: { p1: 0.4, p2: 0.3, p3: 0.5, p4: 0.5 },
    frag: `
// Procedural 5x5 glyph atlas — luminance of source (media or plasma) picks glyph.
float glyph(vec2 g, float idx) {
  // 5x5 bitmap glyphs packed as thresholds of hash-noise per glyph index
  vec2 c = floor(g * 5.0);
  float bit = hash(c + floor(idx * 8.0) * 17.0);
  float fill = idx; // denser glyph for brighter cells
  return step(1.0 - fill, bit);
}
void main() {
  float cells = mix(120.0, 36.0, u_p1);
  vec2 grid = vec2(cells, cells * u_res.y / u_res.x);
  vec2 cell = floor(v_uv * grid);
  vec2 inCell = fract(v_uv * grid);
  vec2 suv = (cell + 0.5) / grid;
  float lum;
  if (u_hasMedia > 0.5) {
    lum = dot(texture(u_media, suv).rgb, vec3(0.299, 0.587, 0.114));
  } else {
    lum = noise(suv * 4.0 + u_time * mix(0.05, 0.6, u_p2)) * 0.7
        + noise(suv * 11.0 - u_time * 0.2) * 0.3;
  }
  lum = clamp(lum * mix(0.6, 1.6, u_p3), 0.0, 1.0);
  float on = glyph(inCell, lum) * step(0.08, lum);
  vec3 ink = mix(vec3(0.3, 0.9, 0.5), house(u_p4 + cell.y / grid.y * 0.2), u_mode);
  vec3 col = vec3(0.02, 0.035, 0.05) + ink * on * mix(0.5, 1.1, u_intensity);
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'waveformgeo',
    name: 'Waveform Geometry',
    params: ['Radius', 'Gain', 'Sides', 'Hue'],
    defaults: { p1: 0.4, p2: 0.5, p3: 0.0, p4: 0.6 },
    frag: `
void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float u = fract(a / 6.28318 + 0.5);
  float samp = texture(u_wave, vec2(u, 0.5)).r * 2.0 - 1.0;
  float sides = floor(mix(0.0, 8.0, u_p3));
  float base = mix(0.15, 0.4, u_p1);
  if (sides >= 3.0) base *= 1.0 / cos(mod(a, 6.28318 / sides) - 3.14159 / sides); // polygon
  float target = base + samp * mix(0.02, 0.25, u_p2) * (0.5 + u_intensity);
  float d = abs(r - target);
  float ring = smoothstep(0.01, 0.0, d) + smoothstep(0.08, 0.0, d) * 0.2;
  vec3 col = house(u + u_p4 + u_beat * u_mode * 0.3) * ring;
  col += vec3(0.86, 0.16, 0.15) * smoothstep(0.004, 0.0, abs(r - base * 0.35)) * u_mode;
  fragColor = vec4(col + vec3(0.02, 0.03, 0.055), 1.0);
}`,
  },
  {
    id: 'signalacq',
    name: 'Signal Acquisition',
    params: ['Lock', 'Static', 'Sweep', 'Tone'],
    defaults: { p1: 0.3, p2: 0.5, p3: 0.4, p4: 0.5 },
    frag: `
void main() {
  vec2 uv = v_uv;
  float lock = clamp(u_p1 + u_xy.y * u_mode, 0.0, 1.0);
  // analog static, resolving into a clean carrier as lock rises
  float st = hash(uv * u_res + fract(u_time) * vec2(311.0, 173.0));
  vec3 col = vec3(st) * mix(0.9, 0.08, lock) * mix(0.4, 1.0, u_p2);
  // carrier bars fade in
  float carrier = smoothstep(0.3, 1.0, lock);
  col += house(floor(uv.x * 6.0) / 6.0 + u_p4) * carrier * 0.35;
  // radar sweep
  vec2 c = (uv - vec2(0.5, 0.55)) * vec2(u_res.x / u_res.y, 1.0);
  float ang = atan(c.y, c.x);
  float sweep = fract(ang / 6.28318 - u_time * mix(0.05, 0.5, u_p3));
  float inRange = smoothstep(0.32, 0.3, length(c));
  col += vec3(0.2, 0.9, 0.5) * pow(1.0 - sweep, 6.0) * inRange * (1.0 - lock * 0.6);
  col += vec3(0.2, 0.9, 0.5) * smoothstep(0.004, 0.0, abs(length(c) - 0.3)) * 0.5;
  fragColor = vec4(col * mix(0.7, 1.1, u_intensity), 1.0);
}`,
  },
];

export const GENERATOR_MAP = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));
