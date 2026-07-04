import type { EmbeddingProvider } from "../ai/types"
import { parseEmbeddingNamespace } from "../core/namespace"
import { isInsufficientCompactText } from "../core/informativeContent"
import { cosineSimilarity } from "../core/similarity"
import type { createDocumentsRepository } from "../db/documentsRepo"
import type { createEmbeddingsRepository } from "../db/embeddingsRepo"
import type { EmbeddingNamespace } from "../shared/types"

const HIGH_DUPLICATE_THRESHOLD = 0.5

export interface ArticlePrecheckResult {
  readonly duplicateScore: number | null
  readonly kind:
    | "already-read"
    | "high-duplicate"
    | "insufficient-content"
    | "low-duplicate"
    | "unknown-duplicate"
    | "precheck-failed"
}

interface BuildArticlePrecheckDependencies {
  readonly activeEmbeddingNamespace?: EmbeddingNamespace
  readonly documentsRepository: ReturnType<typeof createDocumentsRepository>
  readonly embeddingsRepository: ReturnType<typeof createEmbeddingsRepository>
  readonly embeddingModel: string
  readonly embeddingProvider: EmbeddingProvider
  readonly embeddingProviderName: string
}

function roundDuplicateScore(score: number): number {
  return Math.round(score * 100) / 100
}

async function resolveActiveNamespace(
  input: BuildArticlePrecheckDependencies
): Promise<EmbeddingNamespace | null> {
  if (input.activeEmbeddingNamespace !== undefined) {
    try {
      const parsedNamespace = parseEmbeddingNamespace(input.activeEmbeddingNamespace)

      if (
        parsedNamespace.provider === input.embeddingProviderName &&
        parsedNamespace.model === input.embeddingModel
      ) {
        return input.activeEmbeddingNamespace
      }
    } catch {
      // Ignore malformed namespace and continue with stored embedding discovery.
    }
  }

  const matchingEmbeddings = (await input.embeddingsRepository.listAllEmbeddings()).filter(
    (embedding) =>
      embedding.provider === input.embeddingProviderName && embedding.model === input.embeddingModel
  )

  if (matchingEmbeddings.length === 0) {
    return null
  }

  const latestMatchingEmbedding = matchingEmbeddings.sort(
    (left, right) => right.createdAt - left.createdAt
  )[0]

  return latestMatchingEmbedding?.namespace ?? null
}

export function buildArticlePrecheck(input: BuildArticlePrecheckDependencies) {
  return {
    async run(precheckInput: {
      readonly canonicalUrl: string
      readonly compactText: string
      readonly url: string
    }): Promise<ArticlePrecheckResult> {
      const existingDocument = await input.documentsRepository.findByExactUrl({
        canonicalUrl: precheckInput.canonicalUrl,
        url: precheckInput.url
      })

      if (existingDocument !== undefined) {
        return {
          duplicateScore: 1,
          kind: "already-read"
        }
      }

      if (isInsufficientCompactText(precheckInput.compactText)) {
        return {
          duplicateScore: null,
          kind: "insufficient-content"
        }
      }

      const namespace = await resolveActiveNamespace(input)

      if (namespace === null) {
        return {
          duplicateScore: null,
          kind: "unknown-duplicate"
        }
      }

      const existingEmbeddings = await input.embeddingsRepository.listByNamespace(namespace)

      if (existingEmbeddings.length === 0) {
        return {
          duplicateScore: null,
          kind: "unknown-duplicate"
        }
      }

      try {
        const response = await input.embeddingProvider.embed({
          texts: [precheckInput.compactText],
          model: input.embeddingModel
        })
        const queryVector = response.vectors[0]

        if (queryVector === undefined) {
          return {
            duplicateScore: null,
            kind: "unknown-duplicate"
          }
        }

        const bestSimilarity = existingEmbeddings.reduce(
          (highestSimilarity, embedding) =>
            Math.max(highestSimilarity, cosineSimilarity(queryVector, embedding.vector)),
          0
        )
        const duplicateScore = roundDuplicateScore(bestSimilarity)

        return {
          duplicateScore,
          kind: duplicateScore >= HIGH_DUPLICATE_THRESHOLD ? "high-duplicate" : "low-duplicate"
        }
      } catch {
        return {
          duplicateScore: null,
          kind: "precheck-failed"
        }
      }
    }
  }
}
