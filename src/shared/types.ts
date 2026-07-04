import { z } from "./zod"

declare const brand: unique symbol

export type Brand<TValue, TBrand extends string> = TValue & { readonly [brand]: TBrand }

export type DocumentId = Brand<string, "DocumentId">
export type ChunkId = Brand<string, "ChunkId">
export type ClaimId = Brand<string, "ClaimId">
export type EmbeddingId = Brand<string, "EmbeddingId">
export type ProviderId = Brand<string, "ProviderId">
export type ResultId = Brand<string, "ResultId">
export type FeedbackId = Brand<string, "FeedbackId">
export type EmbeddingNamespace = Brand<string, "EmbeddingNamespace">
export type AnalysisJobId = Brand<string, "AnalysisJobId">

export type ReadMode = "auto" | "manual"
export type ThemeMode = "auto" | "dark" | "light"
export type LanguageMode = "auto" | "zh-CN" | "zh-TW" | "en"
export type AnalysisJudgement = "complete" | "insufficient-content"
export type ClaimType = "fact" | "opinion" | "prediction" | "advice" | "data" | "event"
export type Recommendation = "skip" | "skim" | "read"

export interface ExtractedBlock {
  readonly type: "heading" | "paragraph" | "list" | "quote"
  readonly text: string
  readonly level?: number
}

export interface ExtractedDocument {
  readonly docId: DocumentId
  readonly url: string
  readonly canonicalUrl: string
  readonly domain: string
  readonly title: string
  readonly author?: string
  readonly publishedAt?: number
  readonly blocks: readonly ExtractedBlock[]
  readonly extractor: string
}

export interface ChunkRecord {
  readonly chunkId: ChunkId
  readonly docId: DocumentId
  readonly text: string
  readonly section?: string
  readonly startOffset: number
  readonly endOffset: number
  readonly charCount: number
  readonly createdAt: number
}

export interface ClaimRecord {
  readonly claimId: ClaimId
  readonly docId: DocumentId
  readonly chunkId: ChunkId
  readonly text: string
  readonly type: ClaimType
  readonly importance: number
  readonly confidence: number
  readonly entities: readonly string[]
  readonly provider: string
  readonly model: string
  readonly createdAt: number
}

export interface WhitelistDomain {
  readonly domain: string
  readonly createdAt: number
}

export type ProviderType = "openai" | "bigmodel" | "deepseek" | "custom-openai-compatible"

