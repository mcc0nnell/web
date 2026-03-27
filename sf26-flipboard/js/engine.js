import { content } from './content.js';
import { SCENE_TYPES } from './constants.js';
import { SplitFlapBoard, center, left } from './board.js';
import { SoundEngine } from './sound.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const boardRoot = document.querySelector('#board');
const topRail = document.querySelector('#top-rail');
const bottomRail = document.querySelector('#bottom-rail');
const hud = document.querySelector('#operator-hud');

const hudFields = {
  scene: document.querySelector('#hud-scene'),
  type: document.querySelector('#hud-type'),
  playlist: document.querySelector('#hud-playlist'),
  autoplay: document.querySelector('#hud-autoplay'),
  muted: document.querySelector('#hud-muted'),
  fullscreen: document.querySelector('#hud-fullscreen'),
};

const board = new SplitFlapBoard({
  root: boardRoot,
  rows: content.board.rows,
  cols: content.board.cols,
  reducedMotion: prefersReducedMotion,
});

const sound = new SoundEngine();

const state = {
  autoplay: true,
  muted: false,
  hudVisible: false,
  playlistName: content.board.defaultPlaylist,
  sceneIndex: 0,
  timer: null,
  countdownTimer: null,
};

function formatCountdown(targetIso) {
  const ms = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const totalSeconds = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function playlist() {
  return content.playlists[state.playlistName] || [];
}

function currentSceneId() {
  return playlist()[state.sceneIndex] || playlist()[0];
}

function sceneById(sceneId) {
  return content.scenes[sceneId];
}

function clearTimers() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function sceneLines(scene) {
  const width = content.board.cols;
  const lines = new Array(content.board.rows).fill(' '.repeat(width));

  switch (scene.type) {
    case SCENE_TYPES.HERO:
      lines[2] = center(scene.payload.headline, width);
      lines[4] = center(scene.payload.subline, width);
      break;
    case SCENE_TYPES.NOW_NEXT:
      lines[1] = left('NOW', width);
      lines[2] = left(scene.payload.now, width);
      lines[4] = left('NEXT', width);
      lines[5] = left(scene.payload.next, width);
      break;
    case SCENE_TYPES.ROOM:
      lines[1] = center(scene.payload.title, width);
      lines[3] = center(scene.payload.room, width);
      lines[5] = center(scene.payload.detail, width);
      break;
    case SCENE_TYPES.COUNTDOWN:
      lines[1] = center(scene.payload.title, width);
      lines[3] = center(scene.payload.label, width);
      lines[4] = center(formatCountdown(scene.payload.targetIso), width);
      break;
    case SCENE_TYPES.SPONSOR:
      lines[1] = center(scene.payload.title, width);
      scene.payload.lines.slice(0, 3).forEach((line, i) => {
        lines[3 + i] = center(line, width);
      });
      break;
    case SCENE_TYPES.WAYFINDING:
      lines[1] = center(scene.payload.title, width);
      lines[3] = left(scene.payload.direction, width);
      lines[5] = left(scene.payload.detail, width);
      break;
    case SCENE_TYPES.ALERT:
      lines[1] = center(scene.payload.title, width);
      lines[3] = center(scene.payload.message, width);
      lines[5] = center(scene.payload.detail, width);
      break;
    default:
      lines[3] = center('SCENE TYPE NOT SUPPORTED', width);
  }

  return lines;
}

async function drawCurrentScene({ animate = true } = {}) {
  clearTimers();
  const sceneId = currentSceneId();
  const scene = sceneById(sceneId);
  if (!scene) return;

  const changed = board.render(sceneLines(scene), {
    animate,
    style: scene.visualMode || 'default',
  });

  if (changed > 0) {
    await sound.tick(changed / 30);
  }

  if (scene.type === SCENE_TYPES.COUNTDOWN) {
    state.countdownTimer = setInterval(() => {
      const delta = board.render(sceneLines(scene), {
        animate: !prefersReducedMotion,
        style: scene.visualMode || 'default',
      });
      if (delta > 0) sound.tick(delta / 35);
    }, 1000);
  }

  if (state.autoplay) {
    const dwell = scene.dwellMs + (prefersReducedMotion ? content.board.reducedMotionDwellBoostMs : 0);
    state.timer = setTimeout(() => {
      nextScene();
    }, Math.max(1000, dwell));
  }

  topRail.textContent = `${content.board.railTop} • ${scene.name}`;
  bottomRail.textContent = content.board.railBottom;

  hudFields.scene.textContent = sceneId;
  hudFields.type.textContent = scene.type;
  hudFields.playlist.textContent = state.playlistName;
  hudFields.autoplay.textContent = state.autoplay ? 'On' : 'Off';
  hudFields.muted.textContent = state.muted ? 'On' : 'Off';
  hudFields.fullscreen.textContent = document.fullscreenElement ? 'On' : 'Off';
}

function nextScene() {
  const list = playlist();
  state.sceneIndex = (state.sceneIndex + 1) % list.length;
  drawCurrentScene();
}

function previousScene() {
  const list = playlist();
  state.sceneIndex = (state.sceneIndex - 1 + list.length) % list.length;
  drawCurrentScene();
}

function restartPlaylist() {
  state.sceneIndex = 0;
  drawCurrentScene({ animate: false });
}

function setPlaylist(name) {
  if (!content.playlists[name]) return;
  state.playlistName = name;
  state.sceneIndex = 0;
  drawCurrentScene({ animate: false });
}

function jumpToScene(sceneId) {
  const list = playlist();
  const index = list.indexOf(sceneId);
  if (index >= 0) {
    state.sceneIndex = index;
  } else {
    state.playlistName = content.board.defaultPlaylist;
    const fallback = playlist().indexOf(sceneId);
    if (fallback >= 0) state.sceneIndex = fallback;
  }
  drawCurrentScene({ animate: false });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // no-op, some kiosk browsers block fullscreen.
  }
  drawCurrentScene({ animate: false });
}

function toggleMute() {
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  drawCurrentScene({ animate: false });
}

function toggleAutoplay() {
  state.autoplay = !state.autoplay;
  drawCurrentScene({ animate: false });
}

function toggleHUD() {
  state.hudVisible = !state.hudVisible;
  hud.classList.toggle('hidden', !state.hudVisible);
  hud.setAttribute('aria-hidden', String(!state.hudVisible));
}

window.addEventListener('keydown', (event) => {
  const key = event.key;

  if (key === ' ' || key === 'Enter' || key === 'ArrowRight') {
    event.preventDefault();
    nextScene();
    return;
  }

  if (key === 'ArrowLeft') {
    event.preventDefault();
    previousScene();
    return;
  }

  if (key.toLowerCase() === 'f') {
    toggleFullscreen();
    return;
  }

  if (key.toLowerCase() === 'm') {
    toggleMute();
    return;
  }

  if (key.toLowerCase() === 'a') {
    toggleAutoplay();
    return;
  }

  if (key.toLowerCase() === 'r') {
    restartPlaylist();
    return;
  }

  if (key.toLowerCase() === 'o') {
    toggleHUD();
    return;
  }

  if (/^[1-9]$/.test(key)) {
    const shortcut = content.quickKeys[key];
    if (!shortcut) return;
    if (shortcut.playlist) setPlaylist(shortcut.playlist);
    if (shortcut.scene) jumpToScene(shortcut.scene);
  }
});

document.addEventListener('fullscreenchange', () => drawCurrentScene({ animate: false }));

drawCurrentScene({ animate: false });
