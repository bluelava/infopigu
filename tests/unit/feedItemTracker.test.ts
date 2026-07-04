// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createFeedItemTracker } from "../../src/content/feedItemTracker"

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []

  readonly callback: IntersectionObserverCallback
  readonly disconnect = vi.fn()
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  trigger(entries: IntersectionObserverEntry[]): void {
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = []

  readonly callback: MutationCallback
  readonly disconnect = vi.fn()
  readonly observe = vi.fn()

  constructor(callback: MutationCallback) {
    this.callback = callback
    FakeMutationObserver.instances.push(this)
  }

  trigger(records: MutationRecord[]): void {
    this.callback(records, this as unknown as MutationObserver)
  }
}

function installFakeIntersectionObserver(): void {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal(
    "IntersectionObserver",
    FakeIntersectionObserver as unknown as typeof IntersectionObserver
  )
}

function installFakeMutationObserver(): void {
  FakeMutationObserver.instances = []
  vi.stubGlobal("MutationObserver", FakeMutationObserver as unknown as typeof MutationObserver)
}

function setDocumentReadyState(nextState: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => nextState
  })
}

function makeVisibleEntry(target: Element): IntersectionObserverEntry {
  return {
    target,
    isIntersecting: true,
    intersectionRatio: 0.8
  } as unknown as IntersectionObserverEntry
}

function makePartiallyVisibleEntry(target: Element): IntersectionObserverEntry {
  return {
    target,
    isIntersecting: true,
    intersectionRatio: 0.2
  } as unknown as IntersectionObserverEntry
}

