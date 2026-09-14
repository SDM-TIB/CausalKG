import { useEffect, type ReactNode } from 'react'
import { useStore } from '../stores/useStore'
import { RailResizer } from './Resize'
import { Icon } from './ui'

/**
 * Three columns: inputs on the left, the canvas and what it produces in the centre,
 * curation and inspection on the right. Both rails collapse from explicit buttons in the
 * top bar (⌘[ / ⌘]) — on a laptop the canvas wants the whole width and the user should be
 * able to say so in one click (Plan 3 §11) — and both are drag-resizable in between,
 * because "collapsed or 288px" is not a real choice on a 32-inch screen.
 *
 * The centre column is `min-h-full`, so a module's panels are guaranteed at least the
 * window's height and the primary panel (marked `grow`) absorbs whatever is left over.
 * That is what keeps a single centre panel's bottom edge on the bottom of the window
 * instead of ending two thirds of the way down with background underneath it.
 */
export function AppShell({
  left,
  centre,
  right,
}: {
  left?: ReactNode
  centre: ReactNode
  right?: ReactNode
}) {
  const { leftOpen, rightOpen, toggleLeft, toggleRight, railWidth } = useStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '[') {
        e.preventDefault()
        toggleLeft()
      }
      if (e.key === ']') {
        e.preventDefault()
        toggleRight()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleLeft, toggleRight])

  // No width transition while a rail is being dragged — an animated width lags the
  // cursor by exactly the transition duration and the handle feels broken. The
  // collapse buttons animate because they are a step change, not a drag.
  const rail = 'themed shrink-0 overflow-y-auto overscroll-contain bg-bg'

  return (
    <div className="flex min-h-0 flex-1">
      {left && (
        <>
          <aside
            className={`${rail} border-r border-line ${leftOpen ? '' : 'border-r-0'}`}
            style={{ width: leftOpen ? railWidth.left : 0 }}
            aria-hidden={!leftOpen}
          >
            <div
              className="flex flex-col gap-2.5 p-2.5"
              style={{ width: railWidth.left }}
            >
              {left}
            </div>
          </aside>
          {leftOpen && <RailResizer side="left" />}
        </>
      )}

      <main className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col gap-2.5 p-2.5">{centre}</div>
      </main>

      {right && (
        <>
          {rightOpen && <RailResizer side="right" />}
          <aside
            className={`${rail} border-l border-line ${rightOpen ? '' : 'border-l-0'}`}
            style={{ width: rightOpen ? railWidth.right : 0 }}
            aria-hidden={!rightOpen}
          >
            <div
              className="flex flex-col gap-2.5 p-2.5"
              style={{ width: railWidth.right }}
            >
              {right}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

export function Toaster() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismiss)

  useEffect(() => {
    if (!toast || toast.kind === 'err') return
    const t = setTimeout(dismiss, 5000)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  if (!toast) return null
  // Solid surface, not a tint: a toast lands over the canvas and has to stay
  // readable against whatever is behind it.
  const tones = {
    ok: { border: 'border-green/50', text: 'text-green', bar: 'bg-green' },
    warn: { border: 'border-orange/50', text: 'text-orange', bar: 'bg-orange' },
    err: { border: 'border-red/50', text: 'text-red', bar: 'bg-red' },
  }[toast.kind]

  return (
    <div
      role="status"
      className={`ck-enter pointer-events-auto fixed bottom-4 left-1/2 z-50 flex max-w-[min(680px,92vw)] -translate-x-1/2 items-start gap-2 overflow-hidden rounded-xl border bg-surface py-2 pl-3 pr-2.5 ${tones.border} shadow-[var(--ck-shadow)]`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${tones.bar}`} aria-hidden />
      <span className={`whitespace-pre-wrap text-[12px] leading-relaxed ${tones.text}`}>
        {toast.text}
      </span>
      <button onClick={dismiss} aria-label="Dismiss" className="mt-[2px] shrink-0 opacity-70 hover:opacity-100">
        <Icon name="x" className="text-[13px]" />
      </button>
    </div>
  )
}
