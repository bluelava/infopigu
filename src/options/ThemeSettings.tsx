import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { Settings } from "../shared/types"

interface ThemeSettingsProps {
  readonly onChange: (nextSettings: Settings) => Promise<void> | void
  readonly settings: Settings
}

export function ThemeSettings(props: ThemeSettingsProps): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("theme.eyebrow")}</p>
      <h2 className="title">{t("theme.title")}</h2>
      <fieldset className="stack">
        <legend className="body-copy">{t("theme.legend")}</legend>
        <label className="row">
          <input
            checked={props.settings.themeMode === "light"}
            name="theme-mode"
            onChange={() => {
              void props.onChange({
                ...props.settings,
                themeMode: "light"
              })
            }}
            type="radio"
            value="light"
          />
          <span className="body-copy">{t("theme.light")}</span>
        </label>
        <label className="row">
          <input
            checked={props.settings.themeMode === "dark"}
            name="theme-mode"
            onChange={() => {
              void props.onChange({
                ...props.settings,
                themeMode: "dark"
              })
            }}
            type="radio"
            value="dark"
          />
          <span className="body-copy">{t("theme.dark")}</span>
        </label>
        <label className="row">
          <input
            checked={props.settings.themeMode === "auto"}
            name="theme-mode"
            onChange={() => {
              void props.onChange({
                ...props.settings,
                themeMode: "auto"
              })
            }}
            type="radio"
            value="auto"
          />
          <span className="body-copy">{t("theme.auto")}</span>
        </label>
      </fieldset>
    </section>
  )
}
