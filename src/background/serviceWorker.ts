import browser from "webextension-polyfill"

import { createAnalysisJobQueue } from "./analysisJobQueue"
import { createAnalysisJobsRepository } from "./analysisJobsRepo"
import type { AnalysisPipelineResult } from "./analysisPipeline"
import { createApiRouter } from "./apiRouter"
import { syncRegisteredContentScripts } from "./contentRegistration"
import { resolveEnqueueAnalysisRequest } from "./enqueueAnalysisRequest"
import { createTaskQueue } from "./taskQueue"
import { resolveAutoManagedWhitelistDomains } from "../core/builtInWhitelist"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createProvidersRepository } from "../db/providersRepo"
import { createWhitelistRepository } from "../db/whitelistRepo"
import { createSettingsRepository } from "../db/settingsRepo"
import {
  createAnalysisSnapshotStorageKey,
  normalizeAnalysisResultsByUrl
} from "../shared/analysisSnapshotStorage"
import { debugLog, serializeDebugError, setDebugLoggingEnabled } from "../shared/debug"
import { runtimeMessageSchema } from "../shared/messages"
import {
  createAnalysisJobId,
  createProviderId,
  parseExtractedDocument,
  type AnalysisJobRecord
} from "../shared/types"

const database = createCognitiveDeltaDb()
const apiRouter = createApiRouter(database)
const analysisJobsRepository = createAnalysisJobsRepository(database)
const providersRepository = createProvidersRepository(database)
const queue = createTaskQueue()
const settingsRepository = createSettingsRepository(database)

function createStoredAnalysisSnapshot(
  result: AnalysisPipelineResult,
  document: ReturnType<typeof parseExtractedDocument>
) {
  return {
    ...result,
    sourceExtractor: document.extractor,
    page: {
      canonicalUrl: document.canonicalUrl,
      url: document.url
    }
  }
}

async function persistLatestAnalysisSnapshot(input: {
  readonly document: ReturnType<typeof parseExtractedDocument>
  readonly result: AnalysisPipelineResult
}): Promise<void> {
  const snapshot = createStoredAnalysisSnapshot(input.result, input.document)
  const stored = await browser.storage.local.get("analysisResultsByUrl")
  const existingSnapshots = normalizeAnalysisResultsByUrl(
    stored["analysisResultsByUrl"] as Record<string, typeof snapshot> | undefined
  )
  const storageKey = createAnalysisSnapshotStorageKey(input.document.canonicalUrl)

  await browser.storage.local.set({
    analysisResultsByUrl: {
      ...existingSnapshots,
      [storageKey]: snapshot
    },
    latestAnalysisResult: snapshot
  })
}

const analysisJobQueue = createAnalysisJobQueue({
  jobsRepository: analysisJobsRepository,
  publishSnapshot: async (snapshot) => {
    await browser.storage.local.set({
      analysisJobs: snapshot
    })
  },
  runJob: async (job, updateJob) => {
    await updateJob({
      ...job,
      stage: "claiming"
    })

    const result = await apiRouter.analyzeDocument(
      job.document,
      async (progress) => {
        await updateJob({
          ...job,
          stage: progress.stage,
          completedTasks: progress.completedTasks,
          pendingTasks: progress.pendingTasks,
          totalTasks: progress.totalTasks
        })
      },
      {
        claimProviderId: job.claimProviderId,
        claimModel: job.claimModel,
        embeddingProviderId: job.embeddingProviderId,
        embeddingModel: job.embeddingModel
      }
    )

    await updateJob({
      ...job,
      stage: "persisting"
    })

    await persistLatestAnalysisSnapshot({
      document: job.document,
      result
    })
  }
})

async function syncDebugLoggingEnabled(): Promise<void> {
  const settings = await settingsRepository.getSettings()
  setDebugLoggingEnabled(settings.debugLoggingEnabled)
}

async function synchronizeOperationalState(): Promise<void> {
  const whitelistRepository = createWhitelistRepository(database)
  const storedWhitelistDomains = await whitelistRepository.listDomains()
  const whitelistDomains = resolveAutoManagedWhitelistDomains(storedWhitelistDomains)

  for (const domain of whitelistDomains) {
    if (!storedWhitelistDomains.includes(domain)) {
      await whitelistRepository.addDomain(domain)
    }
  }

  await syncRegisteredContentScripts(whitelistDomains)

  const settings = await settingsRepository.getSettings()
  const stored = await browser.storage.local.get("analysisResultsByUrl")
  const normalizedSnapshots = normalizeAnalysisResultsByUrl(
    stored["analysisResultsByUrl"] as Record<string, ReturnType<typeof createStoredAnalysisSnapshot>> | undefined
  )

  await browser.storage.local.set({
    analysisResultsByUrl: normalizedSnapshots,
    operationalSettings: settings
  })
}

async function initializeExtension(): Promise<void> {
  await syncDebugLoggingEnabled()
  debugLog("background", "initializing extension")
  await synchronizeOperationalState()
  await analysisJobQueue.restorePendingJobs()
  debugLog("background", "extension initialized")
}

