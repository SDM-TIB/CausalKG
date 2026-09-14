/**
 * A continuous variable's density, as an SVG area over a KDE grid the server computed
 * (`x`/`y` from `/model/marginals` or `/infer/predict`). The browser never estimates a
 * density: two clients would then disagree about the same model.
 *
 * Two interactions, both required by the card this lives in:
 *  - **hover** — a crosshair and a readout following the cursor, so the horizontal axis
 *    has a meaning before you commit to a value. A density plot with no readout is a
 *    shape; with one it is a scale you can point at.
 *  - **click** — pins the value under the cursor, dropping a persistent marker. That is
 *    how a continuous variable gets observed or intervened on; a number box would work
 *    but would not show you where in the distribution you had just landed.
 *
 * `overlays` is an escape hatch for the prior curve drawn behind a posterior, and
 * `factualValue` draws module 4's dashed baseline. Both are optional, so module 3 and
 * module 4 share one component rather than forking it.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { scaleLinear } from 'd3-scale'
import { area as d3area, curveMonotoneX } from 'd3-shape'
import { clamp, fmtNum } from '../../lib/num'

export interface DensityCurveProps {
  x: number[]
  y: number[]
  width?: number
  height?: number
  colour?: string
  fill?: string
  /** The pinned value: a solid line with a top marker. */
  pinned?: number | null
  pinnedTone?: string
  /** Module 4's baseline: a dashed line, always visible, never the pinned value. */
  factualValue?: number | null
  onPick?: (value: number) => void
  overlays?: ReactNode
}

export function DensityCurve({
  x,
  y,
  width = 140,
  height = 58,
  colour = 'var(--ck-sky)',
  fill = 'color-mix(in srgb, var(--ck-sky) 22%, transparent)',
  pinned = null,
  pinnedTone = 'var(--ck-green)',
  factualValue = null,
  onPick,
  overlays,
}: DensityCurveProps) {
  const padTop = 5
  const padBottom = 11
  const innerH = height - padTop - padBottom
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const lo = x.length ? x[0] : 0
  const hi = x.length ? x[x.length - 1] : 1
  const sx = useMemo(() => scaleLinear().domain([lo, hi]).range([0, width]), [lo, hi, width])
  const maxY = Math.max(1e-9, ...y)
  const sy = useMemo(() => scaleLinear().domain([0, maxY]).range([0, innerH]), [maxY, innerH])

  const path = useMemo(() => {
    if (!x.length) return ''
    const gen = d3area<number>()
      .x((_, i) => sx(x[i]))
      .y0(height - padBottom)
      .y1((_, i) => height - padBottom - sy(y[i] ?? 0))
      .curve(curveMonotoneX)
    return gen(x) ?? ''
  }, [x, y, sx, sy, height])

  const valueAt = useCallback(
    (clientX: number) => {
      const svg = svgRef.current
      if (!svg) return null
      const r = svg.getBoundingClientRect()
      return sx.invert(((clientX - r.left) / r.width) * width)
    },
    [sx, width],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={`block select-none overflow-visible ${onPick ? 'cursor-crosshair' : ''}`}
      onMouseMove={(e) => setHover(valueAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={
        onPick
          ? (e) => {
              e.stopPropagation()
              const v = valueAt(e.clientX)
              if (v !== null) onPick(Number(clamp(v, lo, hi).toFixed(4)))
            }
          : undefined
      }
    >
      {overlays}
      <path d={path} fill={fill} stroke={colour} strokeWidth={1.3} />

      {/* Baseline axis, so an empty region still reads as "low density" not "no data". */}
      <line
        x1={0}
        x2={width}
        y1={height - padBottom}
        y2={height - padBottom}
        stroke="var(--ck-line)"
        strokeWidth={1}
      />

      {factualValue !== null && factualValue !== undefined && (
        <line
          x1={sx(clamp(factualValue, lo, hi))}
          x2={sx(clamp(factualValue, lo, hi))}
          y1={padTop}
          y2={height - padBottom}
          stroke="var(--ck-green)"
          strokeWidth={1.2}
          strokeDasharray="3 2.5"
        />
      )}

      {pinned !== null && pinned !== undefined && (
        <g pointerEvents="none">
          <line
            x1={sx(clamp(pinned, lo, hi))}
            x2={sx(clamp(pinned, lo, hi))}
            y1={padTop - 3}
            y2={height - padBottom}
            stroke={pinnedTone}
            strokeWidth={1.7}
          />
          <polygon
            points={`${sx(clamp(pinned, lo, hi)) - 3.5},${padTop - 4} ${
              sx(clamp(pinned, lo, hi)) + 3.5
            },${padTop - 4} ${sx(clamp(pinned, lo, hi))},${padTop + 1.5}`}
            fill={pinnedTone}
          />
        </g>
      )}

      {hover !== null && (
        <g pointerEvents="none">
          <line
            x1={sx(clamp(hover, lo, hi))}
            x2={sx(clamp(hover, lo, hi))}
            y1={padTop}
            y2={height - padBottom}
            stroke="var(--ck-faint)"
            strokeWidth={0.9}
            strokeDasharray="2 2"
          />
          <text
            x={clamp(sx(clamp(hover, lo, hi)) + 3, 2, width - 26)}
            y={padTop + 8}
            fontSize={8}
            fill="var(--ck-muted)"
            fontFamily="var(--ck-mono, ui-monospace)"
          >
            {fmtNum(clamp(hover, lo, hi))}
          </text>
        </g>
      )}

      {/* Axis extremes: without them the crosshair readout is the only scale on screen. */}
      <text x={0} y={height - 2} fontSize={7.5} fill="var(--ck-faint)">
        {fmtNum(lo)}
      </text>
      <text x={width} y={height - 2} fontSize={7.5} fill="var(--ck-faint)" textAnchor="end">
        {fmtNum(hi)}
      </text>
    </svg>
  )
}

/** The prior curve, drawn behind a posterior on the same axis. */
export function priorOverlay(
  priorX: number[] | null | undefined,
  priorY: number[] | null | undefined,
  domain: [number, number],
  width: number,
  height: number,
): ReactNode {
  if (!priorX?.length || !priorY?.length) return null
  const padBottom = 11
  const innerH = height - 5 - padBottom
  const sx = scaleLinear().domain(domain).range([0, width])
  const sy = scaleLinear()
    .domain([0, Math.max(1e-9, ...priorY)])
    .range([0, innerH])
  const gen = d3area<number>()
    .x((_, i) => sx(priorX[i]))
    .y0(height - padBottom)
    .y1((_, i) => height - padBottom - sy(priorY[i] ?? 0))
    .curve(curveMonotoneX)
  return (
    <path
      d={gen(priorX) ?? ''}
      fill="color-mix(in srgb, var(--ck-faint) 26%, transparent)"
      stroke="var(--ck-faint)"
      strokeWidth={0.8}
      strokeDasharray="2 2"
    />
  )
}
