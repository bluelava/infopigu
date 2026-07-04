// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import type { Settings } from "../../src/shared/types"
import { getThemeAttributeName } from "../../src/theme/themeMode"

const settingsMockState = vi.hoisted(() => {
  type StorageChangeListener = (
    changes: Record<string, { readonly newValue?: unknown; readonly oldValue?: unknown }>,
    areaName: string
  ) => void

  let settings: Settings = {
    id: "global" as const,
    singleArticleReadMode: "auto" as const,
    feedItemReadMode: "manual" as const,
    dwellThresholdSeconds: 20,
    novelClaimsOverlaySeconds: 20,
    novelClaimsOverlayMaxVisible: 5,
    maxDocuments: 1000,
    autoAnalyzeEnabled: true,
    debugLoggingEnabled: true,
    languageMode: "zh-CN" as const,
    themeMode: "light" as const
  }
  const listeners = new Set<StorageChangeListener>()

  return {
    emitOperationalSettings(nextSettings: typeof settings) {
      const previousSettings = settings
      settings = nextSettings

      for (const listener of listeners) {
        listener(
          {
            operationalSettings: {
              oldValue: previousSettings,
              newValue: nextSettings
            }
          },
          "local"
        )
      }
    },
    getSettings() {
      return settings
    },
    reset() {
      settings = {
        id: "global",
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual",
        dwellThresholdSeconds: 20,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        maxDocuments: 1000,
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        languageMode: "zh-CN",
        themeMode: "light"
      }
      listeners.clear()
    },
    subscribe(listener: StorageChangeListener) {
      listeners.add(listener)
    },
    unsubscribe(listener: StorageChangeListener) {
      listeners.delete(listener)
    }
  }
})

vi.mock("../../src/db/indexeddb", () => {
  return {
    createCognitiveDeltaDb: vi.fn(() => ({
      close: vi.fn()
    }))
  }
})

vi.mock("../../src/db/settingsRepo", () => {
  return {
    createSettingsRepository: vi.fn(() => ({
      getSettings: vi.fn(async () => settingsMockState.getSettings()),
      saveSettings: vi.fn(async (nextSettings: Settings) => {
        settingsMockState.emitOperationalSettings(nextSettings)
      })
    }))
  }
})

vi.mock("webextension-polyfill", () => {
  return {
    default: {
      i18n: {
        getUILanguage: vi.fn(() => "en-US")
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            operationalSettings: settingsMockState.getSettings()
          })),
          set: vi.fn(async (value: { readonly operationalSettings?: Settings }) => {
            if (value.operationalSettings !== undefined) {
              settingsMockState.emitOperationalSettings(value.operationalSettings)
            }
          })
        },
        onChanged: {
          addListener: vi.fn((listener) => {
            settingsMockState.subscribe(listener)
          }),
          removeListener: vi.fn((listener) => {
            settingsMockState.unsubscribe(listener)
          })
        }
      }
    }
  }
})

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
  settingsMockState.reset()
  document.title = ""
  document.documentElement.removeAttribute("lang")
  document.documentElement.removeAttribute(getThemeAttributeName())
})

async function flushAboutPageStartup(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

it("localizes shell metadata and reacts to live language and theme updates", async () => {
  const { I18nProvider } = await import("../../src/i18n/I18nContext")
  const { AboutPage } = await import("../../src/about/AboutPage")
  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(AboutPage)))
    await flushAboutPageStartup()
  })

  expect(container.textContent).toContain("Info-Pigu")
  expect(container.textContent).toContain("信息辟谷")
  expect(container.textContent).toContain("通过道家辟谷修行方法的介绍")
  expect(container.textContent).toContain("抽取与压缩")
  expect(container.textContent).toContain("过滤与语义去重")
  expect(container.textContent).toContain("完全隐私")
  expect(container.textContent).toContain("增量认知")
  expect(container.querySelector(".about-concept-diagram")).not.toBeNull()
  expect(container.querySelector(".about-concept-node-compress")).not.toBeNull()
  expect(container.querySelector(".about-concept-node-filter")).not.toBeNull()
  expect(container.querySelector(".about-concept-node-private")).not.toBeNull()
  expect((container.querySelector(".about-concept-diagram") as HTMLElement | null)?.style.margin).toBe(
    "0px"
  )
  const languageSelect = container.querySelector("select")

  expect(languageSelect).not.toBeNull()
  expect(languageSelect?.getAttribute("aria-label")).toContain("语言")
  expect(container.querySelector(".about-topbar .language-select-icon")).not.toBeNull()
  expect(document.title).toBe("关于 Info-Pigu（信息辟谷）")
  expect(document.documentElement.lang).toBe("zh-CN")
  expect(document.documentElement.getAttribute(getThemeAttributeName())).toBe("light")

  if (!(languageSelect instanceof HTMLSelectElement)) {
    throw new Error("expected about-page language select")
  }

  await act(async () => {
    languageSelect.value = "en"
    languageSelect.dispatchEvent(new Event("change", { bubbles: true }))
    await flushAboutPageStartup()
  })

  expect(container.textContent).toContain("About Info-Pigu")
  expect(container.textContent).toContain("Extraction and compression")
  expect(document.title).toBe("About Info-Pigu")
  expect(document.documentElement.lang).toBe("en")

  await act(async () => {
    settingsMockState.emitOperationalSettings({
      ...settingsMockState.getSettings(),
      themeMode: "dark"
    })
    await flushAboutPageStartup()
  })

  expect(document.documentElement.getAttribute(getThemeAttributeName())).toBe("dark")
})
