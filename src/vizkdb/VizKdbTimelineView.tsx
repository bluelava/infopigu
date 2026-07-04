import { useMemo, useState, type JSX } from "react"

import type { VizKdbNode } from "./useVizKdbData"
import { resolveVizKdbPlatformColor } from "./platformColors"

interface VizKdbTimelineViewProps {
  readonly nodes: readonly VizKdbNode[]
  readonly onSelectNode: (docId: VizKdbNode["docId"]) => void
  readonly selectedDocId: VizKdbNode["docId"] | null
}

interface TimelineRow {
  readonly bucketCount: number
  readonly bucketKey: string
  readonly connectorActiveScale: number
  readonly connectorWidth: number
  readonly isFirst: boolean
  readonly markerActiveScale: number
  readonly markerWidth: number
  readonly node: VizKdbNode
  readonly timeLabel: string | null
}

function createDayBucketKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")

  return `${year}-${month}-${day}`
}

function formatTimeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp))
}

function mapMarkerWidth(bucketCount: number): number {
  return 8 + Math.min(18, Math.max(0, bucketCount - 1) * 4)
}

function buildTimelineRows(nodes: readonly VizKdbNode[]): readonly TimelineRow[] {
  const sortedNodes = [...nodes].sort((left, right) => right.effectiveAt - left.effectiveAt)
  const bucketCounts = new Map<string, number>()

  for (const node of sortedNodes) {
    const bucketKey = createDayBucketKey(node.effectiveAt)
    bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) ?? 0) + 1)
  }

  let previousBucketKey: string | null = null

  return sortedNodes.map((node, index) => {
    const bucketKey = createDayBucketKey(node.effectiveAt)
    const bucketCount = bucketCounts.get(bucketKey) ?? 1
    const markerWidth = mapMarkerWidth(bucketCount)
    const connectorWidth = 8 + Math.min(12, Math.max(0, bucketCount - 1) * 2)
    const markerActiveWidth = markerWidth + 14 + Math.min(8, Math.max(0, bucketCount - 1) * 2)
    const connectorActiveWidth = 52 + Math.min(14, Math.max(0, bucketCount - 1) * 4)
    const row = {
      bucketCount,
      bucketKey,
      connectorActiveScale: connectorActiveWidth / connectorWidth,
      connectorWidth,
      isFirst: index === 0,
      markerActiveScale: markerActiveWidth / markerWidth,
      markerWidth,
      node,
      timeLabel: bucketKey === previousBucketKey ? null : formatTimeLabel(node.effectiveAt)
    }

    previousBucketKey = bucketKey
    return row
  })
}

export function VizKdbTimelineView(props: VizKdbTimelineViewProps): JSX.Element {
  const rows = useMemo(() => buildTimelineRows(props.nodes), [props.nodes])
  const [hoveredBucketKey, setHoveredBucketKey] = useState<string | null>(null)
  const [hoveredDocId, setHoveredDocId] = useState<VizKdbNode["docId"] | null>(null)

  return (
    <div className="viz-kdb-timeline card">
      <div className="viz-kdb-timeline-axis">
        <span className="viz-kdb-timeline-axis-origin" />
        <span className="viz-kdb-timeline-axis-arrow" />
      </div>
      {rows.map(
        ({
          bucketCount,
          bucketKey,
          connectorActiveScale,
          connectorWidth,
          isFirst,
          markerActiveScale,
          markerWidth,
          node,
          timeLabel
        }) => {
        const isBucketActive = hoveredBucketKey === bucketKey
        const isHoveredItem = hoveredDocId === node.docId
        const itemClassName = [
          "viz-kdb-timeline-item",
          props.selectedDocId === node.docId ? "viz-kdb-timeline-item-selected" : "",
          isHoveredItem ? "viz-kdb-timeline-item-hovered" : "",
          props.selectedDocId !== node.docId && isBucketActive ? "viz-kdb-timeline-item-bucket-active" : ""
        ]
          .filter((value) => value.length > 0)
          .join(" ")
        const platformColor = resolveVizKdbPlatformColor(node.domain)

        return (
          <div className="viz-kdb-timeline-row" data-bucket-key={bucketKey} key={node.docId}>
            <div className="viz-kdb-timeline-axis-cell">
              {timeLabel !== null ? <span className="viz-kdb-timeline-axis-label">{timeLabel}</span> : null}
              <button
                aria-label={`${bucketCount} articles on ${formatTimeLabel(node.effectiveAt)}`}
                className={
                  isBucketActive
                    ? "viz-kdb-timeline-axis-mark viz-kdb-timeline-axis-mark-active"
                    : "viz-kdb-timeline-axis-mark"
                }
                data-article-count={bucketCount}
                data-latest={isFirst ? "true" : "false"}
                onBlur={() => {
                  setHoveredDocId((currentValue) => (currentValue === node.docId ? null : currentValue))
                  setHoveredBucketKey((currentValue) => (currentValue === bucketKey ? null : currentValue))
                }}
                onFocus={() => {
                  setHoveredDocId(null)
                  setHoveredBucketKey(bucketKey)
                }}
                onMouseEnter={() => {
                  setHoveredDocId(null)
                  setHoveredBucketKey(bucketKey)
                }}
                onMouseLeave={() => {
                  setHoveredDocId((currentValue) => (currentValue === node.docId ? null : currentValue))
                  setHoveredBucketKey((currentValue) => (currentValue === bucketKey ? null : currentValue))
                }}
                style={{
                  ["--viz-kdb-timeline-mark-active-scale" as string]: `${markerActiveScale}`,
                  ["--viz-kdb-timeline-mark-color" as string]: platformColor,
                  background: platformColor,
                  width: `${markerWidth}px`
                }}
                type="button"
              />
              <span
                className={
                  isBucketActive
                    ? "viz-kdb-timeline-connector viz-kdb-timeline-connector-active"
                    : "viz-kdb-timeline-connector"
                }
                style={{
                  ["--viz-kdb-timeline-connector-active-scale" as string]: `${connectorActiveScale}`,
                  width: `${connectorWidth}px`
                }}
              />
            </div>
            <button
              className={itemClassName}
              onBlur={() => {
                setHoveredDocId((currentValue) => (currentValue === node.docId ? null : currentValue))
                setHoveredBucketKey((currentValue) => (currentValue === bucketKey ? null : currentValue))
              }}
              onClick={() => {
                props.onSelectNode(node.docId)
              }}
              onFocus={() => {
                setHoveredDocId(node.docId)
                setHoveredBucketKey(bucketKey)
              }}
              onMouseEnter={() => {
                setHoveredDocId(node.docId)
                setHoveredBucketKey(bucketKey)
              }}
              onMouseLeave={() => {
                setHoveredDocId((currentValue) => (currentValue === node.docId ? null : currentValue))
                setHoveredBucketKey((currentValue) => (currentValue === bucketKey ? null : currentValue))
              }}
              style={{
                ["--viz-kdb-timeline-item-accent" as string]: platformColor
              }}
              type="button"
            >
              <span className="viz-kdb-timeline-body">
                <strong>{node.title}</strong>
                <span>{node.url}</span>
              </span>
              <span className="viz-kdb-timeline-metrics">
                <span>{Math.round(node.noveltyScore * 100)}%</span>
                <span>{new Date(node.effectiveAt).toLocaleString()}</span>
              </span>
            </button>
          </div>
        )
      }
      )}
    </div>
  )
}
