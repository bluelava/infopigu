const trackingParamPrefixes = ["utm_"] as const
const trackingParams = new Set(["fbclid", "gclid"])
const weiboPageStateParams = new Set(["from", "pagetype", "refer_flag", "type", "wvr"])
const hostnamesWithWwwAliases = new Set(["weibo.com", "x.com", "twitter.com"])

function shouldDropAllQueryParams(url: URL): boolean {
  const normalizedHostname = normalizeCanonicalHostname(url.hostname)

  return normalizedHostname === "x.com" || normalizedHostname === "twitter.com"
}

function shouldStripParam(paramName: string): boolean {
  return (
    trackingParams.has(paramName) ||
    weiboPageStateParams.has(paramName) ||
    trackingParamPrefixes.some((prefix) => paramName.startsWith(prefix))
  )
}

function trimTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
}

function normalizeWeiboDetailPathname(pathname: string): string {
  const segments = pathname.split("/")
  const lastSegmentIndex = segments.length - 1
  const lastSegment = segments[lastSegmentIndex] ?? ""
  const trimmedLastSegment = lastSegment.match(/^[A-Za-z0-9]+/u)?.[0]

  if (trimmedLastSegment === undefined || trimmedLastSegment.length === lastSegment.length) {
    return pathname
  }

  segments[lastSegmentIndex] = trimmedLastSegment
  return segments.join("/")
}

function normalizeCanonicalHostname(hostname: string): string {
  const withoutWww = hostname.replace(/^www\./u, "")

  if (hostnamesWithWwwAliases.has(withoutWww)) {
    return withoutWww
  }

  return hostname
}

function createHostnameAliases(hostname: string): readonly string[] {
  const normalizedHostname = normalizeCanonicalHostname(hostname)

  if (!hostnamesWithWwwAliases.has(normalizedHostname)) {
    return [hostname]
  }

  return hostname.startsWith("www.")
    ? [hostname, normalizedHostname]
    : [hostname, `www.${normalizedHostname}`]
}

export function canonicalizeUrl(input: string): string {
  const url = new URL(input)
  url.hash = ""
  url.hostname = normalizeCanonicalHostname(url.hostname)
  url.pathname = trimTrailingSlash(url.pathname)

  if (url.hostname === "weibo.com") {
    url.pathname = normalizeWeiboDetailPathname(url.pathname)
  }

  const filteredEntries = shouldDropAllQueryParams(url)
    ? []
    : [...url.searchParams.entries()].filter(([key]) => !shouldStripParam(key))
  url.search = ""

  for (const [key, value] of filteredEntries) {
    url.searchParams.append(key, value)
  }

  return url.toString()
}

export function createCanonicalUrlLookupVariants(input: string): readonly string[] {
  const canonicalUrl = new URL(canonicalizeUrl(input))

  return createHostnameAliases(canonicalUrl.hostname).map((hostname) => {
    const variant = new URL(canonicalUrl.toString())
    variant.hostname = hostname
    return variant.toString()
  })
}

export function extractDomainFromUrl(input: string): string {
  return normalizeCanonicalHostname(new URL(input).hostname)
}

export function domainMatchesWhitelist(
  hostname: string,
  whitelistDomains: readonly string[]
): boolean {
  return resolveWhitelistDomain(hostname, whitelistDomains) !== null
}

export function resolveWhitelistDomain(
  hostname: string,
  whitelistDomains: readonly string[]
): string | null {
  const matches = whitelistDomains.filter(
    (whitelistedDomain) =>
      hostname === whitelistedDomain || hostname.endsWith(`.${whitelistedDomain}`)
  )

  if (matches.length === 0) {
    return null
  }

  return [...matches].sort((left, right) => right.length - left.length)[0] ?? null
}
