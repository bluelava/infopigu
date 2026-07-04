// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { ReadModeSettings } from "../../src/options/ReadModeSettings"
import { DEFAULT_SETTINGS } from "../../src/shared/types"

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
})

describe("ReadModeSettings", () => {
  it("renders separate radio groups for single articles and feed items", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ReadModeSettings, {
          onChange: async () => undefined,
          settings: DEFAULT_SETTINGS
        })
      )
    })

    expect(container.textContent).toContain("Single article auto-read")
    expect(container.textContent).toContain("Feed item auto-read")
    expect(container.textContent).toContain("Novel claims overlay")
    expect(container.textContent).toContain("Claims preview limit")
    expect(container.querySelector('input[name="single-article-read-mode"][value="auto"]')).not.toBeNull()
    expect(container.querySelector('input[name="feed-item-read-mode"][value="manual"]')).not.toBeNull()
    expect(container.querySelector('input[name="novel-claims-overlay-seconds"]')).not.toBeNull()
    expect(container.querySelector('input[name="novel-claims-overlay-max-visible"]')).not.toBeNull()
  })

  it("updates only the feed-item read mode when the feed radio changes", async () => {
    const changes: unknown[] = []
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ReadModeSettings, {
          onChange: async (nextSettings: unknown) => {
            changes.push(nextSettings)
          },
          settings: DEFAULT_SETTINGS
        })
      )
    })

    const feedAutoRadio = container.querySelector(
      'input[name="feed-item-read-mode"][value="auto"]'
    )

    if (!(feedAutoRadio instanceof HTMLInputElement)) {
      throw new Error("expected feed auto radio")
    }

    await act(async () => {
      feedAutoRadio.click()
    })

    expect(changes).toContainEqual(
      expect.objectContaining({
        singleArticleReadMode: "auto",
        feedItemReadMode: "auto"
      })
    )
  })

  it("updates the novel-claims overlay duration without changing read modes", async () => {
    const changes: unknown[] = []
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ReadModeSettings, {
          onChange: async (nextSettings: unknown) => {
            changes.push(nextSettings)
          },
          settings: DEFAULT_SETTINGS
        })
      )
    })

    const overlayInput = container.querySelector(
      'input[name="novel-claims-overlay-seconds"]'
    )

    if (!(overlayInput instanceof HTMLInputElement)) {
      throw new Error("expected novel claims overlay seconds input")
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set

      valueSetter?.call(overlayInput, "35")
      overlayInput.dispatchEvent(new Event("input", { bubbles: true }))
      overlayInput.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(changes).toContainEqual(
      expect.objectContaining({
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual",
        novelClaimsOverlaySeconds: 35
      })
    )
  })

  it("updates the visible claims preview limit without changing the overlay duration", async () => {
    const changes: unknown[] = []
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ReadModeSettings, {
          onChange: async (nextSettings: unknown) => {
            changes.push(nextSettings)
          },
          settings: DEFAULT_SETTINGS
        })
      )
    })

    const maxVisibleInput = container.querySelector(
      'input[name="novel-claims-overlay-max-visible"]'
    )

    if (!(maxVisibleInput instanceof HTMLInputElement)) {
      throw new Error("expected novel claims overlay max visible input")
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set

      valueSetter?.call(maxVisibleInput, "8")
      maxVisibleInput.dispatchEvent(new Event("input", { bubbles: true }))
      maxVisibleInput.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(changes).toContainEqual(
      expect.objectContaining({
        novelClaimsOverlaySeconds: 5,
        novelClaimsOverlayMaxVisible: 8
      })
    )
  })
})
