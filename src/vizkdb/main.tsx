import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "../i18n/I18nContext"
import "../main.css"
import { VizKdbPage } from "./VizKdbPage"

const vizKdbRoot = document.getElementById("viz-kdb-root")

if (vizKdbRoot !== null) {
  createRoot(vizKdbRoot).render(
    <StrictMode>
      <I18nProvider>
        <VizKdbPage />
      </I18nProvider>
    </StrictMode>
  )
}
