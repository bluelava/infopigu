import type { CSSProperties, JSX } from "react"
import { startTransition, useEffect, useMemo, useRef, useState } from "react"

import type { VizKdbEdge, VizKdbNode } from "./useVizKdbData"
import { resolveVizKdbPlatformColor } from "./platformColors"

interface VizKdbGraphViewProps {
  readonly edges: readonly VizKdbEdge[]
  readonly nodes: readonly VizKdbNode[]
  readonly onSelectNode: (docId: VizKdbNode["docId"]) => void
  readonly selectedDocId: VizKdbNode["docId"] | null
}

interface PositionedNode {
  readonly node: VizKdbNode
  readonly x: number
  readonly y: number
}

interface SpatialNode extends PositionedNode {
  readonly z: number
}

interface ProjectedNode {
  readonly depth: number
  readonly node: VizKdbNode
  readonly radius: number
  readonly scale: number
  readonly x: number
  readonly y: number
  readonly z: number
}

interface MutablePoint {
  x: number
  y: number
}

const GRAPH_WIDTH = 1280
const GRAPH_HEIGHT = 860
const GRAPH_MARGIN = 42
const RELAX_ITERATIONS = 140
const GRAPH_CENTER_X = GRAPH_WIDTH * 0.5
const GRAPH_CENTER_Y = GRAPH_HEIGHT * 0.5
const GRAPH_DEPTH_SPAN = 280
const GRAPH_PERSPECTIVE = 980
const AUTO_ORBIT_RADIANS_PER_MS = 0.00008
const AUTO_ORBIT_STEP_MS = 80
const DRAG_RADIANS_PER_PIXEL = 0.0058
const MAX_PITCH_RADIANS = 0.78

function mapRadius(noveltyScore: number): number {
  return 5 + Math.max(0, Math.min(1, noveltyScore)) * 10
}

function mapStrokeWidth(similarity: number): number {
  return 0.6 + Math.max(0, Math.min(1, similarity)) * 1.8
}

function hashText(value: string): number {
  let hash = 0

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function truncateLabel(title: string): string {
  return title.length > 18 ? `${title.slice(0, 16)}…` : title
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2
  const normalized = angle % fullTurn

  return normalized < 0 ? normalized + fullTurn : normalized
}

function buildAdjacency(
  nodes: readonly VizKdbNode[],
  edges: readonly VizKdbEdge[]
): Map<VizKdbNode["docId"], Set<VizKdbNode["docId"]>> {
  const adjacency = new Map<VizKdbNode["docId"], Set<VizKdbNode["docId"]>>()

  for (const node of nodes) {
    adjacency.set(node.docId, new Set())
  }

  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId)
    adjacency.get(edge.targetId)?.add(edge.sourceId)
  }

  return adjacency
}

function buildConnectedComponents(
  nodes: readonly VizKdbNode[],
  adjacency: ReadonlyMap<VizKdbNode["docId"], ReadonlySet<VizKdbNode["docId"]>>
): readonly (readonly VizKdbNode[])[] {
  const nodeById = new Map(nodes.map((node) => [node.docId, node] as const))
  const visited = new Set<VizKdbNode["docId"]>()
  const components: VizKdbNode[][] = []

  for (const node of nodes) {
    if (visited.has(node.docId)) {
      continue
    }

    const queue = [node.docId]
    const component: VizKdbNode[] = []
    visited.add(node.docId)

    while (queue.length > 0) {
      const currentId = queue.shift()

      if (currentId === undefined) {
        break
      }

      const currentNode = nodeById.get(currentId)

      if (currentNode !== undefined) {
        component.push(currentNode)
      }

      for (const nextId of adjacency.get(currentId) ?? []) {
        if (visited.has(nextId)) {
          continue
        }

        visited.add(nextId)
        queue.push(nextId)
      }
    }

    components.push(component)
  }

  return components
}

