// @vitest-environment jsdom
import "fake-indexeddb/auto"

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const browserMockState = vi.hoisted(() => {
  type StorageChangeListener = (
    changes: Record<string, { readonly newValue?: unknown; readonly oldValue?: unknown }>,
    areaName: string
  ) => void
  type TabsActivatedListener = (activeInfo: { readonly tabId: number; readonly windowId: number }) => void
  type TabsUpdatedListener = (
    tabId: number,
    changeInfo: { readonly status?: string; readonly url?: string },
    tab: { readonly active?: boolean; readonly id?: number; readonly url?: string }
  ) => void

  let latestAnalysisResult: unknown = null
  let analysisResultsByUrl: Record<string, unknown> = {}
  let activeTabUrl: string | null = null
  let browserLanguage = "en-US"
  const listeners = new Set<StorageChangeListener>()
  const activatedListeners = new Set<TabsActivatedListener>()
  const updatedListeners = new Set<TabsUpdatedListener>()
  const openOptionsPage = vi.fn(async () => undefined)
  const createTab = vi.fn(async () => undefined)
  const getUrl = vi.fn((path: string) => `chrome-extension://test-extension/${path}`)

  return {
    createTab,
    emitActiveTabUrl(nextUrl: string): void {
      activeTabUrl = nextUrl

      for (const listener of activatedListeners) {
        listener({ tabId: 1, windowId: 1 })
      }

      for (const listener of updatedListeners) {
        listener(
          1,
          {
            status: "complete",
            url: nextUrl
          },
          {
            active: true,
            id: 1,
            url: nextUrl
          }
        )
      }
    },
    emitAnalysisResultsByUrl(nextValue: Record<string, unknown>): void {
      const previousValue = analysisResultsByUrl
      analysisResultsByUrl = nextValue

      for (const listener of listeners) {
        listener(
          {
            analysisResultsByUrl: {
              oldValue: previousValue,
              newValue: nextValue
            }
          },
          "local"
        )
      }
    },
    emitLatestAnalysisResult(nextValue: unknown): void {
      const previousValue = latestAnalysisResult
      latestAnalysisResult = nextValue

      for (const listener of listeners) {
        listener(
          {
            latestAnalysisResult: {
              oldValue: previousValue ?? undefined,
              newValue: nextValue
            }
          },
          "local"
        )
      }
    },
    getLatestAnalysisResult(): unknown {
      return latestAnalysisResult
    },
    getActiveTabUrl(): string | null {
      return activeTabUrl
    },
    getAnalysisResultsByUrl(): Record<string, unknown> {
      return analysisResultsByUrl
    },
    getBrowserLanguage(): string {
      return browserLanguage
    },
    getUrl,
    openOptionsPage,
    reset(): void {
      latestAnalysisResult = null
      analysisResultsByUrl = {}
      activeTabUrl = null
      browserLanguage = "en-US"
      listeners.clear()
      activatedListeners.clear()
      updatedListeners.clear()
      openOptionsPage.mockClear()
      createTab.mockClear()
      getUrl.mockClear()
    },
    setBrowserLanguage(nextValue: string): void {
      browserLanguage = nextValue
    },
    subscribeTabActivated(listener: TabsActivatedListener): void {
      activatedListeners.add(listener)
    },
    subscribeTabUpdated(listener: TabsUpdatedListener): void {
      updatedListeners.add(listener)
    },
    subscribe(listener: StorageChangeListener): void {
      listeners.add(listener)
    },
    unsubscribeTabActivated(listener: TabsActivatedListener): void {
      activatedListeners.delete(listener)
    },
    unsubscribeTabUpdated(listener: TabsUpdatedListener): void {
      updatedListeners.delete(listener)
    },
    unsubscribe(listener: StorageChangeListener): void {
      listeners.delete(listener)
    }
  }
})

