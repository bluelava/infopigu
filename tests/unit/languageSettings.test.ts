// @vitest-environment jsdom
import "fake-indexeddb/auto"

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createSettingsRepository } from "../../src/db/settingsRepo"
import {
  I18nProvider,
  sanitizeSettingsLanguageMode,
  useI18n
} from "../../src/i18n/I18nContext"
import { translate } from "../../src/i18n/translate"
import { LanguageSettings } from "../../src/options/LanguageSettings"
import { DEFAULT_SETTINGS } from "../../src/shared/types"

const browserMockState = vi.hoisted(() => {
  type StorageChangeListener = (
    changes: Record<string, { readonly newValue?: unknown; readonly oldValue?: unknown }>,
    areaName: string
  ) => void

  let browserLanguage = "en-US"
  let operationalSettings: unknown = undefined
  const listeners = new Set<StorageChangeListener>()
  let pendingStorageRead: Promise<void> | null = null
  let releaseStorageRead: (() => void) | null = null
  let storageSetCalls: unknown[] = []
  const createTab = vi.fn(async () => undefined)
  const getUrl = vi.fn((path: string) => `chrome-extension://test-extension/${path}`)

  return {
    async awaitStorageRead(): Promise<void> {
      await pendingStorageRead
    },
    delayStorageRead(): void {
      pendingStorageRead = new Promise<void>((resolve) => {
        releaseStorageRead = resolve
      })
    },
    emitOperationalSettings(nextValue: unknown): void {
      const previousValue = operationalSettings
      operationalSettings = nextValue

      for (const listener of listeners) {
        listener(
          {
            operationalSettings: {
              oldValue: previousValue,
              newValue: nextValue
            }
          },
          "local"
        )
      }
    },
    getBrowserLanguage(): string {
      return browserLanguage
    },
    async getOperationalSettings(): Promise<unknown> {
      await pendingStorageRead
      return operationalSettings
    },
    getStorageSetCalls(): readonly unknown[] {
      return storageSetCalls
    },
    createTab,
    getUrl,
    releaseStorageRead(): void {
      releaseStorageRead?.()
      pendingStorageRead = null
      releaseStorageRead = null
    },
    reset(): void {
      browserLanguage = "en-US"
      operationalSettings = undefined
      pendingStorageRead = null
      releaseStorageRead = null
      storageSetCalls = []
      createTab.mockClear()
      getUrl.mockClear()
      listeners.clear()
    },
    setBrowserLanguage(nextValue: string): void {
      browserLanguage = nextValue
    },
    setOperationalSettingsFromSetCall(nextValue: unknown): void {
      operationalSettings = nextValue
      storageSetCalls.push(nextValue)
    },
    subscribe(listener: StorageChangeListener): void {
      listeners.add(listener)
    },
    unsubscribe(listener: StorageChangeListener): void {
      listeners.delete(listener)
    }
  }
})

const dbMockState = vi.hoisted(() => {
  let databaseName = `test-language-settings-${crypto.randomUUID()}`

  return {
    getDatabaseName(): string {
      return databaseName
    },
    reset(): void {
      databaseName = `test-language-settings-${crypto.randomUUID()}`
    },
    setDatabaseName(nextValue: string): void {
      databaseName = nextValue
    }
  }
})

const settingsRepoMockState = vi.hoisted(() => {
  let pendingGetSettings: Promise<void> | null = null
  let releaseGetSettings: (() => void) | null = null
  let completedGetSettingsCount = 0

  return {
    async awaitPendingGetSettings(): Promise<void> {
      await pendingGetSettings
    },
    markGetSettingsCompleted(): void {
      completedGetSettingsCount += 1
    },
    delayGetSettings(): void {
      pendingGetSettings = new Promise<void>((resolve) => {
        releaseGetSettings = resolve
      })
    },
    async maybeWaitForGetSettings(): Promise<void> {
      await pendingGetSettings
    },
    releaseGetSettings(): void {
      releaseGetSettings?.()
      pendingGetSettings = null
      releaseGetSettings = null
    },
    reset(): void {
      completedGetSettingsCount = 0
      pendingGetSettings = null
      releaseGetSettings = null
    },
    waitForCompletedGetSettings(targetCount: number): Promise<void> {
      return vi.waitFor(() => {
        expect(completedGetSettingsCount).toBeGreaterThanOrEqual(targetCount)
      })
    }
  }
})

vi.mock("../../src/db/indexeddb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/db/indexeddb")>()

  return {
    ...actual,
    createCognitiveDeltaDb: vi.fn((databaseName?: string) =>
      actual.createCognitiveDeltaDb(databaseName ?? dbMockState.getDatabaseName())
    )
  }
})

