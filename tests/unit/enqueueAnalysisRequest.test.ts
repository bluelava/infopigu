import { describe, expect, it, vi } from "vitest"

import { resolveEnqueueAnalysisRequest } from "../../src/background/enqueueAnalysisRequest"
import {
  createAnalysisJobId,
  createDocumentId,
  createProviderId,
  type AnalysisJobRecord,
  type ExtractedDocument
} from "../../src/shared/types"

function makeDocumentFixture(): ExtractedDocument {
  return {
    docId: createDocumentId("doc_fixture"),
    url: "https://weibo.com/123456/abcdef",
    canonicalUrl: "https://weibo.com/123456/abcdef",
    domain: "weibo.com",
    title: "微博正文",
    blocks: [{ type: "paragraph", text: "微博正文内容" }],
    extractor: "feed-item"
  }
}

function makeJobFixture(): AnalysisJobRecord {
  const document = makeDocumentFixture()

  return {
    jobId: createAnalysisJobId("job_existing"),
    docId: document.docId,
    title: document.title,
    url: document.url,
    canonicalUrl: document.canonicalUrl,
    document,
    claimProviderId: createProviderId("provider_claim"),
    claimModel: "gpt-4.1-mini",
    embeddingProviderId: createProviderId("provider_embedding"),
    embeddingModel: "text-embedding-3-small",
    stage: "queued",
    createdAt: 1,
    completedTasks: 0,
    pendingTasks: 0,
    totalTasks: 0
  }
}

describe("resolveEnqueueAnalysisRequest", () => {
  it("skips enqueue when the exact url is already stored as read", async () => {
    const document = makeDocumentFixture()

    await expect(
      resolveEnqueueAnalysisRequest({
        checkDocumentUrlHistory: vi.fn(async () => ({
          duplicateScore: 1,
          kind: "already-read" as const
        })),
        document,
        findExecutableJobByExactUrl: vi.fn(async () => undefined)
      })
    ).resolves.toEqual({
      kind: "skip-existing-document"
    })
  })

  it("reuses the existing executable job for the same canonical url", async () => {
    const document = makeDocumentFixture()
    const existingJob = makeJobFixture()

    await expect(
      resolveEnqueueAnalysisRequest({
        checkDocumentUrlHistory: vi.fn(async () => null),
        document,
        findExecutableJobByExactUrl: vi.fn(async () => existingJob)
      })
    ).resolves.toEqual({
      kind: "reuse-existing-job",
      job: existingJob
    })
  })

  it("allows a fresh enqueue when the document is not read and no job exists", async () => {
    const document = makeDocumentFixture()

    await expect(
      resolveEnqueueAnalysisRequest({
        checkDocumentUrlHistory: vi.fn(async () => null),
        document,
        findExecutableJobByExactUrl: vi.fn(async () => undefined)
      })
    ).resolves.toEqual({
      kind: "enqueue-new-job"
    })
  })
})
