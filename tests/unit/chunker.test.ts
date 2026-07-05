import { describe, expect, it } from "vitest"

import { createChunksFromDocument } from "../../src/core/chunker"
import { createDocumentId, type ExtractedDocument } from "../../src/shared/types"

function buildDocument(): ExtractedDocument {
  const paragraph =
    "这是一段用于测试分块逻辑的正文内容。它包含多个完整句子，用来验证 chunk 不会在句子中间被硬切，而且会尽量按照段落边界组合。"

  return {
    docId: createDocumentId("doc_test"),
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    domain: "example.com",
    title: "Chunk Test",
    blocks: [
      { type: "heading", text: "Section A", level: 2 },
      { type: "paragraph", text: paragraph.repeat(6) },
      { type: "paragraph", text: paragraph.repeat(6) },
      { type: "paragraph", text: paragraph.repeat(6) }
    ],
    extractor: "generic-article"
  }
}

describe("createChunksFromDocument", () => {
  it("splits long documents into bounded chunks", () => {
    const chunks = createChunksFromDocument(buildDocument())

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.charCount >= 150)).toBe(true)
    expect(chunks.every((chunk) => chunk.charCount <= 1000)).toBe(true)
  })

  it("splits long english paragraphs into multiple bounded chunks", () => {
    const englishSentence =
      "OpenAI released a long-form research update that explains how agent memory, tool routing, and evaluation checkpoints interact across a production workflow. "
    const document: ExtractedDocument = {
      docId: createDocumentId("doc_english"),
      url: "https://example.com/english-article",
      canonicalUrl: "https://example.com/english-article",
      domain: "example.com",
      title: "English Chunk Test",
      blocks: [
        {
          type: "paragraph",
          text: englishSentence.repeat(30)
        }
      ],
      extractor: "generic-article"
    }

    const chunks = createChunksFromDocument(document)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.charCount <= 1000)).toBe(true)
    expect(Math.max(...chunks.map((chunk) => chunk.charCount))).toBeLessThan(1000)
  })
})
