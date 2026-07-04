import type { ExtractedDocument, Settings } from "../shared/types"

import { isArticlePageKind, isFeedPageKind, type PageKind } from "./pageKind"

interface BootstrapPlanInput {
  readonly autoAnalyzeEnabled: boolean
  readonly feedItemReadMode: Settings["feedItemReadMode"]
  readonly pageKind: PageKind
  readonly singleArticleReadMode: Settings["singleArticleReadMode"]
}

interface ArticleMarkerInput {
  readonly extractedDocument: ExtractedDocument | null
  readonly pageKind: PageKind
}

export function decideBootstrapPlan(input: BootstrapPlanInput) {
  return {
    shouldBootstrapArticle:
      input.autoAnalyzeEnabled &&
      isArticlePageKind(input.pageKind) &&
      input.singleArticleReadMode === "auto",
    shouldBootstrapFeed:
      input.autoAnalyzeEnabled &&
      isFeedPageKind(input.pageKind) &&
      (input.feedItemReadMode === "auto" || input.feedItemReadMode === "manual"),
    shouldShowManualFallback: isArticlePageKind(input.pageKind)
  } as const
}

export function shouldCreateArticleMarker(input: ArticleMarkerInput): boolean {
  return isArticlePageKind(input.pageKind)
}
