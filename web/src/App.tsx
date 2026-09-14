import { useEffect } from 'react'
import { useStore } from './stores/useStore'
import { AppShell, Toaster } from './app/AppShell'
import { TopBar } from './app/TopBar'
import { Defs } from './flow/Defs'
import { PreprocessModule } from './modules/preprocess'
import { DiscoveryModule } from './modules/discovery'
import { InferenceModule } from './modules/inference'
import { CounterfactualModule } from './modules/counterfactual'
import { Empty, Panel } from './app/ui'

export default function App() {
  const module = useStore((s) => s.module)
  const projectId = useStore((s) => s.projectId)
  const init = useStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="themed flex h-full flex-col bg-bg text-ink">
      <Defs />
      <TopBar />
      {!projectId ? (
        <AppShell
          centre={
            <Panel className="flex-1">
              <Empty>Starting a session…</Empty>
            </Panel>
          }
        />
      ) : module === 'preprocess' ? (
        <PreprocessModule />
      ) : module === 'discovery' ? (
        <DiscoveryModule />
      ) : module === 'inference' ? (
        <InferenceModule />
      ) : (
        <CounterfactualModule />
      )}
      <Toaster />
    </div>
  )
}
