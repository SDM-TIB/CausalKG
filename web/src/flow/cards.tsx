import { Handle, Position, type NodeProps } from '@xyflow/react'

/**
 * Every node on every canvas is a rounded-rectangle card with its label inside
 * it (Plan 3 W11/W12). One accent colour per card carries the semantic role, a
 * second line carries what the user needs to decide with — the range and its
 * distinct count, or the owning class.
 */

function Ports() {
  // React Flow wants a source and a target port to exist; the floating edge
  // computes its own geometry, so these are never seen.
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  )
}

const shell =
  'relative rounded-xl border bg-surface px-2.5 py-1.5 text-left transition-[box-shadow,border-color,opacity,transform] duration-150'

export interface ClassCardData extends Record<string, unknown> {
  label: string
  nProps: number
  nObjects: number
}

export function ClassCard({ data }: NodeProps) {
  const d = data as ClassCardData
  return (
    <div
      className={`${shell} min-w-[128px] border-teal/55 shadow-[var(--ck-shadow)]`}
      style={{ background: 'color-mix(in srgb, var(--ck-teal) 9%, var(--ck-surface))' }}
      title={`${d.label} — ${d.nProps} data properties, ${d.nObjects} object properties`}
    >
      <Ports />
      <span
        className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-teal"
        aria-hidden
      />
      <div className="pl-1.5">
        <div className="font-mono text-[12.5px] font-semibold leading-tight text-teal">
          {d.label}
        </div>
        <div className="text-[10px] leading-tight text-muted">
          class · {d.nProps} propert{d.nProps === 1 ? 'y' : 'ies'}
        </div>
      </div>
    </div>
  )
}

export interface PropCardData extends Record<string, unknown> {
  label: string
  range: string
  numeric: boolean
  /** 'object' draws the green tone — a relationship read as a variable, not a literal. */
  kind: 'data' | 'object'
  distinct: number | null
  full: string
}

// Tailwind extracts class names statically, so tones are looked up as whole
// literals rather than built by interpolation.
const TONES = {
  sky: { border: 'border-sky/55', text: 'text-sky', varName: 'var(--ck-sky)' },
  amber: { border: 'border-amber/55', text: 'text-amber', varName: 'var(--ck-amber)' },
  green: { border: 'border-green/55', text: 'text-green', varName: 'var(--ck-green)' },
} as const

export function PropCard({ data }: NodeProps) {
  const d = data as PropCardData
  const tone = TONES[d.kind === 'object' ? 'green' : d.numeric ? 'sky' : 'amber']
  const sub = d.distinct === null ? d.range : `${d.range} · ${d.distinct} distinct`
  return (
    <div
      className={`${shell} min-w-[104px] cursor-pointer shadow-sm ${tone.border} hover:-translate-y-px hover:shadow-[var(--ck-shadow)]`}
      style={{ background: `color-mix(in srgb, ${tone.varName} 8%, var(--ck-surface))` }}
      title={`${d.full}\nClick to exclude this candidate node`}
    >
      <Ports />
      <div className={`font-mono text-[11.5px] font-semibold leading-tight ${tone.text}`}>
        {d.label}
      </div>
      <div className="text-[9.5px] leading-tight text-faint">{sub}</div>
    </div>
  )
}

export interface VarCardData extends Record<string, unknown> {
  cls: string
  prop: string
  inDeg: number
  outDeg: number
  selectedDeg: number
}

export function VarCard({ data }: NodeProps) {
  const d = data as VarCardData
  const live = d.selectedDeg > 0
  return (
    <div
      className={`${shell} min-w-[124px] shadow-sm ${
        live ? 'border-indigo/60 shadow-[var(--ck-shadow)]' : 'border-line'
      }`}
      style={
        live
          ? { background: 'color-mix(in srgb, var(--ck-indigo) 9%, var(--ck-surface))' }
          : undefined
      }
      title={`${d.cls}.${d.prop}\n${d.inDeg} in / ${d.outDeg} out in the ledger · ${d.selectedDeg} selected`}
    >
      <Ports />
      <div className="text-[9.5px] uppercase leading-tight tracking-wide text-faint">{d.cls}</div>
      <div
        className={`font-mono text-[12px] font-semibold leading-tight ${live ? 'text-indigo' : 'text-ink'}`}
      >
        {d.prop}
      </div>
    </div>
  )
}

export const ontologyNodeTypes = { classCard: ClassCard, propCard: PropCard }
export const causalNodeTypes = { varCard: VarCard }
