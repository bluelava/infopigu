import type { LanguageMode } from "../shared/types"

export type SupportedLocale = "zh-CN" | "zh-TW" | "en"

export function detectLocale(input: string | null | undefined): SupportedLocale {
  const value = input?.toLowerCase() ?? ""

  if (
    value.startsWith("zh-tw") ||
    value.startsWith("zh-hk") ||
    value.startsWith("zh-mo") ||
    value.includes("hant")
  ) {
    return "zh-TW"
  }

  if (value.startsWith("zh")) {
    return "zh-CN"
  }

  return "en"
}

export function resolveLocale(
  languageMode: LanguageMode,
  browserLanguage: string | null | undefined
): SupportedLocale {
  return languageMode === "auto" ? detectLocale(browserLanguage) : languageMode
}
