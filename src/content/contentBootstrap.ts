import type { StatusMarker } from "./pageMarker"
import { DEFAULT_SETTINGS, type ExtractedDocument, type Settings } from "../shared/types"

import { decideBootstrapPlan, shouldCreateArticleMarker } from "./contentRouting"
import { isFeedPageKind, type PageKind } from "./pageKind"
import {
  resolvePageExtractionContext,
  type FeedExtractionContext,
  type PlatformExtractorDependencies
} from "./platformResolvers"
import { isPageReadyForRead } from "./readinessGate"
import { translateRuntime } from "../i18n/runtimeLocale"

export interface BootstrapPassCleanup {
  destroy(): void
}

export type OperationalSettings = Pick<
  Settings,
  | "autoAnalyzeEnabled"
  | "debugLoggingEnabled"
  | "dwellThresholdSeconds"
  | "novelClaimsOverlaySeconds"
  | "novelClaimsOverlayMaxVisible"
  | "singleArticleReadMode"
  | "feedItemReadMode"
>

export interface BootstrapPassDependencies {
  readonly analyzeDocument: (
    marker: StatusMarker,
    extractedDocument: ExtractedDocument
  ) => Promise<BootstrapPassCleanup | void> | BootstrapPassCleanup | void
  readonly bootstrapArticleTracking: (input: {
    readonly document: ExtractedDocument
    readonly marker: StatusMarker
    readonly settings: OperationalSettings
  }) => Promise<BootstrapPassCleanup | void> | BootstrapPassCleanup | void
  readonly bootstrapFeedTracking: (input: {
    readonly extractFeedDocumentFromElement: FeedExtractionContext["extractFeedDocumentFromElement"]
    readonly feedItems: readonly Element[]
    readonly findFeedItemsFromMutations: FeedExtractionContext["findItemsFromMutations"]
    readonly findLatestFeedItems: FeedExtractionContext["findLatestItems"]
    readonly settings: OperationalSettings
  }) => Promise<BootstrapPassCleanup | void> | BootstrapPassCleanup | void
  readonly createFloatingMarker: (
    onManualRead: () => void,
    onRetryAnalysis?: () => void
  ) => StatusMarker
  readonly extractSelectedDocument: () => ExtractedDocument | null
  readonly startArticlePrecheckFlow: (input: {
    readonly document: ExtractedDocument
    readonly manualTrigger?: boolean
    readonly marker: StatusMarker
    readonly settings: OperationalSettings
  }) => Promise<BootstrapPassCleanup | void> | BootstrapPassCleanup | void
}

interface BootstrapStateInput {
  readonly documentReadyState?: DocumentReadyState
  readonly extractedDocument: ExtractedDocument | null
  readonly feedItems: readonly Element[]
  readonly pageKind: PageKind
  readonly settings: OperationalSettings
}

export interface BootstrapState {
  readonly needsContentRetry: boolean
  readonly shouldBootstrapArticle: boolean
  readonly shouldBootstrapFeed: boolean
  readonly shouldShowManualFallback: boolean
}

export interface BootstrapPassResult extends BootstrapState, Partial<BootstrapPassCleanup> {}

interface BootstrapContentPageWithDepsInput {
  readonly classifyPageKind: (url: URL, root: Document) => PageKind
  readonly deps: BootstrapPassDependencies
  readonly getSettings: () => Promise<OperationalSettings>
  readonly platformDeps: PlatformExtractorDependencies
  readonly preparedPass?: PreparedBootstrapPass
  readonly runBootstrapPass: typeof runBootstrapPass
}

export interface PreparedBootstrapPass {
  readonly bootstrapInput: Parameters<typeof runBootstrapPass>[0]
  readonly state: BootstrapState
}

const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  autoAnalyzeEnabled: DEFAULT_SETTINGS.autoAnalyzeEnabled,
  debugLoggingEnabled: DEFAULT_SETTINGS.debugLoggingEnabled,
  dwellThresholdSeconds: DEFAULT_SETTINGS.dwellThresholdSeconds,
  novelClaimsOverlaySeconds: DEFAULT_SETTINGS.novelClaimsOverlaySeconds,
  novelClaimsOverlayMaxVisible: DEFAULT_SETTINGS.novelClaimsOverlayMaxVisible,
  singleArticleReadMode: DEFAULT_SETTINGS.singleArticleReadMode,
  feedItemReadMode: DEFAULT_SETTINGS.feedItemReadMode
}

export function buildBootstrapState(input: BootstrapStateInput): BootstrapState {
  const plan = decideBootstrapPlan({
    pageKind: input.pageKind,
    autoAnalyzeEnabled: input.settings.autoAnalyzeEnabled,
    singleArticleReadMode: input.settings.singleArticleReadMode,
    feedItemReadMode: input.settings.feedItemReadMode
  })
  const ready = isPageReadyForRead({
    articleDocument: input.extractedDocument,
    documentReadyState: input.documentReadyState ?? document.readyState,
    feedItems: input.feedItems,
    pageKind: input.pageKind
  })

  return {
    needsContentRetry:
      plan.shouldShowManualFallback &&
      input.settings.singleArticleReadMode !== "manual" &&
      !ready,
    shouldBootstrapArticle: plan.shouldBootstrapArticle && ready,
    shouldBootstrapFeed: plan.shouldBootstrapFeed && input.feedItems.length > 0,
    shouldShowManualFallback: shouldCreateArticleMarker({
      extractedDocument: input.extractedDocument,
      pageKind: input.pageKind
    })
  }
}