vi.mock("../../src/db/settingsRepo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/db/settingsRepo")>()

  return {
    ...actual,
    createSettingsRepository: vi.fn((database) => {
      const repository = actual.createSettingsRepository(database)

      return {
        ...repository,
        async getSettings() {
          await settingsRepoMockState.maybeWaitForGetSettings()
          const result = await repository.getSettings()
          settingsRepoMockState.markGetSettingsCompleted()
          return result
        }
      }
    })
  }
})

vi.mock("webextension-polyfill", () => {
  return {
    default: {
      i18n: {
        getUILanguage: vi.fn(() => browserMockState.getBrowserLanguage())
      },
      runtime: {
        getURL: browserMockState.getUrl
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            operationalSettings: await browserMockState.getOperationalSettings()
          })),
          set: vi.fn(async (value: { readonly operationalSettings?: unknown }) => {
            browserMockState.setOperationalSettingsFromSetCall(value.operationalSettings)
          })
        },
        onChanged: {
          addListener: vi.fn((listener) => {
            browserMockState.subscribe(listener)
          }),
          removeListener: vi.fn((listener) => {
            browserMockState.unsubscribe(listener)
          })
        }
      },
      tabs: {
        create: browserMockState.createTab
      }
    }
  }
})

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(async () => {
  browserMockState.reset()
  dbMockState.reset()
  settingsRepoMockState.reset()
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
  await indexedDB.databases?.().then(async (databases) => {
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => name !== undefined)
        .map(async (name) => {
          indexedDB.deleteDatabase(name)
        })
    )
  })
})

function LanguageProbe() {
  const { languageMode, locale, t } = useI18n()

  return createElement(
    "div",
    {
      "data-language-mode": languageMode,
      "data-locale": locale
    },
    t("language.title")
  )
}

async function flushI18nStartup(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

it("renders language choices in a single dropdown control", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(
      createElement(LanguageSettings, {
        onChange: async () => undefined,
        settings: DEFAULT_SETTINGS
      })
    )
  })

  expect(container.textContent).toContain("Auto")
  expect(container.textContent).toContain("简体中文")
  expect(container.textContent).toContain("繁體中文")
  expect(container.textContent).toContain("English")
  expect(container.querySelectorAll("button")).toHaveLength(0)
  const languageSelect = container.querySelector("select")
  expect(languageSelect).not.toBeNull()
  expect(Array.from(container.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
    "Auto",
    "简体中文",
    "繁體中文",
    "English"
  ])
})

it("falls back to the default language mode when stored languageMode is invalid", async () => {
  browserMockState.setBrowserLanguage("zh-TW")
  browserMockState.emitOperationalSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "broken-locale"
  })

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(LanguageProbe)))
    await flushI18nStartup()
  })

  expect(container.firstElementChild?.getAttribute("data-language-mode")).toBe("auto")
  expect(container.firstElementChild?.getAttribute("data-locale")).toBe("zh-TW")
  expect(container.textContent).toContain("介面語言")
})

it("falls back to English when translate receives an invalid locale", () => {
  expect(translate("fr-FR" as never, "language.auto")).toBe("Auto")
})

it("sanitizes invalid languageMode values for hydrated settings", () => {
  expect(
    sanitizeSettingsLanguageMode({
      ...DEFAULT_SETTINGS,
      languageMode: "broken-locale" as never
    }).languageMode
  ).toBe("auto")
})

it("loads a saved non-default language mode from authoritative settings on cold start", async () => {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "zh-CN"
  })
  const persistedSettings = await settingsRepository.getSettings()
  expect(persistedSettings.languageMode).toBe("zh-CN")

  browserMockState.setBrowserLanguage("en-US")

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(LanguageProbe)))
    await flushI18nStartup()
  })

  await vi.waitFor(() => {
    expect(container.firstElementChild?.getAttribute("data-language-mode")).toBe("zh-CN")
    expect(container.firstElementChild?.getAttribute("data-locale")).toBe("zh-CN")
    expect(container.textContent).toContain("界面语言")
  })

  database.close()
})

