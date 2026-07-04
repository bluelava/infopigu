import { describe, expect, it } from "vitest"

import { z } from "../../src/shared/zod"

describe("shared zod config", () => {
  it("enables jitless mode for strict CSP environments", () => {
    expect(z.config().jitless).toBe(true)
  })
})
