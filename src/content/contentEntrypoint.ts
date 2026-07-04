import {
  bootstrapContentPageWithDeps,
  prepareBootstrapPass,
  resolveOperationalSettings,
  runBootstrapPass
} from "./contentBootstrap"
import type {
  BootstrapPassCleanup,
  BootstrapPassDependencies,
  OperationalSettings
} from "./contentBootstrap"
import { extractArxivArticleDocument } from "./extractors/arxivExtractor"
import { extractGenericArticleDocument } from "./extractors/genericArticleExtractor"
import { extractGithubRepoDocument } from "./extractors/githubExtractor"
import { extractWechatDocument } from "./extractors/wechatExtractor"
import {
  extractXArticleDocument,
  extractXFeedDocumentFromElement,
  findXFeedItemsFromMutations,
  findXFeedItemElements
} from "./extractors/xExtractor"
import {
  extractWeiboArticleDocument,
  extractWeiboFeedDocumentFromElement,
  findWeiboFeedItemsFromMutations,
  findWeiboFeedItemElements
} from "./extractors/weiboExtractor"
import { classifyPageKind } from "./pageKind"

export interface UrlChangeObserverController {
  disconnect(): void
}

export interface PageSignal {
  readonly hrefChanged: boolean
}

const SAME_PAGE_RETRY_DELAY_MS = 250
const URL_POLL_INTERVAL_MS = 500
const PRESERVE_ON_RETRY_HOSTS = new Set(["weibo.com", "x.com", "mp.weixin.qq.com"])

export function observeUrlChanges(
  onPageSignal: (signal: PageSignal) => void
): UrlChangeObserverController {
  const view = window
  const doc = document
  let lastHref = view.location.href
  let disposed = false
  let frameHandle: number | null = null
  let pollTimerId: number | null = null
  let usingTimeoutFallback = false

  const originalPushState = view.history.pushState.bind(view.history)
  const originalReplaceState = view.history.replaceState.bind(view.history)

  function clearPendingFrame(): void {
    if (frameHandle === null) {
      return
    }

    if (usingTimeoutFallback) {
      view.clearTimeout(frameHandle)
    } else if (typeof view.cancelAnimationFrame === "function") {
      view.cancelAnimationFrame(frameHandle)
    }

    frameHandle = null
    usingTimeoutFallback = false
  }

  function flushHrefChange(): void {
    if (disposed) {
      return
    }

    const nextHref = view.location?.href

    if (typeof nextHref !== "string") {
      disposed = true
      clearPendingFrame()
      if (pollTimerId !== null) {
        view.clearInterval(pollTimerId)
        pollTimerId = null
      }
      return
    }

    const hrefChanged = nextHref !== lastHref

    if (hrefChanged) {
      lastHref = nextHref
      onPageSignal({ hrefChanged: true })
    }
  }

  function queueHrefCheck(): void {
    if (disposed || frameHandle !== null) {
      return
    }

    if (typeof view.requestAnimationFrame === "function") {
      usingTimeoutFallback = false
      frameHandle = view.requestAnimationFrame(() => {
        frameHandle = null
        flushHrefChange()
      })
      return
    }

    usingTimeoutFallback = true
    frameHandle = view.setTimeout(() => {
      frameHandle = null
      flushHrefChange()
    }, 0)
  }

  view.history.pushState = function pushState(...args): void {
    originalPushState(...args)
    queueHrefCheck()
  }

  view.history.replaceState = function replaceState(...args): void {
    originalReplaceState(...args)
    queueHrefCheck()
  }

  pollTimerId = view.setInterval(() => {
    if (!doc.hidden) {
      queueHrefCheck()
    }
  }, URL_POLL_INTERVAL_MS)

  view.addEventListener("popstate", queueHrefCheck)
  view.addEventListener("hashchange", queueHrefCheck)
  doc.addEventListener("readystatechange", queueHrefCheck)
  view.addEventListener("focus", queueHrefCheck)

  return {
    disconnect() {
      disposed = true
      clearPendingFrame()
      if (pollTimerId !== null) {
        view.clearInterval(pollTimerId)
        pollTimerId = null
      }
      view.history.pushState = originalPushState
      view.history.replaceState = originalReplaceState
      view.removeEventListener("popstate", queueHrefCheck)
      view.removeEventListener("hashchange", queueHrefCheck)
      doc.removeEventListener("readystatechange", queueHrefCheck)
      view.removeEventListener("focus", queueHrefCheck)
    }
  }
}

function createNoopBootstrapPassDependencies(): BootstrapPassDependencies {
  return {
    analyzeDocument: async () => undefined,
    bootstrapArticleTracking: async () => undefined,
    bootstrapFeedTracking: async () => undefined,
    createFloatingMarker: () => ({
      setStatus: () => undefined,
      setState: () => undefined
    }),
    extractSelectedDocument: () => null,
    startArticlePrecheckFlow: async () => undefined
  }
}

