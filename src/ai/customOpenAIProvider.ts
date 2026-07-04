import {
  createOpenAiCompatibleClaimProvider,
  createOpenAiCompatibleEmbeddingProvider
} from "./openaiCompatible"
import type { ClaimProvider, EmbeddingProvider, FetchImplementation } from "./types"

interface CustomOpenAiProviderOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly fetchImplementation?: FetchImplementation
}

export function createCustomOpenAiClaimProvider(
  options: CustomOpenAiProviderOptions
): ClaimProvider {
  return createOpenAiCompatibleClaimProvider(options)
}

export function createCustomOpenAiEmbeddingProvider(
  options: CustomOpenAiProviderOptions
): EmbeddingProvider {
  return createOpenAiCompatibleEmbeddingProvider(options)
}