function enqueueDocumentAnalysis(document: ReturnType<typeof parseExtractedDocument>) {
  return queue.enqueue(async () => {
    await syncDebugLoggingEnabled()
    debugLog("background", "received document analysis request", {
      title: document.title
    })

    try {
      await browser.storage.local.set({
        analysisTaskQueue: {
          completedTasks: 0,
          pendingTasks: 0,
          totalTasks: 0,
          title: document.title
        }
      })
      const result = await apiRouter.analyzeDocument(document, async (progress) => {
        await browser.storage.local.set({
          analysisTaskQueue: {
            ...progress,
            title: document.title
          }
        })
      })
      await persistLatestAnalysisSnapshot({
        document,
        result
      })
      await browser.storage.local.set({
        analysisTaskQueue: {
          completedTasks: 0,
          pendingTasks: 0,
          totalTasks: 0,
          title: document.title
        }
      })
      debugLog("background", "document analysis finished", {
        title: document.title,
        recommendation: result.result.recommendation
      })
      return result
    } catch (error) {
      await browser.storage.local.set({
        analysisTaskQueue: {
          completedTasks: 0,
          pendingTasks: 0,
          totalTasks: 0,
          title: document.title
        }
      })
      debugLog("background", "document analysis failed", {
        title: document.title,
        error: serializeDebugError(error)
      })
      throw error
    }
  })
}

async function createAnalysisJobRecord(
  document: ReturnType<typeof parseExtractedDocument>
): Promise<AnalysisJobRecord> {
  const settings = await settingsRepository.getSettings()
  const claimProviderId = settings.activeClaimProviderId
  const embeddingProviderId = settings.activeEmbeddingProviderId

  if (claimProviderId === undefined || embeddingProviderId === undefined) {
    throw new Error("Active provider settings are incomplete")
  }

  const [claimProviderConfig, embeddingProviderConfig] = await Promise.all([
    providersRepository.getProviderById(claimProviderId),
    providersRepository.getProviderById(embeddingProviderId)
  ])

  if (claimProviderConfig === undefined || embeddingProviderConfig === undefined) {
    throw new Error("Active provider configuration is missing")
  }

  const createdAt = Date.now()

  return {
    jobId: createAnalysisJobId(`${document.docId}_${createdAt}`),
    docId: document.docId,
    title: document.title,
    url: document.url,
    canonicalUrl: document.canonicalUrl,
    document,
    claimProviderId,
    claimModel: settings.activeClaimModel ?? claimProviderConfig.chatModels[0] ?? "gpt-4.1-mini",
    embeddingProviderId,
    embeddingModel:
      settings.activeEmbeddingModel ??
      embeddingProviderConfig.embeddingModels[0] ??
      "text-embedding-3-small",
    stage: "queued",
    createdAt,
    completedTasks: 0,
    pendingTasks: 0,
    totalTasks: 0
  }
}

browser.runtime.onInstalled.addListener(() => {
  void initializeExtension()
})

browser.runtime.onStartup.addListener(() => {
  void initializeExtension()
})

browser.runtime.onMessage.addListener(
  (rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
  const parsedMessage = runtimeMessageSchema.safeParse(rawMessage)

  if (!parsedMessage.success) {
    return undefined
  }

  const message = parsedMessage.data

  switch (message.type) {
    case "ANALYZE_DOCUMENT":
      return enqueueDocumentAnalysis(parseExtractedDocument(message.payload))
    case "ENQUEUE_DOCUMENT_ANALYSIS":
      return (async () => {
        await syncDebugLoggingEnabled()
        const document = parseExtractedDocument(message.payload)
        const decision = await resolveEnqueueAnalysisRequest({
          checkDocumentUrlHistory: apiRouter.checkDocumentUrlHistory,
          document,
          findExecutableJobByExactUrl:
            analysisJobsRepository.findExecutableJobByExactUrl
        })

        if (decision.kind === "skip-existing-document") {
          return {
            skipped: true
          }
        }

        if (decision.kind === "reuse-existing-job") {
          return {
            jobId: decision.job.jobId,
            reused: true
          }
        }

        const job = await createAnalysisJobRecord(document)

        void analysisJobQueue.enqueue(job).catch((error) => {
          debugLog("background", "analysis job enqueue failed", {
            title: document.title,
            error: serializeDebugError(error)
          })
        })

        return {
          jobId: job.jobId
        }
      })()
    case "CHECK_DOCUMENT_URL_HISTORY":
      return apiRouter.checkDocumentUrlHistory(message.payload)
    case "GET_EXISTING_ANALYSIS_RESULT":
      return apiRouter.getExistingAnalysisResult(message.payload)
    case "MARK_DOCUMENT_READ":
      return apiRouter.markDocumentRead(message.payload)
    case "RUN_DOCUMENT_PRECHECK":
      return apiRouter.precheckDocument(message.payload)
    case "REQUEST_SETTINGS":
      return settingsRepository.getSettings()
    case "REQUEST_WHITELIST_DOMAINS":
      return createWhitelistRepository(database).listDomains()
    case "OPEN_SIDEPANEL":
      return (async () => {
        const activeTabId = sender.tab?.id

        if (activeTabId !== undefined) {
          await chrome.sidePanel.open({ tabId: activeTabId })
          return
        }

        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true
        })
        const fallbackTabId = tabs[0]?.id

        if (fallbackTabId !== undefined) {
          await chrome.sidePanel.open({ tabId: fallbackTabId })
        }
      })()
    case "GET_CONTENT_TAB_ID":
      return Promise.resolve({
        tabId: sender.tab?.id ?? null
      })
    case "REBUILD_EMBEDDINGS":
      return queue.enqueue(async () => {
        await syncDebugLoggingEnabled()
        debugLog("background", "received runtime message", { type: message.type })
        return apiRouter.rebuildEmbeddings()
      })
    case "TEST_PROVIDER_CONNECTION":
      return (async () => {
        await syncDebugLoggingEnabled()
        debugLog("background", "received runtime message", { type: message.type })
        return apiRouter.testActiveProviderConnection(createProviderId(message.payload.providerId))
      })()
    case "MANUAL_MARK_READ":
      return browser.storage.local.set({
        latestManualMarkRead: message.payload.targetId
      })
  }
  }
)
