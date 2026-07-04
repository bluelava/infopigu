import type { ExtractedBlock, ExtractedDocument } from "../../../shared/types"

import { createExtractedDocument } from "../../extractors/helpers"

const X_STATUS_PATH_PATTERN = /^\/([^/]+)\/status\/(\d+)(?:\/.*)?$/u
const X_PROFILE_PATH_PATTERN = /^\/[A-Za-z0-9_]{1,15}(?:\/(?:with_replies|media|likes))?$/u
const X_STATUS_HREF_PATTERN = /^https?:\/\/x\.com\/[^/]+\/status\/\d+(?:\?.*)?$/u
const X_STATUS_HREF_RELATIVE_PATTERN = /^\/[^/]+\/status\/\d+(?:\?.*)?$/u
const X_STATUS_DATA_HREF_PATTERN = /^\/[^/]+\/status\/\d+(?:[/?#].*)?$/u

function normalizeText(text: string): string {
  return text.replace(/\u00a0/gu, " ").replace(/\s+/gu, " ").trim()
}

function getElementReadableText(element: Element): string {
  if (element instanceof HTMLElement && typeof element.innerText === "string") {
    const innerText = element.innerText.trim()

    if (innerText.length > 0) {
      return innerText
    }
  }

  return element.textContent ?? ""
}

function createParagraphBlocksFromText(text: string): readonly ExtractedBlock[] {
  return text
    .split(/\n+/u)
    .map((segment) => normalizeText(segment))
    .filter((segment) => segment.length > 0)
    .filter((segment) => !/^https:\/\/t\.co\/[A-Za-z0-9]+$/u.test(segment))
    .map((segment) => ({
      type: "paragraph" as const,
      text: segment.replace(/\shttps:\/\/t\.co\/[A-Za-z0-9]+$/u, "").trim()
    }))
    .filter((block) => block.text.length > 0)
}

function getMetaContent(root: ParentNode, selector: string): string {
  const value = root.querySelector<HTMLMetaElement>(selector)?.content ?? ""
  return value.trim()
}

function extractStatusId(pathname: string): string | null {
  return pathname.match(X_STATUS_PATH_PATTERN)?.[2] ?? null
}

function isXHomePath(pathname: string): boolean {
  return pathname === "/home"
}

function isXProfilePath(pathname: string): boolean {
  return X_PROFILE_PATH_PATTERN.test(pathname)
}

function collectUniqueTextSegments(elements: readonly Element[]): readonly string[] {
  const segments: string[] = []

  for (const element of elements) {
    const text = normalizeText(getElementReadableText(element))

    if (text.length === 0) {
      continue
    }

    if (segments.includes(text)) {
      continue
    }

    segments.push(text)
  }

  return segments
}

function collectPrimaryTweetSegmentsFromRoot(root: Element): readonly string[] {
  const paragraphCandidates = [...root.querySelectorAll("div[dir='auto'], div[lang], p")]
  const leafParagraphs = paragraphCandidates.filter(
    (candidate) =>
      !paragraphCandidates.some(
        (otherCandidate) => otherCandidate !== candidate && candidate.contains(otherCandidate)
      )
  )
  const paragraphSegments = collectUniqueTextSegments(leafParagraphs).filter(
    (segment) => !/^https:\/\/t\.co\/[A-Za-z0-9]+$/u.test(segment)
  )

  if (paragraphSegments.length > 1) {
    return paragraphSegments
  }

  const rootText = normalizeText(getElementReadableText(root))

  return rootText.length === 0 ? [] : [rootText]
}

function getPrimaryTweetText(container: ParentNode): string {
  const primaryTweetRoot = container.querySelector("[data-testid='tweetText']")

  if (primaryTweetRoot instanceof Element) {
    return collectPrimaryTweetSegmentsFromRoot(primaryTweetRoot).join("\n")
  }

  const fallbackCandidates = [...container.querySelectorAll("div[dir='auto'], div[lang]")]

  return collectUniqueTextSegments(fallbackCandidates).join("\n")
}

function isStatusHref(href: string): boolean {
  return X_STATUS_HREF_PATTERN.test(href) || X_STATUS_HREF_RELATIVE_PATTERN.test(href)
}

function resolveStatusUrlFromElement(element: Element): URL | null {
  const wrapperHref = element.getAttribute("data-href")

  if (wrapperHref !== null && X_STATUS_DATA_HREF_PATTERN.test(wrapperHref)) {
    return new URL(wrapperHref, window.location.origin)
  }

  const directHref = element.getAttribute("href")

  if (directHref !== null && isStatusHref(directHref)) {
    return new URL(directHref, window.location.origin)
  }

  for (const anchor of element.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href") ?? ""

    if (!isStatusHref(href)) {
      continue
    }

    return new URL(anchor.href, window.location.origin)
  }

  return null
}

function isXFeedCandidate(element: Element): boolean {
  if (element.matches("article[data-tweet-id]")) {
    return true
  }

  if (element.matches("[data-href][role='link']")) {
    return X_STATUS_DATA_HREF_PATTERN.test(element.getAttribute("data-href") ?? "")
  }

  if (element.matches("article")) {
    return resolveStatusUrlFromElement(element) !== null
  }

  return false
}

function matchesStatusId(element: Element, statusId: string): boolean {
  const resolvedUrl = resolveStatusUrlFromElement(element)

  return resolvedUrl !== null && extractStatusId(resolvedUrl.pathname) === statusId
}

function findXStatusArticle(root: ParentNode, statusId: string | null): Element | null {
  if (statusId !== null) {
    const exactMatch = root.querySelector(`article[data-tweet-id="${statusId}"]`)

    if (exactMatch instanceof Element) {
      return exactMatch
    }

    const matchingCandidate = [...root.querySelectorAll("article, [data-href][role='link']")].find(
      (element) => isXFeedCandidate(element) && matchesStatusId(element, statusId)
    )

    if (matchingCandidate !== undefined) {
      return matchingCandidate
    }
  }

  const firstTweet = [...root.querySelectorAll("article, [data-href][role='link']")].find((element) =>
    isXFeedCandidate(element)
  )

  return firstTweet ?? null
}

function hasXStatusMeta(root: ParentNode): boolean {
  const description = getMetaContent(root, 'meta[property="og:description"]')

  return description.length > 0
}

export function classifyXPageKind(url: URL, root: Document): "x-article" | "x-feed" | null {
  if (url.hostname.replace(/^www\./u, "") !== "x.com") {
    return null
  }

  const statusId = extractStatusId(url.pathname)
  const article = findXStatusArticle(root, statusId)
  const feedItems = findXFeedItemElements(root)

  if (statusId !== null && (article !== null || hasXStatusMeta(root))) {
    return "x-article"
  }

  if ((isXHomePath(url.pathname) || isXProfilePath(url.pathname)) && feedItems.length > 0) {
    return "x-feed"
  }

  if (article !== null && feedItems.length <= 1) {
    return "x-article"
  }

  return feedItems.length > 0 ? "x-feed" : null
}

export function findXFeedItemElements(root: ParentNode = document): readonly Element[] {
  return [...root.querySelectorAll("article[data-tweet-id], article, [data-href][role='link']")]
    .filter((element) => isXFeedCandidate(element))
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .filter((element) => getPrimaryTweetText(element).length >= 12)
}

export function findXFeedItemsFromMutations(
  records: readonly MutationRecord[]
): readonly Element[] {
  const candidates = records
    .flatMap((record) => [...record.addedNodes])
    .flatMap((node) => {
      const element =
        node instanceof Element
          ? node
          : node.parentElement

      if (element === null) {
        return []
      }

      const closestCandidate = element.closest("article[data-tweet-id], article, [data-href][role='link']")
      const descendantCandidates = [...element.querySelectorAll("article[data-tweet-id], article, [data-href][role='link']")]

      return [
        ...(closestCandidate === null ? [] : [closestCandidate]),
        ...descendantCandidates
      ]
    })
    .filter((element, index, elements) => elements.indexOf(element) === index)
    .filter((element) => isXFeedCandidate(element))

  return candidates
}

export function extractXFeedDocumentFromElement(element: Element): ExtractedDocument | null {
  const text = getPrimaryTweetText(element)
  const permalinkUrl = resolveStatusUrlFromElement(element)

  if (text.length === 0 || permalinkUrl === null) {
    return null
  }

  const blocks = createParagraphBlocksFromText(text)

  if (blocks.length === 0) {
    return null
  }

  return createExtractedDocument({
    title: blocks[0]?.text.slice(0, 48) ?? "X post",
    blocks,
    extractor: "feed-item",
    url: permalinkUrl.href
  })
}

export function extractXArticleDocumentFromPage(input: {
  readonly root: Document | Element
  readonly url: string
}): ExtractedDocument | null {
  const statusId = extractStatusId(new URL(input.url).pathname)
  const article = findXStatusArticle(input.root, statusId)

  if (article !== null) {
    const text = getPrimaryTweetText(article)
    const blocks = createParagraphBlocksFromText(text)

    if (blocks.length > 0) {
      return createExtractedDocument({
        title: blocks[0]?.text.slice(0, 48) ?? "X post",
        blocks,
        extractor: "x-article",
        url: input.url
      })
    }
  }

  const metaDescription =
    getMetaContent(input.root, 'meta[property="og:description"]') ||
    getMetaContent(input.root, 'meta[name="description"]')
  const metaBlocks = createParagraphBlocksFromText(metaDescription)

  if (metaBlocks.length > 0) {
    return createExtractedDocument({
      title: metaBlocks[0]?.text.slice(0, 48) ?? "X post",
      blocks: metaBlocks,
      extractor: "x-article",
      url: input.url
    })
  }

  return null
}

export function extractXArticleDocument(): ExtractedDocument | null {
  return extractXArticleDocumentFromPage({
    root: document,
    url: window.location.href
  })
}
