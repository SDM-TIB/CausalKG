import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { api } from '../../api/client'
import { Badge, Button, Field, Icon, Info, Input, Note, Panel, StatGrid, Switch } from '../../app/ui'

/**
 * GES-Prior's metadata block (Plan 3 W15).
 *
 * GES-Prior asks an LLM, per admissible pair, how likely the two variables are to be
 * causally related and in which direction. The answer is only as good as the *description*
 * each variable carries, so this panel is where descriptions come from — three sources,
 * in increasing precedence:
 *
 *   1. the T-Box (rdfs:label / rdfs:comment), free and automatic;
 *   2. an external SPARQL endpoint some columns are mapped onto by QID — a partial
 *      mapping is the normal case, and unmapped columns simply keep their T-Box text;
 *   3. text the user writes, which wins over both.
 *
 * There is deliberately no field for an API key: this service is sign-in free and stores
 * nothing, so a pasted key would be the only secret in the building. The server reads one
 * from its own environment, or the user estimates offline and uploads the JSON.
 */
export function PriorsPanel() {
  const { priors, ctx, savePriorMeta, estimatePriors, importPriors, clearPriors, busy } = useStore()
  const projectId = useStore((s) => s.projectId)
  const [open, setOpen] = useState(false)
  const [useKg, setUseKg] = useState(false)
  const [domain, setDomain] = useState('')
  const [text, setText] = useState<Record<string, string>>({})
  const [qids, setQids] = useState<Record<string, string>>({})
  const [endpoint, setEndpoint] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!priors) return
    setDomain(priors.domain)
    setEndpoint(priors.endpoint)
    setText(Object.fromEntries(priors.variables.map((v) => [v.column, v.user_text])))
    setQids(Object.fromEntries(priors.variables.map((v) => [v.column, v.entity_id])))
  }, [priors])

  if (!ctx) return null

  const overBudget = !!priors && priors.n_pairs > priors.max_pairs
  const nMapped = Object.values(qids).filter((v) => v.trim()).length
  const nWritten = Object.values(text).filter((v) => v.trim()).length

  return (
    <Panel
      title="Causal-node metadata & priors"
      right={
        <div className="flex items-center gap-1.5">
          {priors?.loaded ? (
            <Badge tone="green">{priors.source}</Badge>
          ) : (
            <Badge tone="muted">none</Badge>
          )}
          <Info>
            The LLM is asked about a <em>pair</em> of variables, so its answer is only as good
            as what it is told each variable means. Descriptions come from the T-Box first,
            then optionally from an external endpoint the columns are mapped onto, then from
            whatever you write here — and yours wins (Plan 3 §4.5, W15).
          </Info>
        </div>
      }
      bodyClass="space-y-2.5"
    >
      <StatGrid
        rows={[
          ['Variables', priors?.columns.length ?? 0],
          [
            'Admissible pairs',
            <span className={overBudget ? 'text-red' : undefined}>
              {priors?.n_pairs ?? 0}
              {overBudget ? ` / ${priors!.max_pairs} max` : ''}
            </span>,
          ],
          ['Descriptions written', nWritten],
          ['Mapped to an endpoint', nMapped],
          [
            'Prior entries',
            priors?.loaded ? (
              <span className="text-green">{priors.n_informative}</span>
            ) : (
              '—'
            ),
          ],
        ]}
      />

      {priors && !priors.llm_configured && (
        <Note tone="warn">
          No LLM key is configured on this server, so estimation is unavailable — and this
          service will not take one through the browser, because it is sign-in free and holds
          no user data. Either set one in the server environment, or estimate offline with{' '}
          <code>runners/run_kg_discovery.estimate_and_cache_priors</code> and import the JSON
          below.
        </Note>
      )}
      {priors?.llm_configured && (
        <Note>
          Estimation will make one LLM call per admissible pair ({priors.n_pairs}) using the
          server&apos;s own key (<code>{priors.llm_key_env}</code>).
        </Note>
      )}
      {overBudget && (
        <Note tone="err">
          Over the {priors!.max_pairs}-pair cap for a synchronous request. Exclude variables in
          module 1 or tighten the constraint, then come back.
        </Note>
      )}

      <Button size="sm" variant="ghost" className="w-full" onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron" className={`text-[12px] transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide' : 'Edit'} descriptions &amp; entity mapping
      </Button>

      {open && (
        <div className="space-y-2.5 rounded-lg border border-line bg-surface2 p-2">
          <Field label="Domain — one line of context for every prompt">
            <Input
              value={domain}
              placeholder={priors?.domain_default?.slice(0, 90) ?? 'e.g. oncology outcomes'}
              onChange={(e) => setDomain(e.target.value)}
            />
          </Field>
          <Field
            label="External SPARQL endpoint"
            hint="Where the QIDs below are resolved. Defaults to Wikidata."
          >
            <Input
              value={endpoint}
              placeholder="https://query.wikidata.org/sparql"
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </Field>

          <ul className="max-h-[38vh] space-y-2 overflow-y-auto">
            {priors?.variables.map((v) => (
              <li key={v.column} className="rounded-lg border border-line bg-surface p-2">
                <div className="mb-1 truncate font-mono text-[11px] text-ink" title={v.column}>
                  {v.column}
                </div>
                {v.schema_text && (
                  <p
                    className="mb-1.5 line-clamp-2 text-[10.5px] leading-snug text-faint"
                    title={v.schema_text}
                  >
                    from the T-Box: {v.schema_text}
                  </p>
                )}
                <textarea
                  value={text[v.column] ?? ''}
                  onChange={(e) => setText((t) => ({ ...t, [v.column]: e.target.value }))}
                  rows={2}
                  placeholder="Override with your own description…"
                  className="mb-1 w-full rounded-lg border border-line bg-surface2 px-2 py-1 text-[11.5px] text-ink transition-colors hover:border-faint/60 focus:border-indigo focus:outline-none"
                />
                <Input
                  value={qids[v.column] ?? ''}
                  onChange={(e) => setQids((q) => ({ ...q, [v.column]: e.target.value }))}
                  placeholder="Endpoint entity, e.g. Q131123 (optional)"
                  className="!h-7 !text-[11px]"
                />
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            className="w-full"
            disabled={!!busy}
            onClick={() =>
              savePriorMeta({ domain, endpoint, var_text: text, entity_map: qids })
            }
          >
            Save metadata
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
          Enrich from the endpoint
          <Info>
            For every column mapped to an endpoint entity (QID) above, fetch that entity's 1-hop
            neighbourhood, and for every mapped pair its relational path, from the endpoint —
            then add that to the description the LLM sees, alongside the T-Box text and anything
            you wrote by hand (highest precedence). Off by default because it costs one extra
            query per mapped entity/pair and most T-Box descriptions are already enough.
          </Info>
        </span>
        <Switch
          label="Use the external KG"
          checked={useKg}
          onChange={setUseKg}
        />
      </div>

      <Button
        variant="primary"
        className="w-full"
        disabled={!!busy || !priors?.llm_configured || overBudget}
        onClick={() => estimatePriors(useKg)}
      >
        <Icon name="play" className="text-[12px]" />
        Estimate priors ({priors?.n_pairs ?? 0} pairs)
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importPriors(f)
          e.target.value = ''
        }}
      />
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
          Import JSON
        </Button>
        {priors?.loaded && projectId && (
          <a
            className="flex-1"
            href={api.exportUrl(projectId, 'priors', 'json')}
            download
          >
            <Button size="sm" className="w-full">
              <Icon name="download" className="text-[12px]" />
              Export
            </Button>
          </a>
        )}
      </div>
      {priors?.loaded && (
        <Button size="sm" variant="danger" className="w-full" onClick={clearPriors}>
          Clear priors
        </Button>
      )}
    </Panel>
  )
}
