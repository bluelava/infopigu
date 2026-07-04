import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "../i18n/I18nContext"
import "../main.css"
import { AnalysisPanel } from "./AnalysisPanel"

const sidepanelRoot = document.getElementById("sidepanel-root")

if (sidepanelRoot !== null) {
  createRoot(sidepanelRoot).render(
    <StrictMode>
      <I18nProvider>
        <AnalysisPanel />
      </I18nProvider>
    </StrictMode>
  )
}
