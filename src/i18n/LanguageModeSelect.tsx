import type { ChangeEvent, JSX } from "react"

import type { LanguageMode } from "../shared/types"
import { useI18n } from "./I18nContext"
import { ChevronDownIcon, LanguageIcon } from "./LanguageIcons"
import { languageOptions } from "./languageOptions"

interface LanguageModeSelectProps {
  readonly ariaLabel?: string
  readonly className?: string
  readonly languageMode: LanguageMode
  readonly onChange: (nextLanguageMode: LanguageMode) => Promise<void> | void
}

export function LanguageModeSelect(props: LanguageModeSelectProps): JSX.Element {
  const { t } = useI18n()
  const className = props.className === undefined ? "language-select" : `language-select ${props.className}`

  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    void props.onChange(event.currentTarget.value as LanguageMode)
  }

  return (
    <label className={className}>
      <span className="language-select-icon">
        <LanguageIcon />
      </span>
      <select
        aria-label={props.ariaLabel ?? t("language.legend")}
        className="language-select-control"
        onChange={handleChange}
        value={props.languageMode}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelId)}
          </option>
        ))}
      </select>
      <span className="language-select-caret-wrap">
        <ChevronDownIcon />
      </span>
    </label>
  )
}
