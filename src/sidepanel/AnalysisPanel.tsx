import type { JSX } from "react"
import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { canonicalizeUrl } from "../core/url"
import { createFeedbackRepository } from "../db/feedbackRepo"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { useI18n } from "../i18n/I18nContext"
import { normalizeAnalysisResultsByUrl } from "../shared/analysisSnapshotStorage"
import {
  createFeedbackId,
  createResultId,
  DEFAULT_SETTINGS,
  type FeedbackType,
  type SimilarSourceSummary
} from "../shared/types"
import { applyDocumentTheme } from "../theme/themeMode"
import { DuplicateClaims } from "./DuplicateClaims"
import { FeedbackButtons } from "./FeedbackButtons"
import { NovelClaims } from "./NovelClaims"
import { ScoreChip } from "./ScoreChip"
import { SimilarSources } from "./SimilarSources"

const database = createCognitiveDeltaDb()

interface PanelSnapshot {
  readonly claims: readonly {
    readonly text: string
  }[]
  readonly duplicateClaims: readonly string[]
  readonly judgement?: "complete" | "insufficient-content"
  readonly novelClaims: readonly string[]
  readonly page?: {
    readonly canonicalUrl: string
    readonly url: string
  }
  readonly persisted: boolean
  readonly result: {
    readonly duplicateScore: number
    readonly noveltyScore: number
    readonly recommendation: "skip" | "skim" | "read"
    readonly resultId: string
  }
  readonly similarSources: readonly SimilarSourceSummary[]
}

type AnalysisResultsByUrl = Record<string, PanelSnapshot>

function parsePanelSnapshot(value: unknown): PanelSnapshot | null {
  if (value === null || value === undefined) {
    return null
  }

  const snapshot = value as Omit<PanelSnapshot, "similarSources"> & {
    readonly similarSources?: unknown
  }

  return {
    ...snapshot,
    similarSources: normalizeSimilarSources(snapshot.similarSources)
  }
}

function parseAnalysisResultsByUrl(value: unknown): AnalysisResultsByUrl {
  if (value === null || value === undefined || typeof value !== "object") {
    return {}
  }

  const rawEntries = Object.entries(value as Record<string, unknown>)

  return normalizeAnalysisResultsByUrl(
    Object.fromEntries(
      rawEntries.flatMap(([url, snapshotValue]) => {
        const snapshot = parsePanelSnapshot(snapshotValue)

        return snapshot === null ? [] : [[url, snapshot]]
      })
    )
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)

    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function normalizeSimilarSources(value: unknown): readonly SimilarSourceSummary[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap<SimilarSourceSummary>((item) => {
    if (typeof item === "string") {
      return [
        {
          snippet: item,
          similarity: 0,
          url: isHttpUrl(item) ? item : ""
        }
      ]
    }

    if (item === null || typeof item !== "object") {
      return []
    }

    const candidate = item as {
      readonly similarity?: unknown
      readonly snippet?: unknown
      readonly url?: unknown
    }

    if (
      typeof candidate.snippet !== "string" ||
      typeof candidate.similarity !== "number" ||
      typeof candidate.url !== "string"
    ) {
      return []
    }

    return [
      {
        snippet: candidate.snippet,
        similarity: candidate.similarity,
        url: candidate.url
      }
    ]
  })
}

function normalizePageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null
  }

  try {
    const url = new URL(value)

    return url.protocol === "http:" || url.protocol === "https:" ? value : null
  } catch {
    return null
  }
}

