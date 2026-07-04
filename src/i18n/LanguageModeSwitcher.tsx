import type { JSX } from "react"

import type { LanguageMode } from "../shared/types"
import { useI18n } from "./I18nContext"
import { LanguageIcon } from "./LanguageIcons"
import { languageOptions } from "./languageOptions"

interface LanguageModeSwitcherProps {
  readonly ariaLabel?: string
  readonly className?: string
  readonly languageMode: LanguageMode
  readonly onChange: (nextLanguageMode: LanguageMode) => Promise<void> | void
}

export function LanguageModeSwitcher(props: LanguageModeSwitcherProps): JSX.Element {
  const { t } = useI18n()
  const className = props.className === undefined ? "language-switcher" : `language-switcher ${props.className}`

  return (
    <div aria-label={props.ariaLabel ?? t("language.legend")} className={className} role="group">
      <span className="language-switcher-icon-wrap">
        <LanguageIcon />
      </span>
      {languageOptions.map((option) => {
        const isActive = props.languageMode === option.value

        return (
          <button
            aria-pressed={isActive}
            className={`language-switcher-button${isActive ? " language-switcher-button-active" : ""}`}
            key={option.value}
            onClick={() => {
              if (isActive) {
                return
              }

              void props.onChange(option.value)
            }}
            type="button"
          >
            {t(option.labelId)}
          </button>
        )
      })}
    </div>
  )
}