describe("createFeedItemTracker", () => {
  beforeEach(() => {
    installFakeIntersectionObserver()
    installFakeMutationObserver()
    setDocumentReadyState("interactive")
  })

  it("does not start feed inspection until readiness is satisfied", async () => {
    const element = document.createElement("article")
    const onInspectItem = vi.fn(async () => undefined)
    setDocumentReadyState("loading")

    const controller = createFeedItemTracker([element], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      isReady: () => document.readyState !== "loading",
      onInspectItem,
      onManualRead: vi.fn(async () => undefined)
    })

    const observer = FakeIntersectionObserver.instances[0]
    observer?.trigger([makeVisibleEntry(element)])

    expect(onInspectItem).not.toHaveBeenCalled()

    setDocumentReadyState("interactive")
    document.dispatchEvent(new Event("readystatechange"))

    await Promise.resolve()

    expect(onInspectItem).toHaveBeenCalledTimes(1)
    controller.disconnect()
  })

  it("inspects visible feed items from top to bottom in sequence", async () => {
    const first = document.createElement("article")
    const second = document.createElement("article")
    const callOrder: string[] = []

    first.getBoundingClientRect = () => ({ top: 80 } as DOMRect)
    second.getBoundingClientRect = () => ({ top: 20 } as DOMRect)

    const controller = createFeedItemTracker([first, second], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      isReady: () => true,
      onInspectItem: vi.fn(async (element: Element) => {
        callOrder.push(element === second ? "second" : "first")
        await Promise.resolve()
      }),
      onManualRead: vi.fn(async () => undefined)
    })

    const observer = FakeIntersectionObserver.instances[0]
    observer?.trigger([makeVisibleEntry(first), makeVisibleEntry(second)])

    await Promise.resolve()
    await Promise.resolve()

    expect(callOrder).toEqual(["second", "first"])
    controller.disconnect()
  })

  it("starts inspecting feed items once they are partially visible above the relaxed threshold", async () => {
    const element = document.createElement("article")
    const onInspectItem = vi.fn(async () => undefined)

    const controller = createFeedItemTracker([element], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      isReady: () => true,
      onInspectItem,
      onManualRead: vi.fn(async () => undefined)
    })

    const observer = FakeIntersectionObserver.instances[0]
    observer?.trigger([makePartiallyVisibleEntry(element)])

    await Promise.resolve()

    expect(onInspectItem).toHaveBeenCalledTimes(1)
    controller.disconnect()
  })

  it("retries a feed item after an earlier inspection attempt failed to extract usable content", async () => {
    const element = document.createElement("article")
    let attempts = 0
    const onInspectItem = vi.fn(async () => {
      attempts += 1
      return attempts < 2 ? false : true
    })

    const controller = createFeedItemTracker([element], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      isReady: () => true,
      onInspectItem,
      onManualRead: vi.fn(async () => undefined)
    })

    const observer = FakeIntersectionObserver.instances[0]
    observer?.trigger([makeVisibleEntry(element)])

    await Promise.resolve()

    expect(onInspectItem).toHaveBeenCalledTimes(1)

    observer?.trigger([
      {
        target: element,
        isIntersecting: false,
        intersectionRatio: 0
      } as unknown as IntersectionObserverEntry
    ])
    observer?.trigger([makeVisibleEntry(element)])

    await Promise.resolve()

    expect(onInspectItem).toHaveBeenCalledTimes(2)
    controller.disconnect()
  })

  it("does not rescan the entire feed when the only mutation came from our own marker DOM", async () => {
    const element = document.createElement("article")
    const findLatestItems = vi.fn(() => [element])

    const controller = createFeedItemTracker([element], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      findLatestItems,
      isReady: () => true,
      onInspectItem: vi.fn(async () => undefined),
      onManualRead: vi.fn(async () => undefined)
    })

    const discoveryObserver = FakeMutationObserver.instances[0]
    const markerNode = document.createElement("div")
    markerNode.className = "cognitive-delta-inline-marker"

    discoveryObserver?.trigger([
      ({
        addedNodes: [markerNode] as unknown as NodeList,
        attributeName: null,
        oldValue: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: element,
        type: "childList"
      } as unknown as MutationRecord)
    ])

    await Promise.resolve()

    expect(findLatestItems).not.toHaveBeenCalled()
    controller.disconnect()
  })

  it("does not rescan the entire feed when only marker text nodes change", async () => {
    const element = document.createElement("article")
    const findLatestItems = vi.fn(() => [element])

    const controller = createFeedItemTracker([element], {
      createMarker: () => ({
        setState: vi.fn(),
        setStatus: vi.fn()
      }),
      findLatestItems,
      isReady: () => true,
      onInspectItem: vi.fn(async () => undefined),
      onManualRead: vi.fn(async () => undefined)
    })

    const discoveryObserver = FakeMutationObserver.instances[0]
    const statusNode = document.createElement("span")
    statusNode.className = "cognitive-delta-inline-status"
    const textNode = document.createTextNode("重复度 0%")
    statusNode.append(textNode)

    discoveryObserver?.trigger([
      ({
        addedNodes: [textNode] as unknown as NodeList,
        attributeName: null,
        oldValue: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: statusNode,
        type: "childList"
      } as unknown as MutationRecord)
    ])

    await Promise.resolve()

    expect(findLatestItems).not.toHaveBeenCalled()
    controller.disconnect()
  })

  it("registers a newly added feed item from mutation records without rescanning the entire feed", async () => {
    const first = document.createElement("article")
    const second = document.createElement("article")
    document.body.append(first)

    const findLatestItems = vi.fn(() => [first, second])
    const findItemsFromMutations = vi.fn(() => [second])

    const controller = createFeedItemTracker(
      [first],
      ({
        createMarker: () => ({
          setState: vi.fn(),
          setStatus: vi.fn()
        }),
        findItemsFromMutations,
        findLatestItems,
        isReady: () => true,
        onInspectItem: vi.fn(async () => undefined),
        onManualRead: vi.fn(async () => undefined)
      } as unknown) as Parameters<typeof createFeedItemTracker>[1]
    )

    const observer = FakeIntersectionObserver.instances[0]
    expect(observer?.observe).toHaveBeenCalledWith(first)

    const discoveryObserver = FakeMutationObserver.instances[0]
    discoveryObserver?.trigger([
      ({
        addedNodes: [second] as unknown as NodeList,
        attributeName: null,
        oldValue: null,
        attributeNamespace: null,
        nextSibling: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: document.body,
        type: "childList"
      } as unknown as MutationRecord)
    ])

    await Promise.resolve()

    expect(findItemsFromMutations).toHaveBeenCalledTimes(1)
    expect(findLatestItems).not.toHaveBeenCalled()
    expect(observer?.observe).toHaveBeenCalledWith(second)
    controller.disconnect()
  })
})
