import { useEffect, useMemo } from 'react'
import { useStore } from '../../stores/useStore'
import { Badge, Button, Empty, Note, Panel, Select } from '../../app/ui'
import type { ModelInfo } from '../../api/client'
import { fmtValue, shortIri, shortName } from '../../lib/num'

/**
 * Choosing the unit a counterfactual is about (W24).
 *
 * "Pick one of 4000 IRIs from a dropdown" is not a usable way to choose a unit, and it
 * is not how anyone thinks about one either: you want *a patient like this*, not
 * `patient_1731`. So the pool is narrowed by constraining the variables — gender =
 * Female, stage = II — with the number of units still matching reported as you go, and
 * the IRI picked only once the pool means something.
 *
 * Once chosen, the unit's actual values sit beside the filters in green. A counterfactual
 * with nothing to be counter to is not an answer, so the factual state is never more
 * than a glance away.
 */
export function UnitPanel({ step }: { step?: string }) {
  const {
    model, units, unitFilters, bands, entity, factual, factualRows, busy,
    observed, capabilities,
    setUnitFilter, clearUnitFilters, searchUnits, chooseEntity, setObserved, setObservedValue,
  } = useStore()

  // W28. A model imported without its knowledge graph has no entities to offer,
  // so the panel opens on "describe one" rather than on an empty dropdown with
  // no explanation.
  const canPickFromKg = capabilities?.entities.available ?? true
  const hypothetical = observed !== null

  useEffect(() => {
    if (model && !units && canPickFromKg) searchUnits()
  }, [model, units, searchUnits, canPickFromKg])

  useEffect(() => {
    if (model && !canPickFromKg && observed === null) setObserved(defaultUnit(model))
  }, [model, canPickFromKg, observed, setObserved])

  // The class whose entities a counterfactual is usually about is the one with the most
  // of them — the join's subject, not one of its dimensions.
  const primary = useMemo(() => {
    if (!units?.classes.length) return null
    return [...units.classes].sort((a, b) => b.n_total - a.n_total)[0]
  }, [units])

  const all = useMemo(
    () => units?.classes.flatMap((c) => c.entities.map((e) => ({ cls: c.var, iri: e }))) ?? [],
    [units],
  )

  if (!model) return null
  const nFilters = Object.keys(unitFilters).length

  return (
    <Panel
      step={step}
      title="The unit"
      right={
        hypothetical ? (
          // Never green: green means observed, and a unit nobody observed must
          // not borrow the colour that says otherwise.
          <Badge tone="amber">hypothetical</Badge>
        ) : entity ? (
          <Badge tone="green">{shortIri(entity)}</Badge>
        ) : (
          <Badge tone="muted">none</Badge>
        )
      }
      bodyClass="space-y-2.5"
    >
      <div className="flex gap-1">
        <Button
          size="sm"
          className="flex-1"
          variant="ghost"
          active={!hypothetical}
          disabled={!!busy || !canPickFromKg}
          title={canPickFromKg ? undefined : capabilities?.entities.reason ?? undefined}
          onClick={() => setObserved(null)}
        >
          From the graph
        </Button>
        <Button
          size="sm"
          className="flex-1"
          variant="ghost"
          active={hypothetical}
          disabled={!!busy}
          onClick={() => setObserved(observed ?? defaultUnit(model))}
          title="Describe a unit that is not in the knowledge graph. Every variable must be given a value — abduction reads the whole observed state."
        >
          Describe one
        </Button>
      </div>

      {!canPickFromKg && (
        <Note tone="warn">{capabilities?.entities.reason}</Note>
      )}

      {!hypothetical && (
        <Select
          value={entity ?? ''}
          disabled={!!busy}
          onChange={(e) => chooseEntity(e.target.value || null)}
        >
          <option value="">choose a unit…</option>
          {all.slice(0, 400).map((e) => (
            <option key={e.iri} value={e.iri}>
              {e.cls} · {shortIri(e.iri)}
            </option>
          ))}
        </Select>
      )}

      {hypothetical && (
        <Note>
          This unit is not in the knowledge graph. Its counterfactual is exported without
          an <code>aboutEntity</code> link, so it can never be merged back into the source
          as a claim about someone real.
        </Note>
      )}

      {/* The pool count is about picking from the KG; a described unit has no
          pool, and "0 units match" beside a form the user is filling in reads
          as a failure rather than as an irrelevance. */}
      {!hypothetical && (
      <p className="text-[11.5px] text-muted">
        {units === null ? (
          'Loading units…'
        ) : (
          <>
            <span className="font-medium text-ink">
              {primary?.truncated ? `${primary.entities.length}+` : primary?.n_matching ?? 0}
            </span>{' '}
            {primary?.var ?? 'unit'}
            {(primary?.n_matching ?? 0) === 1 ? '' : 's'} match the constraints below
            {nFilters === 0 ? ' (all of them — none set yet).' : '.'}
          </>
        )}
      </p>
      )}
      {!hypothetical && units && units.n_matching_rows === 0 && (
        <Note tone="warn">
          No rows satisfy every constraint at once. Relax one — this is a conjunction over
          the flat join, not a search over each variable separately.
        </Note>
      )}

      {/* Filters on the left, the chosen unit's own values on the right, on one row per
          variable — so "what I asked for" and "what I got" are read together. */}
      <div className="space-y-1">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2 px-[2px] text-[9.5px] uppercase tracking-wide text-faint">
          <span>{hypothetical ? 'observed value' : 'constrain'}</span>
          <span className="text-right">factual</span>
        </div>
        {model.columns.map((col) => {
          const levels = model.levels[col]
          const colBands = bands[col]
          return (
            <div key={col} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2">
              <label className="flex min-w-0 items-center gap-1.5">
                <span
                  className="w-[5.2rem] shrink-0 truncate text-[10.5px] text-muted"
                  title={col}
                >
                  {shortName(col)}
                </span>
                {hypothetical ? (
                  // Not a filter any more: with no pool to narrow, the same row
                  // becomes the value itself. Categorical columns offer only the
                  // levels the model was fitted on — a level it has never seen
                  // has no mechanism to evaluate.
                  levels?.length ? (
                    <select
                      value={String(observed?.[col] ?? '')}
                      disabled={!!busy}
                      onChange={(e) => setObservedValue(col, e.target.value)}
                      className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-1.5 text-[10.5px] text-ink focus:border-indigo focus:outline-none"
                    >
                      {levels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={String(observed?.[col] ?? '')}
                      disabled={!!busy}
                      onChange={(e) => setObservedValue(col, Number(e.target.value))}
                      title={
                        model.ranges?.[col]
                          ? `Fitted on ${fmtValue(model.ranges[col].min)} – ${fmtValue(
                              model.ranges[col].max,
                            )}`
                          : undefined
                      }
                      className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-1.5 text-[10.5px] text-ink focus:border-indigo focus:outline-none"
                    />
                  )
                ) : (
                  <select
                    value={unitFilters[col] ?? ''}
                    disabled={!!busy}
                    onChange={(e) => setUnitFilter(col, e.target.value)}
                    className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-1.5 text-[10.5px] text-ink focus:border-indigo focus:outline-none"
                  >
                    <option value="">any</option>
                    {levels?.length
                      ? levels.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))
                      : colBands?.map((b) => (
                          <option key={b.index} value={`${b.lo}|${b.hi}`}>
                            {b.label}
                          </option>
                        ))}
                  </select>
                )}
              </label>
              <span
                className={`truncate text-right font-mono text-[10.5px] ${
                  hypothetical ? 'text-amber' : 'text-green'
                }`}
                title={factual?.[col] === undefined ? undefined : String(factual[col])}
              >
                {entity || hypothetical ? fmtValue(factual?.[col] ?? null) : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* A class the join fans out over — one hospital, four hundred therapies — occupies
          many rows, and its "factual" value is the mode or mean across all of them. That
          can disagree with a constraint you just set, because the constraint selected
          *rows* and this is an aggregate over the unit's whole row set. Said plainly
          rather than left to be discovered. */}
      {!hypothetical && entity && factualRows > 1 && (
        <Note tone="warn">
          This unit occupies {factualRows} rows of the flat join, so each factual value
          above is an aggregate over all of them — the mode for a categorical, the mean
          for a number. It can differ from a constraint you set, because the constraint
          matched rows and this summarises the unit.
        </Note>
      )}

      {hypothetical && nFilters === 0 && null}
      {!hypothetical && nFilters > 0 && (
        <Button size="sm" variant="ghost" className="w-full" onClick={clearUnitFilters}>
          Clear {nFilters} constraint{nFilters === 1 ? '' : 's'}
        </Button>
      )}

      {!entity && !hypothetical && (
        <Empty>
          Pick the unit the question is about, or describe one that is not in the graph. Its
          factual values appear on every card as a baseline — those are what the
          counterfactual is counter to.
        </Empty>
      )}
    </Panel>
  )
}


/**
 * W28 — a starting value for every variable.
 *
 * The form has to open *complete*, because the server requires every modelled
 * variable to be given a value: abduction reads the whole observed state, and a
 * node left unset would be invented rather than assumed. So the defaults are
 * the model's own first level and mean — visibly arbitrary placeholders the
 * user overwrites, not a claim about a typical unit.
 */
function defaultUnit(model: ModelInfo): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const col of model.columns) {
    const levels = model.levels[col]
    out[col] = levels?.length ? levels[0] : (model.ranges?.[col]?.mean ?? 0)
  }
  return out
}
