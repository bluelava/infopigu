import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { VizKdbNode } from "./useVizKdbData"

interface VizKdbDetailDrawerProps {
  readonly node: VizKdbNode | null
  readonly onSelectRelated: (docId: VizKdbNode["docId"]) => void
  readonly relatedNodesById: ReadonlyMap<VizKdbNode["docId"], VizKdbNode>
}

function formatTimestamp(timestamp: number): string {
  return timestamp > 0 ? new Date(timestamp).toLocaleString() : "-"
}

export function VizKdbDetailDrawer(props: VizKdbDetailDrawerProps): JSX.Element {
  const { t } = useI18n()

  return (
    <aside className="viz-kdb-drawer card">
      {props.node === null ? (
        <>
          <p className="eyebrow">Viz-KDB</p>
          <h2 className="about-card-title">{t("vizkdb.drawer.placeholderTitle")}</h2>
          <p className="body-copy">{t("vizkdb.drawer.placeholderBody")}</p>
        </>
      ) : (
        <>
          <p className="eyebrow">{t("vizkdb.drawer.title")}</p>
          <h2 className="about-card-title">{props.node.title}</h2>
          <div className="viz-kdb-drawer-meta">
            <span>{t("vizkdb.drawer.domain")}: {props.node.domain}</span>
            <span>{t("vizkdb.drawer.category")}: {t(`vizkdb.category.${props.node.categoryId}`)}</span>
            <span>{t("vizkdb.drawer.duplicateScore")}: {Math.round(props.node.duplicateScore * 100)}%</span>
            <span>{t("vizkdb.drawer.noveltyScore")}: {Math.round(props.node.noveltyScore * 100)}%</span>
            <span>{t("vizkdb.drawer.readAt")}: {formatTimestamp(props.node.readAt)}</span>
            <span>{t("vizkdb.drawer.savedAt")}: {formatTimestamp(props.node.savedAt)}</span>
          </div>
          <a className="toolbar-button viz-kdb-open-link" href={props.node.url} rel="noreferrer" target="_blank">
            {t("vizkdb.drawer.openOriginal")}
          </a>
          <div className="viz-kdb-drawer-section">
            <strong>{t("vizkdb.drawer.url")}</strong>
            <p className="body-copy">{props.node.url}</p>
          </div>
          {props.node.canonicalUrl !== props.node.url ? (
            <div className="viz-kdb-drawer-section">
              <strong>{t("vizkdb.drawer.canonicalUrl")}</strong>
              <p className="body-copy">{props.node.canonicalUrl}</p>
            </div>
          ) : null}
          <div className="viz-kdb-drawer-section">
            <strong>{t("vizkdb.drawer.related")}</strong>
            <div className="viz-kdb-related-list">
              {props.node.neighbors.length === 0 ? (
                <p className="body-copy">{t("vizkdb.drawer.noRelated")}</p>
              ) : (
                props.node.neighbors.map((neighbor) => {
                  const relatedNode = props.relatedNodesById.get(neighbor.docId)

                  if (relatedNode === undefined) {
                    return null
                  }

                  return (
                    <button
                      className="viz-kdb-related-item"
                      key={neighbor.docId}
                      onClick={() => {
                        props.onSelectRelated(neighbor.docId)
                      }}
                      type="button"
                    >
                      <span>{relatedNode.title}</span>
                      <span>{Math.round(neighbor.similarity * 100)}%</span>
                      <span>
                        {neighbor.relativeGain === null ? "-" : `${Math.round(neighbor.relativeGain * 100)}%`}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          <div className="viz-kdb-drawer-section">
            <strong>{t("vizkdb.drawer.claims")}</strong>
            <ul className="list">
              {props.node.claims.length === 0 ? (
                <li className="body-copy">{t("vizkdb.drawer.noClaims")}</li>
              ) : (
                props.node.claims.map((claim) => (
                  <li className="list-row" key={claim}>
                    <p className="body-copy">{claim}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </aside>
  )
}