export async function runBootstrapPass(input: {
  readonly articleDocument: ExtractedDocument | null
  readonly deps: BootstrapPassDependencies
  readonly extractFeedDocumentFromElement?: FeedExtractionContext["extractFeedDocumentFromElement"]
  readonly feedItems: readonly Element[]
  readonly findFeedItemsFromMutations?: FeedExtractionContext["findItemsFromMutations"]
  readonly findLatestFeedItems?: FeedExtractionContext["findLatestItems"]
  readonly pageKind: PageKind
  readonly settings: OperationalSettings
}): Promise<BootstrapPassResult> {
  const state = buildBootstrapState({
    pageKind: input.pageKind,
    settings: input.settings,
    extractedDocument: input.articleDocument,
    feedItems: input.feedItems
  })
  const cleanups: BootstrapPassCleanup[] = []

  let marker: StatusMarker | null = null

  if (state.shouldShowManualFallback) {
    const getSelectedOrArticleDocument = () => input.deps.extractSelectedDocument() ?? input.articleDocument

    marker = input.deps.createFloatingMarker(
      () => {
        const selectedDocument = getSelectedOrArticleDocument()

        if (selectedDocument !== null && marker !== null) {
          void input.deps.startArticlePrecheckFlow({
            document: selectedDocument,
            manualTrigger: true,
            marker,
            settings: input.settings
          })
        }
      },
      () => {
        const selectedDocument = getSelectedOrArticleDocument()

        if (selectedDocument !== null && marker !== null) {
          void input.deps.startArticlePrecheckFlow({
            document: selectedDocument,
            marker,
            settings: input.settings
          })
        }
      }
    )
  }

  if (marker !== null) {
    if (input.settings.singleArticleReadMode === "manual") {
      marker.setStatus(translateRuntime("content.manualMode"))
    } else if (state.needsContentRetry) {
      marker.setState({ kind: "waiting-ready" })
    } else {
      marker.setStatus(
        input.articleDocument === null
          ? translateRuntime("content.waitingManualSelection")
          : translateRuntime("content.counting")
      )
    }
  }

  if (
    input.articleDocument !== null &&
    marker !== null &&
    input.settings.autoAnalyzeEnabled &&
    !isFeedPageKind(input.pageKind)
  ) {
    const cleanup = await input.deps.startArticlePrecheckFlow({
      document: input.articleDocument,
      marker,
      settings: input.settings
    })

    if (cleanup !== undefined) {
      cleanups.push(cleanup)
    }
  }

  if (state.shouldBootstrapFeed) {
    if (
      input.extractFeedDocumentFromElement === undefined ||
      input.findFeedItemsFromMutations === undefined ||
      input.findLatestFeedItems === undefined
    ) {
      return state
    }

    const cleanup = await input.deps.bootstrapFeedTracking({
      extractFeedDocumentFromElement: input.extractFeedDocumentFromElement,
      feedItems: input.feedItems,
      findFeedItemsFromMutations: input.findFeedItemsFromMutations,
      findLatestFeedItems: input.findLatestFeedItems,
      settings: input.settings
    })

    if (cleanup !== undefined) {
      cleanups.push(cleanup)
    }
  }

  if (cleanups.length > 0) {
    return {
      ...state,
      destroy() {
        for (const cleanup of cleanups) {
          cleanup.destroy()
        }
      }
    } as BootstrapState & BootstrapPassCleanup
  }

  return state
}

export async function bootstrapContentPageWithDeps(
  input: BootstrapContentPageWithDepsInput
): Promise<BootstrapPassResult> {
  const prepared = input.preparedPass ?? (await prepareBootstrapPass(input))

  return input.runBootstrapPass(prepared.bootstrapInput)
}

export async function prepareBootstrapPass(
  input: Omit<BootstrapContentPageWithDepsInput, "runBootstrapPass">
): Promise<PreparedBootstrapPass> {
  const settings = await input.getSettings()
  const pageKind = input.classifyPageKind(new URL(window.location.href), document)
  const extractionContext = resolvePageExtractionContext(pageKind, input.platformDeps)
  const feedItems = extractionContext.feedContext?.feedItems ?? []

  const bootstrapInput = {
    pageKind,
    settings,
    articleDocument: extractionContext.articleDocument,
    feedItems,
    deps: input.deps,
    ...(extractionContext.feedContext === null
      ? {}
      : {
          extractFeedDocumentFromElement: extractionContext.feedContext.extractFeedDocumentFromElement,
          findFeedItemsFromMutations: extractionContext.feedContext.findItemsFromMutations,
          findLatestFeedItems: extractionContext.feedContext.findLatestItems
        })
  }
  const state = buildBootstrapState({
    pageKind,
    settings,
    extractedDocument: extractionContext.articleDocument,
    feedItems
  })

  return {
    bootstrapInput,
    state
  }
}

export async function resolveOperationalSettings(input: {
  readonly getStoredSettings: () => Promise<OperationalSettings | null>
  readonly requestRuntimeSettings: () => Promise<OperationalSettings>
}): Promise<OperationalSettings> {
  const storedSettings = await input.getStoredSettings()

  if (storedSettings !== null) {
    return {
      ...DEFAULT_OPERATIONAL_SETTINGS,
      ...storedSettings
    }
  }

  return {
    ...DEFAULT_OPERATIONAL_SETTINGS,
    ...(await input.requestRuntimeSettings())
  }
}
