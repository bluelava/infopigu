import type { StatusMarker } from "./pageMarker"
import type { OperationalSettings } from "./contentBootstrap"
import type { ExtractedDocument } from "../shared/types"
import { formatDuplicateRecommendation } from "../i18n/contentStrings"

export type ArticlePrecheckCleanup = () => void

export interface ArticlePrecheckResult {
  readonly duplicateScore: number | null
  readonly kind:
    | "high-duplicate"
    | "insufficient-content"
    | "low-duplicate"
    | "unknown-duplicate"
    | "precheck-failed"
}

export interface ArticleUrlHistoryResult {
  readonly duplicateScore: number
  readonly kind: "already-read"
}

export interface ExistingAnalysisResultSummary {
  readonly duplicateScore: number
  readonly judgement?: "complete" | "insufficient-content"
  readonly novelClaims?: readonly string[]
  readonly recommendation: "read" | "skim" | "skip"
  readonly sourceExtractor?: string
}

function getNovelClaimCount(input: ExistingAnalysisResultSummary): number {
  return input.novelClaims?.length ?? 0
}

function showNovelClaimsOverlayFromExistingResult(input: {
  readonly document: ExtractedDocument
  readonly existingAnalysisResult: ExistingAnalysisResultSummary
  readonly marker: StatusMarker
  readonly settings: OperationalSettings
}): void {
  if (input.document.extractor === "feed-item") {
    return
  }

  const claims = input.existingAnalysisResult.novelClaims ?? []

  if (claims.length === 0) {
    input.marker.primeNovelClaimsOverlay?.({
      claims,
      durationMs: input.settings.novelClaimsOverlaySeconds * 1000,
      maxVisibleClaims: input.settings.novelClaimsOverlayMaxVisible
    })
    return
  }

  input.marker.showNovelClaimsOverlay?.({
    claims,
    durationMs: input.settings.novelClaimsOverlaySeconds * 1000,
    maxVisibleClaims: input.settings.novelClaimsOverlayMaxVisible
  })
}

function shouldRetryCachedInsufficientResult(document: ExtractedDocument): boolean {
  return (
    document.extractor === "weibo-article" ||
    document.extractor === "x-article" ||
    document.extractor === "feed-item"
  )
}

function shouldRetryFeedSourcedSocialResult(input: {
  readonly document: ExtractedDocument
  readonly existingAnalysisResult: ExistingAnalysisResultSummary
}): boolean {
  return (
    input.document.extractor !== "feed-item" &&
    (input.document.extractor === "weibo-article" || input.document.extractor === "x-article") &&
    input.existingAnalysisResult.sourceExtractor === "feed-item"
  )
}

export async function startArticlePrecheckFlow(input: {
  readonly checkUrlHistory: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<ArticleUrlHistoryResult | null>
  readonly getExistingAnalysisResult: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<ExistingAnalysisResultSummary | null>
  readonly document: ExtractedDocument
  readonly enqueueAnalysisJob: (document: ExtractedDocument) => Promise<void> | void
  readonly markDocumentRead: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<void> | void
  readonly manualTrigger?: boolean
  readonly marker: StatusMarker
  readonly runDuplicatePrecheck: (payload: {
    readonly canonicalUrl: string
    readonly compactText: string
    readonly url: string
  }) => Promise<ArticlePrecheckResult>
  readonly settings: OperationalSettings
  readonly startAutoReadCountdown: (payload: {
    readonly duplicateScore: number | null
    readonly kind: "countdown" | "unknown-duplicate-countdown"
    readonly onThresholdReached: () => Promise<void> | void
  }) => Promise<ArticlePrecheckCleanup | void> | ArticlePrecheckCleanup | void
}): Promise<ArticlePrecheckCleanup | void> {
  const readMode =
    input.document.extractor === "feed-item"
      ? input.settings.feedItemReadMode
      : input.settings.singleArticleReadMode
  const readPayload = {
    canonicalUrl: input.document.canonicalUrl,
    url: input.document.url
  }

  input.marker.setState({ kind: "prechecking" })

  const urlHistoryResult = await input.checkUrlHistory({
    canonicalUrl: input.document.canonicalUrl,
    url: input.document.url
  })
  const existingAnalysisResult = await input.getExistingAnalysisResult({
    canonicalUrl: input.document.canonicalUrl,
    url: input.document.url
  })

  if (existingAnalysisResult !== null) {
    if (
      shouldRetryFeedSourcedSocialResult({
        document: input.document,
        existingAnalysisResult
      })
    ) {
      input.marker.setState({ kind: "queued" })
      await input.enqueueAnalysisJob(input.document)
      return
    }

    showNovelClaimsOverlayFromExistingResult({
      document: input.document,
      existingAnalysisResult,
      marker: input.marker,
      settings: input.settings
    })

    if (existingAnalysisResult.judgement === "insufficient-content") {
      if (shouldRetryCachedInsufficientResult(input.document)) {
        input.marker.setState({ kind: "queued" })
        await input.enqueueAnalysisJob(input.document)
        return
      }

      input.marker.setState({ kind: "insufficient-content" })
      return
    }

    if (input.manualTrigger) {
      await input.markDocumentRead(readPayload)
      input.marker.showKnowledgeGain?.({
        count: getNovelClaimCount(existingAnalysisResult)
      })
      input.marker.setState(createCompletedState(existingAnalysisResult))
      return
    }

    if (urlHistoryResult !== null) {
      input.marker.setState(createCompletedState(existingAnalysisResult))
      return
    }

    if (readMode === "manual") {
      input.marker.setState({
        kind: "manual-ready",
        duplicateScore: existingAnalysisResult.duplicateScore
      })
      return
    }

    return await input.startAutoReadCountdown({
      duplicateScore: existingAnalysisResult.duplicateScore,
      kind: "countdown",
      onThresholdReached: async () => {
        await input.markDocumentRead(readPayload)
        input.marker.showKnowledgeGain?.({
          count: getNovelClaimCount(existingAnalysisResult)
        })
        input.marker.setState(createCompletedState(existingAnalysisResult))
      }
    })
  }

  if (urlHistoryResult !== null) {
    input.marker.setState({ kind: "already-read" })
    return
  }

  input.marker.setState({ kind: "queued" })
  await input.enqueueAnalysisJob(input.document)
}

function createCompactPrecheckText(document: ExtractedDocument): string {
  return [document.title, ...document.blocks.slice(0, 3).map((block) => block.text)]
    .join("\n")
    .slice(0, 1000)
}

function formatExistingAnalysisText(input: ExistingAnalysisResultSummary): string {
  return formatDuplicateRecommendation(input.duplicateScore, input.recommendation)
}

function formatCompactDuplicateScore(duplicateScore: number): string {
  return `${Math.round(duplicateScore * 100)}%`
}

function createCompletedState(
  existingAnalysisResult: ExistingAnalysisResultSummary
): {
  readonly compactText: string
  readonly hideAction: true
  readonly kind: "completed"
  readonly text: string
} {
  return {
    kind: "completed",
    compactText: formatCompactDuplicateScore(existingAnalysisResult.duplicateScore),
    hideAction: true,
    text: formatExistingAnalysisText(existingAnalysisResult)
  }
}
