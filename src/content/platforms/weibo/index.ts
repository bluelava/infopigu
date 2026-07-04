import type { ExtractedDocument } from "../../../shared/types"

import { collectTextBlocks, createExtractedDocument } from "../../extractors/helpers"

const MIN_WEIBO_FEED_TEXT_LENGTH = 8
const MIN_WEIBO_ARTICLE_TEXT_LENGTH = 12
const MIN_WEIBO_ARTICLE_CONTAINER_SCORE = 24

const WEIBO_FEED_CARD_SELECTOR =
  "[role='article'], article, [mid], [data-mid], [action-type='feed_list_item'], .card-wrap, [data-href][role='link']"

const WEIBO_DETAIL_BODY_SELECTORS = [
  "article [class*='_body_'] [class*='_ogText_'] [class*='_wbtext_']",
  "article [class*='_body_'] [class*='_text_'] [class*='_wbtext_']",
  "article [class*='_body_'] [class*='_wbtext_']",
  "article .wbpro-feed-ogText [class*='_wbtext_']",
  "[class*='_wbtext_']",
  "[node-type='feed_list_content_full']",
  "[node-type='feed_list_content']",
  ".WB_text",
  "[class~='WB_text']",
  "[class*='WB_text']",
  ".detail_wbtext",
  "[class*='detail_wbtext']",
  "[data-testid='detail-content']",
  "[data-surface='feed-body']",
  "[data-surface='detail-body']"
] as const

const WEIBO_FALLBACK_TEXT_ROOT_SELECTORS = ["[dir='auto']", "[lang]"] as const

const ignoredWeiboStandaloneTexts = [
  "转发",
  "评论",
  "赞",
  "收藏",
  "关注",
  "私信",
  "推荐",
  "展开",
  "热议",
  "帮助中心",
  "微博客服",
  "自助服务中心",
  "常见问题",
  "无障碍",
  "合作&服务",
  "合作与服务"
] as const

const weiboSidebarShellSignals = [
  "首页",
  "返回",
  "全部关注",
  "最新微博",
  "特别关注",
  "好友圈",
  "管理",
  "自定义分组"
] as const

const ignoredWeiboPatterns = [
  "合作热线",
  "投诉电话",
  "客服电话",
  "帮助中心",
  "微博客服",
  "自助服务中心",
  "常见问题",
  "合作&服务",
  "合作与服务",
  "版权所有",
  "copyright",
  "2009年至2026年"
] as const

const ignoredWeiboMetadataPatterns = [
  /^作者[:：]/u,
  /^作\s*者[:：]/u,
  /^发布时间[:：]/u,
  /^发布(?:日期|时间)[:：]/u,
  /^发表于[:：]?/u,
  /^发布终端[:：]/u,
  /^来源[:：]/u,
  /^来自\s*(?:iphone|android|huawei|honor|xiaomi|redmi|oppo|vivo|ipad|微博|weibo\.com|网页端|网页版|客户端)/iu,
  /^\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2})?(?:日)?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s+来自\s*(?:iphone|android|huawei|honor|xiaomi|redmi|oppo|vivo|ipad|微博|weibo\.com|网页端|网页版|客户端).*)?$/iu
] as const

const ignoredWeiboUiNoisePatterns = [
  /color(?:white|black|red|green|blue|yellow|magenta|cyan){3,}/iu,
  /opacity(?:opaque|semi-transparent|transparent){2,}/iu
] as const

const ignoredWeiboVideoPlayerSignals = [
  "video player is loading",
  "loaded 0%",
  "current time 00:00 / duration 00:00",
  "this is a modal window",
  "beginning of dialog window",
  "escape will cancel and close the window",
  "font size",
  "text edge style",
  "font family",
  "close modal dialog",
  "end of dialog window",
  "按住画面可移动小窗"
] as const

