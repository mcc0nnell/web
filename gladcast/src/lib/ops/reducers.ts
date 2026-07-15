import {expandMacroCommand} from './macros'
import type {OpsCommand} from './protocol'
import {
  createIdleTimerState,
  getShowState,
  type AlertPayload,
  type LowerThirdPayload,
  type RoomState,
  type ScreenPayload,
  type ShowPhase,
  type ShowState,
} from './state'

function alertEquals(left: AlertPayload | null, right: AlertPayload | null) {
  return (left?.level ?? null) === (right?.level ?? null) && (left?.message ?? null) === (right?.message ?? null)
}

function lowerThirdEquals(left: LowerThirdPayload | null, right: LowerThirdPayload | null) {
  return (left?.name ?? null) === (right?.name ?? null) && (left?.title ?? null) === (right?.title ?? null)
}

function screenEquals(left: ScreenPayload | null, right: ScreenPayload | null) {
  return (
    (left?.id ?? null) === (right?.id ?? null) &&
    (left?.title ?? null) === (right?.title ?? null) &&
    (left?.body ?? null) === (right?.body ?? null) &&
    (left?.route ?? null) === (right?.route ?? null) &&
    (left?.variant ?? 'default') === (right?.variant ?? 'default')
  )
}

function advanceState(state: RoomState, issuedAt: string, patch: Partial<RoomState>): RoomState {
  return {
    ...state,
    ...patch,
    updatedAt: issuedAt,
    revision: state.revision + 1,
  }
}

// A hold/fallback should remember a "real" phase to resume into. If we are
// already paused, keep whatever we captured on the way in.
function captureResumePhase(show: ShowState, target: ShowPhase): ShowPhase | null {
  if (target !== 'hold' && target !== 'fallback') {
    return null
  }
  return show.phase === 'hold' || show.phase === 'fallback' ? show.resumePhase : show.phase
}

function reduceSingleRoomCommand(state: RoomState, command: Exclude<OpsCommand, {type: 'RUN_MACRO'}>): RoomState {
  switch (command.type) {
    case 'SET_MODE':
      return state.mode === command.mode ? state : advanceState(state, command.issuedAt, {mode: command.mode})
    case 'SET_SCREEN':
      return screenEquals(state.screen, command.screen) ? state : advanceState(state, command.issuedAt, {screen: command.screen})
    case 'PUSH_ALERT':
      return alertEquals(state.alert, command.alert) ? state : advanceState(state, command.issuedAt, {alert: command.alert})
    case 'CLEAR_ALERT':
      return state.alert === null ? state : advanceState(state, command.issuedAt, {alert: null})
    case 'SET_LOWER_THIRD':
      return lowerThirdEquals(state.lowerThird, command.lowerThird)
        ? state
        : advanceState(state, command.issuedAt, {lowerThird: command.lowerThird})
    case 'CLEAR_LOWER_THIRD':
      return state.lowerThird === null ? state : advanceState(state, command.issuedAt, {lowerThird: null})
    case 'START_TIMER': {
      const startedAt = command.issuedAt
      const endsAt = new Date(Date.parse(startedAt) + command.durationMs).toISOString()

      return advanceState(state, command.issuedAt, {
        timer: {
          status: 'running',
          startedAt,
          durationMs: command.durationMs,
          endsAt,
          label: command.label ?? null,
        },
      })
    }
    case 'STOP_TIMER':
      return state.timer.status === 'running'
        ? advanceState(state, command.issuedAt, {timer: {...createIdleTimerState(), status: 'stopped'}})
        : state
    case 'ADJUST_TIMER': {
      if (state.timer.status !== 'running' || !state.timer.endsAt) {
        return state
      }
      const endsAt = new Date(Date.parse(state.timer.endsAt) + command.deltaMs).toISOString()
      const durationMs = state.timer.durationMs !== null ? Math.max(0, state.timer.durationMs + command.deltaMs) : state.timer.durationMs
      return advanceState(state, command.issuedAt, {timer: {...state.timer, endsAt, durationMs}})
    }
    case 'RESET_TIMER':
      return state.timer.status === 'idle' && !state.timer.startedAt
        ? state
        : advanceState(state, command.issuedAt, {timer: createIdleTimerState()})
    case 'SYNC_CLOCK':
      return state.clock.syncedAt === command.syncedAt
        ? state
        : advanceState(state, command.issuedAt, {clock: {syncedAt: command.syncedAt}})
    case 'SET_COBO':
      return JSON.stringify(state.cobo ?? null) === JSON.stringify(command.cobo)
        ? state
        : advanceState(state, command.issuedAt, {cobo: command.cobo})
    case 'SET_VISUAL':
      return JSON.stringify(state.visual ?? null) === JSON.stringify(command.visual)
        ? state
        : advanceState(state, command.issuedAt, {visual: command.visual})
    case 'SET_SHOW_PHASE': {
      const show = getShowState(state)
      const nextMessage = command.message === undefined ? show.message : command.message
      if (show.phase === command.phase && nextMessage === show.message) {
        return state
      }
      return advanceState(state, command.issuedAt, {
        show: {
          ...show,
          phase: command.phase,
          fallback: command.phase === 'fallback',
          resumePhase: captureResumePhase(show, command.phase),
          message: nextMessage,
        },
      })
    }
    case 'SET_SEGMENT': {
      const show = getShowState(state)
      return show.segmentId === command.segmentId
        ? state
        : advanceState(state, command.issuedAt, {show: {...show, segmentId: command.segmentId}})
    }
    case 'SET_GATE': {
      const show = getShowState(state)
      return show.gates[command.gate] === command.status
        ? state
        : advanceState(state, command.issuedAt, {
            show: {...show, gates: {...show.gates, [command.gate]: command.status}},
          })
    }
  }
}

export function reduceRoomState(state: RoomState, command: OpsCommand): RoomState {
  if (command.type === 'RUN_MACRO') {
    // Macros are expanded into normal commands so the reducer still applies
    // one deterministic state transition model for every room action.
    return expandMacroCommand(command).reduce<RoomState>((nextState, step) => reduceSingleRoomCommand(nextState, step), state)
  }

  return reduceSingleRoomCommand(state, command)
}
