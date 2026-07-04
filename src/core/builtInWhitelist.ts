export const BUILT_IN_WHITELIST_DOMAINS = [
  "weibo.com",
  "x.com",
  "mp.weixin.qq.com",
  "github.com",
  "arxiv.org"
] as const

const BUILT_IN_WHITELIST_DOMAIN_SET = new Set<string>(BUILT_IN_WHITELIST_DOMAINS)

export function resolveAutoManagedWhitelistDomains(
  currentDomains: readonly string[]
): readonly string[] {
  const normalizedDomains = [
    ...new Set(currentDomains.map((domain) => domain.trim()).filter((domain) => domain.length > 0))
  ]

  if (normalizedDomains.length === 0) {
    return [...BUILT_IN_WHITELIST_DOMAINS]
  }

  const hasOnlyBuiltInDomains = normalizedDomains.every((domain) =>
    BUILT_IN_WHITELIST_DOMAIN_SET.has(domain)
  )

  if (!hasOnlyBuiltInDomains) {
    return normalizedDomains
  }

  const mergedDomains = [...normalizedDomains]

  for (const domain of BUILT_IN_WHITELIST_DOMAINS) {
    if (!mergedDomains.includes(domain)) {
      mergedDomains.push(domain)
    }
  }

  return mergedDomains
}
