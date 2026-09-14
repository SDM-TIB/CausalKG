import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from '@xyflow/react'
import { useStore } from '../../stores/useStore'
import { distCardHeight, distCardWidth, distNodeTypes, type NodeDist } from '../../flow/DistCard'
import { edgeTypes } from '../../flow/FloatingEdge'
import { FitOnResize } from '../../flow/FitOnResize'
import { layerLayout } from '../../flow/dagLayout'
import { useLayoutSync } from '../../flow/useLayoutSync'
import { splitName } from '../../lib/num'
import type { Assignments } from '../../stores/useStore'
import type { CanvasId, NodeDistribution } from '../../api/client'

export interface BoardProps {
  canvas: CanvasId
  /** What each card is currently showing; null falls back to the prior. */
  posteriors: Record<string, NodeDistribution> | null
  priors: Record<string, NodeDistribution> | null
  assignments: Assignments
  /** Module 4: the unit's own values, drawn as a baseline on every card. */
  factual?: Record<string, string | number | null> | null
  /** Module 4: the dashed pill above an intervened card. */
  hypotheticals?: Assignments
  /**
   * Draw the observational marginal behind each free card's posterior. True for module
   * 3, where the prior is exactly what the evidence moved things from; false for module
   * 4, where the reference is the unit's own factual state and the population marginal
   * is an answer to a different question (see `DistCard.showPrior`).
   */
  showPrior?: boolean
  onPick: (node: string, value: string | number) => void
  onClear: (node: string) => void
  onMenu: (node: string, x: number, y: number) => void
  relayoutToken: number
}

