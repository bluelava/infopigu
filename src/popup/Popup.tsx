import type { JSX } from "react"
import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { createDocumentsRepository } from "../db/documentsRepo"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createSettingsRepository } from "../db/settingsRepo"
import { createWhitelistRepository } from "../db/whitelistRepo"
import { useI18n } from "../i18n/I18nContext"
import { DEFAULT_SETTINGS, type Settings } from "../shared/types"
import { applyDocumentTheme } from "../theme/themeMode"

const database = createCognitiveDeltaDb()

export function Popup(): JSX.Element {
  const { locale, t } = useI18n()
  const [domains, setDomains] = useState<readonly string[]>([])
  const [savedDocuments, setSavedDocuments] = useState(0)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const singleModeLabel =
    settings.singleArticleReadMode === "auto" ? t("popup.mode.auto") : t("popup.mode.manual")
  const feedModeLabel =
    settings.feedItemReadMode === "auto" ? t("popup.mode.auto") : t("popup.mode.manual")
  const cloudVersionUrl =
    locale === "en"
      ? "https://github.com/bluelava/infopigu/blob/main/CLOUD_VERSION_EN.md"
      : "https://github.com/bluelava/infopigu/blob/main/CLOUD_VERSION.md"

  useEffect(() => {
    const whitelistRepository = createWhitelistRepository(database)
    const documentsRepository = createDocumentsRepository(database)
    const settingsRepository = createSettingsRepository(database)

    void Promise.all([
      whitelistRepository.listDomains(),
      documentsRepository.countDocuments(),
      settingsRepository.getSettings()
    ]).then(([nextDomains, nextSavedDocuments, nextSettings]) => {
      setDomains(nextDomains)
      setSavedDocuments(nextSavedDocuments)
      setSettings(nextSettings)
    })
  }, [])

  useEffect(() => {
    applyDocumentTheme(settings.themeMode)
  }, [settings.themeMode])

  return (
    <main className="shell popup-shell">
      <section className="card popup-card">
        <div className="toolbar popup-toolbar">
          <div className="toolbar-spacer" />
          <button
            className="toolbar-button popup-toolbar-button"
            onClick={() => {
              void browser.runtime.openOptionsPage()
            }}
            type="button"
          >
            {t("navigation.options")}
          </button>
          <button
            className="toolbar-button popup-toolbar-button"
            onClick={() => {
              void browser.tabs.create({ url: browser.runtime.getURL("about.html") })
            }}
            type="button"
          >
            {t("navigation.about")}
          </button>
          <button
            className="toolbar-button popup-toolbar-button"
            onClick={() => {
              void browser.tabs.create({ url: browser.runtime.getURL("viz-kdb.html") })
            }}
            type="button"
          >
            {t("navigation.vizKdb")}
          </button>
          <button
            className="toolbar-button popup-toolbar-button"
            onClick={() => {
              void browser.tabs.create({ url: cloudVersionUrl })
            }}
            type="button"
          >
            {t("navigation.cloudVersion")}
          </button>
        </div>
        <p className="eyebrow popup-eyebrow">{t("common.productName")}</p>
        <h1 className="title popup-title">{t("popup.title")}</h1>
        <p className="body-copy popup-body-copy">
          {t("popup.whitelistCount", { count: domains.length })}
          <br />
          {t("popup.savedDocumentsCount", { count: savedDocuments })}
          <br />
          {t("popup.currentMode", {
            feedMode: feedModeLabel,
            singleMode: singleModeLabel
          })}
        </p>
      </section>
    </main>
  )
}
