/**
 * GLADcast broadcast graphics — the television character-generator layer.
 *
 * Everything here draws in 2D over the GL program frame on the program
 * canvas, so it is captured by recordings and the pop-out output. Each
 * element is independently toggleable and preset-addressable.
 */

const MONO = '600 %spx "IBM Plex Mono", ui-monospace, monospace';
const SERIF = '400 %spx "Instrument Serif", Georgia, serif';
const SANS = '600 %spx "Outfit", system-ui, sans-serif';

const RED = '#DC2626';
const MIDNIGHT = 'rgba(15, 21, 32, 0.88)';
const FG = '#E8ECF1';

function font(tpl, px) {
  return tpl.replace('%s', String(Math.round(px)));
}

export class BroadcastLayer {
  constructor() {
    this.state = {
      clock: false,
      bug: true,
      bugText: 'GLAD 26',
      channelId: '26.1',
      channelName: 'COMMUNITY',
      showChannelId: false,
      lowerThird: null,      // { title, subtitle, shownAt }
      crawlText: '',
      crawlSpeed: 90,        // px/s
      crawlOffset: 0,
      alert: null,           // { level: 'advisory'|'warning'|'emergency', title, body, shownAt }
      slate: null,           // 'technical' | 'legal' | 'standby' | null
      legalLine1: 'GLADCAST — GREATER LOS ANGELES AGENCY ON DEAFNESS',
      legalLine2: 'EAGLE ROCK · LOS ANGELES · CH 26 MULTIPLEX',
    };
    this._lastTs = 0;
  }

  /** Draw all active elements. w/h are program pixel dimensions. */
  draw(ctx2d, w, h, timeSec) {
    const s = this.state;
    const dt = this._lastTs ? Math.min(0.1, timeSec - this._lastTs) : 0;
    this._lastTs = timeSec;
    const unit = h / 720; // scale relative to 720p design

    if (s.slate) { this.drawSlate(ctx2d, w, h, unit, timeSec); return; }

    if (s.alert) this.drawAlert(ctx2d, w, h, unit, timeSec);
    if (s.lowerThird) this.drawLowerThird(ctx2d, w, h, unit, timeSec);
    if (s.crawlText) this.drawCrawl(ctx2d, w, h, unit, dt);
    if (s.clock) this.drawClock(ctx2d, w, h, unit);
    if (s.bug) this.drawBug(ctx2d, w, h, unit);
    if (s.showChannelId) this.drawChannelId(ctx2d, w, h, unit, timeSec);
  }

  drawBug(c, w, h, u) {
    const pad = 42 * u;
    c.save();
    c.globalAlpha = 0.8;
    c.font = font(MONO, 20 * u);
    c.textBaseline = 'top';
    const tw = c.measureText(this.state.bugText).width;
    c.fillStyle = 'rgba(15,21,32,0.5)';
    c.fillRect(w - pad - tw - 16 * u, pad - 6 * u, tw + 16 * u, 32 * u);
    c.fillStyle = FG;
    c.fillText(this.state.bugText, w - pad - tw - 8 * u, pad);
    c.fillStyle = RED;
    c.fillRect(w - pad - tw - 16 * u, pad + 26 * u, tw + 16 * u, 3 * u);
    c.restore();
  }