function Board({
  canvas,
  posteriors,
  priors,
  assignments,
  factual,
  hypotheticals,
  showPrior = true,
  onPick,
  onClear,
  onMenu,
  relayoutToken,
}: BoardProps) {
  const model = useStore((s) => s.model)!
  const selectedNode = useStore((s) => s.selectedNode)
  const selectNode = useStore((s) => s.selectNode)
  const resetLayout = useStore((s) => s.resetLayout)
  const { place, commit } = useLayoutSync(canvas)

  useEffect(() => {
    if (relayoutToken > 0) resetLayout(canvas)
  }, [relayoutToken, canvas, resetLayout])

  const { seedNodes, seedEdges } = useMemo(() => {
    // Layer spacing has to clear the tallest card in each layer, or a 6-level
    // categorical overlaps the row below it and the arrows become unreadable.
    const heights = Object.fromEntries(
      model.columns.map((c) => [
        c,
        distCardHeight(model.dtypes[c], (model.levels[c] ?? []).length),
      ]),
    )
    const seeds = layerLayout(model.columns, model.edges, {
      dx: distCardWidth + 46,
      dy: Math.max(...Object.values(heights)) + 66,
    })

    const rfNodes: Node[] = model.columns.map((name) => {
      const { cls, prop } = splitName(name)
      const a = assignments[name]
      const hyp = hypotheticals?.[name]
      const seed = seeds[name] ?? { x: 0, y: 0 }
      return {
        id: `q:${name}`,
        type: 'distCard',
        position: place(`q:${name}`, { x: seed.x - distCardWidth / 2, y: seed.y }),
        data: {
          node: name,
          cls,
          prop,
          dtype: model.dtypes[name],
          role: a?.mode === 'intervened' || hyp ? 'intervened' : a ? 'observed' : 'free',
          value: (hyp ?? a)?.value ?? null,
          prior: (priors?.[name] ?? null) as NodeDist | null,
          posterior: (posteriors?.[name] ?? null) as NodeDist | null,
          factual: factual?.[name] ?? null,
          hypothetical: hyp?.value ?? null,
          showPrior,
          selected: selectedNode === name,
          onPick,
          onClear,
          onMenu,
          onSelect: selectNode,
        },
        draggable: true,
      }
    })

    const rfEdges: Edge[] = model.edges.map((e) => {
      // do() severs the incoming edges — but they are drawn dashed and dimmed rather
      // than deleted, so what the intervention removed stays legible on the board
      // (Plan 3 §6.4). A graph that silently loses arrows hides the whole point of do().
      const severed =
        assignments[e.target]?.mode === 'intervened' || !!hypotheticals?.[e.target]
      return {
        id: `qe:${e.source}->${e.target}`,
        source: `q:${e.source}`,
        target: `q:${e.target}`,
        type: 'floating',
        selectable: false,
        data: {
          tone: severed ? 'orange' : 'indigo',
          width: severed ? 1.2 : 1.8,
          dashed: severed,
          dim: severed,
          title: severed
            ? `${e.source} → ${e.target}\nsevered by do(${e.target})`
            : `${e.source} → ${e.target}`,
        },
      }
    })

    return { seedNodes: rfNodes, seedEdges: rfEdges }
  }, [
    model, assignments, hypotheticals, priors, posteriors, factual, showPrior, selectedNode,
    place, onPick, onClear, onMenu, selectNode,
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(seedEdges)
  useEffect(() => setNodes(seedNodes), [seedNodes, setNodes])
  useEffect(() => setEdges(seedEdges), [seedEdges, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={distNodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={commit}
      onPaneClick={() => selectNode(null)}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
      minZoom={0.08}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--ck-grid)" />
      <Controls showInteractive={false} position="bottom-right" />
      <FitOnResize padding={0.14} />
    </ReactFlow>
  )
}

export function QueryBoard(props: BoardProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  )
}

export function BoardLegend({ mode }: { mode: 'inference' | 'counterfactual' }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linesoft px-3 py-2 text-[11px] text-faint">
      {mode === 'inference' && <Chip colour="var(--ck-green)" label="observed — conditioning" />}
      <Chip
        colour="var(--ck-orange)"
        label={mode === 'inference' ? 'do() — intervened' : 'hypothetical do()'}
      />
      {mode === 'counterfactual' && (
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden>
            <path d="M9 0v8" stroke="var(--ck-green)" strokeWidth="1.4" strokeDasharray="3 2" />
          </svg>
          factual — what actually happened
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden>
          <path d="M1 4h14" stroke="var(--ck-orange)" strokeWidth="1.4" strokeDasharray="4 3" />
          <path d="M14 1.5 19 4l-5 2.5z" fill="var(--ck-orange)" opacity=".6" />
        </svg>
        severed by do()
      </span>
      <span className="ml-auto">
        Click a bar or a point on a curve to pin it. Right-click a card for the full menu.
      </span>
    </div>
  )
}

function Chip({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-4 rounded-[4px] border"
        style={{ borderColor: colour, background: `color-mix(in srgb, ${colour} 16%, transparent)` }}
      />
      {label}
    </span>
  )
}

/** A sensible starting value for a node with no pin yet: its mode, or its mean. */
export function defaultValue(
  model: { levels: Record<string, string[]>; ranges: Record<string, { mean: number | null }> },
  node: string,
  dist?: NodeDistribution | null,
): string | number {
  if (dist?.kind === 'categorical' && dist.probs) {
    const best = Object.entries(dist.probs).sort((a, b) => b[1] - a[1])[0]
    if (best) return best[0]
  }
  const levels = model.levels[node]
  if (levels?.length) return levels[0]
  const mean = dist?.mean ?? model.ranges[node]?.mean
  return mean === null || mean === undefined ? 0 : Number(mean.toFixed(3))
}

/** Wires the right-click menu's open/close state; both modules need exactly this. */
export function useBoardMenu() {
  const [menu, setMenu] = useState<{ node: string; x: number; y: number } | null>(null)
  const open = useCallback((node: string, x: number, y: number) => setMenu({ node, x, y }), [])
  const close = useCallback(() => setMenu(null), [])
  return { menu, open, close }
}
