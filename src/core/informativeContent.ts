import type { ExtractedClaim } from "../ai/types"
import type { ExtractedDocument } from "../shared/types"

const MIN_DOCUMENT_MEANINGFUL_CHARACTERS = 24
const MIN_SHORT_FORM_SOCIAL_DOCUMENT_MEANINGFUL_CHARACTERS = 10
const MIN_CLAIM_MEANINGFUL_CHARACTERS = 6
const SHORT_FORM_SOCIAL_EXTRACTORS = new Set(["feed-item", "weibo-article", "x-article"])

function stripWhitespaceAndPunctuation(text: string): string {
  return text.replace(/[\p{P}\p{S}\s]/gu, "")
}

export function getMeaningfulCharacterCount(text: string): number {
  return stripWhitespaceAndPunctuation(text).length
}

export function isInsufficientCompactText(text: string): boolean {
  return getMeaningfulCharacterCount(text) < MIN_DOCUMENT_MEANINGFUL_CHARACTERS
}

export function isInsufficientDocument(document: ExtractedDocument): boolean {
  const bodyText = document.blocks
    .filter((block) => block.type !== "heading")
    .map((block) => block.text)
    .join("\n")

  const minimumMeaningfulCharacters = SHORT_FORM_SOCIAL_EXTRACTORS.has(document.extractor)
    ? MIN_SHORT_FORM_SOCIAL_DOCUMENT_MEANINGFUL_CHARACTERS
    : MIN_DOCUMENT_MEANINGFUL_CHARACTERS

  return getMeaningfulCharacterCount(bodyText) < minimumMeaningfulCharacters
}

export function isInformativeClaimText(text: string): boolean {
  const normalized = text.trim()

  if (normalized.length === 0) {
    return false
  }

  const meaningfulLength = getMeaningfulCharacterCount(normalized)

  if (meaningfulLength < MIN_CLAIM_MEANINGFUL_CHARACTERS) {
    return false
  }

  if (/^[\p{L}\p{N}]+$/u.test(stripWhitespaceAndPunctuation(normalized)) && meaningfulLength < 8) {
    return false
  }

  return true
}

export function filterInformativeClaims(
  claims: readonly ExtractedClaim[]
): readonly ExtractedClaim[] {
  return claims.filter((claim) => isInformativeClaimText(claim.text))
}
