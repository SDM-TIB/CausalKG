import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'

/**
 * React Flow's `fitView` prop only runs on init, so collapsing a sidebar (which
 * changes the canvas width) would leave the graph drifting off-centre. Refit on
 * container resize instead — rendered as a child of <ReactFlow> so it can find
 * the container without threading a ref through.
 */
export function FitOnResize({ padding = 0.18 }: { padding?: number }) {
  const { fitView } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.closest('.react-flow') as HTMLElement | null
    if (!el) return
    let timer = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => void fitView({ padding, maxZoom: 1.1, duration: 220 }),
        140,
      )
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(timer)
    }
  }, [fitView, padding])

  return <div ref={ref} className="hidden" />
}
