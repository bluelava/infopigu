import type { ClaimProvider, EmbeddingProvider } from "../ai/types"
import { buildClaimEmbeddings, collectSimilarSources } from "./analysisEmbeddingStage"
import { canPersistMoreDocuments } from "../core/capacity"
import { createChunksFromDocument } from "../core/chunker"
import { hashContentParts } from "../core/hashing"
import { filterInformativeClaims, isInsufficientDocument } from "../core/informativeContent"
import { classifyClaimMatch, computeAnalysisScores } from "../core/scoring"
import type { createChunksRepository } from "../db/chunksRepo"
import type { createClaimsRepository } from "../db/claimsRepo"
import type { createDocumentsRepository } from "../db/documentsRepo"
import type { createEmbeddingsRepository } from "../db/embeddingsRepo"
import type { createResultsRepository } from "../db/resultsRepo"
import {
  createClaimId,
  type ChunkRecord,
  createDocumentId,
  createEmbeddingNamespaceId,
  createResultId,
  type AnalysisResultRecord,
  type ClaimRecord,
  type DocumentRecord,
  type EmbeddingRecord,
  type ExtractedDocument,
  type SimilarSourceSummary
} from "../shared/types"
import { debugLog } from "../shared/debug"
import { getMeaningfulCharacterCount, isInformativeClaimText } from "../core/informativeContent"

interface AnalysisPipelineDependencies {
  readonly claimProvider: ClaimProvider
  readonly chunksRepository: ReturnType<typeof createChunksRepository>
  readonly claimsRepository: ReturnType<typeof createClaimsRepository>
  readonly documentsRepository: ReturnType<typeof createDocumentsRepository>
  readonly embeddingsRepository: ReturnType<typeof createEmbeddingsRepository>
  readonly embeddingProvider: EmbeddingProvider
  readonly onEmbeddingTaskProgress?: (input: {
    readonly completedTasks: number
    readonly pendingTasks: number
    readonly totalTasks: number
  }) => Promise<void> | void
  readonly resultsRepository: ReturnType<typeof createResultsRepository>
}

interface AnalyzeDocumentInput {
  readonly document: ExtractedDocument
  readonly claimModel: string
  readonly claimProviderName: string
  readonly currentDocumentCount: number
  readonly embeddingModel: string
  readonly embeddingProviderName: string
  readonly maxDocuments: number
}

export interface AnalysisPipelineResult {
  readonly claims: readonly ClaimRecord[]
  readonly duplicateClaims: readonly string[]
  readonly judgement?: "complete" | "insufficient-content"
  readonly namespace: EmbeddingRecord["namespace"]
  readonly novelClaims: readonly string[]
  readonly persisted: boolean
  readonly result: AnalysisResultRecord
  readonly similarSources: readonly SimilarSourceSummary[]
}

const SHORT_FORM_SOCIAL_EXTRACTORS = new Set(["feed-item", "weibo-article", "x-article"])

function getMinimumInformativeClaimCount(document: ExtractedDocument): number {
  return SHORT_FORM_SOCIAL_EXTRACTORS.has(document.extractor) ? 1 : 2
}

function buildShortFormFallbackClaims(input: {
  readonly chunks: readonly ChunkRecord[]
  readonly document: ExtractedDocument
  readonly model: string
  readonly provider: string
}): readonly ClaimRecord[] {
  if (!SHORT_FORM_SOCIAL_EXTRACTORS.has(input.document.extractor)) {
    return []
  }

  const fallbackClaims: Array<ClaimRecord | null> = input.chunks.map((chunk, index) => {
      const text = chunk.text.replace(/\s+/gu, " ").trim()

      if (getMeaningfulCharacterCount(text) < 10) {
        return null
      }

      return {
        claimId: createClaimId(`${input.document.docId}_fallback_claim_${index + 1}`),
        docId: input.document.docId,
        chunkId: chunk.chunkId,
        text,
        type: "opinion" as const,
        importance: 0.55,
        confidence: 0.4,
        entities: [],
        provider: input.provider,
        model: input.model,
        createdAt: Date.now() + index
      }
    })

  return fallbackClaims.filter((claim): claim is ClaimRecord => claim !== null).slice(0, 1)
}

