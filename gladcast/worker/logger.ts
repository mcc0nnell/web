type LogLevel = 'info' | 'warn' | 'error'

type LogEntry = {
  level: LogLevel
  event: string
  roomId?: string
  operator?: string | null
  [key: string]: unknown
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify({
    ...entry,
    ts: new Date().toISOString(),
  })
}

export const log = {
  info(event: string, data: Omit<LogEntry, 'level' | 'event'> = {}) {
    console.log(formatEntry({level: 'info', event, ...data}))
  },

  warn(event: string, data: Omit<LogEntry, 'level' | 'event'> = {}) {
    console.warn(formatEntry({level: 'warn', event, ...data}))
  },

  error(event: string, data: Omit<LogEntry, 'level' | 'event'> = {}) {
    console.error(formatEntry({level: 'error', event, ...data}))
  },
}