vi.mock("webextension-polyfill", () => {
  return {
    default: {
      i18n: {
        getUILanguage: vi.fn(() => browserMockState.getBrowserLanguage())
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            analysisResultsByUrl: browserMockState.getAnalysisResultsByUrl(),
            latestAnalysisResult: browserMockState.getLatestAnalysisResult() ?? undefined
          }))
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
        create: browserMockState.createTab,
        onActivated: {
          addListener: vi.fn((listener) => {
            browserMockState.subscribeTabActivated(listener)
          }),
          removeListener: vi.fn((listener) => {
            browserMockState.unsubscribeTabActivated(listener)
          })
        },
        onUpdated: {
          addListener: vi.fn((listener) => {
            browserMockState.subscribeTabUpdated(listener)
          }),
          removeListener: vi.fn((listener) => {
            browserMockState.unsubscribeTabUpdated(listener)
          })
        },
        query: vi.fn(async () => {
          const activeTabUrl = browserMockState.getActiveTabUrl()

          return activeTabUrl === null
            ? []
            : [
                {
                  active: true,
                  id: 1,
                  url: activeTabUrl
                }
              ]
        })
      },
      runtime: {
        getURL: browserMockState.getUrl,
        openOptionsPage: browserMockState.openOptionsPage
      }
    }
  }
})

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

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

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
})

