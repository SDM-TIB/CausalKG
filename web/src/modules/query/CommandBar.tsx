import { Badge, Button, Icon, Info, Spinner } from '../../app/ui'

/**
 * The board's command bar: what is being asked, on the left; what to do about it, on
 * the right.
 *
 * The estimand is the important half. An associational number and a causal one look
 * identical once they are on a card, and the only thing that distinguishes them is the
 * query that produced them — so that query is rendered by the server, from the same
 * evidence it computed with, and is always on screen. It cannot drift from what was
 * actually asked, because nothing in the browser writes it.
 */
export function CommandBar({
  estimand,
  nObserved,
  nIntervened,
  stale,
  busy,
  backend,
  ess,
  lowConfidence,
  elapsed,
  onRelayout,
  onClear,
  onPredict,
  predictLabel = 'Predict',
  predictDisabled,
  predictTitle,
  extra,
}: {
  estimand: string
  nObserved: number
  nIntervened: number
  /** The board has moved since the last Predict, so the cards are showing stale numbers. */
  stale: boolean
  busy: boolean
  backend?: string | null
  ess?: number | null
  lowConfidence?: boolean
  elapsed?: number | null
  onRelayout: () => void
  onClear: () => void
  onPredict: () => void
  predictLabel?: string
  predictDisabled?: boolean
  predictTitle?: string
  extra?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-linesoft px-3 py-2">
      {/* The estimand wraps rather than truncating. Six conditions and three do()s is a
          perfectly ordinary board, and an estimand cut off at `P(V | do(A = x), B…` is
          not a statement of what was asked — it is the one thing on this screen that
          must be readable in full, so it is allowed to take the vertical space it needs
          and to scroll past four lines instead of hiding the rest behind a tooltip. */}
      <div className="flex min-w-[16rem] flex-1 items-start gap-2 rounded-lg border border-indigo/30 bg-indigo/8 px-2.5 py-1.5">
        <span className="mt-[3px] shrink-0 text-[9px] uppercase tracking-wide text-indigo/70">
          estimand
        </span>
        <code
          className="max-h-[5.5rem] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[11.5px] leading-[1.45] text-indigo"
          title={estimand}
        >
          {estimand}
        </code>
        {nObserved > 0 && (
          <Badge tone="green" className="shrink-0">
            {nObserved} obs
          </Badge>
        )}
        {nIntervened > 0 && (
          <Badge tone="orange" className="shrink-0">
            {nIntervened} do()
          </Badge>
        )}
      </div>

      {backend && !stale && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="indigo">{backend}</Badge>
          {ess !== null && ess !== undefined && (
            <Badge tone={lowConfidence ? 'red' : 'green'}>ESS {ess.toFixed(0)}</Badge>
          )}
          {elapsed ? <Badge tone="muted">{elapsed}s</Badge> : null}
        </div>
      )}
      {stale && (
        <Badge tone="amber" className="shrink-0">
          board moved — predict again
        </Badge>
      )}

      {extra}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Info>
          Every card shows the whole distribution, not just its mode: <code>Long</code> alone
          cannot tell p = 0.98 from p = 0.51, and those are different answers. Before the
          first prediction the cards show the observational marginal; afterwards the prior
          stays drawn behind the posterior, so a bar that did not move is visibly a bar that
          did not move.
        </Info>
        <Button size="sm" variant="ghost" onClick={onRelayout} title="Re-seed the arrangement by causal depth">
          <Icon name="layers" className="text-[12px]" />
          Re-layout
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={nObserved + nIntervened === 0}
          title="Release every observation and intervention"
        >
          <Icon name="x" className="text-[12px]" />
          Clear
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={onPredict}
          disabled={busy || predictDisabled}
          title={predictTitle}
        >
          {busy ? <Spinner className="text-[12px]" /> : <Icon name="play" className="text-[12px]" />}
          {predictLabel}
        </Button>
      </div>
    </div>
  )
}
