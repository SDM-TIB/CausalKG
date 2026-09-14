/** Number formatting shared by every chart and card. One rule, applied everywhere. */

export function fmtNum(v: number): string {
  const abs = Math.abs(v)
  if (!Number.isFinite(v)) return '—'
  if (abs !== 0 && (abs < 0.01 || abs >= 100_000)) return v.toExponential(2)
  return v.toFixed(abs < 10 ? 2 : abs < 1000 ? 1 : 0)
}

/**
 * A value as it should read on a card.
 *
 * An object-valued causal variable's value is the related entity's **full
 * IRI** — `bgp.py` stopped shortening it there deliberately, because two
 * entities in different namespaces can share a local name and the RDF export
 * needs the IRI to emit an `rr:IRI` term rather than a string. Shortening is a
 * display concern, so it happens here: the store holds the IRI, every card
 * shows the local name, and the `title` attribute (see `fmtValueTitle`) keeps
 * the full one one hover away.
 */
export function fmtValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return fmtNum(v)
  const s = String(v)
  return isIri(s) ? shortIri(s) : s
}

/** The untruncated form, for a `title=` tooltip beside `fmtValue`. */
export function fmtValueTitle(v: string | number | null | undefined): string | undefined {
  return typeof v === 'string' && isIri(v) ? v : undefined
}

export function isIri(s: string): boolean {
  return /^(https?|urn|file):/i.test(s)
}

/** `Class.property` → the property alone; the class is shown separately on every card. */
export function shortName(n: string | null | undefined): string {
  if (!n) return '—'
  const dot = n.lastIndexOf('.')
  return dot > 0 ? n.slice(dot + 1) : n
}

export function splitName(n: string): { cls: string; prop: string } {
  const dot = n.lastIndexOf('.')
  return dot > 0 ? { cls: n.slice(0, dot), prop: n.slice(dot + 1) } : { cls: '', prop: n }
}

export function shortIri(iri: string): string {
  return iri.split(/[#/]/).pop() || iri
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
