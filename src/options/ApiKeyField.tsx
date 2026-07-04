import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"

interface ApiKeyFieldProps {
  readonly id: string
  readonly label: string
  readonly onChange: (nextValue: string) => void
  readonly value: string
  readonly visible: boolean
  readonly onToggleVisibility: () => void
}

export function ApiKeyField(props: ApiKeyFieldProps): JSX.Element {
  const { t } = useI18n()

  return (
    <label className="stack" htmlFor={props.id}>
      <span className="body-copy">{props.label}</span>
      <div className="row">
        <input
          className="text-input"
          id={props.id}
          onChange={(event) => {
            props.onChange(event.currentTarget.value)
          }}
          placeholder="API Key"
          type={props.visible ? "text" : "password"}
          value={props.value}
        />
        <button
          aria-label={props.visible ? t("options.apiKey.hide") : t("options.apiKey.show")}
          className="secondary-button"
          onClick={props.onToggleVisibility}
          type="button"
        >
          {props.visible ? t("options.apiKey.hide") : t("options.apiKey.show")}
        </button>
      </div>
    </label>
  )
}
