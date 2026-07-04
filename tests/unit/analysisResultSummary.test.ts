import { describe, expect, it } from "vitest"

import {
  createExistingAnalysisResultSummaryFromStoredSnapshot,
  mergeExistingAnalysisResultSummary,
  resolveStoredAnalysisSnapshotByUrl,
  type ExistingAnalysisResultSummary,
  type StoredAnalysisSnapshot
} from "../../src/content/analysisResultSummary"
import {
  createClaimId,
  createDocumentId,
  createEmbeddingNamespaceId,
  createResultId
} from "../../src/shared/types"

function makeStoredSnapshot(
  overrides: Partial<StoredAnalysisSnapshot> = {}
): StoredAnalysisSnapshot {
  return {
    claims: [],
    duplicateClaims: [],
    namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
    novelClaims: ["stored novel claim"],
    persisted: true,
    result: {
      resultId: createResultId("result_fixture"),
      docId: createDocumentId("doc_fixture"),
      duplicateScore: 0.12,
      noveltyScore: 0.88,
      recommendation: "read",
      matchedClaimIds: [],
      novelClaimIds: [createClaimId("claim_fixture")],
      createdAt: 1
    },
    similarSources: [],
    sourceExtractor: "weibo-article",
    page: {
      canonicalUrl: "https://weibo.com/example/post",
      url: "https://weibo.com/example/post"
    },
    ...overrides
  }
}

describe("analysisResultSummary", () => {
  it("resolves stored snapshots by canonicalized url variants", () => {
    const snapshot = makeStoredSnapshot()

    expect(
      resolveStoredAnalysisSnapshotByUrl(
        {
          "https://weibo.com/example/post": snapshot
        },
        {
          canonicalUrl: "https://weibo.com/example/post",
          url: "https://weibo.com/example/post?from=feed"
        }
      )
    ).toBe(snapshot)
  })

  it("resolves stored snapshots across www host aliases for weibo detail pages", () => {
    const snapshot = makeStoredSnapshot({
      page: {
        canonicalUrl: "https://www.weibo.com/example/post",
        url: "https://www.weibo.com/example/post?pagetype=homefeed"
      }
    })

    expect(
      resolveStoredAnalysisSnapshotByUrl(
        {
          "https://www.weibo.com/example/post?pagetype=homefeed": snapshot
        },
        {
          canonicalUrl: "https://weibo.com/example/post",
          url: "https://weibo.com/example/post"
        }
      )
    ).toBe(snapshot)
  })

  it("creates an existing-analysis summary from a stored snapshot", () => {
    expect(createExistingAnalysisResultSummaryFromStoredSnapshot(makeStoredSnapshot())).toEqual({
      duplicateScore: 0.12,
      novelClaims: ["stored novel claim"],
      recommendation: "read",
      sourceExtractor: "weibo-article"
    })
  })

  it("fills missing runtime novel claims from the stored snapshot without overwriting runtime extractor", () => {
    const runtimeResult: ExistingAnalysisResultSummary = {
      duplicateScore: 0.12,
      novelClaims: [],
      recommendation: "read",
      sourceExtractor: "weibo-article"
    }

    expect(
      mergeExistingAnalysisResultSummary(
        runtimeResult,
        createExistingAnalysisResultSummaryFromStoredSnapshot(
          makeStoredSnapshot({
            sourceExtractor: "feed-item"
          })
        )
      )
    ).toEqual({
      duplicateScore: 0.12,
      novelClaims: ["stored novel claim"],
      recommendation: "read",
      sourceExtractor: "weibo-article"
    })
  })

  it("falls back to the stored summary when runtime has no existing result", () => {
    expect(
      mergeExistingAnalysisResultSummary(
        null,
        createExistingAnalysisResultSummaryFromStoredSnapshot(makeStoredSnapshot())
      )
    ).toEqual({
      duplicateScore: 0.12,
      novelClaims: ["stored novel claim"],
      recommendation: "read",
      sourceExtractor: "weibo-article"
    })
  })
})
