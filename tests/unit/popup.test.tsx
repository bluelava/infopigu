// @vitest-environment jsdom
import "fake-indexeddb/auto"

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createSettingsRepository } from "../../src/db/settingsRepo"
import { DEFAULT_SETTINGS } from "../../src/shared/types"

const browserMockState = vi.hoisted(() => {
  let browserLanguage = "en-US"
  const openOptionsPage = vi.fn(async () => undefined)
  const createTab = vi.fn(async () => undefined)
  const getUrl = vi.fn((path: string) => `chrome-extension://test-extension/${path}`)

  return {
    getBrowserLanguage() {
      return browserLanguage
    },
    createTab,
    getStorageSnapshot() {
      return {
        operationalSettings: {
          languageMode: "auto"
        }
      }
    },
    getUrl,
    openOptionsPage,
    reset(): void {
      browserLanguage = "en-US"
      openOptionsPage.mockClear()
      createTab.mockClear()
      getUrl.mockClear()
    },
    setBrowserLanguage(nextLanguage: string): void {
      browserLanguage = nextLanguage
    }
  }
})

vi.mock("webextension-polyfill", () => {
  return {
    default: {
      i18n: {
        getUILanguage: vi.fn(() => browserMockState.getBrowserLanguage())
      },
      runtime: {
        getURL: browserMockState.getUrl,
        openOptionsPage: browserMockState.openOptionsPage
      },
      storage: {
        local: {
          get: vi.fn(async () => browserMockState.getStorageSnapshot())
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn()
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

async function seedLanguageMode(languageMode: "auto" | "zh-CN" | "zh-TW" | "en"): Promise<void> {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  await settingsRepository.saveSettings({
    ...DEFAULT_SETTINGS,
    languageMode
  })
  database.close()
}

async function flushI18nStartup(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

beforeEach(() => {
  browserMockState.reset()
  vi.resetModules()
})

afterEach(async () => {
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

describe("Popup", () => {
  it("renders popup summary text in English without mixed Simplified Chinese labels", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { Popup } = await import("../../src/popup/Popup")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(Popup)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Whitelisted domains: 0")
    expect(container.textContent).toContain("Saved documents: 0")
    expect(container.textContent).toContain("Current mode: Single Auto / Feed Manual")
    expect(container.textContent).not.toContain("白名单域名")
  })

  it("renders popup summary text in Traditional Chinese when zh-TW is persisted", async () => {
    browserMockState.setBrowserLanguage("zh-TW")
    await seedLanguageMode("zh-TW")

    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { Popup } = await import("../../src/popup/Popup")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(Popup)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("白名單網域：0")
    expect(container.textContent).toContain("已儲存文件：0")
    expect(container.textContent).toContain("目前模式：單篇自動 / 資訊流手動")
    expect(container.textContent).not.toContain("白名单域名")
  })

  it("renders options, about, and Viz-KDB actions in the popup", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { Popup } = await import("../../src/popup/Popup")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(Popup)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Options")
    expect(container.textContent).toContain("About")
    expect(container.textContent).toContain("Viz-KDB")
  })

  it("opens the options, about, and Viz-KDB pages from popup actions", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { Popup } = await import("../../src/popup/Popup")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(Popup)))
      await flushI18nStartup()
    })

    const buttons = Array.from(container.querySelectorAll("button"))
    const optionsButton = buttons.find((button) => button.textContent === "Options")
    const aboutButton = buttons.find((button) => button.textContent === "About")
    const vizKdbButton = buttons.find((button) => button.textContent === "Viz-KDB")

    expect(optionsButton).toBeDefined()
    expect(aboutButton).toBeDefined()
    expect(vizKdbButton).toBeDefined()

    await act(async () => {
      optionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(browserMockState.openOptionsPage).toHaveBeenCalledTimes(1)

    await act(async () => {
      aboutButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(browserMockState.getUrl).toHaveBeenCalledWith("about.html")
    expect(browserMockState.createTab).toHaveBeenCalledWith({
      url: "chrome-extension://test-extension/about.html"
    })

    await act(async () => {
      vizKdbButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(browserMockState.getUrl).toHaveBeenCalledWith("viz-kdb.html")
    expect(browserMockState.createTab).toHaveBeenCalledWith({
      url: "chrome-extension://test-extension/viz-kdb.html"
    })
  })
})
