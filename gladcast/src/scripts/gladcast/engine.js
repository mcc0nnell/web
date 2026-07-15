/**
 * GLADcast engine — WebGL2 render core.
 *
 * Signal chain:  Sources → Generators → Effects → Compositor → Broadcast Output
 *
 * One offscreen GL canvas renders every pass. Display surfaces (program
 * monitor, preview monitor, pop-out output) are plain 2D canvases that
 * drawImage() from the GL canvas each frame, so a single context serves
 * program, preview and recording without duplicated shader state.
 */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Shared fragment header every generator is compiled against. */
export const GEN_HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2  u_res;
uniform float u_time;
uniform float u_mode;      // 0 = broadcast (restrained), 1 = demoscene (aggressive)
uniform float u_intensity; // master intensity 0..1
uniform float u_p1;
uniform float u_p2;
uniform float u_p3;
uniform float u_p4;
uniform vec4  u_audio;     // amp, bass, mid, high (0..1)
uniform vec2  u_xy;        // XY performance pad
uniform float u_beat;      // 0..1 phase of current beat
uniform sampler2D u_media; // active source texture (camera / file / archive)
uniform float u_hasMedia;  // 1 when u_media holds a live source
uniform sampler2D u_wave;  // 1D audio waveform texture (r = sample)

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n){ return fract(sin(n) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.28318 * (c * t + d)); }
// GLADcast house palette: midnight blue, signal red, phosphor white.
vec3 house(float t){
  return pal(t, vec3(0.24,0.28,0.38), vec3(0.55,0.35,0.30), vec3(1.0,1.0,0.8), vec3(0.05,0.35,0.55));
}
`;

const MIX_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_xfade;   // 0 = full A, 1 = full B
uniform float u_blend;   // 0 mix, 1 add, 2 multiply, 3 screen
void main() {
  vec4 a = texture(u_a, v_uv);
  vec4 b = texture(u_b, v_uv);
  vec4 o;
  if (u_blend < 0.5)      o = mix(a, b, u_xfade);
  else if (u_blend < 1.5) o = a + b * u_xfade;
  else if (u_blend < 2.5) o = mix(a, a * b, u_xfade);
  else                    o = mix(a, 1.0 - (1.0 - a) * (1.0 - b), u_xfade);
  fragColor = vec4(o.rgb, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform sampler2D u_prev;
uniform vec2  u_res;
uniform float u_time;
uniform float u_trails;    // feedback amount 0..0.97
uniform float u_pixelate;  // 0 off, else block size in px
uniform float u_posterize; // 0 off, else levels
uniform float u_crt;       // 0..1 scanline/curvature/aberration amount
uniform float u_invert;
uniform float u_freeze;    // 1 = hold previous frame
void main() {
  vec2 uv = v_uv;
  if (u_freeze > 0.5) { fragColor = texture(u_prev, uv); return; }
  if (u_crt > 0.0) {
    vec2 c = uv - 0.5;
    uv = c * (1.0 + dot(c, c) * 0.18 * u_crt) + 0.5;
  }
  if (u_pixelate > 0.5) {
    vec2 g = u_res / u_pixelate;
    uv = (floor(uv * g) + 0.5) / g;
  }
  vec3 col;
  if (u_crt > 0.0) {
    float ab = 0.0025 * u_crt;
    col = vec3(texture(u_src, uv + vec2(ab, 0)).r,
               texture(u_src, uv).g,
               texture(u_src, uv - vec2(ab, 0)).b);
    float scan = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159);
    col *= mix(1.0, 0.82 + 0.18 * scan, u_crt);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  } else {
    col = texture(u_src, uv).rgb;
  }
  if (u_posterize > 0.5) col = floor(col * u_posterize) / u_posterize;
  if (u_invert > 0.5) col = 1.0 - col;
  vec3 prev = texture(u_prev, v_uv).rgb;
  col = max(col, prev * u_trails);
  fragColor = vec4(col, 1.0);
}`;