const weiboNoiseSegmentPatterns = [
  /Video Player is loading\.[\s\S]*?(?:按住画面可移动小窗。?|End of dialog window\.)/giu,
  /This is a modal window\.[\s\S]*?(?:按住画面可移动小窗。?|End of dialog window\.)/giu,
  /Font Size[\s\S]*?ResetDone Close Modal Dialog End of dialog window\.?/giu,
  /Text Edge Style[\s\S]*?(?:ResetDone|Close Modal Dialog)/giu,
  /Font Family[\s\S]*?(?:ResetDone|Close Modal Dialog)/giu,
  /按住画面可移动小窗。?/gu
] as const

const ignoredWeiboVideoPlayerFragmentPatterns = [
  /video player is loading\.?/iu,
  /loaded\s*\d+%/iu,
  /current time\s*\d{2}:\d{2}\s*\/\s*duration\s*\d{2}:\d{2}/iu,
  /this is a modal window\.?/iu,
  /beginning of dialog window\.?/iu,
  /escape will cancel and close the window\.?/iu,
  /resetdone\s*close modal dialog\s*end of dialog window\.?/iu,
  /reset\s*done\s*close modal dialog\s*end of dialog window\.?/iu,
  /close modal dialog\.?/iu,
  /font size(?:\s*\d+%)+/iu,
  /text edge style/iu,
  /font family/iu,
  /small caps/iu,
  /按住画面可移动小窗。?/u
] as const

function getReadableTextLength(element: Element): number {
  return element.textContent?.replace(/\s+/gu, " ").trim().length ?? 0
}

function getMetaContent(root: ParentNode, selector: string): string {
  const value = root.querySelector<HTMLMetaElement>(selector)?.content ?? ""
  return value.trim()
}

function queryWeiboDetailBody(root: ParentNode): Element | null {
  const candidates = [...WEIBO_DETAIL_BODY_SELECTORS, ...WEIBO_FALLBACK_TEXT_ROOT_SELECTORS]
    .flatMap((selector) => [...root.querySelectorAll(selector)])
    .filter((candidate, index, items) => items.indexOf(candidate) === index)
    .map((element) => ({
      element,
      score: scoreWeiboDetailBodyCandidate(element)
    }))
    .filter((candidate) => candidate.score >= MIN_WEIBO_ARTICLE_TEXT_LENGTH)
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.element ?? null
}

function isWeiboFeedCardCandidate(element: Element): boolean {
  if (element.matches("[role='article'], article")) {
    return true
  }

  if (element.matches("[data-href][role='link']")) {
    return resolveWeiboPermalinkUrl(element.getAttribute("data-href") ?? "") !== null
  }

  if (
    element.matches(
      [
        "[mid]",
        "[data-mid]",
        "[action-type='feed_list_item']",
        ".card-wrap",
        "[class*='WB_feed']",
        "[class*='Feed_body']",
        "[class*='feed-content']"
      ].join(", ")
    )
  ) {
    return true
  }

  return false
}

function isWeiboDetailPath(pathname: string): boolean {
  return (
    /^\/\d+\/[A-Za-z0-9]+$/u.test(pathname) ||
    /^\/detail\/\d+$/u.test(pathname) ||
    pathname.startsWith("/ttarticle/p/show")
  )
}

function resolveWeiboPermalinkUrl(href: string): URL | null {
  try {
    const resolved = new URL(href, "https://weibo.com")
    const hostname = resolved.hostname.replace(/^www\./u, "")

    if (hostname !== "weibo.com") {
      return null
    }

    if (/\/u\/[\w-]+/u.test(resolved.pathname)) {
      return null
    }

    return isWeiboDetailPath(resolved.pathname) ? resolved : null
  } catch {
    return null
  }
}

function findNearestReadableFeedCard(anchor: HTMLAnchorElement): Element | null {
  let current: Element | null = anchor

  while (current !== null && current !== document.body && current !== document.documentElement) {
    if (getReadableTextLength(current) >= MIN_WEIBO_FEED_TEXT_LENGTH) {
      if (
        current.matches(
          [
            "article",
            "section",
            "li",
            "div",
            "[role='article']",
            "[mid]",
            "[data-mid]",
            ".card-wrap",
            "[class*='WB_feed']",
            "[class*='Feed_body']",
            "[class*='feed-content']"
          ].join(", ")
        )
      ) {
        if (findFeedContentRoot(current) !== null && resolveFeedPermalinkUrl(current) !== null) {
          return current
        }
      }
    }

    current = current.parentElement
  }

  return null
}

