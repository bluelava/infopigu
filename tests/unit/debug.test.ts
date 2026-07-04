import { describe, expect, it, vi } from "vitest"

import { createDebugLogger, debugLog, serializeDebugError } from "../../src/shared/debug"

describe("debug helpers", () => {
  it("logs with a stable prefix and scope", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)

    debugLog("content", "analysis started", { title: "Test title" })

    expect(consoleSpy).toHaveBeenCalledWith(
      "[CognitiveDelta][content]",
      "analysis started",
      expect.objectContaining({ title: "Test title" })
    )

    consoleSpy.mockRestore()
  })

  it("serializes errors into readable payloads", () => {
    expect(serializeDebugError(new Error("boom"))).toEqual(
      expect.objectContaining({
        message: "boom",
        name: "Error"
      })
    )
  })

  it("skips debug logging when disabled", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const logger = createDebugLogger("background", false)

    logger("hidden message")

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
