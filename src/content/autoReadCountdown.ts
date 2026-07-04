import { createDwellTracker } from "./dwellTracker"
import type { OperationalSettings } from "./contentBootstrap"
import type { StatusMarker } from "./pageMarker"

export async function startAutoReadCountdown(input: {
  readonly duplicateScore: number | null
  readonly kind: "countdown" | "unknown-duplicate-countdown"
  readonly marker: StatusMarker
  readonly onThresholdReached: () => Promise<void> | void
  readonly settings: OperationalSettings
}): Promise<{ destroy(): void }> {
  if (input.kind === "countdown") {
    input.marker.setState({
      kind: "countdown",
      duplicateScore: input.duplicateScore,
      progressPercent: 0
    })
  } else {
    input.marker.setState({
      kind: "unknown-duplicate-countdown",
      progressPercent: 0
    })
  }

  let startedAt = Date.now()
  let pausedAt: number | null = null
  let pausedDuration = 0
  let progressTimerId: number | undefined
  let destroyed = false

  function clearProgressTimer(): void {
    if (progressTimerId !== undefined) {
      window.clearInterval(progressTimerId)
      progressTimerId = undefined
    }
  }

  function renderProgress(progressPercent: number): void {
    if (input.kind === "countdown") {
      input.marker.setState({
        kind: "countdown",
        duplicateScore: input.duplicateScore,
        progressPercent
      })
      return
    }

    input.marker.setState({
      kind: "unknown-duplicate-countdown",
      progressPercent
    })
  }

  function cleanupListeners(): void {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    window.removeEventListener("blur", handleBlur)
    window.removeEventListener("focus", handleFocus)
  }

  function stopCountdownRendering(): void {
    destroyed = true
    clearProgressTimer()
    cleanupListeners()
  }

  function updateProgress(): void {
    if (destroyed) {
      return
    }

    const elapsedMs = Date.now() - startedAt - pausedDuration
    const progressPercent = Math.min(
      100,
      Math.round((elapsedMs / (input.settings.dwellThresholdSeconds * 1000)) * 100)
    )

    renderProgress(progressPercent)
  }

  const dwellTracker = createDwellTracker({
    thresholdSeconds: input.settings.dwellThresholdSeconds,
    onThresholdReached: async () => {
      if (destroyed) {
        return
      }

      stopCountdownRendering()
      await input.onThresholdReached()
      dwellTracker.destroy()
    }
  })

  function handleVisibilityChange(): void {
    if (destroyed) {
      return
    }

    if (document.hidden) {
      pausedAt = Date.now()
      dwellTracker.pause()
      clearProgressTimer()
      return
    }

    if (pausedAt !== null) {
      pausedDuration += Date.now() - pausedAt
      pausedAt = null
    }
    dwellTracker.resume()
    clearProgressTimer()
    progressTimerId = window.setInterval(updateProgress, 250)
  }

  const handleBlur = () => {
    if (destroyed) {
      return
    }

    pausedAt = Date.now()
    dwellTracker.pause()
    clearProgressTimer()
  }

  const handleFocus = () => {
    if (destroyed) {
      return
    }

    if (pausedAt !== null) {
      pausedDuration += Date.now() - pausedAt
      pausedAt = null
    }
    dwellTracker.resume()
    clearProgressTimer()
    progressTimerId = window.setInterval(updateProgress, 250)
  }

  progressTimerId = window.setInterval(updateProgress, 250)
  dwellTracker.start()
  document.addEventListener("visibilitychange", handleVisibilityChange)
  window.addEventListener("blur", handleBlur)
  window.addEventListener("focus", handleFocus)

  return {
    destroy() {
      stopCountdownRendering()
      dwellTracker.destroy()
    }
  }
}
