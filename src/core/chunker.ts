import { createChunkId, type ChunkRecord, type ExtractedDocument, type ExtractedBlock } from "../shared/types"

const MIN_CHUNK_SIZE = 150
const TARGET_CHUNK_SIZE = 800
const MAX_CHUNK_SIZE = 1000
const OVERLAP_SIZE = 80

interface Segment {
  readonly text: string
  readonly section?: string
}

function createSegment(text: string, section?: string): Segment {
  if (section === undefined) {
    return { text }
  }

  return { text, section }
}

function normalizeBlockText(block: ExtractedBlock): string {
  return block.text.replace(/\s+/gu, " ").trim()
}

function splitLongTextIntoSegments(text: string, section?: string): readonly Segment[] {
  if (text.length <= TARGET_CHUNK_SIZE) {
    return [createSegment(text, section)]
  }

  const sentences = text
    .split(/(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

  if (sentences.length <= 1) {
    return [createSegment(text, section)]
  }

  const splitSegments: Segment[] = []
  let activeText = ""

  for (const sentence of sentences) {
    const nextText = activeText.length === 0 ? sentence : `${activeText}${sentence}`

    if (activeText.length > 0 && nextText.length > TARGET_CHUNK_SIZE) {
      splitSegments.push(createSegment(activeText, section))
      activeText = sentence
      continue
    }

    activeText = nextText
  }

  if (activeText.length > 0) {
    splitSegments.push(createSegment(activeText, section))
  }

  return splitSegments
}

function buildSegments(document: ExtractedDocument): readonly Segment[] {
  let activeSection: string | undefined
  const segments: Segment[] = []

  for (const block of document.blocks) {
    const normalizedText = normalizeBlockText(block)

    if (normalizedText.length === 0) {
      continue
    }

    if (block.type === "heading") {
      activeSection = normalizedText
      continue
    }

    segments.push(...splitLongTextIntoSegments(normalizedText, activeSection))
  }

  return segments
}

function createChunkText(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.text).join("\n\n")
}

function getOverlapText(text: string): string {
  if (text.length <= OVERLAP_SIZE) {
    return text
  }

  return text.slice(text.length - OVERLAP_SIZE)
}

export function createChunksFromDocument(document: ExtractedDocument): readonly ChunkRecord[] {
  const segments = buildSegments(document)
  const chunks: ChunkRecord[] = []

  let activeSegments: Segment[] = []
  let activeSection: string | undefined
  let startOffset = 0

  function flushChunk(finalSegmentIndex: number): void {
    if (activeSegments.length === 0) {
      return
    }

    const text = createChunkText(activeSegments)
    const charCount = text.length
    const endOffset = startOffset + charCount

    const chunkBase = {
      chunkId: createChunkId(`${document.docId}_chunk_${chunks.length + 1}`),
      docId: document.docId,
      text,
      startOffset,
      endOffset,
      charCount,
      createdAt: Date.now() + finalSegmentIndex
    }

    chunks.push(
      activeSection === undefined ? chunkBase : { ...chunkBase, section: activeSection }
    )

    const overlapText = getOverlapText(text)
    activeSegments = overlapText.length > 0 ? [createSegment(overlapText, activeSection)] : []
    startOffset = endOffset - overlapText.length
  }

  segments.forEach((segment, index) => {
    const nextSegments = [...activeSegments, segment]
    const nextText = createChunkText(nextSegments)

    if (activeSegments.length > 0 && nextText.length > MAX_CHUNK_SIZE) {
      flushChunk(index)
    }

    if (activeSegments.length === 0) {
      activeSection = segment.section
    }

    activeSegments = [...activeSegments, segment]

    if (createChunkText(activeSegments).length >= TARGET_CHUNK_SIZE) {
      flushChunk(index)
    }
  })

  const trailingText = createChunkText(activeSegments)

  if (trailingText.length >= MIN_CHUNK_SIZE || chunks.length === 0) {
    flushChunk(segments.length)
  } else if (chunks.length > 0) {
    const previousChunk = chunks[chunks.length - 1]
    if (previousChunk !== undefined) {
      chunks[chunks.length - 1] = {
        ...previousChunk,
        text: `${previousChunk.text}\n\n${trailingText}`,
        endOffset: previousChunk.endOffset + trailingText.length + 2,
        charCount: previousChunk.charCount + trailingText.length + 2
      }
    }
  }

  return chunks
}
