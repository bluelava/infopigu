import { describe, expect, it } from "vitest"

import { detectLocale, resolveLocale } from "../../src/i18n/locales"

describe("locales", () => {
  it("maps Traditional Chinese browser locales to zh-TW", () => {
    expect(detectLocale("zh-TW")).toBe("zh-TW")
    expect(detectLocale("zh-HK")).toBe("zh-TW")
  })

  it("maps Simplified Chinese browser locales to zh-CN", () => {
    expect(detectLocale("zh-CN")).toBe("zh-CN")
    expect(detectLocale("zh-SG")).toBe("zh-CN")
  })

  it("falls back to English for non-Chinese locales", () => {
    expect(detectLocale("en-US")).toBe("en")
    expect(resolveLocale("auto", "fr-FR")).toBe("en")
  })
})
