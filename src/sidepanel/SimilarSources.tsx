import type { JSX } from "react"
import { useI18n } from "../i18n/I18nContext"
import type { SimilarSourceSummary } from "../shared/types"
import { resolveVizKdbPlatformChipClassName } from "../vizkdb/platformColors"
import { ScoreChip } from "./ScoreChip"

interface SimilarSourcesProps {
  readonly items: readonly SimilarSourceSummary[]
}

function formatSimilarity(similarity: number): string {
  return `${Math.round(similarity * 100)}%`
}

function getDomainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function SimilarSources(props: SimilarSourcesProps): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("sidepanel.similarSources.title")}</p>
      <ul className="list">
        {props.items.length === 0 ? (
          <li className="body-copy">{t("sidepanel.similarSources.empty")}</li>
        ) : null}
        {props.items.map((item) => (
          <li className="list-row similar-source-row" key={`${item.url}:${item.snippet}`}>
            <p className="body-copy">{item.snippet}</p>
            <div className="similar-source-meta">
              <ScoreChip
                className="similar-source-score"
                label={t("sidepanel.similarSources.similarity", {
                  score: formatSimilarity(item.similarity)
                })}
                value={formatSimilarity(item.similarity)}
              />
              {item.url.length > 0 && getDomainFromUrl(item.url) !== null ? (
                <span className={`${resolveVizKdbPlatformChipClassName(getDomainFromUrl(item.url) ?? "")} similar-source-domain-tag`}>
                  <span className="viz-kdb-stat-chip-domain">{getDomainFromUrl(item.url)}</span>
                </span>
              ) : null}
              {item.url.length > 0 ? (
                <a className="similar-source-link" href={item.url} rel="noreferrer" target="_blank">
                  {item.url}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
