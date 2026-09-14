import type { ModuleId } from '../stores/useStore'

export interface ModuleDef {
  id: ModuleId
  n: number
  label: string
  sub: string
  built: boolean
}

/**
 * Four steps. The old "Causal model" step has been folded into Inference: choosing and
 * fitting a model is not somewhere you go, it is something you adjust while asking a
 * question, and separating them meant walking back a module every time the answer
 * suggested a different model.
 */
export const MODULES: ModuleDef[] = [
  { id: 'preprocess', n: 1, label: 'Preprocess', sub: 'Ingest · ontology · curate', built: true },
  {
    id: 'discovery',
    n: 2,
    label: 'Causal Discovery',
    sub: 'Run methods · edge ledger',
    built: true,
  },
  {
    id: 'inference',
    n: 3,
    label: 'Inference',
    sub: 'Fit · observe · intervene',
    built: true,
  },
  {
    id: 'counterfactual',
    n: 4,
    label: 'Counterfactual',
    sub: 'Abduct · act · predict',
    built: true,
  },
]
