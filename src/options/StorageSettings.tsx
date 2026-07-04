import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"

interface StorageSettingsProps {
  readonly onClearLibrary: () => Promise<void>
  readonly onExport: () => Promise<void>
  readonly onReset: () => Promise<void>
  readonly onRebuild: () => Promise<void>
  readonly savedDocuments: number
}

export function StorageSettings(props: StorageSettingsProps): JSX.Element {
  const { t } = useI18n()
  const remainingDocuments = Math.max(1000 - props.savedDocuments, 0)

  return (
    <section className="card">
      <p className="eyebrow">{t("options.storage.eyebrow")}</p>
      <h2 className="title">{t("options.storage.title")}</h2>
      <p className="body-copy">
        {t("options.storage.saved", { count: props.savedDocuments })}
        <br />
        {t("options.storage.remaining", { count: remainingDocuments })}
      </p>
      <div className="row">
        <button className="secondary-button" onClick={() => void props.onExport()} type="button">
          {t("options.storage.export")}
        </button>
        <button className="secondary-button" onClick={() => void props.onRebuild()} type="button">
          {t("options.storage.rebuild")}
        </button>
        <button className="danger-button" onClick={() => void props.onClearLibrary()} type="button">
          {t("options.storage.clearLibrary")}
        </button>
        <button className="danger-button" onClick={() => void props.onReset()} type="button">
          {t("options.storage.reset")}
        </button>
      </div>
    </section>
  )
}
