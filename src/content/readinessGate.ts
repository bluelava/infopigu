import type { ExtractedDocument } from "../shared/types"

import { isArticlePageKind, isFeedPageKind, type PageKind } from "./pageKind"

export function isPageReadyForRead(input: {
  readonly articleDocument: ExtractedDocument | null
  readonly documentReadyState: DocumentReadyState
  readonly feedItems: readonly Element[]
  readonly pageKind: PageKind
}): boolean {
  if (input.documentReadyState === "loading") {
    return false
  }

  if (isArticlePageKind(input.pageKind)) {
    return input.articleDocument !== null
  }

  if (isFeedPageKind(input.pageKind)) {
    return input.feedItems.length > 0
  }

  return false
}
