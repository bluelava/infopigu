import type { JSX } from "react"

import { useI18n } from "../i18n/I18nContext"
import type { ProviderConfig, Settings } from "../shared/types"

interface ProviderListProps {
  readonly onDeleteProvider: (providerId: ProviderConfig["id"]) => void
  readonly providers: readonly ProviderConfig[]
  readonly settings: Settings
  readonly visibleApiKeyProviderIds: ReadonlySet<ProviderConfig["id"]>
  readonly onToggleApiKeyVisibility: (providerId: ProviderConfig["id"]) => void
  readonly onTestProvider: (providerId: ProviderConfig["id"]) => void
  readonly onSelectClaimProvider: (
    providerId: ProviderConfig["id"],
    claimModel: string
  ) => void
  readonly onSelectEmbeddingProvider: (
    providerId: ProviderConfig["id"],
    embeddingModel: string
  ) => void
}

export function ProviderList(props: ProviderListProps): JSX.Element {
  const { t } = useI18n()

  return (
    <ul className="list">
      {props.providers.map((provider) => {
        const embeddingModel = provider.embeddingModels[0] ?? ""
        const claimModel = provider.chatModels[0] ?? ""
        const isActiveClaim = props.settings.activeClaimProviderId === provider.id
        const isActiveEmbedding = props.settings.activeEmbeddingProviderId === provider.id
        const isApiKeyVisible = props.visibleApiKeyProviderIds.has(provider.id)
        const claimButtonClassName = isActiveClaim ? "primary-button provider-active-button" : "primary-button"
        const embeddingButtonClassName = isActiveEmbedding
          ? "primary-button provider-active-button"
          : "primary-button"

        return (
          <li
            className={`list-row${isActiveClaim || isActiveEmbedding ? " list-row-active" : ""}`}
            key={provider.id}
          >
            <div>
              <strong>{provider.name}</strong>
              <p className="body-copy">
                {provider.baseUrl}
                {isActiveClaim ? ` · ${t("options.providers.claimActive")}` : ""}
                {isActiveEmbedding ? ` · ${t("options.providers.embeddingActive")}` : ""}
              </p>
              {provider.apiKeyEncrypted === undefined ? null : (
                <p className="body-copy">
                  {t("options.providers.savedKey")}: {isApiKeyVisible ? provider.apiKeyEncrypted : "••••••••"}
                </p>
              )}
            </div>
            <div className="row">
              <button
                aria-label={t("options.providers.deleteAria", { name: provider.name })}
                className="danger-button"
                onClick={() => {
                  props.onDeleteProvider(provider.id)
                }}
                type="button"
              >
                {t("options.providers.delete")}
              </button>
              {provider.apiKeyEncrypted === undefined ? null : (
                <button
                  aria-label={
                    isApiKeyVisible
                      ? t("options.providers.hideSavedKey")
                      : t("options.providers.revealSavedKey")
                  }
                  className="secondary-button"
                  onClick={() => {
                    props.onToggleApiKeyVisibility(provider.id)
                  }}
                  type="button"
                >
                  {isApiKeyVisible ? t("options.providers.hideKey") : t("options.providers.revealKey")}
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => {
                  props.onTestProvider(provider.id)
                }}
                type="button"
              >
                {t("options.providers.test")}
              </button>
              <button
                className={claimButtonClassName}
                data-claim-state={isActiveClaim ? "active" : "inactive"}
                onClick={() => {
                  props.onSelectClaimProvider(provider.id, claimModel)
                }}
                type="button"
              >
                {isActiveClaim ? t("options.providers.currentClaim") : t("options.providers.setClaim")}
              </button>
              <button
                className={embeddingButtonClassName}
                data-embedding-state={isActiveEmbedding ? "active" : "inactive"}
                disabled={embeddingModel.length === 0}
                onClick={() => {
                  if (embeddingModel.length === 0) {
                    return
                  }

                  props.onSelectEmbeddingProvider(provider.id, embeddingModel)
                }}
                type="button"
              >
                {isActiveEmbedding
                  ? t("options.providers.currentEmbedding")
                  : t("options.providers.setEmbedding")}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
