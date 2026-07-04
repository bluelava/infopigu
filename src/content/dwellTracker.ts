interface DwellTrackerOptions {
  readonly onThresholdReached: () => Promise<void> | void
  readonly thresholdSeconds: number
}

export interface DwellTracker {
  destroy(): void
  pause(): void
  resume(): void
  start(): void
}

export function createDwellTracker(options: DwellTrackerOptions): DwellTracker {
  let accumulatedMilliseconds = 0
  let destroyed = false
  let lastResumeAt: number | null = null
  let thresholdReached = false
  let timerId: number | undefined

  async function flush(): Promise<void> {
    if (destroyed || thresholdReached) {
      return
    }

    if (lastResumeAt !== null) {
      accumulatedMilliseconds += Date.now() - lastResumeAt
      lastResumeAt = Date.now()
    }

    if (accumulatedMilliseconds >= options.thresholdSeconds * 1000) {
      thresholdReached = true
      clearTimer()
      await options.onThresholdReached()
    }
  }

  function clearTimer(): void {
    if (timerId !== undefined) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }

  function ensureTimer(): void {
    if (timerId !== undefined) {
      return
    }

    timerId = window.setInterval(() => {
      void flush()
    }, 1000)
  }

  return {
    destroy() {
      destroyed = true
      clearTimer()
      lastResumeAt = null
    },
    pause() {
      if (lastResumeAt !== null) {
        accumulatedMilliseconds += Date.now() - lastResumeAt
        lastResumeAt = null
      }
      clearTimer()
    },
    resume() {
      if (destroyed || thresholdReached || lastResumeAt !== null) {
        return
      }
      lastResumeAt = Date.now()
      ensureTimer()
    },
    start() {
      if (destroyed || thresholdReached) {
        return
      }
      accumulatedMilliseconds = 0
      lastResumeAt = Date.now()
      ensureTimer()
    }
  }
}
