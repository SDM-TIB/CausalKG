import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { AppShell } from '../../app/AppShell'
import { Button, Empty, Icon, Note, Panel } from '../../app/ui'
import { BoardLegend, QueryBoard, defaultValue, useBoardMenu } from '../query/QueryBoard'
import { BoardContextMenu } from '../query/BoardContextMenu'
import { CommandBar } from '../query/CommandBar'
import { CausalModelPanel, EvaluationPanel } from '../query/CausalModelPanel'
import { AnswerLogPanel } from '../query/AnswerPanel'
import { fmtValue, shortName } from '../../lib/num'

/**
 * Module 3 (Plan 3 §6): one board, every node an answer.
 *
 * The old board asked about a single target and printed one number in a side panel.
 * That is not how a causal graph is read: setting `smokerType = NonSmoker` also moves
 * biomarker and tumourStage and survival, and reading survival alone throws that away.
 * So a prediction updates *every* card at once, off one shared sample set — which is
 * also why the numbers on different cards cannot contradict each other.
 *
 * Observing and intervening look almost the same and mean entirely different things, so
 * the board makes the difference visible rather than textual: an intervened node turns
 * orange and its incoming edges go dashed, because that is exactly what do() did to the
 * graph.
 */
export function InferenceModule() {
  const {
    model, marginals, prediction, assignments, busy,
    ensureContext, loadModel, assign, release, clearBoard, predict, setModule,
  } = useStore()
  const { menu, open, close } = useBoardMenu()
  const [relayout, setRelayout] = useState(0)

  useEffect(() => {
    ensureContext()
    loadModel()
  }, [ensureContext, loadModel])

  const nObserved = useMemo(
    () => Object.values(assignments).filter((a) => a.mode === 'observed').length,
    [assignments],
  )
  const nIntervened = useMemo(
    () => Object.values(assignments).filter((a) => a.mode === 'intervened').length,
    [assignments],
  )

  /** The estimand the *server* rendered, or the one this board is about to ask for. */
  const estimand = useMemo(() => {
    if (Object.keys(assignments).length === 0) return 'P(V) — observational marginals'
    const given = [
      ...Object.entries(assignments)
        .filter(([, a]) => a.mode === 'intervened')
        .map(([k, a]) => `do(${k} = ${fmtValue(a.value)})`),
      ...Object.entries(assignments)
        .filter(([, a]) => a.mode === 'observed')
        .map(([k, a]) => `${k} = ${fmtValue(a.value)}`),
    ]
    return `P(V | ${given.join(', ')})`
  }, [assignments])

  // The cards are stale the moment the board changes: showing yesterday's posterior
  // under today's estimand is the one way this screen could actively mislead.
  //
  // Compare the *assignments*, not the two rendered estimands. Those strings agree only
  // by luck: the board rounds for display (`fmtValue` → `29.0`) while the server prints
  // the value it was actually handed (`28.9822`), so one click on a density curve left
  // the badge saying "board moved — predict again" over an answer that was current, and
  // no amount of predicting cleared it. A warning that never goes away is a warning
  // nobody reads. Module 4 has compared assignments all along; this matches it.
  const stale = useMemo(() => {
    if (!prediction) return Object.keys(assignments).length > 0
    const matches = (answered: Record<string, unknown>, mode: string) => {
      const pinned = Object.entries(assignments).filter(([, a]) => a.mode === mode)
      return (
        pinned.length === Object.keys(answered).length &&
        pinned.every(([k, a]) => String(answered[k]) === String(a.value))
      )
    }
    return !(
      matches(prediction.evidence, 'observed') &&
      matches(prediction.interventions, 'intervened')
    )
  }, [prediction, assignments])

  /** Clicking a chart pins a value, keeping whatever role the node already had. */
  const onPick = useCallback(
    (node: string, value: string | number) => {
      const mode = useStore.getState().assignments[node]?.mode ?? 'observed'
      assign(node, mode, value)
    },
    [assign],
  )

  if (!model) {
    return (
      <AppShell
        left={<CausalModelPanel step="3·1" />}
        centre={
          <Panel className="flex-1" step="3·2" title="Inference board">
            <Empty icon="branch">
              No fitted model in this session. Choose a model on the left and fit it — the
              structure from module 2 says what depends on what, but only a fitted model can
              say by how much.
            </Empty>
            <div className="mt-3 flex justify-center">
              <Button onClick={() => setModule('discovery')}>Back to discovery</Button>
            </div>
          </Panel>
        }
      />
    )
  }

  const menuNode = menu?.node
  const current = menuNode ? assignments[menuNode] : undefined
  const dist = menuNode
    ? prediction?.nodes[menuNode] ?? marginals?.nodes[menuNode] ?? null
    : null

  return (
    <>
      <AppShell
        left={
          <>
            <CausalModelPanel step="3·1" />
            <AssignmentsPanel />
          </>
        }
        centre={
          <Panel step="3·2" title="Inference board" flush grow resizeId="inference-board">
            <CommandBar
              // While the answer is current the server's own rendering wins — it names the
              // values the sampler actually conditioned on. The local one is for a board
              // that has moved past its answer, and is marked stale when it shows.
              estimand={!stale && prediction ? prediction.estimand : estimand}
              nObserved={nObserved}
              nIntervened={nIntervened}
              stale={stale}
              busy={!!busy}
              backend={prediction?.backend}
              ess={prediction?.ess}
              lowConfidence={prediction?.low_confidence}
              elapsed={prediction?.elapsed}
              onRelayout={() => setRelayout((n) => n + 1)}
              onClear={clearBoard}
              onPredict={predict}
              predictTitle="Recompute every node's distribution under the current observations and interventions"
            />
            {/* Relative + absolute: React Flow is `height: 100%`, which does not resolve
                against a `flex: 1 1 0%` parent (see OntologyCanvas). */}
            <div className="relative min-h-0 w-full flex-1">
              <div className="absolute inset-0">
                <QueryBoard
                  canvas="inference"
                  posteriors={prediction?.nodes ?? null}
                  priors={marginals?.nodes ?? null}
                  assignments={assignments}
                  onPick={onPick}
                  onClear={release}
                  onMenu={open}
                  relayoutToken={relayout}
                />
              </div>
            </div>
            <BoardLegend mode="inference" />
          </Panel>
        }
        right={
          // No "How this was answered" panel: the command bar already carries the
          // backend, the effective sample size and the elapsed time as badges beside
          // the estimand they belong to, and a second copy of the same three facts in
          // the rail was the only thing it added.
          <>
            <EvaluationPanel />
            <AnswerLogPanel kinds={['conditional', 'interventional']} />
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
              label: current?.mode === 'observed' ? 'Change the observed value' : 'Observe',
              hint: 'Conditioning: what the world looks like among units that happen to have this value.',
              tone: 'green',
              onSelect: () =>
                assign(menuNode, 'observed', current?.value ?? defaultValue(model, menuNode, dist)),
            },
            {
              label: current?.mode === 'intervened' ? 'Change the do() value' : 'Intervene — do()',
              hint: 'Replaces this node’s mechanism and severs its incoming edges.',
              tone: 'orange',
              onSelect: () =>
                assign(menuNode, 'intervened', current?.value ?? defaultValue(model, menuNode, dist)),
            },
            {
              label: 'Release',
              tone: 'red',
              disabled: !current,
              onSelect: () => release(menuNode),
            },
          ]}
        />
      )}
    </>
  )
}

