import { content as defaultContent } from './content.js';

const STORAGE_KEY = 'sf26.flipboard.content';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeObjects(base, override) {
  if (!override || typeof override !== 'object') return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;

  const next = { ...base };
  Object.keys(override).forEach((key) => {
    next[key] = mergeObjects(base?.[key], override[key]);
  });
  return next;
}

async function loadFromRemote(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load remote content (${response.status})`);
  return response.json();
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadContent() {
  const base = deepClone(defaultContent);
  const params = new URLSearchParams(window.location.search);

  const source = params.get('source');
  const dataUrl = params.get('data');

  let override = null;
  if (source === 'localStorage') {
    override = loadFromStorage();
  } else if (dataUrl) {
    override = await loadFromRemote(dataUrl);
  }

  return mergeObjects(base, override);
}
