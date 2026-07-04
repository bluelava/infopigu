import { describe, expect, it } from "vitest"

import { createEmbeddingTaskQueue } from "../../src/background/embeddingTaskQueue"

describe("embedding task queue", () => {
  it("tracks pending embedding tasks and decrements after each success", async () => {
    const queue = createEmbeddingTaskQueue()
    const snapshots: number[] = []

    await queue.runSerial(["a", "b", "c"], async () => {
      const snapshot = queue.getSnapshot()
      snapshots.push(snapshot.pendingTasks)
    })

    expect(snapshots).toEqual([3, 2, 1])
    expect(queue.getSnapshot().pendingTasks).toBe(0)
  })
})
