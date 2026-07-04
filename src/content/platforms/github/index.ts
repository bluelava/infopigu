import type { ExtractedBlock, ExtractedDocument } from "../../../shared/types"

import { collectTextBlocks, createExtractedDocument } from "../../extractors/helpers"

const GITHUB_REPO_HOME_PATH_PATTERN = /^\/[^/]+\/[^/]+\/?$/u

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim()
}

function collectUniqueBlocks(blocks: readonly ExtractedBlock[]): readonly ExtractedBlock[] {
  const seen = new Set<string>()
  const uniqueBlocks: ExtractedBlock[] = []

  for (const block of blocks) {
    const key = `${block.type}:${block.text}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueBlocks.push(block)
  }

  return uniqueBlocks
}

function inferRepoTitleFromPath(pathname: string): string {
  const segments = pathname.replace(/^\/+|\/+$/gu, "").split("/")
  return segments.slice(0, 2).join("/")
}

function inferRepoTitle(): string {
  const repositoryNwo =
    document.querySelector("meta[name='octolytics-dimension-repository_nwo']")?.getAttribute("content") ?? ""

  if (repositoryNwo.trim().length > 0) {
    return repositoryNwo.trim()
  }

  const ogUrl = document.querySelector("meta[property='og:url']")?.getAttribute("content")

  if (ogUrl !== null && ogUrl !== undefined && ogUrl.trim().length > 0) {
    try {
      return inferRepoTitleFromPath(new URL(ogUrl).pathname)
    } catch {
      // Ignore malformed metadata and fall back to the current location path.
    }
  }

  return inferRepoTitleFromPath(window.location.pathname)
}

export function classifyGithubPageKind(url: URL, root: Document): "github-repo" | null {
  if (url.hostname.replace(/^www\./u, "") !== "github.com") {
    return null
  }

  if (!GITHUB_REPO_HOME_PATH_PATTERN.test(url.pathname)) {
    return null
  }

  return "github-repo"
}

export function extractGithubRepoDocument(): ExtractedDocument | null {
  const title = inferRepoTitle()
  const aboutText = normalizeText(
    document.querySelector("[data-testid='repo-about-description']")?.textContent ??
      document.querySelector(".BorderGrid .f4.tmp-my-3")?.textContent ??
      document.querySelector(".BorderGrid p.f4")?.textContent ??
      document.querySelector("meta[name='description']")?.getAttribute("content") ??
      ""
  )
  const readmeRoot =
    document.querySelector("article.markdown-body[itemprop='text']") ??
    document.querySelector("[data-testid='readme'] article") ??
    document.querySelector("[data-testid='readme-content']") ??
    document.querySelector("#readme article") ??
    document.querySelector("#readme")
  const readmeBlocks =
    readmeRoot === null
      ? []
      : collectTextBlocks([...readmeRoot.querySelectorAll("h1, h2, h3, p, li, blockquote")])
  const blocks = collectUniqueBlocks(
    [
      ...(aboutText.length === 0
        ? []
        : [
            {
              type: "paragraph" as const,
              text: aboutText
            }
          ]),
      ...readmeBlocks
    ].filter((block) => block.text.length > 0)
  )

  if (title.length === 0 || blocks.length === 0) {
    return null
  }

  return createExtractedDocument({
    title,
    blocks,
    extractor: "github-repo",
    url: window.location.href
  })
}
