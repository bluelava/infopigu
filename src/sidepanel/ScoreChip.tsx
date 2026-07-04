import type { JSX } from "react"

interface ScoreChipProps {
  readonly className?: string
  readonly label: string
  readonly value: string
}

export function ScoreChip(props: ScoreChipProps): JSX.Element {
  return (
    <span
      className={props.className === undefined ? "score-chip" : `score-chip ${props.className}`}
      aria-label={props.label}
      data-tooltip={props.label}
    >
      {props.value}
    </span>
  )
}
