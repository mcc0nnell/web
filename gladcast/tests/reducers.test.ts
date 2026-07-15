import {describe, expect, it} from 'vitest'
import {reduceRoomState} from '../src/lib/ops/reducers'
import {createInitialRoomState} from '../src/lib/ops/state'
import type {OpsCommand} from '../src/lib/ops/protocol'

let n = 0
function cmd<T extends OpsCommand['type']>(type: T, extra: Record<string, unknown>): OpsCommand {
  n += 1
  return {type, commandId: `c${n}`, issuedAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), ...extra} as OpsCommand
}

describe('visual/transport reducer behavior', () => {
  it('applies SET_VISUAL and skips identical payloads', () => {
    const s0 = createInitialRoomState('r')
    const s1 = reduceRoomState(s0, cmd('SET_VISUAL', {visual: {version: 2, revision: 1}}))
    expect(s1.revision).toBe(1)
    const s2 = reduceRoomState(s1, cmd('SET_VISUAL', {visual: {version: 2, revision: 1}}))
    expect(s2).toBe(s1)
  })

  it('rejects stale or reordered transports by sequence', () => {
    const s0 = createInitialRoomState('r')
    const t5 = {running: true, epochMs: 1, positionAtEpoch: 0, bpm: 96, seed: 9, sequence: 5}
    const s1 = reduceRoomState(s0, cmd('SET_TRANSPORT', {transport: t5}))
    expect(s1.transport).toEqual(t5)
    const s2 = reduceRoomState(s1, cmd('SET_TRANSPORT', {transport: {...t5, bpm: 200, sequence: 4}}))
    expect(s2).toBe(s1) // stale rejected
    const s3 = reduceRoomState(s1, cmd('SET_TRANSPORT', {transport: {...t5, sequence: 5}}))
    expect(s3).toBe(s1) // duplicate rejected
    const s4 = reduceRoomState(s1, cmd('SET_TRANSPORT', {transport: {...t5, bpm: 120, sequence: 6}}))
    expect((s4.transport as {bpm: number}).bpm).toBe(120)
  })

  it('TAKE_VISUAL lands visual + event in one revision with monotonic seq', () => {
    const s0 = createInitialRoomState('r')
    const s1 = reduceRoomState(s0, cmd('TAKE_VISUAL', {visual: {version: 2, revision: 3}, at: 12.5}))
    expect(s1.visual).toEqual({version: 2, revision: 3})
    expect(s1.visualEvent).toEqual({seq: 1, kind: 'take', at: 12.5})
    const s2 = reduceRoomState(s1, cmd('TRIGGER_ENVELOPE', {at: 14}))
    expect(s2.visualEvent).toEqual({seq: 2, kind: 'envelope', at: 14})
    expect(s2.revision).toBe(s1.revision + 1)
  })

  it('SET_CONTROL_SIGNALS deduplicates identical payloads', () => {
    const s0 = createInitialRoomState('r')
    const c = {audio: {amp: 0.5}, sequence: 1}
    const s1 = reduceRoomState(s0, cmd('SET_CONTROL_SIGNALS', {controls: c}))
    expect(s1.controls).toEqual(c)
    expect(reduceRoomState(s1, cmd('SET_CONTROL_SIGNALS', {controls: {...c}}))).toBe(s1)
  })

  it('SET_MEDIA_SOURCE and SET_OUTPUT_FORMAT round-trip', () => {
    const s0 = createInitialRoomState('r')
    const s1 = reduceRoomState(s0, cmd('SET_MEDIA_SOURCE', {media: {id: 'x', type: 'image', url: '/media/x'}}))
    expect((s1.media as {id: string}).id).toBe('x')
    const s2 = reduceRoomState(s1, cmd('SET_MEDIA_SOURCE', {media: null}))
    expect(s2.media).toBeNull()
    const s3 = reduceRoomState(s2, cmd('SET_OUTPUT_FORMAT', {output: {aspect: '9:16', width: 720, height: 1280, fps: 60}}))
    expect((s3.output as {height: number}).height).toBe(1280)
  })

  it('EMERGENCY_OVERRIDE always advances with a fresh seq (unconditional)', () => {
    const s0 = createInitialRoomState('r')
    const s1 = reduceRoomState(s0, cmd('EMERGENCY_OVERRIDE', {emergency: {active: true, level: 'emergency', title: 'T'}}))
    expect((s1.emergency as {seq: number}).seq).toBe(1)
    // identical payload still re-asserts — precedence over equality skips
    const s2 = reduceRoomState(s1, cmd('EMERGENCY_OVERRIDE', {emergency: {active: true, level: 'emergency', title: 'T'}}))
    expect((s2.emergency as {seq: number}).seq).toBe(2)
    expect(s2.revision).toBe(s1.revision + 1)
    const s3 = reduceRoomState(s2, cmd('EMERGENCY_OVERRIDE', {emergency: {active: false}}))
    expect((s3.emergency as {active: boolean}).active).toBe(false)
  })
})