  drawClock(c, w, h, u) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const pad = 42 * u;
    c.save();
    c.font = font(MONO, 26 * u);
    c.textBaseline = 'top';
    const text = `${hh}:${mm}:${ss}`;
    const tw = c.measureText(text).width;
    c.fillStyle = 'rgba(15,21,32,0.6)';
    c.fillRect(pad - 10 * u, pad - 8 * u, tw + 20 * u, 42 * u);
    c.fillStyle = FG;
    c.fillText(text, pad, pad);
    c.fillStyle = RED;
    c.fillRect(pad - 10 * u, pad + 30 * u, tw + 20 * u, 3 * u);
    c.restore();
  }

  drawChannelId(c, w, h, u, t) {
    c.save();
    const pulse = 0.75 + 0.25 * Math.sin(t * 2);
    c.font = font(SERIF, 64 * u);
    c.textBaseline = 'top';
    c.fillStyle = `rgba(232,236,241,${pulse})`;
    c.fillText(this.state.channelId, 48 * u, h - 150 * u);
    c.font = font(MONO, 20 * u);
    c.fillStyle = RED;
    c.fillText(this.state.channelName, 50 * u, h - 76 * u);
    c.restore();
  }

  drawLowerThird(c, w, h, u, t) {
    const lt = this.state.lowerThird;
    const age = t - lt.shownAt;
    const slide = Math.min(1, age * 3); // 0.33s slide-in
    const ease = 1 - Math.pow(1 - slide, 3);
    const bw = Math.min(w * 0.62, 760 * u);
    const x = -bw + bw * ease + 64 * u * ease;
    const y = h - 168 * u;
    c.save();
    c.fillStyle = MIDNIGHT;
    c.fillRect(x, y, bw, 96 * u);
    c.fillStyle = RED;
    c.fillRect(x, y, 6 * u, 96 * u);
    c.fillStyle = FG;
    c.font = font(SERIF, 38 * u);
    c.textBaseline = 'top';
    c.fillText(lt.title, x + 26 * u, y + 12 * u, bw - 40 * u);
    if (lt.subtitle) {
      c.font = font(MONO, 18 * u);
      c.fillStyle = 'rgba(232,236,241,0.75)';
      c.fillText(lt.subtitle.toUpperCase(), x + 27 * u, y + 62 * u, bw - 40 * u);
    }
    c.restore();
  }

  drawCrawl(c, w, h, u, dt) {
    const s = this.state;
    c.save();
    const bandH = 52 * u;
    const y = h - bandH;
    c.fillStyle = 'rgba(15,21,32,0.92)';
    c.fillRect(0, y, w, bandH);
    c.fillStyle = RED;
    c.fillRect(0, y, w, 3 * u);
    c.font = font(MONO, 24 * u);
    c.textBaseline = 'middle';
    c.fillStyle = FG;
    const text = `${s.crawlText}   •   `;
    const tw = Math.max(1, c.measureText(text).width);
    s.crawlOffset = (s.crawlOffset + s.crawlSpeed * u * dt) % tw;
    for (let x = -s.crawlOffset; x < w; x += tw) {
      c.fillText(text, x, y + bandH / 2 + 2 * u);
    }
    c.restore();
  }

  drawAlert(c, w, h, u, t) {
    const a = this.state.alert;
    const colors = {
      advisory: '#B45309',
      warning: '#C2410C',
      emergency: RED,
    };
    const color = colors[a.level] || RED;
    const flash = a.level === 'emergency' ? 0.85 + 0.15 * Math.sin(t * 6) : 1;
    c.save();
    // top banner
    const bh = 74 * u;
    c.globalAlpha = flash;
    c.fillStyle = color;
    c.fillRect(0, 0, w, bh);
    c.globalAlpha = 1;
    c.fillStyle = '#FFFFFF';
    c.font = font(SANS, 30 * u);
    c.textBaseline = 'middle';
    const label = a.level === 'emergency' ? '⚠ EMERGENCY ALERT' : a.level === 'warning' ? '⚠ WARNING' : 'ADVISORY';
    c.fillText(label, 42 * u, bh / 2);
    c.font = font(MONO, 22 * u);
    const lw = c.measureText(label).width;
    c.fillText(a.title.toUpperCase(), 42 * u + lw + 220 * u, bh / 2, w - lw - 320 * u);
    // body band (kept clear of the caption safe area)
    if (a.body) {
      c.fillStyle = 'rgba(15,21,32,0.92)';
      c.fillRect(0, bh, w, 46 * u);
      c.fillStyle = FG;
      c.font = font(MONO, 20 * u);
      c.fillText(a.body, 42 * u, bh + 24 * u, w - 84 * u);
    }
    c.restore();
  }

  drawSlate(c, w, h, u, t) {
    const s = this.state;
    c.save();
    c.fillStyle = '#0F1520';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    if (s.slate === 'technical') {
      // vintage TD card: bars strip + message
      const bars = ['#BFBFBF', '#BFBF00', '#00BFBF', '#00BF00', '#BF00BF', '#BF0000', '#0000BF'];
      const bw = w / bars.length;
      bars.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * bw, 0, bw + 1, h * 0.18); });
      c.fillStyle = FG;
      c.font = font(SERIF, 72 * u);
      c.fillText('Technical Difficulties', w / 2, h * 0.48);
      c.font = font(MONO, 24 * u);
      c.fillStyle = 'rgba(232,236,241,0.7)';
      c.fillText('PLEASE STAND BY — GLADCAST WILL RETURN', w / 2, h * 0.6);
      c.fillStyle = RED;
      c.fillRect(w * 0.35, h * 0.53, w * 0.3, 3 * u);
    } else if (s.slate === 'legal') {
      c.fillStyle = FG;
      c.font = font(SERIF, 56 * u);
      c.fillText('GLADcast', w / 2, h * 0.42);
      c.font = font(MONO, 22 * u);
      c.fillStyle = 'rgba(232,236,241,0.85)';
      c.fillText(s.legalLine1, w / 2, h * 0.54);
      c.fillText(s.legalLine2, w / 2, h * 0.6);
      const now = new Date();
      c.fillStyle = RED;
      c.font = font(MONO, 20 * u);
      c.fillText(now.toLocaleString(), w / 2, h * 0.68);
    } else if (s.slate === 'standby') {
      const blink = Math.floor(t * 1.5) % 2 === 0;
      c.fillStyle = FG;
      c.font = font(SERIF, 64 * u);
      c.fillText('Please Stand By', w / 2, h * 0.5);
      if (blink) {
        c.fillStyle = RED;
        c.font = font(MONO, 24 * u);
        c.fillText('● SIGNAL ACQUISITION IN PROGRESS', w / 2, h * 0.62);
      }
    }
    c.restore();
  }
}

/** Safe-area guides — UI-only overlay, never part of the recorded program. */
export function drawSafeAreas(c, w, h, { broadcastSafe, captionSafe }) {
  c.save();
  c.lineWidth = 1;
  if (broadcastSafe) {
    c.strokeStyle = 'rgba(232,236,241,0.5)';
    c.setLineDash([6, 4]);
    c.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);   // action safe
    c.strokeStyle = 'rgba(220,38,38,0.6)';
    c.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);      // title safe
  }
  if (captionSafe) {
    c.setLineDash([]);
    c.strokeStyle = 'rgba(96,165,250,0.7)';
    c.strokeRect(w * 0.1, h * 0.72, w * 0.8, h * 0.2);     // caption zone
    c.fillStyle = 'rgba(96,165,250,0.7)';
    c.font = `${Math.round(h * 0.016)}px "IBM Plex Mono", monospace`;
    c.fillText('CAPTION SAFE', w * 0.1 + 6, h * 0.72 - 6);
  }
  c.restore();
}