const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
void main(){ fragColor = vec4(texture(u_src, vec2(v_uv.x, 1.0 - v_uv.y)).rgb, 1.0); }`;

export class Engine {
  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement('canvas');
    this.setSize(width, height, false);
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is required for GLADcast');
    this.gl = gl;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quad = quad;

    this.mixProg = this.compile(VERT, MIX_FRAG);
    this.postProg = this.compile(VERT, POST_FRAG);
    this.blitProg = this.compile(VERT, BLIT_FRAG);
    this.genPrograms = new Map(); // generator id → compiled program

    this.fboA = this.makeTarget();
    this.fboB = this.makeTarget();
    this.fboMix = this.makeTarget();
    this.fboOut = this.makeTarget();
    this.fboPrev = this.makeTarget();

    this.mediaTex = this.makeTexture();
    this.waveTex = this.makeTexture();
    this.hasMedia = false;
    this._locCache = new Map();       // program → (name → uniform location)
    this._lastMediaSource = null;     // static-source upload dedupe
    this._lastMediaStatic = false;

    this.frameMs = 0;
  }

  setSize(w, h, rebuild = true) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (rebuild) {
      for (const t of [this.fboA, this.fboB, this.fboMix, this.fboOut, this.fboPrev]) this.resizeTarget(t);
    }
  }

  compile(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s) + '\n' + src);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  makeTexture() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  makeTarget() {
    const gl = this.gl;
    const tex = this.makeTexture();
    const fbo = gl.createFramebuffer();
    const target = { fbo, tex };
    this.resizeTarget(target);
    return target;
  }

  resizeTarget(target) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Cached uniform-location lookup — no per-frame getUniformLocation. */
  loc(prog, name) {
    let names = this._locCache.get(prog);
    if (!names) {
      names = new Map();
      this._locCache.set(prog, names);
    }
    let l = names.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(prog, name);
      names.set(name, l);
    }
    return l;
  }

  getGenProgram(gen) {
    if (!this.genPrograms.has(gen.id)) {
      this.genPrograms.set(gen.id, this.compile(VERT, GEN_HEADER + gen.frag));
    }
    return this.genPrograms.get(gen.id);
  }

  /**
   * Upload a video/canvas/image element as the shared media source texture.
   * Static sources (images, decoded canvases) upload once and are skipped
   * on subsequent frames; dynamic sources (video, camera) upload per frame.
   */
  updateMedia(source, isStatic = false) {
    const gl = this.gl;
    if (!source) {
      this.hasMedia = false;
      this._lastMediaSource = null;
      return;
    }
    if (isStatic && this._lastMediaStatic && this._lastMediaSource === source && this.hasMedia) {
      return;
    }
    this._lastMediaSource = source;
    this._lastMediaStatic = isStatic;
    try {
      gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.hasMedia = true;
    } catch {
      this.hasMedia = false;
    }
  }

  /** Upload the audio waveform (Uint8Array) as a 1D-ish texture. */
  updateWave(samples) {
    const gl = this.gl;
    const n = samples.length;
    const rgba = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) rgba[i * 4] = samples[i];
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  drawQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  renderGenerator(gen, params, ctx, target) {
    const gl = this.gl;
    const prog = this.getGenProgram(gen);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(prog);
    const u = (n) => this.loc(prog, n);
    gl.uniform2f(u('u_res'), this.width, this.height);
    gl.uniform1f(u('u_time'), ctx.time);
    gl.uniform1f(u('u_mode'), params.mode);
    gl.uniform1f(u('u_intensity'), params.intensity);
    gl.uniform1f(u('u_p1'), params.p1);
    gl.uniform1f(u('u_p2'), params.p2);
    gl.uniform1f(u('u_p3'), params.p3);
    gl.uniform1f(u('u_p4'), params.p4);
    gl.uniform4f(u('u_audio'), ctx.audio.amp, ctx.audio.bass, ctx.audio.mid, ctx.audio.high);
    gl.uniform2f(u('u_xy'), ctx.xy.x, ctx.xy.y);
    gl.uniform1f(u('u_beat'), ctx.beat);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
    gl.uniform1i(u('u_media'), 0);
    gl.uniform1f(u('u_hasMedia'), this.hasMedia ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.uniform1i(u('u_wave'), 1);
    this.drawQuad();
  }

  /** Full program pass: deck A + deck B → crossfade → post effects → GL canvas. */
  renderProgram(deckA, deckB, ctx, mixState, fx) {
    const t0 = performance.now();
    const gl = this.gl;

    this.renderGenerator(deckA.gen, deckA.params, ctx, this.fboA);
    this.renderGenerator(deckB.gen, deckB.params, ctx, this.fboB);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMix.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.mixProg);
    let u = (n) => this.loc(this.mixProg, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform1i(u('u_a'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fboB.tex);
    gl.uniform1i(u('u_b'), 1);
    gl.uniform1f(u('u_xfade'), mixState.xfade);
    gl.uniform1f(u('u_blend'), mixState.blend);
    this.drawQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboOut.fbo);
    gl.useProgram(this.postProg);
    u = (n) => this.loc(this.postProg, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboMix.tex);
    gl.uniform1i(u('u_src'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fboPrev.tex);
    gl.uniform1i(u('u_prev'), 1);
    gl.uniform2f(u('u_res'), this.width, this.height);
    gl.uniform1f(u('u_time'), ctx.time);
    gl.uniform1f(u('u_trails'), fx.trails);
    gl.uniform1f(u('u_pixelate'), fx.pixelate);
    gl.uniform1f(u('u_posterize'), fx.posterize);
    gl.uniform1f(u('u_crt'), fx.crt);
    gl.uniform1f(u('u_invert'), fx.invert);
    gl.uniform1f(u('u_freeze'), fx.freeze);
    this.drawQuad();

    // Save this frame for trails / freeze on the next one.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fboOut.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fboPrev.fbo);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    this.blitToCanvas(this.fboOut.tex);
    this.frameMs = performance.now() - t0;
  }

  /** Render a single deck straight to the GL canvas (used for the preview monitor). */
  renderPreview(deck, ctx) {
    this.renderGenerator(deck.gen, deck.params, ctx, this.fboB);
    this.blitToCanvas(this.fboB.tex);
  }

  blitToCanvas(tex) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.blitProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc(this.blitProg, 'u_src'), 0);
    this.drawQuad();
  }
}
