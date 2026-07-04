import type { LanguageMode } from "../shared/types"

export const languageOptions: readonly {
  readonly labelId: "language.auto" | "language.zh-CN" | "language.zh-TW" | "language.en"
  readonly value: LanguageMode
}[] = [
  { labelId: "language.auto", value: "auto" },
  { labelId: "language.zh-CN", value: "zh-CN" },
  { labelId: "language.zh-TW", value: "zh-TW" },
  { labelId: "language.en", value: "en" }
] as const
