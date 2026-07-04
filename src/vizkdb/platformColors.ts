const WEIBO_PLATFORM_COLOR = "#b53030"
const X_PLATFORM_COLOR = "#111111"
const WECHAT_PLATFORM_COLOR = "#2f7d56"
const DEFAULT_PLATFORM_COLOR = "#6843aa"

export function resolveVizKdbPlatformColor(domain: string): string {
  const normalizedDomain = domain.trim().toLowerCase()

  if (normalizedDomain === "weibo.com" || normalizedDomain.endsWith(".weibo.com")) {
    return WEIBO_PLATFORM_COLOR
  }

  if (normalizedDomain === "x.com" || normalizedDomain.endsWith(".x.com")) {
    return X_PLATFORM_COLOR
  }

  if (normalizedDomain === "mp.weixin.qq.com") {
    return WECHAT_PLATFORM_COLOR
  }

  return DEFAULT_PLATFORM_COLOR
}

export function resolveVizKdbPlatformChipClassName(domain: string): string {
  const normalizedDomain = domain.trim().toLowerCase()

  if (normalizedDomain === "weibo.com" || normalizedDomain.endsWith(".weibo.com")) {
    return "viz-kdb-stat-chip viz-kdb-stat-chip-weibo"
  }

  if (normalizedDomain === "x.com" || normalizedDomain.endsWith(".x.com")) {
    return "viz-kdb-stat-chip viz-kdb-stat-chip-x"
  }

  if (normalizedDomain === "mp.weixin.qq.com") {
    return "viz-kdb-stat-chip viz-kdb-stat-chip-wechat"
  }

  return "viz-kdb-stat-chip viz-kdb-stat-chip-default"
}
