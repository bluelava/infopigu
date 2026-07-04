import { DEFAULT_SETTINGS, type Settings } from "../shared/types"

import type { CognitiveDeltaDb } from "./indexeddb"

const LEGACY_DEFAULT_NOVEL_CLAIMS_OVERLAY_SECONDS = 20

function normalizeSettings(settings: Settings): Settings {
  if (
    settings.novelClaimsOverlaySeconds !== LEGACY_DEFAULT_NOVEL_CLAIMS_OVERLAY_SECONDS ||
    settings.novelClaimsOverlaySecondsCustomized === true
  ) {
    return settings
  }

  return {
    ...settings,
    novelClaimsOverlaySeconds: DEFAULT_SETTINGS.novelClaimsOverlaySeconds
  }
}

export function createSettingsRepository(database: CognitiveDeltaDb) {
  return {
    async getSettings(): Promise<Settings> {
      const existing = await database.settings.get(DEFAULT_SETTINGS.id)

      if (existing !== undefined) {
        const mergedSettings = normalizeSettings({
          ...DEFAULT_SETTINGS,
          ...existing
        })

        await database.settings.put(mergedSettings)
        return mergedSettings
      }

      await database.settings.put(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    },

    async saveSettings(settings: Settings): Promise<void> {
      await database.settings.put(settings)
    },

    async updateSettings(nextSettings: Settings): Promise<Settings> {
      await database.settings.put(nextSettings)
      return nextSettings
    }
  }
}
