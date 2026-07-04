import type { JSX } from "react"
import { useState } from "react"

import { useI18n } from "../i18n/I18nContext"

interface WhitelistSettingsProps {
  readonly domains: readonly string[]
  readonly onAddDomain: (domain: string) => Promise<void>
  readonly onRemoveDomain: (domain: string) => Promise<void>
}

export function WhitelistSettings(props: WhitelistSettingsProps): JSX.Element {
  const { t } = useI18n()
  const [nextDomain, setNextDomain] = useState("")

  return (
    <section className="card">
      <p className="eyebrow">{t("options.whitelist.eyebrow")}</p>
      <h2 className="title">{t("options.whitelist.title")}</h2>
      <p className="body-copy">{t("options.whitelist.description")}</p>
      <div className="stack">
        <div className="row">
          <input
            className="text-input"
            onChange={(event) => {
              const nextValue = event.currentTarget.value
              setNextDomain(nextValue)
            }}
            placeholder="example.com"
            type="text"
            value={nextDomain}
          />
          <button
            className="primary-button"
            onClick={() => {
              const trimmedDomain = nextDomain.trim()

              if (trimmedDomain.length === 0) {
                return
              }

              void props.onAddDomain(trimmedDomain).then(() => {
                setNextDomain("")
              })
            }}
            type="button"
          >
            {t("options.whitelist.add")}
          </button>
        </div>
        <ul className="list">
          {props.domains.map((domain) => (
            <li className="list-row" key={domain}>
              <span>{domain}</span>
              <button
                className="secondary-button"
                onClick={() => {
                  void props.onRemoveDomain(domain)
                }}
                type="button"
              >
                {t("options.whitelist.remove")}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
