import {DurableObject, type DurableObjectState} from 'cloudflare:workers'
import {
  ALERT_LEVELS,
  createInitialRoomState,
  ROOM_MODES,
  SCREEN_VARIANTS,
  SHOW_GATE_KEYS,
  SHOW_GATE_STATUSES,
  SHOW_PHASES,
  type AlertLevel,
  type AlertPayload,
  type LowerThirdPayload,
  type RoomMode,
  type RoomState,
  type ScreenPayload,
  type ShowGateKey,
  type ShowGateStatus,
  type ShowPhase,
} from '../src/lib/ops/state'
import {
  MACRO_NAMES,
  OPS_COMMAND_TYPES,
  type MacroName,
  type OpsCommand,
  type OpsDebugEvent,
  type OpsRealtimeEvent,
} from '../src/lib/ops/protocol'
import {reduceRoomState} from '../src/lib/ops/reducers'
import {log} from './logger'

const SNAPSHOT_ROW_ID = 1
const MAX_EVENT_LOG_SIZE = 50
const MAX_COBO_PAYLOAD_CHARS = 32_768
const MAX_VISUAL_PAYLOAD_CHARS = 32_768
const MAX_CONTROLS_PAYLOAD_CHARS = 4_096
const MAX_TRANSPORT_PAYLOAD_CHARS = 1_024
const MAX_MEDIA_PAYLOAD_CHARS = 4_096
const MAX_OUTPUT_PAYLOAD_CHARS = 1_024
const MAX_EMERGENCY_PAYLOAD_CHARS = 2_048

function boundedRecord(value: unknown, cap: number, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} requires a payload object.`)
  }
  if (JSON.stringify(value).length > cap) {
    throw new Error(`${label} payload is too large.`)
  }
  return value
}

function finitePosition(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} requires a finite, non-negative transport position.`)
  }
  return n
}

type StoredSnapshotRow = {
  state_json: string
}

type CommandRequestBody = {
  command?: unknown
}

type StoredEventRow = {
  revision: number
  event_json: string
}

type AckResponse = {
  type: 'ACK'
  roomId: string
  sentAt: string
  commandId: string
  revision: number
  changed: boolean
  state: RoomState
}

