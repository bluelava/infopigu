import { messages, type MessageId } from "./messages"
import type { SupportedLocale } from "./locales"

export type TranslationValues = Readonly<Record<string, number | string>>
const supportedLocales = new Set<SupportedLocale>(["en", "zh-CN", "zh-TW"])

function applyValues(message: string, values?: TranslationValues): string {
  if (values === undefined) {
    return message
  }

  return message.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key]

    return value === undefined ? match : String(value)
  })
}

export function translate(
  locale: SupportedLocale | null | string | undefined,
  messageId: MessageId,
  values?: TranslationValues
): string {
  const safeLocale: SupportedLocale = supportedLocales.has(locale as SupportedLocale)
    ? (locale as SupportedLocale)
    : "en"
  const template = messages[safeLocale][messageId] ?? messages.en[messageId] ?? messageId

  return applyValues(template, values)
}
