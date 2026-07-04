import type { JSX } from "react"
import { useI18n } from "../i18n/I18nContext"

interface DuplicateClaimsProps {
  readonly claims: readonly string[]
}

export function DuplicateClaims(props: DuplicateClaimsProps): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("sidepanel.duplicateClaims.title")}</p>
      <ul className="list">
        {props.claims.length === 0 ? (
          <li className="body-copy">{t("sidepanel.duplicateClaims.empty")}</li>
        ) : null}
        {props.claims.map((claim) => (
          <li className="list-row" key={claim}>
            <span>{claim}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
