import type { JSX } from "react"
import { startTransition, useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { syncRegisteredContentScripts } from "../background/contentRegistration"
import { createDocumentsRepository } from "../db/documentsRepo"
import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createProvidersRepository } from "../db/providersRepo"
import { createSettingsRepository } from "../db/settingsRepo"
import { createWhitelistRepository } from "../db/whitelistRepo"
import { clearArticleLibrary, exportLocalKnowledge, resetLocalKnowledge } from "../db/exportImport"
import {
  DEFAULT_SETTINGS,
  createProviderId,
  type ProviderConfig,
  type ProviderType,
  type Settings
} from "../shared/types"
import { LanguageModeSelect } from "../i18n/LanguageModeSelect"
import { sanitizeSettingsLanguageMode, useI18n } from "../i18n/I18nContext"
import { applyDocumentTheme } from "../theme/themeMode"
import { PrivacyNotice } from "./PrivacyNotice"
import { ProviderSettings } from "./ProviderSettings"
import { ReadModeSettings } from "./ReadModeSettings"
import { StorageSettings } from "./StorageSettings"
import { ThemeSettings } from "./ThemeSettings"
import { WhitelistSettings } from "./WhitelistSettings"

const database = createCognitiveDeltaDb()
const settingsRepository = createSettingsRepository(database)
const providersRepository = createProvidersRepository(database)
const documentsRepository = createDocumentsRepository(database)
const whitelistRepository = createWhitelistRepository(database)

function createDownloadUrl(data: unknown): string {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  })
  return URL.createObjectURL(blob)
}

function createOriginPermission(baseUrl: string): string {
  const url = new URL(baseUrl)
  return `${url.origin}/*`
}

function clearProviderFromSettings(settings: Settings, providerId: ProviderConfig["id"]): Settings {
  const shouldClearClaim = settings.activeClaimProviderId === providerId
  const shouldClearEmbedding = settings.activeEmbeddingProviderId === providerId

  if (!shouldClearClaim && !shouldClearEmbedding) {
    return settings
  }

  const {
    activeClaimModel: _activeClaimModel,
    activeClaimProviderId: _activeClaimProviderId,
    activeEmbeddingModel: _activeEmbeddingModel,
    activeEmbeddingProviderId: _activeEmbeddingProviderId,
    ...restSettings
  } = settings

  return {
    ...restSettings,
    ...(shouldClearClaim
      ? {}
      : {
          activeClaimProviderId: settings.activeClaimProviderId,
          activeClaimModel: settings.activeClaimModel
        }),
    ...(shouldClearEmbedding
      ? {}
      : {
          activeEmbeddingProviderId: settings.activeEmbeddingProviderId,
          activeEmbeddingModel: settings.activeEmbeddingModel
        })
  }
}

