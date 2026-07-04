import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"

export function PrivacyNotice(): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("options.privacy.eyebrow")}</p>
      <h2 className="title">{t("options.privacy.title")}</h2>
      <p className="body-copy">{t("options.privacy.whitelist")}</p>
      <p className="body-copy">{t("options.privacy.cloud")}</p>
      <p className="body-copy">{t("options.privacy.capacity")}</p>
    </section>
  )
}
