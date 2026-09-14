"""
BIC_Prior: BIC Score with Ontological Priors

Extends pgmpy's BIC score to incorporate domain knowledge through prior probabilities.
"""

from math import log
from typing import Optional

import numpy as np
import pandas as pd

from pgmpy.estimators.StructureScore import BIC


class BIC_Prior(BIC):
    """
    BIC score with ontological prior knowledge for discrete Bayesian networks.
    
    This score extends the standard BIC/MDL score by incorporating domain knowledge
    through a prior probability matrix B, where B[i,j] represents the prior probability
    that variable i causes variable j given ontological knowledge.
    
    The hybrid score is computed as:
        S*(G) = S_BIC(G) + λ * Σ_{(i,j)∈E(G)} log(B[i,j] / (1 - B[i,j]))
    
    Parameters
    ----------
    data : pandas.DataFrame
        DataFrame where each column represents a discrete variable.
        Missing values should be set as `numpy.nan`.
        
    B : numpy.ndarray, optional
        Prior probability matrix (n_vars, n_vars) where B[i,j] = P(i→j | OK).
        If None, uses uniform prior (no prior influence).
        
    lambda_prior : float, default=1.0
        Weight for the prior term. Higher values give more weight to prior knowledge.
        Set to 0 to recover standard BIC score.
        
    epsilon : float, default=1e-6
        Numerical stability constant. Probabilities are clipped to [epsilon, 1-epsilon]
        to avoid log(0) or division by zero.
        
    state_names : dict, optional
        Dictionary mapping variable names to their discrete states.
        If not specified, unique values in data are used.
        
    Examples
    --------
    >>> import pandas as pd
    >>> import numpy as np
    >>> from pgmpy.models import DiscreteBayesianNetwork
    >>> 
    >>> # Create sample data
    >>> data = pd.DataFrame({
    ...     "A": [0, 1, 1, 0, 1, 0],
    ...     "B": [1, 1, 0, 0, 1, 0],
    ...     "C": [1, 0, 1, 0, 1, 1]
    ... })
    >>> 
    >>> # Define prior: strong belief that A→B, weak for others
    >>> n_vars = 3
    >>> B = np.full((n_vars, n_vars), 0.5)  # Neutral prior
    >>> B[0, 1] = 0.9  # Strong prior for A→B
    >>> 
    >>> # Compare standard BIC vs BIC with priors
    >>> from pgmpy.estimators import BIC
    >>> model = DiscreteBayesianNetwork([("A", "B"), ("A", "C")])
    >>> 
    >>> bic_standard = BIC(data)
    >>> bic_prior = BIC_Prior(data, B=B, lambda_prior=2.0)
    >>> 
    >>> print("Standard BIC:", bic_standard.score(model))
    >>> print("BIC with prior:", bic_prior.score(model))
    
    Notes
    -----
    - When lambda_prior=0, this reduces to standard BIC score
    - B matrix should satisfy: 0 < B[i,j] < 1 for all i,j
    - Diagonal elements B[i,i] are ignored (no self-loops)
    - Use higher lambda_prior values to trust prior knowledge more
    
    References
    ----------
    [1] Koller & Friedman, Probabilistic Graphical Models - Principles and
        Techniques, 2009, Section 18.3.
    """
    
    def __init__(
        self,
        data: pd.DataFrame,
        B: Optional[np.ndarray] = None,
        lambda_prior: float = 1.0,
        epsilon: float = 1e-6,
        **kwargs
    ):
        super(BIC_Prior, self).__init__(data, **kwargs)
        
        self.var_names = list(data.columns)
        self.n_vars = len(self.var_names)
        self.var_to_idx = {var: idx for idx, var in enumerate(self.var_names)}
        
        self.lambda_prior = lambda_prior
        self.epsilon = epsilon
        
        # Initialize B matrix
        if B is None:
            # Neutral prior: B[i,j] = 0.5 for all i≠j
            self.B = np.full((self.n_vars, self.n_vars), 0.5)
        else:
            self._validate_B(B)
            self.B = B.copy()
        
        # Clip probabilities for numerical stability
        self.B = np.clip(self.B, self.epsilon, 1 - self.epsilon)
        
        # Precompute log-odds for efficiency: log(B[i,j] / (1 - B[i,j]))
        self.log_odds_B = np.log(self.B / (1 - self.B))
    
    def _validate_B(self, B: np.ndarray):
        if B.shape != (self.n_vars, self.n_vars):
            raise ValueError(
                f"B must be ({self.n_vars}, {self.n_vars}), got {B.shape}"
            )
        
        if not np.all((B >= 0) & (B <= 1)):
            raise ValueError(
                "All elements of B must be probabilities in [0, 1]"
            )
    
    def _get_indices(self, u: str, v: str):
        u_idx = self.var_to_idx[u]
        v_idx = self.var_to_idx[v]
        return u_idx, v_idx
    
    def _compute_edge_prior(self, parent: str, child: str) -> float:
        p_idx, c_idx = self._get_indices(parent, child)
        return self.lambda_prior * self.log_odds_B[p_idx, c_idx]
    
    def local_score(self, variable: str, parents: list) -> float:
        """
        Computes the local BIC score with prior for a variable given its parents.
        
        The hybrid score combines the standard BIC score with a prior term:
            local_score(X, Pa(X)) = BIC(X | Pa(X)) + λ * Σ_{P∈Pa(X)} log(B[P,X] / (1-B[P,X]))
        
        Parameters
        ----------
        variable : str
            The name of the variable (child node).
        parents : list of str
            List of parent variable names.
            
        Returns
        -------
        score : float
            The local BIC score with prior for the specified variable and parent configuration.
            
        Examples
        --------
        >>> score_obj = BIC_Prior(data, B=B, lambda_prior=1.5)
        >>> local_score = score_obj.local_score("B", ["A"])
        >>> print(local_score)
        -45.82
        
        Notes
        -----
        - When lambda_prior=0, returns standard BIC local score
        - Higher lambda_prior values increase influence of prior knowledge
        - Each edge parent→variable contributes λ * log(B[parent,variable] / (1-B[parent,variable]))
        """
        # Compute standard BIC score
        bic_score = super().local_score(variable, parents)
        
        # Add prior contribution for each parent edge
        prior_score = 0.0
        for parent in parents:
            prior_score += self._compute_edge_prior(parent, variable)
        
        return bic_score + prior_score
    
    def get_prior_matrix(self) -> np.ndarray:
        return self.B.copy()
    
    def set_prior_matrix(self, B: np.ndarray):
        self._validate_B(B)
        self.B = np.clip(B.copy(), self.epsilon, 1 - self.epsilon)
        self.log_odds_B = np.log(self.B / (1 - self.B))
    
    def set_lambda(self, lambda_prior: float):
        self.lambda_prior = lambda_prior