export async function startContentScript(input: {
  readonly beforeBootstrapPass?: () => Promise<void> | void
  readonly bootstrapContentPageWithDeps: typeof bootstrapContentPageWithDeps
  readonly deps?: BootstrapPassDependencies
  readonly getStoredSettings: () => Promise<OperationalSettings | null>
  readonly isSiteEnabled?: () => Promise<boolean>
  readonly observeUrlChanges?: typeof observeUrlChanges
  readonly requestRuntimeSettings: () => Promise<OperationalSettings>
}): Promise<void> {
  const deps = input.deps ?? createNoopBootstrapPassDependencies()
  const watchUrlChanges = input.observeUrlChanges ?? observeUrlChanges
  const isSiteEnabled = input.isSiteEnabled ?? (async () => true)
  let bootstrapInFlight: Promise<void> | null = null
  let currentCleanup: BootstrapPassCleanup | null = null
  let refreshQueued = false
  let shouldRetryCurrentPage = false
  let samePageRetryTimer: number | null = null

  if (!(await isSiteEnabled())) {
    return
  }

  function shouldPreserveExistingUiForRetry(): boolean {
    const hostname = window.location.hostname.replace(/^www\./u, "")
    return PRESERVE_ON_RETRY_HOSTS.has(hostname)
  }

  function clearSamePageRetryTimer(): void {
    if (samePageRetryTimer === null) {
      return
    }

    window.clearTimeout(samePageRetryTimer)
    samePageRetryTimer = null
  }

  function scheduleSamePageRetry(): void {
    if (!shouldRetryCurrentPage || samePageRetryTimer !== null) {
      return
    }

    samePageRetryTimer = window.setTimeout(() => {
      samePageRetryTimer = null

      if (!shouldRetryCurrentPage) {
        return
      }

      void requestBootstrapPass().catch(() => undefined)
    }, SAME_PAGE_RETRY_DELAY_MS)
  }

  async function performBootstrapPass(): Promise<void> {
    const settings = await resolveOperationalSettings({
      getStoredSettings: input.getStoredSettings,
      requestRuntimeSettings: input.requestRuntimeSettings
    })

    const prepared = await prepareBootstrapPass({
      classifyPageKind,
      deps,
      getSettings: async () => settings,
      platformDeps: {
        extractArxivArticleDocument,
        extractGenericArticleDocument,
        extractGithubRepoDocument,
        extractWechatDocument,
        extractWeiboArticleDocument,
        extractWeiboFeedDocumentFromElement,
        findWeiboFeedItemsFromMutations,
        findWeiboFeedItemElements,
        extractXArticleDocument,
        extractXFeedDocumentFromElement,
        findXFeedItemsFromMutations,
        findXFeedItemElements
      }
    })

    const isInertPagePass =
      !prepared.state.needsContentRetry &&
      !prepared.state.shouldBootstrapArticle &&
      !prepared.state.shouldBootstrapFeed &&
      !prepared.state.shouldShowManualFallback

    if (isInertPagePass && shouldPreserveExistingUiForRetry()) {
      shouldRetryCurrentPage = true
      scheduleSamePageRetry()
      return
    }

    currentCleanup?.destroy()
    currentCleanup = null
    await input.beforeBootstrapPass?.()

    const result = await input.bootstrapContentPageWithDeps({
      classifyPageKind,
      runBootstrapPass,
      deps,
      getSettings: async () => settings,
      preparedPass: prepared,
      platformDeps: {
        extractArxivArticleDocument,
        extractGenericArticleDocument,
        extractGithubRepoDocument,
        extractWechatDocument,
        extractWeiboArticleDocument,
        extractWeiboFeedDocumentFromElement,
        findWeiboFeedItemsFromMutations,
        findWeiboFeedItemElements,
        extractXArticleDocument,
        extractXFeedDocumentFromElement,
        findXFeedItemsFromMutations,
        findXFeedItemElements
      }
    })

    if (typeof result.destroy === "function") {
      currentCleanup = {
        destroy: result.destroy
      }
    }

    if (result.needsContentRetry) {
      shouldRetryCurrentPage = true
      scheduleSamePageRetry()
      return
    }

    if (isInertPagePass) {
      shouldRetryCurrentPage = true
      scheduleSamePageRetry()
      return
    }

    shouldRetryCurrentPage = false
    clearSamePageRetryTimer()
  }

  async function requestBootstrapPass(): Promise<void> {
    if (bootstrapInFlight !== null) {
      refreshQueued = true
      return bootstrapInFlight
    }

    bootstrapInFlight = (async () => {
      do {
        refreshQueued = false
        await performBootstrapPass()
      } while (refreshQueued)
    })()

    try {
      await bootstrapInFlight
    } finally {
      bootstrapInFlight = null
    }
  }

  watchUrlChanges((signal) => {
    if (!signal.hrefChanged && !shouldRetryCurrentPage) {
      return
    }

    clearSamePageRetryTimer()
    void requestBootstrapPass().catch(() => undefined)
  })

  await requestBootstrapPass()
}
