import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "../i18n/I18nContext"
import "../main.css"
import { OptionsPage } from "./OptionsPage"

const optionsRoot = document.getElementById("options-root")

if (optionsRoot !== null) {
  createRoot(optionsRoot).render(
    <StrictMode>
      <I18nProvider>
        <OptionsPage />
      </I18nProvider>
    </StrictMode>
  )
}
