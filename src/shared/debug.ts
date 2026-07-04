export type DebugScope = "content" | "background"

export type DebugLogger = (message: string, details?: unknown) => void

let isDebugLoggingEnabled = true

export function setDebugLoggingEnabled(enabled: boolean): void {
  isDebugLoggingEnabled = enabled
}

export function createDebugLogger(scope: DebugScope, enabled: boolean): DebugLogger {
  return (message, details) => {
    if (!enabled || !isDebugLoggingEnabled) {
      return
    }

    debugLog(scope, message, details)
  }
}

export function debugLog(scope: DebugScope, message: string, details?: unknown): void {
  if (!isDebugLoggingEnabled) {
    return
  }

  if (details === undefined) {
    console.info(`[CognitiveDelta][${scope}]`, message)
  } else {
    console.info(`[CognitiveDelta][${scope}]`, message, details)
  }
}

export function serializeDebugError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return error
}
