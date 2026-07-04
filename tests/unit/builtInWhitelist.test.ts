import { describe, expect, it } from "vitest"

import {
  BUILT_IN_WHITELIST_DOMAINS,
  resolveAutoManagedWhitelistDomains
} from "../../src/core/builtInWhitelist"

describe("resolveAutoManagedWhitelistDomains", () => {
  it("seeds the built-in supported domains when the whitelist is empty", () => {
    expect(resolveAutoManagedWhitelistDomains([])).toEqual(BUILT_IN_WHITELIST_DOMAINS)
  })

  it("extends a built-in-only whitelist with newly supported domains", () => {
    expect(resolveAutoManagedWhitelistDomains(["weibo.com", "x.com", "mp.weixin.qq.com"])).toEqual(
      BUILT_IN_WHITELIST_DOMAINS
    )
  })

  it("keeps custom-only whitelists untouched", () => {
    expect(resolveAutoManagedWhitelistDomains(["example.com"])).toEqual(["example.com"])
  })

  it("keeps mixed custom whitelists untouched", () => {
    expect(resolveAutoManagedWhitelistDomains(["weibo.com", "example.com"])).toEqual([
      "weibo.com",
      "example.com"
    ])
  })
})
