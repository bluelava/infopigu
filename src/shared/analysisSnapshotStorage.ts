import { canonicalizeUrl } from "../core/url"

interface SnapshotWithPage {
  readonly page?: {
    readonly canonicalUrl: string
    readonly url: string
  }
}

export function createAnalysisSnapshotStorageKey(url: string): string {
  return canonicalizeUrl(url)
}

export function normalizeAnalysisResultsByUrl<T extends SnapshotWithPage>(
  input: Record<string, T> | undefined
): Record<string, T> {
  if (input === undefined) {
    return {}
  }

  const normalizedEntries = new Map<string, T>()

  for (const [key, snapshot] of Object.entries(input)) {
    const baseUrl = snapshot.page?.canonicalUrl ?? snapshot.page?.url ?? key
    normalizedEntries.set(createAnalysisSnapshotStorageKey(baseUrl), snapshot)
  }

  return Object.fromEntries(normalizedEntries)
}
