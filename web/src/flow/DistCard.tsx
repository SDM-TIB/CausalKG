/**
 * The node card for modules 3 and 4 — one component, two modes.
 *
 * A causal variable is not a label with a value hanging off it; it is a distribution
 * you are moving. So the card *is* the distribution: bars for a categorical, a density
 * curve for a continuous one, both interactive. Setting evidence is done by clicking
 * the level or the point you mean, on the same chart that then shows you what your
 * choice did to everything else.
 *
 * Colour carries the role and nothing else carries it:
 *   green   observed — a value read off the world, conditioning
 *   orange  do() — a value forced, the node's incoming edges severed
 *   indigo  free — inferred, whatever the current query implies
 * Module 4 adds a fourth signal: the unit's *factual* state, always visible as a dashed
 * green line or a green ◆, so the counterfactual is always read against something.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BarDistribution, type BarDatum } from './charts/BarDistribution'
import { DensityCurve, priorOverlay } from './charts/DensityCurve'
import { fmtValue } from '../lib/num'

export type CardRole = 'free' | 'observed' | 'intervened'

export interface NodeDist {
  kind: 'categorical' | 'numeric'
  probs: Record<string, number> | null
  predicted: string | number | null
  mean: number | null
  std: number | null
  ci: number[] | null
  x: number[] | null
  y: number[] | null
  degenerate?: boolean
  min?: number
  max?: number
}

export interface DistCardData extends Record<string, unknown> {
  node: string
  cls: string
  prop: string
  dtype: string
  role: CardRole
  value: string | number | null
  /** The observational marginal, drawn behind — what the evidence moved things *from*. */
  prior: NodeDist | null
  /** The current answer. Null before the first Predict: the card then shows the prior. */
  posterior: NodeDist | null
  /** Module 4 only: this unit's actual value. */
  factual: string | number | null
  /** Module 4 only: the dashed pill above the card. */
  hypothetical: string | number | null
  /**
   * Whether the prior is a legitimate thing to draw behind the posterior on *this*
   * card. Two cases where it is not, and both used to show up as unexplained grey
   * bars behind an answer the user had just pinned:
   *
   *  - a pinned node (observed or do()) has a posterior that is a point mass by
   *    construction. Its prior is not "what the evidence moved it from" — nothing
   *    moved, the value was asserted — so a grey bar on every level the user did
   *    *not* choose reads as residual probability the answer does not contain.
   *  - module 4, on every card. A counterfactual's reference is this unit's own
   *    factual state (already on the card as ◆), not the population marginal;
   *    drawing the marginal behind it invites reading one against the other, and
   *    they are answers to different questions about different populations.
   */
  showPrior: boolean
  selected: boolean
  onPick: (node: string, value: string | number) => void
  onClear: (node: string) => void
  onMenu: (node: string, x: number, y: number) => void
  onSelect: (node: string) => void
}

const ROLE = {
  free: { border: 'border-line', text: 'text-muted', varName: 'var(--ck-indigo)', tag: '' },
  observed: {
    border: 'border-green/60', text: 'text-green', varName: 'var(--ck-green)', tag: 'obs',
  },
  intervened: {
    border: 'border-orange/70', text: 'text-orange', varName: 'var(--ck-orange)', tag: 'do()',
  },
} as const

const CARD_W = 176