function resolveSnapshotForUrl(input: {
  readonly activeTabUrl: string | null
  readonly analysisResultsByUrl: AnalysisResultsByUrl
  readonly latestAnalysisResult: PanelSnapshot | null
}): PanelSnapshot | null {
  if (input.activeTabUrl === null) {
    return null
  }

  const directMatch = input.analysisResultsByUrl[input.activeTabUrl]

  if (directMatch !== undefined) {
    return directMatch
  }

  const canonicalMatch = input.analysisResultsByUrl[canonicalizeUrl(input.activeTabUrl)]

  if (canonicalMatch !== undefined) {
    return canonicalMatch
  }

  if (
    input.latestAnalysisResult?.page?.url !== undefined &&
    canonicalizeUrl(input.latestAnalysisResult.page.url) === canonicalizeUrl(input.activeTabUrl)
  ) {
    return input.latestAnalysisResult
  }

  if (
    input.latestAnalysisResult?.page?.canonicalUrl !== undefined &&
    canonicalizeUrl(input.latestAnalysisResult.page.canonicalUrl) === canonicalizeUrl(input.activeTabUrl)
  ) {
    return input.latestAnalysisResult
  }

  return null
}

function formatRecommendation(
  recommendation: PanelSnapshot["result"]["recommendation"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (recommendation === "skip") {
    return t("sidepanel.recommendation.skip")
  }

  if (recommendation === "skim") {
    return t("sidepanel.recommendation.skim")
  }

  return t("sidepanel.recommendation.read")
}

export function AnalysisPanel(): JSX.Element {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null)
  const [analysisResultsByUrl, setAnalysisResultsByUrl] = useState<AnalysisResultsByUrl>({})
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null)
  const [latestAnalysisResult, setLatestAnalysisResult] = useState<PanelSnapshot | null>(null)
  const [themeMode, setThemeMode] = useState(DEFAULT_SETTINGS.themeMode)
  const [submittedFeedbackType, setSubmittedFeedbackType] = useState<FeedbackType | null>(null)
  const [feedbackSubmissionState, setFeedbackSubmissionState] = useState<
    "idle" | "submitting" | "submitted" | "failed"
  >("idle")
  const [feedbackErrorMessage, setFeedbackErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function refreshActiveTabUrl(): Promise<void> {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true
      })
      setActiveTabUrl(normalizePageUrl(tabs[0]?.url))
    }

    void browser.storage.local
      .get(["analysisResultsByUrl", "latestAnalysisResult", "operationalSettings"])
      .then((result) => {
        setAnalysisResultsByUrl(parseAnalysisResultsByUrl(result["analysisResultsByUrl"]))
        setLatestAnalysisResult(parsePanelSnapshot(result["latestAnalysisResult"]))
        setThemeMode(
          ((result["operationalSettings"] as { readonly themeMode?: string } | undefined)?.themeMode ??
            DEFAULT_SETTINGS.themeMode) as typeof DEFAULT_SETTINGS.themeMode
        )
      })

    void refreshActiveTabUrl()

    const handleStorageChange = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string
    ): void => {
      if (areaName !== "local") {
        return
      }

      if ("analysisResultsByUrl" in changes) {
        setAnalysisResultsByUrl(parseAnalysisResultsByUrl(changes["analysisResultsByUrl"]?.newValue))
      }

      if ("latestAnalysisResult" in changes) {
        setLatestAnalysisResult(parsePanelSnapshot(changes["latestAnalysisResult"]?.newValue))
      }

      if ("operationalSettings" in changes) {
        setThemeMode(
          ((changes["operationalSettings"]?.newValue as { readonly themeMode?: string } | undefined)
            ?.themeMode ?? DEFAULT_SETTINGS.themeMode) as typeof DEFAULT_SETTINGS.themeMode
        )
      }
    }

    const handleTabsActivated = () => {
      void refreshActiveTabUrl()
    }
    const handleTabsUpdated = (
      _tabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      tab: browser.Tabs.Tab
    ) => {
      if (!tab.active || (changeInfo.status === undefined && changeInfo.url === undefined)) {
        return
      }

      void refreshActiveTabUrl()
    }

    browser.storage.onChanged.addListener(handleStorageChange)
    browser.tabs.onActivated.addListener(handleTabsActivated)
    browser.tabs.onUpdated.addListener(handleTabsUpdated)

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
      browser.tabs.onActivated.removeListener(handleTabsActivated)
      browser.tabs.onUpdated.removeListener(handleTabsUpdated)
    }
  }, [])

  useEffect(() => {
    setSnapshot(
      resolveSnapshotForUrl({
        activeTabUrl,
        analysisResultsByUrl,
        latestAnalysisResult
      })
    )
  }, [activeTabUrl, analysisResultsByUrl, latestAnalysisResult])

  useEffect(() => {
    setSubmittedFeedbackType(null)
    setFeedbackSubmissionState("idle")
    setFeedbackErrorMessage(null)
  }, [snapshot?.result.resultId])

  useEffect(() => {
    applyDocumentTheme(themeMode)
  }, [themeMode])

  const toolbar = (
    <div className="toolbar">
      <div className="toolbar-spacer" />
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
      <button
        className="toolbar-button"
        onClick={() => {
          void browser.tabs.create({ url: browser.runtime.getURL("viz-kdb.html") })
        }}
        type="button"
      >
        {t("navigation.vizKdb")}
      </button>
    </div>
  )

  if (snapshot === null) {
    return (
      <main className="shell">
        {toolbar}
        <section className="card">
          <p className="eyebrow">{t("sidepanel.eyebrow")}</p>
          <h1 className="title">{t("sidepanel.empty.title")}</h1>
          <p className="body-copy">{t("sidepanel.empty.body")}</p>
        </section>
      </main>
    )
  }

  if (snapshot.judgement === "insufficient-content") {
    return (
      <main className="shell">
        {toolbar}
        <section className="card">
          <p className="eyebrow">{t("sidepanel.eyebrow")}</p>
          <h1 className="title">{t("sidepanel.insufficient.title")}</h1>
          <p className="body-copy">{t("sidepanel.insufficient.body")}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="shell layout">
      {toolbar}
      <section className="card hero">
        <p className="eyebrow">{t("sidepanel.eyebrow")}</p>
        <h1 className="title">{formatRecommendation(snapshot.result.recommendation, t)}</h1>
        <div className="hero-score-row">
          <ScoreChip
            label={t("sidepanel.duplicateScore", {
              score: Math.round(snapshot.result.duplicateScore * 100)
            })}
            value={`${Math.round(snapshot.result.duplicateScore * 100)}%`}
          />
          <ScoreChip
            label={t("sidepanel.noveltyScore", {
              score: Math.round(snapshot.result.noveltyScore * 100)
            })}
            value={`${Math.round(snapshot.result.noveltyScore * 100)}%`}
          />
        </div>
        <p className="body-copy">{snapshot.persisted ? t("sidepanel.persisted") : t("sidepanel.capacityTemporary")}</p>
      </section>
      <NovelClaims claims={snapshot.novelClaims} />
      <DuplicateClaims claims={snapshot.duplicateClaims} />
      <SimilarSources items={snapshot.similarSources} />
      <FeedbackButtons
        errorMessage={feedbackErrorMessage}
        onSubmit={async (feedbackType) => {
          setSubmittedFeedbackType(feedbackType)
          setFeedbackSubmissionState("submitting")
          setFeedbackErrorMessage(null)

          try {
            await createFeedbackRepository(database).saveFeedback({
              feedbackId: createFeedbackId(`feedback_${Date.now()}`),
              resultId: createResultId(snapshot.result.resultId),
              type: feedbackType,
              createdAt: Date.now()
            })
            setFeedbackSubmissionState("submitted")
          } catch (error) {
            setFeedbackSubmissionState("failed")
            setFeedbackErrorMessage(
              error instanceof Error ? error.message : t("sidepanel.feedback.failedStatus")
            )
          }
        }}
        submittedFeedbackType={submittedFeedbackType}
        submissionState={feedbackSubmissionState}
      />
    </main>
  )
}
