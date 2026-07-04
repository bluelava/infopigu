import { describe, expect, it } from "vitest"

import {
  createAnalysisSnapshotStorageKey,
  normalizeAnalysisResultsByUrl
} from "../../src/shared/analysisSnapshotStorage"

describe("analysisSnapshotStorage", () => {
  it("uses the cleaned canonical url as the storage key", () => {
    expect(
      createAnalysisSnapshotStorageKey(
        "https://weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed"
      )
    ).toBe("https://weibo.com/1433680664/R6RcP4wLB")
  })

  it("collapses duplicate url variants into one canonical snapshot entry", () => {
    const snapshot = {
      page: {
        canonicalUrl: "https://weibo.com/1433680664/R6RcP4wLB",
        url: "https://weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed"
      }
    }

    expect(
      normalizeAnalysisResultsByUrl({
        "https://weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed": snapshot,
        "https://www.weibo.com/1433680664/R6RcP4wLB": snapshot
      })
    ).toEqual({
      "https://weibo.com/1433680664/R6RcP4wLB": snapshot
    })
  })
})