export function OptionsPage(): JSX.Element {
  const { t } = useI18n()
  const [domains, setDomains] = useState<readonly string[]>([])
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [savedDocuments, setSavedDocuments] = useState(0)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [switchWarning, setSwitchWarning] = useState("")

  async function refresh(): Promise<void> {
    const [nextDomains, nextProviders, nextSavedDocuments, nextSettings] = await Promise.all([
      whitelistRepository.listDomains(),
      providersRepository.listProviders(),
      documentsRepository.countDocuments(),
      settingsRepository.getSettings()
    ])

    startTransition(() => {
      setDomains(nextDomains)
      setProviders(nextProviders)
      setSavedDocuments(nextSavedDocuments)
      setSettings(sanitizeSettingsLanguageMode(nextSettings))
    })
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    applyDocumentTheme(settings.themeMode)
  }, [settings.themeMode])

  async function saveOperationalSettings(nextSettings: Settings): Promise<void> {
    const sanitizedSettings = sanitizeSettingsLanguageMode(nextSettings)

    await settingsRepository.saveSettings(sanitizedSettings)
    await browser.storage.local.set({ operationalSettings: sanitizedSettings })
    setSettings(sanitizedSettings)
  }

  return (
    <main className="shell layout">
      <section className="card hero">
        <div className="hero-topbar">
          <div>
            <p className="eyebrow">{t("common.productName")}</p>
          </div>
          <div className="hero-actions">
            <button
              className="toolbar-button"
              onClick={() => {
                void browser.tabs.create({ url: browser.runtime.getURL("viz-kdb.html") })
              }}
              type="button"
            >
              {t("navigation.vizKdb")}
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
        <h1 className="title">{t("options.hero.title")}</h1>
        <p className="body-copy">{t("options.hero.description")}</p>
        <div className="row">
          <input
            className="text-input"
            min={10}
            onChange={(event) => {
              const nextValue = event.currentTarget.value
              void saveOperationalSettings({
                ...settings,
                dwellThresholdSeconds: Number(nextValue)
              })
            }}
            type="number"
            value={settings.dwellThresholdSeconds}
          />
          <label className="row" htmlFor="debug-logging-enabled-input">
            <input
              checked={settings.debugLoggingEnabled}
              id="debug-logging-enabled-input"
              onChange={(event) => {
                void saveOperationalSettings({
                  ...settings,
                  debugLoggingEnabled: event.currentTarget.checked
                })
              }}
              type="checkbox"
            />
            <span className="body-copy">{t("options.debugLogging")}</span>
          </label>
        </div>
      </section>
      <ReadModeSettings
        onChange={async (nextSettings) => {
          await saveOperationalSettings(nextSettings)
        }}
        settings={settings}
      />
      <ThemeSettings
        onChange={async (nextSettings) => {
          await saveOperationalSettings(nextSettings)
        }}
        settings={settings}
      />
      <WhitelistSettings
        domains={domains}
        onAddDomain={async (domain) => {
          const granted = await chrome.permissions.request({
            origins: [`https://${domain}/*`, `http://${domain}/*`]
          })

          if (!granted) {
            return
          }

          await whitelistRepository.addDomain(domain)
          const nextDomains = await whitelistRepository.listDomains()
          await syncRegisteredContentScripts(nextDomains)
          await refresh()
        }}
        onRemoveDomain={async (domain) => {
          await whitelistRepository.removeDomain(domain)
          const nextDomains = await whitelistRepository.listDomains()
          await syncRegisteredContentScripts(nextDomains)
          await refresh()
        }}
      />
      <ProviderSettings
        onDeleteProvider={async (providerId) => {
          const nextSettings = clearProviderFromSettings(settings, providerId)

          await providersRepository.deleteProvider(providerId)

          if (nextSettings !== settings) {
            await saveOperationalSettings(nextSettings)
          }

          await refresh()
        }}
        onSaveProvider={async (input) => {
          if (input.type === "custom-openai-compatible") {
            await chrome.permissions.request({
              origins: [createOriginPermission(input.baseUrl)]
            })
          }

          const providerId = createProviderId(`${input.type}_${Date.now()}`)
          await providersRepository.saveProvider({
            id: providerId,
            name: input.name,
            type: input.type,
            baseUrl: input.baseUrl,
            apiKeyEncrypted: input.apiKey,
            embeddingModels: input.embeddingModels,
            chatModels: input.chatModels,
            supportsEmbedding: input.supportsEmbedding,
            supportsChat: input.supportsChat,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          await refresh()
        }}
        onSelectClaimProvider={async (providerId, claimModel) => {
          await saveOperationalSettings({
            ...settings,
            activeClaimProviderId: providerId,
            activeClaimModel: claimModel
          })
        }}
        onSelectEmbeddingProvider={async (providerId, embeddingModel) => {
          if (settings.activeEmbeddingModel !== undefined && settings.activeEmbeddingModel !== embeddingModel) {
            setSwitchWarning(t("options.providers.switchWarning"))
          } else {
            setSwitchWarning("")
          }

          await saveOperationalSettings({
            ...settings,
            activeEmbeddingProviderId: providerId,
            activeEmbeddingModel: embeddingModel
          })
        }}
        onTestProvider={async (providerId) => {
          const result = await browser.runtime.sendMessage({
            type: "TEST_PROVIDER_CONNECTION",
            payload: {
              providerId
            }
          })

          return (result as { readonly message: string }).message
        }}
        providers={providers}
        settings={settings}
        switchWarning={switchWarning}
      />
      <StorageSettings
        onClearLibrary={async () => {
          await clearArticleLibrary(database)
          await browser.storage.local.remove(["analysisResultsByUrl", "latestAnalysisResult"])
          await refresh()
        }}
        onExport={async () => {
          const exportedData = await exportLocalKnowledge(database)
          const url = createDownloadUrl(exportedData)
          await browser.downloads.download({
            filename: "cognitive-delta-export.json",
            saveAs: true,
            url
          })
        }}
        onRebuild={async () => {
          await browser.runtime.sendMessage({
            type: "REBUILD_EMBEDDINGS"
          })
        }}
        onReset={async () => {
          await resetLocalKnowledge(database)
          await browser.storage.local.remove([
            "analysisResultsByUrl",
            "latestAnalysisResult",
            "operationalSettings"
          ])
          await refresh()
        }}
        savedDocuments={savedDocuments}
      />
      <PrivacyNotice />
    </main>
  )
}