export function createAnalysisPipeline(dependencies: AnalysisPipelineDependencies) {
  return {
    async analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalysisPipelineResult> {
      const startedAt = Date.now()
      debugLog("background", "analysis pipeline started", {
        title: input.document.title,
        claimModel: input.claimModel,
        embeddingModel: input.embeddingModel
      })
      const contentHash = await hashContentParts([
        input.document.title,
        ...input.document.blocks.map((block) => block.text)
      ])
      const existingDocument = await dependencies.documentsRepository.findByExactUrl({
        canonicalUrl: input.document.canonicalUrl,
        url: input.document.url
      })
      const persistedDocumentId = existingDocument?.docId ?? input.document.docId
      const persistedDocument = {
        ...input.document,
        docId: persistedDocumentId
      }
      const chunks = createChunksFromDocument(persistedDocument)
      debugLog("background", "document chunked", {
        title: input.document.title,
        chunkCount: chunks.length
      })
      const extractedClaims = await dependencies.claimProvider.extractClaims({
        docId: persistedDocument.docId,
        chunks,
        model: input.claimModel,
        provider: input.claimProviderName
      })
      debugLog("background", "claims extracted", {
        title: input.document.title,
        claimCount: extractedClaims.length
      })
      const claims = extractedClaims.map<ClaimRecord>((claim, index) => ({
        claimId: createClaimId(`${persistedDocument.docId}_claim_${index + 1}`),
        docId: persistedDocument.docId,
        chunkId: claim.chunkId,
        text: claim.text,
        type: claim.type,
        importance: claim.importance,
        confidence: claim.confidence,
        entities: claim.entities,
        provider: input.claimProviderName,
        model: input.claimModel,
        createdAt: Date.now() + index
      }))

      const informativeExtractedClaims = filterInformativeClaims(extractedClaims)
      const filteredInformativeClaims = claims.filter((claim) =>
        informativeExtractedClaims.some(
          (informativeClaim) =>
            informativeClaim.chunkId === claim.chunkId && informativeClaim.text === claim.text
        )
      )
      const informativeClaims =
        filteredInformativeClaims.length > 0 || isInsufficientDocument(input.document)
          ? filteredInformativeClaims
          : buildShortFormFallbackClaims({
              chunks,
              document: persistedDocument,
              model: input.claimModel,
              provider: input.claimProviderName
            })
      const minimumInformativeClaimCount = getMinimumInformativeClaimCount(input.document)
      const shouldPersist = canPersistMoreDocuments(input.currentDocumentCount, input.maxDocuments)

      if (
        isInsufficientDocument(input.document) ||
        informativeClaims.length < minimumInformativeClaimCount
      ) {
        const result: AnalysisResultRecord = {
          resultId: createResultId(`${persistedDocument.docId}_result`),
          docId: persistedDocument.docId,
          judgement: "insufficient-content",
          duplicateScore: 0,
          noveltyScore: 0,
          recommendation: "read",
          matchedClaimIds: [],
          novelClaimIds: [],
          createdAt: Date.now()
        }

        if (shouldPersist) {
          const documentRecordBase: Omit<
            DocumentRecord,
            "author" | "publishedAt"
          > = {
            docId: persistedDocument.docId,
            url: persistedDocument.url,
            canonicalUrl: persistedDocument.canonicalUrl,
            domain: persistedDocument.domain,
            title: persistedDocument.title,
            readAt: 0,
            savedAt: Date.now(),
            contentHash,
            extractor: persistedDocument.extractor,
            status: "analyzed"
          }
          const documentRecord: DocumentRecord = {
            ...documentRecordBase,
            ...(persistedDocument.author === undefined ? {} : { author: persistedDocument.author }),
            ...(persistedDocument.publishedAt === undefined
              ? {}
              : { publishedAt: persistedDocument.publishedAt })
          }

          if (existingDocument !== undefined) {
            await Promise.all([
              dependencies.chunksRepository.deleteByDocumentId(persistedDocument.docId),
              dependencies.claimsRepository.deleteByDocumentId(persistedDocument.docId),
              dependencies.embeddingsRepository.deleteByDocumentId(persistedDocument.docId),
              dependencies.resultsRepository.deleteByDocumentId(persistedDocument.docId)
            ])
          }

          await dependencies.documentsRepository.saveDocument(documentRecord)
          await dependencies.chunksRepository.saveChunks(chunks)
          await dependencies.resultsRepository.saveResult(result)
        }

        debugLog("background", "analysis judged insufficient-content", {
          title: input.document.title,
          informativeClaimCount: informativeClaims.length,
          minimumInformativeClaimCount,
          persisted: shouldPersist
        })

        return {
          claims: [],
          duplicateClaims: [],
          judgement: "insufficient-content",
          namespace: createEmbeddingNamespaceId("insufficient-content"),
          novelClaims: [],
          persisted: shouldPersist,
          result,
          similarSources: []
        }
      }

      if (filteredInformativeClaims.length === 0 && informativeClaims.length > 0) {
        debugLog("background", "analysis used short-form fallback claim", {
          title: input.document.title,
          fallbackClaimCount: informativeClaims.length
        })
      }

      const { embeddings, existingEmbeddings, namespace, rankedMatches } =
        await buildClaimEmbeddings({
          claims: informativeClaims,
          documentTitle: input.document.title,
          embeddingModel: input.embeddingModel,
          embeddingProvider: dependencies.embeddingProvider,
          embeddingProviderName: input.embeddingProviderName,
          embeddingsRepository: dependencies.embeddingsRepository,
          logProgress: ({ completedTasks, pendingTasks, totalTasks }) => {
            debugLog("background", "embedding task completed", {
              title: input.document.title,
              completedTasks,
              pendingTasks,
              totalTasks
            })
            void dependencies.onEmbeddingTaskProgress?.({
              completedTasks,
              pendingTasks,
              totalTasks
            })
          }
        })
      const dimensions = embeddings[0]?.dimensions ?? 0

      debugLog("background", "claim embeddings created", {
        title: input.document.title,
        vectorCount: embeddings.length,
        dimensions
      })
      debugLog("background", "loaded historical embeddings", {
        namespace,
        existingEmbeddingCount: existingEmbeddings.length
      })
      const scoreInputs = rankedMatches.map((ranked, index) => {
        const bestMatch = ranked[0]

        return {
          importance: informativeClaims[index]?.importance ?? 0,
          bestSimilarity: bestMatch?.similarity ?? 0
        }
      })
      const claimStates = scoreInputs.map((inputScore) => classifyClaimMatch(inputScore.bestSimilarity))
      const novelClaims = informativeClaims
        .filter((_, index) => claimStates[index] === "novel")
        .map((claim) => claim.text)
      const duplicateClaims = informativeClaims
        .filter((_, index) => claimStates[index] === "duplicate")
        .map((claim) => claim.text)
      const matchedSources = collectSimilarSources({
        existingEmbeddings,
        rankedMatches
      })
      const similarSourceRecords =
        matchedSources.length === 0
          ? []
          : await dependencies.documentsRepository.getDocumentsByIds(
              matchedSources.map((source) => source.docId)
            )
      const similarSourceChunks =
        matchedSources.length === 0
          ? []
          : await Promise.all(
              matchedSources.map(async (source) => [
                source.docId,
                await dependencies.chunksRepository.listByDocumentId(source.docId),
                await dependencies.claimsRepository.listByDocumentId(source.docId)
              ] as const)
            )
      const similarSourceRecordsById = new Map(
        similarSourceRecords.map((documentRecord) => [documentRecord.docId, documentRecord] as const)
      )
      const similarSourceEvidenceById = new Map(
        similarSourceChunks.map(([docId, chunks, claims]) => [docId, { chunks, claims }] as const)
      )
      const similarSources = matchedSources.flatMap<SimilarSourceSummary>((source) => {
        const documentRecord = similarSourceRecordsById.get(source.docId)
        const evidence = similarSourceEvidenceById.get(source.docId)

        if (documentRecord === undefined) {
          return []
        }

        const candidateSnippet =
          evidence?.claims.find((claim) => isInformativeClaimText(claim.text))?.text ??
          evidence?.chunks.find((chunk) => getMeaningfulCharacterCount(chunk.text) >= 12)?.text ??
          (documentRecord.title.length >= 8 ? documentRecord.title : "历史相似内容")

        return [
          {
            snippet: candidateSnippet,
            similarity: source.similarity,
            url: documentRecord.url
          }
        ]
      })

      const scores = computeAnalysisScores(scoreInputs)
      debugLog("background", "analysis scores computed", {
        duplicateScore: scores.duplicateScore,
        noveltyScore: scores.noveltyScore,
        recommendation: scores.recommendation
      })
      const matchedClaimIds = informativeClaims
        .filter((_, index) => claimStates[index] === "duplicate")
        .map((claim) => claim.claimId)
      const novelClaimIds = informativeClaims
        .filter((_, index) => claimStates[index] === "novel")
        .map((claim) => claim.claimId)
      const result: AnalysisResultRecord = {
        resultId: createResultId(`${persistedDocument.docId}_result`),
        docId: persistedDocument.docId,
        judgement: "complete",
        duplicateScore: scores.duplicateScore,
        noveltyScore: scores.noveltyScore,
        recommendation: scores.recommendation,
        matchedClaimIds,
        novelClaimIds,
        createdAt: Date.now()
      }

      if (shouldPersist) {
        const documentRecordBase: Omit<
          DocumentRecord,
          "author" | "publishedAt"
        > = {
          docId: persistedDocument.docId,
          url: persistedDocument.url,
          canonicalUrl: persistedDocument.canonicalUrl,
          domain: persistedDocument.domain,
          title: persistedDocument.title,
          readAt: 0,
          savedAt: Date.now(),
          contentHash,
          extractor: persistedDocument.extractor,
          status: "analyzed"
        }
        const documentRecord: DocumentRecord = {
          ...documentRecordBase,
          ...(persistedDocument.author === undefined ? {} : { author: persistedDocument.author }),
          ...(persistedDocument.publishedAt === undefined
            ? {}
            : { publishedAt: persistedDocument.publishedAt })
        }

        if (existingDocument !== undefined) {
          await Promise.all([
            dependencies.chunksRepository.deleteByDocumentId(persistedDocument.docId),
            dependencies.claimsRepository.deleteByDocumentId(persistedDocument.docId),
            dependencies.embeddingsRepository.deleteByDocumentId(persistedDocument.docId),
            dependencies.resultsRepository.deleteByDocumentId(persistedDocument.docId)
          ])
        }

        await dependencies.documentsRepository.saveDocument(documentRecord)
        await dependencies.chunksRepository.saveChunks(chunks)
        await dependencies.claimsRepository.saveClaims(informativeClaims)
        await dependencies.embeddingsRepository.saveEmbeddings(embeddings)
        await dependencies.resultsRepository.saveResult(result)
        debugLog("background", "analysis persisted", {
          title: input.document.title,
          claimCount: informativeClaims.length
        })
      }

      debugLog("background", "analysis pipeline completed", {
        title: input.document.title,
        persisted: shouldPersist,
        elapsedMs: Date.now() - startedAt
      })
      return {
        claims: informativeClaims,
        duplicateClaims,
        judgement: "complete",
        namespace,
        novelClaims,
        persisted: shouldPersist,
        result,
        similarSources
      }
    }
  }
}
