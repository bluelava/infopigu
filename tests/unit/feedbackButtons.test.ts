// @vitest-environment jsdom
import type { JSX } from "react"
import { act, createElement, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { FeedbackType } from "../../src/shared/types"
import { FeedbackButtons } from "../../src/sidepanel/FeedbackButtons"

let cleanupRoot: { readonly unmount: () => void } | null = null
let cleanupContainer: HTMLDivElement | null = null

afterEach(() => {
  cleanupRoot?.unmount()
  cleanupRoot = null
  cleanupContainer?.remove()
  cleanupContainer = null
})

describe("FeedbackButtons", () => {
  it("shows submitting and submitted states after a feedback choice is clicked", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root
    const onSubmit = vi.fn()
    let resolveSubmission: (() => void) | null = null

    function FeedbackHarness(): JSX.Element {
      const [submittedFeedbackType, setSubmittedFeedbackType] = useState<FeedbackType | null>(null)
      const [submissionState, setSubmissionState] = useState<
        "idle" | "submitting" | "submitted" | "failed"
      >("idle")

      async function handleSubmit(feedbackType: FeedbackType): Promise<void> {
        onSubmit(feedbackType)
        setSubmittedFeedbackType(feedbackType)
        setSubmissionState("submitting")
        await new Promise<void>((resolve) => {
          resolveSubmission = resolve
        })
        setSubmissionState("submitted")
      }

      return createElement(FeedbackButtons, {
        errorMessage: null,
        onSubmit: handleSubmit,
        submittedFeedbackType,
        submissionState
      })
    }

    await act(async () => {
      root.render(createElement(FeedbackHarness))
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Not actually duplicate"
    )

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("expected feedback button")
    }

    await act(async () => {
      button.click()
    })

    expect(onSubmit).toHaveBeenCalledWith("not_duplicate")
    expect(container.textContent).toContain("Submitting feedback")
    expect(button.textContent).toContain("Submitting")

    await act(async () => {
      resolveSubmission?.()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Feedback saved")
    expect(button.textContent).toContain("Submitted")
  })

  it("shows a privacy note describing the submitted feedback content", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    cleanupContainer = container

    const root = createRoot(container)
    cleanupRoot = root

    await act(async () => {
      root.render(
        createElement(FeedbackButtons, {
          errorMessage: null,
          onSubmit: vi.fn(),
          submittedFeedbackType: null,
          submissionState: "idle"
        })
      )
    })

    expect(container.textContent).toContain("current result ID")
    expect(container.textContent).toContain("selected feedback type")
    expect(container.textContent).toContain("do not include")
    expect(container.textContent).toContain("written only to your local results store")
    expect(container.textContent).toContain("not sent to our backend service")
  })
})
