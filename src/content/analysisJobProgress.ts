import { createAnalysisJobId, type AnalysisJobId, type ExtractedDocument } from "../shared/types"
import type { AnalysisPipelineResult } from "../background/analysisPipeline"
import type { StatusMarker } from "./pageMarker"
import type { ReadMode } from "../shared/types"
import { canonicalizeUrl } from "../core/url"
import { formatDuplicateRecommendation } from "../i18n/contentStrings"
import { translateRuntime } from "../i18n/runtimeLocale"

export function createCompletedAnalysisState(result: AnalysisPipelineResult) {
  return {
    kind: "completed" as const,
    compactText: `${Math.round(result.result.duplicateScore * 100)}%`,
    hideAction: true,
    text: formatDuplicateRecommendation(result.result.duplicateScore, result.result.recommendation)
  }
}

function isInsufficientContentResult(result: AnalysisPipelineResult): boolean {
  return result.judgement === "insufficient-content" || result.result.judgement === "insufficient-content"
}

export function applyAnalysisJobUpdateToMarker(input: {
  readonly job: {
    readonly completedTasks?: number
    readonly jobId: AnalysisJobId
    readonly lastError?: string
    readonly stage:
      | "queued"
      | "claiming"
      | "embedding"
      | "persisting"
      | "completed"
      | "failed"
    readonly totalTasks?: number
  }
  readonly marker: StatusMarker
}): boolean {
  switch (input.job.stage) {
    case "queued":
      input.marker.setState({ kind: "queued" })
      return true
    case "claiming":
      input.marker.setState({ kind: "claiming" })
      return true
    case "embedding":
      input.marker.setState({
        kind: "embedding",
        completedTasks: input.job.completedTasks ?? 0,
        totalTasks: input.job.totalTasks ?? 0
      })
      return true
    case "persisting":
      input.marker.setStatus(translateRuntime("content.persisting"))
      return true
    case "completed":
      input.marker.setStatus(translateRuntime("content.generating"))
      return true
    case "failed":
      input.marker.setState({
        kind: "failed",
        text: translateRuntime("content.analysisFailed")
      })
      return true
  }
}

export async function applyLatestAnalysisResultToMarker(input: {
  readonly alreadyRead: boolean
  readonly document: ExtractedDocument
  readonly markDocumentRead?: (payload: {
    readonly canonicalUrl: string
    readonly url: string
  }) => Promise<void> | void
  readonly marker: StatusMarker
  readonly readMode: ReadMode
  readonly result: AnalysisPipelineResult & {
    readonly page?: {
      readonly canonicalUrl: string
      readonly url: string
    }
  }
  readonly showNovelClaimsOverlayDurationMs?: number
  readonly showNovelClaimsOverlayMaxVisible?: number
  readonly storedResultByUrl?:
    | (AnalysisPipelineResult & {
        readonly page?: {
          readonly canonicalUrl: string
          readonly url: string
        }
      })
    | undefined
  readonly startAutoReadCountdown?: (payload: {
    readonly duplicateScore: number | null
    readonly kind: "countdown" | "unknown-duplicate-countdown"
    readonly onThresholdReached: () => Promise<void> | void
  }) => Promise<void> | void
}): Promise<boolean> {
  const documentCanonicalUrl = canonicalizeUrl(input.document.canonicalUrl)
  const documentUrl = canonicalizeUrl(input.document.url)
  const candidateResult = [input.result, input.storedResultByUrl].find((candidate) => {
    if (candidate === undefined) {
      return false
    }

    const pageCanonicalUrl =
      candidate.page?.canonicalUrl === undefined ? null : canonicalizeUrl(candidate.page.canonicalUrl)
    const pageUrl = candidate.page?.url === undefined ? null : canonicalizeUrl(candidate.page.url)

    return (
      pageCanonicalUrl === documentCanonicalUrl ||
      pageCanonicalUrl === documentUrl ||
      pageUrl === documentCanonicalUrl ||
      pageUrl === documentUrl
    )
  })

  if (candidateResult === undefined) {
    return false
  }

  if (input.showNovelClaimsOverlayDurationMs !== undefined) {
    const overlayInput = {
      claims: candidateResult.novelClaims,
      durationMs: input.showNovelClaimsOverlayDurationMs,
      ...(input.showNovelClaimsOverlayMaxVisible === undefined
        ? {}
        : { maxVisibleClaims: input.showNovelClaimsOverlayMaxVisible })
    }

    if (candidateResult.novelClaims.length > 0) {
      input.marker.showNovelClaimsOverlay?.(overlayInput)
    } else {
      input.marker.primeNovelClaimsOverlay?.(overlayInput)
    }
  }

  if (isInsufficientContentResult(candidateResult)) {
    input.marker.setState({ kind: "insufficient-content" })
    return true
  }

  if (input.alreadyRead) {
    input.marker.setState(createCompletedAnalysisState(candidateResult))
    return true
  }

  if (input.readMode === "manual") {
    input.marker.setState({
      kind: "manual-ready",
      duplicateScore: candidateResult.result.duplicateScore
    })
    return true
  }

  if (input.startAutoReadCountdown !== undefined) {
    await input.startAutoReadCountdown({
      duplicateScore: candidateResult.result.duplicateScore,
      kind: "countdown",
      onThresholdReached: async () => {
        await input.markDocumentRead?.({
          canonicalUrl: input.document.canonicalUrl,
          url: input.document.url
        })
        input.marker.showKnowledgeGain?.({
          count: candidateResult.novelClaims.length
        })
        input.marker.setState(createCompletedAnalysisState(candidateResult))
      }
    })
    return true
  }

  input.marker.setState(createCompletedAnalysisState(candidateResult))
  return true
}

export function parseAnalysisJobId(value: string): AnalysisJobId {
  return createAnalysisJobId(value)
}
