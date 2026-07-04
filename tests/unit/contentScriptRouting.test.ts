// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { createDocumentId, type ExtractedDocument } from "../../src/shared/types"
import {
  decideBootstrapPlan,
  shouldCreateArticleMarker
} from "../../src/content/contentRouting"
import {
  bootstrapContentPageWithDeps,
  buildBootstrapState,
  type OperationalSettings,
  resolveOperationalSettings,
  runBootstrapPass
} from "../../src/content/contentBootstrap"
import { isPageReadyForRead } from "../../src/content/readinessGate"
import { startArticlePrecheckFlow } from "../../src/content/articlePrecheckFlow"
import { observeUrlChanges, startContentScript } from "../../src/content/contentEntrypoint"
import type { PageSignal } from "../../src/content/contentEntrypoint"

function makeExtractedDocumentFixture(
  overrides: Partial<ExtractedDocument> = {}
): ExtractedDocument {
  return {
    docId: createDocumentId("doc_fixture"),
    url: "https://weibo.com/fixture",
    canonicalUrl: "https://weibo.com/fixture",
    domain: "weibo.com",
    title: "默认标题",
    blocks: [{ type: "paragraph", text: "默认正文" }],
    extractor: "weibo-article",
    ...overrides
  }
}

function makeOperationalSettings(
  overrides: Partial<OperationalSettings> = {}
): OperationalSettings {
  return {
    autoAnalyzeEnabled: true,
    debugLoggingEnabled: true,
    dwellThresholdSeconds: 20,
    novelClaimsOverlaySeconds: 5,
    novelClaimsOverlayMaxVisible: 5,
    feedItemReadMode: "manual",
    singleArticleReadMode: "auto",
    ...overrides
  }
}

function makeBootstrapStateFixture() {
  return {
    needsContentRetry: false,
    shouldBootstrapArticle: false,
    shouldBootstrapFeed: false,
    shouldShowManualFallback: false
  } as const
}

function makeStatusMarkerStub() {
  return {
    setStatus: vi.fn(),
    setState: vi.fn()
  }
}

function makePlatformDeps() {
  return {
    extractArxivArticleDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractGenericArticleDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractGithubRepoDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractWechatDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractWeiboArticleDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractWeiboFeedDocumentFromElement: vi.fn<(element: Element) => ExtractedDocument | null>(
      () => null
    ),
    findWeiboFeedItemsFromMutations: vi.fn<(records: readonly MutationRecord[]) => readonly Element[]>(
      () => []
    ),
    findWeiboFeedItemElements: vi.fn<() => readonly Element[]>(() => [document.createElement("article")]),
    extractXArticleDocument: vi.fn<() => ExtractedDocument | null>(() => null),
    extractXFeedDocumentFromElement: vi.fn<(element: Element) => ExtractedDocument | null>(() => null),
    findXFeedItemsFromMutations: vi.fn<(records: readonly MutationRecord[]) => readonly Element[]>(() => []),
    findXFeedItemElements: vi.fn<() => readonly Element[]>(() => [document.createElement("article")])
  }
}

function makeStartArticlePrecheckFlowStub() {
  return vi.fn(async () => undefined)
}

function makeNoopUrlObserver() {
  return vi.fn(() => ({
    disconnect: () => undefined
  }))
}

