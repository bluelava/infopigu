import type { AnalysisResultRecord, DocumentId } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createResultsRepository(database: CognitiveDeltaDb) {
  return {
    async saveResult(result: AnalysisResultRecord): Promise<void> {
      await database.analysisResults.put(result)
    },

    async deleteByDocumentId(docId: DocumentId): Promise<void> {
      await database.analysisResults.where("docId").equals(docId).delete()
    },

    async listByDocumentId(docId: DocumentId): Promise<readonly AnalysisResultRecord[]> {
      return database.analysisResults.where("docId").equals(docId).sortBy("createdAt")
    },

    async getLatestByDocumentId(docId: DocumentId): Promise<AnalysisResultRecord | undefined> {
      const results = await database.analysisResults.where("docId").equals(docId).sortBy("createdAt")
      return results.at(-1)
    },

    async getLatestByDocumentIds(
      docIds: readonly DocumentId[]
    ): Promise<ReadonlyMap<DocumentId, AnalysisResultRecord>> {
      if (docIds.length === 0) {
        return new Map()
      }

      const results = await database.analysisResults.where("docId").anyOf([...docIds]).toArray()
      const latestByDocumentId = new Map<DocumentId, AnalysisResultRecord>()

      for (const result of results) {
        const previous = latestByDocumentId.get(result.docId)

        if (previous === undefined || result.createdAt > previous.createdAt) {
          latestByDocumentId.set(result.docId, result)
        }
      }

      return latestByDocumentId
    }
  }
}