type ErrorResponse = {
  type: 'ERROR'
  roomId: string
  sentAt: string
  message: string
  code?: string
  commandId?: string
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isMode(value: unknown): value is RoomMode {
  return typeof value === 'string' && ROOM_MODES.includes(value as RoomMode)
}

function isMacroName(value: unknown): value is MacroName {
  return typeof value === 'string' && MACRO_NAMES.includes(value as MacroName)
}

function isAlertLevel(value: unknown): value is AlertLevel {
  return typeof value === 'string' && ALERT_LEVELS.includes(value as AlertLevel)
}

function isShowPhase(value: unknown): value is ShowPhase {
  return typeof value === 'string' && SHOW_PHASES.includes(value as ShowPhase)
}

function isShowGateKey(value: unknown): value is ShowGateKey {
  return typeof value === 'string' && SHOW_GATE_KEYS.includes(value as ShowGateKey)
}

function isShowGateStatus(value: unknown): value is ShowGateStatus {
  return typeof value === 'string' && SHOW_GATE_STATUSES.includes(value as ShowGateStatus)
}

const MAX_SLATE_MESSAGE_CHARS = 280
const MAX_SEGMENT_ID_CHARS = 120

function parseScreenPayload(value: unknown): ScreenPayload | null {
  if (value === null) {
    return null
  }
  if (!isRecord(value)) {
    throw new Error('SET_SCREEN requires a screen payload or null.')
  }

  const id = asString(value.id)
  const title = asString(value.title)
  if (!id || !title) {
    throw new Error('SET_SCREEN requires screen.id and screen.title.')
  }

  const variant: NonNullable<ScreenPayload['variant']> =
    typeof value.variant === 'string' && SCREEN_VARIANTS.includes(value.variant as NonNullable<ScreenPayload['variant']>)
      ? (value.variant as NonNullable<ScreenPayload['variant']>)
      : 'default'

  return {
    id,
    title,
    body: asString(value.body) ?? undefined,
    route: asString(value.route) ?? undefined,
    variant,
  }
}

function parseLowerThirdPayload(value: unknown): LowerThirdPayload {
  if (!isRecord(value)) {
    throw new Error('SET_LOWER_THIRD requires a lowerThird payload.')
  }

  const name = asString(value.name)
  if (!name) {
    throw new Error('SET_LOWER_THIRD requires lowerThird.name.')
  }

  return {
    name,
    title: asString(value.title) ?? undefined,
  }
}

function parseAlertPayload(value: unknown): AlertPayload {
  if (!isRecord(value)) {
    throw new Error('PUSH_ALERT requires an alert payload.')
  }

  const message = asString(value.message)
  if (!message) {
    throw new Error('PUSH_ALERT requires alert.message.')
  }

  return {
    level: isAlertLevel(value.level) ? value.level : 'info',
    message,
  }
}

function parseCommand(input: unknown): OpsCommand {
  if (!isRecord(input)) {
    throw new Error('Command must be an object.')
  }

  const type = asString(input.type)
  const commandId = asString(input.commandId)
  const issuedAt = asString(input.issuedAt)

  if (!type || !OPS_COMMAND_TYPES.includes(type as OpsCommand['type'])) {
    throw new Error('Command type is invalid.')
  }
  if (!commandId) {
    throw new Error('Command requires commandId.')
  }
  if (!issuedAt) {
    throw new Error('Command requires issuedAt.')
  }

  switch (type) {
    case 'SET_MODE':
      if (!isMode(input.mode)) {
        throw new Error(`SET_MODE requires one of: ${ROOM_MODES.join(', ')}.`)
      }
      return {type, commandId, issuedAt, mode: input.mode}
    case 'SET_SCREEN':
      return {type, commandId, issuedAt, screen: parseScreenPayload(input.screen)}
    case 'PUSH_ALERT':
      return {type, commandId, issuedAt, alert: parseAlertPayload(input.alert)}
    case 'CLEAR_ALERT':
      return {type, commandId, issuedAt}
    case 'SET_LOWER_THIRD':
      return {type, commandId, issuedAt, lowerThird: parseLowerThirdPayload(input.lowerThird)}
    case 'CLEAR_LOWER_THIRD':
      return {type, commandId, issuedAt}
    case 'START_TIMER': {
      const durationMs = typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? input.durationMs : null
      if (durationMs === null || durationMs <= 0) {
        throw new Error('START_TIMER requires a positive durationMs.')
      }
      return {
        type,
        commandId,
        issuedAt,
        durationMs,
        label: asString(input.label),
      }
    }
    case 'STOP_TIMER':
      return {type, commandId, issuedAt}
    case 'ADJUST_TIMER': {
      const deltaMs = typeof input.deltaMs === 'number' && Number.isFinite(input.deltaMs) ? input.deltaMs : null
      if (deltaMs === null || deltaMs === 0) {
        throw new Error('ADJUST_TIMER requires a non-zero deltaMs.')
      }
      return {type, commandId, issuedAt, deltaMs}
    }
    case 'RESET_TIMER':
      return {type, commandId, issuedAt}
    case 'SYNC_CLOCK': {
      const syncedAt = asString(input.syncedAt)
      if (!syncedAt) {
        throw new Error('SYNC_CLOCK requires syncedAt.')
      }
      return {type, commandId, issuedAt, syncedAt}
    }
    case 'SET_COBO': {
      if (!isRecord(input.cobo)) {
        throw new Error('SET_COBO requires a cobo payload object.')
      }
      if (JSON.stringify(input.cobo).length > MAX_COBO_PAYLOAD_CHARS) {
        throw new Error('SET_COBO payload is too large.')
      }
      return {type, commandId, issuedAt, cobo: input.cobo}
    }
    case 'SET_VISUAL': {
      if (!isRecord(input.visual)) {
        throw new Error('SET_VISUAL requires a visual payload object.')
      }
      if (JSON.stringify(input.visual).length > MAX_VISUAL_PAYLOAD_CHARS) {
        throw new Error('SET_VISUAL payload is too large.')
      }
      return {type, commandId, issuedAt, visual: input.visual}
    }
    case 'SET_TRANSPORT': {
      const transport = boundedRecord(input.transport, MAX_TRANSPORT_PAYLOAD_CHARS, 'SET_TRANSPORT')
      for (const field of ['epochMs', 'positionAtEpoch', 'bpm', 'sequence']) {
        if (typeof transport[field] !== 'number' || !Number.isFinite(transport[field] as number)) {
          throw new Error(`SET_TRANSPORT requires numeric ${field}.`)
        }
      }
      return {type, commandId, issuedAt, transport}
    }
    case 'SET_CONTROL_SIGNALS':
      return {type, commandId, issuedAt, controls: boundedRecord(input.controls, MAX_CONTROLS_PAYLOAD_CHARS, 'SET_CONTROL_SIGNALS')}
    case 'SET_MEDIA_SOURCE': {
      if (input.media === null) {
        return {type, commandId, issuedAt, media: null}
      }
      return {type, commandId, issuedAt, media: boundedRecord(input.media, MAX_MEDIA_PAYLOAD_CHARS, 'SET_MEDIA_SOURCE')}
    }
    case 'SET_OUTPUT_FORMAT':
      return {type, commandId, issuedAt, output: boundedRecord(input.output, MAX_OUTPUT_PAYLOAD_CHARS, 'SET_OUTPUT_FORMAT')}
    case 'TRIGGER_ENVELOPE':
      return {type, commandId, issuedAt, at: finitePosition(input.at, 'TRIGGER_ENVELOPE')}
    case 'TAKE_VISUAL': {
      const visual = boundedRecord(input.visual, MAX_VISUAL_PAYLOAD_CHARS, 'TAKE_VISUAL')
      return {type, commandId, issuedAt, visual, at: finitePosition(input.at, 'TAKE_VISUAL')}
    }
    case 'EMERGENCY_OVERRIDE':
      return {type, commandId, issuedAt, emergency: boundedRecord(input.emergency, MAX_EMERGENCY_PAYLOAD_CHARS, 'EMERGENCY_OVERRIDE')}
    case 'RUN_MACRO':
      if (!isMacroName(input.macro)) {
        throw new Error(`RUN_MACRO requires one of: ${MACRO_NAMES.join(', ')}.`)
      }
      return {type, commandId, issuedAt, macro: input.macro}
    case 'SET_SHOW_PHASE': {
      if (!isShowPhase(input.phase)) {
        throw new Error(`SET_SHOW_PHASE requires one of: ${SHOW_PHASES.join(', ')}.`)
      }
      // `message` is optional and tri-state: omitted leaves it untouched, null
      // clears it, a string sets it (length-capped to keep slates sane).
      let message: string | null | undefined
      if (input.message === null) {
        message = null
      } else if (typeof input.message === 'string') {
        const trimmed = input.message.trim()
        if (trimmed.length > MAX_SLATE_MESSAGE_CHARS) {
          throw new Error('SET_SHOW_PHASE message is too long.')
        }
        message = trimmed || null
      }
      return {type, commandId, issuedAt, phase: input.phase, ...(message === undefined ? {} : {message})}
    }
    case 'SET_SEGMENT': {
      if (input.segmentId === null) {
        return {type, commandId, issuedAt, segmentId: null}
      }
      const segmentId = asString(input.segmentId)
      if (!segmentId) {
        throw new Error('SET_SEGMENT requires a segmentId or null.')
      }
      if (segmentId.length > MAX_SEGMENT_ID_CHARS) {
        throw new Error('SET_SEGMENT segmentId is too long.')
      }
      return {type, commandId, issuedAt, segmentId}
    }
    case 'SET_GATE': {
      if (!isShowGateKey(input.gate)) {
        throw new Error(`SET_GATE requires gate in: ${SHOW_GATE_KEYS.join(', ')}.`)
      }
      if (!isShowGateStatus(input.status)) {
        throw new Error(`SET_GATE requires status in: ${SHOW_GATE_STATUSES.join(', ')}.`)
      }
      return {type, commandId, issuedAt, gate: input.gate, status: input.status}
    }
  }

  throw new Error('Command type is invalid.')
}

const COMMAND_WINDOW_MS = 1_000
// 30/s per client: live control signals publish at up to 10 Hz alongside
// visual publishes, transport changes, and instrument events.
const COMMAND_LIMIT = 30

// Commands that are reduced and broadcast but never persisted: live control
// signals are ephemeral by nature — losing them on a DO restart is correct
// (receivers decay to neutral), and skipping the SQL snapshot + event log
// keeps a 10 Hz control stream from grinding storage.
const EPHEMERAL_COMMAND_TYPES = new Set<OpsCommand['type']>(['SET_CONTROL_SIGNALS'])

export class RoomDO extends DurableObject {
  private stateCache: RoomState | null = null
  private roomId = 'default'
  private commandThrottle = new Map<string, {count: number; startedAt: number}>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    this.ctx.blockConcurrencyWhile(async () => {
      // Snapshot + bounded event log are the only persistent runtime stores
      // needed for the current room model.
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS snapshot (
          id INTEGER PRIMARY KEY CHECK (id = ${SNAPSHOT_ROW_ID}),
          room_id TEXT NOT NULL,
          state_json TEXT NOT NULL,
          revision INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS event_log (
          revision INTEGER PRIMARY KEY,
          event_json TEXT NOT NULL
        );
      `)

      const state = this.readSnapshot()
      if (state) {
        this.stateCache = state
        this.roomId = state.roomId
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    this.adoptRoomId(url.searchParams.get('room'))

    if (url.pathname.endsWith('/state')) {
      return this.handleStateRequest()
    }
    if (url.pathname.endsWith('/command')) {
      return this.handleCommandRequest(request)
    }
    if (url.pathname.endsWith('/events')) {
      return this.handleEventsRequest()
    }
    if (url.pathname.endsWith('/ws')) {
      return this.handleWebSocket(request)
    }

    return new Response('Not found', {status: 404})
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void | Promise<void> {
    // The room is broadcast-only for now. Ignore client chatter except for a
    // trivial ping/pong path so browsers can probe socket health.
    if (typeof message === 'string' && message === 'ping') {
      this.sendRawMessage(socket, 'pong')
    }
  }

  webSocketClose(socket: WebSocket): void | Promise<void> {
    this.dropSocket(socket)
    log.info('ws.disconnect', {roomId: this.roomId, connections: this.ctx.getWebSockets().length})
  }

  webSocketError(socket: WebSocket): void | Promise<void> {
    this.dropSocket(socket)
    log.warn('ws.error', {roomId: this.roomId, connections: this.ctx.getWebSockets().length})
  }

  private handleStateRequest() {
    return json(this.loadState())
  }

  private handleEventsRequest() {
    const state = this.loadState()
    return json({
      roomId: state.roomId,
      revision: state.revision,
      events: this.listEvents(),
    })
  }

  private isCommandRateLimited(clientIp: string) {
    const now = Date.now()
    const current = this.commandThrottle.get(clientIp)

    if (!current || now - current.startedAt >= COMMAND_WINDOW_MS) {
      this.commandThrottle.set(clientIp, {count: 1, startedAt: now})
      return false
    }

    if (current.count >= COMMAND_LIMIT) {
      return true
    }

    current.count += 1

    if (this.commandThrottle.size > 512) {
      for (const [key, value] of this.commandThrottle) {
        if (now - value.startedAt >= COMMAND_WINDOW_MS) {
          this.commandThrottle.delete(key)
        }
      }
    }

    return false
  }

  private async handleCommandRequest(request: Request) {
    const clientIp = request.headers.get('x-gladcast-client-ip') ?? 'unknown'
    if (this.isCommandRateLimited(clientIp)) {
      log.warn('command.rate_limited', {roomId: this.roomId, clientIp})
      return this.errorResponse('Too many commands. Slow down and retry.', 429, 'RATE_LIMITED')
    }

    let body: CommandRequestBody

    try {
      body = (await request.json()) as CommandRequestBody
    } catch {
      return this.errorResponse('Request body must be valid JSON.', 400, 'INVALID_JSON')
    }

    let command: OpsCommand

    try {
      command = parseCommand(body.command)
    } catch (error) {
      return this.errorResponse(error instanceof Error ? error.message : 'Command is invalid.', 400, 'INVALID_COMMAND')
    }

    const operator = request.headers.get('x-gladcast-operator-identity') ?? null

    const currentState = this.loadState()
    // All authoritative changes flow through the shared reducer so the same
    // contract can be reused in the Worker, UI, and future tests.
    let nextState = reduceRoomState(currentState, command)
    const changed = nextState.revision !== currentState.revision
    const sentAt = changed ? nextState.updatedAt : command.issuedAt

    // Identity-aware audit enrichment hook: the reducer is pure and has no
    // operator identity, so stamp the showcaller's identity here where the
    // verified operator header is available. Kept narrow to show commands so
    // unrelated commands never touch the show layer.
    if (changed && nextState.show && (command.type === 'SET_SHOW_PHASE' || command.type === 'SET_SEGMENT' || command.type === 'SET_GATE')) {
      nextState = {...nextState, show: {...nextState.show, updatedBy: operator ?? nextState.show.updatedBy}}
    }

    if (changed && EPHEMERAL_COMMAND_TYPES.has(command.type)) {
      // In-memory only: update the cache and fan out, skip snapshot + log.
      this.stateCache = nextState
      this.broadcast({
        type: 'STATE_PATCH',
        roomId: nextState.roomId,
        sentAt,
        revision: nextState.revision,
        patch: nextState,
      })
    } else if (changed) {
      this.persistSnapshot(nextState)
      this.appendEvent(this.buildDebugEvent(command, nextState, sentAt, operator))
      log.info('command.applied', {
        roomId: nextState.roomId,
        commandType: command.type,
        commandId: command.commandId,
        revision: nextState.revision,
        operator,
      })
      this.broadcast({
        type: 'STATE_PATCH',
        roomId: nextState.roomId,
        sentAt,
        revision: nextState.revision,
        patch: nextState,
      })
    }

    const response: AckResponse = {
      type: 'ACK',
      roomId: nextState.roomId,
      sentAt,
      commandId: command.commandId,
      revision: nextState.revision,
      changed,
      state: nextState,
    }

    return json(response)
  }

  private handleWebSocket(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade.', {status: 426})
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    // Durable Object websocket acceptance keeps the room compatible with
    // hibernation-safe lifecycle handling.
    this.ctx.acceptWebSocket(server)
    this.sendSnapshot(server)

    log.info('ws.connect', {roomId: this.roomId, connections: this.ctx.getWebSockets().length})

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private loadState() {
    if (this.stateCache) {
      return this.stateCache
    }

    const existing = this.readSnapshot()
    if (existing) {
      this.roomId = existing.roomId
      this.stateCache = existing
      return existing
    }

    const created = createInitialRoomState(this.roomId)
    // First touch for a room materializes the default snapshot.
    this.persistSnapshot(created)
    return created
  }

  private adoptRoomId(room: string | null) {
    const slug = room?.trim()
    // Each RoomDO instance is addressed by exactly one slug, but the instance
    // only learns that slug from the request. Adopt it the first time the room
    // is named so state/debug surfaces report the real room instead of the
    // 'default' placeholder, backfilling any snapshot materialized beforehand.
    if (!slug || slug === this.roomId || this.roomId !== 'default') {
      return
    }

    this.roomId = slug

    const current = this.loadState()
    if (current.roomId !== slug) {
      this.persistSnapshot({...current, roomId: slug})
    }
  }

  private readSnapshot() {
    // A never-initialized room has no snapshot row yet. `.one()` throws on zero
    // results, so read into an array and treat "no rows" as absent — loadState()
    // materializes the default snapshot on the first touch.
    const row = this.ctx.storage.sql
      .exec<StoredSnapshotRow>('SELECT state_json FROM snapshot WHERE id = ?', SNAPSHOT_ROW_ID)
      .toArray()[0]

    if (!row) {
      return null
    }

    return JSON.parse(row.state_json) as RoomState
  }

  private listEvents() {
    const rows = this.ctx.storage.sql
      .exec<StoredEventRow>('SELECT revision, event_json FROM event_log ORDER BY revision DESC LIMIT ?', MAX_EVENT_LOG_SIZE)
      .toArray()

    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.event_json) as OpsDebugEvent]
      } catch {
        return []
      }
    })
  }

  private persistSnapshot(state: RoomState) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO snapshot (id, room_id, state_json, revision, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      SNAPSHOT_ROW_ID,
      state.roomId,
      JSON.stringify(state),
      state.revision,
      state.updatedAt,
    )

    this.roomId = state.roomId
    this.stateCache = state
  }

  private appendEvent(event: OpsDebugEvent) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO event_log (revision, event_json)
       VALUES (?, ?)`,
      event.revision,
      JSON.stringify(event),
    )

    this.ctx.storage.sql.exec(
      `DELETE FROM event_log
       WHERE revision NOT IN (
         SELECT revision FROM event_log ORDER BY revision DESC LIMIT ?
       )`,
      MAX_EVENT_LOG_SIZE,
    )
  }

  private buildDebugEvent(command: OpsCommand, state: RoomState, timestamp: string, operator?: string | null): OpsDebugEvent {
    return {
      index: state.revision,
      timestamp,
      commandType: command.type,
      summary: this.summarizeCommand(command),
      revision: state.revision,
      changed: true,
      commandId: command.commandId,
      operator: operator ?? null,
      payload: this.abbreviatePayload(command),
    }
  }

  private summarizeCommand(command: OpsCommand) {
    switch (command.type) {
      case 'SET_MODE':
        return `Mode set to ${command.mode}`
      case 'SET_SCREEN':
        return command.screen ? `Screen set to ${command.screen.title}` : 'Screen cleared'
      case 'PUSH_ALERT':
        return `${command.alert.level} alert: ${command.alert.message}`
      case 'CLEAR_ALERT':
        return 'Alert cleared'
      case 'SET_LOWER_THIRD':
        return `Lower third set for ${command.lowerThird.name}`
      case 'CLEAR_LOWER_THIRD':
        return 'Lower third cleared'
      case 'START_TIMER':
        return `Timer started${command.label ? `: ${command.label}` : ''}`
      case 'STOP_TIMER':
        return 'Timer stopped'
      case 'ADJUST_TIMER':
        return `Timer adjusted ${command.deltaMs > 0 ? '+' : ''}${Math.round(command.deltaMs / 1000)}s`
      case 'RESET_TIMER':
        return 'Timer reset'
      case 'SYNC_CLOCK':
        return 'Clock synced'
      case 'RUN_MACRO':
        return `Macro run: ${command.macro}`
      case 'SET_COBO':
        return 'CoBo scoring synced'
      case 'SET_VISUAL':
        return 'GLADcast visual state synced'
      case 'SET_TRANSPORT':
        return 'Transport synced'
      case 'SET_CONTROL_SIGNALS':
        return 'Control signals synced'
      case 'SET_MEDIA_SOURCE':
        return command.media ? 'Media source set' : 'Media source cleared'
      case 'SET_OUTPUT_FORMAT':
        return 'Output format synced'
      case 'TRIGGER_ENVELOPE':
        return `Envelope trigger @ ${command.at.toFixed(2)}s`
      case 'TAKE_VISUAL':
        return `TAKE @ ${command.at.toFixed(2)}s`
      case 'EMERGENCY_OVERRIDE':
        return 'EMERGENCY OVERRIDE'
      case 'SET_SHOW_PHASE':
        return `Show phase → ${command.phase.toUpperCase()}`
      case 'SET_SEGMENT':
        return command.segmentId ? `Segment → ${command.segmentId}` : 'Segment cleared'
      case 'SET_GATE':
        return `Gate ${command.gate} → ${command.status}`
    }
  }

  private abbreviatePayload(command: OpsCommand) {
    switch (command.type) {
      case 'SET_MODE':
        return {mode: command.mode}
      case 'SET_SCREEN':
        return command.screen
          ? {
              screen: {
                id: command.screen.id,
                title: command.screen.title,
                route: command.screen.route ?? null,
                variant: command.screen.variant ?? 'default',
              },
            }
          : {screen: null}
      case 'PUSH_ALERT':
        return {alert: command.alert}
      case 'SET_LOWER_THIRD':
        return {lowerThird: command.lowerThird}
      case 'START_TIMER':
        return {durationMs: command.durationMs, label: command.label ?? null}
      case 'ADJUST_TIMER':
        return {deltaMs: command.deltaMs}
      case 'SYNC_CLOCK':
        return {syncedAt: command.syncedAt}
      case 'RUN_MACRO':
        return {macro: command.macro}
      case 'SET_COBO':
        return {cobo: 'scoring payload'}
      case 'SET_SHOW_PHASE':
        return {phase: command.phase, ...(command.message === undefined ? {} : {message: command.message})}
      case 'SET_SEGMENT':
        return {segmentId: command.segmentId}
      case 'SET_GATE':
        return {gate: command.gate, status: command.status}
      case 'CLEAR_ALERT':
      case 'CLEAR_LOWER_THIRD':
      case 'STOP_TIMER':
      case 'RESET_TIMER':
        return null
    }
  }

  private broadcast(event: OpsRealtimeEvent) {
    // Connected clients are discovered from Durable Object state rather than
    // process-local bookkeeping so reconnect/hydration stays safe.
    const payload = JSON.stringify(event)
    for (const socket of this.ctx.getWebSockets()) {
      this.sendRawMessage(socket, payload)
    }
  }

  private sendSocketEvent(socket: WebSocket, event: OpsRealtimeEvent) {
    this.sendRawMessage(socket, JSON.stringify(event))
  }

  private sendSnapshot(socket: WebSocket) {
    const state = this.loadState()
    this.sendSocketEvent(socket, {
      type: 'STATE_SNAPSHOT',
      roomId: state.roomId,
      sentAt: state.updatedAt,
      state,
    })
  }

  private sendRawMessage(socket: WebSocket, payload: string) {
    try {
      socket.send(payload)
    } catch {
      this.dropSocket(socket)
    }
  }

  private dropSocket(socket: WebSocket) {
    try {
      socket.close()
    } catch {
      // Ignore close failures for dead sockets.
    }
  }

  private errorResponse(message: string, status: number, code?: string, commandId?: string) {
    const response: ErrorResponse = {
      type: 'ERROR',
      roomId: this.roomId,
      sentAt: new Date().toISOString(),
      message,
      code,
      commandId,
    }

    return json(response, {status})
  }
}
