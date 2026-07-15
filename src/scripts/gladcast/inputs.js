/**
 * GLADcast input layer: audio analysis, WebMIDI (+ MIDI-learn), OSC-over-
 * WebSocket, and the ASL-responsive camera motion tracker.
 *
 * The motion tracker deliberately does NOT attempt sign translation. It
 * measures broad signing motion — energy, position, velocity, direction,
 * spread, tempo, raised hands — and publishes it as expressive control
 * data, exactly like a mod wheel or an XY pad. ASL operates the
 * instrument; it is never decoration.
 */

// ---------------------------------------------------------------- audio ----

export class AudioInput {
  constructor() {
    this.amp = 0; this.bass = 0; this.mid = 0; this.high = 0;
    this.wave = new Uint8Array(256).fill(128);
    this.enabled = false;
  }

  async enable() {
    if (this.enabled) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      src.connect(this.analyser);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  tick() {
    if (!this.enabled) {
      // idle: gentle synthetic pulse so audio-mapped patches still breathe
      const t = performance.now() / 1000;
      this.amp = 0.08 + 0.05 * Math.sin(t * 0.8);
      this.bass = this.amp; this.mid = this.amp * 0.7; this.high = this.amp * 0.4;
      return;
    }
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    const band = (a, b) => {
      let s = 0;
      for (let i = a; i < b; i++) s += this.freq[i];
      return s / ((b - a) * 255);
    };
    const n = this.freq.length;
    this.bass = band(1, Math.floor(n * 0.08));
    this.mid = band(Math.floor(n * 0.08), Math.floor(n * 0.4));
    this.high = band(Math.floor(n * 0.4), n);
    this.amp = this.bass * 0.5 + this.mid * 0.35 + this.high * 0.15;
  }
}

// ----------------------------------------------------------------- MIDI ----

export class MidiInput {
  constructor() {
    this.cc = {};            // cc number → 0..1
    this.lastNote = 0;
    this.lastVelocity = 0;
    this.enabled = false;
    this.learning = null;    // callback awaiting the next CC
    this.mappings = [];      // { cc, apply(value01) , label }
    this.onNote = null;      // note trigger hook (envelope, scene launch)
    this.deviceName = '';
  }

  async enable() {
    if (!navigator.requestMIDIAccess) return false;
    try {
      const access = await navigator.requestMIDIAccess();
      const attach = () => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (m) => this.handle(m.data);
          this.deviceName = input.name || 'MIDI device';
        }
      };
      attach();
      access.onstatechange = attach;
      this.enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  handle(data) {
    const [status, d1, d2] = data;
    const type = status & 0xf0;
    if (type === 0x90 && d2 > 0) {          // note on
      this.lastNote = d1;
      this.lastVelocity = d2;
      this.onNote?.(d1, d2);
    } else if (type === 0xb0) {             // control change
      const v = d2 / 127;
      this.cc[d1] = v;
      if (this.learning) {
        const done = this.learning;
        this.learning = null;
        done(d1);
        return;
      }
      for (const m of this.mappings) if (m.cc === d1) m.apply(v);
    }
  }

  /** MIDI-learn: next CC received becomes bound to `apply`. */
  learn(label, apply, onBound) {
    this.learning = (cc) => {
      this.mappings = this.mappings.filter((m) => m.label !== label);
      this.mappings.push({ cc, apply, label });
      onBound?.(cc);
    };
  }
}

// ------------------------------------------------------------------ OSC ----

/**
 * OSC bridge: connects to a WebSocket relay (e.g. osc-js / node bridge)
 * carrying JSON {address:"/gladcast/1", value:0.5}. Addresses /gladcast/1..8
 * land in slots readable as mod sources osc.1..osc.8.
 */
export class OscInput {
  constructor() {
    this.values = [];
    this.connected = false;
    this.onMessage = null;   // optional raw hook (scene launch via /gladcast/scene)
  }
  connect(url) {
    try {
      this.ws?.close();
      this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.connected = true; };
      this.ws.onclose = () => { this.connected = false; };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const m = /^\/gladcast\/(\d+)$/.exec(msg.address || '');
          if (m) this.values[Number(m[1]) - 1] = Number(msg.value) || 0;
          this.onMessage?.(msg);
        } catch { /* non-JSON frames ignored */ }
      };
      return true;
    } catch {
      return false;
    }
  }
}

