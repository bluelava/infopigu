import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "../i18n/I18nContext"
import "../main.css"
import { Popup } from "./Popup"

const popupRoot = document.getElementById("popup-root")

if (popupRoot !== null) {
  createRoot(popupRoot).render(
    <StrictMode>
      <I18nProvider>
        <Popup />
      </I18nProvider>
    </StrictMode>
  )
}
