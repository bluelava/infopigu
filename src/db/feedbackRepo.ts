import type { FeedbackRecord } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

export function createFeedbackRepository(database: CognitiveDeltaDb) {
  return {
    async saveFeedback(feedback: FeedbackRecord): Promise<void> {
      await database.feedback.put(feedback)
    },

    async listFeedback(): Promise<readonly FeedbackRecord[]> {
      return database.feedback.orderBy("createdAt").toArray()
    }
  }
}
