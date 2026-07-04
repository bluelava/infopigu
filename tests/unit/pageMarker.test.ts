// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  clearFloatingMarker,
  createFloatingMarker,
  createInlineMarker,
  setMarkerLocale
} from "../../src/content/pageMarker"

afterEach(() => {
  clearFloatingMarker()
  document.head.innerHTML = ""
  document.body.innerHTML = ""
  document.documentElement.innerHTML = "<head></head><body></body>"
  setMarkerLocale("zh-CN")
})

describe("createFloatingMarker", () => {
  it("keeps the floating marker mounted while updating status", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setStatus("分析中")

    const container = document.querySelector(".cognitive-delta-floating-marker")

    expect(container).not.toBeNull()
    expect(container?.textContent).toContain("分析中")
    expect(container?.textContent).toContain("标记已读")
  })

  it("keeps prechecking text hidden while preserving the hourglass label", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "prechecking" })

    const container = document.querySelector(".cognitive-delta-floating-marker")
    const status = container?.querySelector("span")
    const button = container?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toBe("")
    expect(button?.getAttribute("aria-label")).toBe("重复度检测中")
  })

  it("hides the manual read button once the page is already marked as read", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "already-read" })

    const button = document.querySelector(
      ".cognitive-delta-floating-marker .cognitive-delta-action"
    ) as HTMLButtonElement | null

    expect(button).not.toBeNull()
    expect(button?.hidden).toBe(true)
  })

  it("renders countdown progress for auto-read", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "countdown",
      duplicateScore: 0.24,
      progressPercent: 50
    })

    expect(document.querySelector(".cognitive-delta-countdown-ring")).not.toBeNull()
    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).toContain("24%")
    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).not.toContain(
      "倒计时中"
    )
  })

  it("hides the single-article manual button while auto-read countdown is running", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "countdown",
      duplicateScore: 0.24,
      progressPercent: 50
    })

    const button = document.querySelector(
      ".cognitive-delta-floating-marker .cognitive-delta-action"
    ) as HTMLButtonElement | null

    expect(button?.hidden).toBe(true)
  })

  it("renders the single-article auto-read countdown ring at the far right action area", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "countdown",
      duplicateScore: 0.24,
      progressPercent: 50
    })

    const container = document.querySelector(".cognitive-delta-floating-marker")
    const actionArea = container?.lastElementChild
    const ring = actionArea?.lastElementChild

    expect(actionArea?.className).toContain("cognitive-delta-floating-actions")
    expect(ring?.className).toContain("cognitive-delta-countdown-ring")
  })

  it("updates countdown progress without recreating the ring element", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "countdown",
      duplicateScore: 0.24,
      progressPercent: 20
    })

    const firstRing = document.querySelector(".cognitive-delta-countdown-ring")

    marker.setState({
      kind: "countdown",
      duplicateScore: 0.24,
      progressPercent: 40
    })

    const secondRing = document.querySelector(".cognitive-delta-countdown-ring")

    expect(firstRing).not.toBeNull()
    expect(secondRing).toBe(firstRing)
    expect((secondRing as HTMLElement | null)?.style.getPropertyValue("--cognitive-delta-progress")).toBe(
      "40%"
    )
  })

  it("shows the high-duplicate waiting state with manual CTA still visible", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "high-duplicate", duplicateScore: 0.71 })

    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).toContain(
      "重复度较高"
    )
    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).toContain(
      "标记已读"
    )
  })

  it("shows unknown-duplicate countdown and precheck-failure fallback states", () => {
    const marker = createFloatingMarker(() => undefined)
    marker.setState({ kind: "unknown-duplicate-countdown", progressPercent: 20 })

    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).toContain(
      "重复度未知"
    )

    marker.setState({ kind: "precheck-failed" })

    expect(document.querySelector(".cognitive-delta-floating-marker")?.textContent).toContain(
      "预检失败"
    )
  })

  it("shows a retry-analysis button for failed single-article analysis and invokes it", () => {
    const onRetryAnalysis = vi.fn()
    const marker = createFloatingMarker(() => undefined, {
      onRetryAnalysis
    })

    marker.setState({
      kind: "failed",
      text: "分析失败"
    })

    const retryButton = document.querySelector(
      ".cognitive-delta-floating-marker .cognitive-delta-retry-action"
    ) as HTMLButtonElement | null

    expect(retryButton?.hidden).toBe(false)
    expect(retryButton?.textContent).toBe("重新分析")

    retryButton?.click()

    expect(onRetryAnalysis).toHaveBeenCalledTimes(1)
  })

  it("shows a waiting hourglass button after countdown hands off to queued analysis", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "queued" })

    const container = document.querySelector(".cognitive-delta-floating-marker")
    const status = container?.querySelector("span")
    const button = container?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toBe("")
    expect(button?.textContent).toContain("⌛")
    expect(button?.disabled).toBe(true)
  })

  it("keeps the single-article waiting text hidden until hover", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "queued" })

    const container = document.querySelector(".cognitive-delta-floating-marker") as HTMLElement | null
    const status = container?.querySelector("span") as HTMLSpanElement | null

    expect(status?.textContent).toBe("")

    container?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    expect(status?.textContent).toBe("重复度计算中")

    container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
    expect(status?.textContent).toBe("")
  })

  it("shows a green read pill once a completed single-article result is confirmed as already read", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "completed",
      hideAction: true,
      text: "重复度 53% · 建议略读"
    })

    const button = document.querySelector(
      ".cognitive-delta-floating-marker .cognitive-delta-action"
    ) as HTMLButtonElement | null

    expect(button?.hidden).toBe(false)
    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toContain("已读")
    expect(button?.getAttribute("data-variant")).toBe("read")
  })

  it("shows only the duplicate score by default for completed single-article results", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "completed",
      compactText: "53%",
      hideAction: true,
      text: "重复度 53% · 建议略读"
    })

    const container = document.querySelector(".cognitive-delta-floating-marker") as HTMLElement | null
    const status = container?.querySelector("span") as HTMLSpanElement | null

    expect(status?.textContent).toBe("53%")

    container?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    expect(status?.textContent).toBe("重复度 53%")

    container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
    expect(status?.textContent).toBe("53%")
  })

  it("renders the single-article read pill as a gray non-busy control", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "completed",
      hideAction: true,
      text: "重复度 53% · 建议略读"
    })

    const styleTag = document.getElementById("cognitive-delta-marker-style")

    expect(styleTag?.textContent).toContain('.cognitive-delta-action[data-variant="read"]')
    expect(styleTag?.textContent).toContain("background: #e5e7eb")
    expect(styleTag?.textContent).toContain("color: #6b7280")
    expect(styleTag?.textContent).toContain('cursor: default')
  })

  it("keeps the knowledge-base icon button aligned to the single-article pill height", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "waiting-ready" })

    const styleTag = document.getElementById("cognitive-delta-marker-style")
    const knowledgeBadge = document.querySelector(
      ".cognitive-delta-kdb-badge"
    ) as HTMLElement | null

    expect(styleTag?.textContent).toContain("padding: 6px 10px")
    expect(styleTag?.textContent).toContain(
      ".cognitive-delta-floating-marker,\n    .cognitive-delta-inline-marker,\n    .cognitive-delta-kdb-badge"
    )
    expect(styleTag?.textContent).toContain("position: relative")
    expect(styleTag?.textContent).toContain("width: var(--cognitive-delta-floating-pill-height)")
    expect(styleTag?.textContent).toContain("height: var(--cognitive-delta-floating-pill-height)")
    expect(styleTag?.textContent).toContain("padding: 0")
    expect(styleTag?.textContent).toContain("box-sizing: border-box")
    expect(knowledgeBadge).not.toBeNull()
    expect(knowledgeBadge?.getAttribute("aria-label")).toContain("知识库")
  })

  it("restores the shared compact height for the single-article calculating pill and knowledge-base icon", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "queued" })

    const styleTag = document.getElementById("cognitive-delta-marker-style")

    expect(styleTag?.textContent).toContain("--cognitive-delta-floating-pill-height: 26px")
    expect(styleTag?.textContent).toContain("--cognitive-delta-floating-pill-height-compact: 22px")
    expect(styleTag?.textContent).toContain(".cognitive-delta-floating-marker[data-density=\"compact\"]")
    expect(styleTag?.textContent).toContain("min-height: var(--cognitive-delta-floating-pill-height-compact)")
    expect(styleTag?.textContent).toContain("padding: 4px 8px")
  })

  it("keeps the single-article knowledge-base icon on the shared pill height in compact states", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "queued" })

    const styleTag = document.getElementById("cognitive-delta-marker-style")

    expect(styleTag?.textContent).not.toContain(
      ".cognitive-delta-floating-shell[data-density=\"compact\"] .cognitive-delta-kdb-badge"
    )
    expect(styleTag?.textContent).toContain("width: var(--cognitive-delta-floating-pill-height)")
    expect(styleTag?.textContent).toContain("height: var(--cognitive-delta-floating-pill-height)")
  })

  it("uses a compact single-article calculating pill while analysis is in progress", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "queued" })

    const container = document.querySelector(
      ".cognitive-delta-floating-marker"
    ) as HTMLElement | null
    const button = container?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null
    const shell = document.querySelector(
      ".cognitive-delta-floating-shell"
    ) as HTMLElement | null

    expect(container?.getAttribute("data-density")).toBe("compact")
    expect(shell?.getAttribute("data-density")).toBe("compact")
    expect(button?.getAttribute("data-size")).toBe("compact")
  })

  it("keeps the single-article completed state compact after the article is marked read", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "completed",
      compactText: "0%",
      hideAction: true,
      text: "重复度 0% · 建议阅读"
    })

    const container = document.querySelector(
      ".cognitive-delta-floating-marker"
    ) as HTMLElement | null
    const shell = document.querySelector(
      ".cognitive-delta-floating-shell"
    ) as HTMLElement | null

    expect(container?.getAttribute("data-density")).toBe("compact")
    expect(shell?.getAttribute("data-density")).toBe("compact")
  })

  it("keeps the single-article already-read state compact", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "already-read",
      compactText: "0%",
      text: "重复度 0% · 已读"
    })

    const container = document.querySelector(
      ".cognitive-delta-floating-marker"
    ) as HTMLElement | null
    const shell = document.querySelector(
      ".cognitive-delta-floating-shell"
    ) as HTMLElement | null

    expect(container?.getAttribute("data-density")).toBe("compact")
    expect(shell?.getAttribute("data-density")).toBe("compact")
  })

  it("shows a frosted novel-claims overlay above the floating marker and hides it after the configured duration", () => {
    vi.useFakeTimers()

    try {
      const marker = createFloatingMarker(() => undefined)

      marker.showNovelClaimsOverlay?.({
        claims: ["新增 Claim A", "新增 Claim B"],
        durationMs: 20_000
      })

      const overlay = document.querySelector(
        ".cognitive-delta-claims-overlay"
      ) as HTMLElement | null

      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain("新增 Claim A")
      expect(overlay?.textContent).toContain("新增 Claim B")
      expect(overlay?.className).toContain("cognitive-delta-glass")

      const styleTag = document.getElementById("cognitive-delta-marker-style")
      expect(styleTag?.textContent).toContain("backdrop-filter: blur(28px)")
      expect(styleTag?.textContent).toContain("saturate(180%)")
      expect(styleTag?.textContent).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.52)")

      vi.advanceTimersByTime(20_000)

      expect(document.querySelector(".cognitive-delta-claims-overlay")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("animates a red +N knowledge gain badge above the knowledge-base icon and removes it shortly after", () => {
    vi.useFakeTimers()

    try {
      const marker = createFloatingMarker(() => undefined)

      marker.showKnowledgeGain?.({ count: 3 })

      const gainBadge = document.querySelector(
        ".cognitive-delta-kdb-gain"
      ) as HTMLElement | null

      expect(gainBadge).not.toBeNull()
      expect(gainBadge?.textContent).toBe("+3")

      const styleTag = document.getElementById("cognitive-delta-marker-style")
      expect(styleTag?.textContent).toContain("color: #dc2626")
      expect(styleTag?.textContent).toContain("font-weight: 700")

      vi.advanceTimersByTime(2_000)

      expect(document.querySelector(".cognitive-delta-kdb-gain")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows an icon-only waiting state before single-article auto mode becomes ready", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "waiting-ready" })

    const container = document.querySelector(".cognitive-delta-floating-marker")
    const status = container?.querySelector("span")
    const button = container?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toBe("")
    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute("data-variant")).toBe("waiting")
  })

  it("shows a green read pill after the manual single-article button is clicked and marked read", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.setState({
      kind: "completed",
      hideAction: true,
      text: "重复度 53% · 建议略读"
    })

    const button = document.querySelector(
      ".cognitive-delta-floating-marker .cognitive-delta-action"
    ) as HTMLButtonElement | null

    expect(button?.textContent).toContain("已读")
    expect(button?.getAttribute("data-variant")).toBe("read")
  })

  it("renders feed inline markers as compact icon buttons with hover text instead of a large label", () => {
    const target = document.createElement("article")
    document.body.append(target)

    createInlineMarker(target, () => undefined)

    const marker = document.querySelector(".cognitive-delta-inline-marker")
    const button = marker?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null
    const styleTag = document.getElementById("cognitive-delta-marker-style")

    expect(marker).not.toBeNull()
    expect(styleTag?.textContent).toContain("left: 50%")
    expect(styleTag?.textContent).toContain("transform: translateX(-50%)")
    expect(styleTag?.textContent).toContain(".cognitive-delta-inline-marker:hover")
    expect(styleTag?.textContent).toContain("padding: 2px 6px")
    expect(button).not.toBeNull()
    expect(button?.textContent).not.toContain("标记已读")
    expect(button?.title).toContain("标记已读")
    expect(button?.getAttribute("data-variant")).toBe("waveform")
  })

  it("uses a slimmer and more transparent inline shell for feed markers", () => {
    const target = document.createElement("article")
    document.body.append(target)

    createInlineMarker(target, () => undefined)

    const styleTag = document.getElementById("cognitive-delta-marker-style")

    expect(styleTag?.textContent).toContain("background: rgba(255, 250, 240, 0.56)")
    expect(styleTag?.textContent).toContain("padding: 2px 4px")
    expect(styleTag?.textContent).toContain(".cognitive-delta-inline-marker:hover")
    expect(styleTag?.textContent).toContain("padding: 2px 6px")
    expect(styleTag?.textContent).toContain(".cognitive-delta-inline-marker .cognitive-delta-action")
    expect(styleTag?.textContent).toContain("width: 12px")
    expect(styleTag?.textContent).toContain("height: 12px")
    expect(styleTag?.textContent).toContain("font-size: 10px")
    expect(styleTag?.textContent).toContain(".cognitive-delta-inline-marker .cognitive-delta-countdown-ring")
  })

  it("renders feed inline markers as disabled waveform buttons until the page becomes ready", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({ kind: "waiting-ready" })

    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute("data-variant")).toBe("waveform")
  })

  it("clears lingering inline feed markers when the page switches into single-article mode", () => {
    const target = document.createElement("article")
    document.body.append(target)

    createInlineMarker(target, () => undefined)

    expect(document.querySelector(".cognitive-delta-inline-marker")).not.toBeNull()

    clearFloatingMarker()

    expect(document.querySelector(".cognitive-delta-inline-marker")).toBeNull()
  })

  it("shows the duplicate score with a countdown ring for auto unread feed items", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({
      kind: "countdown",
      duplicateScore: 0.53,
      progressPercent: 35
    })

    const status = target.querySelector(".cognitive-delta-inline-status")
    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null
    const ring = target.querySelector(".cognitive-delta-countdown-ring") as HTMLElement | null

    expect(status?.textContent).toContain("53%")
    expect(button?.hidden).toBe(true)
    expect(ring).not.toBeNull()
    expect(ring?.style.getPropertyValue("--cognitive-delta-progress")).toBe("35%")
  })

  it("pins a standalone knowledge-base icon to the bottom-right when feed inline markers are present", () => {
    const target = document.createElement("article")
    document.body.append(target)

    createInlineMarker(target, () => undefined)

    const badge = document.querySelector(
      ".cognitive-delta-kdb-badge--standalone"
    ) as HTMLElement | null

    expect(badge).not.toBeNull()
    expect(badge?.getAttribute("aria-label")).toContain("知识库")
  })

  it("removes the standalone knowledge-base icon before mounting the single-article floating marker", () => {
    const target = document.createElement("article")
    document.body.append(target)

    createInlineMarker(target, () => undefined)

    expect(document.querySelectorAll(".cognitive-delta-kdb-badge")).toHaveLength(1)
    expect(document.querySelector(".cognitive-delta-kdb-badge--standalone")).not.toBeNull()

    createFloatingMarker(() => undefined)

    expect(document.querySelectorAll(".cognitive-delta-kdb-badge")).toHaveLength(1)
    expect(document.querySelector(".cognitive-delta-kdb-badge--standalone")).toBeNull()
    expect(document.querySelector(".cognitive-delta-floating-shell .cognitive-delta-kdb-badge")).not.toBeNull()
  })

  it("limits the visible claims preview and renders a more button that opens the side panel", () => {
    const openSidePanel = vi.fn()
    const marker = createFloatingMarker(() => undefined, {
      openSidePanel
    })

    marker.showNovelClaimsOverlay?.({
      claims: [
        "新增 Claim 1",
        "新增 Claim 2",
        "新增 Claim 3",
        "新增 Claim 4",
        "新增 Claim 5",
        "新增 Claim 6"
      ],
      durationMs: 20_000,
      maxVisibleClaims: 3
    })

    const items = document.querySelectorAll(".cognitive-delta-claims-list li")
    const moreButton = document.querySelector(
      ".cognitive-delta-claims-overlay-more"
    ) as HTMLButtonElement | null

    expect(items).toHaveLength(3)
    expect(document.querySelector(".cognitive-delta-claims-overlay")?.textContent).toContain(
      "新增 Claim 3"
    )
    expect(document.querySelector(".cognitive-delta-claims-overlay")?.textContent).not.toContain(
      "新增 Claim 4"
    )
    expect(moreButton?.textContent).toContain("更多")

    moreButton?.click()

    expect(openSidePanel).toHaveBeenCalledTimes(1)
  })

  it("keeps the more button available for the popup even when all preview claims are visible", () => {
    const openSidePanel = vi.fn()
    const marker = createFloatingMarker(() => undefined, {
      openSidePanel
    })

    marker.showNovelClaimsOverlay?.({
      claims: ["新增 Claim 1", "新增 Claim 2"],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })

    const items = document.querySelectorAll(".cognitive-delta-claims-list li")
    const moreButton = document.querySelector(
      ".cognitive-delta-claims-overlay-more"
    ) as HTMLButtonElement | null

    expect(items).toHaveLength(2)
    expect(moreButton?.textContent).toContain("更多")

    moreButton?.click()

    expect(openSidePanel).toHaveBeenCalledTimes(1)
  })

  it("re-shows the latest claims popup when hovering the single-article knowledge-base icon", () => {
    vi.useFakeTimers()

    try {
      const marker = createFloatingMarker(() => undefined)

      marker.showNovelClaimsOverlay?.({
        claims: ["新增 Claim 1", "新增 Claim 2"],
        durationMs: 20_000,
        maxVisibleClaims: 5
      })

      vi.advanceTimersByTime(20_000)

      expect(document.querySelector(".cognitive-delta-claims-overlay")).toBeNull()

      const knowledgeBadge = document.querySelector(
        ".cognitive-delta-floating-shell .cognitive-delta-kdb-wrap"
      ) as HTMLElement | null

      knowledgeBadge?.dispatchEvent(new Event("pointerenter", { bubbles: true }))

      const overlay = document.querySelector(
        ".cognitive-delta-claims-overlay"
      ) as HTMLElement | null

      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain("新增 Claim 1")
      expect(overlay?.textContent).toContain("新增 Claim 2")
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows an empty-state popup on KDB hover when the page has no novel claims", () => {
    vi.useFakeTimers()

    try {
      const marker = createFloatingMarker(() => undefined)

      marker.primeNovelClaimsOverlay?.({
        claims: [],
        durationMs: 20_000,
        maxVisibleClaims: 5
      })

      const knowledgeBadge = document.querySelector(
        ".cognitive-delta-floating-shell .cognitive-delta-kdb-wrap"
      ) as HTMLElement | null

      knowledgeBadge?.dispatchEvent(new Event("pointerenter", { bubbles: true }))

      const overlay = document.querySelector(
        ".cognitive-delta-claims-overlay"
      ) as HTMLElement | null

      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain("本页无新增知识点")
    } finally {
      vi.useRealTimers()
    }
  })

  it("switches feed inline markers to an hourglass while calculation is in progress", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({ kind: "prechecking" })

    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toContain("⌛")
    expect(button?.getAttribute("data-variant")).toBe("waiting")
  })

  it("shows the duplicate score with a green confirm button for manual unread feed items", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({ kind: "manual-ready", duplicateScore: 0.53 })

    const status = target.querySelector(".cognitive-delta-inline-status")
    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toContain("53%")
    expect(button?.disabled).toBe(false)
    expect(button?.textContent).toContain("✓")
    expect(button?.getAttribute("data-variant")).toBe("confirm")
  })

  it("expands feed duplicate text on hover while keeping compact numbers by default", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({ kind: "manual-ready", duplicateScore: 0.53 })

    const container = target.querySelector(".cognitive-delta-inline-marker") as HTMLElement | null
    const status = target.querySelector(".cognitive-delta-inline-status") as HTMLElement | null

    expect(status?.textContent).toBe("53%")

    container?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
    expect(status?.textContent).toBe("重复度 53%")

    container?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }))
    expect(status?.textContent).toBe("53%")
  })

  it("invokes the feed manual-read callback when the confirm button is clicked", () => {
    const target = document.createElement("article")
    document.body.append(target)
    const onManualRead = vi.fn()

    const marker = createInlineMarker(target, onManualRead)
    marker.setState({ kind: "manual-ready", duplicateScore: 0.53 })

    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    button?.click()

    expect(onManualRead).toHaveBeenCalledTimes(1)
  })

  it("shows only the duplicate result after a feed item is already read", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({
      kind: "completed",
      compactText: "12%",
      hideAction: true,
      text: "重复度 12% · 建议阅读"
    })

    const status = target.querySelector(".cognitive-delta-inline-status")
    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toContain("12%")
    expect(button?.hidden).toBe(true)
  })

  it("hides the inline read button for already-read feed items", () => {
    const target = document.createElement("article")
    document.body.append(target)

    const marker = createInlineMarker(target, () => undefined)
    marker.setState({ kind: "already-read" })

    const button = target.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(button).not.toBeNull()
    expect(button?.hidden).toBe(true)
  })

  it("renders the hidden waiting label in English after the active locale changes", () => {
    setMarkerLocale("en")
    const marker = createFloatingMarker(() => undefined)

    marker.setState({ kind: "prechecking" })

    const container = document.querySelector(".cognitive-delta-floating-marker")
    const status = container?.querySelector("span")
    const button = container?.querySelector(".cognitive-delta-action") as HTMLButtonElement | null

    expect(status?.textContent).toBe("")
    expect(button?.getAttribute("aria-label")).toBe("Checking duplication")
  })

  it("localizes the new-claims popup title for Chinese and English locales", () => {
    const marker = createFloatingMarker(() => undefined)

    marker.showNovelClaimsOverlay?.({
      claims: ["新增 Claim 1"],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })

    expect(document.querySelector(".cognitive-delta-claims-overlay-title")?.textContent).toBe("新知识点")

    setMarkerLocale("zh-TW")
    marker.showNovelClaimsOverlay?.({
      claims: ["新增 Claim 1"],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })

    expect(document.querySelector(".cognitive-delta-claims-overlay-title")?.textContent).toBe("新知識點")

    setMarkerLocale("en")
    marker.showNovelClaimsOverlay?.({
      claims: ["New Claim 1"],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })

    expect(document.querySelector(".cognitive-delta-claims-overlay-title")?.textContent).toBe("NEW CLAIMS")
  })
})
