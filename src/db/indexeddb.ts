import Dexie, { type Table } from "dexie"

import type {
  AnalysisJobRecord,
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

export class CognitiveDeltaDb extends Dexie {
  declare analysisJobs: Table<AnalysisJobRecord, string>
  declare analysisResults: Table<AnalysisResultRecord, string>
  declare chunks: Table<ChunkRecord, string>
  declare claims: Table<ClaimRecord, string>
  declare documents: Table<DocumentRecord, string>
  declare embeddings: Table<EmbeddingRecord, string>
  declare feedback: Table<FeedbackRecord, string>
  declare providers: Table<ProviderConfig, string>
  declare settings: Table<Settings, string>
  declare whitelistDomains: Table<WhitelistDomain, string>

  constructor(databaseName: string) {
    super(databaseName)

    this.version(1).stores({
      settings: "&id",
      whitelistDomains: "&domain, createdAt",
      providers: "&id, type, updatedAt",
      documents: "&docId, canonicalUrl, domain, readAt, savedAt, status",
      chunks: "&chunkId, docId, createdAt",
      claims: "&claimId, docId, chunkId, createdAt",
      embeddings: "&embeddingId, targetId, docId, namespace, createdAt",
      analysisResults: "&resultId, docId, createdAt",
      feedback: "&feedbackId, resultId, claimId, createdAt"
    })

    this.version(2).stores({
      settings: "&id",
      whitelistDomains: "&domain, createdAt",
      providers: "&id, type, createdAt, updatedAt",
      documents: "&docId, canonicalUrl, domain, readAt, savedAt, status",
      chunks: "&chunkId, docId, createdAt",
      claims: "&claimId, docId, chunkId, createdAt",
      embeddings: "&embeddingId, targetId, docId, namespace, createdAt",
      analysisResults: "&resultId, docId, createdAt",
      feedback: "&feedbackId, resultId, claimId, createdAt"
    })

    this.version(3).stores({
      settings: "&id",
      whitelistDomains: "&domain, createdAt",
      providers: "&id, type, createdAt, updatedAt",
      documents: "&docId, canonicalUrl, url, domain, readAt, savedAt, status",
      chunks: "&chunkId, docId, createdAt",
      claims: "&claimId, docId, chunkId, createdAt",
      embeddings: "&embeddingId, targetId, docId, namespace, createdAt",
      analysisResults: "&resultId, docId, createdAt",
      analysisJobs: "&jobId, createdAt, stage",
      feedback: "&feedbackId, resultId, claimId, createdAt"
    })
  }
}

export function createCognitiveDeltaDb(databaseName = "cognitive-delta"): CognitiveDeltaDb {
  return new CognitiveDeltaDb(databaseName)
}
