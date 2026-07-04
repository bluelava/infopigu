// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { startAutoReadCountdown } from "../../src/content/autoReadCountdown"

describe("startAutoReadCountdown", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("stops repainting countdown state after the threshold is reached", async () => {
    vi.useFakeTimers()

    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }

    await startAutoReadCountdown({
      duplicateScore: null,
      kind: "unknown-duplicate-countdown",
      marker,
      onThresholdReached: async () => {
        marker.setState({ kind: "queued" })
      },
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      }
    })

    await vi.advanceTimersByTimeAsync(1100)

    const queuedCallCount = marker.setState.mock.calls.filter(
      ([state]) => state.kind === "queued"
    ).length
    const countdownCallCountAtThreshold = marker.setState.mock.calls.filter(
      ([state]) => state.kind === "unknown-duplicate-countdown"
    ).length

    await vi.advanceTimersByTimeAsync(1000)

    const countdownCallCountAfterThreshold = marker.setState.mock.calls.filter(
      ([state]) => state.kind === "unknown-duplicate-countdown"
    ).length

    expect(queuedCallCount).toBeGreaterThan(0)
    expect(countdownCallCountAfterThreshold).toBe(countdownCallCountAtThreshold)
  })
})