describe("AnalysisPanel", () => {
  it("refreshes the visible analysis when latestAnalysisResult changes while the panel is open", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.emitActiveTabUrl("https://example.com/current-article")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Waiting for analysis")

    await act(async () => {
      browserMockState.emitLatestAnalysisResult({
        claims: [{ text: "新的 claim" }],
        duplicateClaims: [],
        novelClaims: ["新的 claim"],
        page: {
          canonicalUrl: "https://example.com/current-article",
          url: "https://example.com/current-article"
        },
        persisted: true,
        result: {
          duplicateScore: 0.2,
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: "result_live_update"
        },
        similarSources: [
          {
            similarity: 0.62,
            snippet: "历史相似片段",
            url: "https://example.com/source"
          }
        ]
      })
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Recommended: Read")
    expect(container.textContent).toContain("20%")
    expect(container.textContent).toContain("80%")
    expect(container.textContent).not.toContain("Duplication: 20%")
    expect(container.textContent).not.toContain("Novelty: 80%")
    expect(container.textContent).toContain("Saved to local knowledge base")
    expect(container.textContent).toContain("新的 claim")
    expect(container.textContent).toContain("历史相似片段")
    expect(container.textContent).toContain("62%")
    expect(container.textContent).not.toContain("Overlap: 62%")
    const scoreChips = Array.from(container.querySelectorAll("[data-tooltip]"))
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "Duplication: 20%")).toBe(true)
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "Novelty: 80%")).toBe(true)
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "Overlap: 62%")).toBe(true)
    const sourceLink = container.querySelector('a[href="https://example.com/source"]')
    expect(sourceLink?.textContent).toContain("https://example.com/source")
  })

  it("does not fall back to a stale latestAnalysisResult when the active tab is a non-http extension page", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.emitLatestAnalysisResult({
      claims: [{ text: "旧结果 claim" }],
      duplicateClaims: [],
      novelClaims: ["旧结果 claim"],
      persisted: true,
      result: {
        duplicateScore: 0.2,
        noveltyScore: 0.8,
        recommendation: "read",
        resultId: "result_stale_latest"
      },
      similarSources: []
    })
    browserMockState.emitActiveTabUrl(
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html"
    )

    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Waiting for analysis")
    expect(container.textContent).not.toContain("旧结果 claim")
    expect(container.textContent).not.toContain("Recommended: Read")
  })

  it("switches the visible analysis when the active tab url changes", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.emitAnalysisResultsByUrl({
      "https://example.com/article-a": {
        claims: [{ text: "A claim" }],
        duplicateClaims: [],
        novelClaims: ["A claim"],
        persisted: true,
        result: {
          duplicateScore: 0.2,
          noveltyScore: 0.8,
          recommendation: "read",
          resultId: "result_article_a"
        },
        similarSources: []
      },
      "https://example.com/article-b": {
        claims: [{ text: "B claim" }],
        duplicateClaims: ["B claim"],
        novelClaims: [],
        persisted: true,
        result: {
          duplicateScore: 0.9,
          noveltyScore: 0.1,
          recommendation: "skip",
          resultId: "result_article_b"
        },
        similarSources: []
      }
    })
    browserMockState.emitActiveTabUrl("https://example.com/article-a")

    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Recommended: Read")
    expect(container.textContent).toContain("A claim")

    await act(async () => {
      browserMockState.emitActiveTabUrl("https://example.com/article-b")
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Recommended: Skip")
    expect(container.textContent).toContain("B claim")
  })

  it("shows an insufficient-content message instead of duplicate and novelty scores", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.emitActiveTabUrl("https://example.com/too-short")
    browserMockState.emitLatestAnalysisResult({
      claims: [],
      duplicateClaims: [],
      judgement: "insufficient-content",
      novelClaims: [],
      page: {
        canonicalUrl: "https://example.com/too-short",
        url: "https://example.com/too-short"
      },
      persisted: true,
      result: {
        duplicateScore: 0,
        noveltyScore: 0,
        recommendation: "read",
        resultId: "result_insufficient"
      },
      similarSources: []
    })
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Not enough content to judge")
    expect(container.textContent).not.toContain("Duplication:")
    expect(container.textContent).not.toContain("Novelty:")
  })

  it("renders localized toolbar actions and empty-state copy in Traditional Chinese and wires navigation", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.setBrowserLanguage("zh-TW")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("設定")
    expect(container.textContent).toContain("關於")
    expect(container.textContent).toContain("Viz-KDB")
    expect(container.textContent).toContain("等待分析結果")

    const buttons = Array.from(container.querySelectorAll("button"))
    const optionsButton = buttons.find((button) => button.textContent === "設定")
    const aboutButton = buttons.find((button) => button.textContent === "關於")
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

  it("localizes side-panel section headings and feedback copy in Traditional Chinese", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.setBrowserLanguage("zh-TW")
    browserMockState.emitActiveTabUrl("https://example.com/article-c")
    browserMockState.emitLatestAnalysisResult({
      claims: [{ text: "C claim" }],
      duplicateClaims: ["重複 claim"],
      novelClaims: ["新增 claim"],
      page: {
        canonicalUrl: "https://example.com/article-c",
        url: "https://example.com/article-c"
      },
      persisted: true,
      result: {
        duplicateScore: 0.62,
        noveltyScore: 0.38,
        recommendation: "skim",
        resultId: "result_article_c"
      },
      similarSources: [
        {
          similarity: 0.62,
          snippet: "歷史相似片段",
          url: "https://example.com/source-c"
        }
      ]
    })

    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("新增資訊")
    expect(container.textContent).toContain("重複資訊")
    expect(container.textContent).toContain("相似來源")
    expect(container.textContent).toContain("62%")
    expect(container.textContent).not.toContain("重合度：62%")
    const scoreChips = Array.from(container.querySelectorAll("[data-tooltip]"))
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "重複度：62%")).toBe(true)
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "新增度：38%")).toBe(true)
    expect(scoreChips.some((node) => node.getAttribute("data-tooltip") === "重合度：62%")).toBe(true)
    expect(container.textContent).toContain("回饋")
  })

  it("renders platform-colored domain tags for similar sources", async () => {
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { AnalysisPanel } = await import("../../src/sidepanel/AnalysisPanel")
    browserMockState.emitActiveTabUrl("https://example.com/article-domain-tags")
    browserMockState.emitLatestAnalysisResult({
      claims: [{ text: "Domain tag claim" }],
      duplicateClaims: [],
      novelClaims: ["Domain tag claim"],
      page: {
        canonicalUrl: "https://example.com/article-domain-tags",
        url: "https://example.com/article-domain-tags"
      },
      persisted: true,
      result: {
        duplicateScore: 0.18,
        noveltyScore: 0.82,
        recommendation: "read",
        resultId: "result_domain_tags"
      },
      similarSources: [
        {
          similarity: 0.6,
          snippet: "Weibo source",
          url: "https://news.weibo.com/123/abc"
        },
        {
          similarity: 0.58,
          snippet: "X source",
          url: "https://x.com/dotey/status/1"
        },
        {
          similarity: 0.54,
          snippet: "Wechat source",
          url: "https://mp.weixin.qq.com/s/example"
        },
        {
          similarity: 0.5,
          snippet: "Other source",
          url: "https://example.com/source"
        }
      ]
    })

    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(AnalysisPanel)))
      await flushI18nStartup()
    })

    expect(
      container.querySelector(".similar-source-domain-tag.viz-kdb-stat-chip-weibo .viz-kdb-stat-chip-domain")
        ?.textContent
    ).toBe("news.weibo.com")
    expect(
      container.querySelector(".similar-source-domain-tag.viz-kdb-stat-chip-x .viz-kdb-stat-chip-domain")
        ?.textContent
    ).toBe("x.com")
    expect(
      container.querySelector(".similar-source-domain-tag.viz-kdb-stat-chip-wechat .viz-kdb-stat-chip-domain")
        ?.textContent
    ).toBe("mp.weixin.qq.com")
    expect(
      container.querySelector(".similar-source-domain-tag.viz-kdb-stat-chip-default .viz-kdb-stat-chip-domain")
        ?.textContent
    ).toBe("example.com")
  })
})
