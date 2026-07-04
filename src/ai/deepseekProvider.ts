import { createOpenAiCompatibleClaimProvider } from "./openaiCompatible"
import type { ClaimProvider, FetchImplementation } from "./types"

interface DeepSeekProviderOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly fetchImplementation?: FetchImplementation
}

export function createDeepSeekClaimProvider(options: DeepSeekProviderOptions): ClaimProvider {
  return createOpenAiCompatibleClaimProvider(options)
}
