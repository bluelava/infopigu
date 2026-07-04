import type { ThemeMode } from "../shared/types"

export type ResolvedThemeMode = "dark" | "light"

const THEME_ATTRIBUTE = "data-cognitive-delta-theme"

export function resolveThemeMode(
  themeMode: ThemeMode,
  prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
): ResolvedThemeMode {
  if (themeMode === "dark") {
    return "dark"
  }

  if (themeMode === "light") {
    return "light"
  }

  return prefersDark ? "dark" : "light"
}

export function applyDocumentTheme(themeMode: ThemeMode): ResolvedThemeMode {
  const resolvedTheme = resolveThemeMode(themeMode)
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolvedTheme)
  return resolvedTheme
}

export function getThemeAttributeName(): string {
  return THEME_ATTRIBUTE
}
