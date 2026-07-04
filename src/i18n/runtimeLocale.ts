import { DEFAULT_SETTINGS, type LanguageMode } from "../shared/types"
import { resolveLocale, type SupportedLocale } from "./locales"
import type { MessageId } from "./messages"
import { translate, type TranslationValues } from "./translate"

let currentRuntimeLocale: SupportedLocale = "zh-CN"

export function getRuntimeLocale(): SupportedLocale {
  return currentRuntimeLocale
}

export function setRuntimeLocale(locale: SupportedLocale): void {
  currentRuntimeLocale = locale
}

export function applyRuntimeLanguageMode(languageMode: LanguageMode, browserLanguage?: string | null): void {
  currentRuntimeLocale = resolveLocale(languageMode, browserLanguage ?? null)
}

export function resetRuntimeLocale(): void {
  currentRuntimeLocale = resolveLocale(DEFAULT_SETTINGS.languageMode, "zh-CN")
}

export function translateRuntime(messageId: MessageId, values?: TranslationValues): string {
  return translate(currentRuntimeLocale, messageId, values)
}
