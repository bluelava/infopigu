import type { AnalysisJobRecord, AnalysisJobStage } from "../shared/types"
import type { CognitiveDeltaDb } from "../db/indexeddb"
import { createCanonicalUrlLookupVariants } from "../core/url"

const executableStages: readonly AnalysisJobStage[] = [
  "queued",
  "claiming",
  "embedding",
  "persisting"
]

function isExecutableStage(stage: AnalysisJobStage): boolean {
  return executableStages.includes(stage)
}

export function createAnalysisJobsRepository(database: CognitiveDeltaDb) {
  return {
    async enqueueJob(job: AnalysisJobRecord): Promise<void> {
      const existingJobs = await database.analysisJobs.toArray()
      const duplicatePendingJob = existingJobs.find(
        (candidate) =>
          candidate.canonicalUrl === job.canonicalUrl && isExecutableStage(candidate.stage)
      )

      if (duplicatePendingJob !== undefined) {
        await database.analysisJobs.delete(duplicatePendingJob.jobId)
      }

      await database.analysisJobs.put(job)
    },

    async getJobById(jobId: AnalysisJobRecord["jobId"]): Promise<AnalysisJobRecord | undefined> {
      return database.analysisJobs.get(jobId)
    },

    async findExecutableJobByExactUrl(input: {
      readonly canonicalUrl: string
      readonly url: string
    }): Promise<AnalysisJobRecord | undefined> {
      const jobs = await database.analysisJobs.toArray()
      const canonicalUrlVariants = new Set(createCanonicalUrlLookupVariants(input.canonicalUrl))
      const urlVariants = new Set(createCanonicalUrlLookupVariants(input.url))

      return jobs.find(
        (job) =>
          isExecutableStage(job.stage) &&
          (canonicalUrlVariants.has(job.canonicalUrl) || urlVariants.has(job.url))
      )
    },

    async listPendingJobs(): Promise<readonly AnalysisJobRecord[]> {
      const jobs = await database.analysisJobs.toArray()

      return jobs
        .filter((job) => isExecutableStage(job.stage))
        .sort((left, right) => left.createdAt - right.createdAt)
    },

    async saveJob(job: AnalysisJobRecord): Promise<void> {
      await database.analysisJobs.put(job)
    },

    async deleteJob(jobId: AnalysisJobRecord["jobId"]): Promise<void> {
      await database.analysisJobs.delete(jobId)
    }
  }
}
