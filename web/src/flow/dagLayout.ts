import type { XY } from './useLayoutSync'

export interface DagEdge {
  source: string
  target: string
}

/**
 * Seed positions by topological layer: causes above, effects below.
 *
 * The discovery canvas seeds on a ring because its edge set is a *ledger* — a pile of
 * competing claims with no agreed direction, where a ring says "these are all candidates"
 * honestly. Once a DAG has been curated the direction is settled, and layering is the
 * arrangement that shows it: depth is causal depth, and every arrow points downwards.
 *
 * Cycles cannot occur here (the selection is validated acyclic server-side), but the
 * longest-path computation is written to terminate anyway rather than trust that.
 */
export function layerLayout(
  nodes: string[],
  edges: DagEdge[],
  opts: { dx?: number; dy?: number } = {},
): Record<string, XY> {
  const dx = opts.dx ?? 190
  const dy = opts.dy ?? 130

  const parents = new Map<string, string[]>(nodes.map((n) => [n, []]))
  edges.forEach((e) => {
    if (parents.has(e.target) && parents.has(e.source)) parents.get(e.target)!.push(e.source)
  })

  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (n: string): number => {
    const known = depth.get(n)
    if (known !== undefined) return known
    if (visiting.has(n)) return 0 // defensive: a cycle would otherwise recurse forever
    visiting.add(n)
    const ps = parents.get(n) ?? []
    const d = ps.length ? Math.max(...ps.map(depthOf)) + 1 : 0
    visiting.delete(n)
    depth.set(n, d)
    return d
  }
  nodes.forEach(depthOf)

  // Order within a layer by mean parent position, so edges cross as little as cheaply
  // possible. One pass — this is a seed the user then drags, not a layout engine.
  const layers = new Map<number, string[]>()
  nodes.forEach((n) => {
    const d = depth.get(n) ?? 0
    layers.set(d, [...(layers.get(d) ?? []), n])
  })

  const out: Record<string, XY> = {}
  const indexInLayer = new Map<string, number>()
  ;[...layers.keys()]
    .sort((a, b) => a - b)
    .forEach((d) => {
      const layer = layers.get(d)!
      const ordered =
        d === 0
          ? [...layer].sort()
          : [...layer].sort((a, b) => barycentre(a) - barycentre(b) || a.localeCompare(b))
      ordered.forEach((n, i) => {
        indexInLayer.set(n, i)
        out[n] = { x: (i - (ordered.length - 1) / 2) * dx, y: d * dy }
      })
    })

  function barycentre(n: string): number {
    const ps = (parents.get(n) ?? []).map((p) => indexInLayer.get(p)).filter((v) => v !== undefined)
    return ps.length ? (ps as number[]).reduce((a, b) => a + b, 0) / ps.length : 0
  }

  return out
}

/** Split "Class.prop" into its two halves for a two-line card. */
export function splitName(name: string): { cls: string; prop: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0
    ? { cls: name.slice(0, dot), prop: name.slice(dot + 1) }
    : { cls: '', prop: name }
}
