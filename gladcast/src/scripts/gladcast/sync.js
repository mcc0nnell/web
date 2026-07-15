/**
 * GLADcast ↔ RoomDO sync client.
 *
 * Speaks the SF26-proven ops protocol: commands POST to /api/ops/command
 * (operator-gated), authoritative state fans out over the read-only
 * /api/ops/ws socket. Traffic is split by frequency:
 *
 *   low    SET_VISUAL / SET_TRANSPORT / SET_MEDIA_SOURCE / SET_OUTPUT_FORMAT
 *          — authoritative state, change-only
 *   medium SET_CONTROL_SIGNALS — live performance inputs, ≤10 Hz,
 *          material-change-only, ephemeral in the DO
 *   events TAKE_VISUAL / TRIGGER_ENVELOPE / EMERGENCY_OVERRIDE — stamped
 *          with the transport position they apply at
 *
 * High-frequency rendering never crosses the network: receivers derive
 * animation locally from the shared transport clock.
 */

import { ServerClock } from './transport.js';

export class OpsSync {
  constructor() {
    this.room = 'main-hall';
    this.connected = false;
    this.onState = null;      // (roomState) => void
    this.onStatus = null;     // (statusString, kind) => void
    this.onConnected = null;  // () => void — fires on every (re)connect
    this.clock = new ServerClock();
    this.reconnects = 0;
    this.lastRevision = -1;
    this.unauthorized = false;
    this._closed = true;
    this._retryMs = 500;
    this._lastSent = new Map(); // command type → last JSON payload
  }

  /** Server wall-clock "now" in ms — the shared time base for transport. */
  serverNow() {
    return this.clock.now();
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
      this.onStatus?.(`SYNC ● ${this.room}`, 'connected');
      this.onConnected?.();
    };
    this.ws.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      if (event.sentAt) this.clock.observe(event.sentAt);
      // STATE_PATCH carries the latest full room state (authoritative
      // update); STATE_SNAPSHOT arrives on connect. Staleness is judged
      // per-slice by consumers (visual.revision, transport.sequence,
      // controls.sequence, emergency.seq): the room-level revision is NOT
      // a reliable gate because ephemeral control commands advance it
      // in-memory without persisting — a rehydrated DO legitimately
      // resumes from a lower number.
      const state = event.type === 'STATE_SNAPSHOT' ? event.state : event.type === 'STATE_PATCH' ? event.patch : null;
      if (!state) return;
      this.lastRevision = state.revision ?? this.lastRevision;
      this.onState?.(state);
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (!this._closed) {
        this.reconnects++;
        this.onStatus?.('SYNC ○ reconnecting…', 'reconnecting');
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
    this._lastSent.clear();
    this.onStatus?.('SYNC OFF', 'off');
  }

  /** Send one ops command body (type + payload); base fields stamped here. */
  async send(body) {
    const command = { ...body, commandId: crypto.randomUUID(), issuedAt: new Date().toISOString() };
    try {
      const res = await fetch('/api/ops/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId: this.room, command }),
      });
      if (res.status === 401) {
        this.unauthorized = true;
        this.onStatus?.('SYNC ⚠ unauthorized (operator gate)', 'unauthorized');
      } else {
        this.unauthorized = false;
      }
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Change-only publish: skips the wire when the payload didn't move. */
  async publishIfChanged(type, key, payload) {
    const json = JSON.stringify(payload);
    if (this._lastSent.get(type) === json) return true;
    this._lastSent.set(type, json);
    return this.send({ type, [key]: payload });
  }

  publishVisual(visual) { return this.publishIfChanged('SET_VISUAL', 'visual', visual); }
  publishTransport(transport) { return this.publishIfChanged('SET_TRANSPORT', 'transport', transport); }
  publishMedia(media) { return this.publishIfChanged('SET_MEDIA_SOURCE', 'media', media); }
  publishFormat(output) { return this.publishIfChanged('SET_OUTPUT_FORMAT', 'output', output); }
  publishControls(controls) { return this.send({ type: 'SET_CONTROL_SIGNALS', controls }); }

  takeVisual(visual, at) {
    // TAKE also carries the freshest visual, so keep the dedupe cache honest.
    this._lastSent.set('SET_VISUAL', JSON.stringify(visual));
    return this.send({ type: 'TAKE_VISUAL', visual, at });
  }
  triggerEnvelope(at) { return this.send({ type: 'TRIGGER_ENVELOPE', at }); }
  emergencyOverride(emergency) { return this.send({ type: 'EMERGENCY_OVERRIDE', emergency }); }
}

/**
 * Serialize the instrument's performable surface as a version-2 visual
 * payload. Plain JSON; animated timing fields (crawl offset, shownAt) are
 * omitted — receivers re-derive them from transport time.
 */
export function collectVisual({ state, overlay, captions, mod, revision }) {
  const o = overlay.state;
  return {
    version: 2,
    decks: {
      A: { gen: state.A.gen.id, params: { ...state.A.params } },
      B: { gen: state.B.gen.id, params: { ...state.B.params } },
    },
    mix: { ...state.mix },
    effects: { ...state.fx },
    xy: { ...state.xy },
    modulation: {
      lfos: mod.lfos.map((l) => ({ rate: l.rate, shape: l.shape, sync: l.sync })),
      seq: { steps: [...mod.seq.steps], probability: mod.seq.probability },
    },
    routes: mod.routes.map((r) => [r.source, r.target, r.amount]),
    overlays: {
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
    captions: {
      raw: captions.raw || '',
      seq: captions.seq || 0,
      safe: captions.captionSafe,
      mode: captions.mode,
    },
    revision,
  };
}
