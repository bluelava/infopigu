import { describe, expect, it, vi } from "vitest"

import {
  applyAnalysisJobUpdateToMarker,
  applyLatestAnalysisResultToMarker
} from "../../src/content/analysisJobProgress"
import {
  createAnalysisJobId,
  createDocumentId,
  createEmbeddingNamespaceId,
  createResultId,
  type ExtractedDocument
} from "../../src/shared/types"

function makeDocumentFixture(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    docId: createDocumentId("doc_fixture"),
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    domain: "example.com",
    title: "Article",
    blocks: [{ type: "paragraph", text: "Body" }],
    extractor: "generic-article",
    ...overrides
  }
}

function makeMarkerSpy() {
  return {
    setState: vi.fn(),
    setStatus: vi.fn()
  }
}

describe("analysis job progress", () => {
  it("maps matching queue snapshots onto marker states", () => {
    const marker = makeMarkerSpy()

    applyAnalysisJobUpdateToMarker({
      job: {
        completedTasks: 2,
        jobId: createAnalysisJobId("job_fixture"),
        stage: "embedding",
        totalTasks: 3
      },
      marker
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "embedding",
      completedTasks: 2,
      totalTasks: 3
    })
  })

  it("maps a completed matching result onto the final recommendation text", () => {
    const marker = makeMarkerSpy()

    applyLatestAnalysisResultToMarker({
      alreadyRead: true,
      document: makeDocumentFixture(),
      marker,
      readMode: "manual",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.2,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      }
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "completed",
      compactText: "20%",
      hideAction: true,
      text: "重复度 20% · 建议阅读"
    })
  })

  it("maps a completed matching result onto a manual mark-read state for unread manual pages", () => {
    const marker = makeMarkerSpy()

    applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture(),
      marker,
      readMode: "manual",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.2,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      }
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "manual-ready",
      duplicateScore: 0.2
    })
  })

  it("starts auto-read countdown for unread auto pages after analysis completes", async () => {
    const marker = makeMarkerSpy()
    const startAutoReadCountdown = vi.fn(async () => undefined)

    await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture(),
      marker,
      markDocumentRead: vi.fn(async () => undefined),
      readMode: "auto",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.2,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      },
      startAutoReadCountdown
    })

    expect(startAutoReadCountdown).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateScore: 0.2,
        kind: "countdown"
      })
    )
  })

  it("shows the novel-claims overlay immediately and celebrates knowledge gain after auto mark-read", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn(),
      showKnowledgeGain: vi.fn(),
      showNovelClaimsOverlay: vi.fn()
    }
    const startAutoReadCountdown = vi.fn(async ({
      onThresholdReached
    }: {
      onThresholdReached: () => void | Promise<void>
    }) => {
      await onThresholdReached()
    })
    const markDocumentRead = vi.fn(async () => undefined)

    await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture(),
      markDocumentRead,
      marker,
      readMode: "auto",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: ["新增 claim A", "新增 claim B"],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.2,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      },
      showNovelClaimsOverlayDurationMs: 20_000,
      showNovelClaimsOverlayMaxVisible: 1,
      startAutoReadCountdown
    })

    expect(marker.showNovelClaimsOverlay).toHaveBeenCalledWith({
      claims: ["新增 claim A", "新增 claim B"],
      durationMs: 20_000,
      maxVisibleClaims: 1
    })
    expect(markDocumentRead).toHaveBeenCalledTimes(1)
    expect(marker.showKnowledgeGain).toHaveBeenCalledWith({ count: 2 })
  })

  it("primes an empty KDB hover popup when the completed result has no novel claims", async () => {
    const marker = {
      primeNovelClaimsOverlay: vi.fn(),
      setState: vi.fn(),
      setStatus: vi.fn(),
      showKnowledgeGain: vi.fn(),
      showNovelClaimsOverlay: vi.fn()
    }

    await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture(),
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      readMode: "manual",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.2,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      },
      showNovelClaimsOverlayDurationMs: 20_000,
      showNovelClaimsOverlayMaxVisible: 5
    })

    expect(marker.primeNovelClaimsOverlay).toHaveBeenCalledWith({
      claims: [],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })
    expect(marker.showNovelClaimsOverlay).not.toHaveBeenCalled()
  })

  it("accepts a matching latest result when the page url only differs by hash or tracking params", async () => {
    const marker = makeMarkerSpy()
    const startAutoReadCountdown = vi.fn(async () => undefined)

    const applied = await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture({
        url: "https://weibo.com/2694995107/R3K4UDJmb?from=page_1005052694995107_profile&wvr=6&mod=weibotime&type=comment#_rnd"
      }),
      marker,
      markDocumentRead: vi.fn(async () => undefined),
      readMode: "auto",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://weibo.com/2694995107/R3K4UDJmb?from=page_1005052694995107_profile&wvr=6&mod=weibotime&type=comment",
          url: "https://weibo.com/2694995107/R3K4UDJmb"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.53,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.47,
          recommendation: "skim",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      },
      startAutoReadCountdown
    })

    expect(applied).toBe(true)
    expect(startAutoReadCountdown).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateScore: 0.53,
        kind: "countdown"
      })
    )
  })

  it("accepts a matching stored result even when latest result belongs to another page", async () => {
    const marker = makeMarkerSpy()
    const startAutoReadCountdown = vi.fn(async () => undefined)

    const applied = await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture({
        url: "https://weibo.com/2694995107/R3K4UDJmb?from=page_1005052694995107_profile&wvr=6",
        canonicalUrl: "https://weibo.com/2694995107/R3K4UDJmb?from=page_1005052694995107_profile&wvr=6"
      }),
      marker,
      markDocumentRead: vi.fn(async () => undefined),
      readMode: "auto",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "complete",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/other-page",
          url: "https://example.com/other-page"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.12,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.88,
          recommendation: "read",
          resultId: createResultId("result_other_fixture")
        },
        similarSources: []
      },
      startAutoReadCountdown,
      storedResultByUrl: {
        claims: [],
        duplicateClaims: [],
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://weibo.com/2694995107/R3K4UDJmb?from=page_1005052694995107_profile&wvr=6",
          url: "https://weibo.com/2694995107/R3K4UDJmb"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0.53,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0.47,
          recommendation: "skim",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      }
    })

    expect(applied).toBe(true)
    expect(startAutoReadCountdown).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateScore: 0.53,
        kind: "countdown"
      })
    )
  })

  it("maps insufficient-content results onto a non-actionable marker state", async () => {
    const marker = makeMarkerSpy()

    const applied = await applyLatestAnalysisResultToMarker({
      alreadyRead: false,
      document: makeDocumentFixture(),
      marker,
      readMode: "auto",
      result: {
        claims: [],
        duplicateClaims: [],
        judgement: "insufficient-content",
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        novelClaims: [],
        page: {
          canonicalUrl: "https://example.com/article",
          url: "https://example.com/article"
        },
        persisted: true,
        result: {
          createdAt: 1,
          docId: createDocumentId("doc_fixture"),
          duplicateScore: 0,
          matchedClaimIds: [],
          novelClaimIds: [],
          noveltyScore: 0,
          recommendation: "read",
          resultId: createResultId("result_fixture")
        },
        similarSources: []
      }
    })

    expect(applied).toBe(true)
    expect(marker.setState).toHaveBeenCalledWith({
      kind: "insufficient-content"
    })
  })
})
