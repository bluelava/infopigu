import browser from "webextension-polyfill"

import { createCognitiveDeltaDb } from "../db/indexeddb"
import { createSettingsRepository } from "../db/settingsRepo"
import type { LanguageMode } from "../shared/types"

export async function persistLanguageMode(languageMode: LanguageMode): Promise<void> {
  const database = createCognitiveDeltaDb()
  const settingsRepository = createSettingsRepository(database)

  try {
    const currentSettings = await settingsRepository.getSettings()
    const nextSettings = {
      ...currentSettings,
      languageMode
    }

    await settingsRepository.saveSettings(nextSettings)
    await browser.storage.local.set({ operationalSettings: nextSettings })
  } finally {
    database.close()
  }
}
