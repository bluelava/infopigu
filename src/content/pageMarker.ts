import { createCountdownRing } from "./countdownRing"
import type { SupportedLocale } from "../i18n/locales"
import { translateRuntime, setRuntimeLocale } from "../i18n/runtimeLocale"
import type { ResolvedThemeMode } from "../theme/themeMode"

const STYLE_ID = "cognitive-delta-marker-style"
const FLOATING_MARKER_HOST_ID = "cognitive-delta-floating-marker-host"
const THEME_ATTRIBUTE = "data-cognitive-delta-theme"
const KNOWLEDGE_GAIN_DURATION_MS = 1800
let currentTheme: ResolvedThemeMode = "light"

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return
  }

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    .cognitive-delta-floating-marker,
    .cognitive-delta-inline-marker,
    .cognitive-delta-kdb-badge {
      --cognitive-delta-floating-pill-height: 26px;
      --cognitive-delta-floating-pill-height-compact: 22px;
      --cognitive-delta-marker-text: #1f2937;
      --cognitive-delta-marker-background: rgba(255, 250, 240, 0.96);
      --cognitive-delta-marker-inline-background: rgba(255, 250, 240, 0.56);
      --cognitive-delta-marker-inline-hover-background: rgba(255, 250, 240, 0.74);
      --cognitive-delta-marker-border: rgba(180, 132, 76, 0.4);
      --cognitive-delta-marker-shadow: rgba(35, 25, 12, 0.12);
      --cognitive-delta-inline-hover-shadow: rgba(35, 25, 12, 0.14);
      --cognitive-delta-marker-primary: #8b5e34;
      --cognitive-delta-marker-muted: #9ca3af;
      --cognitive-delta-marker-status: #374151;
      --cognitive-delta-marker-success: #16a34a;
      --cognitive-delta-marker-ring-muted: rgba(139, 94, 52, 0.18);
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: var(--cognitive-delta-marker-text);
      background: var(--cognitive-delta-marker-background);
      border: 1px solid var(--cognitive-delta-marker-border);
      box-shadow: 0 10px 24px var(--cognitive-delta-marker-shadow);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      line-height: 1;
      z-index: 2147483647;
    }
    .cognitive-delta-glass {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.46));
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
    }
    .cognitive-delta-floating-marker[data-cognitive-delta-theme="dark"],
    .cognitive-delta-inline-marker[data-cognitive-delta-theme="dark"],
    .cognitive-delta-kdb-badge[data-cognitive-delta-theme="dark"] {
      --cognitive-delta-marker-text: #f4ead7;
      --cognitive-delta-marker-background: rgba(53, 42, 33, 0.96);
      --cognitive-delta-marker-inline-background: rgba(53, 42, 33, 0.54);
      --cognitive-delta-marker-inline-hover-background: rgba(53, 42, 33, 0.74);
      --cognitive-delta-marker-border: rgba(189, 144, 92, 0.42);
      --cognitive-delta-marker-shadow: rgba(10, 8, 6, 0.34);
      --cognitive-delta-inline-hover-shadow: rgba(10, 8, 6, 0.42);
      --cognitive-delta-marker-primary: #d0a36d;
      --cognitive-delta-marker-muted: #cfbea8;
      --cognitive-delta-marker-status: #e6d8c1;
      --cognitive-delta-marker-success: #7dd38f;
      --cognitive-delta-marker-ring-muted: rgba(208, 163, 109, 0.22);
    }
    .cognitive-delta-floating-marker {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: var(--cognitive-delta-floating-pill-height);
      padding: 6px 10px;
      box-sizing: border-box;
      position: relative;
    }
    .cognitive-delta-floating-marker[data-density="compact"] {
      min-height: var(--cognitive-delta-floating-pill-height-compact);
      padding: 4px 8px;
    }
    .cognitive-delta-floating-actions {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      margin-left: auto;
    }
    .cognitive-delta-floating-stack {
      position: fixed;
      right: 24px;
      bottom: 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      z-index: 2147483647;
    }
    .cognitive-delta-floating-shell {
      display: flex;
      align-items: center;
      gap: 8px;
      position: relative;
    }
    .cognitive-delta-floating-shell[data-density="compact"] {
      --cognitive-delta-floating-pill-height: var(--cognitive-delta-floating-pill-height-compact);
    }
    .cognitive-delta-kdb-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .cognitive-delta-kdb-badge {
      width: var(--cognitive-delta-floating-pill-height);
      height: var(--cognitive-delta-floating-pill-height);
      padding: 0;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--cognitive-delta-marker-background);
      border: 1px solid var(--cognitive-delta-marker-border);
      box-shadow: 0 10px 24px var(--cognitive-delta-marker-shadow);
      color: var(--cognitive-delta-marker-primary);
    }
    .cognitive-delta-kdb-badge--standalone {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483647;
    }
    .cognitive-delta-kdb-gain {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translate(-50%, 4px);
      color: #dc2626;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      opacity: 0;
      animation: cognitive-delta-kdb-gain-rise 1800ms ease forwards;
      pointer-events: none;
      white-space: nowrap;
    }
    .cognitive-delta-claims-overlay {
      min-width: 240px;
      max-width: min(360px, calc(100vw - 32px));
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.48);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.52),
        0 18px 40px rgba(15, 23, 42, 0.16);
      padding: 14px 16px;
      color: #111827;
    }
    .cognitive-delta-claims-overlay[data-cognitive-delta-theme="dark"] {
      color: #f9fafb;
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.3);
      background: rgba(31, 41, 55, 0.62);
    }
    .cognitive-delta-claims-overlay-title {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: inherit;
      opacity: 0.72;
    }
    .cognitive-delta-claims-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
      font-size: 12px;
      line-height: 1.45;
    }
    .cognitive-delta-claims-overlay-more {
      margin-top: 10px;
      appearance: none;
      border: 0;
      background: rgba(255, 255, 255, 0.58);
      color: var(--cognitive-delta-marker-primary);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
    }
    @keyframes cognitive-delta-kdb-gain-rise {
      0% {
        opacity: 0;
        transform: translate(-50%, 4px);
      }
      18% {
        opacity: 1;
      }
      75% {
        opacity: 1;
        transform: translate(-50%, -10px);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -14px);
      }
    }
    .cognitive-delta-inline-marker {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      padding: 2px 4px;
      min-width: 0;
      display: inline-flex;
      gap: 3px;
      align-items: center;
      background: var(--cognitive-delta-marker-inline-background);
      backdrop-filter: blur(10px) saturate(140%);
      transition:
        padding 160ms ease,
        background-color 160ms ease,
        box-shadow 160ms ease,
        transform 160ms ease;
    }
    .cognitive-delta-inline-marker:hover {
      padding: 2px 6px;
      background: var(--cognitive-delta-marker-inline-hover-background);
      box-shadow: 0 6px 14px var(--cognitive-delta-inline-hover-shadow);
      transform: translateX(-50%) translateY(-1px);
    }
    .cognitive-delta-action {
      appearance: none;
      border: none;
      background: var(--cognitive-delta-marker-primary);
      color: white;
      border-radius: 999px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .cognitive-delta-action[data-size="compact"] {
      padding: 4px 8px;
      font-size: 11px;
    }
    .cognitive-delta-inline-marker .cognitive-delta-action {
      width: 12px;
      height: 12px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      line-height: 1;
      background: transparent;
      color: var(--cognitive-delta-marker-muted);
      border: 0;
      box-shadow: none;
    }
    .cognitive-delta-inline-marker .cognitive-delta-action[data-variant="confirm"] {
      width: 12px;
      height: 12px;
      font-size: 9px;
    }
    .cognitive-delta-action[data-variant="waveform"] {
      background: transparent;
      color: var(--cognitive-delta-marker-muted);
    }
    .cognitive-delta-action[data-variant="waiting"] {
      background: transparent;
      color: var(--cognitive-delta-marker-muted);
    }
    .cognitive-delta-action[data-variant="success"] {
      background: transparent;
      color: var(--cognitive-delta-marker-success);
    }
    .cognitive-delta-action[data-variant="confirm"] {
      background: var(--cognitive-delta-marker-success);
      color: #ffffff;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      font-size: 11px;
    }
    .cognitive-delta-action[data-variant="read"] {
      background: #e5e7eb;
      color: #6b7280;
      border-radius: 8px;
      padding: 4px 8px;
      min-height: var(--cognitive-delta-floating-pill-height-compact);
      box-sizing: border-box;
    }
    .cognitive-delta-action:disabled {
      cursor: wait;
      opacity: 0.72;
    }
    .cognitive-delta-action[data-variant="read"]:disabled {
      cursor: default;
      opacity: 1;
    }
    .cognitive-delta-retry-action {
      appearance: none;
      border: 1px solid rgba(148, 163, 184, 0.45);
      background: rgba(255, 255, 255, 0.9);
      color: var(--cognitive-delta-marker-primary);
      border-radius: 999px;
      padding: 6px 10px;
      min-height: var(--cognitive-delta-floating-pill-height);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      box-sizing: border-box;
      white-space: nowrap;
    }
    .cognitive-delta-retry-action[data-cognitive-delta-theme="dark"] {
      background: rgba(31, 41, 55, 0.9);
      border-color: rgba(148, 163, 184, 0.3);
      color: #f3f4f6;
    }
    .cognitive-delta-inline-status {
      display: inline;
      font-size: 10px;
      line-height: 1;
      color: var(--cognitive-delta-marker-status);
    }
    .cognitive-delta-countdown-ring {
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: conic-gradient(
        var(--cognitive-delta-marker-primary) var(--cognitive-delta-progress, 0%),
        var(--cognitive-delta-marker-ring-muted) 0
      );
      flex: 0 0 auto;
    }
    .cognitive-delta-inline-marker .cognitive-delta-countdown-ring {
      width: 12px;
      height: 12px;
    }
  `
  document.head.append(style)
}

export type FloatingMarkerState =
  | { readonly kind: "waiting-ready" }
  | { readonly kind: "prechecking" }
  | { readonly kind: "insufficient-content" }
  | { readonly kind: "already-read"; readonly compactText?: string; readonly text?: string }
  | { readonly kind: "manual-ready"; readonly duplicateScore: number | null }
  | {
      readonly kind: "countdown"
      readonly duplicateScore: number | null
      readonly progressPercent: number
    }
  | { readonly kind: "high-duplicate"; readonly duplicateScore: number }
  | { readonly kind: "unknown-duplicate-countdown"; readonly progressPercent: number }
  | { readonly kind: "precheck-failed" }
  | { readonly kind: "queued" }
  | { readonly kind: "claiming" }
  | { readonly kind: "embedding"; readonly completedTasks: number; readonly totalTasks: number }
  | { readonly kind: "completed"; readonly compactText?: string; readonly hideAction?: boolean; readonly text: string }
  | { readonly kind: "failed"; readonly text: string }

export interface StatusMarker {
  setStatus(text: string): void
  setState(state: FloatingMarkerState): void
  showKnowledgeGain?(input: { readonly count: number }): void
  primeNovelClaimsOverlay?(input: {
    readonly claims: readonly string[]
    readonly durationMs: number
    readonly maxVisibleClaims?: number
  }): void
  showNovelClaimsOverlay?(input: {
    readonly claims: readonly string[]
    readonly durationMs: number
    readonly maxVisibleClaims?: number
  }): void
}

export function setMarkerLocale(locale: SupportedLocale): void {
  setRuntimeLocale(locale)
}

function createPercentLabel(score: number | null): string {
  if (score === null) {
    return ""
  }

  return ` · ${translateRuntime("content.duplicateScore", {
    score: Math.round(score * 100)
  })}`
}

function createStateText(state: FloatingMarkerState): string {
  switch (state.kind) {
    case "waiting-ready":
      return ""
    case "prechecking":
      return translateRuntime("marker.status.prechecking")
    case "insufficient-content":
      return translateRuntime("marker.status.insufficient")
    case "already-read":
      return state.text ?? translateRuntime("marker.status.alreadyReadDefault")
    case "manual-ready":
      return state.duplicateScore === null
        ? translateRuntime("marker.status.manualReady")
        : translateRuntime("content.duplicateScore", {
            score: Math.round(state.duplicateScore * 100)
          })
    case "countdown":
      return state.duplicateScore === null
        ? ""
        : translateRuntime("content.duplicateScore", {
            score: Math.round(state.duplicateScore * 100)
          })
    case "high-duplicate":
      return `${translateRuntime("marker.status.highDuplicate")}${createPercentLabel(state.duplicateScore)}`
    case "unknown-duplicate-countdown":
      return translateRuntime("marker.status.unknownDuplicate")
    case "precheck-failed":
      return translateRuntime("marker.status.precheckFailedContinue")
    case "queued":
      return translateRuntime("marker.status.calculating")
    case "claiming":
      return translateRuntime("marker.status.calculating")
    case "embedding":
      return translateRuntime("marker.status.calculating")
    case "completed":
      return state.text
    case "failed":
      return state.text
  }
}

function setButtonLabel(
  button: HTMLButtonElement,
  input: {
    readonly ariaLabel: string
    readonly disabled: boolean
    readonly hidden?: boolean
    readonly size?: "compact" | "regular"
    readonly title: string
    readonly value: "confirm" | "manual" | "read" | "success" | "waiting" | "waveform"
  }
): void {
  button.hidden = input.hidden ?? false
  button.disabled = input.disabled
  button.setAttribute("aria-label", input.ariaLabel)
  button.title = input.title
  button.setAttribute("data-variant", input.value)
  button.setAttribute("data-size", input.size ?? "regular")

  if (input.value === "waveform") {
    button.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14"><path d="M1 10c1.2 0 1.2-4 2.4-4s1.2 8 2.4 8 1.2-8 2.4-8 1.2 8 2.4 8 1.2-4 2.4-4 1.2 4 2.4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>'
    return
  }

  button.textContent =
    input.value === "manual"
      ? translateRuntime("marker.status.markRead")
      : input.value === "read"
        ? translateRuntime("marker.status.read")
        : input.value === "success" || input.value === "confirm"
          ? "✓"
          : "⌛"
}

function createCompactDuplicateText(duplicateScore: number | null): string {
  return duplicateScore === null ? "" : `${Math.round(duplicateScore * 100)}%`
}

function shouldUseCompactFloatingDensity(state: FloatingMarkerState): boolean {
  return (
    state.kind === "prechecking" ||
    state.kind === "queued" ||
    state.kind === "claiming" ||
    state.kind === "embedding" ||
    state.kind === "already-read" ||
    (state.kind === "completed" && (state.hideAction ?? false))
  )
}

function extractCompactDuplicateText(
  state: Extract<FloatingMarkerState, { readonly kind: "already-read" | "completed" }>
): string | null {
  if (state.compactText !== undefined && state.compactText.trim().length > 0) {
    return state.compactText
  }

  const sourceText = state.text

  if (sourceText === undefined) {
    return null
  }

  const match = sourceText.match(/(\d+)\s*%/)

  return match === null ? null : `${match[1]}%`
}

function createLabeledCompactDuplicateText(compactText: string): string {
  const match = compactText.match(/(\d+)\s*%/)

  if (match === null) {
    return compactText
  }

  return translateRuntime("content.duplicateScore", {
    score: Number(match[1])
  })
}

function ensureFloatingMarkerHost(): HTMLElement {
  const existingHost = document.getElementById(FLOATING_MARKER_HOST_ID)

  if (existingHost instanceof HTMLElement) {
    return existingHost
  }

  const host = document.createElement("div")
  host.id = FLOATING_MARKER_HOST_ID
  document.documentElement.append(host)
  return host
}

function applyTheme(element: HTMLElement): void {
  element.setAttribute(THEME_ATTRIBUTE, currentTheme)
}

function createKnowledgeBadge(className = ""): HTMLElement {
  const badge = document.createElement("div")
  badge.className = ["cognitive-delta-kdb-badge", className].filter(Boolean).join(" ")
  badge.setAttribute("aria-label", translateRuntime("marker.kdb.label"))
  badge.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 5.5a1.5 1.5 0 0 1 1.5-1.5H9v15H6.5A1.5 1.5 0 0 1 5 17.5v-12Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4h4v15H9" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 5h4.5A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5H13" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m17.6 3.4.45.92 1.01.15-.73.71.17 1-.9-.48-.9.48.17-1-.73-.7 1-.16.46-.92Z" fill="currentColor" stroke="none"/></svg>'
  applyTheme(badge)
  return badge
}

function ensureStandaloneKnowledgeBadge(): void {
  if (document.querySelector(".cognitive-delta-kdb-badge--standalone") !== null) {
    return
  }

  const badge = createKnowledgeBadge("cognitive-delta-kdb-badge--standalone cognitive-delta-glass")
  document.body.append(badge)
}

function clearStandaloneKnowledgeBadge(): void {
  document.querySelector(".cognitive-delta-kdb-badge--standalone")?.remove()
}

export function setMarkerTheme(theme: ResolvedThemeMode): void {
  currentTheme = theme

  for (const marker of document.querySelectorAll<HTMLElement>(
    ".cognitive-delta-floating-marker, .cognitive-delta-inline-marker, .cognitive-delta-kdb-badge, .cognitive-delta-claims-overlay"
  )) {
    applyTheme(marker)
  }
}

export function createFloatingMarker(
  onManualRead: () => void,
  options?: {
    readonly onRetryAnalysis?: () => void
    readonly openSidePanel?: () => void
  }
): StatusMarker {
  ensureStyles()
  clearStandaloneKnowledgeBadge()
  const host = ensureFloatingMarkerHost()
  host.replaceChildren()
  const stack = document.createElement("div")
  stack.className = "cognitive-delta-floating-stack"
  host.append(stack)

  const overlayHost = document.createElement("div")
  stack.append(overlayHost)

  const shell = document.createElement("div")
  shell.className = "cognitive-delta-floating-shell"
  shell.setAttribute("data-density", "regular")
  stack.append(shell)

  const container = document.createElement("div")
  container.className = "cognitive-delta-floating-marker"
  applyTheme(container)

  const status = document.createElement("span")
  status.textContent = translateRuntime("marker.status.waitingAnalysis")

  const actions = document.createElement("div")
  actions.className = "cognitive-delta-floating-actions"

  const button = document.createElement("button")
  button.className = "cognitive-delta-action"
  button.textContent = translateRuntime("marker.status.markRead")
  button.addEventListener("click", onManualRead)

  const retryButton = document.createElement("button")
  retryButton.className = "cognitive-delta-retry-action"
  retryButton.type = "button"
  retryButton.hidden = true
  retryButton.textContent = translateRuntime("marker.status.retryAnalysis")
  retryButton.setAttribute("aria-label", translateRuntime("marker.status.retryAnalysis"))
  retryButton.addEventListener("click", () => {
    options?.onRetryAnalysis?.()
  })
  applyTheme(retryButton)

  actions.append(button, retryButton)
  container.append(status, actions)

  const knowledgeWrap = document.createElement("div")
  knowledgeWrap.className = "cognitive-delta-kdb-wrap"

  const knowledgeBadge = createKnowledgeBadge("cognitive-delta-glass")

  knowledgeWrap.append(knowledgeBadge)
  shell.append(container, knowledgeWrap)

  let ring: HTMLElement | null = null
  let claimsOverlay: HTMLElement | null = null
  let claimsOverlayTimeoutId: number | null = null
  let knowledgeGainTimeoutId: number | null = null
  let currentState: FloatingMarkerState | null = null
  let hovered = false
  let latestClaimsOverlayInput:
    | {
        readonly claims: readonly string[]
        readonly durationMs: number
        readonly maxVisibleClaims: number
      }
    | null = null

  function removeRing(): void {
    ring?.remove()
    ring = null
  }

  function clearClaimsOverlay(): void {
    if (claimsOverlayTimeoutId !== null) {
      window.clearTimeout(claimsOverlayTimeoutId)
      claimsOverlayTimeoutId = null
    }

    claimsOverlay?.remove()
    claimsOverlay = null
  }

  function clearKnowledgeGain(): void {
    if (knowledgeGainTimeoutId !== null) {
      window.clearTimeout(knowledgeGainTimeoutId)
      knowledgeGainTimeoutId = null
    }

    knowledgeWrap.querySelector(".cognitive-delta-kdb-gain")?.remove()
  }

  function primeNovelClaimsOverlay(
    claims: readonly string[],
    durationMs: number,
    maxVisibleClaims = claims.length
  ): void {
    latestClaimsOverlayInput = {
      claims,
      durationMs,
      maxVisibleClaims
    }
  }

  function renderNovelClaimsOverlay(
    claims: readonly string[],
    durationMs: number,
    maxVisibleClaims = claims.length,
    renderEmpty = false
  ): void {
    primeNovelClaimsOverlay(claims, durationMs, maxVisibleClaims)

    clearClaimsOverlay()

    if (claims.length === 0 && !renderEmpty) {
      return
    }

    claimsOverlay = document.createElement("section")
    claimsOverlay.className = "cognitive-delta-claims-overlay cognitive-delta-glass"
    applyTheme(claimsOverlay)

    const title = document.createElement("p")
    title.className = "cognitive-delta-claims-overlay-title"
    title.textContent = translateRuntime("marker.claims.title")

    const list = document.createElement("ol")
    list.className = "cognitive-delta-claims-list"

    if (claims.length === 0) {
      const item = document.createElement("li")
      item.className = "body-copy"
      item.textContent = translateRuntime("marker.claims.emptyPage")
      list.append(item)
    } else {
      for (const claim of claims.slice(0, maxVisibleClaims)) {
        const item = document.createElement("li")
        item.textContent = claim
        list.append(item)
      }
    }

    claimsOverlay.append(title, list)

    if (claims.length > 0 && options?.openSidePanel !== undefined) {
      const moreButton = document.createElement("button")
      moreButton.className = "cognitive-delta-claims-overlay-more"
      moreButton.textContent = translateRuntime("marker.claims.more")
      moreButton.type = "button"
      moreButton.addEventListener("click", () => {
        options?.openSidePanel?.()
      })
      claimsOverlay.append(moreButton)
    }

    overlayHost.append(claimsOverlay)
    claimsOverlayTimeoutId = window.setTimeout(() => {
      clearClaimsOverlay()
    }, durationMs)
  }

  function reShowLatestClaimsOverlay(): void {
    if (latestClaimsOverlayInput === null) {
      return
    }

    renderNovelClaimsOverlay(
      latestClaimsOverlayInput.claims,
      latestClaimsOverlayInput.durationMs,
      latestClaimsOverlayInput.maxVisibleClaims,
      latestClaimsOverlayInput.claims.length === 0
    )
  }

  knowledgeWrap.addEventListener("pointerenter", reShowLatestClaimsOverlay)
  knowledgeWrap.addEventListener("mouseenter", reShowLatestClaimsOverlay)
  knowledgeBadge.addEventListener("pointerenter", reShowLatestClaimsOverlay)
  knowledgeBadge.addEventListener("mouseenter", reShowLatestClaimsOverlay)

  function showKnowledgeGain(count: number): void {
    clearKnowledgeGain()

    if (count <= 0) {
      return
    }

    const gain = document.createElement("div")
    gain.className = "cognitive-delta-kdb-gain"
    gain.textContent = `+${count}`
    knowledgeWrap.append(gain)
    knowledgeGainTimeoutId = window.setTimeout(() => {
      clearKnowledgeGain()
    }, KNOWLEDGE_GAIN_DURATION_MS)
  }

  function setRingProgress(progressPercent: number): void {
    if (ring === null) {
      ring = createCountdownRing(progressPercent)
      actions.append(ring)
      return
    }

    ring.style.setProperty("--cognitive-delta-progress", `${progressPercent}%`)
  }

  function setManualAction(): void {
    setButtonLabel(button, {
      ariaLabel: translateRuntime("marker.status.markRead"),
      disabled: false,
      size: "regular",
      title: "",
      value: "manual"
    })
  }

  function setWaitingAction(label: string): void {
    setButtonLabel(button, {
      ariaLabel: label,
      disabled: true,
      size: "compact",
      title: label,
      value: "waiting"
    })
  }

  function setWaitingReadyAction(): void {
    setButtonLabel(button, {
      ariaLabel: translateRuntime("marker.status.waitingPageReady"),
      disabled: true,
      size: "compact",
      title: translateRuntime("marker.status.waitingPageReady"),
      value: "waiting"
    })
  }

  function hideAction(): void {
    setButtonLabel(button, {
      ariaLabel: translateRuntime("marker.status.markRead"),
      disabled: false,
      hidden: true,
      size: "regular",
      title: "",
      value: "manual"
    })
  }

  function showRetryAction(): void {
    retryButton.hidden = options?.onRetryAnalysis === undefined
  }

  function hideRetryAction(): void {
    retryButton.hidden = true
  }

  function setReadAction(): void {
    setButtonLabel(button, {
      ariaLabel: translateRuntime("marker.status.read"),
      disabled: true,
      size: "regular",
      title: translateRuntime("marker.status.read"),
      value: "read"
    })
  }

  function getFloatingStatusText(state: FloatingMarkerState): string {
    if (
      state.kind === "prechecking" ||
      state.kind === "queued" ||
      state.kind === "claiming" ||
      state.kind === "embedding"
    ) {
      return hovered ? createStateText(state) : ""
    }

    if (state.kind === "completed") {
      const compactText = extractCompactDuplicateText(state)

      if (compactText === null) {
        return createStateText(state)
      }

      return hovered ? createLabeledCompactDuplicateText(compactText) : compactText
    }

    return createStateText(state)
  }

  container.addEventListener("mouseenter", () => {
    hovered = true

    if (currentState !== null) {
      status.textContent = getFloatingStatusText(currentState)
    }
  })

  container.addEventListener("mouseleave", () => {
    hovered = false

    if (currentState !== null) {
      status.textContent = getFloatingStatusText(currentState)
    }
  })

  return {
    setStatus(text: string) {
      currentState = null
      removeRing()
      setManualAction()
      hideRetryAction()
      status.textContent = text
    },

    setState(state: FloatingMarkerState) {
      currentState = state

      if (state.kind === "countdown" || state.kind === "unknown-duplicate-countdown") {
        setRingProgress(state.progressPercent)
      } else {
        removeRing()
      }

      if (
        state.kind === "prechecking" ||
        state.kind === "queued" ||
        state.kind === "claiming" ||
        state.kind === "embedding"
      ) {
        setWaitingAction(createStateText(state))
      } else if (state.kind === "waiting-ready") {
        setWaitingReadyAction()
      } else if (state.kind === "insufficient-content") {
        hideAction()
      } else if (state.kind === "countdown" || state.kind === "unknown-duplicate-countdown") {
        hideAction()
      } else if (state.kind === "completed" && (state.hideAction ?? false)) {
        setReadAction()
      } else if (state.kind === "already-read") {
        hideAction()
      } else {
        setManualAction()
      }

      if (state.kind === "failed" || state.kind === "precheck-failed") {
        showRetryAction()
      } else {
        hideRetryAction()
      }

      status.textContent = getFloatingStatusText(state)
      const density = shouldUseCompactFloatingDensity(state) ? "compact" : "regular"
      shell.setAttribute(
        "data-density",
        density
      )
      container.setAttribute("data-density", density)
    },

    showKnowledgeGain(input) {
      showKnowledgeGain(input.count)
    },

    primeNovelClaimsOverlay(input) {
      primeNovelClaimsOverlay(input.claims, input.durationMs, input.maxVisibleClaims)
    },

    showNovelClaimsOverlay(input) {
      renderNovelClaimsOverlay(input.claims, input.durationMs, input.maxVisibleClaims)
    }
  }
}

export function clearFloatingMarker(): void {
  document.getElementById(FLOATING_MARKER_HOST_ID)?.remove()
  for (const marker of document.querySelectorAll<HTMLElement>(
    ".cognitive-delta-inline-marker, .cognitive-delta-kdb-badge, .cognitive-delta-claims-overlay"
  )) {
    marker.remove()
  }
  clearStandaloneKnowledgeBadge()
}

export function createInlineMarker(target: Element, onManualRead: () => void): StatusMarker {
  ensureStyles()
  ensureStandaloneKnowledgeBadge()
  const targetElement = target as HTMLElement

  if (getComputedStyle(targetElement).position === "static") {
    targetElement.style.position = "relative"
  }

  const marker = document.createElement("div")
  marker.className = "cognitive-delta-inline-marker"
  marker.title = translateRuntime("marker.status.waitingAnalysis")
  applyTheme(marker)

  const status = document.createElement("span")
  status.className = "cognitive-delta-inline-status"
  status.textContent = ""

  const button = document.createElement("button")
  button.className = "cognitive-delta-action"
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    onManualRead()
  })

  marker.append(status, button)
  targetElement.append(marker)

  let ring: HTMLElement | null = null
  let currentState: FloatingMarkerState | null = null
  let hovered = false

  function getInlineStatusText(state: FloatingMarkerState): string {
    if (state.kind === "manual-ready" || state.kind === "countdown") {
      return hovered ? createStateText(state) : createCompactDuplicateText(state.duplicateScore)
    }

    if (state.kind === "completed") {
      return hovered ? createStateText(state) : state.compactText ?? createStateText(state)
    }

    if (state.kind === "already-read") {
      return hovered ? (state.text ?? translateRuntime("marker.status.read")) : state.compactText ?? ""
    }

    if (state.kind === "insufficient-content") {
      return hovered ? createStateText(state) : translateRuntime("marker.status.unableToJudge")
    }

    return createStateText(state)
  }

  function setTooltip(text: string): void {
    marker.title = text
  }

  function showInlineAction(): void {
    button.hidden = false
  }

  function hideInlineAction(): void {
    button.hidden = true
  }

  function removeInlineRing(): void {
    ring?.remove()
    ring = null
  }

  function showInlineRing(progressPercent: number): void {
    if (ring === null) {
      ring = createCountdownRing(progressPercent)
      marker.append(ring)
      return
    }

    ring.style.setProperty("--cognitive-delta-progress", `${progressPercent}%`)
  }

  function setInlineWaveform(input: { readonly disabled: boolean; readonly title: string }): void {
    setButtonLabel(button, {
      ariaLabel: input.disabled
        ? translateRuntime("marker.status.waitingPageReady")
        : translateRuntime("marker.status.markRead"),
      disabled: input.disabled,
      title: input.title,
      value: "waveform"
    })
  }

  function setInlineWaiting(title: string): void {
    setButtonLabel(button, {
      ariaLabel: title,
      disabled: true,
      title,
      value: "waiting"
    })
  }

  function setInlineSuccess(title: string): void {
    setButtonLabel(button, {
      ariaLabel: title,
      disabled: true,
      title,
      value: "success"
    })
  }

  function setInlineConfirm(title: string): void {
    setButtonLabel(button, {
      ariaLabel: translateRuntime("marker.status.markRead"),
      disabled: false,
      title,
      value: "confirm"
    })
  }

  setInlineWaveform({
    disabled: false,
    title: `${translateRuntime("marker.status.waitingAnalysis")} · ${translateRuntime(
      "marker.status.clickToMarkRead"
    )}`
  })

  marker.addEventListener("mouseenter", () => {
    hovered = true

    if (currentState !== null) {
      status.textContent = getInlineStatusText(currentState)
    }
  })

  marker.addEventListener("mouseleave", () => {
    hovered = false

    if (currentState !== null) {
      status.textContent = getInlineStatusText(currentState)
    }
  })

  return {
    setStatus(text: string) {
      currentState = null
      showInlineAction()
      removeInlineRing()
      status.textContent = text
      setTooltip(text)
      setInlineWaveform({
        disabled: false,
        title: `${text} · ${translateRuntime("marker.status.clickToMarkRead")}`
      })
    },

    setState(state: FloatingMarkerState) {
      currentState = state
      const nextText = createStateText(state)
      if (state.kind === "already-read") {
        removeInlineRing()
        hideInlineAction()
        status.textContent = getInlineStatusText(state)
      } else if (state.kind === "insufficient-content") {
        removeInlineRing()
        hideInlineAction()
        status.textContent = getInlineStatusText(state)
      } else if (state.kind === "manual-ready") {
        removeInlineRing()
        showInlineAction()
        status.textContent = getInlineStatusText(state)
        setInlineConfirm(nextText)
      } else if (state.kind === "waiting-ready") {
        removeInlineRing()
        showInlineAction()
        status.textContent = ""
      setInlineWaveform({
        disabled: true,
        title: translateRuntime("marker.status.waitingPageReady")
      })
      } else if (
        state.kind === "countdown" ||
        state.kind === "unknown-duplicate-countdown"
      ) {
        hideInlineAction()
        status.textContent = state.kind === "countdown" ? getInlineStatusText(state) : ""
        showInlineRing(state.progressPercent)
      } else if (
        state.kind === "prechecking" ||
        state.kind === "queued" ||
        state.kind === "claiming" ||
        state.kind === "embedding"
      ) {
        removeInlineRing()
        showInlineAction()
        status.textContent = ""
        setInlineWaiting(nextText || translateRuntime("marker.status.calculating"))
      } else if (state.kind === "completed") {
        removeInlineRing()
        status.textContent = getInlineStatusText(state)
        if (state.hideAction ?? true) {
          hideInlineAction()
        } else {
          showInlineAction()
          setInlineSuccess(nextText)
        }
      } else {
        removeInlineRing()
        showInlineAction()
        status.textContent = ""
        setInlineWaveform({
          disabled: false,
          title: nextText
            ? `${nextText} · ${translateRuntime("marker.status.clickToMarkRead")}`
            : translateRuntime("marker.status.clickToMarkRead")
        })
      }
      if (
        state.kind !== "already-read" &&
        state.kind !== "insufficient-content" &&
        state.kind !== "manual-ready" &&
        state.kind !== "countdown" &&
        state.kind !== "unknown-duplicate-countdown" &&
        state.kind !== "completed"
      ) {
        status.textContent = nextText
      }
      setTooltip(nextText)
    }
  }
}