function buildAnchor(index: number, total: number): { readonly x: number; readonly y: number } {
  const presetAnchors = [
    { x: 0.22, y: 0.68 },
    { x: 0.56, y: 0.22 },
    { x: 0.76, y: 0.63 },
    { x: 0.2, y: 0.22 },
    { x: 0.5, y: 0.74 },
    { x: 0.84, y: 0.32 }
  ]

  const preset = presetAnchors[index]

  if (preset !== undefined) {
    return {
      x: preset.x * GRAPH_WIDTH,
      y: preset.y * GRAPH_HEIGHT
    }
  }

  const angle = ((index - presetAnchors.length) / Math.max(1, total - presetAnchors.length)) * Math.PI * 2

  return {
    x: GRAPH_WIDTH * 0.5 + Math.cos(angle) * GRAPH_WIDTH * 0.38,
    y: GRAPH_HEIGHT * 0.5 + Math.sin(angle) * GRAPH_HEIGHT * 0.34
  }
}

function buildIsolatedAnchor(index: number, total: number): { readonly x: number; readonly y: number } {
  const angle = -Math.PI / 4 + (index / Math.max(1, total)) * Math.PI * 1.6

  return {
    x: GRAPH_WIDTH * 0.78 + Math.cos(angle) * GRAPH_WIDTH * 0.19,
    y: GRAPH_HEIGHT * 0.52 + Math.sin(angle) * GRAPH_HEIGHT * 0.36
  }
}

function placeCluster(
  nodes: readonly VizKdbNode[],
  anchor: { readonly x: number; readonly y: number },
  adjacency: ReadonlyMap<VizKdbNode["docId"], ReadonlySet<VizKdbNode["docId"]>>
): readonly PositionedNode[] {
  const sortedNodes = [...nodes].sort((left, right) => {
    const degreeDelta =
      (adjacency.get(right.docId)?.size ?? 0) - (adjacency.get(left.docId)?.size ?? 0)

    if (degreeDelta !== 0) {
      return degreeDelta
    }

    return right.noveltyScore - left.noveltyScore
  })

  return sortedNodes.map((node, index) => {
    if (index === 0) {
      return {
        node,
        x: clamp(anchor.x, GRAPH_MARGIN, GRAPH_WIDTH - GRAPH_MARGIN),
        y: clamp(anchor.y, GRAPH_MARGIN, GRAPH_HEIGHT - GRAPH_MARGIN)
      }
    }

    const ring = Math.max(1, Math.ceil((Math.sqrt(index + 1) - 1) / 1.45))
    const ringStart = Math.max(1, Math.floor((ring - 1) * (ring - 1) * 1.8))
    const slotIndex = index - ringStart
    const slotCount = Math.max(7, ring * 8)
    const angleSeed = hashText(`${node.docId}:${sortedNodes[0]?.docId ?? node.docId}`)
    const angleOffset = ((angleSeed % 360) * Math.PI) / 180
    const angle = angleOffset + (slotIndex / slotCount) * Math.PI * 2
    const radialDistance = 56 + ring * 52 + mapRadius(node.noveltyScore) * 1.8

    return {
      node,
      x: clamp(anchor.x + Math.cos(angle) * radialDistance * 1.22, GRAPH_MARGIN, GRAPH_WIDTH - GRAPH_MARGIN),
      y: clamp(anchor.y + Math.sin(angle) * radialDistance * 1.08, GRAPH_MARGIN, GRAPH_HEIGHT - GRAPH_MARGIN)
    }
  })
}

