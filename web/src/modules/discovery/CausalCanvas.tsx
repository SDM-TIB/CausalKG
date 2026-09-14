import { useEffect, useMemo, useState } from 'react'
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
import { causalNodeTypes } from '../../flow/cards'
import { edgeTypes } from '../../flow/FloatingEdge'
import { FitOnResize } from '../../flow/FitOnResize'
import { ring, useLayoutSync } from '../../flow/useLayoutSync'
import type { ArrowTone } from '../../flow/Defs'
import type { LedgerEdge } from '../../api/client'
import { Badge, Button, Empty, Icon, Info, Panel, Tabs } from '../../app/ui'

/** Status colour is never overridden by selection — the two are separate signals. */
function tone(e: LedgerEdge): ArrowTone {
  if (!e.topologically_valid) return 'red'
  if (e.conflict) return 'orange'
  if (e.frequency === 0) return 'faint'
  return 'green'
}

/**
 * One colour per discovery method, fixed rather than assigned in arrival order.
 *
 * The ledger accumulates across runs, so an edge's colour has to mean the same thing in
 * the morning and after four more runs in the afternoon; a palette handed out as methods
 * appear would recolour the whole graph the moment someone deletes run #1. There are
 * exactly seven user-facing methods (`runners/run_kg_discovery.py: ALLOWED_METHODS`) and
 * exactly seven non-neutral tones, so the map is total and nothing has to share.
 */
const METHOD_TONE: Record<string, ArrowTone> = {
  // Assigned for hue separation between the methods most often run together, not in the
  // palette's own order: GES, GES-Prior and PC are the three that work on discrete
  // columns and end up on the same canvas, so they take violet, yellow and cyan rather
  // than indigo/sky, which are two blues and stripe into one blue line.
  GES: 'indigo',
  'GES-Prior': 'amber',
  PC: 'teal',
  NOTEARS: 'orange',
  DAGMA: 'sky',
  LiNGAM: 'green',
  'DAG-GNN': 'red',
}

/** The methods that found this edge, in the palette's order so two edges never disagree. */
function methodTones(e: LedgerEdge): ArrowTone[] {
  const order = Object.keys(METHOD_TONE)
  const found = [...new Set(e.methods)]
    .filter((m) => m in METHOD_TONE)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
  // A hand-authored edge has no method and no claim to a method's colour.
  return found.length ? found.map((m) => METHOD_TONE[m]) : ['faint']
}

export type EdgeColouring = 'method' | 'status'

