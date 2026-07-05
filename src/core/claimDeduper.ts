import type { ClaimRecord } from "../shared/types"
import type { ExtractedClaim } from "../ai/types"

function normalizeClaimText(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLocaleLowerCase()
}

function shouldReplaceExtractedClaim(current: ExtractedClaim, candidate: ExtractedClaim): boolean {
  if (candidate.importance !== current.importance) {
    return candidate.importance > current.importance
  }

  return candidate.confidence > current.confidence
}

function shouldReplaceClaimRecord(current: ClaimRecord, candidate: ClaimRecord): boolean {
  if (candidate.importance !== current.importance) {
    return candidate.importance > current.importance
  }

  return candidate.confidence > current.confidence
}

export function dedupeExtractedClaims(claims: readonly ExtractedClaim[]): readonly ExtractedClaim[] {
  const bestByText = new Map<string, ExtractedClaim>()
  const order: string[] = []

  for (const claim of claims) {
    const key = normalizeClaimText(claim.text)

    if (key.length === 0) {
      continue
    }

    const existing = bestByText.get(key)

    if (existing === undefined) {
      bestByText.set(key, claim)
      order.push(key)
      continue
    }

    if (shouldReplaceExtractedClaim(existing, claim)) {
      bestByText.set(key, claim)
    }
  }

  return order.map((key) => bestByText.get(key)).filter((claim): claim is ExtractedClaim => claim !== undefined)
}

export function dedupeClaimRecords(claims: readonly ClaimRecord[]): readonly ClaimRecord[] {
  const bestByText = new Map<string, ClaimRecord>()
  const order: string[] = []

  for (const claim of claims) {
    const key = normalizeClaimText(claim.text)

    if (key.length === 0) {
      continue
    }

    const existing = bestByText.get(key)

    if (existing === undefined) {
      bestByText.set(key, claim)
      order.push(key)
      continue
    }

    if (shouldReplaceClaimRecord(existing, claim)) {
      bestByText.set(key, claim)
    }
  }

  return order.map((key) => bestByText.get(key)).filter((claim): claim is ClaimRecord => claim !== undefined)
}
