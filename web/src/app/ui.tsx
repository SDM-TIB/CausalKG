import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../stores/useStore'
import { PanelResizer } from './Resize'

/* ------------------------------------------------------------------ *
 * Icons — a hand-picked set, 16px grid, 1.6 stroke. Inline rather than
 * a dependency: eight glyphs is not worth a package.
 * ------------------------------------------------------------------ */
const PATHS: Record<string, ReactNode> = {
  panelLeft: (
    <>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" />
      <path d="M8 3v14" />
    </>
  ),
  panelRight: (
    <>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" />
      <path d="M12 3v14" />
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 1.6v1.8M10 16.6v1.8M18.4 10h-1.8M3.4 10H1.6M15.9 4.1l-1.3 1.3M5.4 14.6l-1.3 1.3M15.9 15.9l-1.3-1.3M5.4 5.4L4.1 4.1" />
    </>
  ),
  moon: <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />,
  download: (
    <>
      <path d="M10 2.6v9.6M6.2 8.6 10 12.4l3.8-3.8" />
      <path d="M3.4 13.6v2a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8v-2" />
    </>
  ),
  // The download arrow, reversed: same tray, arrow going up into it.
  upload: (
    <>
      <path d="M10 12.4V2.8M6.2 6.6 10 2.8l3.8 3.8" />
      <path d="M3.4 13.6v2a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8v-2" />
    </>
  ),
  plus: <path d="M10 4.2v11.6M4.2 10h11.6" />,
  trash: (
    <>
      <path d="M3.6 5.4h12.8M8 5.4V3.8h4v1.6M5.2 5.4l.7 10.2a1.6 1.6 0 0 0 1.6 1.5h5a1.6 1.6 0 0 0 1.6-1.5l.7-10.2" />
    </>
  ),
  play: <path d="M6.6 4.2 15 10l-8.4 5.8Z" />,
  refresh: (
    <>
      <path d="M16.4 8.4A6.6 6.6 0 0 0 4.6 6.1M3.6 11.6a6.6 6.6 0 0 0 11.8 2.3" />
      <path d="M16.4 4v4.4H12M3.6 16v-4.4H8" />
    </>
  ),
  check: <path d="M4.4 10.4 8 14l7.6-8" />,
  x: <path d="M5 5l10 10M15 5L5 15" />,
  chevron: <path d="M6 8l4 4 4-4" />,
  info: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M10 9.2v4.4M10 6.6v.1" />
    </>
  ),
  layers: (
    <>
      <path d="M10 2.6 2.8 6.4 10 10.2l7.2-3.8Z" />
      <path d="M2.8 10.6 10 14.4l7.2-3.8" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 10S4.8 4.4 10 4.4 18.2 10 18.2 10 15.2 15.6 10 15.6 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </>
  ),
  scissors: (
    <>
      <circle cx="5.2" cy="14.8" r="2.2" />
      <circle cx="5.2" cy="5.2" r="2.2" />
      <path d="M6.8 6.8 16 15.6M6.8 13.2 16 4.4" />
    </>
  ),
  beaker: (
    <>
      <path d="M8 2.6v5L3.6 15a1.6 1.6 0 0 0 1.4 2.4h10a1.6 1.6 0 0 0 1.4-2.4L12 7.6v-5" />
      <path d="M6.8 2.6h6.4M5.8 12.4h8.4" />
    </>
  ),
  branch: (
    <>
      <circle cx="5.6" cy="4.6" r="2.2" />
      <circle cx="5.6" cy="15.4" r="2.2" />
      <circle cx="14.4" cy="10" r="2.2" />
      <path d="M5.6 6.8v6.4M7.8 4.6h2.4a2 2 0 0 1 2 2v1.4" />
    </>
  ),
}