function relaxLayout(
  initialNodes: readonly PositionedNode[],
  edges: readonly VizKdbEdge[]
): readonly PositionedNode[] {
  const nodeById = new Map(initialNodes.map((item) => [item.node.docId, item.node] as const))
  const positions = new Map<VizKdbNode["docId"], MutablePoint>(
    initialNodes.map((item) => [item.node.docId, { x: item.x, y: item.y }])
  )
  const anchors = new Map<VizKdbNode["docId"], MutablePoint>(
    initialNodes.map((item) => [item.node.docId, { x: item.x, y: item.y }])
  )

  for (let iteration = 0; iteration < RELAX_ITERATIONS; iteration += 1) {
    const forces = new Map<VizKdbNode["docId"], MutablePoint>(
      initialNodes.map((item) => [item.node.docId, { x: 0, y: 0 }])
    )

    for (let index = 0; index < initialNodes.length; index += 1) {
      const left = initialNodes[index]

      if (left === undefined) {
        continue
      }

      const leftPosition = positions.get(left.node.docId)

      if (leftPosition === undefined) {
        continue
      }

      for (let otherIndex = index + 1; otherIndex < initialNodes.length; otherIndex += 1) {
        const right = initialNodes[otherIndex]

        if (right === undefined) {
          continue
        }

        const rightPosition = positions.get(right.node.docId)

        if (rightPosition === undefined) {
          continue
        }

        const dx = rightPosition.x - leftPosition.x
        const dy = rightPosition.y - leftPosition.y
        const distanceSquared = dx * dx + dy * dy + 0.01
        const distance = Math.sqrt(distanceSquared)
        const minimumSpacing =
          70 + mapRadius(left.node.noveltyScore) * 2.2 + mapRadius(right.node.noveltyScore) * 2.2
        const repulsion =
          distance < minimumSpacing ? (minimumSpacing - distance) * 0.24 : 5800 / distanceSquared
        const pushX = (dx / distance) * repulsion
        const pushY = (dy / distance) * repulsion
        const leftForce = forces.get(left.node.docId)
        const rightForce = forces.get(right.node.docId)

        if (leftForce !== undefined && rightForce !== undefined) {
          leftForce.x -= pushX
          leftForce.y -= pushY
          rightForce.x += pushX
          rightForce.y += pushY
        }
      }
    }

    for (const edge of edges) {
      const sourcePosition = positions.get(edge.sourceId)
      const targetPosition = positions.get(edge.targetId)
      const sourceNode = nodeById.get(edge.sourceId)
      const targetNode = nodeById.get(edge.targetId)

      if (
        sourcePosition === undefined ||
        targetPosition === undefined ||
        sourceNode === undefined ||
        targetNode === undefined
      ) {
        continue
      }

      const dx = targetPosition.x - sourcePosition.x
      const dy = targetPosition.y - sourcePosition.y
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const targetLength =
        180 -
        Math.min(0.45, edge.similarity) * 60 +
        (mapRadius(sourceNode.noveltyScore) + mapRadius(targetNode.noveltyScore)) * 1.2
      const spring = (distance - targetLength) * 0.018
      const pullX = (dx / distance) * spring
      const pullY = (dy / distance) * spring
      const sourceForce = forces.get(edge.sourceId)
      const targetForce = forces.get(edge.targetId)

      if (sourceForce !== undefined && targetForce !== undefined) {
        sourceForce.x += pullX
        sourceForce.y += pullY
        targetForce.x -= pullX
        targetForce.y -= pullY
      }
    }

    for (const item of initialNodes) {
      const position = positions.get(item.node.docId)
      const anchor = anchors.get(item.node.docId)
      const force = forces.get(item.node.docId)

      if (position === undefined || anchor === undefined || force === undefined) {
        continue
      }

      force.x += (anchor.x - position.x) * 0.012
      force.y += (anchor.y - position.y) * 0.012

      position.x = clamp(position.x + force.x, GRAPH_MARGIN, GRAPH_WIDTH - GRAPH_MARGIN)
      position.y = clamp(position.y + force.y, GRAPH_MARGIN, GRAPH_HEIGHT - GRAPH_MARGIN)
    }
  }

  return initialNodes.map((item) => {
    const position = positions.get(item.node.docId)

    return {
      node: item.node,
      x: position?.x ?? item.x,
      y: position?.y ?? item.y
    }
  })
}

function buildLayout(
  nodes: readonly VizKdbNode[],
  edges: readonly VizKdbEdge[]
): readonly PositionedNode[] {
  const adjacency = buildAdjacency(nodes, edges)
  const components = [...buildConnectedComponents(nodes, adjacency)].sort(
    (left: readonly VizKdbNode[], right: readonly VizKdbNode[]) => right.length - left.length
  )
  const clusteredComponents = components.filter((component) => component.length > 1)
  const isolatedComponents = components.filter((component) => component.length === 1)
  const positionedNodes: PositionedNode[] = []

  clusteredComponents.forEach((component: readonly VizKdbNode[], index: number) => {
    positionedNodes.push(...placeCluster(component, buildAnchor(index, clusteredComponents.length), adjacency))
  })

  isolatedComponents.forEach((component: readonly VizKdbNode[], index: number) => {
    const node = component[0]

    if (node === undefined) {
      return
    }

    const anchor = buildIsolatedAnchor(index, isolatedComponents.length)
    positionedNodes.push({
      node,
      x: clamp(anchor.x, GRAPH_MARGIN, GRAPH_WIDTH - GRAPH_MARGIN),
      y: clamp(anchor.y, GRAPH_MARGIN, GRAPH_HEIGHT - GRAPH_MARGIN)
    })
  })

  return relaxLayout(positionedNodes, edges)
}

