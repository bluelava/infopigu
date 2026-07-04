import type { StatusMarker } from "./pageMarker"

interface FeedItemTrackerOptions {
  readonly createMarker: (element: Element, onManualRead: () => void) => StatusMarker
  readonly findItemsFromMutations?: (records: readonly MutationRecord[]) => readonly Element[]
  readonly findLatestItems?: () => readonly Element[]
  readonly isReady?: () => boolean
  readonly onInspectItem: (element: Element, marker: StatusMarker) => Promise<boolean | void>
  readonly onManualRead: (element: Element, marker: StatusMarker) => Promise<void>
}

const FEED_VISIBILITY_THRESHOLD = 0.15
const COGNITIVE_DELTA_NODE_PREFIX = "cognitive-delta-"

export interface FeedItemTrackerController {
  disconnect(): void
}

export function createFeedItemTracker(
  elements: readonly Element[],
  options: FeedItemTrackerOptions
): FeedItemTrackerController {
  const isReady = options.isReady ?? (() => true)
  const markers = new Map<Element, StatusMarker>()
  const visible = new Set<Element>()
  const pendingRetry = new Set<Element>()
  const inspected = new WeakSet<Element>()
  const inspecting = new WeakSet<Element>()
  let disposed = false
  let processingQueue = false
  let discoveryRefreshQueued = false

  function isCognitiveDeltaNode(node: Node | null): boolean {
    const element =
      node instanceof Element
        ? node
        : node?.parentElement ?? null

    if (element === null) {
      return false
    }

    if (element.id.startsWith(COGNITIVE_DELTA_NODE_PREFIX)) {
      return true
    }

    if ([...element.classList].some((className) => className.startsWith(COGNITIVE_DELTA_NODE_PREFIX))) {
      return true
    }

    return (
      element.closest(`[id^="${COGNITIVE_DELTA_NODE_PREFIX}"]`) !== null ||
      element.closest(`[class^="${COGNITIVE_DELTA_NODE_PREFIX}"]`) !== null ||
      element.closest(`[class*=" ${COGNITIVE_DELTA_NODE_PREFIX}"]`) !== null
    )
  }

  function shouldRefreshForMutations(records: readonly MutationRecord[]): boolean {
    return records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some((node) => !isCognitiveDeltaNode(node))
    )
  }

  function syncWaitingState(element: Element): void {
    const marker = markers.get(element)

    if (marker === undefined || inspected.has(element) || inspecting.has(element)) {
      return
    }

    if (!isReady()) {
      marker.setState({ kind: "waiting-ready" })
      return
    }

    marker.setStatus("")
  }

  async function processVisibleQueue(): Promise<void> {
    if (processingQueue || disposed || !isReady()) {
      return
    }

    processingQueue = true

    try {
      while (!disposed && isReady()) {
        const nextElement = [...visible]
          .filter(
            (element) =>
              !inspected.has(element) && !inspecting.has(element) && !pendingRetry.has(element)
          )
          .sort(
            (left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top
          )[0]

        if (nextElement === undefined) {
          return
        }

        const marker = markers.get(nextElement)

        if (marker === undefined) {
          inspected.add(nextElement)
          continue
        }

        inspecting.add(nextElement)

        try {
          const inspectionResult = await options.onInspectItem(nextElement, marker)

          if (inspectionResult === false) {
            pendingRetry.add(nextElement)
          } else {
            inspected.add(nextElement)
          }
        } finally {
          inspecting.delete(nextElement)
        }
      }
    } finally {
      processingQueue = false
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= FEED_VISIBILITY_THRESHOLD) {
          visible.add(entry.target)
          pendingRetry.delete(entry.target)
        } else {
          visible.delete(entry.target)
          pendingRetry.delete(entry.target)
        }
      }

      void processVisibleQueue()
    },
    {
      threshold: [FEED_VISIBILITY_THRESHOLD]
    }
  )

  const discoveryObserver =
    options.findLatestItems === undefined
      ? null
      : new MutationObserver((records) => {
          if (!shouldRefreshForMutations(records) || discoveryRefreshQueued) {
            return
          }

          const incrementalItems = options.findItemsFromMutations?.(records) ?? []

          discoveryRefreshQueued = true

          queueMicrotask(() => {
            discoveryRefreshQueued = false

            if (disposed) {
              return
            }

            if (incrementalItems.length > 0) {
              registerElements(incrementalItems)
              void processVisibleQueue()
              return
            }

            for (const element of visible) {
              pendingRetry.delete(element)
            }

            registerElements(options.findLatestItems?.() ?? [])
            void processVisibleQueue()
          })
        })

  function refreshReadyState(): void {
    for (const element of visible) {
      pendingRetry.delete(element)
    }

    for (const element of markers.keys()) {
      syncWaitingState(element)
    }

    void processVisibleQueue()
  }

  function registerElements(nextElements: readonly Element[]): void {
    for (const element of nextElements) {
      if (markers.has(element)) {
        continue
      }

      let marker: StatusMarker
      marker = options.createMarker(element, () => {
        if (disposed || !inspected.has(element) || inspecting.has(element)) {
          return
        }

        void options.onManualRead(element, marker)
      })

      markers.set(element, marker)
      syncWaitingState(element)
      observer.observe(element)
    }
  }

  registerElements(elements)
  document.addEventListener("readystatechange", refreshReadyState)
  window.addEventListener("load", refreshReadyState)

  if (discoveryObserver !== null) {
    discoveryObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    })
  }

  return {
    disconnect() {
      disposed = true
      discoveryRefreshQueued = false
      discoveryObserver?.disconnect()
      observer.disconnect()
      document.removeEventListener("readystatechange", refreshReadyState)
      window.removeEventListener("load", refreshReadyState)
      pendingRetry.clear()
      markers.clear()
      visible.clear()
    }
  }
}
