import type { AnalysisPipelineResult } from "../background/analysisPipeline"
import { canonicalizeUrl, createCanonicalUrlLookupVariants } from "../core/url"

export interface ExistingAnalysisResultSummary {
  readonly duplicateScore: number
  readonly judgement?: "complete" | "insufficient-content"
  readonly novelClaims?: readonly string[]
  readonly recommendation: "read" | "skim" | "skip"
  readonly sourceExtractor?: string
}

export type StoredAnalysisSnapshot = AnalysisPipelineResult & {
  readonly page?: {
    readonly canonicalUrl: string
    readonly url: string
  }
  readonly sourceExtractor?: string
}

export function resolveStoredAnalysisSnapshotByUrl(
  analysisResultsByUrl: Record<string, StoredAnalysisSnapshot> | undefined,
  input: {
    readonly canonicalUrl: string
    readonly url: string
  }
): StoredAnalysisSnapshot | null {
  const snapshots = analysisResultsByUrl ?? {}
  const lookupVariants = [
    ...new Set([
      ...createCanonicalUrlLookupVariants(input.url),
      ...createCanonicalUrlLookupVariants(input.canonicalUrl),
      input.url,
      input.canonicalUrl,
      canonicalizeUrl(input.url),
      canonicalizeUrl(input.canonicalUrl)
    ])
  ]

  for (const variant of lookupVariants) {
    const directMatch = snapshots[variant]

    if (directMatch !== undefined) {
      return directMatch
    }
  }

  const canonicalVariantSet = new Set(lookupVariants.map((variant) => canonicalizeUrl(variant)))

  for (const snapshot of Object.values(snapshots)) {
    const pageCanonicalUrl = snapshot.page?.canonicalUrl
    const pageUrl = snapshot.page?.url
    const snapshotVariants = [
      ...(pageCanonicalUrl === undefined ? [] : createCanonicalUrlLookupVariants(pageCanonicalUrl)),
      ...(pageUrl === undefined ? [] : createCanonicalUrlLookupVariants(pageUrl))
    ]

    if (snapshotVariants.some((variant) => canonicalVariantSet.has(canonicalizeUrl(variant)))) {
      return snapshot
    }
  }

  return null
}

export function createExistingAnalysisResultSummaryFromStoredSnapshot(
  snapshot: StoredAnalysisSnapshot
): ExistingAnalysisResultSummary {
  return {
    duplicateScore: snapshot.result.duplicateScore,
    ...(snapshot.judgement === undefined && snapshot.result.judgement === undefined
      ? {}
      : {
          judgement: snapshot.judgement ?? snapshot.result.judgement
        }),
    novelClaims: snapshot.novelClaims,
    recommendation: snapshot.result.recommendation,
    ...(snapshot.sourceExtractor === undefined
      ? {}
      : {
          sourceExtractor: snapshot.sourceExtractor
        })
  }
}

export function mergeExistingAnalysisResultSummary(
  runtimeResult: ExistingAnalysisResultSummary | null,
  storedResult: ExistingAnalysisResultSummary | null
): ExistingAnalysisResultSummary | null {
  if (runtimeResult === null) {
    return storedResult
  }

  if (storedResult === null) {
    return runtimeResult
  }

  const runtimeNovelClaims = runtimeResult.novelClaims ?? []
  const storedNovelClaims = storedResult.novelClaims ?? []

  return {
    ...runtimeResult,
    ...(runtimeNovelClaims.length > 0 || storedNovelClaims.length === 0
      ? {}
      : {
          novelClaims: storedNovelClaims
        }),
    ...(runtimeResult.judgement === undefined && storedResult.judgement !== undefined
      ? {
          judgement: storedResult.judgement
        }
      : {}),
    ...(runtimeResult.sourceExtractor === undefined && storedResult.sourceExtractor !== undefined
      ? {
          sourceExtractor: storedResult.sourceExtractor
        }
      : {})
  }
}
