type QueueTask<TValue> = () => Promise<TValue>

export function createTaskQueue() {
  let activeTask = Promise.resolve()

  return {
    enqueue<TValue>(task: QueueTask<TValue>): Promise<TValue> {
      const runTask = activeTask.then(task, task)
      activeTask = runTask.then(
        () => undefined,
        () => undefined
      )
      return runTask
    }
  }
}
