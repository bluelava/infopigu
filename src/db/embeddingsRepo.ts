import type { DocumentId, EmbeddingNamespace, EmbeddingRecord } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createEmbeddingsRepository(database: CognitiveDeltaDb) {
  return {
    async saveEmbeddings(embeddings: readonly EmbeddingRecord[]): Promise<void> {
      await database.embeddings.bulkPut([...embeddings])
    },

    async deleteByDocumentId(docId: DocumentId): Promise<void> {
      await database.embeddings.where("docId").equals(docId).delete()
    },

    async deleteByNamespace(namespace: EmbeddingNamespace): Promise<void> {
      await database.embeddings.where("namespace").equals(namespace).delete()
    },

    async listByNamespace(namespace: EmbeddingNamespace): Promise<readonly EmbeddingRecord[]> {
      return database.embeddings.where("namespace").equals(namespace).sortBy("createdAt")
    },

    async listByNamespaceAndDocumentIds(
      namespace: EmbeddingNamespace,
      docIds: readonly DocumentId[]
    ): Promise<readonly EmbeddingRecord[]> {
      if (docIds.length === 0) {
        return []
      }

      const embeddings = await database.embeddings.where("namespace").equals(namespace).toArray()

      return embeddings
        .filter((embedding) => docIds.includes(embedding.docId))
        .sort((left, right) => left.createdAt - right.createdAt)
    },

    async listAllEmbeddings(): Promise<readonly EmbeddingRecord[]> {
      return database.embeddings.orderBy("createdAt").toArray()
    }
  }
}
