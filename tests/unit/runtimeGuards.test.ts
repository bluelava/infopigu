import { describe, expect, it } from "vitest"

import { isIgnorableExtensionContextError } from "../../src/content/runtimeGuards"

describe("runtime guards", () => {
  it("treats extension context invalidation errors as ignorable", () => {
    expect(
      isIgnorableExtensionContextError(new Error("Extension context invalidated."))
    ).toBe(true)
    expect(
      isIgnorableExtensionContextError(new Error("Could not establish connection. Receiving end does not exist."))
    ).toBe(true)
  })

  it("keeps unrelated errors actionable", () => {
    expect(isIgnorableExtensionContextError(new Error("side panel open failed"))).toBe(false)
  })
})