export function DistCard({ data }: NodeProps) {
  const d = data as unknown as DistCardData
  const r = ROLE[d.role]
  const dist = d.posterior ?? d.prior
  const numeric = (dist?.kind ?? (d.dtype === 'categorical' || d.dtype === 'ordinal'
    ? 'categorical' : 'numeric')) === 'numeric'
  const pinnedTone = d.role === 'intervened' ? 'var(--ck-orange)' : 'var(--ck-green)'

  const ghosted = d.showPrior && d.role === 'free'
  const bars: BarDatum[] = !numeric && dist?.probs
    ? Object.entries(dist.probs).map(([label, value]) => ({
        label,
        value,
        ghost: ghosted && d.posterior && d.prior?.probs ? d.prior.probs[label] ?? 0 : undefined,
      }))
    : []

  // The axis comes from the server and belongs to the *node*, not to this answer (main.py
  // W26). The prior fallback is the last line of defence: a card with no grid at all is
  // silently ruled 0-to-1, which is both an empty chart and a click target that reports
  // values the variable never takes.
  const gridX = dist?.x?.length ? dist.x : d.prior?.x ?? []
  const gridY = dist?.x?.length ? dist.y ?? [] : d.prior?.y ?? []
  const domain: [number, number] = [gridX[0] ?? 0, gridX[gridX.length - 1] ?? 1]

  return (
    <div
      className="relative"
      style={{ width: CARD_W }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        d.onMenu(d.node, e.clientX, e.clientY)
      }}
      onClick={() => d.onSelect(d.node)}
    >
      {/* Module 4's hypothetical, floating clear of the card so it reads as an
          annotation *on* the unit rather than as another of its properties. */}
      {d.hypothetical !== null && d.hypothetical !== undefined && (
        <div
          className="absolute inset-x-0 bottom-[calc(100%+7px)] flex items-center gap-1 rounded-full border border-dashed border-orange px-2 py-[2px] text-[9.5px] text-orange"
          style={{ background: 'color-mix(in srgb, var(--ck-orange) 12%, var(--ck-surface))' }}
        >
          <span className="min-w-0 flex-1 truncate">
            hypothetical <b>{fmtValue(d.hypothetical)}</b>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); d.onClear(d.node) }}
            aria-label={`Remove the hypothetical on ${d.node}`}
            className="shrink-0 text-orange/70 hover:text-orange"
          >
            ✕
          </button>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-xl border bg-surface shadow-[var(--ck-shadow)] transition-[border-color,box-shadow] ${r.border} ${
          d.selected ? 'ring-1 ring-indigo/50' : ''
        }`}
        style={
          d.role === 'free'
            ? undefined
            : { background: `color-mix(in srgb, ${r.varName} 7%, var(--ck-surface))` }
        }
      >
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <Handle type="source" position={Position.Right} isConnectable={false} />

        <header className="flex items-baseline gap-1.5 border-b border-linesoft px-2 py-1">
          <span className="truncate text-[8.5px] uppercase leading-none tracking-wide text-faint">
            {d.cls}
          </span>
          <span
            className={`min-w-0 flex-1 truncate font-mono text-[11px] font-semibold leading-none ${
              d.role === 'free' ? 'text-ink' : r.text
            }`}
            title={d.node}
          >
            {d.prop}
          </span>
          {r.tag && (
            <span className={`shrink-0 font-mono text-[8.5px] font-semibold ${r.text}`}>
              {r.tag}
            </span>
          )}
        </header>

        <div className="px-2 py-1.5">
          {numeric ? (
            <DensityCurve
              x={gridX}
              y={gridY}
              width={CARD_W - 16}
              height={56}
              pinned={d.value === null ? null : Number(d.value)}
              pinnedTone={pinnedTone}
              factualValue={d.factual === null ? null : Number(d.factual)}
              onPick={(v) => d.onPick(d.node, v)}
              overlays={
                ghosted && d.posterior
                  ? priorOverlay(d.prior?.x, d.prior?.y, domain, CARD_W - 16, 56)
                  : null
              }
            />
          ) : (
            <BarDistribution
              data={bars}
              pickedLabel={d.value === null ? null : String(d.value)}
              factualLabel={d.factual === null ? null : String(d.factual)}
              pickedTone={pinnedTone}
              onPick={(label) => d.onPick(d.node, label)}
            />
          )}
        </div>

        <footer className="flex items-baseline gap-1.5 border-t border-linesoft px-2 py-[3px] text-[9px]">
          <span className="truncate text-faint">
            {numeric
              ? dist?.mean === null || dist?.mean === undefined
                ? 'continuous'
                // A mean over a point mass is the point. `μ` invites reading a spread
                // that is not there — an abducted additive-noise residual is exact.
                : `${dist.degenerate ? '=' : 'μ'} ${fmtValue(dist.mean)}`
              : `${bars.length} levels`}
          </span>
          <span className="flex-1" />
          <span className={`shrink-0 font-mono ${d.role === 'free' ? 'text-faint' : r.text}`}>
            {d.role === 'intervened'
              ? `do(${fmtValue(d.value)})`
              : d.role === 'observed'
                ? `= ${fmtValue(d.value)}`
                : d.factual !== null && d.factual !== undefined
                  ? <span className="text-green">factual {fmtValue(d.factual)}</span>
                  : d.posterior
                    ? 'inferred'
                    : 'prior'}
          </span>
        </footer>
      </div>
    </div>
  )
}

/** React Flow needs a height before the card renders, or the layout overlaps itself. */
export function distCardHeight(dtype: string, nLevels: number): number {
  const body = dtype === 'categorical' || dtype === 'ordinal'
    ? Math.max(24, nLevels * 19)
    : 56
  return 20 + body + 12 + 14
}

export const distCardWidth = CARD_W
export const distNodeTypes = { distCard: DistCard }
