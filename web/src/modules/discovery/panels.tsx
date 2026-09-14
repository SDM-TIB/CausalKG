import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { Badge, Button, Field, Icon, Info, Input, Note, Panel, Select, StatGrid, Switch } from '../../app/ui'

const CONTINUOUS_NOTE =
  'Runs on integer-coded categories. That is a convenience, not a valid modelling assumption ' +
  '(Plan 1 §9.7) — treat the orientations it returns with more suspicion than the score-based methods.'

export function MethodPanel() {
  const { methods, busy, ctx, priors, runDiscovery } = useStore()
  const [method, setMethod] = useState('GES')
  const [constrained, setConstrained] = useState(true)
  const [alpha, setAlpha] = useState('')
  const [seed, setSeed] = useState('')

  const info = methods.find((m) => m.method === method)
  // alpha means something different per method (PC: significance level; the
  // continuous methods: an edge-weight threshold) but is silently ignored by
  // the BIC-scored searches (GES, GES-Prior) — disable it there rather than
  // let it look like a knob that does nothing. seed only feeds a numerical
  // optimiser's or ICA's random init, which only the continuous methods have.
  const usesAlpha = method === 'PC' || !!info?.continuous
  const usesSeed = !!info?.continuous

  return (
    <Panel
      step="2·1"
      title="Discovery method"
      right={
        <Info>
          Constrained and unconstrained are both offered because the comparison is the point:
          topological validity must be 1.0 for a constrained run, and its value for an
          unconstrained one is the concrete measure of what Assumption 1 bought (Plan 3 §4.2).
        </Info>
      }
      bodyClass="space-y-2.5"
    >
      <Field label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {methods.map((m) => (
            <option key={m.method} value={m.method} disabled={m.disabled}>
              {m.method}
              {m.continuous ? ' · continuous' : ''}
              {m.disabled ? ' — unavailable' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {info?.disabled && <Note tone="warn">{info.reason}</Note>}
      {info?.continuous && !info.disabled && <Note>{CONTINUOUS_NOTE}</Note>}
      {info?.needs_priors &&
        (priors?.loaded ? (
          <Note tone="ok">
            {priors.n_informative} informative prior entries loaded ({priors.source}). The
            search scores with them; every pair the estimator could not answer stays at the
            neutral 0.5.
          </Note>
        ) : (
          <Note tone="warn">
            No priors loaded — this runs the same GES search under the plain BIC score, which
            is a valid run but not what GES-Prior is for. Estimate or import them below.
          </Note>
        ))}

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
          Enforce Assumption 1
          <Info>
            Assumption 1 (Plan 1 §3, Plan 3 §4.2): a cause never points from an entity into the
            ontology class it belongs to or up its own object-property chain — an edge is only
            topologically valid if it respects that ordering. Constrained forbids the search
            from ever proposing an edge that violates it; unconstrained lets it propose anything,
            so its topological-validity score is a direct measure of what the constraint bought.
          </Info>
        </span>
        <Switch label="Constrained run" checked={constrained} onChange={setConstrained} />
      </div>

      <div className="flex gap-2">
        <Field
          label="alpha"
          hint={
            usesAlpha
              ? undefined
              : `${method} does not use alpha — it scores structures by BIC, not a significance threshold.`
          }
        >
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              placeholder="default"
              value={alpha}
              disabled={!usesAlpha}
              onChange={(e) => setAlpha(e.target.value)}
              className={usesAlpha ? undefined : 'opacity-50'}
            />
            <Info>
              {method === 'PC'
                ? 'The significance level for PC’s conditional-independence tests: lower alpha keeps fewer, more confident edges.'
                : 'The edge-weight threshold: a weight below alpha is dropped as noise rather than kept as an edge. Not used by BIC-scored searches (GES, GES-Prior), which have no such threshold.'}
            </Info>
          </div>
        </Field>
        <Field
          label="seed"
          hint={
            usesSeed
              ? undefined
              : `${method} has no random initialisation to seed — it is deterministic given the data.`
          }
        >
          <Input
            type="number"
            placeholder="random"
            value={seed}
            disabled={!usesSeed}
            onChange={(e) => setSeed(e.target.value)}
            className={usesSeed ? undefined : 'opacity-50'}
          />
        </Field>
      </div>

      <Button
        variant="primary"
        className="w-full"
        disabled={!!busy || info?.disabled}
        onClick={() =>
          runDiscovery({
            method,
            constrained,
            alpha: usesAlpha && alpha !== '' ? Number(alpha) : null,
            seed: usesSeed && seed !== '' ? Number(seed) : null,
          })
        }
      >
        <Icon name="play" className="text-[12px]" />
        Run {method}
      </Button>

      {ctx && (
        <div className="rounded-lg border border-line bg-surface2 p-2">
          <StatGrid
            rows={[
              ['Variables', ctx.columns.length],
              ['Rows', ctx.n_rows],
              ['Dropped (constant)', ctx.dropped_columns.length],
              ['Pruning rate', `${(ctx.constraint_stats.pruning_rate * 100).toFixed(1)}%`],
            ]}
          />
          {ctx.dropped_columns.length > 0 && (
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
              Constant after materialisation, so dropped before fitting: {ctx.dropped_columns.join(', ')}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

export function AddEdgeBar() {
  const { ledger, addEdge, clearManualEdges, busy } = useStore()
  const cols = ledger?.columns ?? []
  const [src, setSrc] = useState('')
  const [tgt, setTgt] = useState('')

  useEffect(() => {
    if (cols.length && !cols.includes(src)) setSrc(cols[0])
    if (cols.length > 1 && !cols.includes(tgt)) setTgt(cols[1])
  }, [cols, src, tgt])

  const nManual = ledger?.edges.filter((e) => e.manual).length ?? 0
  const ok = src && tgt && src !== tgt

  return (
    <Panel
      title="Add a causal edge"
      right={
        <Info>
          A hand-authored edge enters the ledger at frequency 0 — no run found it, you asserted it.
          It is not selected automatically: authoring an edge and endorsing it are separate acts
          (Plan 3 §4.4).
        </Info>
      }
      bodyClass="space-y-2"
    >
      <div className="flex items-center gap-1.5">
        <Select value={src} onChange={(e) => setSrc(e.target.value)} className="min-w-0 flex-1">
          {cols.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <span className="shrink-0 text-[13px] text-faint">→</span>
        <Select value={tgt} onChange={(e) => setTgt(e.target.value)} className="min-w-0 flex-1">
          {cols.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          className="shrink-0"
          disabled={!ok || !!busy}
          onClick={() => addEdge(src, tgt)}
        >
          <Icon name="plus" className="text-[12px]" />
          Add
        </Button>
      </div>
      {cols.length === 0 && (
        <Note>Run a method first — an edge can only refer to variables in the current frame.</Note>
      )}
      {nManual > 0 && (
        <Button size="sm" variant="ghost" className="w-full" onClick={clearManualEdges}>
          Clear {nManual} hand-authored edge{nManual === 1 ? '' : 's'}
        </Button>
      )}
    </Panel>
  )
}

export function EdgeListPanel() {
  const { ledger, toggleSelected, removeEdge, notify, selectTopK, busy } = useStore()
  const [only, setOnly] = useState<'all' | 'selected' | 'blocked' | 'conflict' | 'manual'>('all')
  const [k, setK] = useState(10)

  const rows = useMemo(() => {
    const es = ledger?.edges ?? []
    if (only === 'selected') return es.filter((e) => e.selected)
    if (only === 'blocked') return es.filter((e) => e.blocked)
    if (only === 'conflict') return es.filter((e) => e.conflict || !e.topologically_valid)
    if (only === 'manual') return es.filter((e) => e.manual)
    return es
  }, [ledger, only])

  const nBlocked = ledger?.edges.filter((e) => e.blocked).length ?? 0

  return (
    <Panel
      title="Edge ledger"
      right={
        <div className="flex items-center gap-1.5">
          {nBlocked > 0 && <Badge tone="orange">{nBlocked} blocked</Badge>}
          <Badge tone="muted">{ledger?.edges.length ?? 0}</Badge>
        </div>
      }
      bodyClass="space-y-2"
      note="Adjacency and orientation are counted separately; a reverse count means the methods disagree on direction. A greyed checkbox is an edge that would make the selection cyclic."
    >
      <div className="flex flex-wrap gap-1">
        {(['all', 'selected', 'blocked', 'conflict', 'manual'] as const).map((f) => (
          <Button key={f} size="sm" variant="ghost" active={only === f} onClick={() => setOnly(f)}>
            {f}
          </Button>
        ))}
      </div>

      {/* Not "show me the top k" — *select* the top k. Frequency order means the edges
          the most runs agree on win, and an edge that would close a cycle is skipped
          without spending one of the k slots, so "top 10" delivers 10 whenever 10 exist. */}
      <div className="flex items-end gap-1.5 rounded-lg border border-line bg-surface2 p-2">
        <Field
          label="Select the top k most frequent"
          hint="Descending oriented frequency, kept only while the selection stays acyclic."
        >
          <Input
            type="number"
            min={1}
            max={Math.max(1, ledger?.edges.length ?? 1)}
            value={k}
            onChange={(e) => setK(Math.max(1, Number(e.target.value) || 1))}
            className="w-20"
          />
        </Field>
        <Button
          size="sm"
          disabled={!!busy || !ledger?.edges.length}
          onClick={() => selectTopK(k)}
          className="mb-[1px]"
        >
          <Icon name="check" className="text-[12px]" />
          Select top {k}
        </Button>
      </div>
      <ul className="-mx-1 max-h-[44vh] overflow-y-auto">
        {rows.map((e) => {
          const tone = !e.topologically_valid ? 'text-red' : e.conflict ? 'text-orange' : 'text-green'
          return (
            <li
              key={`${e.source}->${e.target}`}
              className={`group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-surface2 ${
                e.blocked ? 'opacity-70' : ''
              }`}
            >
              {/* The DAG check runs before the request, not after it: an edge that would
                  close a cycle is simply not selectable, and says which cycle (W19). */}
              <input
                type="checkbox"
                checked={e.selected}
                disabled={e.blocked}
                onChange={() => toggleSelected(e.source, e.target)}
                aria-label={`Include ${e.source} to ${e.target}`}
                title={
                  e.blocked
                    ? `Would close the cycle ${e.blocked_path?.join(' → ')}`
                    : `Include ${e.source} → ${e.target} in the curated graph`
                }
                className="mt-[3px] size-3.5 shrink-0 accent-[var(--ck-indigo)] disabled:cursor-not-allowed"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px]" title={`${e.source} → ${e.target}`}>
                  {e.source} <span className="text-faint">→</span> {e.target}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
                  <span className={`font-mono ${tone}`}>freq {e.frequency}</span>
                  {e.reverse_frequency > 0 && <span className="text-orange">rev {e.reverse_frequency}</span>}
                  {e.manual && <span className="text-muted">hand-authored</span>}
                  {!e.topologically_valid && <span className="text-red">violates A1</span>}
                  {e.blocked && (
                    <button
                      className="text-orange underline decoration-dotted underline-offset-2"
                      onClick={() =>
                        notify(
                          'warn',
                          `${e.source} → ${e.target} would close the cycle ` +
                            `${e.blocked_path?.join(' → ')}. Deselect one of those edges first.`,
                        )
                      }
                    >
                      would cycle
                    </button>
                  )}
                  {e.relation_label && <span className="truncate">{e.relation_label}</span>}
                  {e.methods.length > 0 && <span className="truncate">{e.methods.join(', ')}</span>}
                </span>
              </span>
              {e.manual && (
                <button
                  onClick={() => removeEdge(e.source, e.target)}
                  aria-label="Remove hand-authored edge"
                  className="mt-[2px] shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity hover:bg-red/10 hover:text-red group-hover:opacity-100"
                >
                  <Icon name="trash" className="text-[12px]" />
                </button>
              )}
            </li>
          )
        })}
        {rows.length === 0 && (
          <li className="px-1.5 py-3 text-center text-[11.5px] text-faint">No edges here yet.</li>
        )}
      </ul>
    </Panel>
  )
}

export function CuratedGraphPanel() {
  const { graph, cycle, setModule } = useStore()
  const n = graph?.n_edges ?? 0
  return (
    <Panel
      title="Curated causal graph"
      right={
        n > 0 ? (
          graph!.acyclic ? (
            <Badge tone="green">acyclic</Badge>
          ) : (
            <Badge tone="red">cyclic</Badge>
          )
        ) : null
      }
      bodyClass="space-y-2"
    >
      <StatGrid
        rows={[
          ['Selected edges', n],
          ['Variables covered', graph?.n_nodes ?? 0],
          [
            'Topological validity',
            graph?.topological_validity === null || graph?.topological_validity === undefined
              ? '—'
              : `${(graph.topological_validity * 100).toFixed(0)}%`,
          ],
        ]}
      />
      {cycle && (
        <Note tone="err">
          Rejected — that selection closes a cycle: <code>{cycle.join(' → ')}</code>
        </Note>
      )}
      {n === 0 ? (
        <Note>
          Select edges on the canvas or in the ledger. The selected set <em>is</em> the graph the
          next module fits.
        </Note>
      ) : (
        <>
          {graph!.topological_validity !== null && graph!.topological_validity! < 1 && (
            <Note tone="warn">
              Some selected edges violate Assumption 1. That is allowed — a user who has concluded
              the ontology is wrong should not have to fight the tool — but the resulting graph is
              topologically invalid and the export records it as such.
            </Note>
          )}
          <Button className="w-full" variant="primary" onClick={() => setModule('inference')}>
            Take {n} edge{n === 1 ? '' : 's'} to inference
          </Button>
        </>
      )}
    </Panel>
  )
}
