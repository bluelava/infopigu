const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function hashContentParts(parts: readonly string[]): Promise<string> {
  const content = parts.join("\n::\n")
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(content))
  return toHex(digest)
}
