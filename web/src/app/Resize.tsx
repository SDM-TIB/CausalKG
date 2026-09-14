/**
 * The two drag handles every module's layout is built from.
 *
 * The rule the layout follows is "fill the window, then let the user argue with it":
 * nothing is sized to a guess about the viewport, so a module never leaves a strip of
 * background under its last panel, and anything whose size is a matter of taste rather
 * than of content can be dragged. A dragged size is an *override*; double-clicking a
 * handle removes the override and hands the panel back to the flex layout, which is the
 * only way back to "fills the window" once you have set a number.
 *
 * Pointer capture rather than window listeners: the drag has to keep tracking when the
 * cursor leaves the 5px strip (it always does, immediately), and capture is what makes a
 * fast drag over a React Flow canvas not get eaten by the canvas's own pan handler.
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../stores/useStore'

/** Widens or narrows a rail. `side` is which rail, not which edge of the handle. */
export function RailResizer({ side }: { side: 'left' | 'right' }) {
  const width = useStore((s) => s.railWidth[side])
  const setRailWidth = useStore((s) => s.setRailWidth)
  const start = useRef({ x: 0, w: 0 })

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      start.current = { x: e.clientX, w: width }
    },
    [width],
  )

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const dx = e.clientX - start.current.x
      setRailWidth(side, start.current.w + (side === 'left' ? dx : -dx))
    },
    [side, setRailWidth],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${side} panel`}
      title="Drag to resize · double-click to reset"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      onDoubleClick={() => setRailWidth(side, side === 'left' ? 288 : 320)}
      className="group relative z-10 w-[5px] shrink-0 cursor-col-resize touch-none bg-transparent"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-indigo group-active:bg-indigo" />
    </div>
  )
}

/**
 * Sets an explicit height on a centre panel. With no override the panel is `flex-1` and
 * grows to the bottom of the window; the first drag pins it, and a double-click unpins it.
 */
export function PanelResizer({ id }: { id: string }) {
  const setPanelHeight = useStore((s) => s.setPanelHeight)
  const start = useRef({ y: 0, h: 0 })

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize this panel"
      title="Drag to resize · double-click to fill the window"
      onPointerDown={(e) => {
        e.preventDefault()
        const panel = e.currentTarget.parentElement as HTMLElement | null
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { y: e.clientY, h: panel?.getBoundingClientRect().height ?? 0 }
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        setPanelHeight(id, start.current.h + (e.clientY - start.current.y))
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      onDoubleClick={() => setPanelHeight(id, null)}
      className="group flex h-[9px] w-full shrink-0 cursor-row-resize touch-none items-center justify-center rounded-b-xl"
    >
      <span className="h-[2px] w-8 rounded-full bg-line transition-colors group-hover:bg-indigo group-active:bg-indigo" />
    </div>
  )
}
