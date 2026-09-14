/**
 * A categorical distribution as horizontal bars, one row per level.
 *
 * Horizontal rather than vertical because the labels are the point: a level called
 * `NonSmoker` has to be readable next to its bar, and a vertical bar chart 130px wide
 * can only ever show it rotated or truncated. The bar's fill length is the probability;
 * a `ghost` value draws the observational marginal behind it, so a posterior is always
 * read as a *movement* rather than as a number that arrived from nowhere.
 *
 * Clicking a row pins that level — this chart is the control, not a read-out of one.
 */
import { fmtNum } from '../../lib/num'

export interface BarDatum {
  label: string
  value: number
  /** The prior, drawn behind — omitted when there is nothing to compare against. */
  ghost?: number
}

export function BarDistribution({
  data,
  rowHeight = 17,
  pickedLabel = null,
  factualLabel = null,
  tone = 'var(--ck-indigo)',
  pickedTone = 'var(--ck-green)',
  onPick,
  showValues = true,
}: {
  data: BarDatum[]
  rowHeight?: number
  pickedLabel?: string | null
  factualLabel?: string | null
  tone?: string
  pickedTone?: string
  onPick?: (label: string) => void
  showValues?: boolean
}) {
  const max = Math.max(0.0001, ...data.map((d) => Math.max(d.value, d.ghost ?? 0)))
  return (
    <ul className="space-y-[2px]">
      {data.map((d) => {
        const picked = pickedLabel === d.label
        const factual = factualLabel === d.label
        return (
          <li
            key={d.label}
            title={`${d.label} — ${(d.value * 100).toFixed(1)}%${
              d.ghost === undefined ? '' : ` (prior ${(d.ghost * 100).toFixed(1)}%)`
            }${onPick ? '\nClick to pin this level' : ''}`}
            onClick={onPick ? (e) => { e.stopPropagation(); onPick(d.label) } : undefined}
            className={`group grid grid-cols-[minmax(0,4.6rem)_1fr_auto] items-center gap-1.5 rounded-[4px] ${
              onPick ? 'cursor-pointer hover:bg-surface3/60' : ''
            }`}
            style={{ height: rowHeight }}
          >
            <span
              className={`truncate text-[9.5px] leading-none ${
                picked ? 'font-semibold' : factual ? 'font-medium' : 'text-faint'
              }`}
              style={{ color: picked || factual ? pickedTone : undefined }}
            >
              {factual && !picked ? '◆ ' : ''}
              {d.label}
            </span>
            <span className="relative h-[7px] overflow-hidden rounded-[3px] bg-surface3">
              {d.ghost !== undefined && (
                <span
                  className="absolute inset-y-0 left-0 rounded-[3px]"
                  style={{
                    width: `${(d.ghost / max) * 100}%`,
                    background: 'color-mix(in srgb, var(--ck-faint) 40%, transparent)',
                  }}
                />
              )}
              <span
                className="absolute inset-y-0 left-0 rounded-[3px] transition-[width] duration-300"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  background: picked ? pickedTone : tone,
                  opacity: picked ? 1 : 0.85,
                }}
              />
            </span>
            {showValues && (
              <span
                className="w-[2.1rem] text-right font-mono text-[9px] leading-none tabular-nums"
                style={{ color: picked ? pickedTone : 'var(--ck-faint)' }}
              >
                {fmtPct(d.value)}
              </span>
            )}
          </li>
        )
      })}
      {data.length === 0 && (
        <li className="py-2 text-center text-[9.5px] text-faint">no levels</li>
      )}
    </ul>
  )
}

function fmtPct(v: number) {
  const pct = v * 100
  return pct >= 99.95 ? '100' : pct < 0.05 && pct > 0 ? '<.1' : fmtNum(pct)
}
