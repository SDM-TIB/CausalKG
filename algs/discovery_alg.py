import numpy as np
import pandas as pd
import networkx as nx
from typing import Tuple, Optional, Union
from sklearn.preprocessing import LabelEncoder
from copy import deepcopy
import warnings
import logging
logging.getLogger('pgmpy').setLevel(logging.WARNING)
# gCastle imports
from castle.algorithms import PC as CastlePC
from castle.algorithms import GES as CastleGES
from pgmpy.estimators import GES as PgmpyGES
from castle.algorithms import ICALiNGAM, DirectLiNGAM
from castle.algorithms import Notears as CastleNotears
from .dag_gnn import DAG_GNN as CastleDAGGNN
from castle.common.priori_knowledge import PrioriKnowledge
from .ges_prior.operators.graph import _apply_meek_rules
from .ges_prior.ges_prior import run_ges_prior
from .constrained.notears import ConstrainedNotears
import torch

# DAGMA import
try:
    from dagma.linear import DagmaLinear
    DAGMA_AVAILABLE = True
except ImportError:
    DAGMA_AVAILABLE = False
    warnings.warn("DAGMA not available. Install with: pip install dagma")


class CausalDiscovery:
    """
    Unified Causal Discovery Class

    Supports multiple algorithms: PC, GES, LiNGAM, NOTEARS, DAG-GNN, DAGMA

    Every ``*`` method accepts an optional ``constraint``.  It is duck-typed: it
    must expose ``allowed`` (an ``(n, n)`` boolean matrix whose ``[i, j]`` entry
    is ``True`` when ``i -> j`` is topologically valid) and, for some algorithms,
    ``mask()``, ``exclude_edges()``, ``to_castle_priori()``,
    ``to_lingam_prior()`` or ``to_expert_knowledge()``.  The DataFrame columns
    must be ordered to match the constraint's node order.

    Parameters
    ----------
    verbose : bool, default=False
        Whether to print progress information
    """

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.column_names = None
        self.label_encoders = {}

    def _preprocess_data(self, df: pd.DataFrame) -> np.ndarray:
        """
        Convert non-numeric columns to integers.
        Store column names and label encoders for later reference.

        Handles: object, string, boolean, category, datetime, and any other non-numeric types.

        Parameters
        ----------
        df : pd.DataFrame
            Input dataframe

        Returns
        -------
        np.ndarray
            Preprocessed numerical data
        """
        self.column_names = list(df.columns)
        self.label_encoders = {}  # Reset encoders for each new dataset
        df_processed = df.copy()

        for col in df_processed.columns:
            dtype = df_processed[col].dtype

            # Check if column is numeric (int or float variants)
            if pd.api.types.is_numeric_dtype(dtype) and not pd.api.types.is_bool_dtype(dtype):
                # Handle potential NaN in numeric columns
                if df_processed[col].isna().any():
                    if self.verbose:
                        print(f"Column '{col}' has NaN values, filling with median")
                    df_processed[col] = df_processed[col].fillna(df_processed[col].median())
                continue

            # Non-numeric column: needs encoding
            if self.verbose:
                print(f"Converting column '{col}' ({dtype}) to integer encoding")

            # Handle NaN before encoding
            col_data = df_processed[col].copy()
            has_nan = col_data.isna().any()

            if has_nan:
                # Replace NaN with a placeholder string for encoding
                nan_placeholder = '__NAN__'
                col_data = col_data.fillna(nan_placeholder)

            # Convert to string for consistent encoding
            # This handles: bool, datetime, category, object, etc.
            if pd.api.types.is_datetime64_any_dtype(dtype):
                # Convert datetime to ISO string for meaningful encoding
                col_data = col_data.astype(str)
            elif pd.api.types.is_bool_dtype(dtype):
                # Explicit bool to string
                col_data = col_data.astype(str)
            elif isinstance(dtype, pd.CategoricalDtype):
                # Convert category to string (is_categorical_dtype was removed in pandas 3.0)
                col_data = col_data.astype(str)
            else:
                # General fallback
                col_data = col_data.astype(str)

            # Use LabelEncoder for conversion
            le = LabelEncoder()
            df_processed[col] = le.fit_transform(col_data)
            self.label_encoders[col] = le

            # Store NaN mapping info if applicable
            if has_nan:
                self.label_encoders[f'{col}__nan_label'] = le.transform([nan_placeholder])[0]

        return df_processed.values

    def _dir_allowed(self, allowed: Optional[np.ndarray], src, dst) -> bool:
        """Whether directed edge ``src -> dst`` (node names or indices) is allowed."""
        if allowed is None:
            return True
        if self.column_names is not None:
            i = self.column_names.index(src)
            j = self.column_names.index(dst)
        else:
            i, j = src, dst
        return bool(allowed[i, j])

    def _dagify_min_edge(self, g: nx.DiGraph,
                         allowed: Optional[np.ndarray] = None) -> nx.DiGraph:
        """
        Convert a graph to DAG by reversing or removing edges with minimum weight in cycles.

        Under a hard constraint the reversal may only land on an allowed
        direction; otherwise the edge is deleted instead.

        Parameters
        ----------
        g : nx.DiGraph
            Graph to convert to DAG (with 'weight' attribute on edges)
        allowed : np.ndarray, optional
            (n, n) boolean matrix; ``allowed[i, j]`` means ``i -> j`` is valid.

        Returns
        -------
        nx.DiGraph
            DAG made from input graph
        """
        g = deepcopy(g)  # Don't modify original
        ncycles = len(list(nx.simple_cycles(g)))

        while not nx.is_directed_acyclic_graph(g):
            try:
                cycle = next(nx.simple_cycles(g))
            except StopIteration:
                break

            # Collect edges and their weights in the cycle
            edges = [(cycle[-1], cycle[0])]
            scores = [g[cycle[-1]][cycle[0]]['weight']]

            for i, j in zip(cycle[:-1], cycle[1:]):
                edges.append((i, j))
                scores.append(g[i][j]['weight'])

            # Find edge with minimum absolute weight
            abs_scores = [abs(s) for s in scores]
            min_idx = abs_scores.index(min(abs_scores))
            i, j = edges[min_idx]
            min_weight = scores[min_idx]

            # Try reversing the edge (only into an allowed direction)
            gc = deepcopy(g)
            gc.remove_edge(i, j)

            reverse_allowed = self._dir_allowed(allowed, j, i)

            if reverse_allowed and not gc.has_edge(j, i):
                gc.add_edge(j, i, weight=min_weight)
                ngc = len(list(nx.simple_cycles(gc)))

                # If reversing reduces cycles, keep it
                if ngc < ncycles:
                    g.add_edge(j, i, weight=min_weight)
                    g.remove_edge(i, j)
                    ncycles = ngc
                else:
                    # Otherwise just remove
                    g.remove_edge(i, j)
                    ncycles = len(list(nx.simple_cycles(g)))
            else:
                # Can't reverse (forbidden or edge exists), just remove
                g.remove_edge(i, j)
                ncycles = len(list(nx.simple_cycles(g)))

        return g

    def _matrix_to_graph(self, adj_matrix: np.ndarray, weights: np.ndarray) -> nx.DiGraph:
        """
        Convert adjacency matrix and weights to NetworkX DiGraph.
        """
        n = adj_matrix.shape[0]
        G = nx.DiGraph()

        # Add nodes with column names if available
        if self.column_names is not None:
            G.add_nodes_from(self.column_names)
        else:
            G.add_nodes_from(range(n))

        # Add edges with weights
        for i in range(n):
            for j in range(n):
                if adj_matrix[i, j] == 1:
                    source = self.column_names[i] if self.column_names else i
                    target = self.column_names[j] if self.column_names else j
                    G.add_edge(source, target, weight=weights[i, j])

        return G

    def _graph_to_matrix(self, G: nx.DiGraph, n: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convert NetworkX DiGraph to adjacency matrix and weight matrix.
        """
        adj_matrix = np.zeros((n, n), dtype=int)
        weight_matrix = np.zeros((n, n))

        # Create mapping from node names to indices
        if self.column_names is not None:
            node_to_idx = {node: idx for idx, node in enumerate(self.column_names)}
        else:
            node_to_idx = {i: i for i in range(n)}

        for source, target, data in G.edges(data=True):
            i = node_to_idx[source]
            j = node_to_idx[target]
            adj_matrix[i, j] = 1
            weight_matrix[i, j] = data.get('weight', 1.0)

        return adj_matrix, weight_matrix

    def _to_graph_output(self, adj_matrix: np.ndarray, weights: np.ndarray,
                         oriented: bool = True,
                         allowed: Optional[np.ndarray] = None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        Convert adjacency matrix and weights to output format.
        Apply dagify_min_edge if oriented=True and graph has cycles.
        """
        # Convert to NetworkX graph
        G = self._matrix_to_graph(adj_matrix, weights)

        # Apply dagify if needed
        if oriented and not nx.is_directed_acyclic_graph(G):
            if self.verbose:
                print(f"Graph has cycles. Applying dagify_min_edge...")
            G = self._dagify_min_edge(G, allowed=allowed)
            # Convert back to matrices
            adj_matrix, weights = self._graph_to_matrix(G, adj_matrix.shape[0])

        return G, adj_matrix.astype(int)

    def PC(self, df: pd.DataFrame, alpha: Optional[float] = None,
           oriented: bool = True, priori: PrioriKnowledge = None,
           constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        PC Algorithm (Constraint-based)

        Parameters
        ----------
        df : pd.DataFrame
            Input data
        alpha : float, optional
            Significance level for independence tests (default: 0.05)
        oriented : bool, default=True
            Whether to orient all edges (apply Meek rules)
        priori : PrioriKnowledge, optional
            gcastle prior knowledge (overridden by ``constraint`` if given).
        constraint : optional
            Duck-typed edge constraint; ``allowed`` enforces a hard skeleton
            constraint via gcastle's ``PrioriKnowledge``.
        """
        if alpha is None:
            alpha = 0.05

        if self.verbose:
            print(f"Running PC algorithm with alpha={alpha}")

        # Preprocess data
        data = self._preprocess_data(df)
        allowed = constraint.allowed if constraint is not None else None

        # Run PC algorithm
        if constraint is not None:
            priori = constraint.to_castle_priori()
        if priori is None:
            pc = CastlePC(alpha=alpha, variant='stable')
        else:
            pc = CastlePC(alpha=alpha, variant='stable', priori_knowledge=priori)
        pc.learn(data)

        # Get causal matrix
        cpdag = pc.causal_matrix.values if hasattr(pc.causal_matrix, 'values') else pc.causal_matrix

        # Apply Meek rules if oriented=True
        if oriented:
            dag = _apply_meek_rules(cpdag, allowed)
        else:
            dag = cpdag

        # Create weight matrix (1.0 for all edges in constraint-based methods)
        weights = dag.copy().astype(float)

        # Note: PC should produce a DAG after Meek rules, so no need for dagify
        return self._to_graph_output(dag, weights, oriented=False, allowed=allowed)

    def GES(self, df: pd.DataFrame, alpha: Optional[float] = None,
        oriented: bool = True, constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        GES Algorithm (Score-based)

        Unconstrained, uses pgmpy's GES.  When ``constraint`` is supplied the
        call is re-routed to the project's own constrained GES implementation
        (``algs.ges_prior``), since pgmpy's GES has no constraint hook.
        """
        # Store column names
        self.column_names = list(df.columns)
        n = len(self.column_names)

        # Detect data types for each column
        continuous_cols = []
        discrete_cols = []

        for col in df.columns:
            dtype = df[col].dtype
            n_unique = df[col].nunique()

            if not pd.api.types.is_numeric_dtype(dtype):
                discrete_cols.append(col)
            elif pd.api.types.is_bool_dtype(dtype):
                discrete_cols.append(col)
            elif pd.api.types.is_integer_dtype(dtype) and (n_unique < 10 or n_unique < 0.05 * len(df)):
                discrete_cols.append(col)
            else:
                continuous_cols.append(col)

        # Determine scoring function
        if len(continuous_cols) == 0:
            scoring_method = 'bic-d'
            data_type = 'discrete'
        elif len(discrete_cols) == 0:
            scoring_method = 'bic-g'
            data_type = 'continuous'
        else:
            scoring_method = 'bic-cg'
            data_type = 'mixed'

        if self.verbose:
            print(f"Data type detected: {data_type}")
            print(f"  Continuous columns ({len(continuous_cols)}): {continuous_cols[:5]}{'...' if len(continuous_cols) > 5 else ''}")
            print(f"  Discrete columns ({len(discrete_cols)}): {discrete_cols[:5]}{'...' if len(discrete_cols) > 5 else ''}")
            print(f"  Using scoring method: {scoring_method}")

        # Prepare data for pgmpy
        df_processed = df.copy()

        # For discrete columns, ensure they are proper categorical/int type
        for col in discrete_cols:
            if df_processed[col].dtype == 'object' or isinstance(df_processed[col].dtype, pd.CategoricalDtype):
                df_processed[col] = df_processed[col].astype(str)
            else:
                df_processed[col] = df_processed[col].astype(int)

        # For continuous columns, ensure float type
        for col in continuous_cols:
            df_processed[col] = df_processed[col].astype(float)

        allowed = constraint.allowed if constraint is not None else None

        # Constrained GES is re-routed to the controlled implementation.
        if constraint is not None:
            base = 'bic-d' if scoring_method == 'bic-d' else 'bic-g'
            dag = run_ges_prior(
                data=df_processed,
                scoring_method_i=base,
                scoring_method_ii=base,
                orient_strategy=0,
                allowed=allowed,
            )
            weights = dag.copy().astype(float)
            return self._to_graph_output(dag, weights, oriented=True, allowed=allowed)

        # Run pgmpy GES
        ges = PgmpyGES(df_processed)

        # Estimate structure
        estimated_dag = ges.estimate(scoring_method=scoring_method)

        # Convert pgmpy DAG to adjacency matrix
        adj_matrix = np.zeros((n, n), dtype=int)
        col_to_idx = {col: idx for idx, col in enumerate(self.column_names)}

        for edge in estimated_dag.edges():
            source, target = edge
            i = col_to_idx[source]
            j = col_to_idx[target]
            adj_matrix[i, j] = 1

        # Apply Meek rules if oriented=True
        if oriented:
            dag = _apply_meek_rules(adj_matrix)
        else:
            dag = adj_matrix

        # Create weight matrix (1.0 for all edges in score-based methods)
        weights = dag.copy().astype(float)

        return self._to_graph_output(dag, weights, oriented=False, allowed=allowed)

    def LiNGAM(self, df: pd.DataFrame, alpha: Optional[float] = None,
               oriented: bool = True, constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        LiNGAM Algorithm (Function-based)
        """
        if alpha is None:
            alpha = 0.3  # default parameter

        if self.verbose:
            print(f"Running LiNGAM algorithm with threshold={alpha}")

        # Preprocess data
        data = self._preprocess_data(df).astype(np.float64)  # require float

        allowed = constraint.allowed if constraint is not None else None

        # Run DirectLiNGAM algorithm
        if constraint is not None:
            lingam = DirectLiNGAM(prior_knowledge=constraint.to_lingam_prior())
        else:
            lingam = DirectLiNGAM()
        lingam.learn(data)

        # Get weighted causal matrix
        weight_matrix = lingam.causal_matrix.values if hasattr(lingam.causal_matrix, 'values') else lingam.causal_matrix

        # Apply threshold
        adj_matrix = (np.abs(weight_matrix) > alpha).astype(int)

        # LiNGAM should produce a DAG by design, but ensure if oriented=True
        return self._to_graph_output(adj_matrix, weight_matrix, oriented=oriented, allowed=allowed)

    def NOTEARS(self, df: pd.DataFrame, alpha: Optional[float] = None,
                oriented: bool = True, constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        NOTEARS Algorithm (Gradient-based)
        """
        if alpha is None:
            alpha = 0.3  # default parameter

        if self.verbose:
            print(f"Running NOTEARS algorithm with threshold={alpha}")

        # Preprocess data
        data = self._preprocess_data(df).astype(np.float64)  # require float

        allowed = constraint.allowed if constraint is not None else None

        # Run NOTEARS algorithm
        if constraint is not None:
            notears = ConstrainedNotears(w_threshold=alpha, mask=constraint.mask())
        else:
            notears = CastleNotears(w_threshold=alpha)
        notears.learn(data)

        # Get weighted causal matrix
        weight_matrix = notears.weight_causal_matrix.values if hasattr(notears.weight_causal_matrix, 'values') else notears.weight_causal_matrix

        # Get binary matrix
        adj_matrix = notears.causal_matrix.values if hasattr(notears.causal_matrix, 'values') else notears.causal_matrix

        # Apply dagify_min_edge if oriented=True
        return self._to_graph_output(adj_matrix, weight_matrix, oriented=oriented, allowed=allowed)

    def DAG_GNN(self, df: pd.DataFrame, alpha: Optional[float] = None,
                oriented: bool = True, constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        DAG-GNN Algorithm (Gradient-based with GNN)
        """
        if alpha is None:
            alpha = 0.3  # default

        if self.verbose:
            print(f"Running DAG-GNN algorithm with threshold={alpha}")

        # Preprocess data
        data = self._preprocess_data(df).astype(np.float64)  # require float

        allowed = constraint.allowed if constraint is not None else None

        # Run DAG-GNN algorithm
        kwargs = dict(
            graph_threshold=alpha,
            device_type="cuda" if torch.cuda.is_available() else "cpu",
        )
        if constraint is not None:
            mask = constraint.mask()
            # Self-loops are handled by the DAG penalty (trace + h(A)), not the
            # edge mask, so leave the diagonal unmasked. Otherwise a vacuous
            # constraint would hard-zero the diagonal and diverge from the
            # unconstrained run.
            np.fill_diagonal(mask, 1.0)
            kwargs["edge_mask"] = mask
        dag_gnn = CastleDAGGNN(**kwargs)
        dag_gnn.learn(data)

        # Get weighted causal matrix
        weight_matrix = dag_gnn.weight_causal_matrix.values if hasattr(dag_gnn.weight_causal_matrix, 'values') else dag_gnn.weight_causal_matrix

        # Get binary matrix
        adj_matrix = dag_gnn.causal_matrix.values if hasattr(dag_gnn.causal_matrix, 'values') else dag_gnn.causal_matrix

        # Apply dagify_min_edge if oriented=True
        return self._to_graph_output(adj_matrix, weight_matrix, oriented=oriented, allowed=allowed)

    def DAGMA(self, df: pd.DataFrame, alpha: Optional[float] = None,
              oriented: bool = True, constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        DAGMA Algorithm (Gradient-based)
        """
        if not DAGMA_AVAILABLE:
            raise ImportError("DAGMA is not installed. Install with: pip install dagma")

        if alpha is None:
            alpha = 0.3  # default

        if self.verbose:
            print(f"Running DAGMA algorithm with threshold={alpha}")

        # Preprocess data
        data = self._preprocess_data(df).astype(np.float64)  # require float

        allowed = constraint.allowed if constraint is not None else None

        # Run DAGMA algorithm
        dagma = DagmaLinear(loss_type='l2')
        exclude = None
        if constraint is not None:
            exclude = tuple(constraint.exclude_edges())
            if len(exclude) == 0:
                exclude = None
        weight_matrix = dagma.fit(data, exclude_edges=exclude)

        # Apply threshold
        adj_matrix = (np.abs(weight_matrix) > alpha).astype(int)

        # Apply dagify_min_edge if oriented=True
        return self._to_graph_output(adj_matrix, weight_matrix, oriented=oriented, allowed=allowed)

    def discover(self, df: pd.DataFrame, method: str,
                 alpha: Optional[float] = None,
                 oriented: bool = True,
                 constraint=None) -> Tuple[nx.DiGraph, np.ndarray]:
        """
        Unified interface for causal discovery.

        Parameters
        ----------
        df : pd.DataFrame
            Input data
        method : str
            Algorithm name: 'PC', 'GES', 'LiNGAM', 'NOTEARS', 'DAG-GNN', 'DAGMA'
        alpha : float, optional
            Threshold parameter (meaning depends on method)
        oriented : bool, default=True
            Whether to ensure output is a DAG
        constraint : optional
            Duck-typed edge constraint forwarded to the underlying algorithm.

        Returns
        -------
        Tuple[nx.DiGraph, np.ndarray]
            NetworkX graph with weights and binary adjacency matrix
        """
        method = method.upper().replace('-', '_')

        method_map = {
            'PC': self.PC,
            'GES': self.GES,
            'LINGAM': self.LiNGAM,
            'NOTEARS': self.NOTEARS,
            'DAG_GNN': self.DAG_GNN,
            'DAGMA': self.DAGMA
        }

        if method not in method_map:
            raise ValueError(f"Unknown method: {method}. Available: {list(method_map.keys())}")

        return method_map[method](df, alpha=alpha, oriented=oriented, constraint=constraint)
