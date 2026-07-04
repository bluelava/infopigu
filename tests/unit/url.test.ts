import { describe, expect, it } from "vitest"

import {
  canonicalizeUrl,
  domainMatchesWhitelist,
  extractDomainFromUrl,
  resolveWhitelistDomain
} from "../../src/core/url"

describe("url helpers", () => {
  it("canonicalizes URLs by removing hash and tracking params", () => {
    const canonicalUrl = canonicalizeUrl(
      "https://example.com/path/?utm_source=x&utm_medium=y&id=42#section"
    )

    expect(canonicalUrl).toBe("https://example.com/path?id=42")
  })

  it("matches whitelisted domains for root and subdomain hosts", () => {
    expect(domainMatchesWhitelist("news.example.com", ["example.com"])).toBe(true)
    expect(domainMatchesWhitelist("example.com", ["example.com"])).toBe(true)
    expect(domainMatchesWhitelist("fakeexample.com", ["example.com"])).toBe(false)
  })

  it("resolves subdomains back to the exact whitelisted domain bucket", () => {
    expect(resolveWhitelistDomain("news.example.com", ["example.com"])).toBe("example.com")
    expect(resolveWhitelistDomain("mp.weixin.qq.com", ["weixin.qq.com", "mp.weixin.qq.com"])).toBe(
      "mp.weixin.qq.com"
    )
    expect(resolveWhitelistDomain("fakeexample.com", ["example.com"])).toBeNull()
  })

  it("canonicalizes weibo detail urls by stripping page-state query params", () => {
    const canonicalUrl = canonicalizeUrl(
      "https://weibo.com/2694995107/R3K4UDJmb?pagetype=homefeed&from=page_1005052694995107_profile&wvr=6&refer_flag=1001030103_"
    )

    expect(canonicalUrl).toBe("https://weibo.com/2694995107/R3K4UDJmb")
  })

  it("canonicalizes weibo detail urls by trimming non-alphanumeric suffixes from the final path segment", () => {
    expect(canonicalizeUrl("https://weibo.com/2194035935/R6VDpfsSN#attitude")).toBe(
      "https://weibo.com/2194035935/R6VDpfsSN"
    )
    expect(canonicalizeUrl("https://weibo.com/2194035935/R6VDpfsSN%23attitude")).toBe(
      "https://weibo.com/2194035935/R6VDpfsSN"
    )
    expect(canonicalizeUrl("https://www.weibo.com/2194035935/R6VDpfsSN?type=comment#attitude")).toBe(
      "https://weibo.com/2194035935/R6VDpfsSN"
    )
  })

  it("canonicalizes supported social hosts by stripping a leading www subdomain", () => {
    expect(canonicalizeUrl("https://www.weibo.com/1657210044/R6PwixIhq")).toBe(
      "https://weibo.com/1657210044/R6PwixIhq"
    )
    expect(canonicalizeUrl("https://www.x.com/dotey/status/2059729329119006928")).toBe(
      "https://x.com/dotey/status/2059729329119006928"
    )
  })

  it("canonicalizes x detail urls by stripping all query params", () => {
    expect(
      canonicalizeUrl("https://x.com/dotey/status/2059729329119006928?s=20&t=abc123&utm_source=share")
    ).toBe("https://x.com/dotey/status/2059729329119006928")
    expect(canonicalizeUrl("https://www.x.com/dotey/status/2059729329119006928?src=timeline")).toBe(
      "https://x.com/dotey/status/2059729329119006928"
    )
  })

  it("extracts the domain from a valid URL string", () => {
    expect(extractDomainFromUrl("https://mp.weixin.qq.com/s/some-article")).toBe("mp.weixin.qq.com")
  })
})
