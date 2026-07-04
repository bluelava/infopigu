import type { CognitiveDeltaDb } from "./indexeddb"

export function createWhitelistRepository(database: CognitiveDeltaDb) {
  return {
    async addDomain(domain: string): Promise<void> {
      await database.whitelistDomains.put({
        domain,
        createdAt: Date.now()
      })
    },

    async listDomains(): Promise<readonly string[]> {
      const records = await database.whitelistDomains.orderBy("createdAt").toArray()
      return records.map((record) => record.domain)
    },

    async removeDomain(domain: string): Promise<void> {
      await database.whitelistDomains.delete(domain)
    }
  }
}
