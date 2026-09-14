import { useMemo, useState } from 'react'
import { useStore } from '../../stores/useStore'
import {
  Badge,
  Button,
  Empty,
  Field,
  Icon,
  Info,
  Note,
  Panel,
  Select,
  StatGrid,
  Switch,
  Tabs,
} from '../../app/ui'
import type { ModelKind } from '../../api/client'
import { fmtNum } from '../../lib/num'

/**
 * The panel that used to be module 3 (W22).
 *
 * Which model you fit is a query-time decision, not a preparation step — you find out
 * you wanted a Bayesian network because you wanted an exact answer, and you find out you
 * wanted an SCM because you wanted a counterfactual. So the choice, the fit, and the
 * selected node's mechanism all live here, next to the board they act on.
 */
// `step` comes from the module rendering this panel, not from here: modules 3
// and 4 both show it, in different positions, so a number written here is
// necessarily wrong in one of them (see `Panel` in app/ui.tsx).
export function CausalModelPanel({ step }: { step?: string }) {
  const { model, graph, dtypes, selectedNode, fitModel, dropModel, busy } = useStore()
  const [kind, setKind] = useState<ModelKind>(model?.kind ?? 'scm')
  const [ordinal, setOrdinal] = useState<string[]>([])
  const [showOrdinal, setShowOrdinal] = useState(false)
  const setModule = useStore((s) => s.setModule)

  const columns = useMemo(
    () => model?.columns ?? graph?.nodes ?? [],
    [model, graph],
  )
  const nEdges = graph?.n_edges ?? 0

  // A CPT over a continuous parent does not exist, so the choice is refused rather than
  // silently discretised. The dtypes come from module 1, before any fit, so the control
  // can be disabled with a reason instead of failing 30 seconds in.
  const continuous = useMemo(() => {
    const source = model
      ? Object.entries(model.dtypes)
      : Object.entries(dtypes).filter(([c]) => !graph || graph.nodes.includes(c))
    return source
      .filter(([, dt]) => dt === 'continuous')
      .map(([c]) => c)
  }, [model, dtypes, graph])
  const cbnBlocked = continuous.length > 0

  if (nEdges === 0 && !model) {
    return (
      <Panel step={step} title="Causal model">
        <Note tone="warn">
          No curated graph yet. The selection in module 2 <em>is</em> the structure fitted
          here, so there is nothing to learn from until at least one edge is selected.
        </Note>
        <Button className="mt-2 w-full" onClick={() => setModule('discovery')}>
          Back to discovery
        </Button>
      </Panel>
    )
  }

  return (
    <Panel
      step={step}
      title="Causal model"
      right={
        model ? (
          <Badge tone={model.kind === 'cbn' ? 'teal' : 'indigo'}>{model.kind.toUpperCase()}</Badge>
        ) : (
          <Info>
            The structure comes from module 2 unchanged — this only learns what happens
            along it. It re-materialises from the original source rather than reusing the
            discovery frame, because it also needs the entity identities every row belongs
            to (Plan 2 §3.3).
          </Info>
        )
      }
      bodyClass="space-y-2.5"
    >
      <Field label="Model">
        <Select
          value={kind}
          disabled={!!busy}
          onChange={(e) => setKind(e.target.value as ModelKind)}
        >
          <option value="scm">Structural causal model</option>
          <option value="cbn" disabled={cbnBlocked}>
            Causal Bayesian network{cbnBlocked ? ' — needs all-discrete data' : ''}
          </option>
        </Select>
      </Field>

      <Note tone={kind === 'cbn' && cbnBlocked ? 'warn' : 'muted'}>
        {kind === 'cbn' ? (
          cbnBlocked ? (
            <>
              <code>{continuous.join(', ')}</code>{' '}
              {continuous.length === 1 ? 'is' : 'are'} continuous, and there is no
              conditional probability table over a continuous parent. Raise{' '}
              <em>max levels</em> in module 1 to read{' '}
              {continuous.length === 1 ? 'it' : 'them'} as labels, or fit a structural
              causal model.
            </>
          ) : (
            <>
              A conditional probability table per node. Every answer is exact variable
              elimination — no sampling, no effective sample size — and the table itself is
              readable below. It has no exogenous noise term, so counterfactuals are
              unavailable: module 4 needs a structural causal model.
            </>
          )
        ) : (
          <>
            A fitted function plus a noise distribution per node. Handles continuous
            variables, and its invertible mechanisms are what module 4 abducts to answer
            &ldquo;what would have happened to <em>this</em> unit&rdquo;. Interventions are
            sampled from the mutilated model rather than solved exactly.
          </>
        )}
      </Note>

      {kind === 'scm' && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted">
              Ordinal columns ({ordinal.length})
            </span>
            <Switch label="Choose ordinal columns" checked={showOrdinal} onChange={setShowOrdinal} />
          </div>
          {showOrdinal && (
            <>
              <Note>
                An ordinal column gets an order-based counterfactual coupling instead of
                Gumbel-max, and its abduction is an exact residual. Mark a column ordinal only
                when its levels really are ordered — <code>Low &lt; Medium &lt; High</code>, not{' '}
                <code>A, B, C</code>.
              </Note>
              <ul className="-mx-1 max-h-48 overflow-y-auto">
                {columns.map((c) => (
                  <li key={c}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface2">
                      <input
                        type="checkbox"
                        checked={ordinal.includes(c)}
                        onChange={() =>
                          setOrdinal((o) => (o.includes(c) ? o.filter((x) => x !== c) : [...o, c]))
                        }
                        className="size-3.5 shrink-0 accent-[var(--ck-indigo)]"
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{c}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Button
        variant="primary"
        className="w-full"
        disabled={!!busy || (kind === 'cbn' && cbnBlocked) || nEdges === 0}
        onClick={() => fitModel({ kind, ordinal: kind === 'scm' ? ordinal : [] })}
      >
        <Icon name="beaker" className="text-[13px]" />
        {/* Two labels, and the thing that decides between them is whether a fitted model
            exists in this session — not which kind is selected. Discarding the model puts
            the button back to "Train". */}
        {model ? 'Retrain Causal Model' : 'Train Causal Model'}{' '}
        ({nEdges} edge{nEdges === 1 ? '' : 's'}
        {model && model.kind !== kind ? `, as ${kind.toUpperCase()}` : ''})
      </Button>

      {model && (
        <>
          <StatGrid
            rows={[
              // W29: `n_rows` is the *live* frame, which an imported model does
              // not have. What it was fitted on is in the manifest and travels
              // with it — reporting 0 there read as "fitted on nothing".
              ['Rows fitted on', model.training_rows ?? model.n_rows],
              ['Nodes', model.columns.length],
              [
                'Exact inference',
                model.all_discrete ? (
                  <span className="text-green">available</span>
                ) : (
                  <span className="text-amber">sampling only</span>
                ),
              ],
              [
                'Counterfactuals',
                model.supports_counterfactual ? (
                  <span className="text-green">available</span>
                ) : (
                  <span className="text-faint">needs an SCM</span>
                ),
              ],
            ]}
          />
          {model.alignment.missing_in_kg.length > 0 && (
            <Note tone="warn">
              Marginalised away because the KG could not supply them:{' '}
              <code>{model.alignment.missing_in_kg.join(', ')}</code>. That is not a neutral
              act — if one was a confounder, the surviving mechanisms are biased.
            </Note>
          )}
          {model.non_invertible.length > 0 && (
            <Note tone="warn">
              <code>{model.non_invertible.join(', ')}</code> cannot be inverted, so this
              unit&apos;s noise cannot be abducted for them — module 4 has nothing to hold fixed.
            </Note>
          )}
          <Button size="sm" variant="danger" className="w-full" onClick={dropModel}>
            Discard the trained model
          </Button>
        </>
      )}

      {model && (
        <div className="border-t border-linesoft pt-2.5">
          <MechanismView node={selectedNode} />
        </div>
      )}
    </Panel>
  )
}

/** The selected node's mechanism, in whichever form the fitted model actually has. */
function MechanismView({ node }: { node: string | null }) {
  const mechanism = useStore((s) => s.mechanism)
  if (!node) {
    return (
      <p className="py-2 text-center text-[11px] text-faint">
        Click a card on the board to see its mechanism.
      </p>
    )
  }
  if (!mechanism || mechanism.node !== node) {
    return <p className="py-2 text-center text-[11px] text-faint">Loading {node}…</p>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-semibold" title={node}>
          {node}
        </span>
        <Badge tone={mechanism.is_root ? 'teal' : 'muted'}>
          {mechanism.is_root ? 'root' : `${mechanism.parents.length} parents`}
        </Badge>
      </div>
      <StatGrid
        rows={[
          ['Type', mechanism.dtype],
          ['Mechanism', <span className="text-[10.5px]">{mechanism.mechanism_type}</span>],
          ['Parents', mechanism.parents.join(', ') || '—'],
          ['Children', mechanism.children.join(', ') || '—'],
          [
            'Invertible',
            mechanism.invertible ? (
              <span className="text-green">yes</span>
            ) : (
              <span className="text-orange">no</span>
            ),
          ],
        ]}
      />
      {mechanism.noise && (
        <Note>{mechanism.noise.description}</Note>
      )}
      {mechanism.cpt && <CptTable cpt={mechanism.cpt} />}
    </div>
  )
}

function CptTable({ cpt }: { cpt: NonNullable<import('../../api/client').MechanismDetail['cpt']> }) {
  return (
    <div className="space-y-1">
      <div className="max-h-56 overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 whitespace-nowrap border-b border-r border-line bg-surface2 px-1.5 py-1 text-left font-medium text-muted">
                {cpt.variable}
              </th>
              {cpt.columns.map((c) => (
                <th
                  key={c}
                  title={c}
                  className="sticky top-0 z-10 max-w-[7rem] truncate whitespace-nowrap border-b border-line bg-surface2 px-1.5 py-1 text-right font-normal text-faint"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cpt.states.map((state, i) => (
              <tr key={state}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-linesoft bg-surface px-1.5 py-[3px] font-mono">
                  {state}
                </td>
                {(cpt.values[i] ?? []).map((v, j) => (
                  <td
                    key={j}
                    className="border-b border-linesoft px-1.5 py-[3px] text-right font-mono tabular-nums"
                    style={{
                      background: `color-mix(in srgb, var(--ck-indigo) ${(v * 34).toFixed(1)}%, transparent)`,
                    }}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cpt.truncated && (
        <p className="text-[10px] text-faint">
          Showing 64 of {cpt.n_columns} parent configurations — the rest are in the export.
        </p>
      )}
    </div>
  )
}

/**
 * Whether the model is any good — four questions that fail independently (W25).
 *
 * A model always produces numbers, so "it ran" is not evidence. A graph can survive
 * every independence test while its mechanisms learn nothing, and mechanisms can predict
 * beautifully through a graph that is causally wrong, so the two are never collapsed
 * into a single score.
 */
export function EvaluationPanel() {
  const { model, evaluation, evaluate, busy } = useStore()
  const [gcm, setGcm] = useState(false)
  const [falsify, setFalsify] = useState(false)
  const [tab, setTab] = useState<'nodes' | 'structure' | 'fit'>('nodes')

  if (!model) return null
  const rows = evaluation?.cv ?? []
  const failing = rows.filter((r) => !r.beats_baseline)

  return (
    <Panel
      title="Evaluation"
      right={
        evaluation ? (
          <Badge tone={evaluation.n_failing ? 'red' : 'green'}>
            {evaluation.summary.nodes_beating_baseline}/{evaluation.summary.nodes_scored} pass
          </Badge>
        ) : null
      }
      bodyClass="space-y-2.5"
      note="Roots are not scored: a node with no parents has no mechanism to cross-validate."
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-medium text-muted"
            title="gcm.falsify.falsify_graph — a permutation test over the graph's own conditional independencies"
          >
            Falsify the graph
          </span>
          <Switch label="Run graph falsification" checked={falsify} onChange={setFalsify} />
        </div>
        {model.kind === 'scm' && (
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-medium text-muted"
              title="gcm.evaluate_causal_model — minutes, not seconds"
            >
              gcm mechanism checks
            </span>
            <Switch label="Run gcm evaluation" checked={gcm} onChange={setGcm} />
          </div>
        )}
      </div>
      <Button
        className="w-full"
        variant="primary"
        disabled={!!busy}
        onClick={() => evaluate({ cv_splits: 5, gcm, falsify })}
      >
        <Icon name="check" className="text-[13px]" />
        {evaluation ? 'Re-evaluate' : 'Evaluate'}
      </Button>

      {!evaluation ? (
        <Note>
          Evaluation runs before inference, not after it. A model inherits every error in the
          graph it was given, so the useful question is not whether it produces numbers — it
          always will — but whether the graph survives its own independence implications and
          whether any node predicts better than its own marginal.
        </Note>
      ) : (
        <>
          {failing.length > 0 && (
            <Note tone="err">
              {failing.map((r) => r.node).join(', ')} cannot beat predicting the training mode
              from its parents. Treat interventional answers about those nodes as noise.
            </Note>
          )}
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'nodes', label: 'Per node' },
              { id: 'structure', label: 'Structure' },
              { id: 'fit', label: 'Whole model' },
            ]}
          />
          {tab === 'nodes' && <NodeScores rows={rows} error={evaluation.cv_error} />}
          {tab === 'structure' && <StructureScores ev={evaluation} />}
          {tab === 'fit' && <WholeModelScores ev={evaluation} />}
        </>
      )}
    </Panel>
  )
}

function NodeScores({
  rows,
  error,
}: {
  rows: import('../../api/client').CvRow[]
  error: string | null
}) {
  if (error) return <Note tone="err">Cross-validation failed: {error}</Note>
  if (rows.length === 0) {
    return (
      <Empty>Every node is a root, so there is no mechanism to cross-validate.</Empty>
    )
  }
  return (
    <ul className="-mx-1 max-h-[36vh] space-y-1 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.node} className="rounded-lg px-1.5 py-1 hover:bg-surface2">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={r.node}>
              {r.node}
            </span>
            <Badge tone={r.beats_baseline ? 'green' : 'red'}>
              {r.beats_baseline ? 'beats' : 'at baseline'}
            </Badge>
          </div>
          {/* Model against baseline on one track: the gap is the whole message. */}
          <div className="relative mt-1 h-2 overflow-hidden rounded-[3px] bg-surface3">
            <span
              className="absolute inset-y-0 left-0 bg-faint/50"
              style={{ width: `${clamp01(r.baseline) * 100}%` }}
            />
            <span
              className="absolute inset-y-0 left-0 rounded-[3px]"
              style={{
                width: `${clamp01(r.model) * 100}%`,
                background: r.beats_baseline ? 'var(--ck-green)' : 'var(--ck-red)',
                opacity: 0.85,
              }}
            />
          </div>
          <div className="mt-[2px] flex gap-2 font-mono text-[9.5px] text-faint">
            <span>{r.metric}</span>
            <span>model {r.model.toFixed(3)}</span>
            <span>baseline {r.baseline.toFixed(3)}</span>
            {r.macro_f1 !== null && <span>F1 {r.macro_f1.toFixed(3)}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function StructureScores({ ev }: { ev: import('../../api/client').Evaluation }) {
  const f = ev.structure.falsification
  return (
    <div className="space-y-2">
      <StatGrid
        rows={[
          ['Nodes', ev.structure.n_nodes],
          ['Edges', ev.structure.n_edges],
          [
            'Acyclic',
            ev.structure.acyclic ? (
              <span className="text-green">yes</span>
            ) : (
              <span className="text-red">no</span>
            ),
          ],
          [
            'Assumption 1',
            ev.structure.topological_validity === null
              ? '—'
              : `${(ev.structure.topological_validity * 100).toFixed(0)}%`,
          ],
        ]}
      />
      {!f ? (
        <Note>
          Turn on <em>Falsify the graph</em> and re-evaluate to test this DAG against its own
          conditional-independence implications. It permutes the graph and asks whether the
          real one violates fewer independencies than a random relabelling does.
        </Note>
      ) : (
        <>
          <Note tone={f.rejected === true ? 'err' : f.rejected === false ? 'ok' : 'warn'}>
            {f.rejected === true
              ? 'The graph is rejected: it does not explain the observed independencies better than a permuted graph would. The mechanisms fitted along it are answering the wrong question.'
              : f.rejected === false
                ? 'Not rejected — the graph survived. That is not the same as correct: surviving a falsification test means no evidence against it was found, not that no alternative fits.'
                : 'Falsification did not complete; the summary below is what it reported.'}
          </Note>
          <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-surface2 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
            {f.summary}
          </pre>
        </>
      )}
    </div>
  )
}

function WholeModelScores({ ev }: { ev: import('../../api/client').Evaluation }) {
  const c = ev.calibration
  return (
    <div className="space-y-2">
      <StatGrid
        rows={[
          [
            'Mean lift over baseline',
            ev.summary.mean_lift === null ? '—' : (
              <span className={ev.summary.mean_lift > 0 ? 'text-green' : 'text-red'}>
                {ev.summary.mean_lift > 0 ? '+' : ''}
                {ev.summary.mean_lift.toFixed(3)}
              </span>
            ),
          ],
          ['Weakest node', ev.summary.worst_node ?? '—'],
          [
            'Counterfactuals',
            ev.abduction.supported ? (
              <span className="text-green">supported</span>
            ) : (
              <span className="text-faint">not for this model kind</span>
            ),
          ],
          ...(ev.abduction.non_invertible.length
            ? ([['Non-invertible', <span className="text-orange">{ev.abduction.non_invertible.length}</span>]] as [string, React.ReactNode][])
            : []),
        ]}
      />
      {c && !c.error && (
        <>
          <StatGrid
            rows={[
              ['Log-likelihood', fmtNum(c.log_likelihood ?? 0)],
              ['Per row', fmtNum(c.per_row_log_likelihood ?? 0)],
              ['Free parameters', c.n_parameters ?? '—'],
              ['BIC', fmtNum(c.bic ?? 0)],
            ]}
          />
          <Note>
            BIC, not log-likelihood alone: a table with more cells than rows to estimate them
            always fits better and always means less, and on a flat join that is the normal
            case. Compare BIC across candidate graphs; the absolute number means nothing.
          </Note>
        </>
      )}
      {c?.error && <Note tone="warn">Model scores unavailable: {c.error}</Note>}
      {ev.gcm_summary && (
        <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-surface2 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
          {ev.gcm_summary}
        </pre>
      )}
      {!c && !ev.gcm_summary && (
        <Note>
          A structural causal model has no closed-form likelihood to report. Turn on{' '}
          <em>gcm mechanism checks</em> for its own calibration report — minutes, not seconds
          — or read the per-node scores, which are the practical version of the same question.
        </Note>
      )}
    </div>
  )
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}
