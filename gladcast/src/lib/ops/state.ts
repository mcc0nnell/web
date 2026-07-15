export const ROOM_MODES = ['idle', 'standby', 'live', 'break'] as const
export const SCREEN_VARIANTS = ['default', 'announcement', 'results', 'break'] as const
export const ALERT_LEVELS = ['info', 'warning', 'critical'] as const
export const TIMER_STATUSES = ['idle', 'running', 'stopped'] as const

// Showcaller phase — the explicit run-of-show lifecycle a human showcaller
// drives for a room. Distinct from the screen-graphics `mode` above: `mode`
// answers "what graphic is on the wall", `phase` answers "where are we in the
// show". The two coexist on one canonical RoomState so a single state change
// fans out to every surface.
export const SHOW_PHASES = ['idle', 'ready', 'armed', 'live', 'hold', 'fallback'] as const
// Readiness gates a segment can require before it is safe to go live. These
// describe department/source readiness, not graphics.
export const SHOW_GATE_KEYS = ['captions', 'video', 'interpreter', 'room', 'stream'] as const
export const SHOW_GATE_STATUSES = ['unknown', 'ready', 'live', 'problem'] as const

export type RoomMode = (typeof ROOM_MODES)[number]
export type ScreenVariant = (typeof SCREEN_VARIANTS)[number]
export type AlertLevel = (typeof ALERT_LEVELS)[number]
export type TimerStatus = (typeof TIMER_STATUSES)[number]
export type ShowPhase = (typeof SHOW_PHASES)[number]
export type ShowGateKey = (typeof SHOW_GATE_KEYS)[number]
export type ShowGateStatus = (typeof SHOW_GATE_STATUSES)[number]
export type ShowGates = Record<ShowGateKey, ShowGateStatus>

export type ShowState = {
  // Run-of-show lifecycle. `fallback` is the safe takeover; `hold` is a pause
  // an operator intends to resume.
  phase: ShowPhase
  // Active rundown segment. The rundown lives in content/code; the DO only
  // stores the selected id so the reducer stays pure and rundown-agnostic.
  segmentId: string | null
  // Department/source readiness gates (caption/video/interpreter/room/stream).
  gates: ShowGates
  // Convenience mirror of `phase === 'fallback'`, kept in sync by the reducer
  // so output surfaces can branch on one boolean without re-deriving it.
  fallback: boolean
  // Operator slate/message override (e.g. a custom "stand by" line). When null,
  // surfaces fall back to the segment's fallbackMessage, then a room default.
  message: string | null
  // Where a hold/fallback should return to. Captured on entry so Resume and
  // Clear Fallback are deterministic.
  resumePhase: ShowPhase | null
  // Last operator identity to change the show state (server-enriched).
  updatedBy: string | null
}

export type ScreenPayload = {
  id: string
  title: string
  body?: string
  route?: string
  variant?: ScreenVariant
  /** Optional compact graphics hint used by live output shells. */
  transitionStyle?: 'cut' | 'fade' | 'macrovision' | 'signal-lock' | 'light-sweep' | 'none'
}

export type LowerThirdPayload = {
  name: string
  title?: string
}

export type AlertPayload = {
  level: AlertLevel
  message: string
}

export type TimerState = {
  status: TimerStatus
  startedAt: string | null
  durationMs: number | null
  endsAt: string | null
  label: string | null
}

export type ClockState = {
  syncedAt: string | null
}

export type RoomState = {
  roomId: string
  mode: RoomMode
  screen: ScreenPayload | null
  lowerThird: LowerThirdPayload | null
  alert: AlertPayload | null
  timer: TimerState
  clock: ClockState
  // Opaque CoBo scoring payload synced across devices via SET_COBO.
  // Optional so snapshots persisted before this field existed stay valid.
  cobo?: Record<string, unknown> | null
  // Opaque GLADcast instrument payload synced via SET_VISUAL / TAKE_VISUAL:
  // decks, mix, fx, overlays, captions, modulation config + routes. Kept
  // opaque so the ops spine stays agnostic of the instrument's schema (same
  // doctrine as `cobo`); receivers validate it via the versioned client
  // schema (src/scripts/gladcast/schema.js).
  visual?: Record<string, unknown> | null
  // Shared transport clock: {running, epochMs, positionAtEpoch, bpm, seed,
  // sequence}. Time-based visuals derive from this, never from local clocks.
  transport?: Record<string, unknown> | null
  // Live control signals (audio/motion/MIDI/OSC/XY). EPHEMERAL: broadcast
  // but never persisted — see EPHEMERAL_COMMAND_TYPES in worker/room-do.ts.
  controls?: Record<string, unknown> | null
  // Synchronized media descriptor (never binary media — a URL + playback
  // intent). Validated client-side; the spine only bounds its size.
  media?: Record<string, unknown> | null
  // Synchronized output format: {aspect, width, height, fps}.
  output?: Record<string, unknown> | null
  // Emergency override layer. Independent of `visual` so emergency
  // information renders even when visual state or media is broken.
  emergency?: Record<string, unknown> | null
  // Monotonic instrument event marker (TAKE / envelope trigger), stamped
  // with the transport position it applies at, so every output fires the
  // same event at the same musical moment.
  visualEvent?: {seq: number; kind: string; at: number} | null
  // Showcaller run-of-show layer. Optional so snapshots persisted before this
  // field existed stay valid; getShowState() materializes a default.
  show?: ShowState
  updatedAt: string
  revision: number
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value
}

export function createIdleTimerState(): TimerState {
  return {
    status: 'idle',
    startedAt: null,
    durationMs: null,
    endsAt: null,
    label: null,
  }
}

export function createInitialShowGates(): ShowGates {
  return {
    captions: 'unknown',
    video: 'unknown',
    interpreter: 'unknown',
    room: 'unknown',
    stream: 'unknown',
  }
}

export function createInitialShowState(): ShowState {
  return {
    phase: 'idle',
    segmentId: null,
    gates: createInitialShowGates(),
    fallback: false,
    message: null,
    resumePhase: null,
    updatedBy: null,
  }
}

// Snapshots persisted before the show layer existed have no `show`. Materialize
// a default so every reader sees the full, typed shape.
export function getShowState(state: RoomState): ShowState {
  return state.show ?? createInitialShowState()
}

export function createInitialRoomState(roomId: string, now: string | Date = new Date()): RoomState {
  const updatedAt = toIsoString(now)

  return {
    roomId,
    mode: 'idle',
    screen: null,
    lowerThird: null,
    alert: null,
    timer: createIdleTimerState(),
    clock: {
      syncedAt: updatedAt,
    },
    cobo: null,
    visual: null,
    show: createInitialShowState(),
    updatedAt,
    revision: 0,
  }
}
