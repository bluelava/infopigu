import { canonicalizeUrl } from "../../core/url"
import { createDocumentId, type ExtractedBlock, type ExtractedDocument } from "../../shared/types"

function slugifyForDocumentId(input: string): string {
  return input.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 40)
}

export function createExtractedDocument(input: {
  readonly author?: string
  readonly blocks: readonly ExtractedBlock[]
  readonly extractor: string
  readonly publishedAt?: number
  readonly title: string
  readonly url: string
}): ExtractedDocument {
  const canonicalUrl = canonicalizeUrl(input.url)
  const urlObject = new URL(canonicalUrl)

  return {
    docId: createDocumentId(`${slugifyForDocumentId(input.title)}_${Date.now()}`),
    url: input.url,
    canonicalUrl,
    domain: urlObject.hostname,
    title: input.title,
    blocks: input.blocks,
    extractor: input.extractor,
    ...(input.author === undefined ? {} : { author: input.author }),
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt })
  }
}

export function collectTextBlocks(elements: readonly Element[]): readonly ExtractedBlock[] {
  return elements
    .map((element) => {
      const text = element.textContent?.replace(/\s+/gu, " ").trim() ?? ""

      if (text.length === 0) {
        return null
      }

      const tagName = element.tagName.toLowerCase()

      if (tagName.startsWith("h")) {
        const level = Number(tagName.slice(1))
        return {
          type: "heading" as const,
          text,
          ...(Number.isInteger(level) ? { level } : {})
        }
      }

      if (tagName === "blockquote") {
        return { type: "quote" as const, text }
      }

      if (tagName === "li") {
        return { type: "list" as const, text }
      }

      return { type: "paragraph" as const, text }
    })
    .filter((block): block is NonNullable<typeof block> => block !== null)
}
