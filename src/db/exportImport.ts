import type {
  AnalysisResultRecord,
  ChunkRecord,
  ClaimRecord,
  DocumentRecord,
  EmbeddingRecord,
  FeedbackRecord,
  ProviderConfig,
  Settings,
  WhitelistDomain
} from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export interface LocalKnowledgeExport {
  readonly settings: readonly Settings[]
  readonly whitelistDomains: readonly WhitelistDomain[]
  readonly providers: readonly ProviderConfig[]
  readonly documents: readonly DocumentRecord[]
  readonly chunks: readonly ChunkRecord[]
  readonly claims: readonly ClaimRecord[]
  readonly embeddings: readonly EmbeddingRecord[]
  readonly analysisResults: readonly AnalysisResultRecord[]
  readonly feedback: readonly FeedbackRecord[]
}

export async function exportLocalKnowledge(database: CognitiveDeltaDb): Promise<LocalKnowledgeExport> {
  const [
    settings,
    whitelistDomains,
    providers,
    documents,
    chunks,
    claims,
    embeddings,
    analysisResults,
    feedback
  ] = await Promise.all([
    database.settings.toArray(),
    database.whitelistDomains.toArray(),
    database.providers.toArray(),
    database.documents.toArray(),
    database.chunks.toArray(),
    database.claims.toArray(),
    database.embeddings.toArray(),
    database.analysisResults.toArray(),
    database.feedback.toArray()
  ])

  return {
    settings,
    whitelistDomains,
    providers,
    documents,
    chunks,
    claims,
    embeddings,
    analysisResults,
    feedback
  }
}

export async function resetLocalKnowledge(database: CognitiveDeltaDb): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.settings,
      database.whitelistDomains,
      database.providers,
      database.documents,
      database.chunks,
      database.claims,
      database.embeddings,
      database.analysisResults,
      database.feedback
    ],
    async () => {
      await Promise.all([
        database.settings.clear(),
        database.whitelistDomains.clear(),
        database.providers.clear(),
        database.documents.clear(),
        database.chunks.clear(),
        database.claims.clear(),
        database.embeddings.clear(),
        database.analysisResults.clear(),
        database.feedback.clear()
      ])
    }
  )
}

export async function clearArticleLibrary(database: CognitiveDeltaDb): Promise<void> {
  await database.transaction(
    "rw",
    [
      database.documents,
      database.chunks,
      database.claims,
      database.embeddings,
      database.analysisResults,
      database.feedback
    ],
    async () => {
      await Promise.all([
        database.documents.clear(),
        database.chunks.clear(),
        database.claims.clear(),
        database.embeddings.clear(),
        database.analysisResults.clear(),
        database.feedback.clear()
      ])
    }
  )
}
