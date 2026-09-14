import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import { useStore } from '../stores/useStore'
import type { CanvasId } from '../api/client'

export type XY = { x: number; y: number }

/**
 * Node positions are project state, not browser state (Plan 3 W13): a reload
 * restores the board and an export carries it. The seeded arrangement is only a
 * starting point — the user owns the layout from the first drag.
 */
export function useLayoutSync(canvas: CanvasId) {
  const layouts = useStore((s) => s.layouts)
  const saveLayout = useStore((s) => s.saveLayout)
  const stored = layouts[canvas]

  const place = useCallback((id: string, seed: XY): XY => stored[id] ?? seed, [stored])

  const commit = useCallback(
    (_e: unknown, node: Node) => {
      const current = useStore.getState().layouts[canvas]
      saveLayout(canvas, { ...current, [node.id]: { x: node.position.x, y: node.position.y } })
    },
    [canvas, saveLayout],
  )

  return { place, commit, stored }
}

/** Points on a circle, starting at 12 o'clock. */
export function ring(i: number, n: number, cx: number, cy: number, r: number): XY {
  const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

/** The angle a ring position sits at — used to fan satellites outward. */
export function ringAngle(i: number, n: number): number {
  return (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2
}
