export class SoundEngine {
  constructor() {
    this.context = null;
    this.muted = false;
    this.lastTickAt = 0;
    this.minTickGapMs = 35;
  }

  setMuted(value) {
    this.muted = value;
  }

  async ensureContext() {
    if (this.context || this.muted) return;
    this.context = new AudioContext();
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  async tick(intensity = 1) {
    if (this.muted) return;

    const now = performance.now();
    if (now - this.lastTickAt < this.minTickGapMs) return;
    this.lastTickAt = now;

    await this.ensureContext();
    if (!this.context) return;

    const duration = 0.02;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'square';
    osc.frequency.value = 80 + Math.floor(Math.random() * 20);
    gain.gain.value = Math.min(0.0008 * intensity, 0.018);

    osc.connect(gain);
    gain.connect(this.context.destination);

    const t0 = this.context.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t0);
    gain.gain.exponentialRampToValueAtTime(0.00001, t0 + duration);

    osc.start(t0);
    osc.stop(t0 + duration);
  }
}
