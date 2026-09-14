import { useEffect } from 'react'
import { useStore } from '../../stores/useStore'
import { AppShell } from '../../app/AppShell'
import { CausalCanvas } from './CausalCanvas'
import { PriorsPanel } from './PriorsPanel'
import { AddEdgeBar, CuratedGraphPanel, EdgeListPanel, MethodPanel } from './panels'

export function DiscoveryModule() {
  const ensureContext = useStore((s) => s.ensureContext)

  // The discovery context (materialised frame + constraint over the kept columns)
  // is what an edge can refer to, so build it on entry rather than making the
  // user run a method before the Add-edge bar has anything to offer.
  useEffect(() => {
    ensureContext()
  }, [ensureContext])

  return (
    <AppShell
      left={
        <>
          <MethodPanel />
          <PriorsPanel />
        </>
      }
      centre={<CausalCanvas />}
      right={
        <>
          <AddEdgeBar />
          <CuratedGraphPanel />
          <EdgeListPanel />
        </>
      }
    />
  )
}