function getReadableFeedCards(root: ParentNode): readonly Element[] {
  const structuralCandidates = [...root.querySelectorAll(WEIBO_FEED_CARD_SELECTOR)].filter((element) =>
    isWeiboFeedCardCandidate(element)
  )
  const permalinkCandidates = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .filter((anchor) => resolveWeiboPermalinkUrl(anchor.getAttribute("href") ?? anchor.href) !== null)
    .map((anchor) => findNearestReadableFeedCard(anchor))
    .filter((candidate): candidate is Element => candidate !== null)
  const candidates = [...structuralCandidates, ...permalinkCandidates].filter(
    (candidate, index, items) => items.indexOf(candidate) === index
  )

  return candidates
    .filter((element) => isExtractableWeiboFeedCard(element))
    .filter(
      (element) =>
        !candidates.some(
          (candidate) => candidate !== element && candidate.contains(element) && isWeiboFeedCardCandidate(candidate)
        )
    )
}

function isExtractableWeiboFeedCard(element: Element): boolean {
  return (
    getReadableTextLength(element) >= MIN_WEIBO_FEED_TEXT_LENGTH &&
    resolveFeedPermalinkUrl(element) !== null &&
    findFeedContentRoot(element) !== null
  )
}

function collectFeedCardsFromNode(node: Node): readonly Element[] {
  const element =
    node instanceof Element
      ? node
      : node.parentElement

  if (element === null) {
    return []
  }

  const closestCandidate = element.closest(WEIBO_FEED_CARD_SELECTOR)
  const descendantCandidates = [...element.querySelectorAll(WEIBO_FEED_CARD_SELECTOR)]
  const candidates = [
    ...(closestCandidate === null ? [] : [closestCandidate]),
    ...descendantCandidates
  ].filter((candidate, index, items) => items.indexOf(candidate) === index)

  return candidates.filter(
    (candidate) => isWeiboFeedCardCandidate(candidate) && isExtractableWeiboFeedCard(candidate)
  )
}

function scoreWeiboArticleContainer(element: Element): number {
  return [...element.querySelectorAll("h1, h2, h3, p, li, blockquote, span, div, [dir='auto'], [lang]")]
    .map((node) => node.textContent?.replace(/\s+/gu, " ").trim().length ?? 0)
    .reduce((sum, length) => sum + length, 0)
}

function isWeiboFeedPath(pathname: string): boolean {
  if (pathname === "/" || /^\/u\/\d+$/u.test(pathname) || pathname.startsWith("/mygroups")) {
    return true
  }

  const segments = pathname.split("/").filter((segment) => segment.length > 0)

  if (segments.length !== 1) {
    return false
  }

  const [segment] = segments

  if (segment === undefined) {
    return false
  }

  return !["ajax", "detail", "login", "p", "tv", "ttarticle"].includes(segment.toLowerCase())
}

function findBestWeiboArticleContainer(root: ParentNode): Element | null {
  const candidates = [
    ...root.querySelectorAll(
      [
        "article",
        "main",
        "[role='main']",
        "section",
        "div",
        "[data-testid='primary-post']",
        "[node-type='feed_list_content_full']",
        "[node-type='feed_list_content']",
        "[data-testid='detail-content']",
        ".WB_detail",
        "[class*='WB_detail']",
        "[class*='WB_feed']",
        "[class*='Feed_body']",
        ".detail_wbtext",
        "[class*='detail_wbtext']"
      ].join(", ")
    )
  ]

  const scoredCandidates = candidates
    .map((element) => ({
      element,
      score: scoreWeiboArticleContainer(element)
    }))
    .filter((candidate) => candidate.score >= MIN_WEIBO_ARTICLE_CONTAINER_SCORE)
  const leafCandidates = scoredCandidates.filter(
    (candidate) =>
      !scoredCandidates.some(
        (otherCandidate) =>
          otherCandidate !== candidate && candidate.element.contains(otherCandidate.element)
      )
  )
  const bestCandidate = (leafCandidates.length > 0 ? leafCandidates : scoredCandidates).sort(
    (left, right) => right.score - left.score
  )[0]

  return bestCandidate?.element ?? null
}

