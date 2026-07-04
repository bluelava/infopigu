import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { Settings } from "../shared/types"

interface ReadModeSettingsProps {
  readonly onChange: (nextSettings: Settings) => Promise<void> | void
  readonly settings: Settings
}

export function ReadModeSettings(props: ReadModeSettingsProps): JSX.Element {
  const { t } = useI18n()

  return (
    <section className="card">
      <p className="eyebrow">{t("options.readModes.eyebrow")}</p>
      <h2 className="title">{t("options.readModes.title")}</h2>
      <div className="stack">
        <fieldset className="stack">
          <legend className="body-copy">{t("options.readModes.single")}</legend>
          <label className="row">
            <input
              checked={props.settings.singleArticleReadMode === "auto"}
              name="single-article-read-mode"
              onChange={() => {
                void props.onChange({
                  ...props.settings,
                  singleArticleReadMode: "auto"
                })
              }}
              type="radio"
              value="auto"
            />
            <span className="body-copy">{t("options.auto")}</span>
          </label>
          <label className="row">
            <input
              checked={props.settings.singleArticleReadMode === "manual"}
              name="single-article-read-mode"
              onChange={() => {
                void props.onChange({
                  ...props.settings,
                  singleArticleReadMode: "manual"
                })
              }}
              type="radio"
              value="manual"
            />
            <span className="body-copy">{t("options.manual")}</span>
          </label>
        </fieldset>

        <fieldset className="stack">
          <legend className="body-copy">{t("options.readModes.feed")}</legend>
          <label className="row">
            <input
              checked={props.settings.feedItemReadMode === "auto"}
              name="feed-item-read-mode"
              onChange={() => {
                void props.onChange({
                  ...props.settings,
                  feedItemReadMode: "auto"
                })
              }}
              type="radio"
              value="auto"
            />
            <span className="body-copy">{t("options.auto")}</span>
          </label>
          <label className="row">
            <input
              checked={props.settings.feedItemReadMode === "manual"}
              name="feed-item-read-mode"
              onChange={() => {
                void props.onChange({
                  ...props.settings,
                  feedItemReadMode: "manual"
                })
              }}
              type="radio"
              value="manual"
            />
            <span className="body-copy">{t("options.manual")}</span>
          </label>
        </fieldset>

        <label className="stack" htmlFor="novel-claims-overlay-seconds-input">
          <span className="body-copy">{t("options.readModes.novelClaimsOverlay")}</span>
          <input
            className="text-input"
            id="novel-claims-overlay-seconds-input"
            min={1}
            name="novel-claims-overlay-seconds"
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value)

              void props.onChange({
                ...props.settings,
                novelClaimsOverlaySeconds: Number.isFinite(nextValue) ? nextValue : 5,
                novelClaimsOverlaySecondsCustomized: true
              })
            }}
            type="number"
            value={props.settings.novelClaimsOverlaySeconds}
          />
        </label>

        <label className="stack" htmlFor="novel-claims-overlay-max-visible-input">
          <span className="body-copy">{t("options.readModes.novelClaimsMaxVisible")}</span>
          <input
            className="text-input"
            id="novel-claims-overlay-max-visible-input"
            min={1}
            name="novel-claims-overlay-max-visible"
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value)

              void props.onChange({
                ...props.settings,
                novelClaimsOverlayMaxVisible: Number.isFinite(nextValue) ? nextValue : 5
              })
            }}
            type="number"
            value={props.settings.novelClaimsOverlayMaxVisible}
          />
        </label>
      </div>
    </section>
  )
}
