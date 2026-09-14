import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { AppShell } from '../../app/AppShell'
import { Badge, Button, Empty, Note, Panel } from '../../app/ui'
import { BoardLegend, QueryBoard, defaultValue, useBoardMenu } from '../query/QueryBoard'
import { BoardContextMenu } from '../query/BoardContextMenu'
import { CommandBar } from '../query/CommandBar'
import { AnswerLogPanel } from '../query/AnswerPanel'
import { UnitPanel } from './UnitPanel'
import { CausalModelPanel } from '../query/CausalModelPanel'
import { fmtValue, shortIri } from '../../lib/num'

/**
 * Module 4 (Plan 3 §7): entity-level counterfactuals.
 *
 * The difference from module 3 is the *unit*. An intervention asks what happens to the
 * population if you act; a counterfactual asks what would have happened to this patient,
 * given everything that actually did happen to them. That is why the unit picker is the
 * first control and not an afterthought: without a unit there is no noise to abduct, and
 * without abducted noise the answer is just an intervention wearing the wrong name.
 *
 * The board is the same board. Only two things are added: every card carries the unit's
 * factual value as a permanent baseline, and a hypothetical do() gets a dashed pill above
 * the card, so the imagined world is visibly *not* part of the unit's record.
 */
export function CounterfactualModule() {
  const {
    model, marginals, cfPrediction, hypotheticals, entity, observed, factual, busy,
    ensureContext, loadModel, setHypothetical, releaseHypothetical, clearHypotheticals,
    predictCounterfactual, setModule,
  } = useStore()
  const { menu, open, close } = useBoardMenu()
  const [relayout, setRelayout] = useState(0)

  useEffect(() => {
    ensureContext()
    loadModel()
  }, [ensureContext, loadModel])

  const onPick = useCallback(
    (node: string, value: string | number) => {
      // Everything on this board is a do(): "observing" a variable for a unit whose
      // actual values are already known would be a contradiction, not a query.
      setHypothetical(node, value)
    },
    [setHypothetical],
  )

  if (!model) {
    return (
      <AppShell
        centre={
          <Panel className="flex-1" step="4·3" title="Counterfactual board">
            <Empty icon="branch">
              No fitted model in this session. A counterfactual needs invertible mechanisms
              to abduct this unit&apos;s noise from — fit a structural causal model in the
              inference module first.
            </Empty>
            <div className="mt-3 flex justify-center">
              <Button variant="primary" onClick={() => setModule('inference')}>
                Go to inference
              </Button>
            </div>
          </Panel>
        }
      />
    )
  }

  if (!model.supports_counterfactual) {
    return (
      <AppShell
        centre={
          <Panel className="flex-1" step="4·3" title="Counterfactual board">
            <Empty icon="branch">
              This project is fitted as a <strong>causal Bayesian network</strong>. A
              conditional probability table has no exogenous noise term, so there is nothing
              to abduct and no counterfactual to compute — only interventions, which module 3
              already answers exactly. Refit as a structural causal model to ask this
              question.
            </Empty>
            <div className="mt-3 flex justify-center">
              <Button variant="primary" onClick={() => setModule('inference')}>
                Refit as an SCM
              </Button>
            </div>
          </Panel>
        }
      />
    )
  }

  const menuNode = menu?.node
  const current = menuNode ? hypotheticals[menuNode] : undefined
  const dist = menuNode
    ? cfPrediction?.nodes[menuNode] ?? marginals?.nodes[menuNode] ?? null
    : null
  const nHyp = Object.keys(hypotheticals).length

  // W28: the unit is either a KG entity or a described one. The estimand names
  // which, rather than papering over the difference — "a hypothetical unit" is
  // not an IRI and must not be displayed as though it were.
  const hasUnit = !!entity || observed !== null
  const unitLabel = entity ? shortIri(entity) : 'a hypothetical unit'
  const estimand = hasUnit
    ? nHyp === 0
      ? `P(V | ${unitLabel}) — this unit's factual state`
      : `P(V_{${Object.entries(hypotheticals)
          .map(([k, a]) => `${k}=${fmtValue(a.value)}`)
          .join(', ')}} | ${unitLabel})`
    : 'P(V) — choose a unit'

  // A hypothetical unit has no IRI to compare, so its answer is stale when the
  // *values* moved. Comparing `entity` alone (null === null) would have called
  // every edit of a described unit fresh.
  const unitChanged = observed
    ? !cfPrediction?.hypothetical ||
      JSON.stringify(cfPrediction.factual) !== JSON.stringify(observed)
    : cfPrediction?.entity !== entity
  const stale = !cfPrediction || unitChanged ||
    JSON.stringify(Object.keys(cfPrediction.interventions).sort()) !==
      JSON.stringify(Object.keys(hypotheticals).sort()) ||
    Object.entries(hypotheticals).some(
      ([k, a]) => String(cfPrediction.interventions[k]) !== String(a.value),
    )

  // The unit's own values, preferred from the answer (which reports them alongside the
  // counterfactual) and otherwise from the unit lookup, so the baseline is on the cards
  // before the first prediction rather than after it.
  const baseline = !unitChanged && cfPrediction ? cfPrediction.factual : factual

  return (
    <>
      <AppShell
        left={
          // The model panel is here as well as in module 3, and not only for
          // symmetry: a project imported from a bundle lands here with a fitted
          // model and no source KG, so module 4 may be the *first* module its
          // user sees. Which model is answering has to be visible from the board
          // that is answering, not one module away.
          <>
            <CausalModelPanel step="4·1" />
            <UnitPanel step="4·2" />
          </>
        }
        centre={
          <Panel step="4·3" title="Counterfactual board" flush grow resizeId="counterfactual-board">
            <CommandBar
              estimand={estimand}
              nObserved={0}
              nIntervened={nHyp}
              stale={hasUnit && nHyp > 0 && stale}
              busy={!!busy}
              backend={cfPrediction?.backend}
              elapsed={cfPrediction?.elapsed}
              // The coupling travels with the backend badge rather than in a panel of
              // its own: a categorical counterfactual is not identified by the
              // observational distribution, so *which* coupling answered is part of the
              // answer and cannot be dropped — but it is one word, not a paragraph.
              extra={
                cfPrediction?.coupling && cfPrediction.entity === entity && !stale ? (
                  <Badge
                    tone="orange"
                    className="shrink-0"
                    title={
                      'A categorical counterfactual is not identified by the observational ' +
                      'distribution — several couplings fit the same data and disagree here. ' +
                      'Gumbel-max fixes one, and the export records that choice.'
                    }
                  >
                    {cfPrediction.coupling}
                  </Badge>
                ) : null
              }
              onRelayout={() => setRelayout((n) => n + 1)}
              onClear={clearHypotheticals}
              onPredict={predictCounterfactual}
              predictLabel="Predict"
              predictDisabled={!hasUnit || nHyp === 0}
              predictTitle={
                !hasUnit
                  ? 'Choose a unit first — a counterfactual is about someone'
                  : nHyp === 0
                    ? 'Right-click a card to set what would have been different'
                    : 'Abduct this unit’s noise, then evaluate every node under the hypothetical'
              }
            />
            {/* Relative + absolute: React Flow is `height: 100%`, which does not resolve
                against a `flex: 1 1 0%` parent (see OntologyCanvas). */}
            <div className="relative min-h-0 w-full flex-1">
              <div className="absolute inset-0">
                <QueryBoard
                  canvas="counterfactual"
                  posteriors={!unitChanged && cfPrediction ? cfPrediction.nodes : null}
                  priors={marginals?.nodes ?? null}
                  assignments={{}}
                  hypotheticals={hypotheticals}
                  factual={baseline}
                  // The population marginal is not this unit's reference — its factual
                  // state is, and that is already on every card as the green ◆. Ghosting
                  // the marginal behind a counterfactual put a grey bar on levels the
                  // answer gives no weight to, which reads as probability that is not
                  // there. See `DistCard.showPrior`.
                  showPrior={false}
                  onPick={onPick}
                  onClear={releaseHypothetical}
                  onMenu={open}
                  relayoutToken={relayout}
                />
              </div>
            </div>
            <BoardLegend mode="counterfactual" />
          </Panel>
        }
        right={
          <>
            {model.non_invertible.length > 0 && (
              <Panel title="Abduction">
                <Note tone="warn">
                  <code>{model.non_invertible.join(', ')}</code> cannot be inverted, so there
                  is no noise to hold fixed for them. A counterfactual through those nodes
                  degenerates into an intervention.
                </Note>
              </Panel>
            )}
            {/* No "How this was answered" panel — module 3 dropped its own for the same
                reason (decision 20). The command bar already carries the backend, the
                coupling and the elapsed time beside the estimand they belong to. */}
            <AnswerLogPanel kinds={['counterfactual']} />
          </>
        }
      />
      {menu && menuNode && (
        <BoardContextMenu
          x={menu.x}
          y={menu.y}
          title={menuNode}
          onClose={close}
          items={[
            {
              label: current ? 'Change the hypothetical' : 'Hypothetical intervention',
              hint: `What if this unit had had a different ${menuNode.split('.').pop()}?`,
              tone: 'orange',
              onSelect: () =>
                setHypothetical(
                  menuNode,
                  current?.value ?? baseline?.[menuNode] ?? defaultValue(model, menuNode, dist),
                ),
            },
            {
              label: 'Release',
              tone: 'red',
              disabled: !current,
              onSelect: () => releaseHypothetical(menuNode),
            },
          ]}
        />
      )}
    </>
  )
}
