import type { ChunkId, ClaimType } from "../shared/types"

export interface ExtractedClaim {
  readonly chunkId: ChunkId
  readonly text: string
  readonly type: ClaimType
  readonly importance: number
  readonly confidence: number
  readonly entities: readonly string[]
}

export interface ClaimProvider {
  extractClaims(input: {
    readonly docId: string
    readonly chunks: readonly {
      readonly chunkId: ChunkId
      readonly text: string
    }[]
    readonly model: string
    readonly provider: string
  }): Promise<readonly ExtractedClaim[]>
}

export interface EmbeddingProvider {
  embed(input: {
    readonly texts: readonly string[]
    readonly model: string
  }): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }>
}

export type FetchImplementation = typeof fetch
