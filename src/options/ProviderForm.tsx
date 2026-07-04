import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { ProviderType } from "../shared/types"
import { ApiKeyField } from "./ApiKeyField"
import { providerDefaults } from "./providerSettingsDefaults"
import type { ProviderFormState, SaveProviderInput } from "./providerSettingsTypes"

interface ProviderFormProps {
  readonly form: ProviderFormState
  readonly onChange: (nextForm: ProviderFormState) => void
  readonly onSave: (input: SaveProviderInput) => void
  readonly apiKeyVisible: boolean
  readonly onToggleApiKeyVisibility: () => void
}

function parseCommaSeparatedModels(value: string): readonly string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function ProviderForm(props: ProviderFormProps): JSX.Element {
  const { t } = useI18n()

  return (
    <>
      <div className="row">
        <label className="stack" htmlFor="provider-type-input">
          <span className="body-copy">{t("options.providers.type")}</span>
          <select
            className="text-input"
            id="provider-type-input"
            onChange={(event) => {
              const type = event.currentTarget.value as ProviderType
              const defaults = providerDefaults[type]
              props.onChange({
                ...props.form,
                type,
                baseUrl: defaults.baseUrl,
                chatModels: defaults.chatModels,
                embeddingModels: defaults.embeddingModels,
                name:
                  props.form.name.length === 0 || props.form.name === providerDefaults[props.form.type].name
                    ? defaults.name
                    : props.form.name
              })
            }}
            value={props.form.type}
          >
            <option value="openai">OpenAI</option>
            <option value="bigmodel">BigModel</option>
            <option value="deepseek">DeepSeek</option>
            <option value="custom-openai-compatible">{t("options.providers.type.custom")}</option>
          </select>
        </label>
        <label className="stack" htmlFor="provider-name-input">
          <span className="body-copy">{t("options.providers.name")}</span>
          <input
            className="text-input"
            id="provider-name-input"
            onChange={(event) => {
              props.onChange({
                ...props.form,
                name: event.currentTarget.value
              })
            }}
            placeholder="Provider name"
            type="text"
            value={props.form.name}
          />
        </label>
      </div>
      <label className="stack" htmlFor="provider-base-url-input">
        <span className="body-copy">Base URL</span>
        <input
          className="text-input"
          id="provider-base-url-input"
          onChange={(event) => {
            props.onChange({
              ...props.form,
              baseUrl: event.currentTarget.value
            })
          }}
          placeholder="Base URL"
          type="text"
          value={props.form.baseUrl}
        />
      </label>
      <ApiKeyField
        id="provider-api-key-input"
        label="API Key"
        onChange={(apiKey) => {
          props.onChange({
            ...props.form,
            apiKey
          })
        }}
        onToggleVisibility={props.onToggleApiKeyVisibility}
        value={props.form.apiKey}
        visible={props.apiKeyVisible}
      />
      <label className="stack" htmlFor="provider-embedding-models-input">
        <span className="body-copy">{t("options.providers.embeddingModels")}</span>
        <input
          className="text-input"
          id="provider-embedding-models-input"
          onChange={(event) => {
            props.onChange({
              ...props.form,
              embeddingModels: event.currentTarget.value
            })
          }}
          placeholder="Embedding models comma-separated"
          type="text"
          value={props.form.embeddingModels}
        />
      </label>
      <label className="stack" htmlFor="provider-claim-models-input">
        <span className="body-copy">{t("options.providers.claimModels")}</span>
        <input
          className="text-input"
          id="provider-claim-models-input"
          onChange={(event) => {
            props.onChange({
              ...props.form,
              chatModels: event.currentTarget.value
            })
          }}
          placeholder="Chat models comma-separated"
          type="text"
          value={props.form.chatModels}
        />
      </label>
      <button
        className="primary-button"
        onClick={() => {
          props.onSave({
            apiKey: props.form.apiKey.trim(),
            baseUrl: props.form.baseUrl.trim(),
            chatModels: parseCommaSeparatedModels(props.form.chatModels),
            embeddingModels: parseCommaSeparatedModels(props.form.embeddingModels),
            name: props.form.name.trim(),
            supportsEmbedding: props.form.supportsEmbedding,
            supportsChat: props.form.supportsChat,
            type: props.form.type
          })
        }}
        type="button"
      >
        {t("options.providers.save")}
      </button>
    </>
  )
}
