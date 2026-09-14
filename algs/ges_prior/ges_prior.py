from .ges_phase_I import ges_phase_i
from .ges_phase_II import ges_phase_ii
from .operators.graph import _apply_meek_rules
from typing import Union, Optional
import pandas as pd
import numpy as np
import networkx as nx
from pgmpy.structure_score import BaseStructureScore as StructureScore
from pgmpy.causal_discovery import HillClimbSearch
from pgmpy.base import DAG, PDAG


def _extract_B(scoring_method, n: int) -> np.ndarray:
    """Safely extract the directional prior ``B`` from a scoring method.

    Returns a neutral 0.5 matrix when ``scoring_method`` is a plain string
    (i.e. no priors were supplied) rather than a :class:`StructureScoreWithPrior`.
    """
    B = getattr(scoring_method, "B", None)
    if B is None:
        return np.full((n, n), 0.5)
    return np.asarray(B, dtype=float)


def run_ges_prior(data: pd.DataFrame, use_cache: bool = True,
    scoring_method_i: Optional[Union[str, StructureScore]] = 'bic-g',
    scoring_method_ii: Optional[Union[str, StructureScore]] = 'bic-g',
    orient_strategy=0,
    allowed: Optional[np.ndarray] = None,
    expert_knowledge=None,
):
    if orient_strategy == -1:
        varnames = data.columns.tolist()
        hc = HillClimbSearch(
            scoring_method=scoring_method_i,
            expert_knowledge=expert_knowledge,
            return_type="dag",
        )
        hc.fit(data)
        best_model = hc.causal_graph_

        dag = nx.to_numpy_array(
            best_model,
            nodelist=varnames,
            dtype=int,
            weight=None
        )
        return dag

    cpdag = ges_phase_i(data, use_cache, scoring_method_i, allowed)

    if orient_strategy == 0:    # meek's rules
        dag = _apply_meek_rules(cpdag, allowed)
    elif orient_strategy == 1:  # orient using score B
        B = _extract_B(scoring_method_ii, cpdag.shape[0])
        dag = oriente_via_B(cpdag=cpdag, B=B, allowed=allowed)

    elif orient_strategy == 2:  # searching using score B
        varnames = data.columns.tolist()
        directed_edges = []
        undirected_edges = []

        for i in range(len(varnames)):
            for j in range(i + 1, len(varnames)):
                if cpdag[i, j] == 1 and cpdag[j, i] == 1:
                    undirected_edges.append((varnames[i], varnames[j]))
                elif cpdag[i, j] == 1 and cpdag[j, i] == 0:
                    directed_edges.append((varnames[i], varnames[j]))
                elif cpdag[j, i] == 1 and cpdag[i, j] == 0:
                    directed_edges.append((varnames[j], varnames[i]))

        pdag = PDAG(directed_ebunch=directed_edges,
            undirected_ebunch=undirected_edges)

        start_dag = pdag.to_dag()

        start_dag.add_nodes_from(list(set(varnames).difference(set(start_dag.nodes()))))

        hc = HillClimbSearch(
            scoring_method=scoring_method_ii,
            start_dag=start_dag,
            expert_knowledge=expert_knowledge,
            return_type="dag",
        )
        hc.fit(data)
        best_model = hc.causal_graph_

        dag = nx.to_numpy_array(
            best_model,
            nodelist=varnames,
            dtype=int,
            weight=None
        )
    elif orient_strategy == 3:
        # 'GES-M-B-Greedy', the unperfect expert
        B = _extract_B(scoring_method_ii, cpdag.shape[0])
        dag = orient_via_imperfect_expert_greedy(cpdag, B=B, allowed=allowed)
    elif orient_strategy == 4:
        # MEC-restricted greedy orientation of the CPDAG.
        dag = ges_phase_ii(cpdag, data, use_cache, scoring_method_ii, allowed=allowed)
    else:
        raise ValueError(f"Unknown orient_strategy {orient_strategy}")
    return dag


