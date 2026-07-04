import type { CSSProperties, JSX } from "react"
import { useEffect, useMemo, useState } from "react"
import browser from "webextension-polyfill"

import { resolveWhitelistDomain } from "../core/url"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createSettingsRepository } from "../db/settingsRepo"
import { LanguageModeSelect } from "../i18n/LanguageModeSelect"
import { useI18n } from "../i18n/I18nContext"
import { DEFAULT_SETTINGS, type DocumentId, type Settings, type ThemeMode } from "../shared/types"
import { applyDocumentTheme } from "../theme/themeMode"
import { VizKdbDetailDrawer } from "./VizKdbDetailDrawer"
import { VizKdbGraphView } from "./VizKdbGraphView"
import { resolveVizKdbPlatformChipClassName } from "./platformColors"
import { VizKdbTimelineView } from "./VizKdbTimelineView"
import { useVizKdbData } from "./useVizKdbData"

const database = createCognitiveDeltaDb()
const settingsRepository = createSettingsRepository(database)
const vizKdbSidebarStyle: CSSProperties = {
  alignSelf: "start"
}
const vizKdbSidebarTabListStyle = {
  "--viz-kdb-side-tab-height": "128px"
} as CSSProperties

function sanitizeThemeMode(themeMode: unknown): ThemeMode {
  return themeMode === "light" || themeMode === "dark" || themeMode === "auto"
    ? themeMode
    : DEFAULT_SETTINGS.themeMode
}

