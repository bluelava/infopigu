import { createEmbeddingNamespace } from "../core/namespace"
import { rankBySimilarity } from "../core/similarity"
import { createEmbeddingId, type ClaimRecord, type DocumentRecord, type EmbeddingRecord } from "../shared/types"
import type { EmbeddingProvider } from "../ai/types"
import type { createEmbeddingsRepository } from "../db/embeddingsRepo"
import { createEmbeddingTaskQueue, type EmbeddingTaskQueue } from "./embeddingTaskQueue"

interface BuildClaimEmbeddingsInput {
  readonly claims: readonly ClaimRecord[]
  readonly documentTitle: string
  readonly embeddingModel: string
  readonly embeddingProvider: EmbeddingProvider
  readonly embeddingProviderName: string
  readonly embeddingsRepository: ReturnType<typeof createEmbeddingsRepository>
  readonly taskQueue?: EmbeddingTaskQueue
  readonly logProgress: (input: {
    readonly completedTasks: number
    readonly pendingTasks: number
    readonly totalTasks: number
  }) => void
}

export async function buildClaimEmbeddings(input: BuildClaimEmbeddingsInput): Promise<{
  readonly embeddings: readonly EmbeddingRecord[]
  readonly existingEmbeddings: readonly EmbeddingRecord[]
  readonly namespace: ReturnType<typeof createEmbeddingNamespace>
  readonly rankedMatches: readonly (readonly {
    readonly similarity: number
    readonly targetId: ClaimRecord["claimId"]
  }[])[]
}> {
  const taskQueue = input.taskQueue ?? createEmbeddingTaskQueue()
  const serialResponses = await taskQueue.runSerial(input.claims, async (claim, index) => {
    const response = await input.embeddingProvider.embed({
      texts: [claim.text],
      model: input.embeddingModel
    })

    input.logProgress({
      completedTasks: index + 1,
      pendingTasks: taskQueue.getSnapshot().pendingTasks - 1,
      totalTasks: input.claims.length
    })

    return {
      claim,
      vector: response.vectors[0] ?? [],
      model: response.model,
      dimensions: response.dimensions
    }
  })

  const firstResponse = serialResponses[0]

  if (firstResponse === undefined) {
    return {
      embeddings: [],
      existingEmbeddings: [],
      namespace: createEmbeddingNamespace(input.embeddingProviderName, input.embeddingModel, 0),
      rankedMatches: []
    }
  }

  const namespace = createEmbeddingNamespace(
    input.embeddingProviderName,
    firstResponse.model,
    firstResponse.dimensions
  )
  const existingEmbeddings = await input.embeddingsRepository.listByNamespace(namespace)
  const embeddings = serialResponses.map<EmbeddingRecord>((response, index) => ({
    embeddingId: createEmbeddingId(`${response.claim.docId}_embedding_${index + 1}`),
    targetType: "claim",
    targetId: response.claim.claimId,
    docId: response.claim.docId,
    vector: response.vector,
    provider: input.embeddingProviderName,
    model: response.model,
    dimensions: response.dimensions,
    namespace,
    createdAt: Date.now() + index
  }))
  const rankedMatches = embeddings.map((embedding) =>
    rankBySimilarity(
      embedding.vector,
      existingEmbeddings.map((existingEmbedding) => ({
        targetId: existingEmbedding.targetId as ClaimRecord["claimId"],
        vector: existingEmbedding.vector
      }))
    )
  )

  return {
    embeddings,
    existingEmbeddings,
    namespace,
    rankedMatches
  }
}

export function collectSimilarSources(input: {
  readonly existingEmbeddings: readonly EmbeddingRecord[]
  readonly rankedMatches: readonly (readonly {
    readonly similarity: number
    readonly targetId: ClaimRecord["claimId"]
  }[])[]
}): readonly {
  readonly docId: DocumentRecord["docId"]
  readonly similarity: number
}[] {
  const docIdByTargetId = new Map(
    input.existingEmbeddings.map((embedding) => [embedding.targetId, embedding.docId] as const)
  )
  const bestSimilarityByDocId = new Map<DocumentRecord["docId"], number>()

  for (const matches of input.rankedMatches) {
    for (const match of matches) {
      const docId = docIdByTargetId.get(match.targetId)

      if (docId === undefined) {
        continue
      }

      const previousBestSimilarity = bestSimilarityByDocId.get(docId) ?? 0

      if (match.similarity > previousBestSimilarity) {
        bestSimilarityByDocId.set(docId, match.similarity)
      }
    }
  }

  return [...bestSimilarityByDocId.entries()]
    .map(([docId, similarity]) => ({
      docId,
      similarity
    }))
    .sort((left, right) => right.similarity - left.similarity)
}
