/**
 * GLADcast ↔ RoomDO sync client.
 *
 * Speaks the SF26-proven ops protocol: commands POST to /api/ops/command
 * (operator-gated), authoritative state fans out over /api/ops/ws. The
 * instrument's whole performable surface travels as one opaque `visual`
 * payload via SET_VISUAL — same doctrine as SF26's `cobo` slice, so the
 * spine never needs to know the instrument's schema.
 *
 * Console role: publishes the visual snapshot (throttled, change-only).
 * Output role: subscribes and applies. Both see the same RoomState, so any
 * number of outputs stay in lockstep with one operator — or several.
 */

export class OpsSync {
  constructor() {
    this.room = 'main-hall';
    this.connected = false;
    this.onState = null;    // (roomState) => void
    this.onStatus = null;   // (statusString) => void
    this._closed = false;
    this._retryMs = 500;
    this._lastSent = '';
  }

  connect(room) {
    this.room = room || 'main-hall';
    this._closed = false;
    this._open();
  }

  _open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/ops/ws?room=${encodeURIComponent(this.room)}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleRetry();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this._retryMs = 500;
      this.onStatus?.(`SYNC ● ${this.room}`);
    };
    this.ws.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      // STATE_PATCH carries the latest full room state (authoritative update);
      // STATE_SNAPSHOT arrives on connect.
      if (event.type === 'STATE_SNAPSHOT' && event.state) this.onState?.(event.state);
      else if (event.type === 'STATE_PATCH' && event.patch) this.onState?.(event.patch);
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (!this._closed) {
        this.onStatus?.('SYNC ○ reconnecting…');
        this._scheduleRetry();
      }
    };
    this.ws.onerror = () => { try { this.ws.close(); } catch { /* already closing */ } };
  }

  _scheduleRetry() {
    setTimeout(() => { if (!this._closed) this._open(); }, this._retryMs);
    this._retryMs = Math.min(8000, this._retryMs * 2);
  }

  close() {
    this._closed = true;
    this.connected = false;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.onStatus?.('SYNC OFF');
  }

  /** Send one ops command body (type + payload); base fields are stamped here. */
  async send(body) {
    const command = { ...body, commandId: crypto.randomUUID(), issuedAt: new Date().toISOString() };
    try {
      const res = await fetch('/api/ops/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId: this.room, command }),
      });
      if (res.status === 401) this.onStatus?.('SYNC ⚠ unauthorized (operator gate)');
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Publish the visual payload if it changed since the last send. */
  async publishVisual(visual) {
    const json = JSON.stringify(visual);
    if (json === this._lastSent) return;
    this._lastSent = json;
    await this.send({ type: 'SET_VISUAL', visual });
  }
}

/**
 * Serialize the instrument's performable surface into the SET_VISUAL payload.
 * Everything is plain JSON; timing fields (shownAt, crawlOffset) are stripped
 * and re-stamped by the receiver so clocks never need to agree.
 */
export function collectVisual({ state, overlay, captions, mod }) {
  const o = overlay.state;
  return {
    v: 1,
    A: { gen: state.A.gen.id, params: { ...state.A.params } },
    B: { gen: state.B.gen.id, params: { ...state.B.params } },
    mix: { ...state.mix },
    fx: { ...state.fx },
    xy: { ...state.xy },
    bpm: mod.bpm,
    routes: mod.routes.map((r) => [r.source, r.target, r.amount]),
    overlay: {
      clock: o.clock,
      bug: o.bug,
      bugText: o.bugText,
      channelId: o.channelId,
      channelName: o.channelName,
      showChannelId: o.showChannelId,
      lowerThird: o.lowerThird ? { title: o.lowerThird.title, subtitle: o.lowerThird.subtitle } : null,
      crawlText: o.crawlText,
      alert: o.alert ? { level: o.alert.level, title: o.alert.title, body: o.alert.body } : null,
      slate: o.slate,
    },
    caption: captions.raw ? { raw: captions.raw, seq: captions.seq } : null,
    captionSafe: captions.captionSafe,
    captionMode: captions.mode,
  };
}
