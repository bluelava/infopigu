import type { RuntimeMessage } from "../shared/messages"

type SidePanelOpenInput = {
  readonly tabId: number
}

type ContentSidePanelControllerDeps = {
  readonly openSidePanel: (input: SidePanelOpenInput) => Promise<void>
  readonly resolveTabId: () => Promise<number | null>
  readonly sendMessage: (message: RuntimeMessage) => Promise<unknown>
}

export type ContentSidePanelController = {
  readonly open: () => Promise<boolean>
  readonly primeTabId: () => Promise<number | null>
}

export function createContentSidePanelController(
  deps: ContentSidePanelControllerDeps
): ContentSidePanelController {
  let cachedTabId: number | null = null

  return {
    async primeTabId() {
      cachedTabId = await deps.resolveTabId()
      return cachedTabId
    },

    async open() {
      if (cachedTabId !== null) {
        try {
          await deps.openSidePanel({ tabId: cachedTabId })
          return true
        } catch {
          // Fall through to the background bridge if the direct gesture path fails.
        }
      }

      await deps.sendMessage({ type: "OPEN_SIDEPANEL" })
      return false
    }
  }
}
