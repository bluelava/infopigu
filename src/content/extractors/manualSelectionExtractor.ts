import type { ExtractedDocument } from "../../shared/types"

import { createExtractedDocument } from "./helpers"

export function extractSelectedDocument(): ExtractedDocument | null {
  const selection = window.getSelection()
  const text = selection?.toString().replace(/\s+/gu, " ").trim() ?? ""

  if (text.length === 0) {
    return null
  }

  return createExtractedDocument({
    title: document.title.trim() || "Manual selection",
    blocks: [{ type: "paragraph", text }],
    extractor: "manual-selection",
    url: window.location.href
  })
}
