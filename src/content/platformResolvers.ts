import type { ExtractedDocument } from "../shared/types"

import type { PageKind } from "./pageKind"

export interface FeedExtractionContext {
  readonly extractFeedDocumentFromElement: (element: Element) => ExtractedDocument | null
  readonly feedItems: readonly Element[]
  readonly findItemsFromMutations: (records: readonly MutationRecord[]) => readonly Element[]
  readonly findLatestItems: () => readonly Element[]
}

export interface PlatformExtractorDependencies {
  readonly extractArxivArticleDocument: () => ExtractedDocument | null
  readonly extractGenericArticleDocument: () => ExtractedDocument | null
  readonly extractGithubRepoDocument: () => ExtractedDocument | null
  readonly extractWechatDocument: () => ExtractedDocument | null
  readonly extractWeiboArticleDocument: () => ExtractedDocument | null
  readonly extractWeiboFeedDocumentFromElement: (element: Element) => ExtractedDocument | null
  readonly findWeiboFeedItemsFromMutations: (records: readonly MutationRecord[]) => readonly Element[]
  readonly findWeiboFeedItemElements: () => readonly Element[]
  readonly extractXArticleDocument: () => ExtractedDocument | null
  readonly extractXFeedDocumentFromElement: (element: Element) => ExtractedDocument | null
  readonly findXFeedItemsFromMutations: (records: readonly MutationRecord[]) => readonly Element[]
  readonly findXFeedItemElements: () => readonly Element[]
}

export function resolvePageExtractionContext(
  pageKind: PageKind,
  deps: PlatformExtractorDependencies
): {
  readonly articleDocument: ExtractedDocument | null
  readonly feedContext: FeedExtractionContext | null
} {
  if (pageKind === "wechat-article") {
    return {
      articleDocument: deps.extractWechatDocument(),
      feedContext: null
    }
  }

  if (pageKind === "arxiv-article") {
    return {
      articleDocument: deps.extractArxivArticleDocument(),
      feedContext: null
    }
  }

  if (pageKind === "github-repo") {
    return {
      articleDocument: deps.extractGithubRepoDocument(),
      feedContext: null
    }
  }

  if (pageKind === "weibo-article") {
    return {
      articleDocument: deps.extractWeiboArticleDocument(),
      feedContext: null
    }
  }

  if (pageKind === "x-article") {
    return {
      articleDocument: deps.extractXArticleDocument(),
      feedContext: null
    }
  }

  if (pageKind === "generic-article") {
    return {
      articleDocument: deps.extractGenericArticleDocument(),
      feedContext: null
    }
  }

  if (pageKind === "weibo-feed") {
    return {
      articleDocument: null,
      feedContext: {
        extractFeedDocumentFromElement: deps.extractWeiboFeedDocumentFromElement,
        feedItems: deps.findWeiboFeedItemElements(),
        findItemsFromMutations: deps.findWeiboFeedItemsFromMutations,
        findLatestItems: deps.findWeiboFeedItemElements
      }
    }
  }

  if (pageKind === "x-feed") {
    return {
      articleDocument: null,
      feedContext: {
        extractFeedDocumentFromElement: deps.extractXFeedDocumentFromElement,
        feedItems: deps.findXFeedItemElements(),
        findItemsFromMutations: deps.findXFeedItemsFromMutations,
        findLatestItems: deps.findXFeedItemElements
      }
    }
  }

  return {
    articleDocument: null,
    feedContext: null
  }
}
