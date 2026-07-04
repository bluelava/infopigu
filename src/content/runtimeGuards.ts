const IGNORABLE_EXTENSION_CONTEXT_ERROR_PATTERNS = [
  "Extension context invalidated",
  "Receiving end does not exist",
  "The message port closed before a response was received"
] as const

export function isIgnorableExtensionContextError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error)

  return IGNORABLE_EXTENSION_CONTEXT_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}
