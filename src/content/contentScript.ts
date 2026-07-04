import browser from "webextension-polyfill"

import { createJobProgressObserver, type AnalysisJobQueueSnapshot } from "../background/analysisJobQueue"
import { startAutoReadCountdown as runAutoReadCountdown } from "./autoReadCountdown"
import {
  createExistingAnalysisResultSummaryFromStoredSnapshot,
  mergeExistingAnalysisResultSummary,
  resolveStoredAnalysisSnapshotByUrl,
  type ExistingAnalysisResultSummary,
  type StoredAnalysisSnapshot
} from "./analysisResultSummary"
import { startArticlePrecheckFlow as runArticlePrecheckFlow } from "./articlePrecheckFlow"
import {
  applyAnalysisJobUpdateToMarker,
  applyLatestAnalysisResultToMarker
} from "./analysisJobProgress"
import { startContentScript } from "./contentEntrypoint"
import { bootstrapContentPageWithDeps, type BootstrapPassDependencies, type OperationalSettings } from "./contentBootstrap"
import { createDwellTracker } from "./dwellTracker"
import { createFeedItemTracker } from "./feedItemTracker"
import {
  clearFloatingMarker,
  createFloatingMarker,
  createInlineMarker,
  setMarkerTheme
} from "./pageMarker"
import { createContentSidePanelController } from "./sidePanelLauncher"
import { extractSelectedDocument } from "./extractors/manualSelectionExtractor"
import { isIgnorableExtensionContextError } from "./runtimeGuards"
import type { AnalysisPipelineResult } from "../background/analysisPipeline"
import { debugLog, serializeDebugError, setDebugLoggingEnabled } from "../shared/debug"
import { createAnalysisJobId, DEFAULT_SETTINGS, type ExtractedDocument, type Settings } from "../shared/types"
import { canonicalizeUrl, domainMatchesWhitelist } from "../core/url"
import { formatAnalysisError, formatAnalysisRecommendation, formatDuplicateSummary } from "../i18n/contentStrings"
import { applyRuntimeLanguageMode, translateRuntime } from "../i18n/runtimeLocale"
import { resolveThemeMode } from "../theme/themeMode"

function reportContentAsyncError(scope: string, error: unknown): void {
  if (isIgnorableExtensionContextError(error)) {
    return
  }

  debugLog("content", scope, {
    error: serializeDebugError(error)
  })
}

function runContentTask(task: Promise<unknown>, scope: string): void {
  void task.catch((error) => {
    reportContentAsyncError(scope, error)
  })
}

async function analyzeDocument(
  marker: { readonly setStatus: (text: string) => void },
  extractedDocument: ExtractedDocument
): Promise<void> {
  const startedAt = performance.now()
  marker.setStatus(translateRuntime("content.analyzing"))
  debugLog("content", "starting analysis request", {
    title: extractedDocument.title,
    extractor: extractedDocument.extractor,
    blockCount: extractedDocument.blocks.length
  })

  try {
    const result = (await browser.runtime.sendMessage({
      type: "ANALYZE_DOCUMENT",
      payload: extractedDocument
    })) as AnalysisPipelineResult

    debugLog("content", "analysis request completed", {
      title: extractedDocument.title,
      recommendation: result.result.recommendation,
      duplicateScore: result.result.duplicateScore,
      elapsedMs: Math.round(performance.now() - startedAt)
    })
    marker.setStatus(formatAnalysisRecommendation(result))
  } catch (error) {
    debugLog("content", "analysis request failed", {
      title: extractedDocument.title,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: serializeDebugError(error)
    })
    marker.setStatus(formatAnalysisError(error))
    throw error
  }
}

async function enqueueAnalysisJob(extractedDocument: ExtractedDocument): Promise<void> {
  await browser.runtime.sendMessage({
    type: "ENQUEUE_DOCUMENT_ANALYSIS",
    payload: extractedDocument
  })
}

const progressSubscriptions = new Set<() => void>()

