import type { JSX } from "react"

export function LanguageIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="language-switcher-icon"
      viewBox="0 0 20 20"
      width="14"
      height="14"
    >
      <path
        d="M10 2a8 8 0 1 0 0 16m0-16c2.2 2.1 3.5 5 3.5 8S12.2 15.9 10 18m0-16C7.8 4.1 6.5 7 6.5 10s1.3 5.9 3.5 8m-7-8h14m-13 4h12M4 6h12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}

export function ChevronDownIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" className="language-select-caret" viewBox="0 0 20 20" width="12" height="12">
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}
