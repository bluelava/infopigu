import type { JSX, ReactNode } from "react"
import { createContext, useContext, useEffect, useRef, useState } from "react"

import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createSettingsRepository } from "../db/settingsRepo"
import { DEFAULT_SETTINGS, type LanguageMode, type Settings } from "../shared/types"
import { resolveLocale, type SupportedLocale } from "./locales"
import { type MessageId } from "./messages"
import { translate, type TranslationValues } from "./translate"

interface I18nValue {
  readonly languageMode: LanguageMode
  readonly locale: SupportedLocale
  readonly t: (messageId: MessageId, values?: TranslationValues) => string
}

const defaultLocale = resolveLocale(DEFAULT_SETTINGS.languageMode, null)

const defaultValue: I18nValue = {
  languageMode: DEFAULT_SETTINGS.languageMode,
  locale: defaultLocale,
  t: (messageId, values) => translate(defaultLocale, messageId, values)
}

const I18nContext = createContext<I18nValue>(defaultValue)
const validLanguageModes = new Set<LanguageMode>(["auto", "zh-CN", "zh-TW", "en"])

export function sanitizeLanguageMode(languageMode: unknown): LanguageMode {
  return validLanguageModes.has(languageMode as LanguageMode)
    ? (languageMode as LanguageMode)
    : DEFAULT_SETTINGS.languageMode
}

export function sanitizeSettingsLanguageMode(settings: Settings): Settings {
  return {
    ...settings,
    languageMode: sanitizeLanguageMode(settings.languageMode)
  }
}

function readLanguageMode(settings: unknown): LanguageMode {
  return sanitizeLanguageMode((settings as Partial<Settings> | undefined)?.languageMode)
}

function getBrowserLanguageFallback(): string | null {
  return typeof navigator === "undefined" ? null : navigator.language
}

async function loadInitialLanguageMode(storageLanguageMode: LanguageMode): Promise<LanguageMode> {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  try {
    const persistedSettings = await settingsRepository.getSettings()

    return readLanguageMode(persistedSettings)
  } catch {
    return storageLanguageMode
  } finally {
    database.close()
  }
}

interface I18nProviderProps {
  readonly children: ReactNode
}

export function I18nProvider(props: I18nProviderProps): JSX.Element {
  const [languageMode, setLanguageMode] = useState<LanguageMode>(DEFAULT_SETTINGS.languageMode)
  const [browserLanguage, setBrowserLanguage] = useState<string | null>(getBrowserLanguageFallback())
  const languageModeVersionRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let removeStorageListener: (() => void) | null = null

    void import("webextension-polyfill")
      .then((module) => module.default)
      .then((browserApi) => {
        if (cancelled) {
          return
        }

        setBrowserLanguage(
          typeof browserApi.i18n?.getUILanguage === "function"
            ? browserApi.i18n.getUILanguage()
            : getBrowserLanguageFallback()
        )

        const startupVersion = ++languageModeVersionRef.current

        void browserApi.storage.local.get("operationalSettings").then(async (result) => {
          const storageLanguageMode = readLanguageMode(result["operationalSettings"])
          const initialLanguageMode = await loadInitialLanguageMode(storageLanguageMode)

          if (cancelled || languageModeVersionRef.current !== startupVersion) {
            return
          }

          setLanguageMode(initialLanguageMode)
        })

        const handleStorageChange = (
          changes: Record<string, { readonly newValue?: unknown }>,
          areaName: string
        ): void => {
          if (areaName !== "local" || !("operationalSettings" in changes)) {
            return
          }

          languageModeVersionRef.current += 1
          setLanguageMode(readLanguageMode(changes["operationalSettings"]?.newValue))
        }

        browserApi.storage.onChanged.addListener(handleStorageChange)
        removeStorageListener = () => {
          browserApi.storage.onChanged.removeListener(handleStorageChange)
        }
      })
      .catch(() => {
        setBrowserLanguage(getBrowserLanguageFallback())
      })

    return () => {
      cancelled = true
      removeStorageListener?.()
    }
  }, [])

  const locale = resolveLocale(languageMode, browserLanguage)

  return (
    <I18nContext.Provider
      value={{
        languageMode,
        locale,
        t: (messageId, values) => translate(locale, messageId, values)
      }}
    >
      {props.children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