export interface ProviderConfig {
  readonly id: ProviderId
  readonly name: string
  readonly type: ProviderType
  readonly baseUrl: string
  readonly apiKeyEncrypted?: string
  readonly embeddingModels: readonly string[]
  readonly chatModels: readonly string[]
  readonly supportsEmbedding: boolean
  readonly supportsChat: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export type DocumentStatus = "analyzed" | "saved" | "ignored" | "deleted"

export interface DocumentRecord {
  readonly docId: DocumentId
  readonly url: string
  readonly canonicalUrl: string
  readonly domain: string
  readonly title: string
  readonly author?: string
  readonly publishedAt?: number
  readonly readAt: number
  readonly savedAt: number
  readonly contentHash: string
  readonly extractor: string
  readonly status: DocumentStatus
}

export interface EmbeddingRecord {
  readonly embeddingId: EmbeddingId
  readonly targetType: "claim" | "chunk"
  readonly targetId: ClaimId | ChunkId
  readonly docId: DocumentId
  readonly vector: readonly number[]
  readonly provider: string
  readonly model: string
  readonly dimensions: number
  readonly namespace: EmbeddingNamespace
  readonly createdAt: number
}

export interface AnalysisResultRecord {
  readonly resultId: ResultId
  readonly docId: DocumentId
  readonly judgement?: AnalysisJudgement
  readonly duplicateScore: number
  readonly noveltyScore: number
  readonly recommendation: Recommendation
  readonly matchedClaimIds: readonly ClaimId[]
  readonly novelClaimIds: readonly ClaimId[]
  readonly createdAt: number
}

export interface SimilarSourceSummary {
  readonly snippet: string
  readonly similarity: number
  readonly url: string
}

export type AnalysisJobStage =
  | "queued"
  | "claiming"
  | "embedding"
  | "persisting"
  | "completed"
  | "failed"

export interface AnalysisJobRecord {
  readonly jobId: AnalysisJobId
  readonly docId: DocumentId
  readonly title: string
  readonly url: string
  readonly canonicalUrl: string
  readonly document: ExtractedDocument
  readonly claimProviderId: ProviderId
  readonly claimModel: string
  readonly embeddingProviderId: ProviderId
  readonly embeddingModel: string
  readonly stage: AnalysisJobStage
  readonly createdAt: number
  readonly completedTasks: number
  readonly pendingTasks: number
  readonly totalTasks: number
  readonly lastError?: string
}

export type FeedbackType = "accurate" | "not_duplicate" | "already_known" | "not_important"

export interface FeedbackRecord {
  readonly feedbackId: FeedbackId
  readonly resultId: ResultId
  readonly claimId?: ClaimId
  readonly type: FeedbackType
  readonly createdAt: number
}

export interface Settings {
  readonly id: "global"
  readonly singleArticleReadMode: ReadMode
  readonly feedItemReadMode: ReadMode
  readonly themeMode: ThemeMode
  readonly languageMode: LanguageMode
  readonly dwellThresholdSeconds: number
  readonly novelClaimsOverlaySeconds: number
  readonly novelClaimsOverlaySecondsCustomized?: boolean
  readonly novelClaimsOverlayMaxVisible: number
  readonly maxDocuments: number
  readonly debugLoggingEnabled: boolean
  readonly activeEmbeddingNamespace?: EmbeddingNamespace
  readonly activeEmbeddingProviderId?: ProviderId
  readonly activeEmbeddingModel?: string
  readonly activeClaimProviderId?: ProviderId
  readonly activeClaimModel?: string
  readonly autoAnalyzeEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  id: "global",
  singleArticleReadMode: "auto",
  feedItemReadMode: "manual",
  themeMode: "auto",
  languageMode: "auto",
  dwellThresholdSeconds: 20,
  novelClaimsOverlaySeconds: 5,
  novelClaimsOverlaySecondsCustomized: false,
  novelClaimsOverlayMaxVisible: 5,
  maxDocuments: 1000,
  autoAnalyzeEnabled: true,
  debugLoggingEnabled: false
}

export const claimTypes = ["fact", "opinion", "prediction", "advice", "data", "event"] as const

export const claimTypeSchema = z.enum(claimTypes)

export const extractedBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "list", "quote"]),
  text: z.string().min(1),
  level: z.number().int().positive().optional()
})

export const extractedDocumentSchema = z.object({
  docId: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1).optional(),
  publishedAt: z.number().int().optional(),
  blocks: z.array(extractedBlockSchema).min(1),
  extractor: z.string().min(1)
})

export function parseExtractedDocument(
  input: z.infer<typeof extractedDocumentSchema>
): ExtractedDocument {
  const blocks = input.blocks.map<ExtractedBlock>((block) =>
    block.level === undefined
      ? {
          type: block.type,
          text: block.text
        }
      : {
          type: block.type,
          text: block.text,
          level: block.level
        }
  )

  return {
    docId: createDocumentId(input.docId),
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    domain: input.domain,
    title: input.title,
    blocks,
    extractor: input.extractor,
    ...(input.author === undefined ? {} : { author: input.author }),
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt })
  }
}

export function createDocumentId(value: string): DocumentId {
  return value as DocumentId
}

export function createChunkId(value: string): ChunkId {
  return value as ChunkId
}

export function createClaimId(value: string): ClaimId {
  return value as ClaimId
}

export function createEmbeddingId(value: string): EmbeddingId {
  return value as EmbeddingId
}

export function createAnalysisJobId(value: string): AnalysisJobId {
  return value as AnalysisJobId
}

export function createProviderId(value: string): ProviderId {
  return value as ProviderId
}

export function createResultId(value: string): ResultId {
  return value as ResultId
}

export function createFeedbackId(value: string): FeedbackId {
  return value as FeedbackId
}

export function createEmbeddingNamespaceId(value: string): EmbeddingNamespace {
  return value as EmbeddingNamespace
}
