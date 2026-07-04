import type { AnalysisJobRecord } from "../shared/types"

export interface AnalysisJobQueueSnapshot {
  readonly activeJob:
    | {
        readonly canonicalUrl: string
        readonly jobId: AnalysisJobRecord["jobId"]
        readonly lastError?: string
        readonly stage: AnalysisJobRecord["stage"]
        readonly title?: string
        readonly completedTasks?: number
        readonly pendingTasks?: number
        readonly totalTasks?: number
        readonly url: string
      }
    | null
  readonly latestCompletedJob:
    | {
        readonly jobId: AnalysisJobRecord["jobId"]
        readonly lastError?: string
        readonly stage: "completed" | "failed"
        readonly title: string
      }
    | null
  readonly pendingJobs: readonly {
    readonly canonicalUrl: string
    readonly jobId: AnalysisJobRecord["jobId"]
    readonly title: string
    readonly url: string
  }[]
}

interface AnalysisJobsRepositoryLike {
  enqueueJob(job: AnalysisJobRecord): Promise<void>
  getJobById(jobId: AnalysisJobRecord["jobId"]): Promise<AnalysisJobRecord | undefined>
  listPendingJobs(): Promise<readonly AnalysisJobRecord[]>
  saveJob(job: AnalysisJobRecord): Promise<void>
  deleteJob(jobId: AnalysisJobRecord["jobId"]): Promise<void>
}

export function createAnalysisJobQueue(input: {
  readonly jobsRepository: AnalysisJobsRepositoryLike
  readonly publishSnapshot: (snapshot: AnalysisJobQueueSnapshot) => Promise<void> | void
  readonly runJob: (
    job: AnalysisJobRecord,
    updateJob: (job: AnalysisJobRecord) => Promise<void>
  ) => Promise<void>
}) {
  let activeJobId: AnalysisJobRecord["jobId"] | null = null
  let isDraining = false
  let latestCompletedJob: AnalysisJobQueueSnapshot["latestCompletedJob"] = null

  async function createSnapshot(): Promise<AnalysisJobQueueSnapshot> {
    const queuedJobs = await input.jobsRepository.listPendingJobs()
    const activeJob =
      activeJobId === null ? null : await input.jobsRepository.getJobById(activeJobId)

    return {
      activeJob:
        activeJob === undefined || activeJob === null
          ? null
          : {
              canonicalUrl: activeJob.canonicalUrl,
              jobId: activeJob.jobId,
              stage: activeJob.stage,
              title: activeJob.title,
              completedTasks: activeJob.completedTasks,
              pendingTasks: activeJob.pendingTasks,
              totalTasks: activeJob.totalTasks,
              ...(activeJob.lastError === undefined ? {} : { lastError: activeJob.lastError }),
              url: activeJob.url
            },
      latestCompletedJob,
      pendingJobs: queuedJobs
        .filter((job) => job.jobId !== activeJobId)
        .map((job) => ({
          canonicalUrl: job.canonicalUrl,
          jobId: job.jobId,
          title: job.title,
          url: job.url
        }))
    }
  }

  async function publishCurrentSnapshot(): Promise<void> {
    await input.publishSnapshot(await createSnapshot())
  }

  async function updateJob(job: AnalysisJobRecord): Promise<void> {
    await input.jobsRepository.saveJob(job)
    await publishCurrentSnapshot()
  }

  async function drainQueue(): Promise<void> {
    if (isDraining) {
      return
    }

    isDraining = true

    try {
      while (true) {
        const pendingJobs = await input.jobsRepository.listPendingJobs()
        const nextJob = pendingJobs[0]

        if (nextJob === undefined) {
          activeJobId = null
          await publishCurrentSnapshot()
          return
        }

        activeJobId = nextJob.jobId
        await publishCurrentSnapshot()

        try {
          await input.runJob(nextJob, updateJob)
          latestCompletedJob = {
            jobId: nextJob.jobId,
            stage: "completed",
            title: nextJob.title
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown analysis job error"

          await updateJob({
            ...nextJob,
            stage: "failed",
            lastError: message
          })
          latestCompletedJob = {
            jobId: nextJob.jobId,
            lastError: message,
            stage: "failed",
            title: nextJob.title
          }
        }

        await input.jobsRepository.deleteJob(nextJob.jobId)
        activeJobId = null
        await publishCurrentSnapshot()
      }
    } finally {
      isDraining = false
    }
  }

  return {
    async enqueue(job: AnalysisJobRecord): Promise<void> {
      await input.jobsRepository.enqueueJob(job)
      await publishCurrentSnapshot()
      await drainQueue()
    },

    async restorePendingJobs(): Promise<void> {
      await publishCurrentSnapshot()
      await drainQueue()
    }
  }
}

export function createJobProgressObserver(input: {
  readonly currentJobId: AnalysisJobRecord["jobId"]
  readonly onJobUpdate: (job: {
    readonly jobId: AnalysisJobRecord["jobId"]
    readonly lastError?: string
    readonly stage: AnalysisJobRecord["stage"] | "completed" | "failed"
  }) => void
}) {
  return {
    onSnapshot(snapshot: AnalysisJobQueueSnapshot): void {
      const activeJob = snapshot.activeJob
      if (activeJob !== null && activeJob.jobId === input.currentJobId) {
        input.onJobUpdate(activeJob)
        return
      }

      const latestCompletedJob = snapshot.latestCompletedJob
      if (latestCompletedJob !== null && latestCompletedJob.jobId === input.currentJobId) {
        input.onJobUpdate(latestCompletedJob)
        return
      }

      const pendingJob = snapshot.pendingJobs.find((job) => job.jobId === input.currentJobId)
      if (pendingJob !== undefined) {
        input.onJobUpdate({
          jobId: pendingJob.jobId,
          stage: "queued"
        })
      }
    }
  }
}
