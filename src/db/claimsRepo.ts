import type { ClaimRecord, DocumentId } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createClaimsRepository(database: CognitiveDeltaDb) {
  return {
    async saveClaims(claims: readonly ClaimRecord[]): Promise<void> {
      await database.claims.bulkPut([...claims])
    },

    async deleteByDocumentId(docId: DocumentId): Promise<void> {
      await database.claims.where("docId").equals(docId).delete()
    },

    async listByDocumentId(docId: DocumentId): Promise<readonly ClaimRecord[]> {
      return database.claims.where("docId").equals(docId).sortBy("createdAt")
    },

    async listByDocumentIds(docIds: readonly DocumentId[]): Promise<readonly ClaimRecord[]> {
      if (docIds.length === 0) {
        return []
      }

      return database.claims.where("docId").anyOf([...docIds]).sortBy("createdAt")
    },

    async listAllClaims(): Promise<readonly ClaimRecord[]> {
      return database.claims.orderBy("createdAt").toArray()
    }
  }
}
