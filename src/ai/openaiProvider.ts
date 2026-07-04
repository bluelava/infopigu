import {
  createOpenAiCompatibleClaimProvider,
  createOpenAiCompatibleEmbeddingProvider
} from "./openaiCompatible"
import type { ClaimProvider, EmbeddingProvider, FetchImplementation } from "./types"

interface OpenAiProviderOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly fetchImplementation?: FetchImplementation
}

export function createOpenAiClaimProvider(options: OpenAiProviderOptions): ClaimProvider {
  return createOpenAiCompatibleClaimProvider(options)
}

export function createOpenAiEmbeddingProvider(options: OpenAiProviderOptions): EmbeddingProvider {
  return createOpenAiCompatibleEmbeddingProvider(options)
}
