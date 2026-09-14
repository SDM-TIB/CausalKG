import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  hint?: string
  tone?: 'green' | 'orange' | 'red'
  disabled?: boolean
  onSelect: () => void
}

/**
 * The right-click menu on a node card.
 *
 * Observing and intervening are different *acts*, not different values, so they are
 * offered as named commands rather than distinguished by a modifier key. Shift-click
 * worked, but a board where the difference between P(y|x) and P(y|do(x)) depends on
 * whether the user was holding a key is a board that will silently produce the wrong
 * kind of answer.
 */
export function BoardContextMenu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number
  y: number
  title: string
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const TONE = {
    green: 'text-green',
    orange: 'text-orange',
    red: 'text-red',
  } as const

  return (
    <div
      ref={ref}
      className="ck-enter fixed z-[100] w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--ck-shadow)]"
      style={{ left: Math.min(x, window.innerWidth - 236), top: Math.min(y, window.innerHeight - 200) }}
    >
      <div className="truncate border-b border-linesoft px-2.5 py-1.5 font-mono text-[10px] text-faint">
        {title}
      </div>
      <ul className="p-1">
        {items.map((it) => (
          <li key={it.label}>
            <button
              disabled={it.disabled}
              onClick={() => {
                it.onSelect()
                onClose()
              }}
              className={`block w-full rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-40 ${
                it.tone ? TONE[it.tone] : 'text-ink'
              }`}
            >
              {it.label}
              {it.hint && (
                <span className="mt-[1px] block text-[10px] leading-tight text-faint">
                  {it.hint}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
