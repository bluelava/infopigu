interface EmbeddingTaskQueueSnapshot {
  readonly pendingTasks: number
}

export interface EmbeddingTaskQueue {
  getSnapshot(): EmbeddingTaskQueueSnapshot
  runSerial<TInput, TResult>(
    inputs: readonly TInput[],
    handler: (input: TInput, index: number) => Promise<TResult>
  ): Promise<readonly TResult[]>
}

export function createEmbeddingTaskQueue(): EmbeddingTaskQueue {
  let pendingTasks = 0

  return {
    getSnapshot() {
      return { pendingTasks }
    },

    async runSerial<TInput, TResult>(
      inputs: readonly TInput[],
      handler: (input: TInput, index: number) => Promise<TResult>
    ): Promise<readonly TResult[]> {
      pendingTasks = inputs.length
      const results: TResult[] = []

      try {
        for (const [index, input] of inputs.entries()) {
          results.push(await handler(input, index))
          pendingTasks -= 1
        }

        return results
      } finally {
        pendingTasks = 0
      }
    }
  }
}
