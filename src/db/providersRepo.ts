import type { ProviderConfig } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createProvidersRepository(database: CognitiveDeltaDb) {
  return {
    async saveProvider(provider: ProviderConfig): Promise<void> {
      await database.providers.put(provider)
    },

    async getProviderById(providerId: ProviderConfig["id"]): Promise<ProviderConfig | undefined> {
      return database.providers.get(providerId)
    },

    async listProviders(): Promise<readonly ProviderConfig[]> {
      return database.providers.orderBy("createdAt").toArray()
    },

    async deleteProvider(providerId: ProviderConfig["id"]): Promise<void> {
      await database.providers.delete(providerId)
    }
  }
}
