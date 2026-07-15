import type {AlertPayload, LowerThirdPayload, RoomMode, RoomState, ScreenPayload, ShowGateKey, ShowGateStatus, ShowPhase} from './state'

export const MACRO_NAMES = ['standby', 'session-start', 'technical-pause', 'clear-stage'] as const
export const OPS_COMMAND_TYPES = [
  'SET_MODE',
  'SET_SCREEN',
  'PUSH_ALERT',
  'CLEAR_ALERT',
  'SET_LOWER_THIRD',
  'CLEAR_LOWER_THIRD',
  'START_TIMER',
  'STOP_TIMER',
  'ADJUST_TIMER',
  'RESET_TIMER',
  'SYNC_CLOCK',
  'SET_COBO',
  'SET_VISUAL',
  'RUN_MACRO',
  // Showcaller run-of-show commands.
  'SET_SHOW_PHASE',
  'SET_SEGMENT',
  'SET_GATE',
] as const
// We intentionally send the latest full room state in STATE_PATCH payloads.
// The name is legacy; the semantics are "authoritative state update" to
// reduce merge bugs during live operations.
export const OPS_EVENT_TYPES = ['STATE_SNAPSHOT', 'STATE_PATCH', 'ACK', 'ERROR', 'PRESENCE'] as const

export type MacroName = (typeof MACRO_NAMES)[number]
export type OpsCommandType = (typeof OPS_COMMAND_TYPES)[number]
export type OpsEventType = (typeof OPS_EVENT_TYPES)[number]

export type CommandBase = {
  commandId: string
  issuedAt: string
}

export type SetModeCommand = CommandBase & {
  type: 'SET_MODE'
  mode: RoomMode
}

export type SetScreenCommand = CommandBase & {
  type: 'SET_SCREEN'
  screen: ScreenPayload | null
}

export type PushAlertCommand = CommandBase & {
  type: 'PUSH_ALERT'
  alert: AlertPayload
}

export type ClearAlertCommand = CommandBase & {
  type: 'CLEAR_ALERT'
}

export type SetLowerThirdCommand = CommandBase & {
  type: 'SET_LOWER_THIRD'
  lowerThird: LowerThirdPayload
}

export type ClearLowerThirdCommand = CommandBase & {
  type: 'CLEAR_LOWER_THIRD'
}

export type StartTimerCommand = CommandBase & {
  type: 'START_TIMER'
  durationMs: number
  label?: string | null
}

export type StopTimerCommand = CommandBase & {
  type: 'STOP_TIMER'
}

export type AdjustTimerCommand = CommandBase & {
  type: 'ADJUST_TIMER'
  // Positive to add time, negative to subtract. Applied to a running timer's endsAt.
  deltaMs: number
}

export type ResetTimerCommand = CommandBase & {
  type: 'RESET_TIMER'
}

export type SyncClockCommand = CommandBase & {
  type: 'SYNC_CLOCK'
  syncedAt: string
}

export type RunMacroCommand = CommandBase & {
  type: 'RUN_MACRO'
  macro: MacroName
}

export type SetCoboCommand = CommandBase & {
  type: 'SET_COBO'
  cobo: Record<string, unknown>
}

export type SetVisualCommand = CommandBase & {
  type: 'SET_VISUAL'
  visual: Record<string, unknown>
}

export type SetShowPhaseCommand = CommandBase & {
  type: 'SET_SHOW_PHASE'
  phase: ShowPhase
  // Optional slate/message override. `undefined` leaves the message untouched;
  // `null` explicitly clears it.
  message?: string | null
}

export type SetSegmentCommand = CommandBase & {
  type: 'SET_SEGMENT'
  // The client resolves next/previous against the rundown and sends the
  // concrete id (or null to clear), keeping the reducer rundown-agnostic.
  segmentId: string | null
}

export type SetGateCommand = CommandBase & {
  type: 'SET_GATE'
  gate: ShowGateKey
  status: ShowGateStatus
}

export type OpsCommand =
  | SetModeCommand
  | SetScreenCommand
  | PushAlertCommand
  | ClearAlertCommand
  | SetLowerThirdCommand
  | ClearLowerThirdCommand
  | StartTimerCommand
  | StopTimerCommand
  | AdjustTimerCommand
  | ResetTimerCommand
  | SyncClockCommand
  | SetCoboCommand
  | SetVisualCommand
  | RunMacroCommand
  | SetShowPhaseCommand
  | SetSegmentCommand
  | SetGateCommand

type StripCommandBase<T> = T extends unknown ? Omit<T, keyof CommandBase> : never

export type OpsCommandBody = StripCommandBase<OpsCommand>

export type PresenceState = {
  connections: number
  operators: number
  viewers: number
}

export type StateSnapshotEvent = {
  type: 'STATE_SNAPSHOT'
  roomId: string
  sentAt: string
  state: RoomState
}

export type StatePatchEvent = {
  type: 'STATE_PATCH'
  roomId: string
  sentAt: string
  revision: number
  patch: Partial<RoomState>
}

export type AckEvent = {
  type: 'ACK'
  roomId: string
  sentAt: string
  commandId: string
  revision: number
}

export type ErrorEvent = {
  type: 'ERROR'
  roomId: string
  sentAt: string
  message: string
  code?: string
  commandId?: string
}

export type PresenceEvent = {
  type: 'PRESENCE'
  roomId: string
  sentAt: string
  presence: PresenceState
}

export type OpsRealtimeEvent = StateSnapshotEvent | StatePatchEvent | AckEvent | ErrorEvent | PresenceEvent

export type OpsDebugEvent = {
  index: number
  timestamp: string
  commandType: OpsCommandType
  summary: string
  revision: number
  changed: boolean
  commandId: string
  operator?: string | null
  payload?: Record<string, unknown> | null
}