function hasWeiboDetailBody(root: ParentNode): boolean {
  const detailBody = queryWeiboDetailBody(root)

  return (detailBody?.textContent?.replace(/\s+/gu, " ").trim().length ?? 0) >= MIN_WEIBO_ARTICLE_TEXT_LENGTH
}

function hasWeiboDetailMeta(root: ParentNode): boolean {
  return (
    getMetaContent(root, 'meta[property="og:description"]') ||
    getMetaContent(root, 'meta[name="description"]')
  ).length >= MIN_WEIBO_ARTICLE_TEXT_LENGTH
}

function isWeiboMetadataText(text: string): boolean {
  return ignoredWeiboMetadataPatterns.some((pattern) => pattern.test(text))
}

function isWeiboShellText(text: string): boolean {
  const normalizedText = text.replace(/\s+/gu, "")

  if (normalizedText.includes("4000-960-960")) {
    return true
  }

  const shellSignals = [
    "帮助中心",
    "微博客服",
    "自助服务中心",
    "常见问题",
    "合作&服务",
    "合作与服务",
    "无障碍"
  ]
  const matchedSignals = shellSignals.filter((signal) => normalizedText.includes(signal)).length

  return matchedSignals >= 2
}

function isWeiboVideoPlayerNoiseText(text: string): boolean {
  const normalizedText = text.replace(/\s+/gu, " ").trim().toLowerCase()
  const matchedSignals = ignoredWeiboVideoPlayerSignals.filter((signal) =>
    normalizedText.includes(signal)
  ).length

  return matchedSignals >= 3
}

function sanitizeWeiboText(text: string): string {
  let sanitized = text.replace(/\u200b+/gu, "").replace(/\s+/gu, " ").trim()

  for (const pattern of weiboNoiseSegmentPatterns) {
    sanitized = sanitized.replace(pattern, " ")
  }

  return sanitized.replace(/\s+/gu, " ").trim()
}

function shouldKeepWeiboText(text: string): boolean {
  const sanitizedText = sanitizeWeiboText(text)

  if (sanitizedText.length === 0) {
    return false
  }

  if (ignoredWeiboStandaloneTexts.some((value) => value === sanitizedText)) {
    return false
  }

  if (isWeiboMetadataText(sanitizedText)) {
    return false
  }

  const normalizedText = sanitizedText.toLowerCase()

  if (isWeiboShellText(sanitizedText)) {
    return false
  }

  if (isWeiboVideoPlayerNoiseText(sanitizedText)) {
    return false
  }

  if (ignoredWeiboVideoPlayerFragmentPatterns.some((pattern) => pattern.test(sanitizedText))) {
    return false
  }

  if (
    ignoredWeiboUiNoisePatterns.some((pattern) =>
      pattern.test(sanitizedText.replace(/\s+/gu, ""))
    )
  ) {
    return false
  }

  return !ignoredWeiboPatterns.some((pattern) => normalizedText.includes(pattern.toLowerCase()))
}

function isWeiboFooterText(text: string): boolean {
  const normalizedText = text.toLowerCase()

  return ignoredWeiboPatterns.some((pattern) => normalizedText.includes(pattern.toLowerCase()))
}

function filterWeiboBlocks(blocks: readonly ReturnType<typeof collectTextBlocks>[number][]) {
  const collectedBlocks = []

  for (const block of blocks) {
    const sanitizedText = sanitizeWeiboText(block.text)

    if (!shouldKeepWeiboText(sanitizedText)) {
      if (isWeiboFooterText(sanitizedText)) {
        break
      }

      continue
    }

    collectedBlocks.push({
      ...block,
      text: sanitizedText
    })
  }

  return collectedBlocks
}

function collectWeiboTextElements(container: Element): readonly Element[] {
  const candidates = [
    ...container.querySelectorAll("h1, h2, h3, p, li, blockquote, span, div, [dir='auto'], [lang]")
  ].filter((element) => getReadableTextLength(element) > 0)

  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (otherCandidate) => otherCandidate !== candidate && candidate.contains(otherCandidate)
      )
  )
}

