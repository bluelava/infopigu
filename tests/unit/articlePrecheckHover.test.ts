// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { startArticlePrecheckFlow } from "../../src/content/articlePrecheckFlow"
import { createFloatingMarker } from "../../src/content/pageMarker"
import { createDocumentId } from "../../src/shared/types"

describe("article precheck hover restoration", () => {
  it("keeps cached novel claims available for KDB hover after an already-read article reload", async () => {
    vi.useFakeTimers()

    try {
      const marker = createFloatingMarker(() => undefined)

      await startArticlePrecheckFlow({
        checkUrlHistory: vi.fn(async () => ({
          duplicateScore: 1,
          kind: "already-read" as const
        })),
        getExistingAnalysisResult: vi.fn(async () => ({
          duplicateScore: 0.53,
          novelClaims: ["刷新后仍应可从 KDB hover 看到的新知识点"],
          recommendation: "skim" as const
        })),
        document: {
          docId: createDocumentId("doc_existing_article_hover"),
          url: "https://example.com/existing-article-hover",
          canonicalUrl: "https://example.com/existing-article-hover",
          domain: "example.com",
          title: "Existing article hover",
          blocks: [{ type: "paragraph", text: "Existing body hover" }],
          extractor: "generic-article"
        },
        enqueueAnalysisJob: vi.fn(async () => undefined),
        markDocumentRead: vi.fn(async () => undefined),
        marker,
        runDuplicatePrecheck: vi.fn(),
        settings: {
          autoAnalyzeEnabled: true,
          debugLoggingEnabled: true,
          dwellThresholdSeconds: 1,
          novelClaimsOverlaySeconds: 5,
          novelClaimsOverlayMaxVisible: 5,
          singleArticleReadMode: "auto",
          feedItemReadMode: "manual"
        },
        startAutoReadCountdown: vi.fn(async () => undefined)
      })

      vi.advanceTimersByTime(5_000)

      expect(document.querySelector(".cognitive-delta-claims-overlay")).toBeNull()

      const knowledgeBadge = document.querySelector(
        ".cognitive-delta-floating-shell .cognitive-delta-kdb-wrap"
      ) as HTMLElement | null

      knowledgeBadge?.dispatchEvent(new Event("pointerenter", { bubbles: true }))

      expect(document.querySelector(".cognitive-delta-claims-overlay")?.textContent).toContain(
        "刷新后仍应可从 KDB hover 看到的新知识点"
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
