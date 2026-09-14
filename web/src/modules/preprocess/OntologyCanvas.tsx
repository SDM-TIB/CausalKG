import { useEffect, useMemo } from 'react'
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
import { ontologyNodeTypes } from '../../flow/cards'
import { edgeTypes } from '../../flow/FloatingEdge'
import { FitOnResize } from '../../flow/FitOnResize'
import { ringAngle, useLayoutSync } from '../../flow/useLayoutSync'
import { Badge, Button, Icon, Info, Panel } from '../../app/ui'

const CLASS_R = 250
const SAT_R = 195

function Canvas() {
  const nodesData = useStore((s) => s.nodes)
  const toggleNode = useStore((s) => s.toggleNode)
  const toggleJoin = useStore((s) => s.toggleJoin)
  const { place, commit } = useLayoutSync('ontology')

  const { seedNodes, seedEdges } = useMemo(() => {
    const classSet = new Set<string>()
    nodesData.forEach((n) => {
      classSet.add(n.domain)
      if (n.kind === 'object') classSet.add(n.range)
    })
    const classes = [...classSet].sort()
    const nC = classes.length
    const centre: Record<string, { x: number; y: number }> = {}
    classes.forEach((c, i) => {
      const a = ringAngle(i, nC)
      const r = nC === 1 ? 0 : CLASS_R + Math.max(0, nC - 4) * 34
      centre[c] = { x: r * Math.cos(a), y: r * Math.sin(a) }
    })

    // A property's satellite card — data or object — is drawn only while it is a
    // retained candidate variable, exactly like a data property (Preprocess
    // revision 2). An object property's relationship (the edge below) is a
    // separate, independent axis and stays drawn regardless.
    const byClass: Record<string, typeof nodesData> = {}
    nodesData
      .filter((n) => !n.excluded)
      .forEach((n) => (byClass[n.domain] = [...(byClass[n.domain] ?? []), n]))

    const rfNodes: Node[] = []
    classes.forEach((c, i) => {
      const props = byClass[c] ?? []
      rfNodes.push({
        id: `c:${c}`,
        type: 'classCard',
        position: place(`c:${c}`, { x: centre[c].x - 64, y: centre[c].y - 20 }),
        data: {
          label: c,
          nProps: nodesData.filter((n) => n.kind === 'data' && !n.excluded && n.domain === c)
            .length,
          nObjects: nodesData.filter(
            (n) => n.kind === 'object' && !n.join_excluded && n.domain === c,
          ).length,
        },
        draggable: true,
      })
      // Fan this class's properties outward from the class, away from the centre
      // of the ring, so satellites of different classes don't collide.
      const base = nC === 1 ? -Math.PI / 2 : ringAngle(i, nC)
      const spread = nC === 1 ? Math.PI * 2 * ((props.length - 1) / props.length) : Math.PI * 0.95
      props.forEach((p, k) => {
        const a =
          props.length === 1 ? base : base - spread / 2 + (spread * k) / (props.length - 1)
        rfNodes.push({
          id: `p:${p.name}`,
          type: 'propCard',
          position: place(`p:${p.name}`, {
            x: centre[c].x + SAT_R * Math.cos(a) - 52,
            y: centre[c].y + SAT_R * Math.sin(a) - 18,
          }),
          data: {
            label: p.prop,
            range: p.range,
            numeric: p.value_hint === 'numeric',
            kind: p.kind,
            distinct: p.n_distinct,
            full:
              p.kind === 'object'
                ? `${p.name} — value is the related ${p.range}'s local name`
                : `${p.name} — ${p.range}`,
          },
          draggable: true,
        })
      })
    })

    const rfEdges: Edge[] = []
    nodesData
      .filter((n) => !n.excluded)
      .forEach((n) =>
        rfEdges.push({
          id: `t:${n.name}`,
          source: `c:${n.domain}`,
          target: `p:${n.name}`,
          type: 'floating',
          selectable: false,
          data: { tone: 'faint', head: false, width: 1, dim: true },
        }),
      )
    // The relationship edge is the join: always drawn, solid when joined and
    // dashed when not. Clicking it toggles the join — which under W26 is the
    // same thing as switching the property between its two roles, since a
    // dropped join is what makes it a variable. The curation panel's three-way
    // selector is the explicit form of the same choice.
    nodesData
      .filter((n) => n.kind === 'object')
      .forEach((n) => {
        rfEdges.push({
          id: `o:${n.name}`,
          source: `c:${n.domain}`,
          target: `c:${n.range}`,
          type: 'floating',
          data: {
            tone: 'green',
            label: n.prop,
            width: 2,
            dashed: n.join_excluded,
            dim: n.join_excluded,
            title: n.join_excluded
              ? `${n.domain} —${n.prop}→ ${n.range}\nNot joined — ${n.range}'s own properties cannot ride into a ${n.domain} row through this relation.\nClick to join it.`
              : `${n.domain} —${n.prop}→ ${n.range}\nThe join this relation contributes to the flat join.\nClick to remove it.`,
          },
        })
      })

    return { seedNodes: rfNodes, seedEdges: rfEdges }
    // `place` changes with the stored layout, which is exactly when we want to rebuild.
  }, [nodesData, place])

  const [nodes, setNodes, onNodesChange] = useNodesState(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(seedEdges)
  useEffect(() => setNodes(seedNodes), [seedNodes, setNodes])
  useEffect(() => setEdges(seedEdges), [seedEdges, setEdges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={ontologyNodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={commit}
      onNodeClick={(_, n) => n.type === 'propCard' && toggleNode(n.id.slice(2))}
      onEdgeClick={(_, e) => e.id.startsWith('o:') && toggleJoin(e.id.slice(2))}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--ck-grid)" />
      <Controls showInteractive={false} position="bottom-right" />
      <FitOnResize />
    </ReactFlow>
  )
}

export function OntologyCanvas() {
  const resetLayout = useStore((s) => s.resetLayout)
  const nodesData = useStore((s) => s.nodes)
  const nExcluded = nodesData.filter((n) => n.excluded).length

  return (
    <Panel
      step="1·2"
      title="Ontology — classes, properties & relationships"
      flush
      grow
      resizeId="ontology-canvas"
      right={
        <div className="flex items-center gap-1.5">
          {nExcluded > 0 && <Badge tone="orange">{nExcluded} excluded</Badge>}
          <Button size="sm" variant="ghost" onClick={() => resetLayout('ontology')}>
            <Icon name="refresh" className="text-[13px]" />
            Re-layout
          </Button>
          <Info>
            The induced T-Box, not the causal search space. One card per class, one satellite card
            per retained property (green for object, amber/sky for data), one directed labelled
            edge per object property — the card is the property as a candidate variable, the edge
            is its relationship being joined, and the two are curated independently. Assumption
            1's admissible edge set is still computed — it is the pruning rate in the curation
            panel — it just isn't what's drawn here (Plan 3 §3.4, W7).
          </Info>
        </div>
      }
    >
      {/* React Flow's root is `height: 100%`, and a percentage height does not resolve
          against a parent whose own height came from `flex: 1 1 0%` — the canvas
          collapses to 0 and the graph vanishes. Absolute-filling a relative wrapper is
          the reliable way to hand a flex-sized box to a library that wants percentages. */}
      <div className="relative min-h-0 w-full flex-1">
        <div className="absolute inset-0">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linesoft px-3 py-2 text-[11px] text-faint">
        <Legend colour="var(--ck-teal)" label="class" />
        <Legend colour="var(--ck-sky)" label="numeric data property" />
        <Legend colour="var(--ck-amber)" label="string / date data property" />
        <Legend colour="var(--ck-green)" label="object property — as a causal variable (card)" />
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8" aria-hidden>
            <path d="M1 4h13" stroke="var(--ck-green)" strokeWidth="2" />
            <path d="M13 1.5 18 4l-5 2.5z" fill="var(--ck-green)" />
          </svg>
          object property — as a relationship (edge), dashed when not joined
        </span>
        <span className="ml-auto">
          Drag any card. Click a data-property card to drop its column, or a green relationship
          edge to switch that object property between its two roles — it is a relationship{' '}
          <em>or</em> a causal variable, never both.
        </span>
      </div>
    </Panel>
  )
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-4 rounded-[4px] border"
        style={{
          borderColor: colour,
          background: `color-mix(in srgb, ${colour} 16%, transparent)`,
        }}
      />
      {label}
    </span>
  )
}
