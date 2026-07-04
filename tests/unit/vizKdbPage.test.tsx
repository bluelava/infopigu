// @vitest-environment jsdom
import "fake-indexeddb/auto"

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { translate } from "../../src/i18n/translate"
import type { DocumentId } from "../../src/shared/types"
import type { LanguageMode } from "../../src/shared/types"

const browserMockState = vi.hoisted(() => {
  let browserLanguage = "en-US"
  let operationalSettings: unknown = {
    themeMode: "light"
  }
  const openOptionsPage = vi.fn(async () => undefined)
  const createTab = vi.fn(async () => undefined)
  const getUrl = vi.fn((path: string) => `chrome-extension://test-extension/${path}`)

  return {
    createTab,
    getBrowserLanguage(): string {
      return browserLanguage
    },
    getOperationalSettings(): unknown {
      return operationalSettings
    },
    getUrl,
    openOptionsPage,
    reset(): void {
      browserLanguage = "en-US"
      operationalSettings = {
        themeMode: "light"
      }
      createTab.mockClear()
      getUrl.mockClear()
      openOptionsPage.mockClear()
    },
    setBrowserLanguage(nextValue: string): void {
      browserLanguage = nextValue
    },
    setOperationalSettings(nextValue: unknown): void {
      operationalSettings = nextValue
    }
  }
})

const vizKdbState = vi.hoisted(() => {
  let state: unknown = { kind: "loading" }

  return {
    getState(): unknown {
      return state
    },
    reset(): void {
      state = { kind: "loading" }
    },
    setState(nextValue: unknown): void {
      state = nextValue
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
          get: vi.fn(async () => ({
            operationalSettings: browserMockState.getOperationalSettings()
          })),
          set: vi.fn(async () => undefined)
        }
      },
      tabs: {
        create: browserMockState.createTab
      }
    }
  }
})

vi.mock("../../src/vizkdb/useVizKdbData", () => {
  return {
    useVizKdbData: () => vizKdbState.getState()
  }
})

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

