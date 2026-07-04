export interface CapacitySummary {
  readonly savedDocuments: number
  readonly maxDocuments: number
  readonly remainingDocuments: number
  readonly isFull: boolean
}

export function canPersistMoreDocuments(currentCount: number, maxDocuments: number): boolean {
  return currentCount < maxDocuments
}

export function summarizeCapacity(
  savedDocuments: number,
  maxDocuments: number
): CapacitySummary {
  return {
    savedDocuments,
    maxDocuments,
    remainingDocuments: Math.max(maxDocuments - savedDocuments, 0),
    isFull: savedDocuments >= maxDocuments
  }
}