function collectWeiboArticleBlocks(container: Element) {
  const elements = collectWeiboTextElements(container)
  return filterWeiboBlocks(collectTextBlocks(elements))
}

function collectWeiboDetailBlocks(container: Element) {
  const elements = collectWeiboTextElements(container)
  const blocks = elements.length === 0 ? collectTextBlocks([container]) : collectTextBlocks(elements)

  return filterWeiboBlocks(blocks)
}

function scoreWeiboDetailBodyCandidate(element: Element): number {
  const blocks = collectWeiboDetailBlocks(element)
  const blockScore = getWeiboBlocksTextLength(blocks)

  if (blockScore === 0) {
    return 0
  }

  const inArticleBody =
    element.closest("article") !== null &&
    (element.closest("[class*='_body_']") !== null ||
      element.closest("[class*='_ogText_']") !== null ||
      element.closest(".wbpro-feed-ogText") !== null)

  return blockScore + (element.matches(WEIBO_DETAIL_BODY_SELECTORS.join(", ")) ? 200 : 0) + (inArticleBody ? 240 : 0)
}

function getWeiboBlocksTextLength(
  blocks: readonly ReturnType<typeof collectTextBlocks>[number][]
): number {
  return blocks.map((block) => block.text.length).reduce((sum, length) => sum + length, 0)
}

function isWeiboLoggedInSidebarShellBlocks(
  blocks: readonly ReturnType<typeof collectTextBlocks>[number][]
): boolean {
  if (blocks.length === 0) {
    return false
  }

  const combinedText = blocks.map((block) => block.text).join(" ")
  const matchedSignals = weiboSidebarShellSignals.filter((signal) => combinedText.includes(signal)).length
  const longBlockCount = blocks.filter((block) => block.text.length >= 24).length

  return matchedSignals >= 3 && blocks.length <= 6 && longBlockCount <= 1
}

function createWeiboArticleDocumentCandidate(input: {
  readonly blocks: readonly ReturnType<typeof collectTextBlocks>[number][]
  readonly extractor: "weibo-article"
  readonly title?: string
  readonly url: string
}): ExtractedDocument | null {
  if (input.blocks.length === 0) {
    return null
  }

  if (isWeiboLoggedInSidebarShellBlocks(input.blocks)) {
    return null
  }

  if (getWeiboBlocksTextLength(input.blocks) < MIN_WEIBO_ARTICLE_TEXT_LENGTH) {
    return null
  }

  return createExtractedDocument({
    title: input.title?.trim().length ? input.title.trim() : (input.blocks[0]?.text.slice(0, 48) ?? "Weibo article"),
    blocks: input.blocks,
    extractor: input.extractor,
    url: input.url
  })
}

function findWeiboDetailBody(root: ParentNode): Element | null {
  return queryWeiboDetailBody(root)
}

function findBestWeiboTextContainer(
  root: ParentNode,
  minimumTextLength: number
): Element | null {
  const candidates = [
    ...root.querySelectorAll(
      [
        WEIBO_DETAIL_BODY_SELECTORS.join(", "),
        "p",
        "blockquote",
        "span",
        "div",
        "section"
      ].join(", ")
    )
  ].filter((candidate) => getReadableTextLength(candidate) >= minimumTextLength)

  if (candidates.length === 0) {
    return null
  }

  const leafCandidates = candidates.filter(
    (candidate) => !candidates.some((otherCandidate) => otherCandidate !== candidate && candidate.contains(otherCandidate))
  )
  const bestCandidate = (leafCandidates.length > 0 ? leafCandidates : candidates)
    .map((candidate) => ({
      candidate,
      score: collectWeiboDetailBlocks(candidate)
        .map((block) => block.text.length)
        .reduce((sum, length) => sum + length, 0)
    }))
    .sort((left, right) => right.score - left.score)[0]

  return bestCandidate?.candidate ?? null
}