function docId(value: string): DocumentId {
  return value as unknown as DocumentId
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
  vizKdbState.reset()
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

function buildReadyState() {
  return {
    kind: "ready" as const,
    model: {
      categories: [
        { id: "creator", label: "Creator", color: "#768ccf", count: 1 },
        { id: "finance", label: "Finance", color: "#b6694e", count: 1 }
      ],
      domains: [{ domain: "example.com", count: 2 }],
      edges: [
        {
          sourceId: docId("doc-alpha"),
          targetId: docId("doc-beta"),
          similarity: 0.74
        }
      ],
      namespace: "provider:model" as never,
      namespaceLabel: "provider:model",
      whitelistDomains: ["example.com"],
      nodes: [
        {
          docId: docId("doc-beta"),
          title: "Beta Article",
          url: "https://example.com/beta",
          canonicalUrl: "https://example.com/beta",
          domain: "example.com",
          duplicateScore: 0.61,
          noveltyScore: 0.39,
          recommendation: "skim",
          categoryId: "finance",
          categoryLabel: "Finance",
          categoryColor: "#b6694e",
          effectiveAt: 2_000,
          readAt: 2_000,
          savedAt: 2_100,
          claims: ["Beta claim"],
          neighbors: [
            {
              docId: docId("doc-alpha"),
              similarity: 0.74,
              relativeGain: 0.25
            }
          ]
        },
        {
          docId: docId("doc-alpha"),
          title: "Alpha Post",
          url: "https://example.com/alpha",
          canonicalUrl: "https://example.com/alpha",
          domain: "example.com",
          duplicateScore: 0.22,
          noveltyScore: 0.78,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 1_000,
          readAt: 1_000,
          savedAt: 1_100,
          claims: ["Alpha claim"],
          neighbors: [
            {
              docId: docId("doc-beta"),
              similarity: 0.74,
              relativeGain: 0.4
            }
          ]
        }
      ]
    }
  }
}

function buildTimelineHoverState() {
  return {
    kind: "ready" as const,
    model: {
      categories: [{ id: "creator", label: "Creator", color: "#768ccf", count: 3 }],
      domains: [{ domain: "example.com", count: 3 }],
      edges: [],
      namespace: "provider:model" as never,
      namespaceLabel: "provider:model",
      whitelistDomains: ["example.com"],
      nodes: [
        {
          docId: docId("doc-gamma"),
          title: "Gamma Note",
          url: "https://example.com/gamma",
          canonicalUrl: "https://example.com/gamma",
          domain: "example.com",
          duplicateScore: 0.18,
          noveltyScore: 0.82,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: Date.UTC(2026, 5, 30, 9, 30),
          readAt: Date.UTC(2026, 5, 30, 9, 30),
          savedAt: Date.UTC(2026, 5, 30, 9, 35),
          claims: ["Gamma claim"],
          neighbors: []
        },
        {
          docId: docId("doc-beta"),
          title: "Beta Article",
          url: "https://example.com/beta",
          canonicalUrl: "https://example.com/beta",
          domain: "example.com",
          duplicateScore: 0.31,
          noveltyScore: 0.69,
          recommendation: "skim",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: Date.UTC(2026, 5, 30, 7, 45),
          readAt: Date.UTC(2026, 5, 30, 7, 45),
          savedAt: Date.UTC(2026, 5, 30, 7, 50),
          claims: ["Beta claim"],
          neighbors: []
        },
        {
          docId: docId("doc-alpha"),
          title: "Alpha Post",
          url: "https://example.com/alpha",
          canonicalUrl: "https://example.com/alpha",
          domain: "example.com",
          duplicateScore: 0.22,
          noveltyScore: 0.78,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: Date.UTC(2026, 5, 28, 8, 0),
          readAt: Date.UTC(2026, 5, 28, 8, 0),
          savedAt: Date.UTC(2026, 5, 28, 8, 5),
          claims: ["Alpha claim"],
          neighbors: []
        }
      ]
    }
  }
}

function buildDomainStatsState() {
  return {
    kind: "ready" as const,
    model: {
      categories: [{ id: "creator", label: "Creator", color: "#768ccf", count: 4 }],
      domains: [
        { domain: "x.com", count: 2 },
        { domain: "weibo.com", count: 2 },
        { domain: "mp.weixin.qq.com", count: 1 }
      ],
      edges: [],
      namespace: "provider:model" as never,
      namespaceLabel: "provider:model",
      whitelistDomains: ["weibo.com", "x.com", "mp.weixin.qq.com"],
      nodes: [
        {
          docId: docId("doc-weibo"),
          title: "Weibo Post",
          url: "https://weibo.com/123/abc",
          canonicalUrl: "https://weibo.com/123/abc",
          domain: "weibo.com",
          duplicateScore: 0.22,
          noveltyScore: 0.78,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 1_000,
          readAt: 1_000,
          savedAt: 1_100,
          claims: ["Alpha claim"],
          neighbors: []
        },
        {
          docId: docId("doc-weibo-sub"),
          title: "Weibo Subdomain Post",
          url: "https://news.weibo.com/123/xyz",
          canonicalUrl: "https://news.weibo.com/123/xyz",
          domain: "news.weibo.com",
          duplicateScore: 0.2,
          noveltyScore: 0.8,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 1_500,
          readAt: 1_500,
          savedAt: 1_600,
          claims: ["Alpha sub claim"],
          neighbors: []
        },
        {
          docId: docId("doc-x-1"),
          title: "X Post 1",
          url: "https://x.com/dotey/status/1",
          canonicalUrl: "https://x.com/dotey/status/1",
          domain: "x.com",
          duplicateScore: 0.18,
          noveltyScore: 0.82,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 2_000,
          readAt: 2_000,
          savedAt: 2_100,
          claims: ["Beta claim"],
          neighbors: []
        },
        {
          docId: docId("doc-x-2"),
          title: "X Post 2",
          url: "https://x.com/dotey/status/2",
          canonicalUrl: "https://x.com/dotey/status/2",
          domain: "x.com",
          duplicateScore: 0.3,
          noveltyScore: 0.7,
          recommendation: "skim",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 3_000,
          readAt: 3_000,
          savedAt: 3_100,
          claims: ["Gamma claim"],
          neighbors: []
        },
        {
          docId: docId("doc-wechat"),
          title: "Wechat Post",
          url: "https://mp.weixin.qq.com/s/example",
          canonicalUrl: "https://mp.weixin.qq.com/s/example",
          domain: "mp.weixin.qq.com",
          duplicateScore: 0.12,
          noveltyScore: 0.88,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 4_000,
          readAt: 4_000,
          savedAt: 4_100,
          claims: ["Delta claim"],
          neighbors: []
        },
        {
          docId: docId("doc-other"),
          title: "Other Post",
          url: "https://not-whitelisted.example.com/post/1",
          canonicalUrl: "https://not-whitelisted.example.com/post/1",
          domain: "not-whitelisted.example.com",
          duplicateScore: 0.1,
          noveltyScore: 0.9,
          recommendation: "read",
          categoryId: "creator",
          categoryLabel: "Creator",
          categoryColor: "#768ccf",
          effectiveAt: 5_000,
          readAt: 5_000,
          savedAt: 5_100,
          claims: ["Ignored domain claim"],
          neighbors: []
        }
      ]
    }
  }
}

describe("VizKdbPage", () => {
  it("switches to timeline view, filters articles, and opens the detail drawer", async () => {
    vizKdbState.setState(buildReadyState())

    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Viz-KDB")
    expect(container.textContent).toContain("Saved articles")
    expect(container.textContent).toContain("Categories")
    expect(container.textContent).toContain("Embedding namespace")
    const graphLabels = Array.from(container.querySelectorAll(".viz-kdb-node-label")).map((label) =>
      label.textContent?.trim()
    )

    expect(graphLabels).toContain("Alpha Post")
    expect(graphLabels).toContain("Beta Article")

    const timelineButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Timeline")
    )

    if (!(timelineButton instanceof HTMLButtonElement)) {
      throw new Error("expected Timeline tab button")
    }

    await act(async () => {
      timelineButton.click()
      await Promise.resolve()
    })

    expect(container.querySelector(".viz-kdb-timeline-axis")).not.toBeNull()
    expect(container.querySelector(".viz-kdb-timeline-axis-origin")).not.toBeNull()
    expect(container.querySelector(".viz-kdb-timeline-axis-arrow")).not.toBeNull()
    expect(container.querySelectorAll(".viz-kdb-timeline-axis-label").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".viz-kdb-timeline-axis-mark").length).toBeGreaterThan(0)

    const betaButton = Array.from(container.querySelectorAll(".viz-kdb-timeline-item")).find((button) =>
      button.textContent?.includes("Beta Article")
    )

    if (!(betaButton instanceof HTMLButtonElement)) {
      throw new Error("expected Beta article button")
    }

    await act(async () => {
      betaButton.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Article details")
    expect(container.textContent).toContain("https://example.com/beta")
    expect(container.textContent).toContain("Alpha Post")
  })

  it("localizes the page title and category legend labels in Traditional Chinese", async () => {
    vizKdbState.setState(buildReadyState())
    vi.resetModules()
    vi.doMock("../../src/i18n/I18nContext", () => ({
      I18nProvider: ({ children }: { readonly children: unknown }) => children,
      useI18n: () => ({
        languageMode: "zh-TW" as LanguageMode,
        locale: "zh-TW",
        t: (messageId: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) =>
          translate("zh-TW", messageId, values)
      })
    }))

    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(VizKdbPage))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("知識庫")
    expect(container.textContent).toContain("財經")
    expect(container.textContent).toContain("內容創作")
    expect(container.textContent).not.toContain("Finance")
  })

  it("opens the options and about pages from the Viz-KDB top-right actions", async () => {
    vizKdbState.setState(buildReadyState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    const optionsButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Options"
    )
    const aboutButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "About"
    )

    if (!(optionsButton instanceof HTMLButtonElement)) {
      throw new Error("expected Options button in Viz-KDB hero")
    }
    if (!(aboutButton instanceof HTMLButtonElement)) {
      throw new Error("expected About button in Viz-KDB hero")
    }

    await act(async () => {
      optionsButton.click()
      await Promise.resolve()
    })

    expect(browserMockState.openOptionsPage).toHaveBeenCalledTimes(1)

    await act(async () => {
      aboutButton.click()
      await Promise.resolve()
    })

    expect(browserMockState.getUrl).toHaveBeenCalledWith("about.html")
    expect(browserMockState.createTab).toHaveBeenCalledWith({
      url: "chrome-extension://test-extension/about.html"
    })
  })

  it("renders graph and timeline switchers in the left sidebar", async () => {
    vizKdbState.setState(buildReadyState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    const sidebar = container.querySelector(".viz-kdb-sidebar")
    const stage = container.querySelector(".viz-kdb-stage")
    const tabs = container.querySelector(".viz-kdb-sidebar-tabs") as HTMLElement | null

    expect(sidebar).not.toBeNull()
    expect(stage).not.toBeNull()
    expect(sidebar?.textContent).toContain("Graph")
    expect(sidebar?.textContent).toContain("Timeline")
    expect((sidebar as HTMLElement | null)?.style.alignSelf).toBe("start")
    expect(tabs?.style.getPropertyValue("--viz-kdb-side-tab-height")).toBe("128px")
  })

  it("renders the graph view as a draggable 3D orbit stage by default", async () => {
    vizKdbState.setState(buildReadyState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    const graphStage = container.querySelector(".viz-kdb-graph-stage") as HTMLElement | null
    const orbitLayer = container.querySelector(".viz-kdb-graph-orbit-layer") as HTMLElement | null
    const nodeGroups = Array.from(container.querySelectorAll(".viz-kdb-node"))

    expect(graphStage?.getAttribute("data-graph-mode")).toBe("3d")
    expect(graphStage?.getAttribute("data-orbiting")).toBe("true")
    expect(orbitLayer).not.toBeNull()
    expect(nodeGroups.length).toBeGreaterThan(0)
    expect(nodeGroups[0]?.getAttribute("style")).toContain("--viz-kdb-depth")
  })

  it("uses platform colors for graph nodes and timeline accents", async () => {
    vizKdbState.setState(buildDomainStatsState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    const graphNodeCircles = Array.from(container.querySelectorAll(".viz-kdb-node circle"))
    const graphNodeFills = graphNodeCircles.map((node) => node.getAttribute("fill"))

    expect(graphNodeFills).toContain("#b53030")
    expect(graphNodeFills).toContain("#111111")
    expect(graphNodeFills).toContain("#2f7d56")
    expect(graphNodeFills).toContain("#6843aa")

    const timelineButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Timeline")
    )

    if (!(timelineButton instanceof HTMLButtonElement)) {
      throw new Error("expected Timeline tab button")
    }

    await act(async () => {
      timelineButton.click()
      await Promise.resolve()
    })

    const axisMarks = Array.from(container.querySelectorAll(".viz-kdb-timeline-axis-mark")) as HTMLElement[]
    const timelineItems = Array.from(container.querySelectorAll(".viz-kdb-timeline-item")) as HTMLElement[]
    const accentValues = timelineItems.map((item) =>
      item.style.getPropertyValue("--viz-kdb-timeline-item-accent")
    )
    const markValues = axisMarks.map((mark) =>
      mark.style.getPropertyValue("--viz-kdb-timeline-mark-color")
    )

    expect(accentValues).toContain("#b53030")
    expect(accentValues).toContain("#111111")
    expect(accentValues).toContain("#2f7d56")
    expect(accentValues).toContain("#6843aa")
    expect(markValues).toContain("#b53030")
    expect(markValues).toContain("#111111")
    expect(markValues).toContain("#2f7d56")
    expect(markValues).toContain("#6843aa")
  })

  it("uses count-scaled timeline marks and bucket hover highlighting", async () => {
    vizKdbState.setState(buildTimelineHoverState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    const timelineButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Timeline")
    )

    if (!(timelineButton instanceof HTMLButtonElement)) {
      throw new Error("expected Timeline tab button")
    }

    await act(async () => {
      timelineButton.click()
      await Promise.resolve()
    })

    const marks = Array.from(container.querySelectorAll(".viz-kdb-timeline-axis-mark"))
    expect(marks.length).toBe(3)
    expect(marks[0]?.getAttribute("data-article-count")).toBe("2")
    expect(marks[1]?.getAttribute("data-article-count")).toBe("2")
    expect(marks[2]?.getAttribute("data-article-count")).toBe("1")
    expect((marks[0] as HTMLElement | undefined)?.style.width).toBe("12px")
    expect((marks[2] as HTMLElement | undefined)?.style.width).toBe("8px")

    await act(async () => {
      marks[0]?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
      await Promise.resolve()
    })

    const activeItems = Array.from(container.querySelectorAll(".viz-kdb-timeline-item-bucket-active"))
    const activeConnectors = Array.from(
      container.querySelectorAll(".viz-kdb-timeline-connector-active")
    ) as HTMLElement[]
    expect(activeItems.length).toBe(2)
    expect(activeConnectors.length).toBe(2)
    expect(activeConnectors[0]?.style.getPropertyValue("--viz-kdb-timeline-connector-active-scale"))
      .not.toBe("")
    expect(activeItems.some((item) => item.textContent?.includes("Gamma Note"))).toBe(true)
    expect(activeItems.some((item) => item.textContent?.includes("Beta Article"))).toBe(true)
    expect(activeItems.some((item) => item.textContent?.includes("Alpha Post"))).toBe(false)

    const gammaItem = Array.from(container.querySelectorAll(".viz-kdb-timeline-item")).find((item) =>
      item.textContent?.includes("Gamma Note")
    )

    if (!(gammaItem instanceof HTMLButtonElement)) {
      throw new Error("expected Gamma Note timeline item button")
    }

    await act(async () => {
      gammaItem.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
      await Promise.resolve()
    })

    const hoveredItems = Array.from(container.querySelectorAll(".viz-kdb-timeline-item-hovered"))
    expect(hoveredItems).toHaveLength(1)
    expect(hoveredItems[0]?.textContent).toContain("Gamma Note")

    const bucketActiveItemsAfterCardHover = Array.from(
      container.querySelectorAll(".viz-kdb-timeline-item-bucket-active")
    )
    expect(bucketActiveItemsAfterCardHover).toHaveLength(2)
    expect(bucketActiveItemsAfterCardHover.some((item) => item.textContent?.includes("Gamma Note"))).toBe(true)
    expect(bucketActiveItemsAfterCardHover.some((item) => item.textContent?.includes("Beta Article"))).toBe(true)
  })

  it("renders domain-level stats for saved sources", async () => {
    vizKdbState.setState(buildDomainStatsState())

    vi.resetModules()
    vi.doUnmock("../../src/i18n/I18nContext")
    const { I18nProvider } = await import("../../src/i18n/I18nContext")
    const { VizKdbPage } = await import("../../src/vizkdb/VizKdbPage")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(VizKdbPage)))
      await flushI18nStartup()
    })

    expect(container.textContent).toContain("Domains")
    expect(container.textContent).toContain("weibo.com")
    expect(container.textContent).toContain("x.com")
    expect(container.textContent).toContain("mp.weixin.qq.com")
    expect(container.textContent).toContain("2")
    expect(container.textContent).not.toContain("news.weibo.com")
    expect(container.textContent).not.toContain("not-whitelisted.example.com")
    expect(container.querySelectorAll(".viz-kdb-stat-chip-domain").length).toBeGreaterThan(0)
    expect(container.querySelector(".viz-kdb-stat-chip-weibo .viz-kdb-stat-chip-domain")?.textContent).toBe("weibo.com")
    expect(container.querySelector(".viz-kdb-stat-chip-x .viz-kdb-stat-chip-domain")?.textContent).toBe("x.com")
    expect(container.querySelector(".viz-kdb-stat-chip-wechat .viz-kdb-stat-chip-domain")?.textContent).toBe("mp.weixin.qq.com")
  })
})