it("renders the main OptionsPage sections in English when English is persisted", async () => {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "en"
  })
  browserMockState.setBrowserLanguage("en-US")

  vi.resetModules()
  const { OptionsPage } = await import("../../src/options/OptionsPage")

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(OptionsPage)))
    await flushI18nStartup()
  })

  expect(container.textContent).toContain("Interface theme")
  expect(container.textContent).toContain("Single article auto-read")
  expect(container.textContent).toContain("Feed item auto-read")
  expect(container.textContent).toContain("Allowed domains")
  expect(container.textContent).toContain("BYOK model settings")
  expect(container.textContent).toContain("Local knowledge base capacity")
  expect(container.textContent).toContain("Privacy and capacity notes")
  expect(container.textContent).toContain("About")
  expect(container.querySelector(".hero .language-select")).not.toBeNull()
  expect(container.textContent).not.toContain("自动已读策略")
  expect(container.textContent).not.toContain("允许分析的域名")
  expect(container.textContent).not.toContain("本地知识库容量")

  database.close()
})

it("keeps a newer storage language change when startup initialization finishes later", async () => {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "zh-CN"
  })

  settingsRepoMockState.delayGetSettings()

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(LanguageProbe)))
    await Promise.resolve()
    await Promise.resolve()
  })

  await act(async () => {
    browserMockState.emitOperationalSettings({
      ...DEFAULT_SETTINGS,
      languageMode: "zh-TW"
    })
    await Promise.resolve()
  })

  settingsRepoMockState.releaseGetSettings()

  await act(async () => {
    await flushI18nStartup()
  })

  await settingsRepoMockState.waitForCompletedGetSettings(1)

  expect(container.firstElementChild?.getAttribute("data-language-mode")).toBe("zh-TW")
  expect(container.firstElementChild?.getAttribute("data-locale")).toBe("zh-TW")
  expect(container.textContent).toContain("介面語言")

  database.close()
})

it("persists a user-triggered language change from OptionsPage to indexeddb and browser storage", async () => {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "broken-locale" as never
  })

  vi.resetModules()
  const { OptionsPage } = await import("../../src/options/OptionsPage")

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(OptionsPage)))
    await flushI18nStartup()
  })

  await vi.waitFor(() => {
    const heroLanguageSelect = container.querySelector(".hero select")

    expect(heroLanguageSelect).not.toBeNull()
    expect((heroLanguageSelect as HTMLSelectElement | null)?.value).toBe("auto")
  })

  expect(container.querySelector(".hero .language-select-icon")).not.toBeNull()

  const traditionalChineseSelect = container.querySelector(".hero select")

  if (!(traditionalChineseSelect instanceof HTMLSelectElement)) {
    throw new Error("expected hero language select")
  }

  await act(async () => {
    traditionalChineseSelect.value = "zh-TW"
    traditionalChineseSelect.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
  })

  await vi.waitFor(async () => {
    const persistedSettings = await settingsRepository.getSettings()

    expect(persistedSettings.languageMode).toBe("zh-TW")
    expect(browserMockState.getStorageSetCalls()).toContainEqual(
      expect.objectContaining({
        languageMode: "zh-TW"
      })
    )
    expect(await browserMockState.getOperationalSettings()).toEqual(
      expect.objectContaining({
        languageMode: "zh-TW"
      })
    )
  })

  database.close()
})

it("opens the About and Viz-KDB pages from the Options hero actions", async () => {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode: "en"
  })

  vi.resetModules()
  const { OptionsPage } = await import("../../src/options/OptionsPage")

  const container = document.createElement("div")
  document.body.append(container)
  cleanupContainer = container

  const root = createRoot(container)
  cleanupRoot = root

  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(OptionsPage)))
    await flushI18nStartup()
  })

  const aboutButton = Array.from(container.querySelectorAll(".hero button")).find(
    (button) => button.textContent === "About"
  )
  const vizKdbButton = Array.from(container.querySelectorAll(".hero button")).find(
    (button) => button.textContent === "Viz-KDB"
  )

  if (!(aboutButton instanceof HTMLButtonElement)) {
    throw new Error("expected About button in options hero")
  }
  if (!(vizKdbButton instanceof HTMLButtonElement)) {
    throw new Error("expected Viz-KDB button in options hero")
  }

  await act(async () => {
    aboutButton.click()
    await Promise.resolve()
  })

  expect(browserMockState.getUrl).toHaveBeenCalledWith("about.html")
  expect(browserMockState.createTab).toHaveBeenCalledWith({
    url: "chrome-extension://test-extension/about.html"
  })

  await act(async () => {
    vizKdbButton.click()
    await Promise.resolve()
  })

  expect(browserMockState.getUrl).toHaveBeenCalledWith("viz-kdb.html")
  expect(browserMockState.createTab).toHaveBeenCalledWith({
    url: "chrome-extension://test-extension/viz-kdb.html"
  })

  database.close()
})
