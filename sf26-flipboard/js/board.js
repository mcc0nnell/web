import { CHARACTER_SET, REPLACEMENTS } from './constants.js';

function sanitizeChar(character) {
  const raw = `${character || ' '}`;
  const normalized = REPLACEMENTS[raw] || raw;
  const upper = normalized.toUpperCase();
  return CHARACTER_SET.includes(upper) ? upper : ' ';
}

function sanitizeText(text = '') {
  return `${text}`.split('').map((char) => sanitizeChar(char)).join('');
}

class Tile {
  constructor(node, reducedMotion) {
    this.node = node;
    this.current = ' ';
    this.reducedMotion = reducedMotion;
  }

  setStyle(style) {
    this.node.classList.remove('accent', 'warn');
    if (style === 'accent') this.node.classList.add('accent');
    if (style === 'warn') this.node.classList.add('warn');
  }

  setChar(nextChar, animated = true) {
    const sanitized = sanitizeChar(nextChar);
    if (sanitized === this.current) return false;
    this.current = sanitized;
    this.node.textContent = sanitized;

    if (animated && !this.reducedMotion) {
      this.node.classList.remove('flipping');
      void this.node.offsetWidth;
      this.node.classList.add('flipping');
    }

    return true;
  }
}

export class SplitFlapBoard {
  constructor({ root, rows, cols, reducedMotion }) {
    this.root = root;
    this.rows = rows;
    this.cols = cols;
    this.tiles = [];
    this.reducedMotion = reducedMotion;

    root.style.setProperty('--cols', cols);
    this.#build();
  }

  #build() {
    const fragment = document.createDocumentFragment();

    for (let r = 0; r < this.rows; r += 1) {
      const row = document.createElement('div');
      row.className = 'flap-row';
      this.tiles[r] = [];

      for (let c = 0; c < this.cols; c += 1) {
        const tileNode = document.createElement('span');
        tileNode.className = 'tile';
        tileNode.textContent = ' ';
        row.appendChild(tileNode);
        this.tiles[r][c] = new Tile(tileNode, this.reducedMotion);
      }

      fragment.appendChild(row);
    }

    this.root.replaceChildren(fragment);
  }

  render(lines, { animate = true, style = 'default' } = {}) {
    let changed = 0;

    for (let r = 0; r < this.rows; r += 1) {
      const line = sanitizeText(lines[r] || '').padEnd(this.cols, ' ').slice(0, this.cols);
      for (let c = 0; c < this.cols; c += 1) {
        const tile = this.tiles[r][c];
        tile.setStyle(style);
        if (tile.setChar(line[c], animate)) changed += 1;
      }
    }

    return changed;
  }
}

export function center(text, width) {
  const clipped = sanitizeText(text || '').slice(0, width);
  const leftPad = Math.max(0, Math.floor((width - clipped.length) / 2));
  return `${' '.repeat(leftPad)}${clipped}`.padEnd(width, ' ');
}

export function left(text, width) {
  return sanitizeText(text || '').slice(0, width).padEnd(width, ' ');
}