export function Icon({ name, className = '' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`size-[1em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  active?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  active,
  className = '',
  ...rest
}: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ' +
    'transition-[background-color,border-color,color,box-shadow] duration-150 ' +
    'disabled:opacity-40 disabled:pointer-events-none select-none border'
  const sizes = { sm: 'h-7 px-2 text-[11.5px]', md: 'h-8 px-3 text-[12.5px]' }[size]
  const variants = {
    default:
      'border-line bg-surface2 text-ink hover:bg-surface3 hover:border-faint/60 active:translate-y-px',
    primary:
      'border-transparent bg-indigo text-white shadow-sm hover:brightness-110 active:translate-y-px dark:text-[#0b0e14]',
    ghost: 'border-transparent text-muted hover:bg-surface2 hover:text-ink',
    danger: 'border-line bg-surface2 text-red hover:bg-red/10 hover:border-red/40',
  }[variant]
  const on = active ? 'ring-1 ring-indigo/50 !bg-indigo/12 !text-indigo !border-indigo/40' : ''
  return <button className={`${base} ${sizes} ${variants} ${on} ${className}`} {...rest} />
}

export function IconButton({
  label,
  ...rest
}: BtnProps & { label: string; name?: keyof typeof PATHS }) {
  return <Button aria-label={label} title={label} {...rest} className={`!px-2 ${rest.className ?? ''}`} />
}

/* ------------------------------------------------------------------ *
 * Panels — the one container. A panel is a titled surface with optional
 * trailing controls and a caption; every module is built out of them.
 *
 * Two props govern its size, and they are the whole answer to "the module
 * leaves empty space at the bottom of the window":
 *   grow      the panel is the module's primary surface and absorbs every
 *             leftover pixel of the centre column, so its bottom edge is the
 *             window's bottom edge.
 *   resizeId  the user may drag that height to something else; the override is
 *             stored under this id and a double-click on the handle removes it.
 * A panel with `grow` and no override needs its body to be able to shrink, so
 * the body becomes a flex column with `min-h-0` — a canvas inside it should be
 * `flex-1 min-h-0` rather than a `vh`-derived clamp.
 *
 * `step` is "module·position", e.g. `1·2`, never a bare running number.
 *
 * It used to be a single counter across the whole app, and it did not survive
 * the modules being reshuffled: module 3 showed a panel numbered 5 above one
 * numbered 3, and module 4 showed 5, 6, 4 top to bottom. The cause is
 * structural rather than a typo — two of these panels are *shared* (the causal
 * model panel is rendered by modules 3 and 4 both), so no single number can be
 * right in both places, and hard-coding one there guarantees it is wrong in the
 * other. Panels that are shared take their `step` from the module that renders
 * them.
 *
 * Only the steps a user walks through are numbered. A panel that *reports*
 * something — evaluation, the edge ledger, the query log, pinned answers — has
 * no number, because numbering it implies an order to do it in that does not
 * exist.
 * ------------------------------------------------------------------ */
export function Panel({
  title,
  step,
  note,
  right,
  children,
  className = '',
  bodyClass = '',
  flush,
  grow,
  resizeId,
}: {
  title?: ReactNode
  step?: number | string
  note?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  flush?: boolean
  grow?: boolean
  resizeId?: string
}) {
  const override = useStore((s) => (resizeId ? s.panelHeight[resizeId] : undefined))
  const stretch = grow || override !== undefined

  return (
    <section
      className={`themed rounded-xl border border-line bg-surface shadow-[var(--ck-shadow)] ${
        stretch ? 'flex flex-col' : ''
      } ${grow && override === undefined ? 'flex-1' : ''} ${className}`}
      // A `flex-1` child has `flex-basis: 0`, so it shrinks to its own header the moment
      // a sibling panel below it is taller than the window — which is exactly what the
      // preprocess module does, where the materialisation panel carries a full SPARQL
      // query. The floor is what a canvas used to be sized at outright; the difference
      // is that it is now a minimum the panel grows past when there is room, instead of
      // a ceiling that left background showing underneath.
      style={
        override === undefined
          ? grow
            ? { minHeight: 'clamp(320px, 52vh, 720px)' }
            : undefined
          : { height: override, flex: '0 0 auto' }
      }
    >
      {title && (
        <header className="flex shrink-0 items-center gap-2 border-b border-linesoft px-3 py-2">
          {step !== undefined && (
            <span className="grid size-5 shrink-0 place-items-center rounded-md bg-indigo/12 font-mono text-[10.5px] font-semibold text-indigo">
              {step}
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div
        className={`${flush ? '' : 'p-3 '}${
          stretch ? 'flex min-h-0 flex-1 flex-col ' : ''
        }${bodyClass}`}
      >
        {children}
      </div>
      {note && (
        <p className="shrink-0 border-t border-linesoft px-3 py-2 text-[11px] text-faint">{note}</p>
      )}
      {resizeId && <PanelResizer id={resizeId} />}
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
  inline,
}: {
  label: string
  hint?: string
  children: ReactNode
  inline?: boolean
}) {
  return (
    <label className={inline ? 'flex items-center gap-2' : 'block'}>
      <span
        className={`text-[11px] font-medium text-muted ${inline ? 'shrink-0' : 'mb-1 block'}`}
        title={hint}
      >
        {label}
      </span>
      <span className={inline ? 'min-w-0 flex-1' : 'block'}>{children}</span>
    </label>
  )
}

const control =
  'w-full h-8 rounded-lg border border-line bg-surface2 px-2 text-[12.5px] text-ink ' +
  'transition-colors hover:border-faint/60 focus:border-indigo focus:outline-none'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${control} appearance-none bg-[length:14px] bg-[right_6px_center] bg-no-repeat pr-6 ${props.className ?? ''}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%238f99ad' stroke-width='1.6' stroke-linecap='round'><path d='M6 8l4 4 4-4'/></svg>\")",
      }}
    />
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[32px] shrink-0 rounded-full border transition-colors duration-150 ${
        checked ? 'border-indigo/50 bg-indigo/70' : 'border-line bg-surface3'
      }`}
    >
      <span
        className={`absolute top-[2px] size-[12px] rounded-full bg-white shadow transition-all duration-150 ${
          checked ? 'left-[16px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}

export function Badge({
  children,
  tone = 'muted',
  className = '',
  title,
}: {
  children: ReactNode
  tone?: 'muted' | 'teal' | 'amber' | 'sky' | 'indigo' | 'green' | 'orange' | 'red'
  className?: string
  /** For a badge that is a claim rather than a label — the caveat behind the word. */
  title?: string
}) {
  const tones: Record<string, string> = {
    muted: 'border-line text-faint',
    teal: 'border-teal/35 text-teal bg-teal/10',
    amber: 'border-amber/35 text-amber bg-amber/10',
    sky: 'border-sky/35 text-sky bg-sky/10',
    indigo: 'border-indigo/35 text-indigo bg-indigo/10',
    green: 'border-green/35 text-green bg-green/10',
    orange: 'border-orange/35 text-orange bg-orange/10',
    red: 'border-red/35 text-red bg-red/10',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] font-mono text-[10px] leading-[15px] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function StatGrid({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-[3px] text-[11.5px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="truncate text-muted">{k}</dt>
          <dd className="text-right font-mono tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: keyof typeof PATHS }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
      {icon && <Icon name={icon} className="text-[22px] text-faint/60" />}
      <p className="max-w-sm text-[12px] leading-relaxed text-faint">{children}</p>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface2 p-[2px]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
            value === t.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Methodological prose lives behind these, one `?` at a time (Plan 3 §11). */
export function Info({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Why this matters"
        className="grid size-[15px] place-items-center rounded-full border border-line text-[9px] font-semibold text-faint transition-colors hover:border-indigo/50 hover:text-indigo"
      >
        ?
      </button>
      {open && (
        <span className="ck-enter absolute right-0 top-5 z-50 block w-64 rounded-lg border border-line bg-surface p-2.5 text-[11.5px] leading-relaxed text-muted shadow-[var(--ck-shadow)]">
          {children}
        </span>
      )}
    </span>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`ck-spin size-[1em] ${className}`} fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" opacity=".2" />
      <path
        d="M17 10a7 7 0 0 0-7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Note({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'warn' | 'err' | 'ok'
  children: ReactNode
}) {
  const tones = {
    muted: 'border-line bg-surface2 text-muted',
    warn: 'border-orange/30 bg-orange/8 text-orange',
    err: 'border-red/30 bg-red/8 text-red',
    ok: 'border-green/30 bg-green/8 text-green',
  }[tone]
  return (
    <p className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] leading-relaxed ${tones}`}>
      {children}
    </p>
  )
}
