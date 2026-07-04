import { crx } from "@crxjs/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { manifest } from "./src/manifest"

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        about: "about.html",
        "viz-kdb": "viz-kdb.html"
      }
    }
  },
  plugins: [react(), crx({ manifest })]
})