function buildSpatialLayout(positionedNodes: readonly PositionedNode[]): readonly SpatialNode[] {
  return positionedNodes.map((item, index) => {
    const noveltyDepth = (item.node.noveltyScore - 0.5) * GRAPH_DEPTH_SPAN * 0.8
    const hashDepth = ((hashText(`${item.node.docId}:${index}`) % 1000) / 1000 - 0.5) * GRAPH_DEPTH_SPAN * 0.7

    return {
      ...item,
      z: noveltyDepth + hashDepth
    }
  })
}

function projectSpatialLayout(
  nodes: readonly SpatialNode[],
  rotation: {
    readonly pitch: number
    readonly yaw: number
  }
): readonly ProjectedNode[] {
  const sinYaw = Math.sin(rotation.yaw)
  const cosYaw = Math.cos(rotation.yaw)
  const sinPitch = Math.sin(rotation.pitch)
  const cosPitch = Math.cos(rotation.pitch)

  return nodes
    .map((item) => {
      const centeredX = item.x - GRAPH_CENTER_X
      const centeredY = item.y - GRAPH_CENTER_Y
      const centeredZ = item.z

      const yawX = centeredX * cosYaw - centeredZ * sinYaw
      const yawZ = centeredX * sinYaw + centeredZ * cosYaw
      const pitchY = centeredY * cosPitch - yawZ * sinPitch
      const pitchZ = centeredY * sinPitch + yawZ * cosPitch
      const scale = clamp(GRAPH_PERSPECTIVE / (GRAPH_PERSPECTIVE - pitchZ), 0.72, 1.45)

      return {
        depth: pitchZ,
        node: item.node,
        radius: mapRadius(item.node.noveltyScore) * scale,
        scale,
        x: GRAPH_CENTER_X + yawX * scale,
        y: GRAPH_CENTER_Y + pitchY * scale,
        z: pitchZ
      }
    })
    .sort((left, right) => left.depth - right.depth)
}

