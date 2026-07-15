/**
 * GLADcast caption engine.
 *
 * Captions are a first-class visual signal: they render, they modulate
 * (caption.len / caption.pulse mod sources), and they can trigger scene
 * changes. Two presentations:
 *
 *   broadcast  — pinned, banded, maximally readable (708-style)
 *   expressive — words fly through space, emphasis scales key terms
 *
 * captionSafe forces broadcast presentation and overrides every aesthetic
 * treatment. Readability always wins over style.
 */

const RED = '#DC2626';
const FG = '#E8ECF1';

export class CaptionEngine {
  constructor() {
    this.mode = 'broadcast';       // 'broadcast' | 'expressive'
    this.captionSafe = true;       // hard override → broadcast presentation
    this.current = null;           // { text, words, shownAt, emphasis:Set<int> }
    this.queue = [];
    this.holdSec = 5;
    this.pulse = 0;                // spikes to 1 when a caption lands (mod source)
    this.len = 0;                  // normalized current caption length (mod source)
    this.onCue = null;             // scene-change hook for [cue] markers
  }

  /**
   * Show a caption now. `*word*` marks emphasis (names, key terms);
   * a leading [cue:name] fires onCue and is stripped.
   */
  show(text, timeSec) {
    const cue = /^\[cue:([\w-]+)\]\s*/.exec(text);
    if (cue) {
      this.onCue?.(cue[1]);
      text = text.slice(cue[0].length);
    }
    if (!text.trim()) return;
    this.raw = text;
    this.seq = (this.seq || 0) + 1;
    const words = [];
    const emphasis = new Set();
    text.split(/\s+/).forEach((w) => {
      if (/^\*.+\*$/.test(w)) { emphasis.add(words.length); words.push(w.slice(1, -1)); }
      else words.push(w);
    });
    this.current = { text: words.join(' '), words, emphasis, shownAt: timeSec };
    this.pulse = 1;
    this.len = Math.min(1, words.join(' ').length / 80);
  }

  enqueue(text) { this.queue.push(text); }

  tick(dt, timeSec) {
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    if (this.current && timeSec - this.current.shownAt > this.holdSec) {
      this.current = null;
      this.len = 0;
    }
    if (!this.current && this.queue.length) this.show(this.queue.shift(), timeSec);
  }

  draw(c, w, h, timeSec) {
    if (!this.current) return;
    const effective = this.captionSafe ? 'broadcast' : this.mode;
    if (effective === 'broadcast') this.drawBroadcast(c, w, h, timeSec);
    else this.drawExpressive(c, w, h, timeSec);
  }

  drawBroadcast(c, w, h, timeSec) {
    const cap = this.current;
    const u = h / 720;
    const size = 30 * u;
    c.save();
    c.font = `600 ${Math.round(size)}px "Outfit", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // wrap into lines that fit the caption-safe width
    const maxW = w * 0.76;
    const lines = [];
    let line = '';
    for (const word of cap.words) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);

    const lineH = size * 1.35;
    const baseY = h * 0.82 - (lines.length - 1) * lineH;
    let wordIdx = 0;
    lines.forEach((ln, li) => {
      const y = baseY + li * lineH;
      const lw = c.measureText(ln).width;
      c.fillStyle = 'rgba(10, 14, 22, 0.85)';
      c.fillRect(w / 2 - lw / 2 - 14 * u, y - lineH / 2, lw + 28 * u, lineH);
      // per-word so emphasis can tint without breaking the band
      let x = w / 2 - lw / 2;
      c.textAlign = 'left';
      for (const word of ln.split(' ')) {
        const emph = cap.emphasis.has(wordIdx);
        c.fillStyle = emph ? RED : FG;
        c.fillText(word, x, y);
        x += c.measureText(word + ' ').width;
        wordIdx++;
      }
      c.textAlign = 'center';
    });
    c.restore();
  }

  drawExpressive(c, w, h, timeSec) {
    const cap = this.current;
    const u = h / 720;
    const age = timeSec - cap.shownAt;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const n = cap.words.length;
    cap.words.forEach((word, i) => {
      const emph = cap.emphasis.has(i);
      const settle = Math.min(1, Math.max(0, age * 2.2 - i * 0.12));
      const ease = 1 - Math.pow(1 - settle, 3);
      // words fly in from a spatial scatter, settle into a readable arc
      const seed = (i * 127.3) % 1;
      const fromX = w * seed;
      const fromY = h * ((i * 61.7) % 1) * 0.5;
      const arcX = w * (0.5 + (i - (n - 1) / 2) / Math.max(6, n) * 0.85);
      const arcY = h * (0.62 + Math.sin((i / Math.max(1, n - 1)) * Math.PI) * -0.08);
      const x = fromX + (arcX - fromX) * ease;
      const y = fromY + (arcY - fromY) * ease;
      const size = (emph ? 46 : 32) * u * (0.6 + 0.4 * ease + this.pulse * 0.2);
      c.font = `${emph ? 700 : 500} ${Math.round(size)}px "Outfit", system-ui, sans-serif`;
      c.globalAlpha = Math.min(1, settle * 2);
      // depth shadow makes flight readable against any generator
      c.fillStyle = 'rgba(10,14,22,0.9)';
      c.fillText(word, x + 2 * u, y + 2 * u);
      c.fillStyle = emph ? RED : FG;
      c.fillText(word, x, y);
    });
    c.restore();
  }
}
