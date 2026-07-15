import type {MacroName, OpsCommandBody, RunMacroCommand} from './protocol'

type MacroStep = Exclude<OpsCommandBody, {type: 'RUN_MACRO'}>

export const OPS_MACROS: Record<MacroName, readonly MacroStep[]> = {
  standby: [
    {type: 'STOP_TIMER'},
    {type: 'CLEAR_ALERT'},
    {type: 'CLEAR_LOWER_THIRD'},
    {
      type: 'SET_SCREEN',
      screen: {
        id: 'standby',
        title: 'Standby',
        body: 'Please standby for the next cue.',
        route: '/ops/broadcast/output',
        variant: 'announcement',
      },
    },
    {type: 'SET_MODE', mode: 'idle'},
  ],
  'session-start': [
    {type: 'CLEAR_ALERT'},
    {type: 'CLEAR_LOWER_THIRD'},
    {
      type: 'SET_SCREEN',
      screen: {
        id: 'session-start',
        title: 'Session Start',
        body: 'Session starting now.',
        route: '/live',
        variant: 'default',
      },
    },
    {type: 'SET_MODE', mode: 'live'},
  ],
  'technical-pause': [
    {type: 'STOP_TIMER'},
    {type: 'CLEAR_LOWER_THIRD'},
    {
      type: 'PUSH_ALERT',
      alert: {
        level: 'warning',
        message: 'Technical pause',
      },
    },
    {type: 'SET_MODE', mode: 'break'},
  ],
  'clear-stage': [
    {type: 'STOP_TIMER'},
    {type: 'CLEAR_ALERT'},
    {type: 'CLEAR_LOWER_THIRD'},
    {type: 'SET_SCREEN', screen: null},
    {type: 'SET_MODE', mode: 'idle'},
  ],
}

export function getMacroSteps(name: MacroName) {
  return OPS_MACROS[name]
}

export function expandMacroCommand(command: RunMacroCommand) {
  return getMacroSteps(command.macro).map((step, index) => ({
    ...step,
    commandId: `${command.commandId}:${index + 1}`,
    issuedAt: command.issuedAt,
  }))
}
