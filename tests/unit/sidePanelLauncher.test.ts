import { describe, expect, it, vi } from "vitest"

import { createContentSidePanelController } from "../../src/content/sidePanelLauncher"

describe("content side panel launcher", () => {
  it("opens the side panel directly from the content context after priming the tab id", async () => {
    const openSidePanel = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => undefined)
    const controller = createContentSidePanelController({
      openSidePanel,
      resolveTabId: async () => 42,
      sendMessage
    })

    await controller.primeTabId()
    await controller.open()

    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 42 })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it("falls back to the background message without rejecting when direct open fails", async () => {
    const openSidePanel = vi.fn(async () => {
      throw new Error("user gesture missing")
    })
    const sendMessage = vi.fn(async () => undefined)
    const controller = createContentSidePanelController({
      openSidePanel,
      resolveTabId: async () => 42,
      sendMessage
    })

    await controller.primeTabId()

    await expect(controller.open()).resolves.toBe(false)
    expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_SIDEPANEL" })
  })
})