function clearProgressSubscriptions(): void {
  for (const cleanup of progressSubscriptions) {
    cleanup()
  }
  progressSubscriptions.clear()
}

async function enqueueAnalysisJobWithProgress(input: {
  readonly document: ExtractedDocument
  readonly marker: BootstrapPassDependencies["createFloatingMarker"] extends (
    ...args: never[]
  ) => infer T
    ? T
    : never
  readonly settings: OperationalSettings
}): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: "ENQUEUE_DOCUMENT_ANALYSIS",
    payload: input.document
  })) as
    | { readonly skipped: true }
    | { readonly jobId: string; readonly reused?: boolean }

  if ("skipped" in response && response.skipped) {
    input.marker.setState({ kind: "already-read" })
    return
  }

  if (!("jobId" in response)) {
    input.marker.setState({
      kind: "failed",
      text: translateRuntime("content.queueFailed")
    })
    return
  }

  const jobProgressObserver = createJobProgressObserver({
    currentJobId: createAnalysisJobId(response.jobId),
    onJobUpdate: (job) => {
      if (job.stage === "failed") {
        debugLog("content", "analysis job failed", {
          title: input.document.title,
          error: job.lastError ?? "Unknown analysis job error"
        })
      }

      applyAnalysisJobUpdateToMarker({
        job,
        marker: input.marker
      })

      if (job.stage === "failed") {
        cleanup()
      }
    }
  })

  let disposed = false

  const resolveStoredResultByUrl = async () => {
    const stored = await browser.storage.local.get("analysisResultsByUrl")
    const resultsByUrl = (stored["analysisResultsByUrl"] as
      | Record<
          string,
          AnalysisPipelineResult & {
            readonly page?: {
              readonly canonicalUrl: string
              readonly url: string
            }
          }
        >
      | undefined) ?? {}

    return (
      resultsByUrl[input.document.url] ??
      resultsByUrl[input.document.canonicalUrl] ??
      resultsByUrl[canonicalizeUrl(input.document.url)] ??
      resultsByUrl[canonicalizeUrl(input.document.canonicalUrl)]
    )
  }

  const cleanup = () => {
    if (disposed) {
      return
    }

    disposed = true
    browser.storage.onChanged.removeListener(handleStorageChange)
    progressSubscriptions.delete(cleanup)
  }

  const handleStorageChange = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "local" || disposed) {
      return
    }

    if ("analysisJobs" in changes) {
      const snapshot = changes["analysisJobs"]?.newValue as AnalysisJobQueueSnapshot | undefined

      if (snapshot !== undefined) {
        jobProgressObserver.onSnapshot(snapshot)
      }
    }

    if ("latestAnalysisResult" in changes) {
      const result = changes["latestAnalysisResult"]?.newValue as
        | (AnalysisPipelineResult & {
            readonly page?: {
              readonly canonicalUrl: string
              readonly url: string
            }
          })
        | undefined

      if (result !== undefined) {
        runContentTask(
          resolveStoredResultByUrl()
            .then((storedResultByUrl) =>
              applyLatestAnalysisResultToMarker({
                alreadyRead: false,
                document: input.document,
                markDocumentRead,
                marker: input.marker,
                readMode:
                  input.document.extractor === "feed-item"
                    ? input.settings.feedItemReadMode
                    : input.settings.singleArticleReadMode,
                result,
                showNovelClaimsOverlayDurationMs: input.settings.novelClaimsOverlaySeconds * 1000,
                showNovelClaimsOverlayMaxVisible: input.settings.novelClaimsOverlayMaxVisible,
                startAutoReadCountdown: async (countdownInput) => {
                  await runAutoReadCountdown({
                    ...countdownInput,
                    marker: input.marker,
                    settings: input.settings
                  })
                },
                storedResultByUrl
              })
            )
            .then((applied) => {
              if (applied) {
                cleanup()
              }
            }),
          "failed to apply latest analysis result"
        )
      }
    }
  }

  browser.storage.onChanged.addListener(handleStorageChange)
  progressSubscriptions.add(cleanup)
  input.marker.setState({ kind: "queued" })

  const stored = await browser.storage.local.get([
    "analysisJobs",
    "analysisResultsByUrl"
  ])
  const analysisJobs = stored["analysisJobs"] as AnalysisJobQueueSnapshot | undefined
  const analysisResultsByUrl = (stored["analysisResultsByUrl"] as
    | Record<
        string,
        AnalysisPipelineResult & {
          readonly page?: {
            readonly canonicalUrl: string
            readonly url: string
          }
        }
      >
    | undefined) ?? {}
  const storedResultByUrl =
    analysisResultsByUrl[input.document.url] ??
    analysisResultsByUrl[input.document.canonicalUrl] ??
    analysisResultsByUrl[canonicalizeUrl(input.document.url)] ??
    analysisResultsByUrl[canonicalizeUrl(input.document.canonicalUrl)]

  if (analysisJobs !== undefined) {
    jobProgressObserver.onSnapshot(analysisJobs)
  }
}

