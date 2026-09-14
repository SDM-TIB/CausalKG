import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode, type Node } from '@xyflow/react'
import { arrow, type ArrowTone } from './Defs'

/**
 * A floating edge: it attaches to the *border* of each card rather than to a
 * fixed handle, so a card can be dragged anywhere and the edge still points at
 * it sensibly. Adapted from React Flow's floating-edges example — the geometry
 * is the standard ellipse/rect intersection, the styling is ours.
 */
function intersection(from: InternalNode<Node>, to: InternalNode<Node>) {
  const w = (from.measured.width ?? 120) / 2
  const h = (from.measured.height ?? 40) / 2
  const cx = from.internals.positionAbsolute.x + w
  const cy = from.internals.positionAbsolute.y + h
  const tx = to.internals.positionAbsolute.x + (to.measured.width ?? 120) / 2
  const ty = to.internals.positionAbsolute.y + (to.measured.height ?? 40) / 2

  const x1 = (tx - cx) / (2 * w) - (ty - cy) / (2 * h)
  const y1 = (tx - cx) / (2 * w) + (ty - cy) / (2 * h)
  const denom = Math.abs(x1) + Math.abs(y1)
  if (!denom) return { x: cx, y: cy }
  const a = 1 / denom
  return { x: w * (a * x1 + a * y1) + cx, y: h * (-a * x1 + a * y1) + cy }
}

export interface FloatingEdgeData extends Record<string, unknown> {
  tone: ArrowTone
  /**
   * More than one tone on one edge, drawn as interleaved dashes in a fixed order.
   *
   * An edge in the discovery ledger is not found by *a* method, it is found by a set of
   * them, and the set is the interesting part — GES and PC agreeing is a different claim
   * from GES alone. Colouring by "the first method" would throw the agreement away and
   * stacking parallel lines would move the geometry, so the same path is stroked once per
   * method with complementary dash patterns: a two-method edge reads as two alternating
   * colours along one line, and the arrowhead takes `tone` (the first).
   */
  tones?: ArrowTone[]
  label?: string
  dashed?: boolean
  width?: number
  dim?: boolean
  head?: boolean
  emphasis?: boolean
  title?: string
}

export function FloatingEdge({ id, source, target, data, markerEnd: _m }: EdgeProps) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null

  const d = (data ?? {}) as FloatingEdgeData
  const tone = d.tone ?? 'faint'
  const width = d.width ?? 1.6
  const stroke = `var(--ck-${tone})`

  let path: string
  let lx: number
  let ly: number

  if (source === target) {
    // Reflexive object property (Class -> itself): a small loop above the card.
    const x = s.internals.positionAbsolute.x + (s.measured.width ?? 120) / 2
    const y = s.internals.positionAbsolute.y
    path = `M ${x - 16} ${y} C ${x - 52} ${y - 58}, ${x + 52} ${y - 58}, ${x + 16} ${y}`
    lx = x
    ly = y - 40
  } else {
    const a = intersection(s, t)
    const b = intersection(t, s)
    // A gentle arc, perpendicular to the chord, so reciprocal pairs (A→B and
    // B→A) never collapse onto the same line — which is exactly the
    // Markov-equivalence conflict the user needs to see as two edges.
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const bow = Math.min(34, len * 0.16)
    const mx = (a.x + b.x) / 2 - (dy / len) * bow
    const my = (a.y + b.y) / 2 + (dx / len) * bow
    path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
    lx = (a.x + b.x) / 4 + mx / 2
    ly = (a.y + b.y) / 4 + my / 2
  }

  // The dash geometry for an n-tone edge: each stroke draws `seg` px then skips the
  // other n-1 segments, offset so the colours land in sequence rather than on top of
  // each other. n = 1 falls straight back to the plain single-colour path.
  const tones = d.tones && d.tones.length > 1 ? d.tones : null
  const seg = 7

  return (
    <>
      {/* Fat transparent path: the click target. Edges are selectable, and a
          1.6px line is not a usable hit area. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} className="react-flow__edge-interaction" />
      {tones ? (
        tones.map((t, i) => (
          <path
            key={t}
            id={i === 0 ? id : undefined}
            d={path}
            fill="none"
            stroke={`var(--ck-${t})`}
            strokeWidth={width}
            strokeDasharray={`${seg} ${seg * (tones.length - 1)}`}
            strokeDashoffset={-seg * i}
            strokeLinecap="butt"
            opacity={d.dim ? 0.55 : 1}
            markerEnd={i === 0 && d.head !== false ? arrow(tones[0]) : undefined}
            style={d.emphasis ? { filter: `drop-shadow(0 0 5px var(--ck-${t}))` } : undefined}
          >
            {i === 0 && d.title && <title>{d.title}</title>}
          </path>
        ))
      ) : (
        <path
          id={id}
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeDasharray={d.dashed ? '5 4' : undefined}
          strokeLinecap="round"
          opacity={d.dim ? 0.55 : 1}
          markerEnd={d.head === false ? undefined : arrow(tone)}
          style={d.emphasis ? { filter: `drop-shadow(0 0 5px ${stroke})` } : undefined}
        >
          {d.title && <title>{d.title}</title>}
        </path>
      )}
      {d.label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute origin-center rounded-md border px-1.5 py-[1px] font-mono text-[10px] leading-[14px] backdrop-blur-[2px]"
            style={{
              transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`,
              borderColor: `color-mix(in srgb, ${stroke} 45%, transparent)`,
              background: `color-mix(in srgb, ${stroke} 12%, var(--ck-surface))`,
              color: stroke,
              opacity: d.dim ? 0.85 : 1,
              fontWeight: d.emphasis ? 600 : 400,
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { floating: FloatingEdge }