function findFeedContentRoot(element: Element): Element | null {
  const explicitCandidateSelectors = [
    "div._wbtext_velez_14",
    "[class*='_wbtext_']",
    "[node-type='feed_list_content_full']",
    "[node-type='feed_list_content']",
    ".WB_text",
    "[class~='WB_text']",
    "[class*='WB_text']",
    ".detail_wbtext",
    "[class*='detail_wbtext']",
    "[data-testid='detail-content']",
    "[data-surface='feed-body']",
    "[dir='auto']",
    "[lang]"
  ] as const
  const explicitCandidates = explicitCandidateSelectors
    .flatMap((selector) => [...element.querySelectorAll(selector)])
    .filter((candidate, index, items) => items.indexOf(candidate) === index)
    .map((candidate) => ({
      candidate,
      score: getWeiboBlocksTextLength(collectWeiboDetailBlocks(candidate)) +
        (candidate.matches("div._wbtext_velez_14, [class*='_wbtext_'], [node-type='feed_list_content_full'], [node-type='feed_list_content'], .WB_text, [class~='WB_text'], [class*='WB_text'], .detail_wbtext, [class*='detail_wbtext'], [data-testid='detail-content'], [data-surface='feed-body']") ? 120 : 0)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  if ((explicitCandidates[0]?.score ?? 0) > 0) {
    return explicitCandidates[0]?.candidate ?? null
  }

  return findBestWeiboTextContainer(element, MIN_WEIBO_FEED_TEXT_LENGTH)
}

function findFeedPermalinkElement(element: Element): HTMLAnchorElement | null {
  const explicitPermalink =
    element.querySelector<HTMLAnchorElement>("div._time_1tpft_33 a[href]") ??
    element.querySelector<HTMLAnchorElement>("div.time_1tpft_33 a[href]") ??
    element.querySelector<HTMLAnchorElement>("[class*='_time_'] a[href]") ??
    element.querySelector<HTMLAnchorElement>("[class*='time_'] a[href]")

  if (explicitPermalink !== null) {
    return explicitPermalink
  }

  const fallbackPermalink = [...element.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
    (anchor) => {
      const href = anchor.getAttribute("href") ?? ""

      return resolveWeiboPermalinkUrl(href) !== null
    }
  )

  return fallbackPermalink ?? null
}

function resolveFeedPermalinkUrl(element: Element): URL | null {
  const wrapperHref = element.getAttribute("data-href")

  if (wrapperHref !== null) {
    const wrapperPermalink = resolveWeiboPermalinkUrl(wrapperHref)

    if (wrapperPermalink !== null) {
      return wrapperPermalink
    }
  }

  const permalinkElement = findFeedPermalinkElement(element)

  if (permalinkElement === null) {
    return null
  }

  return resolveWeiboPermalinkUrl(permalinkElement.getAttribute("href") ?? permalinkElement.href)
}

export function classifyWeiboPageKind(url: URL, root: Document): "weibo-article" | "weibo-feed" | null {
  if (url.hostname.replace(/^www\./u, "") !== "weibo.com") {
    return null
  }

  const onKnownFeedPath = isWeiboFeedPath(url.pathname)

  if (onKnownFeedPath) {
    return "weibo-feed"
  }

  const readableFeedCards = getReadableFeedCards(root)
  const dominantContainer = findBestWeiboArticleContainer(root)
  const hasDetailBody = hasWeiboDetailBody(root)
  const hasDetailMeta = hasWeiboDetailMeta(root)

  if (isWeiboDetailPath(url.pathname) && (dominantContainer !== null || hasDetailBody || hasDetailMeta)) {
    return "weibo-article"
  }

  if ((dominantContainer !== null || hasDetailBody || hasDetailMeta) && readableFeedCards.length < 2) {
    return "weibo-article"
  }

  if (readableFeedCards.length >= 2) {
    return "weibo-feed"
  }

  return null
}

export function findWeiboFeedItemElements(root: ParentNode = document): readonly Element[] {
  return getReadableFeedCards(root)
}

export function findWeiboFeedItemsFromMutations(
  records: readonly MutationRecord[]
): readonly Element[] {
  const candidates = records
    .flatMap((record) => [...record.addedNodes])
    .flatMap((node) => collectFeedCardsFromNode(node))
    .filter((candidate, index, items) => items.indexOf(candidate) === index)

  return candidates
}

export function extractWeiboFeedDocumentFromElement(element: Element): ExtractedDocument | null {
  const contentRoot = findFeedContentRoot(element)
  const permalinkUrl = resolveFeedPermalinkUrl(element)

  if (contentRoot === null || permalinkUrl === null) {
    return null
  }

  const contentElements = collectWeiboTextElements(contentRoot)
  const blocks =
    contentElements.length === 0
      ? collectWeiboDetailBlocks(contentRoot)
      : filterWeiboBlocks(collectTextBlocks(contentElements))

  if (blocks.length === 0) {
    return null
  }

  return createExtractedDocument({
    title: blocks[0]?.text.slice(0, 48) ?? "Feed item",
    blocks,
    extractor: "feed-item",
    url: permalinkUrl.href
  })
}

export function extractWeiboArticleDocumentFromPage(input: {
  readonly root: Document | Element
  readonly url: string
}): ExtractedDocument | null {
  const pageUrl = new URL(input.url)
  const isDetailPage = isWeiboDetailPath(pageUrl.pathname)
  const metaDescription =
    getMetaContent(input.root, 'meta[property="og:description"]') ||
    getMetaContent(input.root, 'meta[name="description"]')
  const metaBlocks = metaDescription.length === 0 ? [] : [{ type: "paragraph" as const, text: metaDescription }]
  const container = findBestWeiboArticleContainer(input.root)
  const containerBlocks = container === null ? [] : collectWeiboArticleBlocks(container)
  const containerCandidate =
    container === null
      ? null
      : createWeiboArticleDocumentCandidate({
          blocks: containerBlocks,
          title: container.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
          extractor: "weibo-article",
          url: input.url
        })

  const detailBody = findWeiboDetailBody(input.root)

  if (detailBody !== null) {
    const bodyText = detailBody.textContent?.replace(/\s+/gu, " ").trim() ?? ""

    if (bodyText.length >= MIN_WEIBO_ARTICLE_TEXT_LENGTH) {
      const detailBlocks = collectWeiboDetailBlocks(detailBody)
      const detailCandidate = createWeiboArticleDocumentCandidate({
        blocks: detailBlocks,
        extractor: "weibo-article",
        url: input.url
      })

      if (detailCandidate !== null) {
        if (containerCandidate === null) {
          return detailCandidate
        }

        const detailBodyIsInsideContainer = container?.contains(detailBody) ?? false

        if (detailBodyIsInsideContainer) {
          return detailCandidate
        }

        return getWeiboBlocksTextLength(detailBlocks) >= getWeiboBlocksTextLength(containerBlocks)
          ? detailCandidate
          : containerCandidate
      }

      if (bodyText.length > 0 && shouldKeepWeiboText(bodyText)) {
        return createWeiboArticleDocumentCandidate({
          blocks: [{ type: "paragraph", text: bodyText }],
          extractor: "weibo-article",
          url: input.url
        })
      }
    }
  }

  if (containerCandidate !== null) {
    return containerCandidate
  }

  const fallbackTextContainer = findBestWeiboTextContainer(input.root, MIN_WEIBO_ARTICLE_TEXT_LENGTH)

  if (fallbackTextContainer !== null) {
    const fallbackBlocks = collectWeiboDetailBlocks(fallbackTextContainer)

    const fallbackCandidate = createWeiboArticleDocumentCandidate({
      blocks: fallbackBlocks,
      extractor: "weibo-article",
      url: input.url
    })

    if (fallbackCandidate !== null) {
      return fallbackCandidate
    }
  }

  if (metaBlocks.length > 0 && !isDetailPage) {
    return createExtractedDocument({
      title: metaBlocks[0]?.text.slice(0, 48) ?? "Weibo article",
      blocks: metaBlocks,
      extractor: "weibo-article",
      url: input.url
    })
  }

  return null
}

export function extractWeiboArticleDocument(): ExtractedDocument | null {
  return extractWeiboArticleDocumentFromPage({
    root: document,
    url: window.location.href
  })
}
