import { createEmbeddingNamespaceId, type EmbeddingNamespace } from "../shared/types"

export function createEmbeddingNamespace(
  provider: string,
  model: string,
  dimensions: number
): EmbeddingNamespace {
  return createEmbeddingNamespaceId(`${provider}:${model}:${dimensions}`)
}

export function parseEmbeddingNamespace(namespace: string): {
  readonly provider: string
  readonly model: string
  readonly dimensions: number
} {
  const parts = namespace.split(":")
  const dimensionsText = parts.pop()
  const provider = parts.shift()

  if (provider === undefined || dimensionsText === undefined || parts.length === 0) {
    throw new Error(`Invalid namespace: ${namespace}`)
  }

  const dimensions = Number(dimensionsText)

  if (!Number.isInteger(dimensions)) {
    throw new Error(`Invalid namespace dimensions: ${namespace}`)
  }

  return {
    provider,
    model: parts.join(":"),
    dimensions
  }
}
