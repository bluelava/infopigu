import type { JSX } from "react"
import { useState } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { ProviderConfig, ProviderType } from "../shared/types"
import { ProviderForm } from "./ProviderForm"
import { ProviderList } from "./ProviderList"
import { providerDefaults } from "./providerSettingsDefaults"
import type { ProviderFormState, ProviderSettingsProps } from "./providerSettingsTypes"

export function ProviderSettings(props: ProviderSettingsProps): JSX.Element {
  const { t } = useI18n()
  const [form, setForm] = useState<ProviderFormState>({
    apiKey: "",
    baseUrl: providerDefaults.openai.baseUrl,
    chatModels: providerDefaults.openai.chatModels,
    embeddingModels: providerDefaults.openai.embeddingModels,
    name: providerDefaults.openai.name,
    supportsEmbedding: true,
    supportsChat: true,
    type: "openai" as ProviderType
  })
  const [connectivityMessage, setConnectivityMessage] = useState("")
  const [isFormApiKeyVisible, setIsFormApiKeyVisible] = useState(false)
  const [visibleApiKeyProviderIds, setVisibleApiKeyProviderIds] = useState<
    ReadonlySet<ProviderConfig["id"]>
  >(new Set())

  return (
    <section className="card">
      <p className="eyebrow">{t("options.providers.eyebrow")}</p>
      <h2 className="title">{t("options.providers.title")}</h2>
      <p className="body-copy">{t("options.providers.description")}</p>
      <div className="stack">
        <ProviderForm
          apiKeyVisible={isFormApiKeyVisible}
          form={form}
          onChange={setForm}
          onSave={(input) => {
            void props.onSaveProvider(input)
          }}
          onToggleApiKeyVisibility={() => {
            setIsFormApiKeyVisible((currentValue) => !currentValue)
          }}
        />
        {props.switchWarning.length > 0 ? <p className="body-copy">{props.switchWarning}</p> : null}
        {connectivityMessage.length > 0 ? <p className="body-copy">{connectivityMessage}</p> : null}
        <ProviderList
          onDeleteProvider={(providerId) => {
            void props.onDeleteProvider(providerId)
          }}
          onSelectClaimProvider={(providerId, claimModel) => {
            void props.onSelectClaimProvider(providerId, claimModel)
          }}
          onSelectEmbeddingProvider={(providerId, embeddingModel) => {
            void props.onSelectEmbeddingProvider(providerId, embeddingModel)
          }}
          onTestProvider={(providerId) => {
            void props.onTestProvider(providerId).then(setConnectivityMessage)
          }}
          onToggleApiKeyVisibility={(providerId) => {
            setVisibleApiKeyProviderIds((currentIds) => {
              const nextIds = new Set(currentIds)

              if (nextIds.has(providerId)) {
                nextIds.delete(providerId)
              } else {
                nextIds.add(providerId)
              }

              return nextIds
            })
          }}
          providers={props.providers}
          settings={props.settings}
          visibleApiKeyProviderIds={visibleApiKeyProviderIds}
        />
      </div>
    </section>
  )
}