async function checkUrlHistory(input: {
  readonly canonicalUrl: string
  readonly url: string
}) {
  return (await browser.runtime.sendMessage({
    type: "CHECK_DOCUMENT_URL_HISTORY",
    payload: input
  })) as
    | {
        readonly duplicateScore: number
        readonly kind: "already-read"
      }
    | null
}

async function runDuplicatePrecheck(input: {
  readonly canonicalUrl: string
  readonly compactText: string
  readonly url: string
}) {
  return (await browser.runtime.sendMessage({
    type: "RUN_DOCUMENT_PRECHECK",
    payload: input
  })) as {
    readonly duplicateScore: number | null
    readonly kind: "high-duplicate" | "low-duplicate" | "unknown-duplicate" | "precheck-failed"
  }
}

async function getExistingAnalysisResult(input: {
  readonly canonicalUrl: string
  readonly url: string
}) {
  const runtimeResult = (await browser.runtime.sendMessage({
    type: "GET_EXISTING_ANALYSIS_RESULT",
    payload: input
  })) as ExistingAnalysisResultSummary | null
  const stored = await browser.storage.local.get("analysisResultsByUrl")
  const storedResult = resolveStoredAnalysisSnapshotByUrl(
    stored["analysisResultsByUrl"] as Record<string, StoredAnalysisSnapshot> | undefined,
    input
  )

  return mergeExistingAnalysisResultSummary(
    runtimeResult,
    storedResult === null
      ? null
      : createExistingAnalysisResultSummaryFromStoredSnapshot(storedResult)
  )
}

async function markDocumentRead(input: {
  readonly canonicalUrl: string
  readonly url: string
}): Promise<void> {
  await browser.runtime.sendMessage({
    type: "MARK_DOCUMENT_READ",
    payload: input
  })
}

async function openSidePanel(): Promise<void> {
  await browser.runtime.sendMessage({
    type: "OPEN_SIDEPANEL"
  })
}

const sidePanelController = createContentSidePanelController({
  openSidePanel: async ({ tabId }) => {
    await chrome.sidePanel.open({ tabId })
  },
  resolveTabId: async () => {
    const response = (await browser.runtime.sendMessage({
      type: "GET_CONTENT_TAB_ID"
    })) as { readonly tabId: number | null }

    return response.tabId
  },
  sendMessage: async (message) => browser.runtime.sendMessage(message)
})

async function getStoredSettings(): Promise<Settings | null> {
  const stored = await browser.storage.local.get("operationalSettings")
  return (stored["operationalSettings"] as Settings | undefined) ?? null
}

async function getOperationalSettings(): Promise<OperationalSettings | null> {
  const settings = await getStoredSettings()

  return settings === null
      ? null
      : {
        autoAnalyzeEnabled: settings.autoAnalyzeEnabled,
        debugLoggingEnabled: settings.debugLoggingEnabled,
        dwellThresholdSeconds: settings.dwellThresholdSeconds,
        novelClaimsOverlaySeconds: settings.novelClaimsOverlaySeconds,
        novelClaimsOverlayMaxVisible: settings.novelClaimsOverlayMaxVisible,
        singleArticleReadMode: settings.singleArticleReadMode,
        feedItemReadMode: settings.feedItemReadMode
      }
}

