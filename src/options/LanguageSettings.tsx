import type { JSX } from "react"

import { LanguageModeSelect } from "../i18n/LanguageModeSelect"
import { useI18n } from "../i18n/I18nContext"
import type { Settings } from "../shared/types"

interface LanguageSettingsProps {
  readonly onChange: (nextSettings: Settings) => Promise<void> | void
  readonly settings: Settings
}

export function LanguageSettings(props: LanguageSettingsProps): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("language.eyebrow")}</p>
      <h2 className="title">{t("language.title")}</h2>
      <p className="body-copy">{t("language.legend")}</p>
      <LanguageModeSelect
        ariaLabel={t("language.legend")}
        languageMode={props.settings.languageMode}
        onChange={async (nextLanguageMode) => {
          await props.onChange({
            ...props.settings,
            languageMode: nextLanguageMode
          })
        }}
      />
    </section>
  )
}
