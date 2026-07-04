import type { ExtractedDocument } from "../../shared/types"

import { collectTextBlocks, createExtractedDocument } from "./helpers"

function scoreContainer(element: Element): number {
  return [...element.querySelectorAll("p, li, blockquote")]
    .map((node) => node.textContent?.trim().length ?? 0)
    .reduce((sum, length) => sum + length, 0)
}

function findBestArticleContainer(): Element | null {
  const candidates = [...document.querySelectorAll("article, main, [role='main'], body")]
  const bestCandidate = candidates
    .map((element) => ({
      element,
      score: scoreContainer(element)
    }))
    .sort((left, right) => right.score - left.score)[0]

  return bestCandidate?.element ?? null
}

export function extractGenericArticleDocument(): ExtractedDocument | null {
  const title = document.querySelector("h1")?.textContent?.trim() ?? document.title.trim()
  const container = findBestArticleContainer()

  if (title.length === 0 || container === null) {
    return null
  }

  const blocks = collectTextBlocks([...container.querySelectorAll("h1, h2, h3, p, li, blockquote")])

  if (blocks.length === 0) {
    return null
  }

  return createExtractedDocument({
    title,
    blocks,
    extractor: "generic-article",
    url: window.location.href
  })
}