def run_ges_hl(data: pd.DataFrame,
               use_cache: bool = True,
               scoring_method: Optional[Union[str, StructureScore]] = 'bic-g',
               expert_knowledge=None):
    varnames = data.columns.tolist()

    # Initialize Hill Climbing search
    hc = HillClimbSearch(
        scoring_method=scoring_method,
        expert_knowledge=expert_knowledge,
        return_type="dag",
    )

    # Estimate the best DAG structure
    hc.fit(data)
    best_model = hc.causal_graph_

    # Add any isolated nodes that might not be in the learned structure
    best_model.add_nodes_from(list(set(varnames).difference(set(best_model.nodes()))))

    # Convert to numpy adjacency matrix with consistent node ordering
    dag = nx.to_numpy_array(
        best_model,
        nodelist=varnames,
        dtype=int,
        weight=None
    )

    return dag


"""
score type

1: GES with normal score
2: GES with prior_i (M = A * C)
3. GES with prior_i (M) and prior_ii (B = M * D)

4. GES with prior_i (B)
"""


def oriente_via_B(cpdag, B, allowed=None):
    n = cpdag.shape[0]
    dag = cpdag.copy()

    # Find undirected edges (where both directions exist)
    # Only iterate over upper triangle to avoid processing each edge twice
    for i in range(n):
        for j in range(i + 1, n):
            # Check if this is an undirected edge
            if cpdag[i, j] == 1 and cpdag[j, i] == 1:
                # Single permitted direction forces that orientation, regardless of B.
                if allowed is not None:
                    if allowed[i, j] and not allowed[j, i]:
                        dag[i, j] = 1
                        dag[j, i] = 0
                        continue
                    if allowed[j, i] and not allowed[i, j]:
                        dag[i, j] = 0
                        dag[j, i] = 1
                        continue
                    if not allowed[i, j] and not allowed[j, i]:
                        dag[i, j] = 0
                        dag[j, i] = 0
                        continue
                # Orient based on B matrix
                if B[i, j] > B[j, i]:
                    # Orient as i -> j
                    dag[i, j] = 1
                    dag[j, i] = 0
                elif B[j, i] > B[i, j]:
                    # Orient as j -> i
                    dag[i, j] = 0
                    dag[j, i] = 1
                else:
                    # Tie-breaking: use lexicographic order (i -> j since i < j)
                    dag[i, j] = 1
                    dag[j, i] = 0

    return dag


def orient_via_imperfect_expert_greedy(cpdag, B, eta=1.0, allowed=None):
    """
    Greedy orientation: iteratively orient the safest edge first.
    """

    dag = cpdag.copy()
    n = cpdag.shape[0]

    # Pre-orient edges whose direction is fixed by the constraint.
    if allowed is not None:
        for i in range(n):
            for j in range(i + 1, n):
                if dag[i, j] == 1 and dag[j, i] == 1:
                    if allowed[i, j] and not allowed[j, i]:
                        dag[i, j] = 1
                        dag[j, i] = 0
                    elif allowed[j, i] and not allowed[i, j]:
                        dag[i, j] = 0
                        dag[j, i] = 1
                    elif not allowed[i, j] and not allowed[j, i]:
                        dag[i, j] = 0
                        dag[j, i] = 0

    while True:
        candidates = []

        for i in range(n):
            for j in range(i + 1, n):
                if dag[i, j] == 1 and dag[j, i] == 1:
                    pij, pji = B[i, j], B[j, i]
                    p_max = max(pij, pji)

                    if p_max >= 1.0 - eta:
                        candidates.append((p_max, i, j))

        # No safe orientation left
        if not candidates:
            break

        # Pick the safest edge
        _, i, j = max(candidates)

        if B[i, j] > B[j, i]:
            dag[i, j] = 1
            dag[j, i] = 0
        else:
            dag[i, j] = 0
            dag[j, i] = 1

        # (Optional) apply Meek rules here if you want propagation

    return dag
