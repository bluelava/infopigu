import { debugLog, serializeDebugError } from "../shared/debug"

const maxPreviewLength = 600

function truncateText(value: string): string {
  return value.length <= maxPreviewLength ? value : `${value.slice(0, maxPreviewLength)}...`
}

function redactAuthorizationHeader(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    Authorization: "Bearer ***"
  }
}

export function logProviderRequest(input: {
  readonly endpoint: "chat/completions" | "embeddings"
  readonly payload: unknown
  readonly requestTimeoutMs: number
  readonly baseUrl: string
  readonly headers: Record<string, string>
}): void {
  debugLog("background", "provider request", {
    endpoint: input.endpoint,
    requestTimeoutMs: input.requestTimeoutMs,
    baseUrl: input.baseUrl,
    headers: redactAuthorizationHeader(input.headers),
    payloadPreview: truncateText(JSON.stringify(input.payload))
  })
}

export function logProviderResponse(input: {
  readonly endpoint: "chat/completions" | "embeddings"
  readonly elapsedMs: number
  readonly response: unknown
}): void {
  debugLog("background", "provider response", {
    endpoint: input.endpoint,
    elapsedMs: input.elapsedMs,
    responsePreview: truncateText(JSON.stringify(input.response))
  })
}

export function logProviderError(input: {
  readonly endpoint: "chat/completions" | "embeddings"
  readonly elapsedMs: number
  readonly error: unknown
}): void {
  debugLog("background", "provider error", {
    endpoint: input.endpoint,
    elapsedMs: input.elapsedMs,
    error: serializeDebugError(input.error)
  })
}
