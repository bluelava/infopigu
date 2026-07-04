import { useEffect, useState } from "react"

import { resolveWhitelistDomain } from "../core/url"
import { cosineSimilarity } from "../core/similarity"
import { createClaimsRepository } from "../db/claimsRepo"
import { createDocumentsRepository } from "../db/documentsRepo"
import { createEmbeddingsRepository } from "../db/embeddingsRepo"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createResultsRepository } from "../db/resultsRepo"
import { createSettingsRepository } from "../db/settingsRepo"
import { createWhitelistRepository } from "../db/whitelistRepo"
import type {
  AnalysisResultRecord,
  ClaimRecord,
  DocumentId,
  DocumentRecord,
  EmbeddingNamespace,
  EmbeddingRecord
} from "../shared/types"

const database = createCognitiveDeltaDb()

const CATEGORY_STYLES = {
  ai: { color: "#d9805c", label: "AI" },
  finance: { color: "#b6694e", label: "Finance" },
  tech: { color: "#8f7bc7", label: "Tech" },
  policy: { color: "#d0a36d", label: "Policy" },
  society: { color: "#5f9d8c", label: "Society" },
  health: { color: "#6db48d", label: "Health" },
  creator: { color: "#768ccf", label: "Creator" },
  other: { color: "#8b5e34", label: "Other" }
} as const

type CategoryId = keyof typeof CATEGORY_STYLES

export interface VizKdbNeighbor {
  readonly docId: DocumentId
  readonly similarity: number
  readonly relativeGain: number | null
}

export interface VizKdbNode {
  readonly docId: DocumentId
  readonly title: string
  readonly url: string
  readonly canonicalUrl: string
  readonly domain: string
  readonly duplicateScore: number
  readonly noveltyScore: number
  readonly recommendation: AnalysisResultRecord["recommendation"] | null
  readonly categoryId: CategoryId
  readonly categoryLabel: string
  readonly categoryColor: string
  readonly effectiveAt: number
  readonly readAt: number
  readonly savedAt: number
  readonly claims: readonly string[]
  readonly neighbors: readonly VizKdbNeighbor[]
}

export interface VizKdbEdge {
  readonly sourceId: DocumentId
  readonly targetId: DocumentId
  readonly similarity: number
}

export interface VizKdbDomainStat {
  readonly count: number
  readonly domain: string
}

export interface VizKdbModel {
  readonly nodes: readonly VizKdbNode[]
  readonly edges: readonly VizKdbEdge[]
  readonly namespace: EmbeddingNamespace | null
  readonly namespaceLabel: string
  readonly whitelistDomains: readonly string[]
  readonly domains: readonly VizKdbDomainStat[]
  readonly categories: readonly {
    readonly color: string
    readonly count: number
    readonly id: CategoryId
    readonly label: string
  }[]
}

export type VizKdbLoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly model: VizKdbModel }
  | { readonly kind: "error"; readonly message: string }

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function pickCategory(document: DocumentRecord, claims: readonly string[]): CategoryId {
  const source = `${document.title}\n${claims.join("\n")}`.toLowerCase()

  if (/[a-z]/u.test(source) && /(agent|ai|模型|人工智能|openai|claude|gpt)/u.test(source)) {
    return "ai"
  }
  if (/(基金|股票|融资|投资|财报|营收|美元|利率|消费|cpi|market|revenue|fund)/u.test(source)) {
    return "finance"
  }
  if (/(芯片|系统|软件|浏览器|插件|开源|代码|技术|平台|cloud|api|app|github)/u.test(source)) {
    return "tech"
  }
  if (/(政策|政府|法院|监管|立法|国际关系|外交)/u.test(source)) {
    return "policy"
  }
  if (/(医院|医疗|药物|疾病|健康|疫苗)/u.test(source)) {
    return "health"
  }
  if (/(主播|博主|视频|短片|节目|微博|发布会|创作者|内容)/u.test(source)) {
    return "creator"
  }
  if (/(社会|教育|就业|人口|公益|文化|旅行|消费体验)/u.test(source)) {
    return "society"
  }

  return "other"
}

