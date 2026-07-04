import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { FeedbackType } from "../shared/types"

type FeedbackSubmissionState = "idle" | "submitting" | "submitted" | "failed"

interface FeedbackButtonsProps {
  readonly errorMessage?: string | null
  readonly onSubmit: (feedbackType: FeedbackType) => Promise<void> | void
  readonly submittedFeedbackType: FeedbackType | null
  readonly submissionState: FeedbackSubmissionState
}

function getButtonLabel(
  label: string,
  feedbackType: FeedbackType,
  submittedFeedbackType: FeedbackType | null,
  submissionState: FeedbackSubmissionState,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (submittedFeedbackType !== feedbackType) {
    return label
  }

  if (submissionState === "submitting") {
    return `${label} · ${t("sidepanel.feedback.submittingSuffix")}`
  }

  if (submissionState === "submitted") {
    return `${label} · ${t("sidepanel.feedback.submittedSuffix")}`
  }

  if (submissionState === "failed") {
    return `${label} · ${t("sidepanel.feedback.failedSuffix")}`
  }

  return label
}

function getStatusCopy(
  submittedFeedbackType: FeedbackType | null,
  submissionState: FeedbackSubmissionState,
  t: ReturnType<typeof useI18n>["t"],
  errorMessage?: string | null
): string | null {
  if (submittedFeedbackType === null) {
    return null
  }

  if (submissionState === "submitting") {
    return t("sidepanel.feedback.submittingStatus")
  }

  if (submissionState === "submitted") {
    return t("sidepanel.feedback.submittedStatus")
  }

  if (submissionState === "failed") {
    return errorMessage ?? t("sidepanel.feedback.failedStatus")
  }

  return null
}

export function FeedbackButtons(props: FeedbackButtonsProps): JSX.Element {
  const { t } = useI18n()
  const feedbackOptions: readonly { readonly label: string; readonly type: FeedbackType }[] = [
    { label: t("sidepanel.feedback.accurate"), type: "accurate" },
    { label: t("sidepanel.feedback.notDuplicate"), type: "not_duplicate" },
    { label: t("sidepanel.feedback.alreadyKnown"), type: "already_known" },
    { label: t("sidepanel.feedback.notImportant"), type: "not_important" }
  ]
  const statusCopy = getStatusCopy(props.submittedFeedbackType, props.submissionState, t, props.errorMessage)

  return (
    <section className="card">
      <p className="eyebrow">{t("sidepanel.feedback.title")}</p>
      <div className="stack feedback-layout">
        <div className="row feedback-actions">
          {feedbackOptions.map((option) => {
            const isActive = props.submittedFeedbackType === option.type
            const isSubmitting = isActive && props.submissionState === "submitting"
            const isFailed = isActive && props.submissionState === "failed"

            return (
              <button
                aria-pressed={isActive}
                className={[
                  isActive ? "primary-button" : "secondary-button",
                  isSubmitting ? "feedback-button-pending" : "",
                  isFailed ? "feedback-button-failed" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={props.submissionState === "submitting"}
                key={option.type}
                onClick={() => void props.onSubmit(option.type)}
                type="button"
              >
                {getButtonLabel(
                  option.label,
                  option.type,
                  props.submittedFeedbackType,
                  props.submissionState,
                  t
                )}
              </button>
            )
          })}
        </div>
        <div className="feedback-note">
          <p className="body-copy">{t("sidepanel.feedback.note.results")}</p>
          <p className="body-copy">{t("sidepanel.feedback.note.privacy")}</p>
        </div>
        {statusCopy === null ? null : (
          <p
            aria-live="polite"
            className={`body-copy feedback-status ${
              props.submissionState === "failed" ? "feedback-status-error" : ""
            }`}
          >
            {statusCopy}
          </p>
        )}
      </div>
    </section>
  )
}
