/**
 * GLADcast — real-time demoscene visual synthesizer for live Deaf broadcasting.
 *
 * GLADcast does not play a video. GLADcast plays the broadcast system itself.
 *
 * This module owns application state, the render loop, and the single-screen
 * performance console. Signal chain:
 *   Sources → Generators → Effects → Compositor → Broadcast Output
 */

import { Engine } from './engine.js';
import { GENERATORS, GENERATOR_MAP } from './generators.js';
import { BroadcastLayer, drawSafeAreas } from './broadcast.js';
import { ModEngine, MOD_SOURCES, MOD_TARGETS, LFO_SHAPES } from './modulation.js';
import { AudioInput, MidiInput, OscInput, MotionInput } from './inputs.js';
import { CaptionEngine } from './captions.js';
import { CHANNELS, SIGNATURE_PRESETS, loadUserPresets, saveUserPresets } from './presets.js';
import { OutputManager, ASPECTS } from './output.js';
import { el, section, button, select, slider, knob, xyPad, crossfader, meter } from './ui.js';
import { OpsSync, collectVisual } from './sync.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function boot(root) {
  // ------------------------------------------------------------ state ----
  const engine = new Engine(1280, 720);
  const overlay = new BroadcastLayer();
  const captions = new CaptionEngine();
  const mod = new ModEngine();
  const audio = new AudioInput();
  const midi = new MidiInput();
  const osc = new OscInput();
  const motion = new MotionInput();

  const mkDeck = (genId) => {
    const gen = GENERATOR_MAP[genId];
    return { gen, params: { mode: 0, intensity: 0.8, ...gen.defaults } };
  };
  const state = {
    A: mkDeck('signalacq'),          // PROGRAM deck
    B: mkDeck('plasma'),             // PREVIEW deck
    mix: { xfade: 0, blend: 0 },
    fx: { trails: 0, pixelate: 0, posterize: 0, crt: 0, invert: 0, freeze: 0 },
    xy: { x: 0.5, y: 0.5 },
    emergencyLevel: 0,
    safe: { broadcastSafe: false, captionSafe: false },
    pending: null,                   // overlay/fx/routes/caption staged for TAKE
    presetRoutes: [],                // routes owned by the current program preset
    activeChannel: '26.8',
  };

  // --------------------------------------------------------- monitors ----
  root.textContent = '';
  const app = el('div', 'gc-app');
  root.appendChild(app);

  const header = el('header', 'gc-header');
  app.appendChild(header);
  const brand = el('div', 'gc-brand');
  brand.innerHTML = '<span class="gc-brand-name">GLADcast</span><span class="gc-brand-sub">EAGLE ROCK · CH 26 MULTIPLEX</span>';
  header.appendChild(brand);
  const statusWrap = el('div', 'gc-status');
  const onAir = el('span', 'gc-onair', '● ON AIR');
  const resInd = el('span', 'gc-ind', '1280×720');
  const fpsInd = el('span', 'gc-ind', '-- fps');
  const gpuInd = el('span', 'gc-ind', 'GPU -- ms');
  statusWrap.append(onAir, resInd, fpsInd, gpuInd);
  header.appendChild(statusWrap);
  const headerBtns = el('div', 'gc-header-btns');
  header.appendChild(headerBtns);

  const monitors = el('div', 'gc-monitors');
  app.appendChild(monitors);

  const pgmWrap = el('div', 'gc-monitor gc-monitor-pgm');
  pgmWrap.appendChild(el('div', 'gc-monitor-tag gc-tag-pgm', 'PROGRAM'));
  const programCanvas = el('canvas', 'gc-canvas');
  programCanvas.width = 1280; programCanvas.height = 720;
  const safeCanvas = el('canvas', 'gc-canvas gc-safe-canvas');
  safeCanvas.width = 1280; safeCanvas.height = 720;
  pgmWrap.append(programCanvas, safeCanvas);
  monitors.appendChild(pgmWrap);

  const rightStack = el('div', 'gc-monitor-side');
  const pvwWrap = el('div', 'gc-monitor gc-monitor-pvw');
  pvwWrap.appendChild(el('div', 'gc-monitor-tag gc-tag-pvw', 'PREVIEW'));
  const previewCanvas = el('canvas', 'gc-canvas');
  previewCanvas.width = 640; previewCanvas.height = 360;
  pvwWrap.appendChild(previewCanvas);
  rightStack.appendChild(pvwWrap);

  const transport = el('div', 'gc-transport');
  const takeBtn = button('TAKE', 'gc-take', () => take());
  const cutBtn = button('CUT', 'gc-cut', () => { state.mix.xfade = 0; xfader.set(0); take(); });
  const xfader = crossfader((v) => { state.mix.xfade = v; });
  const blendSel = select(
    [{ value: '0', label: 'MIX' }, { value: '1', label: 'ADD' }, { value: '2', label: 'MULT' }, { value: '3', label: 'SCREEN' }],
    (v) => { state.mix.blend = Number(v); }
  );
  transport.append(takeBtn, cutBtn, xfader, blendSel);
  rightStack.appendChild(transport);
  monitors.appendChild(rightStack);

  // ---- RoomDO sync: this console performs; /output/[room] mirrors ----
  const sync = new OpsSync();
  const syncRoom = new URLSearchParams(location.search).get('room') || 'main-hall';

  const programCtx = programCanvas.getContext('2d');
  const previewCtx = previewCanvas.getContext('2d');
  const safeCtx = safeCanvas.getContext('2d');
  const output = new OutputManager(programCanvas);

  // ------------------------------------------------ channel multiplex ----
  const chPanel = section('CHANNELS — GLAD 26 MULTIPLEX', 'gc-channels-panel');
  const chRow = el('div', 'gc-channels');
  const chButtons = new Map();
  for (const ch of CHANNELS) {
    const b = el('button', 'gc-channel');
    b.type = 'button';
    b.innerHTML = `<span class="gc-ch-num">${ch.id}</span><span class="gc-ch-name">${ch.name}</span>`;
    b.title = ch.brief;
    b.addEventListener('click', () => selectChannel(ch.id));
    chButtons.set(ch.id, b);
    chRow.appendChild(b);
  }
  chPanel.appendChild(chRow);
  const chPresetRow = el('div', 'gc-ch-presets');
  chPanel.appendChild(chPresetRow);
  app.appendChild(chPanel);

  function selectChannel(id, presetIdx = 0) {
    state.activeChannel = id;
    for (const [cid, b] of chButtons) b.classList.toggle('active', cid === id);
    const ch = CHANNELS.find((c) => c.id === id);
    chPresetRow.textContent = '';
    ch.presets.forEach((p, i) => {
      const b = button(p.name, 'gc-preset-btn' + (i === presetIdx ? ' active' : ''), () => selectChannel(id, i));
      chPresetRow.appendChild(b);
    });
    loadPresetToPreview(ch.presets[presetIdx], ch);
  }

  // ------------------------------------------------------------ decks ----
  const decksWrap = el('div', 'gc-decks');
  app.appendChild(decksWrap);

  function buildDeckPanel(key) {
    const deck = state[key];
    const panel = section(key === 'A' ? 'DECK A — PROGRAM' : 'DECK B — PREVIEW', `gc-deck gc-deck-${key.toLowerCase()}`);
    const row1 = el('div', 'gc-row');
    const genSel = select(GENERATORS.map((g) => ({ value: g.id, label: g.name })), (id) => setGenerator(key, id), deck.gen.id);
    const modeBtn = button('BROADCAST', 'gc-mode', () => {
      deck.params.mode = deck.params.mode ? 0 : 1;
      paintMode();
    });
    const paintMode = () => {
      modeBtn.textContent = deck.params.mode ? 'DEMOSCENE' : 'BROADCAST';
      modeBtn.classList.toggle('demo', !!deck.params.mode);
    };
    row1.append(genSel, modeBtn);
    panel.appendChild(row1);

    const knobRow = el('div', 'gc-knob-row');
    const knobs = [];
    for (let i = 0; i < 4; i++) {
      const pk = `p${i + 1}`;
      const k = knob(deck.gen.params[i], deck.params[pk], (v) => { deck.params[pk] = v; },
        (done) => armMidiLearn(`${key}.${pk}`, (v) => { deck.params[pk] = v; k.set(v); }, done));
      knobs.push(k);
      knobRow.appendChild(k);
    }
    const intK = knob('Intensity', deck.params.intensity, (v) => { deck.params.intensity = v; },
      (done) => armMidiLearn(`${key}.intensity`, (v) => { deck.params.intensity = v; intK.set(v); }, done));
    knobRow.appendChild(intK);
    panel.appendChild(knobRow);
    decksWrap.appendChild(panel);
    return { genSel, knobs, intK, paintMode };
  }

  function armMidiLearn(label, apply, done) {
    if (!midi.enabled) { flash('Enable MIDI first (INPUTS panel)'); done(); return; }
    flash(`MIDI LEARN — move a controller for ${label}`);
    midi.learn(label, apply, (cc) => { flash(`${label} ← CC ${cc}`); done(); });
  }

  const deckUI = { A: buildDeckPanel('A'), B: buildDeckPanel('B') };

  function setGenerator(key, id, params) {
    const gen = GENERATOR_MAP[id];
    const deck = state[key];
    deck.gen = gen;
    const mode = params?.mode ?? deck.params.mode;
    deck.params = { mode, intensity: params?.intensity ?? deck.params.intensity, ...gen.defaults };
    for (const pk of ['p1', 'p2', 'p3', 'p4']) {
      if (params && params[pk] != null) deck.params[pk] = params[pk];
    }
    const ui = deckUI[key];
    ui.genSel.value = id;
    ui.knobs.forEach((k, i) => { k.setLabel(gen.params[i]); k.set(deck.params[`p${i + 1}`]); });
    ui.intK.set(deck.params.intensity);
    ui.paintMode();
  }

  // ------------------------------------------------------ preset flow ----
  function loadPresetToPreview(preset, channel) {
    setGenerator('B', preset.gen, preset);
    state.pending = {
      overlay: { ...preset.overlay },
      fx: { ...preset.fx },
      routes: preset.routes || [],
      caption: preset.caption,
      channel: channel ? { id: channel.id, name: channel.name } : null,
      name: preset.name,
    };
    flash(`PREVIEW ← ${preset.name}`);
  }

  function take() {
    // preview becomes program
    state.A = { gen: state.B.gen, params: { ...state.B.params } };
    setGenerator('A', state.B.gen.id, state.B.params);
    state.mix.xfade = 0;
    xfader.set(0);
    const p = state.pending;
    if (p) {
      Object.assign(state.fx, p.fx, { freeze: 0 });
      paintFx();
      if (p.overlay) {
        const o = p.overlay;
        if ('clock' in o) overlay.state.clock = o.clock;
        if (o.bugText) { overlay.state.bug = true; overlay.state.bugText = o.bugText; }
        overlay.state.crawlText = o.crawlText || '';
        overlay.state.lowerThird = o.lowerThird ? { ...o.lowerThird, shownAt: nowSec() } : null;
        overlay.state.alert = o.alert ? { ...o.alert, shownAt: nowSec() } : null;
        overlay.state.slate = o.slate ?? null;
      }
      if (p.channel) {
        overlay.state.channelId = p.channel.id;
        overlay.state.channelName = p.channel.name;
      }
      for (const r of state.presetRoutes) mod.removeRoute(r);
      state.presetRoutes = [];
      for (const [src, tgt, amt] of p.routes) {
        if (!MOD_SOURCES.includes(src) || !MOD_TARGETS.includes(tgt)) continue;
        state.presetRoutes.push(mod.addRoute(src, tgt, amt));
      }
      paintRoutes();
      if (p.caption) captions.show(p.caption, nowSec());
      flash(`TAKE — ${p.name || state.A.gen.name} to PROGRAM`);
    }
    mod.env.trigger();
  }

  // ------------------------------------------------- XY + FX + mod UI ----
  const perfWrap = el('div', 'gc-perform');
  app.appendChild(perfWrap);

  const xyPanel = section('XY PAD', 'gc-xy-panel');
  const pad = xyPad((x, y) => { state.xy = { x, y }; });
  xyPanel.appendChild(pad);
  perfWrap.appendChild(xyPanel);

  const fxPanel = section('EFFECTS', 'gc-fx-panel');
  const fxSliders = {
    trails: slider('Trails', 0, (v) => { state.fx.trails = v * 0.97; }),
    pixelate: slider('Pixelate', 0, (v) => { state.fx.pixelate = v * 64; }),
    posterize: slider('Posterize', 0, (v) => { state.fx.posterize = v * 10; }),
    crt: slider('CRT', 0, (v) => { state.fx.crt = v; }),
  };
  Object.values(fxSliders).forEach((s) => fxPanel.appendChild(s));
  const fxBtnRow = el('div', 'gc-row');
  const invertBtn = button('INVERT', '', () => { state.fx.invert = state.fx.invert ? 0 : 1; invertBtn.classList.toggle('active', !!state.fx.invert); });
  const freezeBtn = button('FREEZE', '', () => setFreeze(!state.fx.freeze));
  fxBtnRow.append(invertBtn, freezeBtn);
  fxPanel.appendChild(fxBtnRow);
  perfWrap.appendChild(fxPanel);

  function setFreeze(on) {
    state.fx.freeze = on ? 1 : 0;
    freezeBtn.classList.toggle('active', on);
  }
  function paintFx() {
    fxSliders.trails.set(state.fx.trails / 0.97);
    fxSliders.pixelate.set(state.fx.pixelate / 64);
    fxSliders.posterize.set(state.fx.posterize / 10);
    fxSliders.crt.set(state.fx.crt);
    invertBtn.classList.toggle('active', !!state.fx.invert);
    freezeBtn.classList.toggle('active', !!state.fx.freeze);
  }

  const modPanel = section('MODULATION', 'gc-mod-panel');
  const lfoRow = el('div', 'gc-row gc-lfo-row');
  [['LFO1', mod.lfo1], ['LFO2', mod.lfo2], ['LFO3', mod.lfo3]].forEach(([name, lfo]) => {
    const cell = el('div', 'gc-lfo');
    cell.appendChild(el('span', 'gc-lfo-name', name));
    cell.appendChild(select(LFO_SHAPES, (v) => { lfo.shape = v; }, lfo.shape));
    const rate = slider('rate', Math.min(1, lfo.rate / 4), (v) => { lfo.rate = v * 4; });
    cell.appendChild(rate);
    const sync = button('SYNC', 'gc-mini', () => { lfo.sync = !lfo.sync; sync.classList.toggle('active', lfo.sync); });
    cell.appendChild(sync);
    lfoRow.appendChild(cell);
  });
  modPanel.appendChild(lfoRow);

  const bpmRow = el('div', 'gc-row');
  const bpmLabel = el('span', 'gc-ind', `BPM ${mod.bpm}`);
  let taps = [];
  const tapBtn = button('TAP', 'gc-mini', () => {
    const t = performance.now();
    taps = taps.filter((x) => t - x < 3000);
    taps.push(t);
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      mod.bpm = Math.round(Math.max(40, Math.min(220, 60000 / iv)));
      bpmLabel.textContent = `BPM ${mod.bpm}`;
    }
  });
  const seqProb = slider('Seq probability', 1, (v) => { mod.seq.probability = v; });
  bpmRow.append(bpmLabel, tapBtn, seqProb);
  modPanel.appendChild(bpmRow);

  const routeAdd = el('div', 'gc-row');
  const srcSel = select(MOD_SOURCES, () => {});
  const tgtSel = select(MOD_TARGETS, () => {});
  let routeAmt = 0.5;
  const amtSlider = slider('amt', 0.75, (v) => { routeAmt = v * 2 - 1; });
  const routeList = el('div', 'gc-route-list');
  routeAdd.append(srcSel, el('span', 'gc-arrow', '→'), tgtSel, amtSlider,
    button('ROUTE', 'gc-mini', () => { mod.addRoute(srcSel.value, tgtSel.value, routeAmt); paintRoutes(); }));
  modPanel.append(routeAdd, routeList);
  perfWrap.appendChild(modPanel);

  function paintRoutes() {
    routeList.textContent = '';
    for (const r of mod.routes) {
      const row = el('div', 'gc-route');
      row.appendChild(el('span', '', `${r.source} → ${r.target} (${r.amount >= 0 ? '+' : ''}${r.amount.toFixed(2)})`));
      row.appendChild(button('×', 'gc-mini gc-x', () => { mod.removeRoute(r); state.presetRoutes = state.presetRoutes.filter((x) => x !== r); paintRoutes(); }));
      routeList.appendChild(row);
    }
  }

  // -------------------------------------------- captions + CG controls ----
  const lowerWrap = el('div', 'gc-lower');
  app.appendChild(lowerWrap);

  const capPanel = section('CAPTIONS', 'gc-cap-panel');
  const capInput = el('input', 'gc-input');
  capInput.placeholder = 'Type caption… *word* = emphasis, [cue:name] fires a scene';
  capInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && capInput.value.trim()) {
      captions.show(capInput.value, nowSec());
      capInput.value = '';
    }
  });
  const capRow = el('div', 'gc-row');
  const capModeBtn = button('EXPRESSIVE: OFF', '', () => {
    captions.mode = captions.mode === 'broadcast' ? 'expressive' : 'broadcast';
    capModeBtn.textContent = captions.mode === 'expressive' ? 'EXPRESSIVE: ON' : 'EXPRESSIVE: OFF';
    capModeBtn.classList.toggle('active', captions.mode === 'expressive');
  });
  const capSafeBtn = button('CAPTION SAFE: ON', 'active gc-safebtn', () => {
    captions.captionSafe = !captions.captionSafe;
    capSafeBtn.textContent = captions.captionSafe ? 'CAPTION SAFE: ON' : 'CAPTION SAFE: OFF';
    capSafeBtn.classList.toggle('active', captions.captionSafe);
  });
  capRow.append(capModeBtn, capSafeBtn);
  capPanel.append(capInput, capRow);
  lowerWrap.appendChild(capPanel);

  captions.onCue = (name) => {
    const p = SIGNATURE_PRESETS.find((x) => x.name.toLowerCase().replace(/\s+/g, '-').includes(name.toLowerCase()));
    if (p) { loadPresetToPreview(p, null); take(); }
  };

  const cgPanel = section('CHARACTER GENERATOR', 'gc-cg-panel');
  const cgRow1 = el('div', 'gc-row');
  const clockBtn = button('CLOCK', '', () => { overlay.state.clock = !overlay.state.clock; clockBtn.classList.toggle('active', overlay.state.clock); });
  const bugBtn = button('BUG', 'active', () => { overlay.state.bug = !overlay.state.bug; bugBtn.classList.toggle('active', overlay.state.bug); });
  const idBtn = button('CH ID', '', () => { overlay.state.showChannelId = !overlay.state.showChannelId; idBtn.classList.toggle('active', overlay.state.showChannelId); });
  cgRow1.append(clockBtn, bugBtn, idBtn);
  const ltTitle = el('input', 'gc-input'); ltTitle.placeholder = 'Lower third — title';
  const ltSub = el('input', 'gc-input'); ltSub.placeholder = 'Lower third — subtitle';
  const cgRow2 = el('div', 'gc-row');
  cgRow2.append(
    button('SHOW L3', '', () => { if (ltTitle.value) overlay.state.lowerThird = { title: ltTitle.value, subtitle: ltSub.value, shownAt: nowSec() }; }),
    button('CLEAR L3', '', () => { overlay.state.lowerThird = null; })
  );
  const crawlInput = el('input', 'gc-input'); crawlInput.placeholder = 'Crawler text (Enter to run, empty to stop)';
  crawlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') overlay.state.crawlText = crawlInput.value.trim(); });
  const slateSel = select(
    [{ value: '', label: 'SLATE: NONE' }, { value: 'legal', label: 'SLATE: LEGAL ID' }, { value: 'technical', label: 'SLATE: TECH DIFF' }, { value: 'standby', label: 'SLATE: STAND BY' }],
    (v) => { overlay.state.slate = v || null; }
  );
  cgPanel.append(cgRow1, ltTitle, ltSub, cgRow2, crawlInput, slateSel);
  lowerWrap.appendChild(cgPanel);

  // ------------------------------------------------- emergency + inputs ----
  const emPanel = section('EMERGENCY', 'gc-em-panel');
  const emBtn = button('EMERGENCY OVERRIDE', 'gc-emergency', () => emergencyOverride());
  const emClear = button('CLEAR ALERT', '', () => {
    overlay.state.alert = null;
    state.emergencyLevel = 0;
    onAir.classList.remove('emergency');
  });
  const emTitle = el('input', 'gc-input'); emTitle.placeholder = 'Alert headline'; emTitle.value = 'Emergency information follows';
  const emLevel = select(
    [{ value: 'advisory', label: 'ADVISORY' }, { value: 'warning', label: 'WARNING' }, { value: 'emergency', label: 'EMERGENCY' }],
    () => {}, 'emergency'
  );
  emPanel.append(emBtn, emTitle, emLevel, emClear);
  lowerWrap.appendChild(emPanel);

  function emergencyOverride() {
    // Instant, unconditional: 26.2 to PROGRAM, alert banner up, captions safe.
    const ch = CHANNELS.find((c) => c.id === '26.2');
    loadPresetToPreview(ch.presets[0], ch);
    state.pending.overlay.alert = { level: emLevel.value, title: emTitle.value || 'Emergency information follows', body: 'Watch this channel for instructions in ASL and English.', shownAt: 0 };
    take();
    state.emergencyLevel = emLevel.value === 'emergency' ? 1 : emLevel.value === 'warning' ? 0.66 : 0.33;
    captions.captionSafe = true;
    capSafeBtn.textContent = 'CAPTION SAFE: ON';
    capSafeBtn.classList.add('active');
    onAir.classList.add('emergency');
    selectChannel('26.2');
  }

  const inPanel = section('INPUTS & SOURCES', 'gc-in-panel');
  const inRow = el('div', 'gc-row');
  const audioBtn = button('AUDIO', '', async () => { if (await audio.enable()) audioBtn.classList.add('active'); else flash('Microphone unavailable'); });
  const midiBtn = button('MIDI', '', async () => { if (await midi.enable()) { midiBtn.classList.add('active'); flash(`MIDI: ${midi.deviceName || 'connected'}`); } else flash('WebMIDI unavailable'); });
  const camBtn = button('ASL CAMERA', '', async () => {
    if (await motion.enable()) {
      camBtn.classList.add('active');
      // signing motion becomes live control data by default
      mod.addRoute('motion.energy', 'A.intensity', 0.3);
      mod.addRoute('motion.spread', 'A.p1', 0.35);
      paintRoutes();
      flash('ASL camera live — motion is now control data');
    } else flash('Camera unavailable');
  });
  inRow.append(audioBtn, midiBtn, camBtn);
  const oscRow = el('div', 'gc-row');
  const oscInput = el('input', 'gc-input');
  oscInput.placeholder = 'OSC bridge ws:// url';
  oscInput.value = 'ws://localhost:8080';
  oscRow.append(oscInput, button('OSC', 'gc-mini', () => { if (osc.connect(oscInput.value)) flash('OSC connecting…'); }));
  const mediaRow = el('div', 'gc-row');
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'video/*,image/*';
  fileInput.className = 'gc-file';
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadMediaFile(fileInput.files[0]); });
  const camSrcBtn = button('CAM AS SOURCE', '', async () => {
    if (await motion.enable()) { mediaSource = motion.video; camSrcBtn.classList.add('active'); camBtn.classList.add('active'); }
  });
  mediaRow.append(fileInput, camSrcBtn, button('CLEAR SRC', '', () => { mediaSource = null; camSrcBtn.classList.remove('active'); }));
  const meterRow = el('div', 'gc-meters');
  const meters = {
    amp: meter('AUDIO'), energy: meter('MOTION'), raised: meter('RAISED'), spread: meter('SPREAD'),
  };
  Object.values(meters).forEach((m) => meterRow.appendChild(m));
  inPanel.append(inRow, oscRow, mediaRow, meterRow);
  lowerWrap.appendChild(inPanel);

  // media sources -----------------------------------------------------
  let mediaSource = null;   // video element / image canvas fed to u_media
  function loadMediaFile(file) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video')) {
      const v = document.createElement('video');
      v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
      v.play();
      mediaSource = v;
    } else {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        mediaSource = c;
      };
      img.src = url;
    }
    flash(`SOURCE ← ${file.name} (archive media stays recognizable)`);
  }
  pgmWrap.addEventListener('dragover', (e) => e.preventDefault());
  pgmWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadMediaFile(e.dataTransfer.files[0]);
  });

  motion.onSharpStop = () => {          // a sharp stop freezes the frame
    setFreeze(true);
    setTimeout(() => setFreeze(false), 1400);
  };
  midi.onNote = (note) => {
    mod.env.trigger();
    const idx = note % 12;              // any octave: C..G launch channels 1..8
    if (idx < 8) selectChannel(CHANNELS[idx].id);
  };
  osc.onMessage = (msg) => {
    if (msg.address === '/gladcast/take') take();
    if (msg.address === '/gladcast/scene' && CHANNELS[msg.value - 1]) selectChannel(CHANNELS[msg.value - 1].id);
  };

  // ---------------------------------------------------- header controls ----
  const aspectSel = select(Object.entries(ASPECTS).map(([k, v]) => ({ value: k, label: v.label })), (k) => {
    const a = ASPECTS[k];
    engine.setSize(a.w, a.h);
    programCanvas.width = a.w; programCanvas.height = a.h;
    safeCanvas.width = a.w; safeCanvas.height = a.h;
    resInd.textContent = `${a.w}×${a.h}`;
    pgmWrap.style.aspectRatio = `${a.w} / ${a.h}`;
  }, '16:9');
  const recBtn = button('● REC', 'gc-rec', () => {
    if (output.recording) { output.stopRecording(); recBtn.classList.remove('active'); recBtn.textContent = '● REC'; }
    else { output.startRecording(); recBtn.classList.add('active'); recBtn.textContent = '■ STOP'; }
  });
  const safeBtn = button('SAFE AREAS', '', () => {
    const on = !state.safe.broadcastSafe;
    state.safe.broadcastSafe = on; state.safe.captionSafe = on;
    safeBtn.classList.toggle('active', on);
  });
  const syncBtn = button('SYNC', '', () => {
    if (sync.connected || sync.ws) { sync.close(); syncBtn.classList.remove('active'); syncBtn.textContent = 'SYNC'; return; }
    sync.onStatus = (s) => { syncBtn.textContent = s; flash(s); };
    sync.connect(syncRoom);
    syncBtn.classList.add('active');
  });
  setInterval(() => {
    if (sync.connected) sync.publishVisual(collectVisual({ state, overlay, captions, mod }));
  }, 300);

  headerBtns.append(
    syncBtn,
    aspectSel,
    safeBtn,
    button('SNAP', '', () => output.snapshot()),
    recBtn,
    button('OUTPUT ⧉', '', () => output.openProgramWindow()),
  );

  // toast/flash messages -------------------------------------------------
  const toast = el('div', 'gc-toast');
  app.appendChild(toast);
  let toastTimer = null;
  function flash(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ------------------------------------------------------- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '8') selectChannel(CHANNELS[Number(e.key) - 1].id);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); take(); }
    else if (e.key === 'f') setFreeze(!state.fx.freeze);
    else if (e.key === 'ArrowLeft') { state.mix.xfade = clamp01(state.mix.xfade - 0.05); xfader.set(state.mix.xfade); }
    else if (e.key === 'ArrowRight') { state.mix.xfade = clamp01(state.mix.xfade + 0.05); xfader.set(state.mix.xfade); }
    else if (e.key === 'e') emergencyOverride();
    else if (e.key === 'd') { state.A.params.mode = state.A.params.mode ? 0 : 1; deckUI.A.paintMode(); }
  });

  // ------------------------------------------------------ render loop ----
  const start = performance.now();
  const nowSec = () => (performance.now() - start) / 1000;
  let last = nowSec();
  let frames = 0, fpsT = last;

  function frame() {
    const t = nowSec();
    const dt = Math.min(0.1, t - last);
    last = t;

    audio.tick();
    motion.tick(dt);
    captions.tick(dt, t);

    const offsets = mod.tick(dt, {
      audio, motion,
      midi: { lastNote: midi.lastNote, lastVelocity: midi.lastVelocity, cc: midi.cc },
      osc: osc.values,
      caption: { len: captions.len, pulse: captions.pulse },
      xy: state.xy,
      emergencyLevel: state.emergencyLevel,
    });

    const effDeck = (key) => {
      const d = state[key];
      const p = { ...d.params };
      for (const pk of ['p1', 'p2', 'p3', 'p4', 'intensity']) {
        const o = offsets[`${key}.${pk}`];
        if (o) p[pk] = clamp01(p[pk] + o);
      }
      return { gen: d.gen, params: p };
    };
    const effMix = { xfade: clamp01(state.mix.xfade + (offsets['mix.xfade'] || 0)), blend: state.mix.blend };
    const effFx = {
      ...state.fx,
      trails: clamp01(state.fx.trails + (offsets['fx.trails'] || 0)) * 0.97,
      crt: clamp01(state.fx.crt + (offsets['fx.crt'] || 0)),
      pixelate: state.fx.pixelate + (offsets['fx.pixelate01'] || 0) * 64,
      posterize: state.fx.posterize + (offsets['fx.posterize01'] || 0) * 10,
    };

    engine.updateMedia(mediaSource);
    engine.updateWave(audio.wave);

    const ctx = { time: t, audio, xy: state.xy, beat: mod.sources['beat.pulse'] || 0 };

    // PROGRAM pass
    engine.renderProgram(effDeck('A'), effDeck('B'), ctx, effMix, effFx);
    programCtx.drawImage(engine.canvas, 0, 0, programCanvas.width, programCanvas.height);
    overlay.draw(programCtx, programCanvas.width, programCanvas.height, t);
    captions.draw(programCtx, programCanvas.width, programCanvas.height, t);
    output.tick();

    // PREVIEW pass (deck B raw)
    engine.renderPreview(effDeck('B'), ctx);
    previewCtx.drawImage(engine.canvas, 0, 0, previewCanvas.width, previewCanvas.height);

    // UI-only safe-area overlay
    safeCtx.clearRect(0, 0, safeCanvas.width, safeCanvas.height);
    if (state.safe.broadcastSafe || state.safe.captionSafe) {
      drawSafeAreas(safeCtx, safeCanvas.width, safeCanvas.height, state.safe);
    }

    // meters + perf readouts
    meters.amp.set(audio.amp);
    meters.energy.set(motion.energy);
    meters.raised.set(motion.raised);
    meters.spread.set(motion.spread);
    frames++;
    if (t - fpsT > 0.5) {
      fpsInd.textContent = `${Math.round(frames / (t - fpsT))} fps`;
      gpuInd.textContent = `GPU ${engine.frameMs.toFixed(1)} ms`;
      frames = 0; fpsT = t;
    }

    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------- boot ----
  selectChannel('26.8', 2);            // Signal From Eagle Rock, staged
  take();                              // …and on air
  captions.show('Welcome to *GLADcast*. Keys 1–8 pick a channel, Enter takes it to air.', 1);
  paintRoutes();
  requestAnimationFrame(frame);
}
