import {
  createOpenAiCompatibleClaimProvider,
  createOpenAiCompatibleEmbeddingProvider
} from "./openaiCompatible"
import type { ClaimProvider, EmbeddingProvider, FetchImplementation } from "./types"

interface BigModelProviderOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly fetchImplementation?: FetchImplementation
}

export function createBigModelClaimProvider(options: BigModelProviderOptions): ClaimProvider {
  return createOpenAiCompatibleClaimProvider(options)
}

export function createBigModelEmbeddingProvider(
  options: BigModelProviderOptions
): EmbeddingProvider {
  return createOpenAiCompatibleEmbeddingProvider(options)
}