/** The pinned nodes, listed — a card can be off-screen, and a query cannot be. */
function AssignmentsPanel() {
  const { assignments, model, marginals, prediction, assign, release, clearBoard } = useStore()
  const entries = Object.entries(assignments)
  if (entries.length === 0 || !model) return null

  const intervened = entries.filter(([, a]) => a.mode === 'intervened')
  const observed = entries.filter(([, a]) => a.mode === 'observed')

  return (
    <Panel
      title="Pinned"
      right={
        <Button size="sm" variant="ghost" onClick={clearBoard}>
          Clear
        </Button>
      }
      bodyClass="space-y-2"
    >
      {intervened.length === 0 && (
        <Note>
          Everything here is observed. Right-click a card and choose <em>Intervene</em> to
          ask what happens if you <em>set</em> a value instead — a different number, and
          usually a different answer.
        </Note>
      )}
      {[...intervened, ...observed].map(([node, a]) => {
        const orange = a.mode === 'intervened'
        const levels = model.levels[node]
        const dist = prediction?.nodes[node] ?? marginals?.nodes[node]
        return (
          <div
            key={node}
            className={`rounded-lg border p-2 ${
              orange ? 'border-orange/40 bg-orange/8' : 'border-green/40 bg-green/8'
            }`}
          >
            <div className="mb-1 flex items-baseline gap-1.5">
              <span
                className={`font-mono text-[9.5px] font-semibold ${orange ? 'text-orange' : 'text-green'}`}
              >
                {orange ? 'do' : '='}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={node}>
                {shortName(node)}
              </span>
              <button
                onClick={() => release(node)}
                aria-label={`Release ${node}`}
                className="text-faint hover:text-red"
              >
                <Icon name="x" className="text-[12px]" />
              </button>
            </div>
            {levels?.length ? (
              <select
                value={String(a.value)}
                onChange={(e) => assign(node, a.mode, e.target.value)}
                className="h-7 w-full rounded-lg border border-line bg-surface2 px-1.5 text-[11.5px] text-ink focus:border-indigo focus:outline-none"
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
                value={String(a.value)}
                placeholder={
                  dist?.min !== undefined ? `${dist.min} – ${dist.max}` : undefined
                }
                onChange={(e) => assign(node, a.mode, Number(e.target.value))}
                className="h-7 w-full rounded-lg border border-line bg-surface2 px-1.5 text-[11.5px] text-ink focus:border-indigo focus:outline-none"
              />
            )}
          </div>
        )
      })}
    </Panel>
  )
}

export { shortName }
