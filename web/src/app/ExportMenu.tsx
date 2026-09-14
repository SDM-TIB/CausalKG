import { useEffect, useRef, useState } from 'react'
import { api, type ExportArtifact, type ExportManifest } from '../api/client'
import { useStore } from '../stores/useStore'
import { Button, Icon } from './ui'

/**
 * Every intermediate artifact, downloadable (Plan 3 W14). The service keeps no
 * persistent user data, so this is the recovery path rather than a convenience —
 * which is why it lives in the top bar and not buried inside one module.
 *
 * The items are grouped by the module that produces them, in the order the
 * modules run: a flat list gave no hint which stage of the pipeline an item
 * came from. The grouping is served, not hardcoded here, so adding an artifact
 * on the server side is enough.
 */
export function ExportMenu() {
  const projectId = useStore((s) => s.projectId)
  // Re-fetch the manifest whenever the pipeline moves, so availability is live.
  const stamp = useStore(
    (s) => `${s.schema ? 1 : 0}${s.mat ? 1 : 0}${s.runs.length}${s.graph?.n_edges ?? 0}`,
  )
  const [open, setOpen] = useState(false)
  const [manifest, setManifest] = useState<ExportManifest | null>(null)
  // Per-artifact id selection, for the artifacts that are a *set* (the
  // discovery runs). Empty means "all of them", which is also what the server
  // does with no ids — so the menu needs no "select all" affordance.
  const [picked, setPicked] = useState<Record<string, number[]>>({})
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !projectId) return
    api
      .exportManifest(projectId)
      .then(setManifest)
      .catch(() => setManifest(null))
  }, [open, projectId, stamp])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!projectId) return null

  /**
   * An empty selection means "all of them" — that is what the server does with
   * no ids, and it is what the chips render as. So a toggle has to start from
   * the *full* set, not from the empty one: clicking a chip that looks on must
   * turn that one off, not turn every other one off. Turning the last one off
   * wraps back to all, since "export nothing" is not a thing to want.
   */
  const toggle = (it: ExportArtifact, id: number) =>
    setPicked((prev) => {
      const all = (it.select ?? []).map((o) => o.id)
      const current = prev[it.what]?.length ? prev[it.what] : all
      const next = current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
      return { ...prev, [it.what]: next.length ? next : all }
    })

  const hrefFor = (it: ExportArtifact, format: string) => {
    if (!it.available) return undefined
    const ids = picked[it.what] ?? []
    return api.exportUrl(
      projectId,
      it.what,
      format,
      it.select_param ? { param: it.select_param, ids } : undefined,
    )
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" active={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="download" className="text-[14px]" />
        Export
      </Button>
      {open && (
        <div className="ck-enter absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--ck-shadow)]">
          <p className="border-b border-linesoft px-3 py-2 text-[11px] leading-relaxed text-faint">
            This service is sign-in free and stores nothing about you. Your session lives in server
            memory only — <strong className="text-muted">an export is the only durable copy.</strong>
          </p>
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {(manifest?.groups ?? []).map((group) => (
              <section key={group.id}>
                <h3 className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
                  {group.label}
                </h3>
                <ul>
                  {group.items.map((it) => {
                    const ids = picked[it.what] ?? []
                    return (
                      <li key={it.what} className="rounded-lg px-2 py-1.5 hover:bg-surface2">
                        <div
                          className={`flex items-center gap-2 ${it.available ? '' : 'opacity-45'}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-ink">{it.label}</span>
                            {!it.available && (
                              <span className="block truncate text-[10.5px] text-faint">
                                {it.reason}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {it.formats.map((f) => (
                              <a
                                key={f}
                                href={hrefFor(it, f)}
                                download
                                onClick={(e) => !it.available && e.preventDefault()}
                                className={`rounded-md border border-line px-1.5 py-[2px] font-mono text-[10px] uppercase transition-colors ${
                                  it.available
                                    ? 'text-muted hover:border-indigo/50 hover:bg-indigo/10 hover:text-indigo'
                                    : 'cursor-not-allowed text-faint'
                                }`}
                              >
                                {f === 'turtle' ? 'ttl' : f}
                              </a>
                            ))}
                          </span>
                        </div>
                        {it.available && it.select && it.select.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {it.select.map((option) => {
                              const on = ids.length === 0 || ids.includes(option.id)
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => toggle(it, option.id)}
                                  className={`rounded-md border px-1.5 py-[2px] text-[10px] transition-colors ${
                                    on
                                      ? 'border-indigo/50 bg-indigo/10 text-indigo'
                                      : 'border-line text-faint hover:text-muted'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
