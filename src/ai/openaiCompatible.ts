import ky from "ky"
import { z } from "../shared/zod"

import { logProviderError, logProviderRequest, logProviderResponse } from "./openaiCompatibleDebug"
import type { ClaimProvider, EmbeddingProvider, ExtractedClaim, FetchImplementation } from "./types"
import { claimExtractionPrompt } from "../prompts/claimExtractionPrompt"
import { createChunkId, type ChunkId } from "../shared/types"

const embeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number())
    })
  )
})

const chatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string()
      })
    })
  )
})

const extractedClaimSchema = z.object({
  text: z.string().min(1),
  type: z.enum(["fact", "opinion", "prediction", "advice", "data", "event"]),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  entities: z.array(z.string()),
  source_chunk_id: z.string().min(1)
})

const extractedClaimsResponseSchema = z.object({
  claims: z.array(extractedClaimSchema)
})

interface OpenAiCompatibleProviderOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly fetchImplementation?: FetchImplementation
}

export const embeddingRequestTimeoutMs = 10_000
export const claimRequestTimeoutMs = 90_000

interface OpenAiCompatibleHttpClient {
  readonly baseUrl: string
  readonly client: ReturnType<typeof ky.create>
  readonly headers: {
    readonly Authorization: string
    readonly "Content-Type": string
  }
  readonly requestTimeoutMs: number
}

function createHttpClient(
  options: OpenAiCompatibleProviderOptions,
  requestTimeoutMs: number
) : OpenAiCompatibleHttpClient {
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json"
  } as const
  const clientOptions = {
    headers,
    prefixUrl: options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`,
    retry: 0,
    timeout: requestTimeoutMs
  }

  const client = ky.create(
    options.fetchImplementation === undefined
      ? clientOptions
      : {
          ...clientOptions,
          fetch: options.fetchImplementation
        }
  )

  return {
    baseUrl: options.baseUrl,
    client,
    headers,
    requestTimeoutMs
  }
}

function mapExtractedClaims(
  rawContent: string,
  knownChunkIds: readonly ChunkId[]
): readonly ExtractedClaim[] {
  const parsed = extractedClaimsResponseSchema.parse(normalizeClaimResponse(JSON.parse(rawContent)))
  const knownIds = new Set(knownChunkIds)

  return parsed.claims.map((claim) => {
    const chunkId = createChunkId(claim.source_chunk_id)

    if (!knownIds.has(chunkId)) {
      throw new Error(`Unknown chunk id: ${claim.source_chunk_id}`)
    }

    return {
      chunkId,
      text: claim.text,
      type: claim.type,
      importance: claim.importance,
      confidence: claim.confidence,
      entities: claim.entities
    }
  })
}

function normalizeStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const nestedValue = record["value"] ?? record["text"] ?? record["content"] ?? record["name"]

    if (nestedValue !== undefined) {
      return normalizeStringValue(nestedValue)
    }
  }

  return ""
}

function normalizeEntities(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeStringValue(item))
      .filter((item) => item.length > 0)
  }

  const normalized = normalizeStringValue(value)

  return normalized.length === 0
    ? []
    : normalized
        .split(/[，,、；;]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
}

function normalizeClaimResponse(rawResponse: unknown): unknown {
  const rawClaims =
    rawResponse !== null &&
    typeof rawResponse === "object" &&
    Array.isArray((rawResponse as Record<string, unknown>)["claims"])
      ? ((rawResponse as Record<string, unknown>)["claims"] as readonly unknown[])
      : []

  return {
    claims: rawClaims.map((claim) => {
      const claimRecord =
        claim !== null && typeof claim === "object" ? (claim as Record<string, unknown>) : {}

      return {
        text: normalizeStringValue(claimRecord["text"]),
        type: claimRecord["type"],
        importance: claimRecord["importance"],
        confidence: claimRecord["confidence"],
        entities: normalizeEntities(claimRecord["entities"]),
        source_chunk_id: normalizeStringValue(claimRecord["source_chunk_id"])
      }
    })
  }
}

export function createOpenAiCompatibleEmbeddingProvider(
  options: OpenAiCompatibleProviderOptions
): EmbeddingProvider {
  const httpClient = createHttpClient(options, embeddingRequestTimeoutMs)

  return {
    async embed(input) {
      const requestPayload = {
        input: input.texts,
        model: input.model
      }
      const startedAt = performance.now()
      logProviderRequest({
        endpoint: "embeddings",
        payload: requestPayload,
        requestTimeoutMs: httpClient.requestTimeoutMs,
        baseUrl: httpClient.baseUrl,
        headers: httpClient.headers
      })

      try {
        const rawResponse = await httpClient.client
          .post("embeddings", {
            json: requestPayload
          })
          .json()
        logProviderResponse({
          endpoint: "embeddings",
          elapsedMs: Math.round(performance.now() - startedAt),
          response: rawResponse
        })
        const response = embeddingResponseSchema.parse(rawResponse)

        const firstVector = response.data[0]?.embedding

        if (firstVector === undefined) {
          throw new Error("Embedding response did not include vectors")
        }

        return {
          vectors: response.data.map((item) => item.embedding),
          model: input.model,
          dimensions: firstVector.length
        }
      } catch (error) {
        logProviderError({
          endpoint: "embeddings",
          elapsedMs: Math.round(performance.now() - startedAt),
          error
        })
        throw error
      }
    }
  }
}

export function createOpenAiCompatibleClaimProvider(
  options: OpenAiCompatibleProviderOptions
): ClaimProvider {
  const httpClient = createHttpClient(options, claimRequestTimeoutMs)

  return {
    async extractClaims(input) {
      const chunkPayload = input.chunks.map((chunk) => ({
        chunk_id: chunk.chunkId,
        content: chunk.text
      }))
      const requestPayload = {
        model: input.model,
        messages: [
          {
            role: "system",
            content: claimExtractionPrompt
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.docId,
              chunks: chunkPayload
            })
          }
        ],
        response_format: {
          type: "json_object"
        }
      } as const
      const startedAt = performance.now()
      logProviderRequest({
        endpoint: "chat/completions",
        payload: requestPayload,
        requestTimeoutMs: httpClient.requestTimeoutMs,
        baseUrl: httpClient.baseUrl,
        headers: httpClient.headers
      })

      try {
        const rawResponse = await httpClient.client
          .post("chat/completions", {
            json: requestPayload
          })
          .json()
        logProviderResponse({
          endpoint: "chat/completions",
          elapsedMs: Math.round(performance.now() - startedAt),
          response: rawResponse
        })
        const chatResponse = chatResponseSchema.parse(rawResponse)

        const messageContent = chatResponse.choices[0]?.message.content

        if (messageContent === undefined) {
          throw new Error("Claim extraction response was empty")
        }

        return mapExtractedClaims(
          messageContent,
          input.chunks.map((chunk) => chunk.chunkId)
        )
      } catch (error) {
        logProviderError({
          endpoint: "chat/completions",
          elapsedMs: Math.round(performance.now() - startedAt),
          error
        })
        throw error
      }
    }
  }
}