function createBootstrapPassDependencies(): BootstrapPassDependencies {
  return {
    analyzeDocument,
    bootstrapArticleTracking: async (input) => {
      debugLog("content", "article tracking armed", {
        title: input.document.title,
        dwellThresholdSeconds: input.settings.dwellThresholdSeconds
      })
      const dwellTracker = createDwellTracker({
        thresholdSeconds: input.settings.dwellThresholdSeconds,
        onThresholdReached: async () => {
          debugLog("content", "article dwell threshold reached", {
            title: input.document.title
          })
          await analyzeDocument(input.marker, input.document)
          dwellTracker.destroy()
        }
      })

      function updateTrackingState(): void {
        if (document.hidden) {
          dwellTracker.pause()
        } else {
          dwellTracker.resume()
        }
      }

      dwellTracker.start()
      document.addEventListener("visibilitychange", updateTrackingState)
      const handleBlur = () => dwellTracker.pause()
      const handleFocus = () => dwellTracker.resume()
      window.addEventListener("blur", handleBlur)
      window.addEventListener("focus", handleFocus)

      return {
        destroy() {
          dwellTracker.destroy()
          document.removeEventListener("visibilitychange", updateTrackingState)
          window.removeEventListener("blur", handleBlur)
          window.removeEventListener("focus", handleFocus)
        }
      }
    },
    bootstrapFeedTracking: async (input) => {
      debugLog("content", "feed tracking armed", {
        feedItemCount: input.feedItems.length,
        dwellThresholdSeconds: input.settings.dwellThresholdSeconds
      })
      const controller = createFeedItemTracker(input.feedItems, {
        createMarker: (element, onManualRead) => createInlineMarker(element, onManualRead),
        findItemsFromMutations: input.findFeedItemsFromMutations,
        findLatestItems: input.findLatestFeedItems,
        isReady: () => document.readyState !== "loading",
        onInspectItem: async (element, marker) => {
          const documentCandidate = input.extractFeedDocumentFromElement(element)

          if (documentCandidate === null) {
            if (input.settings.debugLoggingEnabled) {
              debugLog("content", "feed item extraction failed", {
                hasDataHref: element.hasAttribute("data-href"),
                hrefCount: element.querySelectorAll("a[href]").length,
                preview: element.textContent?.replace(/\s+/gu, " ").trim().slice(0, 120) ?? ""
              })
            } else {
              debugLog("content", "feed item extraction failed")
            }
            marker.setStatus(translateRuntime("content.bodyNotDetected"))
            return false
          }

          debugLog("content", "feed item ready for precheck", {
            title: documentCandidate.title
          })
          await runArticlePrecheckFlow({
            checkUrlHistory,
            document: documentCandidate,
            enqueueAnalysisJob: async (document) => {
              await enqueueAnalysisJobWithProgress({
                document,
                marker,
                settings: input.settings
              })
            },
            getExistingAnalysisResult,
            markDocumentRead: async ({ canonicalUrl, url }) => {
              await markDocumentRead({ canonicalUrl, url })
            },
            marker,
            runDuplicatePrecheck,
            settings: input.settings,
            startAutoReadCountdown: async (countdownInput) => {
              await runAutoReadCountdown({
                ...countdownInput,
                marker,
                settings: input.settings
              })
            }
          })

          return true
        },
        onManualRead: async (element, marker) => {
          const documentCandidate = input.extractFeedDocumentFromElement(element)

          if (documentCandidate === null) {
            debugLog("content", "feed item extraction failed")
            marker.setStatus(translateRuntime("content.bodyNotDetected"))
            return
          }

          marker.setState({ kind: "queued" })

          const existingResult = await getExistingAnalysisResult({
            canonicalUrl: documentCandidate.canonicalUrl,
            url: documentCandidate.url
          })

          await markDocumentRead({
            canonicalUrl: documentCandidate.canonicalUrl,
            url: documentCandidate.url
          })

          if (existingResult !== null) {
            marker.setState({
              kind: "completed",
              compactText: `${Math.round(existingResult.duplicateScore * 100)}%`,
              hideAction: true,
              text: formatDuplicateSummary(existingResult.duplicateScore)
            })
            return
          }

          marker.setState({ kind: "already-read" })
        }
      })

      return {
        destroy() {
          controller.disconnect()
        }
      }
    },
    createFloatingMarker: (onManualRead, onRetryAnalysis) =>
      createFloatingMarker(onManualRead, {
        ...(onRetryAnalysis === undefined ? {} : { onRetryAnalysis }),
        openSidePanel: () => {
          runContentTask(sidePanelController.open(), "side panel open failed")
        }
      }),
    extractSelectedDocument,
    startArticlePrecheckFlow: async (input) => {
      const countdownCleanup = await runArticlePrecheckFlow({
        checkUrlHistory,
        document: input.document,
        enqueueAnalysisJob: async (document) => {
          await enqueueAnalysisJobWithProgress({
            document,
            marker: input.marker,
            settings: input.settings
          })
        },
        getExistingAnalysisResult,
        marker: input.marker,
        markDocumentRead: async ({ canonicalUrl, url }) => {
          await markDocumentRead({ canonicalUrl, url })
        },
        runDuplicatePrecheck,
        settings: input.settings,
        startAutoReadCountdown: async (countdownInput) => {
          await runAutoReadCountdown({
            ...countdownInput,
            marker: input.marker,
            settings: input.settings
          })
        }
      })

      return countdownCleanup === undefined
        ? undefined
        : {
            destroy() {
              countdownCleanup()
            }
          }
    }
  }
}

