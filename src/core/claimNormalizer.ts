import { z } from "../shared/zod"

import { claimTypeSchema, createClaimId, type ChunkId, type ClaimRecord, type DocumentId } from "../shared/types"

const providerClaimSchema = z.object({
  text: z.string().min(1),
  type: claimTypeSchema,
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  entities: z.array(z.string()),
  source_chunk_id: z.string().min(1)
})

const providerClaimResponseSchema = z.object({
  claims: z.array(providerClaimSchema)
})

interface ParseClaimExtractionResponseInput {
  readonly rawResponse: string
  readonly docId: DocumentId
  readonly chunkIds: readonly ChunkId[]
  readonly provider: string
  readonly model: string
}

export function parseClaimExtractionResponse(
  input: ParseClaimExtractionResponseInput
): readonly ClaimRecord[] {
  const parsed = providerClaimResponseSchema.parse(JSON.parse(input.rawResponse))
  const knownChunkIds = new Set(input.chunkIds)

  return parsed.claims.map((claim, index) => {
    const chunkId = claim.source_chunk_id as ChunkId

    if (!knownChunkIds.has(chunkId)) {
      throw new Error(`Unknown chunk id: ${claim.source_chunk_id}`)
    }

    return {
      claimId: createClaimId(`${input.docId}_claim_${index + 1}`),
      docId: input.docId,
      chunkId,
      text: claim.text.trim(),
      type: claim.type,
      importance: claim.importance,
      confidence: claim.confidence,
      entities: claim.entities,
      provider: input.provider,
      model: input.model,
      createdAt: Date.now() + index
    }
  })
}
