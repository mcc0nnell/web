/**
 * GLADcast UI toolkit — performable widgets built for live operation:
 * big hit targets, high contrast, zero reliance on sound, and MIDI-learn
 * on every knob (right-click / long-press arms learn).
 */

export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function section(title, className = '') {
  const s = el('section', `gc-panel ${className}`);
  const h = el('h2', 'gc-panel-title', title);
  s.appendChild(h);
  return s;
}

export function button(label, className, onClick) {
  const b = el('button', `gc-btn ${className || ''}`, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function select(options, onChange, value) {
  const s = el('select', 'gc-select');
  for (const o of options) {
    const opt = el('option', '', typeof o === 'string' ? o : o.label);
    opt.value = typeof o === 'string' ? o : o.value;
    s.appendChild(opt);
  }
  if (value != null) s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function slider(label, value, onChange, opts = {}) {
  const wrap = el('label', 'gc-slider');
  const span = el('span', 'gc-slider-label', label);
  const input = el('input');
  input.type = 'range';
  input.min = opts.min ?? 0;
  input.max = opts.max ?? 1;
  input.step = opts.step ?? 0.01;
  input.value = value;
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  wrap.append(span, input);
  wrap.set = (v) => { input.value = v; };
  wrap.input = input;
  return wrap;
}

/**
 * Rotary knob. Drag vertically to change. Right-click (or long-press)
 * arms MIDI-learn via onLearn. `set(v)` updates from code (presets, MIDI).
 */
export function knob(label, value, onChange, onLearn) {
  const wrap = el('div', 'gc-knob-wrap');
  const k = el('div', 'gc-knob');
  k.setAttribute('role', 'slider');
  k.setAttribute('aria-label', label);
  k.tabIndex = 0;
  const lab = el('div', 'gc-knob-label', label);
  const val = el('div', 'gc-knob-value');
  wrap.append(k, lab, val);

  let v = value;
  const paint = () => {
    k.style.setProperty('--v', v);
    k.setAttribute('aria-valuenow', v.toFixed(2));
    val.textContent = Math.round(v * 100);
  };
  const setV = (nv, fire = true) => {
    v = Math.max(0, Math.min(1, nv));
    paint();
    if (fire) onChange(v);
  };
  paint();

  let dragStart = null;
  let pressTimer = null;
  k.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    k.setPointerCapture(e.pointerId);
    dragStart = { y: e.clientY, v };
    pressTimer = setTimeout(() => { if (onLearn) armLearn(); }, 650);
  });
  k.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const dy = dragStart.y - e.clientY;
    if (Math.abs(dy) > 4) clearTimeout(pressTimer);
    setV(dragStart.v + dy / 160);
  });
  const end = () => { dragStart = null; clearTimeout(pressTimer); };
  k.addEventListener('pointerup', end);
  k.addEventListener('pointercancel', end);
  k.addEventListener('contextmenu', (e) => { e.preventDefault(); if (onLearn) armLearn(); });
  k.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setV(v + 0.05); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setV(v - 0.05); e.preventDefault(); }
  });
  k.addEventListener('dblclick', () => setV(0.5));

  function armLearn() {
    wrap.classList.add('learning');
    onLearn(() => wrap.classList.remove('learning'));
  }

  wrap.set = (nv) => setV(nv, false);
  wrap.get = () => v;
  wrap.setLabel = (t) => { lab.textContent = t; };
  return wrap;
}

/** XY modulation pad — pointer position publishes xy.x / xy.y. */
export function xyPad(onChange) {
  const pad = el('div', 'gc-xy');
  const dot = el('div', 'gc-xy-dot');
  pad.appendChild(dot);
  let x = 0.5, y = 0.5;
  const paint = () => {
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${(1 - y) * 100}%`;
  };
  paint();
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    paint();
    onChange(x, y);
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    pad.classList.add('active');
    move(e);
    const up = () => { pad.classList.remove('active'); pad.removeEventListener('pointermove', move); };
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', up, { once: true });
  });
  pad.set = (nx, ny) => { x = nx; y = ny; paint(); };
  return pad;
}

/** Horizontal crossfader with A/B end labels. */
export function crossfader(onChange) {
  const wrap = el('div', 'gc-xfader');
  const a = el('span', 'gc-xfader-cap', 'A');
  const input = el('input');
  input.type = 'range';
  input.min = 0; input.max = 1; input.step = 0.001; input.value = 0;
  input.setAttribute('aria-label', 'Crossfader A/B');
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  const b = el('span', 'gc-xfader-cap', 'B');
  wrap.append(a, input, b);
  wrap.set = (v) => { input.value = v; };
  wrap.get = () => parseFloat(input.value);
  return wrap;
}

/** Meter bar (0..1) for motion/audio/perf displays. */
export function meter(label) {
  const wrap = el('div', 'gc-meter');
  const lab = el('span', 'gc-meter-label', label);
  const track = el('div', 'gc-meter-track');
  const fill = el('div', 'gc-meter-fill');
  track.appendChild(fill);
  wrap.append(lab, track);
  wrap.set = (v) => { fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; };
  return wrap;
}
