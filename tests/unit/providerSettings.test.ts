// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { ProviderSettings } from "../../src/options/ProviderSettings"
import { DEFAULT_SETTINGS, createProviderId } from "../../src/shared/types"

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
})

describe("ProviderSettings", () => {
  it("updates provider form inputs without reading a nulled event target", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    const nameInput = container.querySelector('input[placeholder="Provider name"]')

    expect(nameInput).not.toBeNull()

    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error("expected provider name input")
    }

    await act(async () => {
      nameInput.value = "Zhipu"
      nameInput.dispatchEvent(new Event("input", { bubbles: true }))
      nameInput.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(nameInput.value).toBe("Zhipu")
  })

  it("switches suggested models when provider type changes", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    const providerSelect = container.querySelector("select")
    const inputs = container.querySelectorAll("input")
    const baseUrlInput = inputs.item(1)
    const embeddingModelsInput = inputs.item(3)
    const chatModelsInput = inputs.item(4)

    expect(providerSelect).not.toBeNull()
    expect(baseUrlInput).not.toBeNull()
    expect(embeddingModelsInput).not.toBeNull()
    expect(chatModelsInput).not.toBeNull()

    if (!(providerSelect instanceof HTMLSelectElement)) {
      throw new Error("expected provider select")
    }

    if (!(baseUrlInput instanceof HTMLInputElement)) {
      throw new Error("expected base url input")
    }

    if (!(embeddingModelsInput instanceof HTMLInputElement)) {
      throw new Error("expected embedding models input")
    }

    if (!(chatModelsInput instanceof HTMLInputElement)) {
      throw new Error("expected chat models input")
    }

    await act(async () => {
      providerSelect.value = "bigmodel"
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(baseUrlInput.value).toBe("https://open.bigmodel.cn/api/paas/v4")
    expect(embeddingModelsInput.value).toBe("embedding-3")
    expect(chatModelsInput.value).toBe("glm-5")

    await act(async () => {
      providerSelect.value = "deepseek"
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(baseUrlInput.value).toBe("https://api.deepseek.com")
    expect(embeddingModelsInput.value).toBe("")
    expect(chatModelsInput.value).toBe("deepseek-chat")
  })

  it("shows explicit field labels for provider configuration", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    expect(container.textContent).toContain("Provider type")
    expect(container.textContent).toContain("Provider name")
    expect(container.textContent).toContain("Base URL")
    expect(container.textContent).toContain("API Key")
    expect(container.textContent).toContain("Embedding models")
    expect(container.textContent).toContain("Claim models")
  })

  it("toggles the api key visibility in the provider form", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    const apiKeyInput = container.querySelector("#provider-api-key-input")
    const toggleButton = container.querySelector('button[aria-label="Show API key"]')

    if (!(apiKeyInput instanceof HTMLInputElement)) {
      throw new Error("expected api key input")
    }

    if (!(toggleButton instanceof HTMLButtonElement)) {
      throw new Error("expected api key visibility toggle button")
    }

    expect(apiKeyInput.type).toBe("password")

    await act(async () => {
      toggleButton.click()
    })

    expect(apiKeyInput.type).toBe("text")

    const hideButton = container.querySelector('button[aria-label="Hide API key"]')

    if (!(hideButton instanceof HTMLButtonElement)) {
      throw new Error("expected hide api key visibility button")
    }

    await act(async () => {
      hideButton.click()
    })

    expect(apiKeyInput.type).toBe("password")
  })

  it("reveals the saved provider api key on demand", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [
            {
              id: createProviderId("provider_bigmodel"),
              name: "BigModel",
              type: "bigmodel",
              baseUrl: "https://open.bigmodel.cn/api/paas/v4",
              apiKeyEncrypted: "test-key-123",
              embeddingModels: ["embedding-3"],
              chatModels: ["glm-5"],
              supportsEmbedding: true,
              supportsChat: true,
              createdAt: 1,
              updatedAt: 1
            }
          ],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    expect(container.textContent).not.toContain("test-key-123")

    const revealButton = container.querySelector('button[aria-label="Show saved API key"]')

    if (!(revealButton instanceof HTMLButtonElement)) {
      throw new Error("expected saved api key reveal button")
    }

    await act(async () => {
      revealButton.click()
    })

    expect(container.textContent).toContain("test-key-123")
  })

  it("deletes a saved provider from the list", async () => {
    const deletedProviderIds: string[] = []
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async (providerId) => {
            deletedProviderIds.push(providerId)
          },
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [
            {
              id: createProviderId("provider_openai"),
              name: "OpenAI",
              type: "openai",
              baseUrl: "https://api.openai.com/v1",
              apiKeyEncrypted: "sk-test",
              embeddingModels: ["text-embedding-3-small"],
              chatModels: ["gpt-4.1-mini"],
              supportsEmbedding: true,
              supportsChat: true,
              createdAt: 1,
              updatedAt: 1
            }
          ],
          settings: DEFAULT_SETTINGS,
          switchWarning: ""
        })
      )
    })

    const deleteButton = container.querySelector('button[aria-label="Delete provider OpenAI"]')

    if (!(deleteButton instanceof HTMLButtonElement)) {
      throw new Error("expected delete provider button")
    }

    await act(async () => {
      deleteButton.click()
    })

    expect(deletedProviderIds).toEqual([createProviderId("provider_openai")])
  })

  it("shows active claim and embedding states on provider actions", async () => {
    const providerId = createProviderId("provider_bigmodel")
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(ProviderSettings, {
          onDeleteProvider: async () => undefined,
          onSaveProvider: async () => undefined,
          onSelectClaimProvider: async () => undefined,
          onSelectEmbeddingProvider: async () => undefined,
          onTestProvider: async () => "",
          providers: [
            {
              id: providerId,
              name: "BigModel",
              type: "bigmodel",
              baseUrl: "https://open.bigmodel.cn/api/paas/v4",
              apiKeyEncrypted: "test-key-123",
              embeddingModels: ["embedding-3"],
              chatModels: ["glm-5"],
              supportsEmbedding: true,
              supportsChat: true,
              createdAt: 1,
              updatedAt: 1
            }
          ],
          settings: {
            ...DEFAULT_SETTINGS,
            activeClaimProviderId: providerId,
            activeClaimModel: "glm-5",
            activeEmbeddingProviderId: providerId,
            activeEmbeddingModel: "embedding-3"
          },
          switchWarning: ""
        })
      )
    })

    const activeClaimButton = container.querySelector('button[data-claim-state="active"]')
    const activeEmbeddingButton = container.querySelector('button[data-embedding-state="active"]')

    if (!(activeClaimButton instanceof HTMLButtonElement)) {
      throw new Error("expected active claim button")
    }

    if (!(activeEmbeddingButton instanceof HTMLButtonElement)) {
      throw new Error("expected active embedding button")
    }

    expect(activeClaimButton.textContent).toContain("Current claim")
    expect(activeEmbeddingButton.textContent).toContain("Current embedding")
  })
})
