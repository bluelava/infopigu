import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "../i18n/I18nContext"
import "../main.css"
import { AboutPage } from "./AboutPage"

const aboutRoot = document.getElementById("about-root")

if (aboutRoot !== null) {
  createRoot(aboutRoot).render(
    <StrictMode>
      <I18nProvider>
        <AboutPage />
      </I18nProvider>
    </StrictMode>
  )
}
