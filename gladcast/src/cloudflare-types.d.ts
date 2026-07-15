declare module 'cloudflare:workers' {
  export interface SqlExecResult<T> {
    one(): T | null
    toArray(): T[]
  }

  export interface SqlStorage {
    exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlExecResult<T>
  }

  export interface DurableObjectStorage {
    sql: SqlStorage
    setAlarm(scheduledTime: number): Promise<void>
    deleteAlarm(): Promise<void>
  }

  export interface DurableObjectState {
    storage: DurableObjectStorage
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
    acceptWebSocket(ws: WebSocket, tags?: string[]): void
    getWebSockets(tag?: string): WebSocket[]
  }

  export interface DurableObjectId {}

  export type DurableObjectStub<T> = T

  export interface DurableObjectNamespace<T = unknown> {
    idFromName(name: string): DurableObjectId
    get(id: DurableObjectId): DurableObjectStub<T>
  }

  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }

  export const env: Env

  // Loopback bindings to the current worker's own exports (used by the
  // vitest-pool-workers integration tests to fetch the worker under test).
  export const exports: Record<string, unknown> & {default: unknown}
}

interface ResponseInit {
  webSocket?: WebSocket
}

interface Response {
  // Present on upgrade responses in the Workers runtime.
  readonly webSocket?: WebSocket | null
}

interface WebSocket {
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
  // Workers-runtime acceptance for the client end of a WebSocketPair.
  accept(): void
}

declare const WebSocketPair: {
  new (): {
    0: WebSocket
    1: WebSocket
  }
}
