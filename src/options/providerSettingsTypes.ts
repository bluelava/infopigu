import type { ProviderConfig, ProviderType, Settings } from "../shared/types"

export interface SaveProviderInput {
  readonly apiKey: string
  readonly baseUrl: string
  readonly chatModels: readonly string[]
  readonly embeddingModels: readonly string[]
  readonly name: string
  readonly supportsEmbedding: boolean
  readonly supportsChat: boolean
  readonly type: ProviderType
}

export interface ProviderFormState {
  readonly apiKey: string
  readonly baseUrl: string
  readonly chatModels: string
  readonly embeddingModels: string
  readonly name: string
  readonly supportsEmbedding: boolean
  readonly supportsChat: boolean
  readonly type: ProviderType
}

export interface ProviderSettingsProps {
  readonly onDeleteProvider: (providerId: ProviderConfig["id"]) => Promise<void>
  readonly onSaveProvider: (input: SaveProviderInput) => Promise<void>
  readonly onSelectClaimProvider: (
    providerId: ProviderConfig["id"],
    claimModel: string
  ) => Promise<void>
  readonly onSelectEmbeddingProvider: (
    providerId: ProviderConfig["id"],
    embeddingModel: string
  ) => Promise<void>
  readonly onTestProvider: (providerId: ProviderConfig["id"]) => Promise<string>
  readonly providers: readonly ProviderConfig[]
  readonly settings: Settings
  readonly switchWarning: string
}