// --------------------------------------------------- camera motion / ASL ----

export class MotionInput {
  constructor() {
    this.enabled = false;
    // published control signals, all 0..1 (vx/vy centered at 0.5)
    this.energy = 0;   // overall signing activity
    this.x = 0.5;      // horizontal centroid of motion
    this.y = 0.5;      // vertical centroid (1 = top of frame)
    this.vx = 0.5;     // lateral velocity → pans
    this.vy = 0.5;
    this.spread = 0;   // spatial extent of motion → expands fields
    this.raised = 0;   // activity in the upper frame → intensity
    this.tempo = 0;    // signing tempo estimate → sequencing rate
    this.onSharpStop = null; // sharp stop after activity → freeze-frame hook
    this._prev = null;
    this._peaks = [];
    this._lastEnergy = 0;
    this._activeFor = 0;
    this.W = 48; this.H = 27;
  }

  async enable() {
    if (this.enabled) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 } });
      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.W;
      this.canvas.height = this.H;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  tick(dt) {
    if (!this.enabled || this.video.readyState < 2) return;
    const { W, H } = this;
    this.ctx.drawImage(this.video, 0, 0, W, H);
    const cur = this.ctx.getImageData(0, 0, W, H).data;
    if (!this._prev) { this._prev = new Uint8ClampedArray(cur); return; }

    let sum = 0, sx = 0, sy = 0, top = 0, sxx = 0, syy = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.abs(cur[i] - this._prev[i]) + Math.abs(cur[i + 1] - this._prev[i + 1]);
        if (d > 24) {
          sum += 1; sx += x; sy += y;
          sxx += x * x; syy += y * y;
          if (y < H * 0.4) top += 1;
        }
      }
    }
    this._prev.set(cur);

    const total = W * H;
    const rawEnergy = Math.min(1, (sum / total) * 8);
    const k = 1 - Math.exp(-dt / 0.12);
    this.energy += (rawEnergy - this.energy) * k;
    this.raised += (Math.min(1, (top / total) * 16) - this.raised) * k;

    if (sum > 4) {
      const cx = sx / sum / W;                 // mirror-free normalized centroid
      const cy = 1 - sy / sum / H;
      this.vx = 0.5 + Math.max(-0.5, Math.min(0.5, (cx - this.x) / Math.max(dt, 1e-3) * 0.15));
      this.vy = 0.5 + Math.max(-0.5, Math.min(0.5, (cy - this.y) / Math.max(dt, 1e-3) * 0.15));
      this.x += (cx - this.x) * k;
      this.y += (cy - this.y) * k;
      const varX = sxx / sum - Math.pow(sx / sum, 2);
      const varY = syy / sum - Math.pow(sy / sum, 2);
      this.spread += (Math.min(1, Math.sqrt(varX + varY) / (W * 0.4)) - this.spread) * k;
    } else {
      this.vx += (0.5 - this.vx) * k;
      this.vy += (0.5 - this.vy) * k;
    }

    // Signing tempo: count energy peaks over a rolling 4-second window.
    const now = performance.now() / 1000;
    if (this.energy > 0.35 && this._lastEnergy <= 0.35) this._peaks.push(now);
    this._peaks = this._peaks.filter((t) => now - t < 4);
    this.tempo += (Math.min(1, this._peaks.length / 10) - this.tempo) * k;

    // Sharp stop: sustained activity that collapses within ~0.15 s.
    if (this.energy > 0.3) this._activeFor += dt; else if (rawEnergy < 0.04) {
      if (this._activeFor > 0.6 && this._lastEnergy > 0.25) this.onSharpStop?.();
      this._activeFor = 0;
    }
    this._lastEnergy = this.energy;
  }
}
