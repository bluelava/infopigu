import { describe, expect, it, vi } from "vitest"

import {
  createAnalysisJobQueue,
  createJobProgressObserver
} from "../../src/background/analysisJobQueue"
import {
  createAnalysisJobId,
  createDocumentId,
  createProviderId,
  type AnalysisJobRecord
} from "../../src/shared/types"

function makeAnalysisJobFixture(jobId: string, createdAt: number): AnalysisJobRecord {
  return {
    jobId: createAnalysisJobId(jobId),
    docId: createDocumentId(`doc_${jobId}`),
    title: `Document ${jobId}`,
    url: `https://example.com/${jobId}`,
    canonicalUrl: `https://example.com/${jobId}`,
    document: {
      docId: createDocumentId(`doc_${jobId}`),
      url: `https://example.com/${jobId}`,
      canonicalUrl: `https://example.com/${jobId}`,
      domain: "example.com",
      title: `Document ${jobId}`,
      blocks: [{ type: "paragraph", text: "Fixture body" }],
      extractor: "generic-article"
    },
    claimProviderId: createProviderId("provider_claim"),
    claimModel: "gpt-4.1-mini",
    embeddingProviderId: createProviderId("provider_embedding"),
    embeddingModel: "text-embedding-3-small",
    stage: "queued",
    createdAt,
    completedTasks: 0,
    pendingTasks: 0,
    totalTasks: 0
  }
}

function createInMemoryJobsRepository(initialJobs: readonly AnalysisJobRecord[] = []) {
  const jobs = new Map(initialJobs.map((job) => [job.jobId, job]))

  return {
    async enqueueJob(job: AnalysisJobRecord) {
      jobs.set(job.jobId, job)
    },
    async getJobById(jobId: AnalysisJobRecord["jobId"]) {
      return jobs.get(jobId)
    },
    async listPendingJobs() {
      return [...jobs.values()].sort((left, right) => left.createdAt - right.createdAt)
    },
    async saveJob(job: AnalysisJobRecord) {
      jobs.set(job.jobId, job)
    },
    async deleteJob(jobId: AnalysisJobRecord["jobId"]) {
      jobs.delete(jobId)
    }
  }
}

describe("analysis job queue", () => {
  it("runs queued jobs in FIFO order", async () => {
    const jobsRepository = createInMemoryJobsRepository()
    const executionOrder: string[] = []
    const queue = createAnalysisJobQueue({
      jobsRepository,
      publishSnapshot: async () => undefined,
      runJob: async (job) => {
        executionOrder.push(job.jobId)
      }
    })

    await queue.enqueue(makeAnalysisJobFixture("job_1", 1))
    await queue.enqueue(makeAnalysisJobFixture("job_2", 2))

    expect(executionOrder).toEqual(["job_1", "job_2"])
  })

  it("restores pending jobs after a simulated worker restart", async () => {
    const jobsRepository = createInMemoryJobsRepository([makeAnalysisJobFixture("job_restore", 1)])
    const runJobSpy = vi.fn(async () => undefined)
    const queue = createAnalysisJobQueue({
      jobsRepository,
      publishSnapshot: async () => undefined,
      runJob: runJobSpy
    })

    await queue.restorePendingJobs()

    expect(runJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: createAnalysisJobId("job_restore") }),
      expect.any(Function)
    )
  })

  it("ignores queue snapshot updates for unrelated jobs", async () => {
    const onJobUpdateSpy = vi.fn()
    const observer = createJobProgressObserver({
      currentJobId: createAnalysisJobId("job_page_a"),
      onJobUpdate: onJobUpdateSpy
    })

    observer.onSnapshot({
      activeJob: {
        canonicalUrl: "https://example.com/job_page_b",
        jobId: createAnalysisJobId("job_page_b"),
        stage: "embedding",
        url: "https://example.com/job_page_b"
      },
      latestCompletedJob: null,
      pendingJobs: []
    })

    expect(onJobUpdateSpy).not.toHaveBeenCalled()
  })

  it("publishes the underlying failure reason when a queued analysis job crashes", async () => {
    const jobsRepository = createInMemoryJobsRepository()
    const snapshots: unknown[] = []
    const queue = createAnalysisJobQueue({
      jobsRepository,
      publishSnapshot: async (snapshot) => {
        snapshots.push(snapshot)
      },
      runJob: async () => {
        throw new Error("Embedding provider request failed")
      }
    })

    await queue.enqueue(makeAnalysisJobFixture("job_failed", 1))

    expect(snapshots).toContainEqual(
      expect.objectContaining({
        latestCompletedJob: expect.objectContaining({
          jobId: createAnalysisJobId("job_failed"),
          stage: "failed",
          lastError: "Embedding provider request failed"
        })
      })
    )
  })
})