function summarizeDomains(
  nodes: readonly { readonly domain: string }[],
  whitelistDomains: readonly string[]
) {
  const counts = new Map<string, number>()

  for (const node of nodes) {
    const whitelistedDomain = resolveWhitelistDomain(node.domain, whitelistDomains)

    if (whitelistedDomain === null) {
      continue
    }

    counts.set(whitelistedDomain, (counts.get(whitelistedDomain) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((left, right) => right.count - left.count || left.domain.localeCompare(right.domain))
}

export function VizKdbPage(): JSX.Element {
  const { locale, t } = useI18n()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [activeTab, setActiveTab] = useState<"graph" | "timeline">("graph")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDocId, setSelectedDocId] = useState<DocumentId | null>(null)
  const state = useVizKdbData()

  useEffect(() => {
    let cancelled = false

    void browser.storage.local.get("operationalSettings").then((result) => {
      if (!cancelled) {
        const nextSettings = (result["operationalSettings"] as Partial<Settings> | undefined) ?? {}
        setSettings((currentSettings) => ({
          ...currentSettings,
          ...nextSettings,
          themeMode: sanitizeThemeMode(nextSettings.themeMode)
        }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyDocumentTheme(settings.themeMode)
    document.title = t("vizkdb.title")
    document.documentElement.lang = locale
  }, [locale, settings.themeMode, t])

  async function saveOperationalSettings(nextSettings: Settings): Promise<void> {
    await settingsRepository.saveSettings(nextSettings)
    await browser.storage.local.set({ operationalSettings: nextSettings })
    setSettings(nextSettings)
  }

  const filteredModel = useMemo(() => {
    if (state.kind !== "ready") {
      return null
    }

    const normalizedSearch = searchTerm.trim().toLowerCase()
    const nodes =
      normalizedSearch.length === 0
        ? state.model.nodes
        : state.model.nodes.filter((node) => {
            const haystack = `${node.title}\n${node.url}\n${node.claims.join("\n")}`.toLowerCase()
            return haystack.includes(normalizedSearch)
          })
    const nodeIds = new Set(nodes.map((node) => node.docId))
    const edges = state.model.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
    )
    const categories = state.model.categories.map((category) => ({
      ...category,
      count: nodes.filter((node) => node.categoryId === category.id).length
    }))
    const domains = summarizeDomains(nodes, state.model.whitelistDomains)

    return {
      ...state.model,
      categories,
      domains,
      edges,
      nodes
    }
  }, [searchTerm, state])
  const summaryModel =
    state.kind === "ready"
      ? filteredModel ?? {
          ...state.model,
          domains: summarizeDomains(state.model.nodes, state.model.whitelistDomains)
        }
      : null

  const selectedNode =
    filteredModel?.nodes.find((node) => node.docId === selectedDocId) ??
    (selectedDocId === null ? null : state.kind === "ready" ? state.model.nodes.find((node) => node.docId === selectedDocId) ?? null : null)
  const relatedNodesById = new Map((state.kind === "ready" ? state.model.nodes : []).map((node) => [node.docId, node] as const))

  return (
    <main className="shell layout viz-kdb-shell">
      <section className="card hero">
        <div className="hero-topbar">
          <div>
            <p className="eyebrow">Viz-KDB</p>
            <h1 className="title">{t("vizkdb.title")}</h1>
          </div>
          <div className="hero-actions">
            <button
              className="toolbar-button"
              onClick={() => {
                void browser.runtime.openOptionsPage()
              }}
              type="button"
            >
              {t("navigation.options")}
            </button>
            <button
              className="toolbar-button"
              onClick={() => {
                void browser.tabs.create({ url: browser.runtime.getURL("about.html") })
              }}
              type="button"
            >
              {t("navigation.about")}
            </button>
            <LanguageModeSelect
              ariaLabel={t("language.legend")}
              className="about-language-select"
              languageMode={settings.languageMode}
              onChange={async (nextLanguageMode) => {
                await saveOperationalSettings({
                  ...settings,
                  languageMode: nextLanguageMode
                })
              }}
            />
          </div>
        </div>
        <p className="body-copy">{t("vizkdb.subtitle")}</p>
        <div className="viz-kdb-toolbar-row">
          <input
            className="text-input viz-kdb-search"
            onChange={(event) => {
              setSearchTerm(event.currentTarget.value)
            }}
            placeholder={t("vizkdb.searchPlaceholder")}
            type="search"
            value={searchTerm}
          />
        </div>
        {summaryModel !== null ? (
          <div className="viz-kdb-summary-row">
            <div className="viz-kdb-stat" data-tooltip={t("vizkdb.summary.documents", { count: summaryModel.nodes.length })}>
              <span className="viz-kdb-stat-label">{t("vizkdb.metric.documents")}</span>
              <strong className="viz-kdb-stat-value">{summaryModel.nodes.length}</strong>
            </div>
            <div
              className="viz-kdb-stat"
              data-tooltip={t("vizkdb.summary.categories", {
                count: summaryModel.categories.filter((item) => item.count > 0).length
              })}
            >
              <span className="viz-kdb-stat-label">{t("vizkdb.metric.categories")}</span>
              <strong className="viz-kdb-stat-value">
                {summaryModel.categories.filter((item) => item.count > 0).length}
              </strong>
            </div>
            <div
              className="viz-kdb-stat"
              data-tooltip={t("vizkdb.summary.namespace", { namespace: summaryModel.namespaceLabel })}
            >
              <span className="viz-kdb-stat-label">{t("vizkdb.metric.namespace")}</span>
              <strong className="viz-kdb-stat-value viz-kdb-stat-value-namespace">
                {summaryModel.namespace === null ? t("vizkdb.summary.unavailable") : summaryModel.namespaceLabel}
              </strong>
            </div>
            <div
              className="viz-kdb-stat"
              data-tooltip={t("vizkdb.summary.domains", { count: summaryModel.domains.length })}
            >
              <span className="viz-kdb-stat-label">{t("vizkdb.metric.domains")}</span>
              <strong className="viz-kdb-stat-value">{summaryModel.domains.length}</strong>
              <span className="viz-kdb-stat-detail">
                {summaryModel.domains.slice(0, 3).map((item) => (
                  <span className={resolveVizKdbPlatformChipClassName(item.domain)} key={item.domain}>
                    <span className="viz-kdb-stat-chip-domain">{item.domain}</span>
                    <span className="viz-kdb-stat-chip-count">{item.count}</span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {state.kind === "loading" ? (
        <section className="card">
          <p className="body-copy">{t("vizkdb.loading")}</p>
        </section>
      ) : null}

      {state.kind === "empty" ? (
        <section className="card">
          <h2 className="about-card-title">{t("vizkdb.empty.title")}</h2>
          <p className="body-copy">{t("vizkdb.empty.body")}</p>
        </section>
      ) : null}

      {state.kind === "error" ? (
        <section className="card">
          <h2 className="about-card-title">{t("vizkdb.error.title")}</h2>
          <p className="body-copy">{state.message}</p>
        </section>
      ) : null}

      {filteredModel !== null ? (
        <section className="viz-kdb-layout">
          <div className="viz-kdb-stage">
            <aside className="card viz-kdb-sidebar" style={vizKdbSidebarStyle}>
              <div className="viz-kdb-sidebar-tabs" role="tablist" style={vizKdbSidebarTabListStyle}>
                <button
                  className={activeTab === "graph" ? "viz-kdb-side-tab viz-kdb-side-tab-active" : "viz-kdb-side-tab"}
                  onClick={() => {
                    setActiveTab("graph")
                  }}
                  type="button"
                >
                  <span className="viz-kdb-side-tab-title">{t("vizkdb.tab.graph")}</span>
                  <span className="viz-kdb-side-tab-subtitle">{t("vizkdb.tab.graphSubtitle")}</span>
                </button>
                <button
                  className={
                    activeTab === "timeline" ? "viz-kdb-side-tab viz-kdb-side-tab-active" : "viz-kdb-side-tab"
                  }
                  onClick={() => {
                    setActiveTab("timeline")
                  }}
                  type="button"
                >
                  <span className="viz-kdb-side-tab-title">{t("vizkdb.tab.timeline")}</span>
                  <span className="viz-kdb-side-tab-subtitle">{t("vizkdb.tab.timelineSubtitle")}</span>
                </button>
              </div>
            </aside>
            <div className="viz-kdb-main">
              <section className="card viz-kdb-legend-card">
                <p className="eyebrow">{t("vizkdb.graph.legend")}</p>
                <div className="viz-kdb-legend">
                  {filteredModel.categories
                    .filter((item) => item.count > 0)
                    .map((item) => (
                      <span className="viz-kdb-legend-item" key={item.id}>
                        <span className="viz-kdb-legend-dot" style={{ background: item.color }} />
                        <span>{t(`vizkdb.category.${item.id}`)}</span>
                        <span>{item.count}</span>
                      </span>
                    ))}
                </div>
              </section>
              {activeTab === "graph" ? (
                <VizKdbGraphView
                  edges={filteredModel.edges}
                  nodes={filteredModel.nodes}
                  onSelectNode={setSelectedDocId}
                  selectedDocId={selectedDocId}
                />
              ) : (
                <VizKdbTimelineView
                  nodes={filteredModel.nodes}
                  onSelectNode={setSelectedDocId}
                  selectedDocId={selectedDocId}
                />
              )}
            </div>
          </div>
          <VizKdbDetailDrawer
            node={selectedNode}
            onSelectRelated={setSelectedDocId}
            relatedNodesById={relatedNodesById}
          />
        </section>
      ) : null}
    </main>
  )
}
