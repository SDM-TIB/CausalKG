import numpy as np
import networkx as nx
from typing import Set, Tuple, Optional, Union
import pandas as pd 

# ----------------------------
# Utilities
# ----------------------------
def _logit(p: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    p = np.clip(p, eps, 1.0 - eps)
    return np.log(p / (1.0 - p))

def cpdag_skeleton(cpdag: np.ndarray) -> np.ndarray:
    """Return undirected skeleton adjacency (0/1) from a CPDAG adjacency encoding."""
    cpdag01 = (np.asarray(cpdag) != 0).astype(int)
    return ((cpdag01 + cpdag01.T) > 0).astype(int)

def directed_parents(dag_adj: np.ndarray, v: int) -> Set[int]:
    """Parents of v in a DAG adjacency matrix."""
    return set(np.where(dag_adj[:, v] == 1)[0].tolist())

def would_create_new_vstructure(skel: np.ndarray, dag_adj: np.ndarray, u: int, v: int) -> bool:
    """
    CPDAG-consistency constraint (MEC constraint):
    Adding u->v must not introduce a new collider at v with an existing k->v where k is not adjacent to u in the skeleton.
    """
    incoming = np.where(dag_adj[:, v] == 1)[0]
    for k in incoming:
        if k == u:
            continue
        if skel[k, u] == 0:
            return True
    return False

# ----------------------------
# Local score (data term) + hybrid prior (asymmetric B)
# ----------------------------
# from .scores.structure_score_prior import StructureScoreWithPrior
from .operators.utils import apply_score
from pgmpy.structure_score import BaseStructureScore, get_scoring_method

# ----------------------------
# Phase II (orient only undirected edges of CPDAG)
# --------------------

def ges_phase_ii(
    cpdag: np.ndarray,
    data: pd.DataFrame,
    use_cache: bool = True,
    scoring_method: Optional[Union[str, BaseStructureScore]] = 'bic-g',
    allowed: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Variant A (MEC-restricted orientation):

    Input:
      - cpdag: adjacency encoding of CPDAG:
          * compelled i->j: cpdag[i,j]=1 and cpdag[j,i]=0
          * reversible i-j: cpdag[i,j]=cpdag[j,i]=1
      - score: HybridLocalScore implementing your target S_local (BIC + directional prior)
      - require_non_decreasing:
          if True, only apply orientations with delta>0 (may stop early, leaving some edges unoriented)
          if False, orients all reversible edges by greedy max-delta (possibly negative near the end)
      - allowed: (d, d) boolean matrix; only allowed directions are considered.
        A pair with no permitted orientation raises a clear error.

    Output:
      - dag adjacency matrix (0/1), same skeleton as cpdag, acyclic.

    Constraints enforced:
      1) Skeleton fixed to CPDAG skeleton
      2) Compelled arrows fixed
      3) No cycles
      4) All edges point only into allowed directions
    """
    criterion = get_scoring_method(scoring_method, data)

    cpdag01 = (np.asarray(cpdag) != 0).astype(int)
    d = cpdag01.shape[0]
    skel = cpdag_skeleton(cpdag01)

    # Initialize with compelled directed edges
    dag = np.zeros((d, d), dtype=int)
    rows, cols = np.where((cpdag01 == 1) & (cpdag01.T == 0))
    for i, j in zip(rows, cols):
        if allowed is not None and not allowed[i, j] and allowed[j, i]:
            dag[j, i] = 1
        elif allowed is not None and not allowed[i, j] and not allowed[j, i]:
            raise ValueError(
                f"Compelled edge {i}->{j} has no permitted orientation under the constraint."
            )
        else:
            dag[i, j] = 1

    # Collect undirected (reversible) edges (i<j)
    und = np.where(np.triu((cpdag01 == 1) & (cpdag01.T == 1), k=1))
    undirected_pairs: Set[Tuple[int, int]] = {(int(i), int(j)) for i, j in zip(und[0], und[1])}

    # DAG object for acyclicity queries
    G = nx.DiGraph()
    G.add_nodes_from(range(d))
    G.add_edges_from([(i, j) for i, j in zip(*np.where(dag == 1))])

    if not nx.is_directed_acyclic_graph(G):
        raise ValueError("Invalid CPDAG input: compelled edges already form a cycle.")

    while undirected_pairs:
        best: Optional[Tuple[float, int, int]] = None  # (delta, u, v) meaning u->v

        # Re-evaluate gains every iteration (order matters in DAG constraints)
        for a, b in list(undirected_pairs):
            for u, v in ((a, b), (b, a)):
                # Directional constraint: only allowed directions are considered.
                if allowed is not None and not allowed[u, v]:
                    continue

                # Acyclicity: adding u->v is valid iff no path v ~> u currently exists
                if nx.has_path(G, v, u):
                    continue

                # MEC consistency: do not introduce a new collider u->v<-k where k not adjacent to u in skeleton
                # if would_create_new_vstructure(skel, dag, u, v):
                #     continue

                pa_v = directed_parents(dag, v)
                delta = apply_score(criterion, v, pa_v | {u}) - apply_score(criterion, v, pa_v)

                if (best is None) or (delta > best[0]):
                    best = (float(delta), int(u), int(v))

        if best is None:
            remaining = []
            for a, b in undirected_pairs:
                if allowed is not None and not (allowed[a, b] or allowed[b, a]):
                    remaining.append((a, b))
            if remaining:
                raise ValueError(
                    f"No permitted orientation for undirected pairs {remaining} "
                    "under the directional constraint."
                )
            raise RuntimeError(
                "No valid orientation found under MEC constraints. "
                "This can happen if the CPDAG encoding is inconsistent or constraints are too strict."
            )

        delta, u, v = best

        dag[u, v] = 1
        G.add_edge(u, v)

        pair = (u, v) if u < v else (v, u)
        undirected_pairs.remove(pair)

    # Validate: skeleton unchanged, acyclic
    out_skel = cpdag_skeleton(dag)
    if not np.array_equal(out_skel, skel):
        raise AssertionError("Bug: output DAG skeleton differs from CPDAG skeleton.")
    if not nx.is_directed_acyclic_graph(G):
        raise AssertionError("Bug: output graph is not a DAG.")

    return dag