describe("content bootstrap routing", () => {
  it("routes weibo-article pages to article bootstrap only", () => {
    expect(
      decideBootstrapPlan({
        pageKind: "weibo-article",
        autoAnalyzeEnabled: true,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      })
    ).toEqual({
      shouldBootstrapArticle: true,
      shouldBootstrapFeed: false,
      shouldShowManualFallback: true
    })
  })

  it("disables auto startup in manual mode while keeping manual fallback visible", () => {
    expect(
      decideBootstrapPlan({
        pageKind: "weibo-article",
        autoAnalyzeEnabled: true,
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      })
    ).toEqual({
      shouldBootstrapArticle: false,
      shouldBootstrapFeed: false,
      shouldShowManualFallback: true
    })
  })

  it("disables auto startup when auto analysis is off", () => {
    expect(
      decideBootstrapPlan({
        pageKind: "weibo-feed",
        autoAnalyzeEnabled: false,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      }).shouldBootstrapFeed
    ).toBe(false)
  })

  it("routes weibo-feed pages to feed bootstrap only", () => {
    expect(
      decideBootstrapPlan({
        pageKind: "weibo-feed",
        autoAnalyzeEnabled: true,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      }).shouldBootstrapFeed
    ).toBe(true)
  })

  it("treats article and feed readiness as ready once DOM is interactive and target detection succeeds", () => {
    expect(
      isPageReadyForRead({
        articleDocument: makeExtractedDocumentFixture(),
        documentReadyState: "interactive",
        feedItems: [],
        pageKind: "weibo-article"
      })
    ).toBe(true)

    expect(
      isPageReadyForRead({
        articleDocument: null,
        documentReadyState: "interactive",
        feedItems: [],
        pageKind: "weibo-feed"
      })
    ).toBe(false)

    expect(
      isPageReadyForRead({
        articleDocument: null,
        documentReadyState: "interactive",
        feedItems: [document.createElement("article")],
        pageKind: "weibo-feed"
      })
    ).toBe(true)
  })

  it("bootstrap state for weibo-article does not start feed scanning", () => {
    const state = buildBootstrapState({
      documentReadyState: "complete",
      pageKind: "weibo-article",
      settings: makeOperationalSettings(),
      extractedDocument: null,
      feedItems: [document.createElement("article")]
    })

    expect(state.shouldBootstrapArticle).toBe(false)
    expect(state.needsContentRetry).toBe(true)
    expect(state.shouldBootstrapFeed).toBe(false)
    expect(state.shouldShowManualFallback).toBe(true)
  })

  it("bootstrap state for weibo-feed arms feed markers before the page is fully ready", () => {
    const state = buildBootstrapState({
      documentReadyState: "interactive",
      pageKind: "weibo-feed",
      settings: makeOperationalSettings({
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      }),
      extractedDocument: null,
      feedItems: [document.createElement("article")]
    })

    expect(state.shouldBootstrapArticle).toBe(false)
    expect(state.needsContentRetry).toBe(false)
    expect(state.shouldBootstrapFeed).toBe(true)
    expect(state.shouldShowManualFallback).toBe(false)
  })

  it("still creates the article marker when site extraction returns null", () => {
    expect(
      shouldCreateArticleMarker({
        extractedDocument: null,
        pageKind: "weibo-article"
      })
    ).toBe(true)
  })

  it("runBootstrapPass creates the article marker when weibo extraction returns null", async () => {
    let onManualRead: (() => void) | null = null
    const startArticlePrecheckFlow = vi.fn()
    const createFloatingMarker = vi.fn((callback: () => void) => {
      onManualRead = callback
      return makeStatusMarkerStub()
    })
    const extractSelectedDocument = vi.fn(() =>
      makeExtractedDocumentFixture({
        title: "选中文本",
        blocks: [{ type: "paragraph", text: "选中文本" }],
        extractor: "manual-selection"
      })
    )

    await runBootstrapPass({
      pageKind: "weibo-article",
      settings: makeOperationalSettings({ singleArticleReadMode: "manual" }),
      articleDocument: null,
      feedItems: [],
      deps: {
        createFloatingMarker,
        analyzeDocument: vi.fn(),
        extractSelectedDocument,
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        startArticlePrecheckFlow
      }
    })

    const manualRead =
      onManualRead ??
      (() => {
        throw new Error("expected manual callback")
      })
    manualRead()

    expect(createFloatingMarker).toHaveBeenCalledTimes(1)
    expect(extractSelectedDocument).toHaveBeenCalledTimes(1)
    expect(startArticlePrecheckFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ extractor: "manual-selection" }),
        manualTrigger: true
      })
    )
  })

  it("runBootstrapPass owns the article marker initial state", async () => {
    const setStatus = vi.fn()

    await runBootstrapPass({
      pageKind: "weibo-article",
      settings: makeOperationalSettings({ singleArticleReadMode: "manual" }),
      articleDocument: null,
      feedItems: [],
      deps: {
        createFloatingMarker: vi.fn(() => ({
          setStatus,
          setState: vi.fn()
        })),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        startArticlePrecheckFlow: makeStartArticlePrecheckFlowStub()
      }
    })

    expect(setStatus).toHaveBeenCalledWith("手动模式")
  })

  it("bootstrapContentPageWithDeps routes weibo-article pages away from feed startup", async () => {
    const bootstrapFeedTracking = vi.fn()

    await bootstrapContentPageWithDeps({
      getSettings: async () => makeOperationalSettings(),
      classifyPageKind: () => "weibo-article",
      platformDeps: makePlatformDeps(),
      runBootstrapPass,
      deps: {
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        startArticlePrecheckFlow: makeStartArticlePrecheckFlowStub()
      }
    })

    expect(bootstrapFeedTracking).not.toHaveBeenCalled()
  })

  it("bootstrapContentPageWithDeps keeps feed tracking enabled in manual feed mode", async () => {
    const bootstrapArticleTracking = vi.fn()
    const bootstrapFeedTracking = vi.fn()
    const platformDeps = makePlatformDeps()

    await bootstrapContentPageWithDeps({
      getSettings: async () =>
        makeOperationalSettings({
          singleArticleReadMode: "manual",
          feedItemReadMode: "manual"
        }),
      classifyPageKind: () => "weibo-feed",
      platformDeps,
      runBootstrapPass,
      deps: {
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking,
        bootstrapFeedTracking,
        startArticlePrecheckFlow: makeStartArticlePrecheckFlowStub()
      }
    })

    expect(bootstrapArticleTracking).not.toHaveBeenCalled()
    expect(bootstrapFeedTracking).toHaveBeenCalledTimes(1)
    expect(platformDeps.findWeiboFeedItemElements).toHaveBeenCalledTimes(1)
  })

  it("bootstrapContentPageWithDeps routes x article pages through the x extractor", async () => {
    const platformDeps = makePlatformDeps()
    const articleDocument = makeExtractedDocumentFixture({
      url: "https://x.com/dotey/status/2059729329119006928",
      canonicalUrl: "https://x.com/dotey/status/2059729329119006928",
      domain: "x.com",
      extractor: "x-article"
    })
    platformDeps.extractXArticleDocument.mockReturnValue(articleDocument)
    const startArticlePrecheckFlow = vi.fn()

    await bootstrapContentPageWithDeps({
      getSettings: async () => makeOperationalSettings(),
      classifyPageKind: () => "x-article",
      platformDeps,
      runBootstrapPass,
      deps: {
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        startArticlePrecheckFlow
      }
    })

    expect(platformDeps.extractXArticleDocument).toHaveBeenCalledTimes(1)
    expect(startArticlePrecheckFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        document: articleDocument
      })
    )
  })

  it("resolveOperationalSettings prefers stored settings and falls back to runtime settings", async () => {
    const storedSettings = makeOperationalSettings()
    const requestRuntimeSettings = vi.fn(async () =>
      makeOperationalSettings({
        autoAnalyzeEnabled: false,
        dwellThresholdSeconds: 99,
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      })
    )

    await expect(
      resolveOperationalSettings({
        getStoredSettings: async () => storedSettings,
        requestRuntimeSettings
      })
    ).resolves.toEqual(storedSettings)
    expect(requestRuntimeSettings).not.toHaveBeenCalled()

    await expect(
      resolveOperationalSettings({
        getStoredSettings: async () => null,
        requestRuntimeSettings: vi.fn(async () => storedSettings)
      })
    ).resolves.toEqual(storedSettings)
  })

  it("resolveOperationalSettings fills missing overlay settings from defaults for older stored payloads", async () => {
    await expect(
      resolveOperationalSettings({
        getStoredSettings: async () =>
          ({
            autoAnalyzeEnabled: true,
            debugLoggingEnabled: true,
            dwellThresholdSeconds: 12,
            singleArticleReadMode: "auto",
            feedItemReadMode: "manual"
          }) as OperationalSettings,
        requestRuntimeSettings: vi.fn(async () => makeOperationalSettings())
      })
    ).resolves.toEqual(
      expect.objectContaining({
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 12,
        novelClaimsOverlaySeconds: 5,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      })
    )
  })

  it("startContentScript skips bootstrap entirely on non-whitelisted sites", async () => {
    const bootstrapContentPageWithDeps = vi.fn(async () => makeBootstrapStateFixture())
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const observeUrlChanges = vi.fn(() => ({
      disconnect: () => undefined
    }))

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      isSiteEnabled: async () => false,
      observeUrlChanges,
      requestRuntimeSettings
    })

    expect(requestRuntimeSettings).not.toHaveBeenCalled()
    expect(observeUrlChanges).not.toHaveBeenCalled()
    expect(bootstrapContentPageWithDeps).not.toHaveBeenCalled()
  })

  it("runBootstrapPass does not start feed tracking on weibo-article pages", async () => {
    const bootstrapFeedTracking = vi.fn()

    await runBootstrapPass({
      pageKind: "weibo-article",
      settings: makeOperationalSettings(),
      articleDocument: null,
      feedItems: [document.createElement("article")],
      deps: {
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        startArticlePrecheckFlow: makeStartArticlePrecheckFlowStub()
      }
    })

    expect(bootstrapFeedTracking).not.toHaveBeenCalled()
  })

  it("manual callback falls back to the extracted article when selection is empty", async () => {
    let onManualRead: (() => void) | null = null
    const articleDocument = makeExtractedDocumentFixture({
      title: "文章正文",
      blocks: [{ type: "paragraph", text: "文章正文" }],
      extractor: "weibo-article"
    })
    const startArticlePrecheckFlow = vi.fn()

    await runBootstrapPass({
      pageKind: "weibo-article",
      settings: makeOperationalSettings({ singleArticleReadMode: "manual" }),
      articleDocument,
      feedItems: [],
      deps: {
        createFloatingMarker: vi.fn((callback: () => void) => {
          onManualRead = callback
          return makeStatusMarkerStub()
        }),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        startArticlePrecheckFlow
      }
    })

    const manualRead =
      onManualRead ??
      (() => {
        throw new Error("expected manual callback")
      })
    manualRead()

    expect(startArticlePrecheckFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        document: articleDocument,
        manualTrigger: true
      })
    )
  })

  it("retry callback falls back to the extracted article and reruns precheck without manual mode", async () => {
    let onRetryAnalysis: (() => void) | null = null
    const articleDocument = makeExtractedDocumentFixture({
      title: "文章正文",
      blocks: [{ type: "paragraph", text: "文章正文" }],
      extractor: "weibo-article"
    })
    const startArticlePrecheckFlow = vi.fn()

    await runBootstrapPass({
      pageKind: "weibo-article",
      settings: makeOperationalSettings({ singleArticleReadMode: "manual" }),
      articleDocument,
      feedItems: [],
      deps: {
        createFloatingMarker: vi.fn((_onManualRead: () => void, callback?: () => void) => {
          onRetryAnalysis = callback ?? null
          return makeStatusMarkerStub()
        }),
        analyzeDocument: vi.fn(),
        extractSelectedDocument: vi.fn(() => null),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        startArticlePrecheckFlow
      }
    })

    const retryAnalysis =
      onRetryAnalysis ??
      (() => {
        throw new Error("expected retry callback")
      })
    retryAnalysis()

    expect(startArticlePrecheckFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        document: articleDocument
      })
    )
    expect(startArticlePrecheckFlow).not.toHaveBeenCalledWith(
      expect.objectContaining({
        manualTrigger: true
      })
    )
  })

  it("startContentScript resolves settings and passes the real bootstrap deps before delegating", async () => {
    const bootstrapContentPageWithDeps = vi.fn(async () => makeBootstrapStateFixture())
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: makeNoopUrlObserver(),
      requestRuntimeSettings
    })

    expect(requestRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)
    expect(bootstrapContentPageWithDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        classifyPageKind: expect.any(Function),
        getSettings: expect.any(Function),
        platformDeps: expect.objectContaining({
          extractArxivArticleDocument: expect.any(Function),
          extractGenericArticleDocument: expect.any(Function),
          extractGithubRepoDocument: expect.any(Function),
          extractWechatDocument: expect.any(Function),
          extractWeiboArticleDocument: expect.any(Function),
          extractXArticleDocument: expect.any(Function),
          findWeiboFeedItemElements: expect.any(Function),
          findXFeedItemElements: expect.any(Function)
        })
      })
    )
  })

  it("startContentScript prefers stored settings before delegating", async () => {
    const bootstrapContentPageWithDeps = vi.fn(async () => makeBootstrapStateFixture())
    const requestRuntimeSettings = vi.fn(async () =>
      makeOperationalSettings({
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      })
    )
    const storedSettings = makeOperationalSettings({ dwellThresholdSeconds: 7 })

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => storedSettings,
      observeUrlChanges: makeNoopUrlObserver(),
      requestRuntimeSettings
    })

    expect(requestRuntimeSettings).not.toHaveBeenCalled()
    expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)
  })

  it("startContentScript reruns bootstrap when the current page url changes", async () => {
    const bootstrapContentPageWithDeps = vi.fn(async () => makeBootstrapStateFixture())
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const urlChangeNotifier = {
      current: null as ((signal: PageSignal) => void) | null
    }

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: (onChange) => {
        urlChangeNotifier.current = onChange
        return {
          disconnect: () => undefined
        }
      },
      requestRuntimeSettings
    })

    expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)

    urlChangeNotifier.current?.({ hrefChanged: true })
    await vi.waitFor(() => {
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })
  })

  it("observeUrlChanges still detects navigation when page code bypasses the content-script history patch", async () => {
    const originalPushState = window.history.pushState
    const onUrlChange = vi.fn()
    const controller = observeUrlChanges(onUrlChange)
    const nextUrl = `${window.location.origin}/next`

    originalPushState.call(window.history, {}, "", nextUrl)
    document.body.append(document.createElement("div"))

    await vi.waitFor(() => {
      expect(onUrlChange).toHaveBeenCalledTimes(1)
    })

    controller.disconnect()
  })

  it("startContentScript clears previous page state before rerunning bootstrap on url changes", async () => {
    const bootstrapContentPageWithDeps = vi
      .fn()
      .mockResolvedValueOnce(makeBootstrapStateFixture())
      .mockResolvedValueOnce(makeBootstrapStateFixture())
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const beforeBootstrapPass = vi.fn()
    const urlChangeNotifier = {
      current: null as ((signal: PageSignal) => void) | null
    }

    await startContentScript({
      beforeBootstrapPass,
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: (onChange) => {
        urlChangeNotifier.current = onChange
        return {
          disconnect: () => undefined
        }
      },
      requestRuntimeSettings
    })

    expect(beforeBootstrapPass).toHaveBeenCalledTimes(1)

    urlChangeNotifier.current?.({ hrefChanged: true })
    await vi.waitFor(() => {
      expect(beforeBootstrapPass).toHaveBeenCalledTimes(2)
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })
  })

  it("startContentScript retries the same page when auto mode initially cannot extract the article", async () => {
    const bootstrapContentPageWithDeps = vi
      .fn()
      .mockResolvedValueOnce({
        needsContentRetry: true,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
      .mockResolvedValueOnce({
        needsContentRetry: false,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const signalHandler = {
      current: null as ((signal: PageSignal) => void) | null
    }
    const secondPassResolver = {
      current: null as (() => void) | null
    }

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: (callback) => {
        signalHandler.current = callback
        return {
          disconnect: () => undefined
        }
      },
      requestRuntimeSettings
    })

    expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)

    signalHandler.current?.({ hrefChanged: false })
    await vi.waitFor(() => {
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })
  })

  it("startContentScript retries an initially unsupported single-article page when later DOM signals arrive", async () => {
    const bootstrapContentPageWithDeps = vi
      .fn()
      .mockResolvedValueOnce(makeBootstrapStateFixture())
      .mockResolvedValueOnce({
        needsContentRetry: false,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const signalHandler = {
      current: null as ((signal: PageSignal) => void) | null
    }

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: (callback) => {
        signalHandler.current = callback
        return {
          disconnect: () => undefined
        }
      },
      requestRuntimeSettings
    })

    expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)

    signalHandler.current?.({ hrefChanged: false })
    await vi.waitFor(() => {
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })
  })

  it("automatically retries an initially inert single-article page until article bootstrap becomes available", async () => {
    vi.useFakeTimers()
    const bootstrapContentPageWithDeps = vi
      .fn()
      .mockResolvedValueOnce(makeBootstrapStateFixture())
      .mockResolvedValueOnce({
        needsContentRetry: false,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())

    try {
      await startContentScript({
        bootstrapContentPageWithDeps,
        getStoredSettings: async () => null,
        observeUrlChanges: makeNoopUrlObserver(),
        requestRuntimeSettings
      })

      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(1)

      await vi.runOnlyPendingTimersAsync()

      await vi.waitFor(() => {
        expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not queue an extra same-page bootstrap when retry mode receives DOM signals during an in-flight successful pass", async () => {
    let resolveSecondPass: (() => void) | null = null
    const bootstrapContentPageWithDeps = vi
      .fn()
      .mockResolvedValueOnce({
        needsContentRetry: true,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            secondPassResolver.current = () =>
              resolve({
                needsContentRetry: false,
                shouldBootstrapArticle: true,
                shouldBootstrapFeed: false,
                shouldShowManualFallback: true
              })
          })
      )
      .mockResolvedValue({
        needsContentRetry: false,
        shouldBootstrapArticle: true,
        shouldBootstrapFeed: false,
        shouldShowManualFallback: true
      })
    const requestRuntimeSettings = vi.fn(async () => makeOperationalSettings())
    const secondPassResolver = {
      current: null as (() => void) | null
    }
    const signalHandler = {
      current: null as ((signal: PageSignal) => void) | null
    }

    await startContentScript({
      bootstrapContentPageWithDeps,
      getStoredSettings: async () => null,
      observeUrlChanges: (callback) => {
        signalHandler.current = callback
        return {
          disconnect: () => undefined
        }
      },
      requestRuntimeSettings
    })

    signalHandler.current?.({ hrefChanged: false })

    await vi.waitFor(() => {
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })

    signalHandler.current?.({ hrefChanged: false })
    secondPassResolver.current?.()

    await vi.waitFor(() => {
      expect(bootstrapContentPageWithDeps).toHaveBeenCalledTimes(2)
    })
  })

  it("runs single-article precheck before countdown in auto mode", async () => {
    const startPrecheckFlow = vi.fn()

    await runBootstrapPass({
      articleDocument: makeExtractedDocumentFixture(),
      deps: {
        analyzeDocument: vi.fn(),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking: vi.fn(),
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        extractSelectedDocument: vi.fn(() => null),
        startArticlePrecheckFlow: startPrecheckFlow
      },
      feedItems: [],
      pageKind: "weibo-article",
      settings: makeOperationalSettings({ singleArticleReadMode: "auto" })
    })

    expect(startPrecheckFlow).toHaveBeenCalledTimes(1)
  })

  it("runs single-article precheck in manual mode but never starts feed bootstrap", async () => {
    const startPrecheckFlow = vi.fn()
    const bootstrapFeedTracking = vi.fn()

    await runBootstrapPass({
      articleDocument: makeExtractedDocumentFixture(),
      deps: {
        analyzeDocument: vi.fn(),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        extractSelectedDocument: vi.fn(() => null),
        startArticlePrecheckFlow: startPrecheckFlow
      },
      feedItems: [],
      pageKind: "wechat-article",
      settings: makeOperationalSettings({
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      })
    })

    expect(startPrecheckFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ singleArticleReadMode: "manual" })
      })
    )
    expect(bootstrapFeedTracking).not.toHaveBeenCalled()
  })

  it("keeps weibo-feed on the existing feed bootstrap path", async () => {
    const startArticlePrecheckFlow = vi.fn()
    const bootstrapFeedTracking = vi.fn()
    const extractFeedDocumentFromElement = vi.fn(() => null)
    const findFeedItemsFromMutations = vi.fn(() => [])
    const findLatestFeedItems = vi.fn(() => [document.createElement("article")])

    await runBootstrapPass({
      articleDocument: null,
      deps: {
        analyzeDocument: vi.fn(),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        extractSelectedDocument: vi.fn(() => null),
        startArticlePrecheckFlow
      },
      extractFeedDocumentFromElement,
      feedItems: [document.createElement("article")],
      findFeedItemsFromMutations,
      findLatestFeedItems,
      pageKind: "weibo-feed",
      settings: makeOperationalSettings()
    })

    expect(startArticlePrecheckFlow).not.toHaveBeenCalled()
    expect(bootstrapFeedTracking).toHaveBeenCalledTimes(1)
  })

  it("weibo-feed bootstrap creates per-item inline markers instead of article-level floating markers", async () => {
    const bootstrapFeedTracking = vi.fn()
    const createFloatingMarker = vi.fn(() => makeStatusMarkerStub())
    const extractFeedDocumentFromElement = vi.fn(() => null)
    const findFeedItemsFromMutations = vi.fn(() => [])
    const findLatestFeedItems = vi.fn(() => [document.createElement("article")])

    await runBootstrapPass({
      articleDocument: null,
      deps: {
        analyzeDocument: vi.fn(),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        createFloatingMarker,
        extractSelectedDocument: vi.fn(() => null),
        startArticlePrecheckFlow: vi.fn()
      },
      extractFeedDocumentFromElement,
      feedItems: [document.createElement("article"), document.createElement("article")],
      findFeedItemsFromMutations,
      findLatestFeedItems,
      pageKind: "weibo-feed",
      settings: makeOperationalSettings()
    })

    expect(createFloatingMarker).not.toHaveBeenCalled()
    expect(bootstrapFeedTracking).toHaveBeenCalledTimes(1)
  })

  it("feed bootstrap passes all visible feed items into feed tracking for per-item marker setup", async () => {
    const bootstrapFeedTracking = vi.fn()
    const feedItems = [document.createElement("article"), document.createElement("article")]
    const extractFeedDocumentFromElement = vi.fn(() => null)
    const findFeedItemsFromMutations = vi.fn(() => [])
    const findLatestFeedItems = vi.fn(() => feedItems)

    await runBootstrapPass({
      articleDocument: null,
      deps: {
        analyzeDocument: vi.fn(),
        bootstrapArticleTracking: vi.fn(),
        bootstrapFeedTracking,
        createFloatingMarker: vi.fn(() => makeStatusMarkerStub()),
        extractSelectedDocument: vi.fn(() => null),
        startArticlePrecheckFlow: vi.fn()
      },
      extractFeedDocumentFromElement,
      feedItems,
      findFeedItemsFromMutations,
      findLatestFeedItems,
      pageKind: "weibo-feed",
      settings: makeOperationalSettings()
    })

    expect(bootstrapFeedTracking).toHaveBeenCalledWith(
      expect.objectContaining({
        extractFeedDocumentFromElement,
        feedItems,
        findFeedItemsFromMutations,
        findLatestFeedItems,
        settings: expect.objectContaining({
          singleArticleReadMode: "auto",
          feedItemReadMode: "manual"
        })
      })
    )
  })

  it("single-article pages enqueue analysis jobs instead of sending ANALYZE_DOCUMENT directly", async () => {
    const enqueueAnalysisJob = vi.fn()

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => null),
      document: makeExtractedDocumentFixture(),
      enqueueAnalysisJob,
      markDocumentRead: vi.fn(async () => undefined),
      marker: makeStatusMarkerStub(),
      runDuplicatePrecheck: vi.fn(async () => ({
        duplicateScore: 0.2,
        kind: "low-duplicate" as const
      })),
      settings: makeOperationalSettings({ dwellThresholdSeconds: 1 }),
      startAutoReadCountdown: async ({ onThresholdReached }) => {
        await onThresholdReached()
      }
    })

    expect(enqueueAnalysisJob).toHaveBeenCalledTimes(1)
  })
})
