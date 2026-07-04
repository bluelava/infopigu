import { classifyArxivPageKind } from "./platforms/arxiv"
import { classifyGithubPageKind } from "./platforms/github"
import { classifyWechatPageKind } from "./platforms/wechat"
import { classifyWeiboPageKind } from "./platforms/weibo"
import { classifyXPageKind } from "./platforms/x"

const RESERVED_PLATFORM_HOSTS = new Set(["arxiv.org", "github.com"])

function getReadableTextLength(element: Element): number {
  return element.textContent?.replace(/\s+/gu, " ").trim().length ?? 0
}

function scoreReadableContainer(element: Element): number {
  const contentNodes = element.querySelectorAll("h1, h2, h3, p, li, blockquote, span")

  return [...contentNodes]
    .map((node) => getReadableTextLength(node))
    .reduce((sum, length) => sum + length, 0)
}

function hasReadableGenericArticle(root: Document): boolean {
  const candidates = [...root.querySelectorAll("article, main, [role='main'], section")]

  return candidates.some((element) => scoreReadableContainer(element) >= 80)
}

function isGenericArticle(root: Document): boolean {
  return hasReadableGenericArticle(root) && root.querySelector("h1, article, main, [role='main']") !== null
}

export type PageKind =
  | "arxiv-article"
  | "github-repo"
  | "wechat-article"
  | "weibo-article"
  | "weibo-feed"
  | "x-article"
  | "x-feed"
  | "generic-article"
  | "unsupported"

export function isArticlePageKind(pageKind: PageKind): boolean {
  return (
    pageKind === "arxiv-article" ||
    pageKind === "github-repo" ||
    pageKind === "wechat-article" ||
    pageKind === "weibo-article" ||
    pageKind === "x-article" ||
    pageKind === "generic-article"
  )
}

export function isFeedPageKind(pageKind: PageKind): boolean {
  return pageKind === "weibo-feed" || pageKind === "x-feed"
}

export function classifyPageKind(url: URL, root: Document): PageKind {
  const platformPageKind =
    classifyArxivPageKind(url, root) ??
    classifyGithubPageKind(url, root) ??
    classifyWechatPageKind(url, root) ??
    classifyWeiboPageKind(url, root) ??
    classifyXPageKind(url, root)

  if (platformPageKind !== null) {
    return platformPageKind
  }

  if (RESERVED_PLATFORM_HOSTS.has(url.hostname.replace(/^www\./u, ""))) {
    return "unsupported"
  }

  return isGenericArticle(root) ? "generic-article" : "unsupported"
}
