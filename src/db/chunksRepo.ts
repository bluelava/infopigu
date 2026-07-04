import type { ChunkRecord, DocumentId } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createChunksRepository(database: CognitiveDeltaDb) {
  return {
    async saveChunks(chunks: readonly ChunkRecord[]): Promise<void> {
      await database.chunks.bulkPut([...chunks])
    },

    async deleteByDocumentId(docId: DocumentId): Promise<void> {
      await database.chunks.where("docId").equals(docId).delete()
    },

    async listByDocumentId(docId: DocumentId): Promise<readonly ChunkRecord[]> {
      return database.chunks.where("docId").equals(docId).sortBy("startOffset")
    }
  }
}
