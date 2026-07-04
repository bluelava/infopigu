// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { ThemeSettings } from "../../src/options/ThemeSettings"
import { DEFAULT_SETTINGS } from "../../src/shared/types"

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
})

describe("ThemeSettings", () => {
  it("renders a light dark auto theme radio group", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ThemeSettings, {
          onChange: async () => undefined,
          settings: DEFAULT_SETTINGS
        })
      )
    })

    expect(container.textContent).toContain("Theme")
    expect(container.querySelector('input[name="theme-mode"][value="light"]')).not.toBeNull()
    expect(container.querySelector('input[name="theme-mode"][value="dark"]')).not.toBeNull()
    expect(container.querySelector('input[name="theme-mode"][value="auto"]')).not.toBeNull()
  })

  it("updates only the theme mode when a theme radio changes", async () => {
    const changes: unknown[] = []
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ThemeSettings, {
          onChange: async (nextSettings: unknown) => {
            changes.push(nextSettings)
          },
          settings: DEFAULT_SETTINGS
        })
      )
    })

    const darkRadio = container.querySelector('input[name="theme-mode"][value="dark"]')

    if (!(darkRadio instanceof HTMLInputElement)) {
      throw new Error("expected dark theme radio")
    }

    await act(async () => {
      darkRadio.click()
    })

    expect(changes).toContainEqual(
      expect.objectContaining({
        themeMode: "dark",
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      })
    )
  })
})