function resolveNamespace(
  activeEmbeddingNamespace: EmbeddingNamespace | undefined,
  embeddings: readonly EmbeddingRecord[]
): EmbeddingNamespace | null {
  if (
    activeEmbeddingNamespace !== undefined &&
    embeddings.some((embedding) => embedding.namespace === activeEmbeddingNamespace)
  ) {
    return activeEmbeddingNamespace
  }

  const latestEmbedding = [...embeddings].sort((left, right) => right.createdAt - left.createdAt)[0]

  return latestEmbedding?.namespace ?? null
}

function calculateRelativeGain(
  sourceClaims: readonly string[],
  sourceEmbeddings: readonly EmbeddingRecord[],
  targetEmbeddings: readonly EmbeddingRecord[]
): number | null {
  if (sourceClaims.length === 0 || sourceEmbeddings.length === 0 || targetEmbeddings.length === 0) {
    return null
  }

  let novelCount = 0

  for (const embedding of sourceEmbeddings) {
    const bestSimilarity = targetEmbeddings.reduce((best, candidate) => {
      return Math.max(best, cosineSimilarity(embedding.vector, candidate.vector))
    }, 0)

    if (bestSimilarity < 0.78) {
      novelCount += 1
    }
  }

  return clamp01(novelCount / sourceClaims.length)
}

function summarizeWhitelistedDomains(
  nodes: readonly Pick<VizKdbNode, "domain">[],
  whitelistDomains: readonly string[]
): readonly VizKdbDomainStat[] {
  const counts = new Map<string, number>()

  for (const node of nodes) {
    const whitelistedDomain = resolveWhitelistDomain(node.domain, whitelistDomains)

    if (whitelistedDomain === null) {
      continue
    }

    counts.set(whitelistedDomain, (counts.get(whitelistedDomain) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain))
}

function deriveModel(input: {
  readonly allEmbeddings: readonly EmbeddingRecord[]
  readonly claims: readonly ClaimRecord[]
  readonly documents: readonly DocumentRecord[]
  readonly resultsByDocumentId: ReadonlyMap<DocumentId, AnalysisResultRecord>
  readonly resolvedNamespace: EmbeddingNamespace | null
  readonly whitelistDomains: readonly string[]
}): VizKdbModel {
  const claimsByDocumentId = new Map<DocumentId, ClaimRecord[]>()

  for (const claim of input.claims) {
    const currentClaims = claimsByDocumentId.get(claim.docId) ?? []
    currentClaims.push(claim)
    claimsByDocumentId.set(claim.docId, currentClaims)
  }

  const embeddingsByDocumentId = new Map<DocumentId, EmbeddingRecord[]>()

  for (const embedding of input.allEmbeddings) {
    if (input.resolvedNamespace !== null && embedding.namespace !== input.resolvedNamespace) {
      continue
    }

    const currentEmbeddings = embeddingsByDocumentId.get(embedding.docId) ?? []
    currentEmbeddings.push(embedding)
    embeddingsByDocumentId.set(embedding.docId, currentEmbeddings)
  }

  const nodes = input.documents.map<VizKdbNode>((document) => {
    const result = input.resultsByDocumentId.get(document.docId)
    const claims = (claimsByDocumentId.get(document.docId) ?? []).map((claim) => claim.text)
    const categoryId = pickCategory(document, claims)

    return {
      docId: document.docId,
      title: document.title,
      url: document.url,
      canonicalUrl: document.canonicalUrl,
      domain: document.domain,
      duplicateScore: result?.duplicateScore ?? 0,
      noveltyScore: result?.noveltyScore ?? 0,
      recommendation: result?.recommendation ?? null,
      categoryId,
      categoryLabel: CATEGORY_STYLES[categoryId].label,
      categoryColor: CATEGORY_STYLES[categoryId].color,
      effectiveAt: document.readAt > 0 ? document.readAt : document.savedAt,
      readAt: document.readAt,
      savedAt: document.savedAt,
      claims,
      neighbors: []
    }
  })

  const nodeById = new Map(nodes.map((node) => [node.docId, node] as const))
  const neighborPairs = new Map<string, VizKdbEdge>()

  for (const source of nodes) {
    const sourceEmbeddings = embeddingsByDocumentId.get(source.docId) ?? []
    const sourceClaims = source.claims
    const candidates = nodes
      .filter((candidate) => candidate.docId !== source.docId)
      .map((candidate) => {
        const targetEmbeddings = embeddingsByDocumentId.get(candidate.docId) ?? []

        if (sourceEmbeddings.length === 0 || targetEmbeddings.length === 0) {
          return {
            docId: candidate.docId,
            relativeGain: null,
            similarity: 0
          }
        }

        let similaritySum = 0

        for (const embedding of sourceEmbeddings) {
          const bestSimilarity = targetEmbeddings.reduce((best, target) => {
            return Math.max(best, cosineSimilarity(embedding.vector, target.vector))
          }, 0)

          similaritySum += bestSimilarity
        }

        const similarity = similaritySum / sourceEmbeddings.length

        return {
          docId: candidate.docId,
          relativeGain: calculateRelativeGain(sourceClaims, sourceEmbeddings, targetEmbeddings),
          similarity
        }
      })
      .filter((candidate) => candidate.similarity > 0)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 5)

    const currentNode = nodeById.get(source.docId)

    if (currentNode !== undefined) {
      ;(currentNode as { neighbors: readonly VizKdbNeighbor[] }).neighbors = candidates
    }

    for (const candidate of candidates) {
      const pairKey = [source.docId, candidate.docId].sort().join("::")
      const previous = neighborPairs.get(pairKey)

      if (previous === undefined || candidate.similarity > previous.similarity) {
        neighborPairs.set(pairKey, {
          sourceId: source.docId,
          targetId: candidate.docId,
          similarity: candidate.similarity
        })
      }
    }
  }

  const categories = Object.entries(CATEGORY_STYLES).map(([id, category]) => ({
    color: category.color,
    count: nodes.filter((node) => node.categoryId === id).length,
    id: id as CategoryId,
    label: category.label
  }))

  return {
    nodes: [...nodes].sort((left, right) => right.effectiveAt - left.effectiveAt),
    edges: [...neighborPairs.values()],
    namespace: input.resolvedNamespace,
    namespaceLabel: input.resolvedNamespace ?? "Unavailable",
    whitelistDomains: [...input.whitelistDomains],
    domains: summarizeWhitelistedDomains(nodes, input.whitelistDomains),
    categories
  }
}

