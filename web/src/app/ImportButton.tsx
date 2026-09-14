import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { useStore } from '../stores/useStore'
import { Button, Icon } from './ui'

/**
 * W29 — the other half of the export menu.
 *
 * It sits in the top bar beside Export for the same reason Export is there: the
 * service persists nothing, so the archive is the session's only durable form,
 * and putting it back has to be as reachable as taking it out.
 *
 * Two refusals are worth surfacing rather than swallowing, and they are
 * deliberately different shapes:
 *
 *   * a **library-version mismatch** is a warning the user can reasonably
 *     override — they may know the pickle is fine — so it offers "import
 *     anyway", which re-sends with `strict=false`.
 *   * a **wrong source knowledge graph** on re-attach is not offered a one-click
 *     override in the same place. Attaching the wrong KG leaves the mechanisms
 *     fitted on one set of rows and every answer computed against another, with
 *     nothing downstream able to notice. The override exists on the server
 *     (`force=true`) and it *drops the model*, which is the only version of
 *     "proceed" that is not a trap; the button says so.
 */
export function ImportButton() {
  const importBundle = useStore((s) => s.importBundle)
  const fileRef = useRef<HTMLInputElement>(null)
  const [retry, setRetry] = useState<File | null>(null)
  const [why, setWhy] = useState<string | null>(null)

  async function pick(file: File | null, strict: boolean) {
    if (!file) return
    setRetry(null)
    setWhy(null)
    try {
      await importBundle(file, strict)
    } catch (e) {
      // `importBundle` notifies through the store's toast, so this only has to
      // decide whether the failure is one the user can override.
      const msg = e instanceof ApiError ? e.message : String(e)
      if (/different libraries/i.test(msg)) {
        setRetry(file)
        setWhy(msg)
      }
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0] ?? null, true)
          // Clearing the value is what lets the *same* file be picked twice —
          // after an "import anyway", the change event would not fire again.
          e.target.value = ''
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => fileRef.current?.click()}
        title="Restore a project from an exported .zip. Always opens as a new project — nothing here is overwritten."
      >
        <Icon name="upload" className="mr-1 text-[13px]" />
        Import
      </Button>

      {retry && (
        <div
          role="alertdialog"
          aria-label="Import anyway?"
          className="themed fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setRetry(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-[var(--ck-shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-orange">
              Different libraries
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{why}</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRetry(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => void pick(retry, false)}>
                Import anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
