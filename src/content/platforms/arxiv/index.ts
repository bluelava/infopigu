import type { ExtractedDocument } from "../../../shared/types"

import { createExtractedDocument } from "../../extractors/helpers"

const ARXIV_ABS_PATH_PATTERN = /^\/abs\/[^?#]+$/u

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim()
}

function stripLeadingAbstractLabel(text: string): string {
  return text.replace(/^abstract\s*:\s*/iu, "").trim()
}

export function classifyArxivPageKind(url: URL, root: Document): "arxiv-article" | null {
  if (url.hostname.replace(/^www\./u, "") !== "arxiv.org") {
    return null
  }

  if (!ARXIV_ABS_PATH_PATTERN.test(url.pathname)) {
    return null
  }

  return root.querySelector("blockquote.abstract, blockquote.abstract.mathjax") !== null
    ? "arxiv-article"
    : null
}

export function extractArxivArticleDocument(): ExtractedDocument | null {
  const titleText =
    document.querySelector("meta[name='citation_title']")?.getAttribute("content") ??
    document.querySelector("h1.title")?.textContent ??
    document.title
  const abstractText =
    document.querySelector("blockquote.abstract, blockquote.abstract.mathjax")?.textContent ?? ""

  const title = normalizeText(titleText.replace(/^title\s*:\s*/iu, ""))
  const abstract = stripLeadingAbstractLabel(normalizeText(abstractText))

  if (title.length === 0 || abstract.length === 0) {
    return null
  }

  return createExtractedDocument({
    title,
    blocks: [
      {
        type: "paragraph",
        text: abstract
      }
    ],
    extractor: "arxiv-article",
    url: window.location.href
  })
}
