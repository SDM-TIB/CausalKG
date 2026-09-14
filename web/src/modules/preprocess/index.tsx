import { useStore } from '../../stores/useStore'
import { AppShell } from '../../app/AppShell'
import { Empty, Panel } from '../../app/ui'
import { OntologyCanvas } from './OntologyCanvas'
import { MaterialisePanel } from './MaterialisePanel'
import {
  ColumnTypePanel,
  ConstraintPanel,
  NodeCurationPanel,
  SchemaPanel,
  SourcePanel,
} from './panels'

export function PreprocessModule() {
  const schema = useStore((s) => s.schema)

  return (
    <AppShell
      left={
        <>
          <SourcePanel />
          <SchemaPanel />
          <ConstraintPanel />
        </>
      }
      centre={
        schema ? (
          <>
            <OntologyCanvas />
            <MaterialisePanel />
          </>
        ) : (
          <Panel className="flex-1">
            <Empty icon="layers">
              Load a knowledge graph on the left — a bundled sample, an RDF file, or a SPARQL
              endpoint. The induced ontology appears here as a draggable diagram, and every property
              on it becomes a candidate causal variable you can keep or drop.
            </Empty>
          </Panel>
        )
      }
      right={
        <>
          <ColumnTypePanel />
          <NodeCurationPanel />
        </>
      }
    />
  )
}