function Canvas({ colourBy }: { colourBy: EdgeColouring }) {
  const ledger = useStore((s) => s.ledger)
  const toggleSelected = useStore((s) => s.toggleSelected)
  const notify = useStore((s) => s.notify)
  const { place, commit } = useLayoutSync('causal')

  const { seedNodes, seedEdges } = useMemo(() => {
    const cols = ledger?.columns ?? []
    const edges = ledger?.edges ?? []
    const maxFreq = Math.max(1, ...edges.map((e) => e.frequency))
    const r = Math.max(230, cols.length * 46)

    const deg: Record<string, { i: number; o: number; sel: number }> = {}
    cols.forEach((c) => (deg[c] = { i: 0, o: 0, sel: 0 }))
    edges.forEach((e) => {
      if (deg[e.source]) {
        deg[e.source].o++
        if (e.selected) deg[e.source].sel++
      }
      if (deg[e.target]) {
        deg[e.target].i++
        if (e.selected) deg[e.target].sel++
      }
    })

    const rfNodes: Node[] = cols.map((name, i) => {
      const dot = name.lastIndexOf('.')
      const seed = ring(i, cols.length, 0, 0, r)
      return {
        id: `v:${name}`,
        type: 'varCard',
        position: place(`v:${name}`, { x: seed.x - 62, y: seed.y - 20 }),
        data: {
          cls: dot > 0 ? name.slice(0, dot) : '',
          prop: dot > 0 ? name.slice(dot + 1) : name,
          inDeg: deg[name]?.i ?? 0,
          outDeg: deg[name]?.o ?? 0,
          selectedDeg: deg[name]?.sel ?? 0,
        },
        draggable: true,
      }
    })

    const rfEdges: Edge[] = edges.map((e) => {
      const byMethod = methodTones(e)
      return {
      id: `e:${e.source}->${e.target}`,
      source: `v:${e.source}`,
      target: `v:${e.target}`,
      type: 'floating',
      data: {
        tone: colourBy === 'method' ? byMethod[0] : tone(e),
        tones: colourBy === 'method' ? byMethod : undefined,
        // The label *is* the oriented frequency (Plan 3 W12); a tick marks the
        // edges that make up the curated graph, a slash the ones that cannot join it
        // without making it cyclic (W19).
        label: `${e.selected ? '✓ ' : e.blocked ? '⃠ ' : ''}${e.frequency}`,
        width: e.selected ? 3 : 1.2 + 2.2 * (e.frequency / maxFreq),
        dashed: e.manual,
        dim: !e.selected,
        emphasis: e.selected,
        title:
          `${e.source} → ${e.target}\n` +
          `frequency ${e.frequency}` +
          (e.reverse_frequency ? ` · reverse ${e.reverse_frequency}` : '') +
          (e.methods.length ? `\nmethods: ${e.methods.join(', ')}` : '') +
          (e.manual ? '\nhand-authored' : '') +
          (e.relation_label ? `\nrelation: ${e.relation_label}` : '') +
          (e.topologically_valid ? '' : '\nviolates Assumption 1') +
          (e.blocked
            ? `\nnot selectable: would close ${e.blocked_path?.join(' → ')}`
            : ''),
      },
    }
    })

    return { seedNodes: rfNodes, seedEdges: rfEdges }
  }, [ledger, place, colourBy])

  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(seedEdges)
  useEffect(() => setNodes(seedNodes), [seedNodes, setNodes])
  useEffect(() => setEdges(seedEdges), [seedEdges, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={causalNodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={commit}
      onEdgeClick={(_, e) => {
        const [s, t] = e.id.slice(2).split('->')
        // Refuse before the round-trip, and name the cycle. The server still validates
        // — it is the authority — but a checkbox that appears to work and then bounces
        // is worse than one that explains itself immediately (W19).
        const rec = ledger?.edges.find((x) => x.source === s && x.target === t)
        if (rec?.blocked) {
          notify(
            'warn',
            `${s} → ${t} cannot join the selection: it would close the cycle ` +
              `${rec.blocked_path?.join(' → ')}. Deselect one of those edges first.`,
          )
          return
        }
        toggleSelected(s, t)
      }}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--ck-grid)" />
      <Controls showInteractive={false} position="bottom-right" />
      <FitOnResize padding={0.2} />
    </ReactFlow>
  )
}

export function CausalCanvas() {
  const { ledger, runs, graph, resetLayout, deleteRun, clearRuns, selectAll } = useStore()
  const nEdges = ledger?.edges.length ?? 0
  const [showRuns, setShowRuns] = useState(false)
  // Method by default: the ledger's whole reason to exist is that several methods ran
  // over the same columns, and "which one found this" is the first question a stack of
  // accumulated runs raises. Status is one click away and unchanged underneath.
  const [colourBy, setColourBy] = useState<EdgeColouring>('method')

  /** Only the methods that actually ran get a swatch — an unused colour explains nothing. */
  const usedMethods = useMemo(() => {
    const order = Object.keys(METHOD_TONE)
    const seen = new Set<string>()
    ;(ledger?.edges ?? []).forEach((e) => e.methods.forEach((m) => seen.add(m)))
    return order.filter((m) => seen.has(m))
  }, [ledger])
  const anyManual = (ledger?.edges ?? []).some((e) => e.methods.length === 0)

  return (
    <Panel
      step="2·2"
      title="Causal graph — accumulated across every run"
      flush
      grow
      resizeId="causal-canvas"
      right={
        <div className="flex shrink-0 items-center gap-1.5">
          {graph && graph.n_edges > 0 && <Badge tone="indigo">{graph.n_edges} selected</Badge>}
          <button
            onClick={() => setShowRuns((o) => !o)}
            className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10.5px] font-medium text-faint transition-colors hover:border-indigo/50 hover:text-indigo"
          >
            {runs.length} run{runs.length === 1 ? '' : 's'}
          </button>
          <Info>
            The edge label is the oriented frequency: how many runs found that exact direction.
            Adjacency and orientation are tracked separately, so an edge every method finds but
            orients inconsistently shows up as a conflict rather than as agreement (Plan 3 §4.3).
          </Info>
        </div>
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-linesoft px-3 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => selectAll('valid')}
          disabled={!nEdges}
          title={
            'Build the strongest acyclic subset: walk the edges in descending frequency and ' +
            'keep each one that does not close a cycle with what is already kept. Skips are ' +
            'reported — that is where your methods disagree.'
          }
        >
          Best acyclic set
        </Button>
        <Button size="sm" variant="ghost" onClick={() => selectAll('none')} disabled={!nEdges}>
          Deselect all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => resetLayout('causal')} disabled={!nEdges}>
          <Icon name="refresh" className="text-[13px]" />
          Re-layout
        </Button>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5">
          <span className="text-[10.5px] text-faint">Colour by</span>
          <Tabs
            value={colourBy}
            onChange={setColourBy}
            tabs={[
              { id: 'method' as EdgeColouring, label: 'Method' },
              { id: 'status' as EdgeColouring, label: 'Status' },
            ]}
          />
        </span>
        <Button size="sm" variant="danger" onClick={clearRuns} disabled={!runs.length}>
          <Icon name="trash" className="text-[12px]" />
          Clear all runs
        </Button>
      </div>
      {showRuns && (
        <div className="shrink-0 border-b border-linesoft px-3 py-2">
          {runs.length === 0 ? (
            <p className="py-2 text-center text-[11.5px] text-faint">
              No runs yet. Each run appends to the ledger; the graph accumulates.
            </p>
          ) : (
            <ul className="-mx-1 max-h-40 overflow-y-auto">
              {[...runs].reverse().map((r) => (
                <li
                  key={r.run_id}
                  className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface2"
                >
                  <span className="font-mono text-[10px] text-faint">#{r.run_id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">
                      {r.method}{' '}
                      <span className="font-normal text-faint">
                        {r.constrained ? 'constrained' : 'unconstrained'}
                      </span>
                    </span>
                    <span className="block text-[10px] text-faint">
                      {r.n_edges} edges · validity{' '}
                      <span className={r.topological_validity < 1 ? 'text-red' : 'text-green'}>
                        {(r.topological_validity * 100).toFixed(0)}%
                      </span>{' '}
                      {r.priors && <span className="text-indigo">· priors ({r.priors}) </span>}·
                      seed {r.seed}
                    </span>
                  </span>
                  <button
                    onClick={() => deleteRun(r.run_id)}
                    aria-label={`Delete run ${r.run_id}`}
                    className="shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity hover:bg-red/10 hover:text-red group-hover:opacity-100"
                  >
                    <Icon name="x" className="text-[12px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* Relative + absolute: React Flow sizes itself with `height: 100%`, which does not
          resolve against a `flex: 1 1 0%` parent. See OntologyCanvas for the same note. */}
      <div className="relative min-h-0 w-full flex-1">
        <div className="absolute inset-0">
          {nEdges === 0 ? (
            <Empty icon="play">
              No edges yet. Run a discovery method on the left — every run accumulates into this
              graph, and the label on each edge is how many runs found it. You can also draw an edge
              by hand from the panel on the right; it enters at frequency 0.
            </Empty>
          ) : (
            <ReactFlowProvider>
              <Canvas colourBy={colourBy} />
            </ReactFlowProvider>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linesoft px-3 py-2 text-[11px] text-faint">
        {colourBy === 'method' ? (
          <>
            {usedMethods.map((m) => (
              <Swatch key={m} colour={`var(--ck-${METHOD_TONE[m]})`} label={m} />
            ))}
            {anyManual && <Swatch colour="var(--ck-faint)" label="hand-authored (dashed)" />}
            {usedMethods.length === 0 && !anyManual && (
              <span>Run a method to give these edges a colour.</span>
            )}
            {usedMethods.length > 1 && (
              <span>
                An edge two methods found is striped in both — the stripes are the agreement.
              </span>
            )}
          </>
        ) : (
          <>
            <Swatch colour="var(--ck-green)" label="valid under Assumption 1" />
            <Swatch colour="var(--ck-orange)" label="orientation conflict" />
            <Swatch colour="var(--ck-red)" label="violates Assumption 1" />
            <Swatch colour="var(--ck-faint)" label="hand-authored (dashed, freq 0)" />
          </>
        )}
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-indigo">✓</span> selected — bold and lit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-orange">⃠</span> would close a cycle — not selectable
        </span>
        <span className="ml-auto">Click an edge to select or deselect it. Drag any card.</span>
      </div>
    </Panel>
  )
}

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="8" aria-hidden>
        <path d="M1 4h13" stroke={colour} strokeWidth="2" />
        <path d="M13 1.5 18 4l-5 2.5z" fill={colour} />
      </svg>
      {label}
    </span>
  )
}