export function VizKdbGraphView(props: VizKdbGraphViewProps): JSX.Element {
  const [hoveredNodeId, setHoveredNodeId] = useState<VizKdbNode["docId"] | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rotation, setRotation] = useState({
    pitch: -0.24,
    yaw: 0
  })
  const dragStateRef = useRef<{
    readonly originPitch: number
    readonly originYaw: number
    readonly startX: number
    readonly startY: number
  } | null>(null)
  const pendingPointerRef = useRef<{ readonly clientX: number; readonly clientY: number } | null>(null)
  const dragFrameIdRef = useRef<number | null>(null)
  const positionedNodes = useMemo(() => buildLayout(props.nodes, props.edges), [props.edges, props.nodes])
  const spatialNodes = useMemo(() => buildSpatialLayout(positionedNodes), [positionedNodes])
  const projectedNodes = useMemo(() => projectSpatialLayout(spatialNodes, rotation), [rotation, spatialNodes])
  const nodePositionById = useMemo(
    () => new Map(projectedNodes.map((item) => [item.node.docId, item] as const)),
    [projectedNodes]
  )
  const hoveredNode = useMemo(
    () => projectedNodes.find((item) => item.node.docId === hoveredNodeId) ?? null,
    [hoveredNodeId, projectedNodes]
  )

  useEffect(() => {
    if (isDragging) {
      return
    }

    let timeoutId = 0

    const tick = () => {
      startTransition(() => {
        setRotation((current) => ({
          pitch: current.pitch,
          yaw: normalizeAngle(current.yaw + AUTO_ORBIT_STEP_MS * AUTO_ORBIT_RADIANS_PER_MS)
        }))
      })

      timeoutId = window.setTimeout(tick, AUTO_ORBIT_STEP_MS)
    }

    timeoutId = window.setTimeout(tick, AUTO_ORBIT_STEP_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isDragging])

  useEffect(() => {
    if (!isDragging) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current

      if (dragState === null) {
        return
      }

      pendingPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      }

      if (dragFrameIdRef.current !== null) {
        return
      }

      dragFrameIdRef.current = window.requestAnimationFrame(() => {
        dragFrameIdRef.current = null

        const nextPointer = pendingPointerRef.current
        const nextDragState = dragStateRef.current

        if (nextPointer === null || nextDragState === null) {
          return
        }

        const deltaX = nextPointer.clientX - nextDragState.startX
        const deltaY = nextPointer.clientY - nextDragState.startY

        setRotation({
          pitch: clamp(
            nextDragState.originPitch - deltaY * DRAG_RADIANS_PER_PIXEL,
            -MAX_PITCH_RADIANS,
            MAX_PITCH_RADIANS
          ),
          yaw: normalizeAngle(nextDragState.originYaw + deltaX * DRAG_RADIANS_PER_PIXEL)
        })
      })
    }

    const handleMouseUp = () => {
      dragStateRef.current = null
      pendingPointerRef.current = null
      if (dragFrameIdRef.current !== null) {
        window.cancelAnimationFrame(dragFrameIdRef.current)
        dragFrameIdRef.current = null
      }
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      if (dragFrameIdRef.current !== null) {
        window.cancelAnimationFrame(dragFrameIdRef.current)
        dragFrameIdRef.current = null
      }
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  function beginDrag(clientX: number, clientY: number): void {
    dragStateRef.current = {
      originPitch: rotation.pitch,
      originYaw: rotation.yaw,
      startX: clientX,
      startY: clientY
    }
    setIsDragging(true)
  }

  return (
    <div className="viz-kdb-graph-card">
      <div
        className="viz-kdb-graph-stage"
        data-graph-mode="3d"
        data-orbiting={isDragging ? "false" : "true"}
        data-dragging={isDragging ? "true" : "false"}
        onMouseDown={(event) => {
          beginDrag(event.clientX, event.clientY)
        }}
      >
        <div className="viz-kdb-graph-orbit-layer">
          <svg className="viz-kdb-graph-svg" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}>
          {props.edges.map((edge) => {
            const source = nodePositionById.get(edge.sourceId)
            const target = nodePositionById.get(edge.targetId)

            if (source === undefined || target === undefined) {
              return null
            }

            const selected =
              props.selectedDocId !== null &&
              (edge.sourceId === props.selectedDocId || edge.targetId === props.selectedDocId)

            return (
              <line
                className={selected ? "viz-kdb-edge viz-kdb-edge-selected" : "viz-kdb-edge"}
                key={`${edge.sourceId}:${edge.targetId}`}
                opacity={clamp(0.28 + ((source.scale + target.scale) * 0.5 - 0.72) * 0.65, 0.22, 0.96)}
                strokeWidth={mapStrokeWidth(edge.similarity) * ((source.scale + target.scale) * 0.5)}
                x1={source.x}
                x2={target.x}
                y1={source.y}
                y2={target.y}
              />
            )
          })}
          {projectedNodes.map(({ node, radius, scale, x, y, z }) => {
            const selected = props.selectedDocId === node.docId

            return (
              <g
                className={selected ? "viz-kdb-node viz-kdb-node-selected" : "viz-kdb-node"}
                key={node.docId}
                onClick={() => {
                  props.onSelectNode(node.docId)
                }}
                onMouseEnter={() => {
                  setHoveredNodeId(node.docId)
                }}
                onMouseLeave={() => {
                  setHoveredNodeId((current) => (current === node.docId ? null : current))
                }}
                role="button"
                style={
                  {
                    "--viz-kdb-depth": `${z.toFixed(2)}`,
                    "--viz-kdb-node-scale": `${scale.toFixed(3)}`
                  } as CSSProperties
                }
                tabIndex={0}
              >
                <circle
                  cx={x}
                  cy={y}
                  fill={resolveVizKdbPlatformColor(node.domain)}
                  r={radius}
                  stroke={selected ? "#fffaf0" : "rgba(255,255,255,0.5)"}
                  strokeWidth={selected ? 3 : 1.5}
                />
                <text className="viz-kdb-node-label" textAnchor="start" x={x + radius + 5} y={y + 3}>
                  {truncateLabel(node.title)}
                </text>
              </g>
            )
          })}
          </svg>
        </div>
        {hoveredNode !== null ? (
          <div
            className="viz-kdb-graph-tooltip"
            style={{
              left: `${(hoveredNode.x / GRAPH_WIDTH) * 100}%`,
              top: `${(hoveredNode.y / GRAPH_HEIGHT) * 100}%`
            }}
          >
            <strong>{hoveredNode.node.title}</strong>
            <span>{hoveredNode.node.url}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