export function useVizKdbData(): VizKdbLoadState {
  const [state, setState] = useState<VizKdbLoadState>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const documentsRepository = createDocumentsRepository(database)
        const claimsRepository = createClaimsRepository(database)
        const embeddingsRepository = createEmbeddingsRepository(database)
        const resultsRepository = createResultsRepository(database)
        const settingsRepository = createSettingsRepository(database)
        const whitelistRepository = createWhitelistRepository(database)

        const [documents, allEmbeddings, settings, whitelistDomains] = await Promise.all([
          documentsRepository.listPersistedDocuments(),
          embeddingsRepository.listAllEmbeddings(),
          settingsRepository.getSettings(),
          whitelistRepository.listDomains()
        ])

        if (cancelled) {
          return
        }

        if (documents.length === 0) {
          setState({ kind: "empty" })
          return
        }

        const docIds = documents.map((document) => document.docId)
        const [claims, resultsByDocumentId] = await Promise.all([
          claimsRepository.listByDocumentIds(docIds),
          resultsRepository.getLatestByDocumentIds(docIds)
        ])
        const resolvedNamespace = resolveNamespace(settings.activeEmbeddingNamespace, allEmbeddings)

        const model = deriveModel({
          allEmbeddings,
          claims,
          documents,
          resultsByDocumentId,
          resolvedNamespace,
          whitelistDomains
        })

        if (!cancelled) {
          setState({
            kind: "ready",
            model
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Viz-KDB failed to load"
          })
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
