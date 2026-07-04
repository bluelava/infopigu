import type { JSX } from "react"
import { useEffect, useState } from "react"
import browser from "webextension-polyfill"

import { AboutConceptDiagram } from "./AboutConceptDiagram"
import { LanguageModeSelect } from "../i18n/LanguageModeSelect"
import { persistLanguageMode } from "../i18n/persistLanguageMode"
import { useI18n } from "../i18n/I18nContext"
import { DEFAULT_SETTINGS, type ThemeMode } from "../shared/types"
import { applyDocumentTheme } from "../theme/themeMode"

const validThemeModes = new Set<ThemeMode>(["auto", "dark", "light"])

function sanitizeThemeMode(themeMode: unknown): ThemeMode {
  return validThemeModes.has(themeMode as ThemeMode)
    ? (themeMode as ThemeMode)
    : DEFAULT_SETTINGS.themeMode
}

export function AboutPage(): JSX.Element {
  const { languageMode, locale, t } = useI18n()
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_SETTINGS.themeMode)
  const aboutTitle = t("about.title")

  useEffect(() => {
    let cancelled = false
    let removeStorageListener: (() => void) | null = null

    void browser.storage.local.get("operationalSettings").then((result) => {
      if (cancelled) {
        return
      }

      setThemeMode(
        sanitizeThemeMode(
          (result["operationalSettings"] as { readonly themeMode?: unknown } | undefined)?.themeMode
        )
      )
    })

    const handleStorageChange = (
      changes: Record<string, { readonly newValue?: unknown }>,
      areaName: string
    ): void => {
      if (areaName !== "local" || !("operationalSettings" in changes)) {
        return
      }

      setThemeMode(
        sanitizeThemeMode(
          (changes["operationalSettings"]?.newValue as { readonly themeMode?: unknown } | undefined)
            ?.themeMode
        )
      )
    }

    browser.storage.onChanged.addListener(handleStorageChange)
    removeStorageListener = () => {
      browser.storage.onChanged.removeListener(handleStorageChange)
    }

    return () => {
      cancelled = true
      removeStorageListener?.()
    }
  }, [])

  useEffect(() => {
    applyDocumentTheme(themeMode)
  }, [themeMode])

  useEffect(() => {
    document.title = aboutTitle
    document.documentElement.lang = locale
  }, [aboutTitle, locale])

  return (
    <main className="shell layout about-shell">
      <section className="card hero about-hero">
        <div className="about-topbar">
          <p className="eyebrow">{t("about.brand")}</p>
          <LanguageModeSelect
            ariaLabel={t("language.legend")}
            className="about-language-select"
            languageMode={languageMode}
            onChange={persistLanguageMode}
          />
        </div>
        <h1 className="title">{aboutTitle}</h1>
        <p className="body-copy about-intro">{t("about.subtitle")}</p>
        <p className="body-copy about-intro">{t("about.hero.description")}</p>
        <div className="about-pill-row">
          <span className="about-pill">{t("about.feature.extraction.title")}</span>
          <span className="about-pill">{t("about.feature.filtering.title")}</span>
          <span className="about-pill">{t("about.feature.privacy.title")}</span>
        </div>
      </section>

      <AboutConceptDiagram />

      <section className="about-grid">
        <article className="card">
          <p className="eyebrow">{t("about.brand")}</p>
          <h2 className="about-card-title">{t("about.feature.extraction.title")}</h2>
          <p className="body-copy">{t("about.feature.extraction.body")}</p>
        </article>
        <article className="card">
          <p className="eyebrow">{t("about.brand")}</p>
          <h2 className="about-card-title">{t("about.feature.filtering.title")}</h2>
          <p className="body-copy">{t("about.feature.filtering.body")}</p>
        </article>
        <article className="card">
          <p className="eyebrow">{t("about.brand")}</p>
          <h2 className="about-card-title">{t("about.feature.privacy.title")}</h2>
          <p className="body-copy">{t("about.feature.privacy.body")}</p>
        </article>
      </section>

      <section className="card">
        <p className="eyebrow">{t("about.workflow.eyebrow")}</p>
        <h2 className="about-card-title">{t("about.workflow.title")}</h2>
        <ol className="about-flow-list">
          <li className="about-flow-step">
            <span className="about-flow-index">01</span>
            <div>
              <h3 className="about-step-title">{t("about.workflow.step1.title")}</h3>
              <p className="body-copy">{t("about.workflow.step1.body")}</p>
            </div>
          </li>
          <li className="about-flow-step">
            <span className="about-flow-index">02</span>
            <div>
              <h3 className="about-step-title">{t("about.workflow.step2.title")}</h3>
              <p className="body-copy">{t("about.workflow.step2.body")}</p>
            </div>
          </li>
          <li className="about-flow-step">
            <span className="about-flow-index">03</span>
            <div>
              <h3 className="about-step-title">{t("about.workflow.step3.title")}</h3>
              <p className="body-copy">{t("about.workflow.step3.body")}</p>
            </div>
          </li>
        </ol>
      </section>
    </main>
  )
}