async function requestRuntimeSettings(): Promise<OperationalSettings> {
  return (await browser.runtime.sendMessage({
    type: "REQUEST_SETTINGS"
  })) as OperationalSettings
}

async function requestWhitelistDomains(): Promise<readonly string[]> {
  return (await browser.runtime.sendMessage({
    type: "REQUEST_WHITELIST_DOMAINS"
  })) as readonly string[]
}

async function isCurrentSiteWhitelisted(): Promise<boolean> {
  const whitelistDomains = await requestWhitelistDomains()

  if (whitelistDomains.length === 0) {
    return false
  }

  return domainMatchesWhitelist(window.location.hostname, whitelistDomains)
}

runContentTask(
  getOperationalSettings().then((settings) => {
    if (settings !== null) {
      setDebugLoggingEnabled(settings.debugLoggingEnabled)
    }
  }),
  "failed to apply operational settings"
)

runContentTask(
  getStoredSettings().then((settings) => {
    applyRuntimeLanguageMode(
      settings?.languageMode ?? DEFAULT_SETTINGS.languageMode,
      browser.i18n?.getUILanguage?.() ?? navigator.language
    )
    setMarkerTheme(resolveThemeMode(settings?.themeMode ?? DEFAULT_SETTINGS.themeMode))
  }),
  "failed to apply stored settings"
)

runContentTask(
  isCurrentSiteWhitelisted().then(async (isWhitelisted) => {
    clearProgressSubscriptions()
    clearFloatingMarker()

    if (!isWhitelisted) {
      return
    }

    await sidePanelController.primeTabId()
    await startContentScript({
      beforeBootstrapPass: () => {
        clearProgressSubscriptions()
        clearFloatingMarker()
      },
      bootstrapContentPageWithDeps,
      deps: createBootstrapPassDependencies(),
      getStoredSettings: getOperationalSettings,
      isSiteEnabled: async () => isWhitelisted,
      requestRuntimeSettings
    })
  }),
  "content bootstrap failed"
)
